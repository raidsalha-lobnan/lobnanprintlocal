import test from 'node:test';
import assert from 'node:assert/strict';
import {UnifiedRepository} from '../src/sync-next/repository';
import type {LocalSyncDb} from '../src/sync-next/localDb';
import type {SyncCoordinator} from '../src/sync-next/coordinator';

const cursor=(sequence:number)=>({sequence,seconds:0,nanoseconds:0,eventId:'event-'+sequence});
const invoice=(id:string)=>({key:'invoices\\u001f'+id,entity:'invoices',id,version:2,
 value:{id,invoiceNumber:'INV-0091',totalAmount:125}});

function fixture(records:any[],localSequence=12,remoteSequence=12){
 const repairs:unknown[][]=[];
 const local={
  cursor:async()=>cursor(localSequence),
  refreshAuthoritativeSnapshot:async(rows:unknown[],serverCursor:unknown,entities?:unknown)=>{
   repairs.push([rows,serverCursor,entities]);
   return rows.length;
  }
 };
 const remote={fetchAuthoritativeBootstrap:async()=>({
  records,cursor:cursor(remoteSequence)
 })};
 const repo=new UnifiedRepository(local as unknown as LocalSyncDb,
  {remote} as unknown as SyncCoordinator);
 return {repo,repairs};
}

test('temporarily missing invoices repair the local cache from PostgreSQL without publishing financial writes',async()=>{
 const f=fixture([invoice('invoice-91')]);
 assert.equal(await f.repo.verifyUnexpectedEmptyInvoiceProjection(),'recovered');
 assert.equal(f.repairs.length,1);
 assert.equal((f.repairs[0][0] as any[])[0].id,'invoice-91');
 assert.deepEqual(f.repairs[0][2],['invoices'],'invoice repair must never reconcile employee records');
});

test('an explicitly verified empty PostgreSQL invoice collection can clear the display',async()=>{
 const f=fixture([]);
 assert.equal(await f.repo.verifyUnexpectedEmptyInvoiceProjection(),'verified-empty');
 assert.equal(f.repairs.length,0);
});

test('stale PostgreSQL snapshot must not blank newer local invoices',async()=>{
 const f=fixture([],15,14);
 await assert.rejects(f.repo.verifyUnexpectedEmptyInvoiceProjection(),/STALE_AUTHORITATIVE_INVOICE_VERIFICATION/);
 assert.equal(f.repairs.length,0);
});

test('an invalid or unavailable PostgreSQL result cannot clear previously visible invoices',async()=>{
 const f=fixture([invoice('invoice-91')]);
 (f.repo.getCoordinator() as any).remote.fetchAuthoritativeBootstrap=async()=>({records:null,cursor:null});
 await assert.rejects(f.repo.verifyUnexpectedEmptyInvoiceProjection(),/INVALID_AUTHORITATIVE_INVOICE_VERIFICATION/);
 assert.equal(f.repairs.length,0);
 (f.repo.getCoordinator() as any).remote.fetchAuthoritativeBootstrap=async()=>{throw Error('NETWORK_OFFLINE')};
 await assert.rejects(f.repo.verifyUnexpectedEmptyInvoiceProjection(),/NETWORK_OFFLINE/);
 assert.equal(f.repairs.length,0);
});
