import {validateJournal} from './sync-domain.mjs';
import {planInvoiceRevision} from './invoice-revision-plan.mjs';
const cents=x=>Math.round(Number(x)*100);
const money=x=>Math.round(x*100)/100;
const keyOf=row=>(row.value||row);
const isPhysical=item=>item.category!=='services'&&item.category!=='copy_scan'&&
  item.itemId!=='srv-delivery'&&item.itemId!=='srv-delivery-mobile';
const netAccount=(j,account)=>{
 const lines=keyOf(j).lines||[];
 return cents(lines.reduce((s,l)=>s+(l.accountCode===account?Number(l.debit||0)-Number(l.credit||0):0),0));
};
const getOriginalMove=(movement,invoice)=>{
 const m=keyOf(movement);
 return m.date===invoice.date &&
   [invoice.invoiceNumber,'TEMP-'+invoice.id,invoice.tempInvoiceNumber]
   .filter(Boolean).includes(m.referenceNumber);
};
const itemQuantities=items=>{
 const map=new Map();
 for(const i of items||[]){
  if(!isPhysical(i))continue;
  map.set(i.itemId,Math.round(((map.get(i.itemId)||0)+Number(i.quantity||0))*1e6)/1e6);
 }
 return map;
};
/**
 * Derive posted sales, COGS and stock from the immutable original accounting
 * documents PLUS previously approved correction entries. This supports a
 * second/third edit without double posting the original invoice again.
 *
 * Only one original revenue journal and one original COGS journal are allowed.
 * All other linked journals must be server-approved corrections, never
 * unreviewed historical duplicates. Legacy failures need separate recovery.
 */
export function verifyInvoiceRevisionBaseline({invoice,journals,movements,proposed}){
 const plan=planInvoiceRevision(invoice,proposed);
 const linked=journals.filter(j=>keyOf(j).referenceId===invoice.id);
 const originalSales=linked.filter(j=>keyOf(j).referenceType==='pos_invoice');
 const originalCost=linked.filter(j=>keyOf(j).referenceType==='cogs');
 const corrections=linked.filter(j=>keyOf(j).referenceType==='invoice_correction');
 if(originalSales.length!==1||originalCost.length!==1||
   linked.length!==2+corrections.length)
  throw new Error('REVISION_REQUIRES_RECONCILED_JOURNAL_HISTORY');
 for(const j of linked)validateJournal(keyOf(j));
 for(const j of corrections){
  const v=keyOf(j);
  if(v.approvedRevision!==true||v.internalCorrection!==true||
     !v.correctionGroupId||!['revenue','cogs'].includes(v.correctionKind))
   throw new Error('REVISION_UNVERIFIED_CORRECTION_JOURNAL');
 }
 const salesMinor=linked.reduce((s,j)=>s+netAccount(j,'1201'),0);
 const expectedSales=cents(invoice.baseTotalAmount??invoice.totalAmount);
 if(salesMinor!==expectedSales)
  throw new Error('REVISION_REVENUE_BASELINE_MISMATCH');
 const cogsMinor=linked.reduce((s,j)=>s+netAccount(j,'5101'),0);
 if(!Number.isSafeInteger(cogsMinor)||cogsMinor<0)
  throw new Error('REVISION_COST_BASELINE_MISMATCH');
 const originalMovements=movements.filter(m=>keyOf(m).type==='out_sale'&&getOriginalMove(m,invoice));
 const correctionsMovement=movements.filter(m=>{
  const v=keyOf(m);
  return v.sourceInvoiceId===invoice.id &&
    v.referenceType==='invoice_correction';
 });
 for(const m of correctionsMovement){
  const v=keyOf(m);
  if(v.approvedRevision!==true||v.internalCorrection!==true||!v.correctionGroupId||
     !['in_adjustment','out_adjustment'].includes(v.type))
   throw new Error('REVISION_UNVERIFIED_STOCK_CORRECTION');
 }
 const observed=new Map(),costs=new Map();
 let historicCostMinor=0;
 for(const m of originalMovements){
  const v=keyOf(m),q=Number(v.quantity),unitPrice=Number(v.unitPrice);
  if(!v.itemId||!Number.isFinite(q)||q<0||!Number.isFinite(unitPrice)||unitPrice<0)
   throw new Error('REVISION_INVALID_STOCK_HISTORY');
  observed.set(v.itemId,(observed.get(v.itemId)||0)+q);
  const prior=costs.get(v.itemId);
  if(prior!==undefined&&Math.abs(prior-unitPrice)>0.000001)
   throw new Error('REVISION_INCONSISTENT_STOCK_COST');
  costs.set(v.itemId,unitPrice);
  historicCostMinor+=cents(v.totalValue||0);
 }
 for(const m of correctionsMovement){
  const v=keyOf(m),q=Number(v.quantity),unitPrice=Number(v.unitPrice);
  if(!v.itemId||!Number.isFinite(q)||q<0||!Number.isFinite(unitPrice)||
     (costs.has(v.itemId)&&Math.abs(unitPrice-costs.get(v.itemId))>0.000001))
   throw new Error('REVISION_INVALID_STOCK_CORRECTION');
  observed.set(v.itemId,(observed.get(v.itemId)||0)+(v.type==='in_adjustment'?-q:q));
  historicCostMinor+=cents(v.totalValue||0)*(v.type==='in_adjustment'?-1:1);
 }
 const expected=itemQuantities(invoice.items);
 if(observed.size!==expected.size||[...expected].some(([id,qty])=>
   Math.abs((observed.get(id)||0)-qty)>0.000001))
  throw new Error('REVISION_STOCK_BASELINE_MISMATCH');
 if(cogsMinor!==historicCostMinor)
  throw new Error('REVISION_COST_BASELINE_MISMATCH');
 for(const it of proposed.items||[])
  if(isPhysical(it)&&!costs.has(it.itemId))
   throw new Error('REVISION_NEW_ITEM_COST_NOT_VERIFIED');
 return {...plan,currentCOGSMinor:cogsMinor,
  expectedNextCOGSMinor:cents((proposed.items||[]).filter(isPhysical)
   .reduce((s,it)=>s+Number(it.quantity||0)*costs.get(it.itemId),0)),
  costByItem:Object.fromEntries(costs),
  verifiedMovementIds:[...originalMovements,...correctionsMovement].map(row=>keyOf(row).id)};
}
