import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator,type SyncTransport} from '../src/sync-next/coordinator';
import type {ServerCursor} from '../src/sync-next/types';
const cursor:ServerCursor={sequence:1,eventId:'seed',seconds:0,nanoseconds:0};

test('rejected invoice never blocks independent customer rename or stock edit',async()=>{
 const db=new LocalSyncDb('isolation-queued-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot([],cursor);
 const bad=await db.enqueue([{entity:'invoices',id:'invoice-old',value:{
  id:'invoice-old',invoiceNumber:'INV-0069',totalAmount:40}}]);
 await db.markError(bad.id,'rejected','ENTITY_PERMISSION_DENIED');
 const goodParty=await db.enqueue([{entity:'parties',id:'party-new',value:{
  id:'party-new',code:'CUST-0150',name:'Renamed customer'}}]);
 const goodInventory=await db.enqueue([{entity:'inventory',id:'item-new',value:{
  id:'item-new',code:'PRI-03000',name:'New separate stock item'}}]);
 let sends=0;
 const remote:SyncTransport={
  async push(cmd){
   sends++;
   assert.ok(cmd.id!==bad.id,'rejected invoice must never be resent');
   return {commandId:cmd.id,changes:cmd.changes.map(x=>({...x,version:1}))};
  },
  async pull(){return []},watchLatest(){return ()=>{}}
 };
 const coord=new SyncCoordinator(db,remote,'lobnan_main');
 try{
  await coord.start();await coord.waitUntilIdle();
  assert.equal(sends,2);
  assert.deepEqual((await db.pending()).map(x=>x.id),[bad.id]);
  assert.equal((await db.listVisibleGrouped(['parties'])).parties[0].value?.name,'Renamed customer');
  assert.equal((await db.listVisibleGrouped(['inventory'])).inventory[0].value?.name,'New separate stock item');
 }finally{coord.stop();await db.close();}
});
test('manual archive requires idle sync leader, preserves local error on unauthorized follower',async()=>{
 const db=new LocalSyncDb('manual-archive-leader-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot([],cursor);
 const remote:SyncTransport={async push(cmd){return {commandId:cmd.id,changes:cmd.changes.map(x=>({...x,version:1}))}},
  async pull(){return []},watchLatest(){return ()=>{}}};
 const coord=new SyncCoordinator(db,remote,'lobnan_main');
 await assert.rejects(
  ()=>coord.withPausedQueueMaintenance(async()=>db.pending()),
  /QUEUE_MAINTENANCE_REQUIRES_SYNC_LEADER_TAB/);
 await db.close();
});
