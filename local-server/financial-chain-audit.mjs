// Evidence-based, read-only audit across the accounting document lifecycle.
// Invoices, stock, AR, receipts, GL cards, suppliers and payroll. No write path.
const val=r=>r?.value??r??{};
const id=r=>r?.record_id??val(r).id;
const cents=n=>{
 const a=Number(n);
 return Number.isFinite(a)&&Number.isSafeInteger(Math.round(a*100))&&
   Math.abs(Math.round(a*100)-a*100)<0.00001?Math.round(a*100):null;
};
const money=x=>Number((x/100).toFixed(2));
const side=type=>['asset','expense'].includes(type)?1:-1;
const lines=j=>Array.isArray(val(j).lines)?val(j).lines:[];
const isCustomer=p=>['customer','both'].includes(val(p).type);
const stockKey=i=>String(val(i).id||id(i));

/**
 * Returns anomalies with immutable record IDs, not inferred invoice numbers.
 * 'review' means evidence is incomplete; never auto-create missing journals or
 * reverse historical stock from this diagnostic.
 */
export function assessFinancialChains(data){
 const read=k=>data[k]||[];
 const invoices=read('invoices'),journals=read('journalEntries'),
  inventory=read('inventory'),stock=read('stockMovements'),parties=read('parties'),
  accounts=read('accounts'),treasuries=read('treasuries'),vouchers=read('vouchers'),
  employees=read('employees'),payrolls=read('payrollSheets'),
  purchases=read('purchases'),expenses=read('expenses'),
  advances=read('employeeAdvances'),deductions=read('employeeDeductions'),
  incentives=read('employeeIncentives');
 const problems=[];
 const report=(kind,entity,recordId,detail,level='review')=>
   problems.push({kind,level,entity,recordId,detail});
 const invoicesById=new Map(invoices.map(r=>[id(r),r])),
   journalsByReference=new Map(),stockByInvoice=new Map(),
   accountsByCode=new Map(accounts.map(r=>[String(val(r).code),r])),
   partiesById=new Map(parties.map(r=>[id(r),r])),
   employeeIds=new Set(employees.map(r=>id(r))),
   inventoryIds=new Set(inventory.map(r=>id(r))),
   treasuryByCode=new Map(treasuries.map(r=>[String(val(r).accountCode),r])),
   journalAccountTotals=new Map();
 for(const row of journals){
  const j=val(row),ref=String(j.referenceId||'');
  if(ref){const list=journalsByReference.get(ref)||[];list.push(row);journalsByReference.set(ref,list)}
  let net=0;
  for(const l of lines(row)){
   const dr=cents(l.debit??0),cr=cents(l.credit??0);
   if(dr===null||cr===null||dr<0||cr<0){
    report('INVALID_LEDGER_LINE','journalEntries',id(row),String(l.accountCode),'high');continue;
   }
   net+=dr-cr;
   const code=String(l.accountCode||'');
   if(!code){report('LEDGER_ACCOUNT_CODE_MISSING','journalEntries',id(row),'', 'high');continue}
   journalAccountTotals.set(code,(journalAccountTotals.get(code)||0)+dr-cr);
  }
  if(net!==0)report('UNBALANCED_JOURNAL','journalEntries',id(row),{delta:money(net)},'high');
 }
 for(const [code,net] of journalAccountTotals){
  if(!accountsByCode.has(code))report('JOURNAL_UNKNOWN_ACCOUNT','accounts',code,
   {signed:money(net)},'high');
 }
 for(const row of accounts){
  const a=val(row),code=String(a.code||''),stored=cents(a.balance);
  const should=(journalAccountTotals.get(code)||0)*side(a.type);
  if(stored===null)report('ACCOUNT_CARD_INVALID','accounts',id(row),code,'high');
  else if(stored!==should)report('GL_CARD_DISCREPANCY','accounts',id(row),
   {code,stored:money(stored),fromJournals:money(should),
    diff:money(stored-should)},'high');
 }
 for(const movement of stock){
  const m=val(movement);
  if(m.itemId&&!inventoryIds.has(m.itemId))
   report('STOCK_ITEM_MISSING','stockMovements',id(movement),m.itemId,'high');
  if(m.sourceInvoiceId){
   if(!invoicesById.has(m.sourceInvoiceId))
    report('STOCK_SOURCE_INVOICE_MISSING','stockMovements',id(movement),
     m.sourceInvoiceId,'high');
   else {
    const list=stockByInvoice.get(m.sourceInvoiceId)||[];
    list.push(movement);stockByInvoice.set(m.sourceInvoiceId,list);
   }
  }
 }
 for(const row of invoices){
  const i=val(row),invoiceId=id(row),related=journalsByReference.get(invoiceId)||[];
  const revenue=related.filter(j=>val(j).referenceType==='pos_invoice'),
   costs=related.filter(j=>val(j).referenceType==='cogs');
  if(i.isAccountingPosted===true&&revenue.length!==1)
   report('INVOICE_SALES_JOURNAL_CARDINALITY','invoices',invoiceId,
    {invoice:i.invoiceNumber,count:revenue.length},'high');
  if(costs.length>1)report('INVOICE_COGS_JOURNAL_DUPLICATE','invoices',invoiceId,
   {invoice:i.invoiceNumber,count:costs.length},'high');
  const salesAndCorrections=related.filter(j=>['pos_invoice','invoice_correction'].includes(val(j).referenceType));
  const credited=salesAndCorrections.flatMap(lines).reduce((n,l)=>
   n+( ['4101','4102','4103','4201','2103','2104'].includes(String(l.accountCode))
    ?(cents(l.credit??0)||0)-(cents(l.debit??0)||0):0),0);
  const amount=cents(i.baseTotalAmount??i.totalAmount);
  if(i.isAccountingPosted&&amount!==null&&credited!==amount)
   report('INVOICE_REVENUE_MISMATCH','invoices',invoiceId,
    {invoice:i.invoiceNumber,total:money(amount),journal:money(credited)},'high');
  const payerId=i.counterpartyId||i.customerId;
  if(payerId&&!partiesById.has(payerId)&&!employeeIds.has(payerId))
   report('INVOICE_COUNTERPARTY_NOT_FOUND','invoices',invoiceId,
    {invoice:i.invoiceNumber,payerId},'high');
  if(!i.counterpartyType&&employeeIds.has(i.customerId))
   report('INVOICE_EMPLOYEE_TYPE_IMPLICIT','invoices',invoiceId,
    {invoice:i.invoiceNumber,employeeId:i.customerId});
  for(const item of i.items||[]){
   if(item.itemId&&!inventoryIds.has(item.itemId)&&
      !['srv-delivery','srv-delivery-mobile'].includes(item.itemId))
    report('INVOICE_ITEM_NOT_FOUND','invoices',invoiceId,
     {invoice:i.invoiceNumber,itemId:item.itemId});
  }
  const physical=(i.items||[]).filter(x=>x.itemId&&
    !['srv-delivery','srv-delivery-mobile'].includes(x.itemId)&&
    !['services','copy_scan'].includes(x.category));
  if(i.isAccountingPosted===true&&physical.length&&costs.length===0){
   const linked=stockByInvoice.get(invoiceId)||[];
   const costFromStock=linked.reduce((n,row)=>n+Number(val(row).totalValue||0),0);
   report(linked.length&&Math.abs(costFromStock)<0.005?
    'ZERO_COST_PHYSICAL_INVOICE':'HISTORICAL_COGS_EVIDENCE_INCOMPLETE',
    'invoices',invoiceId,{invoice:i.invoiceNumber,physicalLines:physical.length,
    explicitStockMovements:linked.length,linkedStockCost:costFromStock});
  }
 }
 const treasuryMovements=new Map();
 for(const t of treasuries)for(const m of val(t).transactions||[]){
  if(m.referenceId){
   const arr=treasuryMovements.get(m.referenceId)||[];
   arr.push({treasury:t,movement:m});
   treasuryMovements.set(m.referenceId,arr);
  }
 }
 for(const vrow of vouchers){
  const v=val(vrow),voucherId=id(vrow),related=journalsByReference.get(voucherId)||[];
  const matched=related.filter(j=>val(j).referenceType===v.type);
  const movements=treasuryMovements.get(voucherId)||[];
  if(matched.length!==1)report('VOUCHER_JOURNAL_CARDINALITY','vouchers',voucherId,
   {voucher:v.voucherNumber,type:v.type,count:matched.length},'high');
  if(movements.length!==1&&!v.relatedDocId)report('VOUCHER_TREASURY_CARDINALITY','vouchers',voucherId,
   {voucher:v.voucherNumber,count:movements.length},'high');
  const amount=cents(v.baseAmount??v.amount);
  if(v.type==='receipt'&&matched.length===1&&amount!==null){
   const ar=lines(matched[0]).reduce((n,l)=>n+
    (l.accountCode==='1201'?(cents(l.credit??0)||0)-(cents(l.debit??0)||0):0),0);
   if(ar!==amount)report('RECEIPT_AR_MISMATCH','vouchers',voucherId,
    {voucher:v.voucherNumber,amount:money(amount),arCredit:money(ar)},'high');
  }
  if(v.partyId&&v.partyId!=='payroll-batch'&&
    !partiesById.has(v.partyId)&&!employeeIds.has(v.partyId))
   report('VOUCHER_PARTY_MISSING','vouchers',voucherId,
    {voucher:v.voucherNumber,partyId:v.partyId},'high');
  if(v.treasuryAccountCode&&!treasuryByCode.has(v.treasuryAccountCode))
   report('VOUCHER_TREASURY_MISSING','vouchers',voucherId,
    {voucher:v.voucherNumber,treasury:v.treasuryAccountCode},'high');
 }
 // Individual customer-card reconciliation is allowed only when complete
 // invoice, receipt and treasury evidence exists, with no competing document
 // types or parent/child allocations. Never substitute the customer cache as
 // proof of cash payments, and never treat a negative balance as an error.
 const receiptsByParty=new Map(),invoicesByParty=new Map();
 for(const r of invoices){
  const i=val(r),key=i.customerId;
  if(key){const a=invoicesByParty.get(key)||[];a.push(r);invoicesByParty.set(key,a)}
 }
 for(const r of vouchers){
  const v=val(r),key=v.partyId;
  if(key){const a=receiptsByParty.get(key)||[];a.push(r);receiptsByParty.set(key,a)}
 }
 const external=[...read('purchases'),...read('purchaseReturns'),
  ...read('salesReturns'),...read('debtClearings'),...read('expenses')];
 for(const row of parties){
  const p=val(row),pid=id(row);
  if(p.type!=='customer'||p.code==='CUST-0001'||p.isSubCustomer||
    Number(p.openingBalance||0)!==0||p.payments?.length||
    p.receiptHistory?.length||p.paymentHistory?.length||
    parties.some(ch=>val(ch).isSubCustomer&&
      (val(ch).parentPartyId===pid||val(ch).parentCustomerId===pid))||
    external.some(d=>['partyId','customerId','supplierId','counterpartyId'].some(k=>val(d)[k]===pid))||
    read('printOrders').some(d=>val(d).customerId===pid))continue;
  const owned=invoicesByParty.get(pid)||[];
  if(!owned.length)continue;
  let due=0,verified=true;
  for(const r of owned){
   const i=val(r),v=cents(i.baseTotalAmount??i.totalAmount);
   if(i.isAccountingPosted!==true||i.subCustomerId||i.counterpartyType&&i.counterpartyType!=='customer'||
     ![undefined,'ILS','₪'].includes(i.currency)||Number(i.exchangeRate||1)!==1||
     v===null||v<0||cents(i.remainingAmount)!==v||
     Number(i.paidAmount||0)!==0||Number(i.basePaidAmount||0)!==0){verified=false;break}
   const matched=(journalsByReference.get(id(r))||[]).filter(j=>
     ['pos_invoice','invoice_correction'].includes(val(j).referenceType));
   if(matched.filter(j=>val(j).referenceType==='pos_invoice').length!==1){verified=false;break}
   const ar=matched.flatMap(lines).reduce((n,l)=>n+
     (l.accountCode==='1201'?(cents(l.debit??0)||0)-(cents(l.credit??0)||0):0),0);
   if(ar!==v){verified=false;break}
   due+=v;
  }
  if(!verified)continue;
  for(const r of receiptsByParty.get(pid)||[]){
   const v=val(r),amount=cents(v.baseAmount??v.amount);
   if(v.type!=='receipt'||v.relatedDocId||v.referenceInvoiceId||v.subCustomerId||
     ![undefined,'ILS'].includes(v.currency)||Number(v.exchangeRate||1)!==1||
     amount===null||amount<=0){verified=false;break}
   const matched=(journalsByReference.get(id(r))||[]).filter(j=>val(j).referenceType==='receipt');
   if(matched.length!==1){verified=false;break}
   const ar=lines(matched[0]).reduce((n,l)=>n+
    (l.accountCode==='1201'?(cents(l.credit??0)||0)-(cents(l.debit??0)||0):0),0);
   if(ar!==amount){verified=false;break}
   const tx=treasuryMovements.get(id(r))||[];
   if(tx.length!==1||val(tx[0].treasury).accountCode!==v.treasuryAccountCode||
     cents(tx[0].movement.baseAmount??tx[0].movement.amount)!==amount){verified=false;break}
   due-=amount;
  }
  if(!verified)continue;
  const stored=cents(p.balance);
  if(stored!==null&&stored!==due)report('CUSTOMER_CARD_DISCREPANCY','parties',pid,
   {code:p.code,stored:money(stored),fromPostedDocuments:money(due),
    diff:money(stored-due),sourceInvoices:owned.length,
    sourceReceipts:(receiptsByParty.get(pid)||[]).length},'high');
 }
 for(const r of purchases){
  const v=val(r),pid=v.supplierId||v.counterpartyId;
  if(pid&&!partiesById.has(pid))report('PURCHASE_SUPPLIER_NOT_FOUND','purchases',id(r),pid,'high');
  if(!journalsByReference.get(id(r))?.some(j=>val(j).referenceType==='purchase'))
   report('PURCHASE_JOURNAL_NOT_FOUND','purchases',id(r),v.invoiceNumber,'high');
 }
 for(const r of expenses){
  const v=val(r);
  if(!journalsByReference.get(id(r))?.some(j=>val(j).referenceType==='expense'))
   report('EXPENSE_JOURNAL_NOT_FOUND','expenses',id(r),v.description,'high');
 }
 for(const r of payrolls){
  const v=val(r);
  if(v.status!=='approved')continue;
  const ref=v.voucherNumber;
  if(!v.items?.length)report('PAYROLL_APPROVED_WITHOUT_ITEMS','payrollSheets',id(r),ref,'high');
  for(const entry of v.items||[]){
   if(entry.isIncluded&&!employeeIds.has(entry.employeeId))
    report('PAYROLL_EMPLOYEE_MISSING','payrollSheets',id(r),entry.employeeId,'high');
  }
  if(!v.voucherNumber||!v.disbursedAt)
   report('APPROVED_PAYROLL_WITHOUT_PAYMENT_EVIDENCE','payrollSheets',id(r),ref,'high');
 }
 for(const [name,rows] of [['employeeAdvances',advances],['employeeDeductions',deductions],['employeeIncentives',incentives]]){
  for(const r of rows)if(!employeeIds.has(val(r).employeeId))
   report('EMPLOYEE_ADJUSTMENT_OWNER_MISSING',name,id(r),val(r).employeeId,'high');
 }
 const byType={},byLevel={};
 for(const p of problems){byType[p.kind]=(byType[p.kind]||0)+1;byLevel[p.level]=(byLevel[p.level]||0)+1;}
 return {counts:{invoices:invoices.length,journals:journals.length,stock:stock.length,
  parties:parties.length,vouchers:vouchers.length,treasuries:treasuries.length,
  employees:employees.length,payrolls:payrolls.length,purchases:purchases.length,
  expenses:expenses.length},issueCount:problems.length,byType,byLevel,problems};
}
