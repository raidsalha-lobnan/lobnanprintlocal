import test from 'node:test';
import assert from 'node:assert/strict';
import {UnifiedRepository} from '../src/sync-next/repository';

const invoice={id:'inv-pos-1793832765419-wi20k',invoiceNumber:'INV-0055',
  totalAmount:61,isAccountingPosted:true};
function fixture({records=[{entity:'invoices',id:invoice.id,version:2,value:invoice}],
  pending=[] as any[],remoteError=null as Error|null}={}){
  let reads=0;
  const local={
    listVisible:async()=>{throw Error('Do not rely on stale IndexedDB visible record');},
    pending:async()=>pending
  };
  const remote={
    fetchAuthoritativeBootstrap:async()=>{
      reads++;
      if(remoteError)throw remoteError;
      return {records,cursor:{seconds:0,nanoseconds:0,eventId:'head',sequence:1}};
    }
  };
  const sync={remote};
  const repo=new UnifiedRepository(local as any,sync as any);
  return {repo,reads:()=>reads};
}
test('posted INV-0055 finds the authoritative version even if IndexedDB has no row',async()=>{
 const {repo,reads}=fixture();
 const result=await repo.getAuthoritativeInvoiceBaseline(invoice.id);
 assert.equal(result.id,invoice.id);
 assert.equal(result.version,2);
 assert.equal(result.value?.totalAmount,61);
 assert.equal(result.pending,false);
 assert.equal(reads(),1);
});
test('an existing pending invoice edit blocks another modification',async()=>{
 const cmd={changes:[{entity:'invoices',id:invoice.id,value:invoice,expectedVersion:2}]};
 const {repo}=fixture({pending:[cmd]});
 await assert.rejects(repo.getAuthoritativeInvoiceBaseline(invoice.id),
   /INVOICE_HAS_PENDING_LOCAL_CHANGES_REVIEW_FIRST/);
});
test('authorization filters and missing invoices fail closed',async()=>{
 const {repo}=fixture({records:[]});
 await assert.rejects(repo.getAuthoritativeInvoiceBaseline(invoice.id),
   /INVOICE_NOT_VISIBLE_IN_POSTGRES_SNAPSHOT/);
});
test('never silently fall back to stale local row during a server outage',async()=>{
 const {repo}=fixture({remoteError:new Error('LOCAL_SYNC_HTTP_503')});
 await assert.rejects(repo.getAuthoritativeInvoiceBaseline(invoice.id),
   /LOCAL_SYNC_HTTP_503/);
});
test('duplicate server invoice identities are rejected, not chosen arbitrarily',async()=>{
 const row={entity:'invoices',id:invoice.id,version:2,value:invoice};
 const {repo}=fixture({records:[row,row]});
 await assert.rejects(repo.getAuthoritativeInvoiceBaseline(invoice.id),
   /INVOICE_NOT_VISIBLE_IN_POSTGRES_SNAPSHOT/);
});
