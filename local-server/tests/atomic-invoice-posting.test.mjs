import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';
import {fingerprint,InputError} from '../sync-domain.mjs';
const cmd=()=>{
 const invoiceId='i71';
 return {id:'cmd71',workspaceId:'lobnan_main',atomicInvoiceId:invoiceId,changes:[
  {entity:'invoices',id:invoiceId,expectedVersion:0,value:{
   id:invoiceId,invoiceNumber:'TEMP-i71',customerId:'party71',isAccountingPosted:true,
   totalAmount:8,baseTotalAmount:8,remainingAmount:8,
   items:[{itemId:'sku71',quantity:2,unitPrice:4,total:8,category:'print_raw'}]}},
  {entity:'journalEntries',id:'jrev',expectedVersion:0,value:{
   id:'jrev',referenceId:invoiceId,referenceType:'pos_invoice',
   lines:[{accountCode:'1201',debit:8,credit:0},{accountCode:'4101',debit:0,credit:8}]}},
  {entity:'journalEntries',id:'jcogs',expectedVersion:0,value:{
   id:'jcogs',referenceId:invoiceId,referenceType:'cogs',
   lines:[{accountCode:'5101',debit:4,credit:0},{accountCode:'1301',debit:0,credit:4}]}},
  {entity:'stockMovements',id:'stock',expectedVersion:0,value:{
   id:'stock',referenceNumber:'TEMP-i71',referenceType:'pos_invoice',
   itemId:'sku71',quantity:2,totalValue:4,type:'out_sale'}},
  {entity:'parties',id:'party71',expectedVersion:1,value:{id:'party71',balance:8}},
  {entity:'inventory',id:'sku71',expectedVersion:1,value:{id:'sku71',stockQuantity:18}}
 ]};
};
const expect=(command,error)=>{
 assert.throws(()=>validateAtomicInvoicePosting(command),
  e=>e instanceof InputError && e.message===error,error);
};
test('accepts a full, consistent invoice bundle including financial effects',()=>{
 assert.equal(validateAtomicInvoicePosting(cmd()),true);
});
test('rejects partial journal, stock and customer effects before database writes',()=>{
 let c=cmd();c.changes=c.changes.filter(x=>x.id!=='jrev');
 expect(c,'ATOMIC_POSTING_REVENUE_REQUIRED_ONCE');
 c=cmd();c.changes=c.changes.filter(x=>x.id!=='jcogs');
 expect(c,'ATOMIC_POSTING_COST_JOURNAL_REQUIRED');
 c=cmd();c.changes=c.changes.filter(x=>x.id!=='stock');
 expect(c,'ATOMIC_POSTING_STOCK_MOVEMENT_REQUIRED');
 c=cmd();c.changes=c.changes.filter(x=>x.id!=='party71');
 expect(c,'ATOMIC_POSTING_CUSTOMER_BALANCE_REQUIRED');
});
test('rejects duplicate and inconsistent journal postings',()=>{
 let c=cmd();c.changes.push({...c.changes[1],id:'extra-journal',
  value:{...c.changes[1].value,id:'extra-journal'}});
 expect(c,'ATOMIC_POSTING_REVENUE_REQUIRED_ONCE');
 c=cmd();c.changes[1].value.lines[0].debit=12;
 c.changes[1].value.lines[1].credit=12;
 expect(c,'ATOMIC_POSTING_JOURNAL_TOTAL_MISMATCH');
});
test('rejects changed item references or stock quantity inflation',()=>{
 let c=cmd();c.changes[3].value.quantity=45;
 expect(c,'ATOMIC_POSTING_STOCK_QUANTITY_EXCEEDS_INVOICE');
 c=cmd();c.changes[3].value.referenceNumber='INV-0033';
 expect(c,'ATOMIC_POSTING_WRONG_STOCK_REFERENCE');
});
test('fingerprint preserves legacy command compatibility',()=>{
 const legacy=cmd();delete legacy.atomicInvoiceId;
 const old=crypto.createHash('sha256').update(JSON.stringify({workspaceId:legacy.workspaceId,changes:legacy.changes})).digest('hex');
 assert.equal(fingerprint(legacy),old);
 assert.notEqual(fingerprint(legacy),fingerprint(cmd()));
});
