// Auditable debit-positive projections for posted POS invoice corrections.
// These are purely mathematical; the server must reconcile the actual journal
// and lock all affected balances before using a projection to authorize writes.
export const minor=value=>{
 const n=Number(value??0);
 if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>0.00001||
    !Number.isSafeInteger(Math.round(n*100)))throw new Error('REVISION_INVALID_MONEY');
 return Math.round(n*100);
};
export const money=value=>value/100;
export const isDelivery=item=>['srv-delivery','srv-delivery-mobile'].includes(item?.itemId);
export const isPhysical=item=>!!item&&!isDelivery(item)&&
 !['services','copy_scan'].includes(item.category);
const add=(map,account,amount)=>map.set(account,(map.get(account)||0)+amount);
export const accountMap=journals=>{
 const map=new Map();
 for(const row of journals){
  const v=row.value||row;
  for(const line of v.lines||[]){
   if(!line.accountCode||minor(line.debit||0)<0||minor(line.credit||0)<0)
    throw new Error('REVISION_INVALID_LEDGER_LINE');
   add(map,line.accountCode,minor(line.debit||0)-minor(line.credit||0));
  }
 }
 return new Map([...map].filter(([,amount])=>amount!==0));
};
export const invoiceAmounts=invoice=>{
 const rate=Number(invoice.exchangeRate||1);
 if(!Number.isFinite(rate)||rate<=0)throw new Error('REVISION_INVALID_RATE');
 const total=minor(invoice.baseTotalAmount??Number(invoice.totalAmount)*rate);
 const paid=minor(invoice.basePaidAmount??Number(invoice.paidAmount||0)*rate);
 const tax=minor(Number(invoice.taxAmount||0)*rate);
 let delivery=0;
 for(const item of invoice.items||[]){
  if(!isDelivery(item))continue;
  if(Number(item.tax||0)!==0)throw new Error('REVISION_DELIVERY_MUST_NOT_BE_TAXED');
  delivery+=minor(((Number(item.quantity)*Number(item.unitPrice))-
   Number(item.discount||0))*rate);
 }
 delivery=Math.round(delivery);
 if(total<0||paid<0||paid>total||tax<0||delivery<0||
    total-tax-delivery<0||!Number.isSafeInteger(delivery))
  throw new Error('REVISION_INVALID_INVOICE_ALLOCATION');
 return {total,paid,outstanding:total-paid,tax,delivery,
  revenue:total-tax-delivery};
};
export const validatePostedSalesAccounts=(invoice,journalMap)=>{
 const a=invoiceAmounts(invoice);
 for(const [account,amount] of [
  ['1201',a.outstanding],['4101',-a.revenue],
  ['2103',-a.tax],['2104',-a.delivery]]){
  if((journalMap.get(account)||0)!==amount)
   throw new Error('REVISION_POSTED_ACCOUNT_MISMATCH:'+account);
 }
 const payment=new Map();
 for(const [account,amount] of journalMap){
  if(['1201','4101','2103','2104'].includes(account))continue;
  if(amount<=0)throw new Error('REVISION_UNVERIFIED_COLLECTION_ACCOUNT:'+account);
  payment.set(account,amount);
 }
 if([...payment.values()].reduce((s,v)=>s+v,0)!==a.paid||
    [...journalMap.values()].reduce((s,v)=>s+v,0)!==0)
  throw new Error('REVISION_PAYMENT_BASELINE_MISMATCH');
 return {amounts:a,payment};
};
const same=(a,b)=>String(a??'')===String(b??'');
export const plannedPaymentAccounts=(original,proposed,observed)=>{
 const previous=invoiceAmounts(original),next=invoiceAmounts(proposed);
 const explicitlyChangedSplit=['cashPaidAmount','bankPaidAmount'].some(key=>
  original[key]!==undefined&&proposed[key]!==undefined&&
  Math.abs(Number(original[key])-Number(proposed[key]))>0.000001);
 if(previous.paid===next.paid&&same(original.paymentMethod,proposed.paymentMethod)&&
    same(original.cashTreasuryCode,proposed.cashTreasuryCode)&&
    same(original.bankTreasuryCode,proposed.bankTreasuryCode)&&
    same(original.treasuryAccountCode,proposed.treasuryAccountCode)&&
    !explicitlyChangedSplit)
   return new Map(observed);
 if(next.paid===0)return new Map();
 const splitCash=proposed.cashBaseAmount;
 const splitBank=proposed.bankBaseAmount;
 const cashCode=proposed.cashTreasuryCode||proposed.treasuryAccountCode||'1101';
 const bankCode=proposed.bankTreasuryCode||proposed.treasuryAccountCode||'1102';
 const result=new Map();
 const reserved=new Set(['1201','4101','2103','2104','5101','1301']);
 if(reserved.has(cashCode)||reserved.has(bankCode))
  throw new Error('REVISION_TREASURY_ACCOUNT_NOT_ALLOWED');
 if(splitCash!==undefined||splitBank!==undefined){
  const cash=minor(splitCash||0),bank=minor(splitBank||0);
  if(cash+bank!==next.paid)throw new Error('REVISION_PAYMENT_SPLIT_MISMATCH');
  if(cash)add(result,cashCode,cash);
  if(bank)add(result,bankCode,bank);
 }else if(['cash'].includes(proposed.paymentMethod)){
  add(result,cashCode,next.paid);
 }else if(['card','bank_transfer','cheque','electronic','e_wallet','pos'].includes(proposed.paymentMethod)){
  add(result,bankCode,next.paid);
 }else if(proposed.paymentMethod==='credit'&&next.paid>0){
  // A partial-credit payment cannot be allocated without evidence of its drawer.
  if(observed.size!==1)throw new Error('REVISION_PAYMENT_ACCOUNT_REQUIRED');
  add(result,[...observed.keys()][0],next.paid);
 }else{
  throw new Error('REVISION_PAYMENT_METHOD_UNVERIFIED');
 }
 return result;
};
export const financialDelta=(original,proposed,posted)=>{
 const checked=validatePostedSalesAccounts(original,posted);
 const next=invoiceAmounts(proposed);
 const payment=plannedPaymentAccounts(original,proposed,checked.payment);
 const desired=new Map([
  ['1201',next.outstanding],['4101',-next.revenue],
  ['2103',-next.tax],['2104',-next.delivery]]);
 for(const [account,amount] of payment)add(desired,account,amount);
 const delta=new Map();
 for(const account of new Set([...posted.keys(),...desired.keys()])){
  const difference=(desired.get(account)||0)-(posted.get(account)||0);
  if(difference)delta.set(account,difference);
 }
 if([...delta.values()].reduce((s,v)=>s+v,0)!==0)
  throw new Error('REVISION_JOURNAL_UNBALANCED');
 const paymentDelta=new Map();
 for(const account of new Set([...payment.keys(),...checked.payment.keys()])){
  const change=(payment.get(account)||0)-(checked.payment.get(account)||0);
  if(change)paymentDelta.set(account,change);
 }
 return {accountDeltas:Object.fromEntries(delta),
  paymentDeltas:Object.fromEntries(paymentDelta),
  originalAllocation:checked.amounts,newAllocation:next};
};
