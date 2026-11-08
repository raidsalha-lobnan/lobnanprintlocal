import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator,type SyncTransport} from '../src/sync-next/coordinator';
import {VersionConflict,type SyncCommand,type StoredRecord,type ServerCursor} from '../src/sync-next/types';

const cursor=(n:number):ServerCursor=>({sequence:n,seconds:0,nanoseconds:0,eventId:String(n)});
const row=(value:Record<string,any>,version=1):StoredRecord=>({
 key:'parties\u001fp1',entity:'parties',id:'p1',version,value
});
class AuthoritativeServer implements SyncTransport {
  record:StoredRecord;
  pushes=0;
  constructor(record:StoredRecord){this.record=record;}
  async push(cmd:SyncCommand){
    this.pushes++;
    const change=cmd.changes[0];
    if(change.expectedVersion!==this.record.version)
      throw new VersionConflict(change.entity,change.id,change.expectedVersion,this.record.version);
    this.record={...this.record,value:change.value,version:this.record.version+1};
    return {commandId:cmd.id,changes:[{entity:'parties' as const,id:'p1',version:this.record.version,value:change.value}]};
  }
  async pull(){return [];}
  async fetchAuthoritativeBootstrap(){return {records:[this.record],cursor:cursor(this.record.version)};}
  watchLatest(){return ()=>{};}
}
async function newClient(id:string,base:StoredRecord){
 const local=new LocalSyncDb(id);
 await local.initializeAuthoritativeSnapshot([base],cursor(base.version));
 return local;
}
test('two-device edit collision automatically merges disjoint contact changes but preserves server balance',async()=>{
 const base={id:'p1',name:'Original',phone:'111',notes:'Initial',balance:100};
 const remote=new AuthoritativeServer(row({...base,notes:'Remote note',balance:300},2));
 const local=await newClient('conflict_disjoint_'+crypto.randomUUID(),row(base));
 await local.enqueue([{entity:'parties',id:'p1',value:{...base,phone:'222'}}]);
 const coordinator=new SyncCoordinator(local,remote,'unit');
 try{
  await coordinator.start();await coordinator.waitUntilIdle();
  const result=await coordinator.syncNow();
  assert.equal(result.pending,0);
  assert.equal(remote.record.version,3);
  assert.equal(remote.record.value?.balance,300);
  assert.equal(remote.record.value?.notes,'Remote note');
  assert.equal(remote.record.value?.phone,'222');
  assert.equal((await local.pending()).length,0);
  assert.equal(remote.pushes,2,'First stale attempt is rejected; only safe rebased update succeeds');
 }finally{coordinator.stop();await local.close();}
});
test('same-field contact conflict remains in durable queue, never last-write-wins',async()=>{
 const base={id:'p1',name:'Original',phone:'111',balance:100};
 const remote=new AuthoritativeServer(row({...base,phone:'333'},2));
 const local=await newClient('conflict_same_field_'+crypto.randomUUID(),row(base));
 await local.enqueue([{entity:'parties',id:'p1',value:{...base,phone:'222'}}]);
 const coordinator=new SyncCoordinator(local,remote,'unit');
 try{
  await coordinator.start();await coordinator.waitUntilIdle();
  const pending=await local.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].status,'conflict');
  assert.equal(remote.record.value?.phone,'333');
 }finally{coordinator.stop();await local.close();}
});
test('outdated monetary balance update is never automatically rebased',async()=>{
 const base={id:'p1',phone:'111',balance:100};
 const remote=new AuthoritativeServer(row({...base,balance:200},2));
 const local=await newClient('conflict_financial_'+crypto.randomUUID(),row(base));
 await local.enqueue([{entity:'parties',id:'p1',value:{...base,balance:105}}]);
 const coordinator=new SyncCoordinator(local,remote,'unit');
 try{
  await coordinator.start();await coordinator.waitUntilIdle();
  const pending=await local.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].status,'conflict');
  assert.equal(remote.record.value?.balance,200);
 }finally{coordinator.stop();await local.close();}
});
test('duplicate confirmed change reconciles automatically without submitting a second write',async()=>{
 const base={id:'p1',phone:'111',balance:100};
 const desired={...base,phone:'222'};
 const remote=new AuthoritativeServer(row(desired,2));
 const local=await newClient('conflict_identical_'+crypto.randomUUID(),row(base));
 const c=await local.enqueue([{entity:'parties',id:'p1',value:desired}]);
 await local.markError(c.id,'conflict','VERSION_CONFLICT');
 const coordinator=new SyncCoordinator(local,remote,'unit');
 try{
  await coordinator.start();await coordinator.waitUntilIdle();
  assert.equal((await local.pending()).length,0);
  assert.equal(remote.pushes,0);
  assert.equal((await local.listVisible('parties'))[0].value?.phone,'222');
 }finally{coordinator.stop();await local.close();}
});
