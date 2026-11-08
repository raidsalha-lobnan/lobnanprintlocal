import test from 'node:test';
import assert from 'node:assert/strict';
import {planInvoiceRevision} from '../invoice-revision-plan.mjs';
const original={
 id:'invoice-0066',invoiceNumber:'INV-0066',isOfficial:true,
 customerId:'cust66',currency:'ILS',exchangeRate:1,paymentMethod:'credit',
 subtotal:50.4,totalAmount:50.4,paidAmount:0,baseTotalAmount:50.4,basePaidAmount:0,
 items:[
  {itemId:'A4',category:'print_raw',quantity:68,unitPrice:0.2,total:13.6},
  {itemId:'A4',category:'print_raw',quantity:64,unitPrice:0.2,total:12.8},
  {itemId:'CARD',category:'print_raw',quantity:12,unitPrice:2,total:24}
 ]};
test('invoice 0066 price and quantity edit correctly computes net stock and receivable deltas',()=>{
 const next={...original,subtotal:51,totalAmount:51,baseTotalAmount:51,
  items:[
   {...original.items[0],quantity:1,unitPrice:14,total:14},
   {...original.items[1],quantity:1,unitPrice:13,total:13},
   original.items[2]
  ]};
 const plan=planInvoiceRevision(original,next);
 assert.equal(plan.invoiceNumber,'INV-0066');
 assert.equal(plan.totalDeltaMinor,60);
 assert.deepEqual(plan.stockDeltas,[{itemId:'A4',oldQuantity:132,newQuantity:2,inventoryChange:130}]);
 assert.deepEqual(plan.customerBalanceChanges,[{partyId:'cust66',amountMinor:60}]);
});
test('no customer debt duplication when same party and total is unchanged',()=>{
 const plan=planInvoiceRevision(original,{...original,notes:'updated'});
 assert.deepEqual(plan.customerBalanceChanges,[]);
 assert.deepEqual(plan.stockDeltas,[]);
 assert.equal(plan.changed,true);
});
test('changing the client safely creates two balancing party deltas',()=>{
 const plan=planInvoiceRevision(original,{...original,customerId:'cust-new'});
 assert.deepEqual(plan.customerBalanceChanges,[
  {partyId:'cust66',amountMinor:-5040},{partyId:'cust-new',amountMinor:5040}
 ]);
});
test('changing invoice identity is never allowed',()=>{
 assert.throws(()=>planInvoiceRevision(original,{...original,id:'new'}),/IMMUTABLE/);
 assert.throws(()=>planInvoiceRevision(original,{...original,invoiceNumber:'INV-0077'}),/IMMUTABLE/);
});
test('quantity and amount validation does not accept silent NaN/Infinity',()=>{
 assert.throws(()=>planInvoiceRevision(original,{...original,items:[{...original.items[0],quantity:Infinity}]}),/INVALID_QUANTITY/);
 assert.throws(()=>planInvoiceRevision(original,{...original,totalAmount:NaN}),/INVALID_MONEY/);
});
