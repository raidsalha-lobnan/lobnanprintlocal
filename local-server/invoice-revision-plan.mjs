/**
 * Pure, deterministic preflight for posted invoice financial amendments.
 *
 * It does NOT write journal entries or inventory and must not be used as
 * authorization to bypass server-side revision validation. Input is always
 * two snapshots: the authoritative invoice and the intended edited invoice.
 * A dedicated server transaction must resolve the current posted ledger,
 * reconcile historical duplications, create reversing journal entries,
 * change balances, and write the amended invoice together.
 */
const round=(v)=>Math.round(Number(v)*100)/100;
const validMoney=(v)=>Number.isFinite(v)&&Math.abs(v)<=1e12;
const asMoney=(v,field)=>{
 const n=Number(v??0);
 if(!validMoney(n)||Math.abs(n*100-Math.round(n*100))>0.0001)
  throw new Error('INVOICE_REVISION_INVALID_MONEY:'+field);
 return Math.round(n*100);
};
const asQty=(v,field)=>{
 const n=Number(v);
 if(!Number.isFinite(n)||n<0||Math.abs(n)>1e9)
  throw new Error('INVOICE_REVISION_INVALID_QUANTITY:'+field);
 return n;
};
const byStock=(invoice)=>{
 const result=new Map();
 for(const item of invoice.items||[]){
  if(!item||typeof item.itemId!=='string'||!item.itemId)
   throw new Error('INVOICE_REVISION_ITEM_ID_REQUIRED');
  const qty=asQty(item.quantity,item.itemId);
  const category=String(item.category||'');
  if(category==='services'||category==='copy_scan'||item.itemId==='srv-delivery'||item.itemId==='srv-delivery-mobile')continue;
  result.set(item.itemId,round((result.get(item.itemId)||0)+qty));
 }
 return result;
};
const totalItems=invoice=>{
 if(!Array.isArray(invoice?.items)||!invoice.items.length)
  throw new Error('INVOICE_REVISION_ITEMS_REQUIRED');
 return invoice.items.reduce((sum,item)=>{
  if(!item||typeof item!=='object')throw new Error('INVOICE_REVISION_INVALID_ITEM');
  return sum+asMoney(item.total,'item.total');
 },0);
};
export function planInvoiceRevision(original,edited){
 if(!original||!edited||
   !(original.isOfficial===true || (original.isAccountingPosted===true && original.postedAt && /^INV-[0-9]+$/.test(original.invoiceNumber)))||
   !original.id||original.id!==edited.id||
   !original.invoiceNumber||original.invoiceNumber!==edited.invoiceNumber)
  throw new Error('INVOICE_REVISION_IMMUTABLE_ID_OR_NUMBER');
 const oldTotal=asMoney(original.totalAmount,'original.totalAmount');
 const newTotal=asMoney(edited.totalAmount,'edited.totalAmount');
 const oldPaid=asMoney(original.paidAmount,'original.paidAmount');
 const newPaid=asMoney(edited.paidAmount,'edited.paidAmount');
 for(const invoice of [original,edited]){
  const subtotal=asMoney(invoice.subtotal,'subtotal');
  const itemTotal=totalItems(invoice);
  // Many legacy invoice subtotals include taxable and discount-free line
  // totals, so do not assume item totals equal final invoice amount.
  if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(itemTotal))
   throw new Error('INVOICE_REVISION_TOTAL_OVERFLOW');
 }
 const prevRate=Number(original.exchangeRate||1),nextRate=Number(edited.exchangeRate||1);
 if(!Number.isFinite(prevRate)||prevRate<=0||!Number.isFinite(nextRate)||nextRate<=0)
  throw new Error('INVOICE_REVISION_INVALID_EXCHANGE_RATE');
 const oldOutstanding=asMoney(original.baseTotalAmount??original.totalAmount*prevRate,'old.baseTotalAmount')
   -asMoney(original.basePaidAmount??original.paidAmount*prevRate,'old.basePaidAmount');
 const newOutstanding=asMoney(edited.baseTotalAmount??edited.totalAmount*nextRate,'new.baseTotalAmount')
   -asMoney(edited.basePaidAmount??edited.paidAmount*nextRate,'new.basePaidAmount');
 const oldMap=byStock(original),newMap=byStock(edited);
 const stockDeltas=[...new Set([...oldMap.keys(),...newMap.keys()])].map(id=>({
  itemId:id,
  oldQuantity:oldMap.get(id)||0,
  newQuantity:newMap.get(id)||0,
  // Positive: restock due to reduced sale; negative: additional issue.
  inventoryChange:round((oldMap.get(id)||0)-(newMap.get(id)||0))
 })).filter(x=>Math.abs(x.inventoryChange)>0.000001);
 const oldParty=original.subCustomerId||original.customerId||null;
 const newParty=edited.subCustomerId||edited.customerId||null;
 const customerBalanceChanges=[];
 if(oldParty)customerBalanceChanges.push({partyId:oldParty,amountMinor:-oldOutstanding});
 if(newParty)customerBalanceChanges.push({partyId:newParty,amountMinor:newOutstanding});
 const grouped=new Map();
 for(const row of customerBalanceChanges)
  grouped.set(row.partyId,(grouped.get(row.partyId)||0)+row.amountMinor);
 return {
  invoiceId:original.id,invoiceNumber:original.invoiceNumber,
  previousTotalMinor:oldTotal,nextTotalMinor:newTotal,
  totalDeltaMinor:newTotal-oldTotal,
  paymentDeltaMinor:newPaid-oldPaid,
  stockDeltas,
  customerBalanceChanges:[...grouped].filter(([,amountMinor])=>amountMinor!==0)
    .map(([partyId,amountMinor])=>({partyId,amountMinor})),
  changed:oldTotal!==newTotal||oldPaid!==newPaid||stockDeltas.length>0||
    JSON.stringify(original.items)!==JSON.stringify(edited.items)||
    original.notes!==edited.notes,
  requiresLedgerReconciliation:true
 };
}
