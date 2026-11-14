import test from 'node:test';
import assert from 'node:assert/strict';
import {miniPurchaseAmounts,miniFinancialChanges} from '../telegram-mini-purchase-posting.mjs';
import {normalizeMiniSaleBody} from '../telegram-mini-pos.mjs';
const id='cad7a026-585e-47d7-a7ad-ed3bce976a8a';
const supplier={id:'pt-supplier',name:'مورد تجريبي',code:'SUPP-0020',
 type:'supplier',balance:-10,openingBalance:0};
const employee={id:'emp-1',name:'موظف تجريبي',status:'active'};
const sku={id:'item-a',name:'ورق مقوى',code:'PRI-00002',category:'printing',
 unit:'م²',stockQuantity:100,purchasePrice:60,sellingPrice:120,warehouseStock:{main:100}};
const acc=(code,type='asset')=>({record_id:'account-'+code,version:1,
 value:{code,name:'حساب '+code,type,balance:0}});
const accounts=[acc('1302'),acc('2101','liability'),acc('2103','asset'),
 acc('1101'),acc('1102'),acc('5105','expense')];
const t=(id,code,type)=>({record_id:id,version:2,
 value:{id,name:'صندوق '+code,type,accountCode:code,status:'active',balance:800,
 currencyBalances:{ILS:800},transactions:[]}});
const stock=[{record_id:'item-a',version:2,value:sku}];
const supplierRow={record_id:supplier.id,version:2,value:supplier};
const body={
 date:'2026-11-14',customerId:supplier.id,documentType:'purchase',
 counterpartyKind:'supplier',overallDiscount:0,
 paymentNotes:'نهاية الشهر',notes:'ملاحظات الوثيقة',
 cashPaidAmount:0,bankPaidAmount:0,cashTreasuryCode:'',bankTreasuryCode:'',
 paymentMethod:'credit',paidAmount:0,
 items:[{itemId:sku.id,quantity:4,unitPrice:120,hasDimensions:true,
 length:1,width:1,count:4,notes:'ملاحظة الصنف'}]
};
const run=(fields,overrides={})=>{
 const b=normalizeMiniSaleBody({...body,...fields});
 return miniFinancialChanges({
  workspace:'lobnan_main',body:b,draftId:id,createdAt:'2026-11-14T14:00:00.000Z',
  documentNumber:(fields.documentType==='expense'?'EXP':'PUR')+'-2026-0001',
  supplierRow,stockRows:stock,accountRows:accounts,
  treasuryRows:[t('treasury-cash-main','CASH-1101','cash_box'),t('bank','CASH-1102','bank')],
  warehouseId:'main',warehouseName:'الرئيسي',vatRate:0,
  actor:{id:'user-admin',name:'مسؤول'},...overrides
 });
};
const change=(out,entity)=>out.command.changes.filter(c=>c.entity===entity);
const sums=lines=>({
 debit:Number(lines.reduce((n,l)=>n+l.debit,0).toFixed(2)),
 credit:Number(lines.reduce((n,l)=>n+l.credit,0).toFixed(2))
});
test('purchase is posted to purchases with a balanced journal, actual stock receipt, supplier payable and notes',()=>{
 const out=run({});
 assert.equal(out.id,'pur-mini-'+id);
 assert.equal(change(out,'purchases').length,1);
 assert.equal(change(out,'expenses').length,0);
 assert.equal(change(out,'inventory').length,1);
 assert.equal(change(out,'stockMovements').length,1);
 assert.equal(change(out,'inventory')[0].value.stockQuantity,104);
 assert.equal(change(out,'stockMovements')[0].value.type,'in_purchase');
 assert.equal(change(out,'parties')[0].value.balance,-490);
 const doc=change(out,'purchases')[0].value;
 assert.equal(doc.invoiceNumber,'PUR-2026-0001');
 assert.equal(doc.supplierId,supplier.id);
 assert.equal(doc.totalAmount,480);
 assert.equal(doc.paidAmount,0);
 assert.equal(doc.status,'unpaid');
 assert.equal(doc.items[0].notes,'ملاحظة الصنف');
 assert.equal(doc.paymentReceiptNote,'نهاية الشهر');
 assert.deepEqual(sums(change(out,'journalEntries')[0].value.lines),{debit:480,credit:480});
});
test('cash and bank settlement decreases both treasuries and creates two payment vouchers atomically',()=>{
 const out=run({cashPaidAmount:100,bankPaidAmount:120,
  cashTreasuryCode:'CASH-1101',bankTreasuryCode:'CASH-1102'});
 assert.equal(change(out,'purchases')[0].value.paidAmount,220);
 assert.equal(change(out,'parties')[0].value.balance,-270);
 assert.equal(change(out,'treasuries').length,2);
 assert.equal(change(out,'vouchers').length,2);
 assert.equal(change(out,'treasuries')[0].value.balance,700);
 assert.equal(change(out,'treasuries')[1].value.balance,680);
 const journal=change(out,'journalEntries')[0].value;
 assert.deepEqual(sums(journal.lines),{debit:480,credit:480});
 assert.equal(journal.lines.find(x=>x.accountCode==='2101').credit,260);
});
test('expense is an itemized purchase invoice in expenses with selected expense account and absolutely NO stock movements',()=>{
 const out=run({documentType:'expense',expenseAccountCode:'5105',
  expenseCategory:'maintenance',cashPaidAmount:480,cashTreasuryCode:'CASH-1101'});
 assert.equal(change(out,'purchases').length,0);
 assert.equal(change(out,'expenses').length,1);
 assert.equal(change(out,'stockMovements').length,0);
 assert.equal(change(out,'inventory').length,0);
 const exp=change(out,'expenses')[0].value;
 assert.equal(exp.expenseAccountCode,'5105');
 assert.equal(exp.documentType,'purchase_invoice');
 assert.equal(exp.invoiceNumber,'EXP-2026-0001');
 assert.equal(exp.items[0].notes,'ملاحظة الصنف');
 assert.equal(exp.amount,480);
 assert.equal(exp.status,'paid');
 assert.equal(exp.paymentReceiptNote,'نهاية الشهر');
 assert.deepEqual(sums(change(out,'journalEntries')[0].value.lines),{debit:480,credit:480});
 assert.equal(change(out,'journalEntries')[0].value.lines[0].accountCode,'5105');
});
test('unpaid supplier expense is a payable and not a cash withdrawal or stock receipt',()=>{
 const out=run({documentType:'expense',expenseAccountCode:'5105',expenseCategory:'utilities'});
 assert.equal(change(out,'treasuries').length,0);
 assert.equal(change(out,'parties').length,1);
 assert.equal(change(out,'parties')[0].value.balance,-490);
 assert.equal(change(out,'expenses')[0].value.status,'unpaid');
 assert.equal(change(out,'journalEntries')[0].value.lines.at(-1).accountCode,'2101');
});
test('employee may receive fully paid expense but not a supplier debt',()=>{
 const out=run({documentType:'expense',expenseAccountCode:'5105',
  expenseCategory:'other',counterpartyKind:'employee',cashPaidAmount:480,
  cashTreasuryCode:'CASH-1101'},{
  supplierRow:null,employeeRow:{record_id:employee.id,version:1,value:employee}
 });
 assert.equal(change(out,'expenses')[0].value.employeeId,employee.id);
 assert.equal(change(out,'parties').length,0);
 assert.throws(()=>run({documentType:'expense',expenseAccountCode:'5105',
  expenseCategory:'other',counterpartyKind:'employee'},{
  supplierRow:null,employeeRow:{record_id:employee.id,version:1,value:employee}
 }),/MINI_NON_SUPPLIER_PURCHASE_EXPENSE_CREDIT_NOT_SUPPORTED/);
});
test('expense account must be configured and an actual expense account',()=>{
 assert.throws(()=>run({documentType:'expense',expenseAccountCode:'1101'}),
  /MINI_FINANCIAL_EXPENSE_ACCOUNT_INVALID/);
});
test('VAT is an input tax line and the entire journal balances with discount',()=>{
 const out=run({overallDiscount:20},{vatRate:16});
 const doc=change(out,'purchases')[0].value;
 assert.equal(doc.subtotal,460);
 assert.equal(doc.taxAmount,73.6);
 assert.equal(doc.totalAmount,533.6);
 const journal=change(out,'journalEntries')[0].value;
 assert.equal(journal.lines.find(l=>l.accountCode==='2103').debit,73.6);
 assert.deepEqual(sums(journal.lines),{debit:533.6,credit:533.6});
});
test('never allow a nonstock delivery service to fake a warehouse purchase',()=>{
 const fake={...sku,id:'srv-delivery',stockQuantity:0};
 assert.throws(()=>run({items:[{itemId:fake.id,quantity:1,unitPrice:10}]},
  {stockRows:[{record_id:fake.id,value:fake,version:2}]}),
  /MINI_PURCHASE_SERVICE_USE_EXPENSE/);
});
