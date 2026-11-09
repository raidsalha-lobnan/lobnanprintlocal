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
 if(sales.length!==1||cogs.length>1||linked.length!==sales.length+cogs.length+corrections.length)
  throw new Error('REVISION_REQUIRES_RECONCILED_JOURNAL_HISTORY');
 for(const j of linked)validateJournal(value(j));
 for(const j of corrections){
  const v=value(j);
  if(v.approvedRevision!==true||v.internalCorrection!==true||!v.correctionGroupId||
     !['revenue','financial','cogs'].includes(v.correctionKind))
   throw new Error('REVISION_UNVERIFIED_CORRECTION_JOURNAL');
 }
 const financialJournals=[...sales,...corrections.filter(j=>value(j).correctionKind!=='cogs')];
 const finance=financialDelta(invoice,proposed,accountMap(financialJournals));
 const cogsJournals=[...cogs,...corrections.filter(j=>value(j).correctionKind==='cogs')];
 const cogsMinor=sumAccount(cogsJournals,'5101');
 if(cogsMinor<0||!Number.isSafeInteger(cogsMinor))
  throw new Error('REVISION_INVALID_POSTED_COST');
 const originalMovements=movements.filter(m=>originalMovement(m,invoice));
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
  verifiedMovementIds:[...originalMovements,...correctedMovements].map(r=>value(r).id)};
}
