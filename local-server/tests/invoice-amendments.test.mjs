import test from 'node:test';
import assert from 'node:assert/strict';
import {officialInvoiceAmendment,preserveOfficialInvoiceFields} from '../invoice-amendments.mjs';
const old={id:'i1',invoiceNumber:'INV-0068',branchId:'b1',isOfficial:true,
  tempInvoiceNumber:'TEMP-i1',postedAt:'2026-11-08T06:10:00Z',
  isAccountingPosted:true,totalAmount:120,paidAmount:20,remainingAmount:100,
  customerId:'p1',currency:'ILS',items:[{itemId:'it1',itemName:'Print',quantity:2,unitPrice:60,total:120}],
  notes:'Original',statusHistory:[{id:'entry1',notes:'Created'}]};
test('official invoices permit descriptive changes and retain cloud assigned fields',()=>{
 const changed={...old,notes:'Revised',items:[{...old.items[0],itemName:'Printed sheets'}],
   statusHistory:[...old.statusHistory,{id:'entry2',notes:'Editing notes'}]};
 delete changed.isOfficial;delete changed.tempInvoiceNumber;delete changed.postedAt;
 assert.equal(officialInvoiceAmendment(old,changed).allowed,true);
 const next=preserveOfficialInvoiceFields(old,changed);
 assert.equal(next.isOfficial,true);
 assert.equal(next.tempInvoiceNumber,'TEMP-i1');
 assert.equal(next.postedAt,old.postedAt);
 assert.equal(next.notes,'Revised');
});
test('posted amount, quantity, payment, party, invoice number, and prior history cannot be replaced',()=>{
 for(const change of [
  {totalAmount:125},{paidAmount:30},{customerId:'p2'},
  {invoiceNumber:'INV-0069'},{isAccountingPosted:false},{items:[{...old.items[0],quantity:3}]},
  {statusHistory:[{id:'changed-entry',notes:'Erased creation'}]}
 ]){
  assert.equal(officialInvoiceAmendment(old,{...old,...change}).allowed,false,JSON.stringify(change));
  assert.throws(()=>preserveOfficialInvoiceFields(old,{...old,...change}));
 }
});
test('old client cannot de-certify a posted invoice',()=>{
 assert.equal(officialInvoiceAmendment(old,{...old,isOfficial:false}).allowed,false);
});

test('legacy posted invoices without official certification remain protected',()=>{
 const legacy={...old,isOfficial:false,invoiceNumber:'INV-0055'};
 assert.equal(officialInvoiceAmendment(legacy,{...legacy,totalAmount:58}).allowed,false);
 assert.equal(officialInvoiceAmendment(legacy,{...legacy,items:[{...legacy.items[0],quantity:1}]}).allowed,false);
 const notes=preserveOfficialInvoiceFields(legacy,{...legacy,notes:'Verified annotation'});
 assert.equal(notes.isOfficial,false,'notes must not certify incomplete accounting history');
 assert.equal(notes.notes,'Verified annotation');
 assert.equal(notes.totalAmount,legacy.totalAmount);
});
