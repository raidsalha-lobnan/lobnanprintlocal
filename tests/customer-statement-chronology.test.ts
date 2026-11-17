import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateAccountStatement} from '../src/utils/statementGenerator';
import {compareStatementChronology} from '../src/utils/statementChronology';
import type {Party,Invoice,PurchaseInvoice,PaymentVoucher} from '../src/types';

const customer:Party={
  id:'cust-chronology',code:'CUST-0341',name:'عميل اختبار الترتيب',
  type:'customer',phone:'',email:'',balance:0
};
function invoice(n:number,date='2026-11-17',createdAt?:string,paid=0):Invoice {
  return {
    // Deliberately reverse ID lexical order relative to invoice seniority.
    id:'invoice-uuid-'+String(1000-n).padStart(5,'0'),
    invoiceNumber:'INV-'+String(n).padStart(4,'0'),
    date,createdAt,customerId:customer.id,customerName:customer.name,
    type:'pos',items:[{
      itemId:'itm-test',itemName:'بند اختباري',quantity:1,unitPrice:n,
      discount:0,tax:0,total:n
    }],
    subtotal:n,discountTotal:0,taxRate:0,taxAmount:0,totalAmount:n,
    paidAmount:paid,remainingAmount:n-paid,
    paymentMethod:paid?'cash':'credit',status:paid?'paid':'unpaid',
    workflowStatus:'new',isAccountingPosted:true
  };
}
function statement(invoices:Invoice[],extra?:{vouchers?:PaymentVoucher[];fromDate?:string;toDate?:string}) {
  return generateAccountStatement({party:customer,invoices,purchases:[],
    vouchers:extra?.vouchers||[],fromDate:extra?.fromDate,toDate:extra?.toDate});
}

test('three same-day invoices display oldest inserted first even when UUIDs and source array are reversed',()=>{
 const first=invoice(81,'2026-11-17','2026-11-17T07:40:00.000Z');
 const second=invoice(82,'2026-11-17','2026-11-17T07:44:00.000Z');
 const third=invoice(83,'2026-11-17','2026-11-17T07:49:00.000Z');
 const actual=statement([third,first,second]);
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),
   ['INV-0081','INV-0082','INV-0083']);
 assert.deepEqual(actual.rows.map(r=>r.runningBalance),[81,163,246]);
 assert.equal(actual.totalDebit,246);
 assert.equal(actual.closingBalance,246);
});

test('official invoice serial restores seniority for old invoices without createdAt',()=>{
 const actual=statement([invoice(103),invoice(101),invoice(102)]);
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),
   ['INV-0101','INV-0102','INV-0103']);
 assert.deepEqual(actual.rows.map(r=>r.runningBalance),[101,203,306]);
});

test('business document date takes precedence over insertion time and numbering',()=>{
 const backdated=invoice(99,'2026-11-15','2026-11-17T08:00:00Z');
 const later=invoice(98,'2026-11-16','2026-11-16T08:00:00Z');
 const today=invoice(97,'2026-11-17','2026-11-15T08:00:00Z');
 const actual=statement([today,later,backdated]);
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),
   ['INV-0099','INV-0098','INV-0097']);
});

test('an immediate invoice payment stays after its parent invoice on the same day',()=>{
 const paid=invoice(12,'2026-11-17',undefined,12);
 const later=invoice(13,'2026-11-17');
 const actual=statement([later,paid]);
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),
   ['INV-0012','PAY-INV-0012','INV-0013']);
 assert.deepEqual(actual.rows.map(r=>r.runningBalance),[12,0,13]);
 assert.equal(actual.totalDebit,25);
 assert.equal(actual.totalCredit,12);
 assert.equal(actual.closingBalance,13);
});

test('invoice edits must not use updatedAt to reorder the original insertion sequence',()=>{
 const older={...invoice(20,'2026-11-17','2026-11-17T09:00:00Z'),updatedAt:'2026-11-17T17:00:00Z'};
 const newer={...invoice(21,'2026-11-17','2026-11-17T09:10:00Z'),updatedAt:'2026-11-17T10:00:00Z'};
 const actual=statement([newer,older]);
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),['INV-0020','INV-0021']);
});

test('same-day equal-time ties use numeric invoice number, not string or UUID order',()=>{
 const dated=['INV-9','INV-10','INV-11'].map((n,i)=>({
   id:'uuid-'+String(3-i),date:'2026-11-17',createdAt:'2026-11-17T10:00:00Z',
   type:'invoice',refNum:n
 }));
 assert.deepEqual(dated.sort(compareStatementChronology).map(x=>x.refNum),
  ['INV-9','INV-10','INV-11']);
});

test('date-scoped running balance remains exact and chronological',()=>{
 const actual=statement([
   invoice(3,'2026-11-17'),invoice(1,'2026-11-15'),invoice(2,'2026-11-17')
 ],{fromDate:'2026-11-17',toDate:'2026-11-17'});
 assert.equal(actual.openingBalance,1);
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),['INV-0002','INV-0003']);
 assert.deepEqual(actual.rows.map(r=>r.runningBalance),[3,6]);
 assert.equal(actual.closingBalance,6);
});

test('supplier purchases also use official numeric order when the entry time is unavailable',()=>{
 const supplier={...customer,id:'supplier-test',type:'supplier' as const};
 const pur=(n:number):PurchaseInvoice=>({
   id:'pur-'+(100-n),invoiceNumber:'PUR-'+String(n).padStart(4,'0'),
   date:'2026-11-17',supplierId:supplier.id,supplierName:supplier.name,
   items:[],subtotal:n,taxRate:0,taxAmount:0,totalAmount:n,
   paidAmount:0,paymentMethod:'credit',status:'unpaid'
 });
 const result=generateAccountStatement({party:supplier,invoices:[],
   purchases:[pur(15),pur(13),pur(14)],vouchers:[]});
 assert.deepEqual(result.rows.map(r=>r.referenceNumber),
  ['PUR-0013','PUR-0014','PUR-0015']);
 assert.equal(result.closingBalance,-42);
});

test('foundational opening balance is the first customer movement even when its entry date follows an invoice',()=>{
 // Screenshot regression: INV-0022 dated 01/11, opening balance entered
 // on 03/11, then INV-0023 dated 08/11. Opening is the starting amount,
 // not an ordinary 03/11 transaction.
 const party={...customer,openingBalance:26,openingBalanceDate:'2026-11-03',
  openingBalanceType:'debit' as const};
 const first={...invoice(22,'2026-11-01'),totalAmount:8,subtotal:8};
 const last={...invoice(23,'2026-11-08'),totalAmount:4,subtotal:4};
 const actual=generateAccountStatement({
  party,invoices:[last,first],purchases:[],vouchers:[],
  fromDate:'2026-11-01',toDate:'2026-11-30'
 });
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),
  ['INV-0022','INV-0023'],'Founding balance must NOT be a second movement');
 assert.deepEqual(actual.rows.map(r=>r.runningBalance),[34,38]);
 assert.equal(actual.openingBalance,26,'One opening amount includes foundation');
 assert.equal(actual.closingBalance,38);
 assert.equal(actual.totalDebit,12,'Period debit totals exclude opening');
 assert.equal(actual.totalCredit,0);
 assert.equal(actual.openingBalance+actual.totalDebit-actual.totalCredit,actual.closingBalance);
});

test('foundational opening precedes earlier, same-date, and later invoices without changing balances',()=>{
 const party={...customer,openingBalance:100,openingBalanceDate:'2026-11-17',
  openingBalanceType:'credit' as const};
 const same=invoice(4,'2026-11-17');
 const before=invoice(2,'2026-11-15');
 const after=invoice(6,'2026-11-18');
 const result=generateAccountStatement({party,invoices:[after,same,before],purchases:[],vouchers:[]});
 assert.deepEqual(result.rows.map(r=>r.referenceNumber),
  ['INV-0002','INV-0004','INV-0006']);
 assert.deepEqual(result.rows.map(r=>r.runningBalance),[-98,-94,-88]);
 assert.equal(result.openingBalance,-100,'One credit opening, no duplicated founding row');
 assert.equal(result.closingBalance,-88);
 assert.equal(result.totalCredit,0,'Opening is not a movement within the period');
 assert.equal(result.totalDebit,12);
});

test('date filters continue to carry founding balance into previous-period amount only once',()=>{
 const party={...customer,openingBalance:26,openingBalanceDate:'2026-11-03',
  openingBalanceType:'debit' as const};
 const early={...invoice(22,'2026-11-01'),totalAmount:8,subtotal:8};
 const later={...invoice(23,'2026-11-08'),totalAmount:4,subtotal:4};
 const result=generateAccountStatement({party,invoices:[early,later],
  purchases:[],vouchers:[],fromDate:'2026-11-05',toDate:'2026-11-30'});
 assert.equal(result.openingBalance,34);
 assert.deepEqual(result.rows.map(r=>r.referenceNumber),['INV-0023']);
 assert.equal(result.rows[0].runningBalance,38);
 assert.equal(result.closingBalance,38);
});

test('opening precedence is independent of date even for a stand-alone sort and preserves normal same-day invoice order',()=>{
 const list=[
  {id:'z',date:'2026-11-01',refNum:'INV-0002',type:'invoice',createdAt:'2026-11-01T08:00:00Z'},
  {id:'a',date:'2026-11-03',refNum:'OPENING',type:'opening'},
  {id:'y',date:'2026-11-01',refNum:'INV-0001',type:'invoice',createdAt:'2026-11-01T07:00:00Z'}
 ];
 list.sort(compareStatementChronology);
 assert.deepEqual(list.map(r=>r.refNum),['OPENING','INV-0001','INV-0002']);
});

test('full customer statement always contains exactly one carried-forward opening row in the document, never in movement rows',()=>{
 const customerWithOpening={...customer,openingBalance:20,
  openingBalanceDate:'2026-11-09',openingBalanceType:'debit' as const};
 const result=generateAccountStatement({party:customerWithOpening,
  invoices:[invoice(1,'2026-11-01'),invoice(3,'2026-11-17')],
  purchases:[],vouchers:[]});
 assert.equal(result.openingBalance,20);
 assert.equal(result.rows.filter(r=>r.type==='opening').length,0);
 assert.deepEqual(result.rows.map(r=>r.runningBalance),[21,24]);
 assert.equal(result.closingBalance,24);
 const document=readFileSync(new URL('../src/components/UnifiedPartyStatementDocument.tsx',import.meta.url),'utf8');
 assert.equal((document.match(/رصيد افتتاحي سابق مدور/g)||[]).length,1,
  'There must be exactly one opening line in the shared statement layout');
 assert.ok(document.includes('partyStatement.openingBalance.toFixed(2)'));
});

test('nonzero opening and prior-date invoices form a single carried-forward balance, including when opening audit date is later',()=>{
 const withOpening={...customer,openingBalance:26,
  openingBalanceDate:'2026-11-12',openingBalanceType:'debit' as const};
 const actual=generateAccountStatement({party:withOpening,
  invoices:[{...invoice(22,'2026-11-01'),totalAmount:8,subtotal:8},
   {...invoice(23,'2026-11-08'),totalAmount:4,subtotal:4}],
  purchases:[],vouchers:[],fromDate:'2026-11-05',toDate:'2026-11-30'});
 assert.equal(actual.openingBalance,34);
 assert.deepEqual(actual.rows.map(r=>r.referenceNumber),['INV-0023']);
 assert.equal(actual.rows[0].runningBalance,38);
 assert.equal(actual.totalDebit,4);
 assert.equal(actual.closingBalance,38);
});
