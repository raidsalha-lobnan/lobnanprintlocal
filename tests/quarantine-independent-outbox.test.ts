import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planBlockedCommandQuarantine} from '../src/sync-next/blockedQueueQuarantine';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator,type SyncTransport} from '../src/sync-next/coordinator';
import type {SyncCommand,ServerCursor} from '../src/sync-next/types';

const cursor:ServerCursor={sequence:1,eventId:'initial',seconds:0,nanoseconds:0};
const command=(id:string,status:SyncCommand['status'],entity:'inventory'|'invoices'|'parties',
  row:string,changes?:SyncCommand['changes']):SyncCommand=>({
 id,workspaceId:'lobnan_main',createdAt:1794470000000+Number(id.match(/\d+/)?.[0]||1),
 attempts:1,retryAt:0,status,error:status==='rejected'?'ENTITY_SERIAL_ALREADY_USED':'',
 changes:changes||[{entity,id:row,expectedVersion:0,value:{id:row,name:'Private item',balance:50}}]
});
test('selectively quarantine failed commands and ALL dependent pending operations but NOT healthy ones',()=>{
 const oldInvoice=command('old1','rejected','invoices','inv-bad');
 const badItem=command('bad2','rejected','inventory','item-bad');
 const dependent=command('pending3','pending','inventory','item-bad');
 const multi=command('pending4','pending','inventory','item-other',[
   {entity:'inventory',id:'item-bad',expectedVersion:1,value:{id:'item-bad'}},
   {entity:'inventory',id:'item-other',expectedVersion:0,value:{id:'item-other'}}
 ]);
 const transitive=command('pending5','pending','inventory','item-other');
 const independent=command('good6','pending','parties','party-healthy');
 const p=planBlockedCommandQuarantine([independent,oldInvoice,badItem,dependent,multi,transitive]);
 assert.deepEqual(new Set(p.quarantinedIds),new Set(['old1','bad2','pending3','pending4','pending5']));
 assert.equal(p.counts.quarantined,5);
 assert.equal(p.counts.rejected,2);
 assert.equal(p.counts.dependentPending,3);
 assert.equal(p.counts.healthyPending,1);
 assert.equal(p.healthy[0].id,'good6');
});
test('original full command payload, finance status and cursor are retained in a transactional local archive',async()=>{
 const db=new LocalSyncDb('quarantine-test-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot([],cursor);
 try{
  const failed=await db.enqueue([{entity:'inventory',id:'new-item',value:{
    id:'new-item',name:'Private local new item',code:'PRI-0015',
    stockQuantity:13,purchasePrice:15
  }}]);
  await db.enqueue([{entity:'inventory',id:'new-item',value:{
    id:'new-item',name:'Private local new item updated',code:'PRI-0015',
    stockQuantity:13,purchasePrice:20
  }}]);
  await db.markError(failed.id,'rejected','ENTITY_SERIAL_ALREADY_USED');
  const oldInvoice=await db.enqueue([{entity:'invoices',id:'old-invoice',value:{
    id:'old-invoice',invoiceNumber:'INV-0069',totalAmount:40
  }}]);
  await db.markError(oldInvoice.id,'rejected','ENTITY_PERMISSION_DENIED');
  const good=await db.enqueue([{entity:'parties',id:'fresh-party',value:{
    id:'fresh-party',name:'New independent party',code:'CUST-0081'
  }}]);
  const before=await db.pending();
  const cursorBefore=await db.cursor();
  const archived=await db.quarantineBlockedAfterBackup(before);
  assert.equal(archived.counts.quarantined,3);
  assert.equal(archived.counts.healthyPending,1);
  assert.deepEqual(await db.cursor(),cursorBefore);
  const active=await db.pending();
  assert.deepEqual(active.map(x=>x.id),[good.id]);
  const archives=await db.listQuarantinedArchives();
  assert.equal(archives.length,1);
  assert.equal(archives[0].counts.quarantined,3);
  const exported=await db.exportQuarantinedArchive(archived.archiveId);
  assert.equal(exported.originalCommands.length,3);
  assert.ok(JSON.stringify(exported).includes('Private local new item updated'));
  assert.ok(JSON.stringify(exported).includes('INV-0069'));
  assert.ok(!exported.originalCommands.some(x=>x.id===good.id));
  assert.ok((await db.listVisibleGrouped(['invoices'])).invoices.length===0,
   'old rejected invoice must never be promoted as authoritative');
  const independentNew=await db.enqueue([{entity:'parties',id:'second-fresh-party',value:{
    id:'second-fresh-party',name:'Unrelated new party',code:'CUST-0082'
  }}]);
  assert.ok((await db.pending()).some(x=>x.id===independentNew.id));
 } finally {await db.close();}
});
test('archive refuses stale private backup and preserves all active operations atomically',async()=>{
 const db=new LocalSyncDb('quarantine-stale-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot([],cursor);
 try{
  const original=await db.enqueue([{entity:'inventory',id:'missing',value:{
   id:'missing',name:'Pending item',code:'PRI-0022'}}]);
  await db.markError(original.id,'rejected','ENTITY_SERIAL_ALREADY_USED');
  const oldSnapshot=await db.pending();
  await db.markError(original.id,'conflict','VERSION_CONFLICT inventory/missing');
  await assert.rejects(()=>db.quarantineBlockedAfterBackup(oldSnapshot),
    /LOCAL_OUTBOX_CHANGED_SINCE_PRIVATE_BACKUP/);
  assert.equal((await db.pending()).length,1);
  assert.equal((await db.listQuarantinedArchives()).length,0);
 } finally {await db.close();}
});
test('transient failure of record A does not stop sending unrelated record B',async()=>{
 const db=new LocalSyncDb('forward-transport-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot([],cursor);
 let sentA=0,sentB=0;
 const remote:SyncTransport={
  async push(cmd){
   const change=cmd.changes[0];
   if(change.id==='bad-network'){sentA++;throw Error('NETWORK_TEMPORARY');}
   sentB++;
   return {commandId:cmd.id,changes:[{...change,version:1}]};
  },
  async pull(){return []},
  watchLatest(){return ()=>{}}
 };
 const coordinator=new SyncCoordinator(db,remote,'lobnan_main');
 try{
  await db.enqueue([{entity:'parties',id:'bad-network',value:{
   id:'bad-network',name:'Network error',code:'CUST-0100'}}]);
  await db.enqueue([{entity:'parties',id:'healthy',value:{
   id:'healthy',name:'Good record',code:'CUST-0101'}}]);
  await coordinator.start();
  await coordinator.waitUntilIdle();
  const pending=await db.pending();
  assert.equal(sentA,1);
  assert.equal(sentB,1);
  assert.equal(pending.length,1);
  assert.equal(pending[0].changes[0].id,'bad-network');
 }finally{coordinator.stop();await db.close();}
});
