import {validateJournal} from './sync-domain.mjs';
import {planInvoiceRevision} from './invoice-revision-plan.mjs';
import {accountMap,financialDelta,isPhysical,minor} from './invoice-revision-ledger.mjs';
const value=row=>row.value||row;
const sumAccount=(journals,account)=>[...accountMap(journals)].find(([a])=>a===account)?.[1]||0;
const originalMovement=(movement,invoice)=>{
 const m=value(movement);
 if(m.type!=='out_sale')return false;
 // An exact permanent invoice ID is authoritative; a repeated display number
 // must never absorb stock movements belonging to another historical invoice.
 if(m.sourceInvoiceId||m.referenceId)
  return (m.sourceInvoiceId||m.referenceId)===invoice.id;
 const numbers=[invoice.invoiceNumber,'TEMP-'+invoice.id,invoice.tempInvoiceNumber]
  .filter(Boolean);
 if(!numbers.includes(m.referenceNumber))return false;
 // Legacy stock movements have no invoice ID. Require a proven posting date,
 // including a prior date explicitly captured in the invoice audit history.
 const dates=new Set([invoice.date]);
 for(const event of invoice.statusHistory||[]){
  const prior=event?.revisionChanges?.date?.previous;
  if(typeof prior==='string'&&prior)dates.add(prior);
 }
 return dates.has(m.date);
};
const quantities=items=>{
 const result=new Map();
 for(const item of items||[]){
  if(!isPhysical(item))continue;
  if(!item.itemId||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0)
   throw new Error('REVISION_INVALID_ITEM_QUANTITY');
  result.set(item.itemId,(result.get(item.itemId)||0)+Number(item.quantity));
 }
 return result;
};
/**
 * Prove the exact posted monetary, stock and COGS state first. Corrected
 * entries remain immutable; only their net debit/credit effects are summed.
 * Legacy duplicates are not assumed to be safe to reverse automatically.
 */
export function verifyInvoiceRevisionBaseline({invoice,journals,movements,proposed}){
 const plan=planInvoiceRevision(invoice,proposed);
 const linked=journals.filter(j=>value(j).referenceId===invoice.id);
 const sales=linked.filter(j=>value(j).referenceType==='pos_invoice');
 const cogs=linked.filter(j=>value(j).referenceType==='cogs');
 const corrections=linked.filter(j=>value(j).referenceType==='invoice_correction');
 const reclasses=linked.filter(j=>value(j).referenceType==='counterparty_reclassification');
 // A confirmed historical employee invoice was initially posted to 1201.
 // The signed 1104/1201 reclassification is part of the finance baseline:
 // never treat it as a second sale, payment, or revenue correction.
 if(reclasses.length){
  if(reclasses.length!==1 || invoice.counterpartyType!=='employee' &&
     !(invoice.employeeId===invoice.customerId || /^emp-/.test(invoice.customerId||'')))
   throw new Error('REVISION_RECLASSIFICATION_UNVERIFIED');
  const e=value(reclasses[0]),a=e.lines||[];
  if(e.referenceId!==invoice.id||e.employeeId!==invoice.customerId||
     e.sourceInvoiceNumber!==invoice.invoiceNumber||a.length!==2||
     a[0].accountCode!=='1104'||a[1].accountCode!=='1201'||
     Number(a[0].credit||0)!==0||Number(a[1].debit||0)!==0||
     minor(a[0].debit)!==minor(a[1].credit)||
     minor(a[0].debit)<=0)
   throw new Error('REVISION_RECLASSIFICATION_UNVERIFIED');
 }
 // Imported invoices may have more than one historic posting. Do not
 // accept the duplicates until signed correction journals reconcile their
 // combined NET posting to the latest authoritative invoice. The account
 // reconciliation and stock/COGS checks below are mandatory.
 if(!sales.length||linked.length!==sales.length+cogs.length+corrections.length+reclasses.length)
  throw new Error('REVISION_REQUIRES_RECONCILED_JOURNAL_HISTORY');
 if((sales.length>1||cogs.length>1)&&corrections.length===0)
  throw new Error('REVISION_DUPLICATE_HISTORY_NEEDS_APPROVED_CORRECTION');
 for(const j of linked)validateJournal(value(j));
 for(const j of corrections){
  const v=value(j);
  if(v.approvedRevision!==true||v.internalCorrection!==true||!v.correctionGroupId||
     !['revenue','financial','cogs'].includes(v.correctionKind))
   throw new Error('REVISION_UNVERIFIED_CORRECTION_JOURNAL');
 }
 const financialJournals=[...sales,...corrections.filter(j=>value(j).correctionKind!=='cogs'),...reclasses];
 const finance=financialDelta(invoice,proposed,accountMap(financialJournals));
 const cogsJournals=[...cogs,...corrections.filter(j=>value(j).correctionKind==='cogs')];
 const cogsMinor=sumAccount(cogsJournals,'5101');
 if(cogsMinor<0||!Number.isSafeInteger(cogsMinor))
  throw new Error('REVISION_INVALID_POSTED_COST');
 // Some imported invoices have one verified AR/revenue posting but never
 // received an independently identifiable COGS or stock event. The missing
 // cost is NOT evidence that it equals zero. Still, a financial-only edit can
 // safely adjust the receivable and sale revenue without touching inventory.
 // Crucially: only when both snapshots describe the SAME physical sale.
 // Do not infer stock ownership from a reused public invoice number.
 const oldItems=invoice.items||[],newItems=proposed.items||[];
 const unchangedPhysicalSale=
  invoice.date===proposed.date&&invoice.warehouse===proposed.warehouse&&
  oldItems.length===newItems.length&&oldItems.every((old,index)=>{
   const next=newItems[index];
   return next && ['itemId','category','quantity','unit','hasDimensions',
    'length','width','count','unitCalculationType'].every(field=>
      JSON.stringify(old[field]??null)===JSON.stringify(next[field]??null));
  });
 const provenStock=movements.some(row=>{
  const m=value(row);
  return (m.sourceInvoiceId||m.referenceId)===invoice.id ||
   (m.referenceNumber==='TEMP-'+invoice.id && m.date===invoice.date);
 });
 if(cogs.length===0&&
    corrections.every(row=>value(row).correctionKind!=='cogs')&&
    !provenStock&&unchangedPhysicalSale&&plan.stockDeltas.length===0){
  // There are intentionally no COGS / inventory changes in this revision.
  // A separate historical cost audit remains required; the approved invoice
  // retains this explicit marker so users never mistake the absence of COGS
  // for a verified zero-cost sale.
  return {...plan,...finance,currentCOGSMinor:0,expectedNextCOGSMinor:0,
   costByItem:{},unpricedPhysicalIds:[],verifiedMovementIds:[],
   legacyCostReviewRequired:true,legacyCostReviewReason:'MISSING_VERIFIED_HISTORICAL_COGS_AND_STOCK',
   legacyDuplicateDisplayMovementIds:[]};
 }

 // A pre-atomic legacy sale can have two stock HISTORY rows for the same
 // physical issue: one with the unique TEMP-<immutable invoice id>, and one
 // re-imported under its public INV-#### number. The latter number was reused
 // by unrelated earlier sales and is never reliable evidence of ownership.
 // Keep both rows in the audit database. For a price-only revision we can
 // safely use the unique TEMP row as cost/quantity evidence, because this
 // revision never writes or revalues inventory. An actual quantity/warehouse
 // revision with this duplication still requires a separate inventory audit.
 const candidates=movements.filter(m=>originalMovement(m,invoice));
 const trustedTemp=candidates.filter(row=>{
  const m=value(row);
  return m.referenceNumber==='TEMP-'+invoice.id &&
   !m.sourceInvoiceId&&!m.referenceId;
 });
 // A recycled public INV-#### number is not proof of stock ownership.
 // Exclude a different-item, display-number-only movement ONLY when the
 // immutable TEMP-<invoice id> movements independently prove every physical
 // invoice quantity AND the original COGS amount. Never delete the record.
 const expectedPhysical=quantities(invoice.items);
 const completeTempEvidence=(()=>{
  if(corrections.length||cogs.length!==1||trustedTemp.length===0)return false;
  const counted=new Map();
  let totalCost=0;
  try{
   for(const row of trustedTemp){
    const m=value(row),q=Number(m.quantity),price=Number(m.unitPrice);
    if(m.type!=='out_sale'||m.date!==invoice.date||!expectedPhysical.has(m.itemId)||
       !Number.isFinite(q)||q<=0||!Number.isFinite(price)||price<0||
       minor(m.totalValue||0)!==minor(q*price))return false;
    counted.set(m.itemId,(counted.get(m.itemId)||0)+q);
    totalCost+=minor(m.totalValue||0);
   }
  }catch{return false;}
  return totalCost===cogsMinor&&counted.size===expectedPhysical.size&&
   [...expectedPhysical].every(([id,qty])=>
    Math.abs((counted.get(id)||0)-qty)<0.000001);
 })();
 const unrelatedPublicNumberMovements=[];
 const sameIssue=(a,b)=>{
  const x=value(a),y=value(b);
  return x.itemId===y.itemId&&x.date===y.date&&
   Number(x.quantity)===Number(y.quantity)&&
   Number(x.unitPrice)===Number(y.unitPrice)&&
   minor(x.totalValue||0)===minor(y.totalValue||0);
 };
 const duplicateDisplayOnly=[];
 const originalMovements=candidates.filter(row=>{
  const m=value(row);
  if(m.referenceNumber!==invoice.invoiceNumber||m.sourceInvoiceId||m.referenceId)
   return true;
  if(completeTempEvidence&&m.type==='out_sale'){
   const expectedQty=expectedPhysical.get(m.itemId),movementQty=Number(m.quantity);
   const sameItemTemp=trustedTemp.filter(t=>value(t).itemId===m.itemId);
   const matchesTempQuantity=sameItemTemp.some(t=>
    Math.abs(Number(value(t).quantity)-movementQty)<0.000001);
   const matchesInvoiceQuantity=expectedQty!==undefined&&
    Math.abs(expectedQty-movementQty)<0.000001;
   // A different item OR a different quantity cannot be an additional
   // physical issue of an invoice whose immutable TEMP rows already prove
   // the entire original stock and COGS. Same-quantity conflicting cost
   // remains ambiguous, and must fail closed as before.
   if(expectedQty===undefined||(Number.isFinite(movementQty)&&movementQty>0&&
      !matchesTempQuantity&&!matchesInvoiceQuantity)){
    unrelatedPublicNumberMovements.push(row);
    return false;
   }
  }
  const matches=trustedTemp.filter(temp=>sameIssue(temp,row));
  // Do not guess when there are multiple identical temporary movements.
  if(matches.length!==1)return true;
  duplicateDisplayOnly.push(row);
  return false;
 });
 if(duplicateDisplayOnly.length&&
    (plan.stockDeltas.length!==0||invoice.warehouse!==proposed.warehouse||
     invoice.date!==proposed.date))
  throw new Error('REVISION_LEGACY_DOUBLE_STOCK_REQUIRES_INVENTORY_AUDIT');
 const correctedMovements=movements.filter(m=>value(m).referenceType==='invoice_correction'&&
    value(m).sourceInvoiceId===invoice.id);
 for(const m of correctedMovements){
  const v=value(m);
  if(v.approvedRevision!==true||v.internalCorrection!==true||!v.correctionGroupId||
     !['out_adjustment','in_adjustment'].includes(v.type))
   throw new Error('REVISION_UNVERIFIED_STOCK_CORRECTION');
 }
 const observed=new Map(),costs=new Map();
 let historicalCost=0;
 for(const row of [...originalMovements,...correctedMovements]){
  const v=value(row),q=Number(v.quantity),price=Number(v.unitPrice);
  if(!v.itemId||!Number.isFinite(q)||q<0||!Number.isFinite(price)||price<0||
     minor(v.totalValue||0)!==minor(q*price))
   throw new Error('REVISION_INVALID_STOCK_HISTORY');
  const prior=costs.get(v.itemId);
  if(prior!==undefined&&Math.abs(prior-price)>0.000001)
   throw new Error('REVISION_STOCK_COST_CHANGED_WITHOUT_REVALUATION');
  costs.set(v.itemId,price);
  const direction=v.type==='in_adjustment'?-1:1;
  observed.set(v.itemId,(observed.get(v.itemId)||0)+direction*q);
  historicalCost+=direction*minor(v.totalValue||0);
 }
 const expected=quantities(invoice.items);
 for(const [id,qty] of expected)
  if(Math.abs((observed.get(id)||0)-qty)>0.000001)
   throw new Error('REVISION_STOCK_BASELINE_MISMATCH:'+id);
 for(const [id,qty] of observed)
  if(!expected.has(id)&&Math.abs(qty)>0.000001)
   throw new Error('REVISION_EXTRA_STOCK_MOVEMENT:'+id);
 if(cogsMinor!==historicalCost)
  throw new Error('REVISION_COST_BASELINE_MISMATCH');
 const unpricedPhysicalIds=[...quantities(proposed.items).keys()].filter(id=>!costs.has(id));
 const calculateNextCost=()=>{
  if(unpricedPhysicalIds.length)return null;
  return (proposed.items||[]).filter(isPhysical).reduce(
   (s,it)=>s+minor(Number(it.quantity)*costs.get(it.itemId)),0);
 };
 return {...plan,...finance,currentCOGSMinor:cogsMinor,
  expectedNextCOGSMinor:calculateNextCost(),costByItem:Object.fromEntries(costs),
  unpricedPhysicalIds,
  verifiedMovementIds:[...originalMovements,...correctedMovements].map(r=>value(r).id),
  // Kept unchanged in the database; excluded solely from financial-only cost
  // proof so a repeated public number cannot double the invoice's inventory.
  legacyDuplicateDisplayMovementIds:duplicateDisplayOnly.map(r=>value(r).id),
  // Preserve each excluded unrelated stock event for independent audit.
  legacyForeignPublicNumberMovementIds:unrelatedPublicNumberMovements.map(r=>value(r).id)};
}
