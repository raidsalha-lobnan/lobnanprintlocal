import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtomicInvoicePosting,enqueueAtomicInvoicePosting} from '../src/sync-next/accountingBundle';

const base=()=>{
 const id='invoice-uuid-fixed-71';
 return {
 invoiceId:id,commandId:'command-uuid-fixed-71',
 invoice:{entity:'invoices' as const,id,value:{id,invoiceNumber:'TEMP-'+id,isAccountingPosted:true,items:[{quantity:2,unitPrice:4,total:8}]}},
 journals:[{entity:'journalEntries' as const,id:'journal-revenue',value:{
  id:'journal-revenue',referenceId:id,referenceType:'pos_invoice',
  lines:[{accountCode:'1201',debit:8,credit:0},{accountCode:'4101',debit:0,credit:8}]
 }}],
 stockMovements:[{entity:'stockMovements' as const,id:'stock-out',value:{
  id:'stock-out',invoiceId:id,quantity:2,type:'out_sale'}}],
 partyChanges:[{entity:'parties' as const,id:'customer',value:{id:'customer',balance:8}}],
 inventoryChanges:[{entity:'inventory' as const,id:'sku',value:{id:'sku',stockQuantity:98}}]
 };
};

test('invoice, journals, inventory, stock and party use one durable command id',async()=>{
 const p=base();let calls=0,seen:any;
 const repo={commit:async(changes:any,commandId?:string)=>{
  calls++;seen={changes,commandId};return 'local-command-id';
 }};
 const receipt=await enqueueAtomicInvoicePosting(repo,p);
 assert.equal(receipt,'local-command-id');
 assert.equal(calls,1);
 assert.equal(seen.commandId,p.commandId);
 assert.deepEqual(seen.changes.map((c:any)=>c.entity),
 ['invoices','journalEntries','stockMovements','parties','inventory']);
});

test('fails closed before queuing missing sale journal and wrong cross-reference',async()=>{
 const bad=base();
 bad.journals=[];
 assert.throws(()=>buildAtomicInvoicePosting(bad),/REVENUE_JOURNAL_REQUIRED/);
 const badRef=base();
 badRef.journals[0].value.referenceId='other';
 assert.throws(()=>buildAtomicInvoicePosting(badRef),/JOURNAL_REFERENCE_MISMATCH/);
 const badStock=base();badStock.stockMovements[0].value.invoiceId='other';
 assert.throws(()=>buildAtomicInvoicePosting(badStock),/STOCK_REFERENCE_MISMATCH/);
});
