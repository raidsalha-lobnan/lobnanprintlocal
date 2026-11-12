import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator,type SyncTransport} from '../src/sync-next/coordinator';
import {isVerifiedRejectedBulkBystander,rejectedBulkBystanderKey} from '../src/sync-next/rejectedBulkBystanders';
import {recordKey,type StoredRecord,type SyncCommand,type ServerCursor,type ServerEvent} from '../src/sync-next/types';

const cursor=(seq:number):ServerCursor=>({sequence:seq,eventId:'test-'+seq,seconds:0,nanoseconds:0});
function partyRecords() {
  return Array.from({length:11},(_,i)=>{
    const id='pt-'+String(i+1).padStart(2,'0');
    return {key:recordKey('parties',id),entity:'parties',id,version:7,
      value:{id,code:'CUST-'+String(i+1).padStart(4,'0'),name:'Same name '+i,balance:i*10}} as StoredRecord;
  });
}
async function rejectedBulk(db:LocalSyncDb,records:StoredRecord[]) {
  const cmd=await db.enqueue(records.map(row=>({
    entity:'parties' as const,id:row.id,value:row.value!
  })));
  await db.markError(cmd.id,'rejected','BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION');
  return (await db.pending()).find(x=>x.id===cmd.id)!;
}
class MiniPostgres implements SyncTransport{
  pushes=0;
  records:StoredRecord[];
  events:ServerEvent[]=[];
  constructor(records:StoredRecord[]){this.records=records;}
  async fetchAuthoritativeBootstrap(){return {records:this.records,cursor:cursor(this.events.length)};}
  async push(command:SyncCommand){
    assert.equal(command.changes.length,1);
    const c=command.changes[0];
    const old=this.records.find(row=>row.id===c.id && row.entity===c.entity)!;
    assert.equal(c.expectedVersion,old.version);
    const val={...old,version:old.version+1,value:c.value};
    this.records=this.records.map(row=>row===old?val:row);
    const changes=[{entity:c.entity,id:c.id,version:val.version,value:c.value}];
    this.pushes++;
    this.events.push({commandId:command.id,changes,cursor:cursor(this.events.length+1)});
    return {commandId:command.id,changes};
  }
  async pull(_cursor:ServerCursor|null,_size?:number){return [];}
  watchLatest(){return ()=>{};}
}
test('rejected bulk no-op is preserved while a new independent customer rename can sync',async()=>{
 const records=partyRecords();
 const db=new LocalSyncDb('bulk-noop-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot(records,cursor(0));
 const original=await rejectedBulk(db,records);
 const newName={...records[4].value!,name:'Edited one character'};
 await assert.rejects(()=>db.enqueue([{entity:'parties',id:records[4].id,value:newName}]),/RECORD_HAS_UNRESOLVED_CONFLICT/);
 const server=new MiniPostgres(records.map((r,i)=>i===0
   ? {...r,version:8,value:{...r.value!,name:'Independent remote correction'}} : r));
 const coord=new SyncCoordinator(db,server,'unit');
 try{
  await coord.start();await coord.waitUntilIdle();
  const proof=await db.confirmedBystanderKeys(original);
  assert.equal(proof.size,10);
  assert.ok(proof.has(recordKey('parties',records[4].id)));
  const command=await db.enqueue([{entity:'parties',id:records[4].id,value:newName}]);
  coord.requestSync();
  await coord.waitUntilIdle();
  assert.equal(server.pushes,1,'only the new rename can be pushed');
  assert.equal(server.records[4].value?.name,'Edited one character');
  const pending=await db.pending();
  assert.equal(pending.length,1,'the historical rejected bulk command is not discarded');
  assert.equal(pending[0].id,original.id);
  assert.equal(pending[0].status,'rejected');
  assert.ok(!pending.some(x=>x.id===command.id),'new edit is acknowledged');
 }finally{coord.stop();await db.close();}
});
test('a rejected bulk entry that differs from PostgreSQL cannot bypass its rejected operation',async()=>{
 const records=partyRecords();
 const db=new LocalSyncDb('bulk-different-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot(records,cursor(0));
 const command=await db.enqueue(records.map(row=>({
   entity:'parties' as const,id:row.id,value:row.id===records[4].id
     ? {...row.value!,name:'Uncommitted changed name'} : row.value!
 })));
 await db.markError(command.id,'rejected','BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION');
 const older=(await db.pending())[0];
 try{
  const verified=await db.recordVerifiedRejectedBulkBystanders([older],records);
  assert.equal(verified,10);
  assert.equal((await db.confirmedBystanderKeys(older)).has(recordKey('parties',records[4].id)),false);
  await assert.rejects(()=>db.enqueue([{
    entity:'parties',id:records[4].id,value:{...records[4].value!,name:'Second name'}
  }]),/RECORD_HAS_UNRESOLVED_CONFLICT/);
  assert.equal((await db.pending()).length,1);
 }finally{await db.close();}
});
test('a permission failure or financial bulk rejection is never given a bypass receipt',async()=>{
 const records=partyRecords();
 const cmd:SyncCommand={id:'test-command-example',workspaceId:'w',createdAt:1,attempts:1,
   retryAt:0,status:'rejected',error:'ENTITY_PERMISSION_DENIED',
   changes:records.map(r=>({entity:'parties' as const,id:r.id,
     value:r.value,expectedVersion:7}))};
 assert.equal(isVerifiedRejectedBulkBystander(cmd,records[0].id,records[0]),false);
 assert.ok(!rejectedBulkBystanderKey(cmd.id,records[0].id).includes('password'));
});
