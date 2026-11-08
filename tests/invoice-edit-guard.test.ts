import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareSecureInvoiceDescriptionEdit,isRedundantRejectedInvoiceResubmit} from '../src/sync-next/invoiceEdits';
const old={
 id:'inv1',invoiceNumber:'INV-0068',date:'2026-11-08',customerId:'p1',customerName:'Customer',
 items:[{itemId:'sku1',itemName:'Printed labels',quantity:2,unitPrice:40,total:80,notes:''}],
 totalAmount:80,paidAmount:0,remainingAmount:80,subtotal:80,
 branchId:'br1',status:'unpaid',workflowStatus:'new',isOfficial:true,
 isAccountingPosted:true,postedAt:'2026-11-08T06:00:00Z',
 statusHistory:[{id:'st0',notes:'created',time:'10:00',createdAt:'2026-11-08T06:00:00Z'}],
 notes:'Original'
};
test('secure POS edit only updates descriptions and leaves journal metadata unchanged',()=>{
 const recomputed={...old,notes:'changed',items:[{...old.items[0],itemName:'Revised label'}],
   postedAt:'2026-11-08T07:00:00Z',
   statusHistory:[{id:'new-st',notes:'created',time:'11:00',createdAt:'2026-11-08T07:00:00Z'}]};
 const result=prepareSecureInvoiceDescriptionEdit(old,recomputed);
 assert.equal(result.notes,'changed');
 assert.equal(result.items[0].itemName,'Revised label');
 assert.deepEqual(result.statusHistory,old.statusHistory);
 assert.equal(result.postedAt,old.postedAt);
 assert.equal(result.isOfficial,true);
 assert.equal(result.totalAmount,80);
});
test('secure POS cannot overwrite monetary totals or duplicate a posted sale',()=>{
 for(const changed of [{totalAmount:81},{customerId:'p2'},
  {items:[{...old.items[0],unitPrice:90}]},{invoiceNumber:'INV-0069'},
  {branchId:'br2'},{isAccountingPosted:false}]){
  assert.throws(()=>prepareSecureInvoiceDescriptionEdit(old,{...old,...changed}),
   /POSTED_INVOICE_CORRECTION_REQUIRED/);
 }
});
test('only a redundant rejected invoice with regenerated creation times is recognized',()=>{
 const stale={...old,postedAt:'2026-11-08T10:00:00Z',
  statusHistory:[{...old.statusHistory[0],id:'fresh',createdAt:'2026-11-08T10:00:00Z',time:'11:00'}]};
 delete (stale as any).isOfficial;
 assert.equal(isRedundantRejectedInvoiceResubmit(old,stale),true);
 assert.equal(isRedundantRejectedInvoiceResubmit(old,{...stale,notes:'Changed'}),false);
 assert.equal(isRedundantRejectedInvoiceResubmit(old,{...stale,totalAmount:100}),false);
});
