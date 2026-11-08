import {validateJournal} from './sync-domain.mjs';
import {planInvoiceRevision} from './invoice-revision-plan.mjs';
const fixed=x=>Math.round(Number(x)*100);
const dollars=(lines,field)=>lines.reduce((s,v)=>s+Number(v[field]||0),0);
const asReference=(m,inv)=>{
 const v=m.value||m;
 return v.date===inv.date && [
  inv.invoiceNumber,
  'TEMP-'+inv.id,
  inv.tempInvoiceNumber
 ].filter(Boolean).includes(v.referenceNumber);
};
const isStockItem=(i)=>i.category!=='services'&&i.category!=='copy_scan'&&
 i.itemId!=='srv-delivery'&&i.itemId!=='srv-delivery-mobile';
function normalizedQuantities(items){
 const quantities=new Map();
 for(const i of items){
  if(!isStockItem(i))continue;
  quantities.set(i.itemId,(quantities.get(i.itemId)||0)+Number(i.quantity||0));
 }
 return quantities;
}
/**
 * Never revise posted invoices on top of a duplicated/missing historical ledger.
 * Strict linked-accounting evidence is required first. Not a live mutation.
 */
export function verifyInvoiceRevisionBaseline({invoice,journals,movements,proposed}){
 const plan=planInvoiceRevision(invoice,proposed);
 const linked=journals.filter(j=>(j.value||j).referenceId===invoice.id);
 const revenue=linked.filter(j=>(j.value||j).referenceType==='pos_invoice');
 const cogs=linked.filter(j=>(j.value||j).referenceType==='cogs');
 if(revenue.length!==1||cogs.length!==1||linked.length!==2)
  throw new Error('REVISION_REQUIRES_RECONCILED_JOURNAL_HISTORY');
 for(const j of linked)validateJournal(j.value||j);
 const salesDebit=dollars((revenue[0].value||revenue[0]).lines,'debit');
 if(fixed(salesDebit)!==fixed(invoice.baseTotalAmount??invoice.totalAmount))
  throw new Error('REVISION_REVENUE_BASELINE_MISMATCH');
 const candidates=movements.filter(m=>asReference(m,invoice));
 const out=candidates.filter(m=>(m.value||m).type==='out_sale');
 const grouped=new Map();let stockValue=0;
 for(const movement of out){
  const m=movement.value||movement;
  grouped.set(m.itemId,(grouped.get(m.itemId)||0)+Number(m.quantity||0));
  stockValue+=Number(m.totalValue||0);
 }
 const expected=normalizedQuantities(invoice.items||[]);
 if(grouped.size!==expected.size||[...expected].some(([id,quantity])=>
   Math.abs(quantity-(grouped.get(id)||0))>0.00001))
  throw new Error('REVISION_STOCK_BASELINE_MISMATCH');
 const cogsDebit=dollars((cogs[0].value||cogs[0]).lines,'debit');
 if(fixed(cogsDebit)!==fixed(stockValue))
  throw new Error('REVISION_COST_BASELINE_MISMATCH');
 const costs=new Map();
 for(const entry of out){
  const m=entry.value||entry;
  if(!Number.isFinite(m.unitPrice)||m.unitPrice<0)
   throw new Error('REVISION_INVALID_STOCK_COST');
  const previous=costs.get(m.itemId);
  if(previous!==undefined&&Math.abs(previous-m.unitPrice)>0.00001)
   throw new Error('REVISION_INCONSISTENT_STOCK_COST');
  costs.set(m.itemId,m.unitPrice);
 }
 for(const item of proposed.items||[]){
  if(isStockItem(item)&&!costs.has(item.itemId))
   throw new Error('REVISION_NEW_ITEM_COST_NOT_VERIFIED');
 }
 return {...plan,currentCOGSMinor:fixed(cogsDebit),
  expectedNextCOGSMinor:fixed((proposed.items||[]).filter(isStockItem).reduce((s,i)=>
   s+Number(i.quantity||0)*costs.get(i.itemId),0)),
  costByItem:Object.fromEntries(costs),
  verifiedMovementIds:out.map(m=>(m.value||m).id)};
}
