import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInvoiceRevisionBaseline} from '../invoice-revision-baseline.mjs';
const inv={id:'i66',invoiceNumber:'INV-0066',date:'2026-11-04',
 isOfficial:true,customerId:'cust',totalAmount:50.4,baseTotalAmount:50.4,
 subtotal:50.4,paidAmount:0,items:[
  {itemId:'paper',category:'print_raw',quantity:68,total:13.6,unitPrice:0.2},
  {itemId:'paper',category:'print_raw',quantity:64,total:12.8,unitPrice:0.2},
  {itemId:'card',category:'print_raw',quantity:12,total:24,unitPrice:2}]};
const journal=(id,type,amt)=>({value:{id,referenceType:type,referenceId:'i66',
 lines:[{accountCode:type==='cogs'?'5101':'1201',debit:amt,credit:0},
 {accountCode:type==='cogs'?'1301':'4101',debit:0,credit:amt}]}});
const movements=[
 {value:{id:'old-unrelated',date:'2026-11-01',referenceNumber:'INV-0066',
  itemId:'paper',quantity:1,unitPrice:1,totalValue:1,type:'out_sale'}},
 {value:{id:'sale-card',date:'2026-11-04',referenceNumber:'INV-0066',
  itemId:'card',quantity:12,unitPrice:1,totalValue:12,type:'out_sale'}},
 {value:{id:'sale-paper',date:'2026-11-04',referenceNumber:'INV-0066',
  itemId:'paper',quantity:132,unitPrice:1,totalValue:132,type:'out_sale'}}
];
const linked=[journal('sales','pos_invoice',50.4),journal('cogs','cogs',144)];
const edited={...inv,totalAmount:51,baseTotalAmount:51,subtotal:51,
 items:[{...inv.items[0],quantity:1,unitPrice:14,total:14},
 {...inv.items[1],quantity:1,unitPrice:13,total:13},inv.items[2]]};
test('invoice 66 baseline ignores unrelated reused number and verifies exact quantities',()=>{
 const plan=verifyInvoiceRevisionBaseline({invoice:inv,proposed:edited,journals:linked,movements});
 assert.equal(plan.totalDeltaMinor,60);
 assert.equal(plan.currentCOGSMinor,14400);
 assert.equal(plan.expectedNextCOGSMinor,1400);
 assert.deepEqual(plan.verifiedMovementIds,['sale-card','sale-paper']);
});
test('invoice 71-type duplicated sales and cost journals block unreviewed amendment',()=>{
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:inv,proposed:edited,journals:[...linked,journal('duplicate','pos_invoice',8)],
  movements}),/RECONCILED_JOURNAL_HISTORY/);
});
test('mismatched stock and cost are never silently corrected',()=>{
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:inv,proposed:edited,journals:linked,movements:movements.slice(0,2)}),
  /STOCK_BASELINE_MISMATCH/);
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:inv,proposed:edited,journals:[linked[0],journal('cogs','cogs',130)],
  movements}),/COST_BASELINE_MISMATCH/);
});
