import {assessInvoiceCorrection} from './invoice-correction-assessment.mjs';
const minor=n=>Math.round(Number(n)*100);
const balance=n=>Number(n);
const eq=(a,b)=>Math.abs(a-b)<0.005;
/**
 * Strict recovery of a legacy edit where an old sale was not superseded but a
 * second, fully balanced sale+COGS+stock movement was committed.
 *
 * Only the original postings are reversed; already-posted corrected records
 * remain in the immutable journal. The customer balance is NOT decremented a
 * second time when the ordered customer history proves that the original-to-
 * corrected reduction was already applied and is still the latest net change.
 */
export function planFailedInvoiceEditRecovery({invoice,proposed,journals,movements,party,partyEvents}){
 if(!invoice?.isOfficial||!party||party.id!==invoice.customerId)
  throw new Error('LEGACY_REPAIR_UNVERIFIED_PARTY_OR_INVOICE');
 if(!Array.isArray(invoice.items)||invoice.items.length!==1||
   !Array.isArray(proposed.items)||proposed.items.length!==1)
  throw new Error('LEGACY_REPAIR_SINGLE_ITEM_ONLY');
 const it=invoice.items[0],next=proposed.items[0];
 const relevant=movements.filter(row=>{
  const m=row.value||row;
  return m.itemId===it.itemId && m.type==='out_sale' &&
   [Number(it.quantity),Number(next.quantity)].includes(Number(m.quantity)) &&
   [invoice.invoiceNumber,'TEMP-'+invoice.id].includes(m.referenceNumber);
 }).map(row=>row.value||row);
 const originalJournals=journals.map(r=>r.value||r);
 const evidence=assessInvoiceCorrection({invoice,proposed,sourceJournals:originalJournals,
  stockMovements:relevant,party});
 if(!evidence.ready)throw new Error('LEGACY_REPAIR_EVIDENCE_'+evidence.reason);
 const changes=(partyEvents||[]).map(x=>({
  sequence:Number(x.sequence),
  amount:balance(x.value?.balance??x.balance)
 })).filter(x=>Number.isFinite(x.sequence)&&Number.isFinite(x.amount))
   .sort((a,b)=>a.sequence-b.sequence);
 if(!changes.length||!eq(changes.at(-1).amount,party.balance))
  throw new Error('LEGACY_REPAIR_PARTY_EVENT_HEAD_MISMATCH');
 let lastTransition=null;
 for(let i=1;i<changes.length;i++){
  const delta=changes[i].amount-changes[i-1].amount;
  if(!eq(delta,0))lastTransition={delta,after:changes[i].amount};
 }
 // Evidence customerBalanceDelta is new minus old; this has been applied in
 // the party event stream, and MUST NOT be posted twice.
 if(!lastTransition||!eq(lastTransition.delta,evidence.customerBalanceDelta)||
   !eq(lastTransition.after,party.balance))
  throw new Error('LEGACY_REPAIR_CUSTOMER_DELTA_NOT_PROVEN');
 const originalStock=relevant.find(m=>m.id===evidence.originalStockMovementId);
 if(!originalStock||!Number.isFinite(originalStock.unitPrice)||
  originalStock.quantity!==evidence.stockReturnQuantity)
  throw new Error('LEGACY_REPAIR_ORIGINAL_STOCK_UNVERIFIED');
 return {
  evidence,
  plan:{
   invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,
   totalDeltaMinor:-minor(evidence.revenueReversal),
   // Reverse the ORIGINAL cost (the newer corrected COGS is already posted).
   currentCOGSMinor:minor(evidence.cogsReversal),
   expectedNextCOGSMinor:0,
   stockDeltas:[{itemId:it.itemId,oldQuantity:it.quantity,
     newQuantity:next.quantity,inventoryChange:evidence.stockReturnQuantity}],
   costByItem:{[it.itemId]:originalStock.unitPrice},
   customerBalanceChanges:[]
  },
  repairAudit:{
   kind:'VERIFIED_LEGACY_DUPLICATE_REVERSAL',
   sourceInvoiceId:invoice.id,
   originalEntryIds:evidence.originalEntryIds,
   retainedEntryIds:evidence.preservedEntryIds,
   originalStockMovementId:evidence.originalStockMovementId,
   correctedStockMovementId:evidence.correctedStockMovementId,
   customerBalanceAlreadyCorrected:true,
   correctedTotalAmount:proposed.totalAmount,
   correctedQuantity:next.quantity
  }
 };
}
