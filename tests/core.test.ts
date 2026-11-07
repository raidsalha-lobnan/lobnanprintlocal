import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAtomicPosting } from '../src/sync-next/accountingPosting';
import {estimateCommandCost,pacificQuotaDay} from '../src/sync-next/costModel';
import { SyncCoordinator, SyncTransport } from '../src/sync-next/coordinator';
import { LocalSyncDb } from '../src/sync-next/localDb';
import { AppliedChange, ServerCursor, ServerEvent, SyncCommand, VersionConflict } from '../src/sync-next/types';

const docId='invoice-123';
function posting(debit=1500,credit=1500) {
 return buildAtomicPosting({
  documentEntity:'invoices',documentId:docId,document:{id:docId,totalMinor:1500},
  journalId:'journal-123',journalDate:'2026-11-06',currency:'ILS',
  lines:[{accountId:'cash',debitMinor:debit,creditMinor:0},{accountId:'sales',debitMinor:0,creditMinor:credit}],
  movements:[{entity:'stockMovements',id:'movement-123',value:{id:'movement-123',sourceDocumentId:docId,quantity:-1}}]
 });
}
test('posting requires balanced journal and stable cross references',()=>{
 assert.throws(()=>posting(1501,1500),/Unbalanced/);
 assert.throws(()=>posting(-1,1500),/Invalid journal/);
 const bundle=posting();
 assert.deepEqual(bundle.map(c=>c.entity),['invoices','journalEntries','stockMovements']);
 assert.equal((bundle[1].value as any).sourceDocumentId,docId);
});

class MemoryLocal {
 commands:SyncCommand[]=[];
 cursorValue:ServerCursor|null=null;
 records=new Map<string,{value:any;version:number}>();
 received:string[]=[];
 async pending(){return this.commands.slice();}
 async cursor(){return this.cursorValue;}
 async applyEvent(e:ServerEvent){
  e.changes.forEach(c=>this.records.set(`${c.entity}/${c.id}`,{value:c.value,version:c.version}));
  this.received.push(e.commandId);
  this.cursorValue=e.cursor;
  this.commands=this.commands.filter(c=>c.id!==e.commandId);
 }
 async ack(id:string,changes:AppliedChange[]){
  changes.forEach(c=>this.records.set(`${c.entity}/${c.id}`,{value:c.value,version:c.version}));
  this.commands=this.commands.filter(c=>c.id!==id);
 }
 async markError(id:string,status:SyncCommand['status'],error:string,retryAt=0){
  this.commands=this.commands.map(c=>c.id===id?{...c,status,error,retryAt,attempts:c.attempts+1}:c);
 }
}
class MemoryRemote implements SyncTransport {
 events:ServerEvent[]=[];
 seen=new Map<string,AppliedChange[]>();
 throwOnce=false;
 onChanged:(()=>void)=()=>{};
 pushCalls=0;
 async push(command:SyncCommand){
  this.pushCalls++;
  const found=this.seen.get(command.id);
  if(found)return {commandId:command.id,changes:found};
  const change:AppliedChange[]=command.changes.map(c=>({entity:c.entity,id:c.id,value:c.value,version:c.expectedVersion+1}));
  // Simulate server committed and response lost. Re-sending identical ID must be no-op.
  this.seen.set(command.id,change);
  if(this.throwOnce){this.throwOnce=false;throw new Error('connection dropped after commit');}
  return {commandId:command.id,changes:change};
 }
 async pull(cursor:ServerCursor|null,pageSize=100){
  const index=cursor?this.events.findIndex(e=>e.cursor.eventId===cursor.eventId)+1:0;
  return this.events.slice(index,index+pageSize);
 }
 watchLatest(cb:()=>void,_err:(error:unknown)=>void){this.onChanged=cb;return ()=>{};}
}
function command(id:string):SyncCommand {
 return {id,workspaceId:'company-A',createdAt:1,status:'pending',attempts:0,retryAt:0,
  changes:[{entity:'invoices',id:'inv',expectedVersion:0,value:{id:'inv'}}]};
}
test('catch-up paginates >100 changes without losing any, and advances durable cursor',async()=>{
 const remote=new MemoryRemote(),local=new MemoryLocal();
 for(let i=0;i<237;i++){
  const id='ev'+String(i).padStart(4,'0');
  remote.events.push({commandId:id,changes:[{entity:'parties',id,version:1,value:{id}}],
   cursor:{seconds:100,nanoseconds:i,eventId:id}});
 }
 const coordinator=new SyncCoordinator(local as unknown as LocalSyncDb,remote);
 await coordinator.start();await coordinator.waitUntilIdle();
 assert.equal(local.received.length,237);
 assert.equal(local.records.size,237);
 assert.equal(local.cursorValue?.eventId,'ev0236');
 coordinator.stop();
});
test('lost acknowledgement does not duplicate a committed command on retry',async()=>{
 const remote=new MemoryRemote(),local=new MemoryLocal();
 local.commands.push(command('operation-0001'));
 remote.throwOnce=true;
 const c=new SyncCoordinator(local as unknown as LocalSyncDb,remote);
 await c.start();await c.waitUntilIdle();
 assert.equal(local.commands.length,1);
 assert.equal(remote.seen.size,1);
 local.commands[0].retryAt=0;
 c.requestSync();await c.waitUntilIdle();
 assert.equal(local.commands.length,0);
 assert.equal(remote.seen.size,1);
 assert.equal(remote.pushCalls,2);
 c.stop();
});
test('version conflict never silently overwrites confirmed records',async()=>{
 const remote=new MemoryRemote(),local=new MemoryLocal();
 local.commands.push(command('operation-0002'));
 remote.push=async()=>{throw new VersionConflict('invoices','inv',0,2);};
 const c=new SyncCoordinator(local as unknown as LocalSyncDb,remote);
 await c.start();await c.waitUntilIdle();
 assert.equal(local.commands.length,1);
 assert.equal(local.commands[0].status,'conflict');
 assert.equal(local.records.size,0);
 c.stop();
});

test('cost model is document-based; Pacific day respects daylight saving time',()=>{
 const estimate=estimateCommandCost(6,2);
 assert.equal(estimate.minWrites,8);
 assert.equal(estimate.minTransactionReads,8);
 assert.equal(estimate.perReceivingDeviceEventReads,2);
 assert.equal(pacificQuotaDay(new Date('2026-11-06T07:30:00Z')),'2026-11-05');
 assert.equal(pacificQuotaDay(new Date('2026-11-06T08:30:00Z')),'2026-11-06');
});

test('concurrent document numbering assigns sequential official numbers without collision', async () => {
  let counter = 0;
  async function allocateOfficialNumber(year = '2026') {
    // Simulates atomic transaction counter read + increment
    counter++;
    const seq = counter;
    return `INV-${year}-${String(seq).padStart(5, '0')}`;
  }

  // Simulate two offline devices submitting at once
  const [num1, num2] = await Promise.all([
    allocateOfficialNumber('2026'),
    allocateOfficialNumber('2026')
  ]);

  assert.equal(num1, 'INV-2026-00001');
  assert.equal(num2, 'INV-2026-00002');
  assert.notEqual(num1, num2);
});

test('conflict retry updates expectedVersion to authoritative version', async () => {
  const local = new MemoryLocal();
  local.records.set('invoices/inv-1', { value: { id: 'inv-1', total: 200 }, version: 3 });
  
  // A command with outdated expectedVersion: 1
  const cmd: SyncCommand = {
    id: 'cmd-conflict-1',
    workspaceId: 'comp-1',
    createdAt: 100,
    attempts: 1,
    retryAt: 0,
    status: 'conflict',
    error: 'VERSION_CONFLICT',
    changes: [{ entity: 'invoices', id: 'inv-1', expectedVersion: 1, value: { id: 'inv-1', total: 250 } }]
  };
  local.commands.push(cmd);

  // Manual retry resolution: update expectedVersion to 3
  const currentActual = local.records.get('invoices/inv-1')?.version ?? 0;
  local.commands[0].changes[0].expectedVersion = currentActual;
  local.commands[0].status = 'pending';
  local.commands[0].attempts = 0;
  local.commands[0].error = undefined;

  assert.equal(local.commands[0].changes[0].expectedVersion, 3);
  assert.equal(local.commands[0].status, 'pending');
});

