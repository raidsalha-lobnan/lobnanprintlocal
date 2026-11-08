import {validateJournal} from './sync-domain.mjs';
import {planInvoiceRevision} from './invoice-revision-plan.mjs';
const minor=x=>{
 const n=Number(x);
 if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>0.0001)
  throw new Error('REVISION_NON_FINITE_ACCOUNTING_AMOUNT');
 return Math.round(n*100);
};
const money=n=>Math.round(n)/100;
const stockItem=i=>i.category!=='services'&&i.category!=='copy_scan'&&
 i.itemId!=='srv-delivery'&&i.itemId!=='srv-delivery-mobile';
const isOriginalSale=(movement,invoice)=>{
 const v=movement.value||movement;
 return v.type==='out_sale'&&!v.internalCorrection &&
   v.date===invoice.date && [
    invoice.invoiceNumber,'TEMP-'+invoice.id,invoice.tempInvoiceNumber
   ].filter(Boolean).includes(v.referenceNumber);
};
const isApprovedCorrection=(v,invoice)=>v.referenceType==='invoice_correction'&&
 v.referenceId===invoice.id&&v.approvedRevision===true&&
 v.internalCorrection===true&&Boolean(v.correctionGroupId);
const isStockCorrection=(v,invoice)=>v.referenceType==='invoice_correction'&&
 v.sourceInvoiceId===invoice.id&&v.approvedRevision===true&&
 v.internalCorrection===true&&Boolean(v.correctionGroupId)&&
 ['in_adjustment','out_adjustment'].includes(v.type);
const netOn=(journal,account)=>{
 const v=journal.value||journal;
 return (v.lines||[]).reduce((s,l)=>s+(l.accountCode===account?
   minor(l.debit||0)-minor(l.credit||0):0),0);
};
const quantityMap=items=>{
 const qty=new Map();
 for(const i of items||[]){
  if(!stockItem(i))continue;
  if(!i.itemId||!Number.isFinite(Number(i.quantity))||Number(i.quantity)<0)
   throw new Error('REVISION_INVALID_STOCK_LINE');
  qty.set(i.itemId, (qty.get(i.itemId)||0)+Number(i.quantity));
 }
 return qty;
};
/** Audits original postings PLUS every server-approved revision, not just the
 * first pair of sales/COGS journals. Corrections stay immutable, while this
 * projection is the effective business state of the invoice.
 *
 * Reject non-approved, duplicated or unlinked journal records. Never silently
 * guess which of two different legacy sale postings is authoritative.
 */
export function verifyInvoiceRevisionBaseline({invoice,journals,movements,proposed}){
 const plan=planInvoiceRevision(invoice,proposed);
 const linked=journals.filter(row=>(row.value||row).referenceId===invoice.id);
 const sales=linked.filter(row=>(row.value||row).referenceType==='pos_invoice');
 const cogs=linked.filter(row=>(row.value||row).referenceType==='cogs');
 const corrections=linked.filter(row=>isApprovedCorrection(row.value||row,invoice));
 const legacy=invoice.legacyRepair?.kind==='VERIFIED_LEGACY_DUPLICATE_REVERSAL'
   ? invoice.legacyRepair:null;
 if(legacy){
  const ids=a=>new Set(a.map(x=>(x.value||x).id));
  const saleIds=ids(sales),costIds=ids(cogs);
  const permitted=new Set([...legacy.originalEntryIds,...legacy.retainedEntryIds]);
  if(sales.length!==2||cogs.length!==2||
    [...sales,...cogs].some(j=>!permitted.has((j.value||j).id))||
    saleIds.size!==2||costIds.size!==2)
   throw new Error('REVISION_UNVERIFIED_REPAIRED_LEGACY_POSTINGS');
 }else if(sales.length!==1||cogs.length!==1)
  throw new Error('REVISION_REQUIRES_RECONCILED_JOURNAL_HISTORY');
 if(linked.length!==sales.length+cogs.length+corrections.length)
  throw new Error('REVISION_UNKNOWN_ACCOUNTING_ENTRIES');
 for(const j of linked)validateJournal(j.value||j);
 const effectiveSalesMinor=sales.reduce((s,j)=>s+netOn(j,'1201'),0)+
   corrections.filter(j=>(j.value||j).correctionKind==='revenue')
    .reduce((s,j)=>s+netOn(j,'1201'),0);
 const expectedSalesMinor=minor(invoice.baseTotalAmount??invoice.totalAmount);
 if(effectiveSalesMinor!==expectedSalesMinor)
  throw new Error('REVISION_REVENUE_BASELINE_MISMATCH');
 const correctionCosts=corrections.filter(j=>(j.value||j).correctionKind==='cogs');
 if(corrections.some(j=>!['cogs','revenue'].includes((j.value||j).correctionKind)))
  throw new Error('REVISION_UNKNOWN_CORRECTION_JOURNAL');
 const effectiveCOGSMinor=cogs.reduce((s,j)=>s+netOn(j,'5101'),0)+
  correctionCosts.reduce((s,j)=>s+netOn(j,'5101'),0);
 const movementCandidates=movements.filter(row=>{
  const v=row.value||row;
  return isOriginalSale(row,invoice)||isStockCorrection(v,invoice)||
    (legacy&&v.id===legacy.correctedStockMovementId&&v.type==='out_sale');
 });
 const out=movementCandidates.filter(row=>isOriginalSale(row,invoice)||
  (legacy&&(row.value||row).id===legacy.correctedStockMovementId));
 const verifiedCorrections=movementCandidates.filter(row=>
  isStockCorrection(row.value||row,invoice));
 const effective=new Map(),unitCostByItem=new Map();
 let effectiveStockCostMinor=0;
 for(const row of [...out,...verifiedCorrections]){
  const v=row.value||row;
  const kind=v.type==='out_sale'?1:(v.type==='in_adjustment'?-1:1);
  if(!v.itemId||!Number.isFinite(Number(v.quantity))||Number(v.quantity)<0)
   throw new Error('REVISION_INVALID_STOCK_MOVEMENT');
  const cost=Number(v.unitPrice);
  if(!Number.isFinite(cost)||cost<0)
   throw new Error('REVISION_INVALID_STOCK_COST');
  const previous=unitCostByItem.get(v.itemId);
  if(previous!==undefined&&minor(previous)!==minor(cost))
   throw new Error('REVISION_INCONSISTENT_STOCK_COST');
  unitCostByItem.set(v.itemId,cost);
  effective.set(v.itemId,(effective.get(v.itemId)||0)+kind*Number(v.quantity));
  effectiveStockCostMinor+=kind*minor(v.totalValue??Number(v.quantity)*cost);
 }
 const expected=quantityMap(invoice.items);
 const allIds=new Set([...expected.keys(),...effective.keys()]);
 for(const id of allIds){
  if(Math.abs((expected.get(id)||0)-(effective.get(id)||0))>0.000001)
   throw new Error('REVISION_STOCK_BASELINE_MISMATCH');
 }
 if(effectiveCOGSMinor!==effectiveStockCostMinor)
  throw new Error('REVISION_COST_BASELINE_MISMATCH');
 for(const item of proposed.items||[]){
  if(stockItem(item)&&!unitCostByItem.has(item.itemId))
   throw new Error('REVISION_NEW_ITEM_COST_NOT_VERIFIED');
 }
 const nextCost=minor((proposed.items||[]).filter(stockItem).reduce((s,it)=>
  s+Number(it.quantity||0)*unitCostByItem.get(it.itemId),0));
 return {...plan,currentCOGSMinor:effectiveCOGSMinor,expectedNextCOGSMinor:nextCost,
  costByItem:Object.fromEntries(unitCostByItem),
  verifiedMovementIds:movementCandidates.map(m=>(m.value||m).id)};
}
