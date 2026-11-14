// Server-only Telegram mini purchase/expense posting. All values are computed
// from authoritative SQL records and become one atomic sync command.
import {validateCommand,validateJournal,InputError} from './sync-domain.mjs';

const fail=code=>{throw new InputError(code,422);};
const cents=value=>{
 if(!Number.isFinite(value)||value<0||value>1e12)fail('MINI_FINANCIAL_AMOUNT_INVALID');
 return Math.round((value+Number.EPSILON)*100);
};
const money=minor=>Number((minor/100).toFixed(2));
const qty3=n=>Number(n.toFixed(3));
const validNonNegative=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;

export const MINI_EXPENSE_CATEGORIES=Object.freeze({
 maintenance:'صيانة وإصلاح',rent:'إيجارات',utilities:'خدمات ومرافق',
 marketing:'تسويق وإعلان',hospitality:'ضيافة',supplies:'مستلزمات',other:'مصروفات أخرى'
});

export function miniPurchaseAmounts(body,stockById,vatRate){
 if(!Number.isFinite(vatRate)||vatRate<0||vatRate>100)
  fail('MINI_PURCHASE_TAX_RATE_INVALID');
 if(!Array.isArray(body.items)||body.items.length===0||body.items.length>25)
  fail('MINI_PURCHASE_ITEMS_INVALID');
 const source=body.items.map(line=>{
  const stock=stockById.get(line.itemId);
  if(!stock||!stock.value)fail('MINI_PURCHASE_ITEM_NOT_FOUND');
  if(line.itemId==='srv-delivery'&&body.documentType==='purchase')
   fail('MINI_PURCHASE_SERVICE_USE_EXPENSE');
  const item=stock.value;
  const quantity=line.hasDimensions
   ?qty3(line.length*(item.unitCalculationType==='linear'?1:line.width)*line.count)
   :Number(line.quantity);
  if(!Number.isFinite(quantity)||quantity<=0||quantity>1e6)
   fail('MINI_PURCHASE_ITEM_QUANTITY_INVALID');
  const gross=cents(Number((quantity*line.unitPrice).toFixed(2)));
  return {line,item,quantity,gross};
 });
 const gross=source.reduce((n,s)=>n+s.gross,0);
 const discount=cents(Number(body.overallDiscount||0));
 if(discount>gross)fail('MINI_PURCHASE_DISCOUNT_EXCEEDS_GROSS');
 const subtotal=gross-discount;
 const tax=Math.round((subtotal*vatRate+Number.EPSILON)/100);
 const total=subtotal+tax;
 if(total<=0)fail('MINI_PURCHASE_TOTAL_MUST_BE_POSITIVE');
 const paid=cents(Number(body.paidAmount||0));
 if(paid>total)fail('MINI_PURCHASE_PAYMENT_EXCEEDS_TOTAL');
 let allocatedNet=0,allocatedTax=0;
 const items=source.map((r,index)=>{
  const last=index===source.length-1;
  const net=last?subtotal-allocatedNet:
   Math.round(subtotal*r.gross/gross);
  const vat=last?tax-allocatedTax:
   Math.round(tax*r.gross/gross);
  allocatedNet+=net;allocatedTax+=vat;
  return {itemId:r.line.itemId,itemCode:r.item.code,itemName:r.item.name,
   barcode:r.item.barcode||'',unit:r.item.unit||'',
   unitCalculationType:r.item.unitCalculationType||'unit',
   notes:r.line.notes,hasDimensions:r.line.hasDimensions,
   length:r.line.hasDimensions?r.line.length:0,
   width:r.line.hasDimensions?r.line.width:0,
   count:r.line.hasDimensions?r.line.count:1,
   quantity:r.quantity,unitPrice:r.line.unitPrice,
   discount:money(r.gross-net),tax:money(vat),
   total:money(net),totalAfterTax:money(net+vat)};
 });
 if(items.some(row=>row.total<0||row.tax<0))fail('MINI_PURCHASE_LINE_ALLOCATION_INVALID');
 return {items,subtotal:money(subtotal),taxAmount:money(tax),
  totalAmount:money(total),paidAmount:money(paid),
  remainingAmount:money(total-paid),overallDiscount:money(discount),
  taxRate:vatRate};
}

export function miniFinancialChanges(input){
 const {body,draftId,createdAt,documentNumber,supplierRow,stockRows,treasuryRows,
  accountRows,warehouseId,warehouseName,vatRate,actor,employeeRow}=input;
 const type=body.documentType;
 if(!['purchase','expense'].includes(type))fail('MINI_FINANCIAL_TYPE_INVALID');
 const id=(type==='purchase'?'pur-mini-':'exp-mini-')+draftId;
 const stock=new Map(stockRows.map(row=>[row.record_id,row]));
 const amount=miniPurchaseAmounts(body,stock,vatRate);
 const counterparty=employeeRow?.value||supplierRow?.value;
 if(!counterparty)fail('MINI_FINANCIAL_COUNTERPARTY_MISSING');
 const counterpartyName=counterparty.name;
 const paidMinor=cents(amount.paidAmount),remainingMinor=cents(amount.remainingAmount);
 if(body.counterpartyKind!=='supplier'&&remainingMinor>0)
  fail('MINI_NON_SUPPLIER_PURCHASE_EXPENSE_CREDIT_NOT_SUPPORTED');
 const accountByCode=new Map(accountRows.map(row=>[row.value?.code,row]));
 const expAccount=type==='expense'?accountByCode.get(body.expenseAccountCode):null;
 if(type==='expense'&&(!expAccount||!['expense'].includes(expAccount.value.type)||
   !String(expAccount.value.code).startsWith('5')))
  fail('MINI_FINANCIAL_EXPENSE_ACCOUNT_INVALID');
 if(type==='expense'&&!Object.hasOwn(MINI_EXPENSE_CATEGORIES,body.expenseCategory))
  fail('MINI_FINANCIAL_EXPENSE_CATEGORY_INVALID');
 if(type==='purchase'&&!warehouseId)fail('MINI_FINANCIAL_WAREHOUSE_MISSING');
 const legConfigs=[
  {kind:'cash',amount:body.cashPaidAmount||0,code:body.cashTreasuryCode},
  {kind:'bank',amount:body.bankPaidAmount||0,code:body.bankTreasuryCode}
 ];
 const treasuries=new Map(treasuryRows.map(row=>[row.value?.accountCode,row]));
 const legs=legConfigs.filter(leg=>leg.amount>0).map(leg=>{
  const row=treasuries.get(leg.code);
  if(!row||row.value.status!=='active')fail('MINI_FINANCIAL_TREASURY_NOT_FOUND');
  if(leg.kind==='cash'&&row.value.type!=='cash_box')
   fail('MINI_FINANCIAL_CASH_TREASURY_TYPE');
  if(leg.kind==='bank'&&row.value.type==='cash_box')
   fail('MINI_FINANCIAL_BANK_TREASURY_TYPE');
  return {...leg,row};
 });
 const legTotal=legs.reduce((s,leg)=>s+cents(leg.amount),0);
 if(legTotal!==paidMinor)fail('MINI_FINANCIAL_SETTLEMENT_MISMATCH');
 const accountingChanges=[];
 const value={
  id,source:'telegram-mini',
  counterpartyType:body.counterpartyKind,
  counterpartyId:body.customerId,
  ...(employeeRow?{employeeId:employeeRow.record_id}:{}),
  date:body.date||createdAt.slice(0,10),
  notes:body.notes,items:amount.items,overallDiscountAmount:amount.overallDiscount,
  currency:'ILS',currencySymbol:'₪',exchangeRate:1,
  subtotal:amount.subtotal,taxRate:amount.taxRate,taxAmount:amount.taxAmount,
  totalAmount:amount.totalAmount,paidAmount:amount.paidAmount,
  baseTotalAmount:amount.totalAmount,basePaidAmount:amount.paidAmount,
  remainingAmount:amount.remainingAmount,paymentMethod:body.paymentMethod,
  status:remainingMinor===0?'paid':paidMinor>0?'partial':'unpaid',
  cashPaidAmount:body.cashPaidAmount||0,bankPaidAmount:body.bankPaidAmount||0,
  cashPaymentCurrency:'ILS',bankPaymentCurrency:'ILS',
  cashPaymentExchangeRate:1,bankPaymentExchangeRate:1,
  cashTreasuryAccountCode:body.cashTreasuryCode||'',
  bankTreasuryAccountCode:body.bankTreasuryCode||'',
  cashBasePaidAmount:body.cashPaidAmount||0,bankBasePaidAmount:body.bankPaidAmount||0,
  paymentReceiptNote:body.paymentNotes,createdAt,
  ...(legs.length===1?{treasuryAccountCode:legs[0].code}:{}),
  ...(actor.branchId?{branchId:actor.branchId}:{})
 };
 const journalId='je-mini-'+draftId;
 if(type==='purchase'){
  Object.assign(value,{invoiceNumber:documentNumber,
   supplierId:body.counterpartyKind==='supplier'?supplierRow?.record_id:undefined,
   customerId:body.counterpartyKind==='customer'?supplierRow?.record_id:undefined,
   supplierName:counterpartyName,warehouse:warehouseName,
   supplierInvoiceNumber:body.supplierInvoiceNumber||undefined});
  accountingChanges.push({entity:'purchases',id,expectedVersion:0,value});
 }else{
  Object.assign(value,{
   invoiceNumber:documentNumber,expenseInvoiceNumber:documentNumber,
   documentType:'purchase_invoice',source:'telegram-mini',
   supplierId:body.counterpartyKind==='supplier'?supplierRow?.record_id:undefined,
   customerId:body.counterpartyKind==='customer'?supplierRow?.record_id:undefined,
   employeeId:employeeRow?.record_id,
   supplierName:counterpartyName,beneficiary:counterpartyName,
   expenseAccountCode:expAccount.value.code,
   expenseAccountName:expAccount.value.name,
   category:body.expenseCategory,
   categoryName:MINI_EXPENSE_CATEGORIES[body.expenseCategory],
   amount:amount.totalAmount,
   treasuryAccountCode:legs.length===1?legs[0].code:'',
   treasuryName:legs.map(l=>l.row.value.name).join(' + ')||'آجل',
   taxInvoiceNumber:body.supplierInvoiceNumber||documentNumber,
   journalEntryId:journalId
  });
  accountingChanges.push({entity:'expenses',id,expectedVersion:0,value});
 }
 const journal=[];
 const push=(code,debit,credit,description)=>{
  if(debit===0&&credit===0)return;
  const account=accountByCode.get(code);
  if(!account)fail('MINI_FINANCIAL_ACCOUNT_NOT_CONFIGURED_'+code);
  journal.push({accountCode:code,accountName:account.value.name,
   debit:money(debit),credit:money(credit),description});
 };
 const subtotal=cents(amount.subtotal),tax=cents(amount.taxAmount);
 push(type==='purchase'?'1302':expAccount.value.code,subtotal,0,
  type==='purchase'?'مشتريات مخزنية':'فاتورة مصروف');
 if(tax>0)push('2103',tax,0,'ضريبة مدخلات');
 for(const leg of legs)push(leg.kind==='cash'?'1101':'1102',0,cents(leg.amount),
  leg.kind==='cash'?'سداد نقدي':'سداد بنكي أو محفظة');
 if(remainingMinor>0)push('2101',0,remainingMinor,'ذمم دائنة');
 const jvalue={id:journalId,
  entryNumber:'JE-'+documentNumber,date:value.date,
  description:(type==='purchase'?'فاتورة شراء ':'فاتورة مصروف ')+documentNumber+
   ' — '+counterpartyName,
  referenceType:type==='purchase'?'purchase':'expense',referenceId:id,lines:journal,createdAt};
 validateJournal(jvalue);
 accountingChanges.push({entity:'journalEntries',id:journalId,expectedVersion:0,value:jvalue});
 if(type==='purchase'){
  const grouped=new Map();
  for(const line of amount.items){
   const previous=grouped.get(line.itemId)||{quantity:0,cost:0};
   previous.quantity=Number((previous.quantity+line.quantity).toFixed(3));
   previous.cost=money(cents(previous.cost)+cents(line.total));
   grouped.set(line.itemId,previous);
  }
  for(const [itemId,qty] of grouped){
   const row=stock.get(itemId),item=row.value;
   const oldStock=Number(item.stockQuantity);
   if(!Number.isFinite(oldStock)||!Number.isFinite(qty.quantity))
    fail('MINI_FINANCIAL_STOCK_INVALID');
   const newStock=Number((oldStock+qty.quantity).toFixed(6));
   const unitCost=Number((qty.cost/qty.quantity).toFixed(6));
   const updatedItem={...item,stockQuantity:newStock,
    purchasePrice:unitCost,lastMovementDate:value.date};
   // Registered warehouse mirrors are normalized inside the central sync service.
   accountingChanges.push({entity:'inventory',id:itemId,expectedVersion:Number(row.version),value:updatedItem});
   const moveId='sm-mini-'+draftId+'-'+itemId;
   accountingChanges.push({entity:'stockMovements',id:moveId,expectedVersion:0,
    value:{id:moveId,itemId,itemCode:item.code,itemName:item.name,category:item.category,
     type:'in_purchase',quantity:qty.quantity,balanceBefore:oldStock,
     balanceAfter:newStock,date:value.date,time:createdAt.slice(11,16),
     unitPrice:unitCost,totalValue:qty.cost,
     referenceType:'purchase',referenceNumber:documentNumber,
     warehouseId,warehouseName,performedBy:actor.name||'Telegram'}
   });
  }
 }
 if(remainingMinor>0&&supplierRow&&body.counterpartyKind==='supplier'){
  const old=Number(supplierRow.value.balance||0);
  if(!Number.isFinite(old))fail('MINI_FINANCIAL_SUPPLIER_BALANCE_INVALID');
  accountingChanges.push({entity:'parties',id:supplierRow.record_id,
   expectedVersion:Number(supplierRow.version),
   value:{...supplierRow.value,balance:money(cents(Math.abs(old))*(old<0?-1:1)-remainingMinor)}});
 }
 for(const leg of legs){
  const row=leg.row,t=row.value;
  const paid=cents(leg.amount);
  const original=Number(t.currencyBalances?.ILS??t.balance??0);
  const base=Number(t.balance||0);
  if(!Number.isFinite(original)||!Number.isFinite(base))
   fail('MINI_FINANCIAL_TREASURY_BALANCE_INVALID');
  const balance=money(cents(Math.abs(base))*(base<0?-1:1)-paid);
  const currencyBalance=money(cents(Math.abs(original))*(original<0?-1:1)-paid);
  const txId='tx-mini-'+draftId+'-'+leg.kind;
  const tx={id:txId,treasuryId:t.id,treasuryName:t.name,date:value.date,
   type:'withdrawal',amount:leg.amount,currency:'ILS',currencySymbol:'₪',
   exchangeRate:1,baseCurrency:'ILS',baseAmount:-leg.amount,
   balanceAfter:balance,balanceAfterCurrency:currencyBalance,
   partyName:counterpartyName,description:documentNumber+' — '+(body.paymentNotes||'سداد'),
   referenceType:type,referenceId:id};
  accountingChanges.push({entity:'treasuries',id:row.record_id,
   expectedVersion:Number(row.version),
   value:{...t,balance,currencyBalances:{...(t.currencyBalances||{}),ILS:currencyBalance},
    transactions:[tx,...(Array.isArray(t.transactions)?t.transactions:[])]}});
  const voucherId='vch-mini-'+draftId+'-'+leg.kind;
  accountingChanges.push({entity:'vouchers',id:voucherId,expectedVersion:0,value:{
   id:voucherId,voucherNumber:'PAY-'+documentNumber+'-'+leg.kind.toUpperCase(),
   type:'payment',date:value.date,partyId:employeeRow?.record_id||supplierRow.record_id,
   partyName:counterpartyName,amount:leg.amount,paymentMethod:leg.kind==='cash'?'cash':'bank_transfer',
   accountCode:type==='purchase'?'1302':expAccount.value.code,
   treasuryAccountCode:leg.code,currency:'ILS',
   currencySymbol:'₪',baseAmount:leg.amount,relatedDocType:type,
   relatedDocId:id,description:documentNumber+' — '+(body.paymentNotes||'سداد')
  }});
 }
 // Consistency with AccountingContext: account balances are materialized along
 // with the journal entry, so account, treasury and invoice screens agree.
 const updatedAccounts=new Map();
 for(const row of journal){
  const account=accountByCode.get(row.accountCode);
  const prior=updatedAccounts.get(row.accountCode)||account.value;
  const sign=['asset','expense'].includes(prior.type)?1:-1;
  const opening=Number(prior.balance||0);
  if(!Number.isFinite(opening))fail('MINI_FINANCIAL_ACCOUNT_BALANCE_INVALID');
  updatedAccounts.set(row.accountCode,{
   ...prior,balance:money(Math.round(opening*100)+sign*(cents(row.debit)-cents(row.credit)))
  });
 }
 for(const [code,value] of updatedAccounts){
  const row=accountByCode.get(code);
  accountingChanges.push({entity:'accounts',id:row.record_id,
   expectedVersion:Number(row.version),value});
 }
 const command={id:draftId,workspaceId:input.workspace,actorId:actor.id,
  createdAt:Date.parse(createdAt),attempts:0,retryAt:0,status:'pending',
  changes:accountingChanges};
 validateCommand(command,input.workspace);
 return {command,id,documentNumber,amount,partyName:counterpartyName};
}
