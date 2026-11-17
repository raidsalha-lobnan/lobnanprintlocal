import test from 'node:test';
import assert from 'node:assert/strict';
import type {Invoice} from '../src/types';
import {preparePosDescriptionOnlyEdit} from '../src/utils/posDescriptionEdit';

const original=()=>({
 id:'inv-pos-101',invoiceNumber:'INV-0101',date:'2026-11-16',
 type:'pos',customerId:'cust-1',counterpartyType:'customer',counterpartyId:'cust-1',
 customerName:'عميل أساسي',currency:'ILS',exchangeRate:1,
 warehouse:'المخزن الرئيسي',branchId:'branch-main',paymentMethod:'credit',
 subtotal:50,totalAmount:50,paidAmount:0,remainingAmount:50,
 discountTotal:0,taxRate:0,taxAmount:0,additionalCharges:0,
 isOfficial:true,isAccountingPosted:true,notes:'ملاحظة قديمة',
 items:[{
  id:'line-01',itemId:'itm-1',itemName:'ورق',description:'وصف قديم',
  notes:'الملاحظة القديمة',quantity:2,unitPrice:25,total:50,
  discount:0,tax:0,taxRate:0,length:0,width:0,count:1,hasDimensions:false,
  unit:'حبة',attachments:[]
 }]
}) as unknown as Invoice;
const options=()=>({
 editingInvoiceId:'inv-pos-101',invoiceNumber:'INV-0101',
 date:'2026-11-16',counterpartyType:'customer',counterpartyId:'cust-1',
 warehouse:'المخزن الرئيسي',branchId:'branch-main',currency:'ILS',
 exchangeRate:1,overallDiscount:0,additionalCharges:0,taxRate:0,
 paidAmount:0,cashPaidAmount:0,bankPaidAmount:0
});
const lines=()=>[{
 item:{id:'itm-1'},itemName:'ورق',description:'وصف قديم',notes:'الملاحظة القديمة',
 quantity:2,unitPrice:25,discount:0,tax:0,taxRate:0,length:0,width:0,
 count:1,hasDimensions:false,unit:'حبة',attachments:[]
}];

const edit=(inv:Invoice=original(),ls=lines(),opt=options())=>
 preparePosDescriptionOnlyEdit(inv,ls,inv.customerName,'credit','cust-1',
 'ملاحظة قديمة',{...opt});

test('cashier sidebar notes persist by proposing only changed descriptive fields',()=>{
 const orig=original();
 const rows=lines();
 rows[0].notes='تعليمات قص جديدة';
 rows[0].description='طباعة وجهين';
 const result=edit(orig,rows);
 assert.ok(result);
 assert.equal(result.items[0].notes,'تعليمات قص جديدة');
 assert.equal(result.items[0].description,'طباعة وجهين');
 assert.equal(result.items[0].id,'line-01');
 for(const field of ['subtotal','totalAmount','paidAmount','remainingAmount',
  'discountTotal','taxAmount','date','warehouse','customerId','exchangeRate']){
  assert.equal((result as any)[field],(orig as any)[field],field);
 }
 assert.equal(orig.items[0].notes,'الملاحظة القديمة','Never mutate server source');
 assert.equal(result.items[0].unitPrice,25);
 assert.equal(result.items[0].quantity,2);
});

test('invoice-level note and receipt note persist without recomputing the invoice',()=>{
 const orig=original();
 const result=preparePosDescriptionOnlyEdit(orig,lines(),orig.customerName,'credit',
  orig.customerId,'ملاحظة الفاتورة الجديدة',
  {...options(),paymentNotes:'إيصال العميل'});
 assert.equal(result?.notes,'ملاحظة الفاتورة الجديدة');
 assert.equal(result?.paymentNotes,'إيصال العميل');
 assert.equal(result?.totalAmount,orig.totalAmount);
});

test('changing quantity, unit price, tax, discount, dimensions, item identity or order requires financial workflow',()=>{
 for(const mutation of [
  (x:any)=>x.quantity=3,(x:any)=>x.unitPrice=30,
  (x:any)=>x.tax=5,(x:any)=>x.discount=2,
  (x:any)=>x.length=2,(x:any)=>x.hasDimensions=true,
  (x:any)=>x.item.id='itm-2',(x:any)=>x.unit='م²'
 ]){
  const ls=lines();mutation(ls[0]);
  assert.equal(edit(original(),ls),null);
 }
 assert.equal(edit(original(),[]),null,'Deleted lines are financial');
});

test('changing customer, warehouse, date, price conversion or payment cannot be hidden in a notes edit',()=>{
 for(const mutation of [
  (x:any)=>x.date='2026-11-17',
  (x:any)=>x.warehouse='مخزن آخر',
  (x:any)=>x.exchangeRate=1.2,
  (x:any)=>x.paidAmount=20,
  (x:any)=>x.overallDiscount=5,
  (x:any)=>x.additionalCharges=10,
  (x:any)=>x.branchId='other-branch',
  (x:any)=>x.counterpartyId='cust-2'
 ]){
  const opt=options();mutation(opt);
  assert.equal(edit(original(),lines(),opt),null);
 }
});

test('cash and bank payments are preserved exactly for text-only revisions',()=>{
 const inv=original() as any;
 inv.paymentMethod='cash';inv.paidAmount=50;inv.remainingAmount=0;
 inv.cashPaidAmount=50;inv.bankPaidAmount=0;inv.cashTreasuryCode='CASH-1101';
 inv.treasuryAccountCode='CASH-1101';
 const opt={...options(),paidAmount:50,cashPaidAmount:50,
  bankPaidAmount:0,cashTreasuryCode:'CASH-1101',treasuryAccountCode:'CASH-1101'};
 const result=preparePosDescriptionOnlyEdit(inv,
  [{...lines()[0],notes:'تعديل بعد الدفع'}],inv.customerName,'cash','cust-1',
  inv.notes,opt);
 assert.equal(result?.items[0].notes,'تعديل بعد الدفع');
 assert.equal(result?.paidAmount,50);
 assert.equal(preparePosDescriptionOnlyEdit(inv,lines(),inv.customerName,'cash','cust-1',
  inv.notes,{...opt,cashPaidAmount:40}),null);
});

test('same notes plus a changed financial amount must never be silently accepted as metadata-only',()=>{
 const inv=original();const ls=lines();ls[0].notes='بعد التغيير';ls[0].unitPrice=26;
 assert.equal(edit(inv,ls),null);
});

test('old POS invoices with omitted units and branch IDs can retain their numbers on notes-only save',()=>{
 const inv=original() as any;
 inv.branch='الفرع الرئيسي';
 delete inv.branchId;
 inv.currency='₪';
 delete inv.items[0].unit;
 const l=lines();
 l[0].item={id:'itm-1',unit:'حبة'} as any;
 l[0].notes='الملاحظة المعدلة';
 const result=preparePosDescriptionOnlyEdit(inv,l,inv.customerName,'credit','cust-1',
  inv.notes,{...options(),branch:'الفرع الرئيسي',branchId:'branch-main'});
 assert.equal(result?.items[0].notes,'الملاحظة المعدلة');
 assert.equal(result?.items[0].unit,undefined,'Do not fabricate a unit in the stored invoice');
 assert.equal(result?.branchId,undefined,'Do not fabricate a financial branch identity');
 assert.equal(result?.currency,'₪','Keep the exact historical currency representation');
});

test('old cash vouchers with legacy treasury shorthand do not force a new cash movement',()=>{
 const inv=original() as any;
 inv.paymentMethod='cash';
 inv.paidAmount=50;
 inv.remainingAmount=0;
 delete inv.cashPaidAmount;
 inv.treasuryAccountCode='1101';
 const result=preparePosDescriptionOnlyEdit(inv,
  [{...lines()[0],notes:'تعديل ملاحظة فاتورة نقدية'}],
  inv.customerName,'cash','cust-1',inv.notes,
  {...options(),paidAmount:50,cashPaidAmount:50,
   cashTreasuryCode:'CASH-1101',treasuryAccountCode:'CASH-1101'});
 assert.equal(result?.items[0].notes,'تعديل ملاحظة فاتورة نقدية');
 assert.equal(result?.treasuryAccountCode,'1101','Never rewrite the old treasury route');
 assert.equal(result?.paidAmount,50);
});
