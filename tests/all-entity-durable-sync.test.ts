import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import 'fake-indexeddb/auto';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator} from '../src/sync-next/coordinator';
import {SYNC_ENTITY_LABELS,summarizeEntityQueue} from '../src/sync-next/entityCoverage';
import type {EntityName,SyncCommand,ProposedChange} from '../src/sync-next/types';

const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const matchNames=(part:string)=>[...part.matchAll(/'([A-Za-z]+)'/g)].map(m=>m[1]).sort();
const expected=Object.keys(SYNC_ENTITY_LABELS).sort();

test('every one of the 28 business entity types has a synchronized local, server and UI route',()=>{
  assert.equal(expected.length,28);
  const typeSource=read('src/sync-next/types.ts')
    .split('export type EntityName =')[1].split('export type JsonValue')[0];
  const serverSource=read('local-server/sync-domain.mjs')
    .split('export const ENTITIES = new Set([')[1].split(']);')[0];
  const bootSource=read('src/sync-next/boot.ts')
    .split('const supported=new Set<string>([')[1].split(']);')[0];
  const repositorySource=read('src/sync-next/repository.ts')
    .split('const supported: EntityName[] = [')[1].split('];')[0];
  for(const [layer,s] of [
    ['type union',typeSource],['PostgreSQL validator',serverSource],
    ['local repository writer',bootSource],['local unified projection',repositorySource]
  ] as const){
    assert.deepEqual(matchNames(s),expected,'Entity mismatch in '+layer);
  }
  assert.ok(expected.includes('purchases'));
  assert.ok(expected.includes('purchaseReturns'));
  assert.ok(expected.includes('salesReturns'));
  assert.ok(expected.includes('vouchers'));
  assert.ok(expected.includes('expenses'));
  assert.ok(expected.includes('journalEntries'));
  assert.ok(expected.includes('dailyEntrySheets'));
});

test('all 28 entity changes survive closing/reopening the local database until the server ACK',async()=>{
  const workspace='all-entities-'+crypto.randomUUID();
  const namespace='all-entities-durable-'+crypto.randomUUID();
  const first=new LocalSyncDb(workspace,namespace);
  const changes:ProposedChange[]=expected.map((e,i)=>({
    entity:e as EntityName,
    id:'local-'+e+'-'+i,
    value:{id:'local-'+e+'-'+i,label:'persisted-'+e}
  }));
  const command=await first.enqueue(changes);
  assert.equal(command.changes.length,28);
  await first.close();

  const second=new LocalSyncDb(workspace,namespace);
  const pending=await second.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].id,command.id);
  assert.equal(pending[0].status,'pending');
  assert.deepEqual(new Set(pending[0].changes.map(c=>c.entity)),new Set(expected));
  // ACK is the only legitimate automatic removal from the active outbox.
  await second.ack(command.id,pending[0].changes.map(c=>({...c,version:1})));
  assert.equal((await second.pending()).length,0);
  const visible=await second.listVisibleGrouped(expected as EntityName[]);
  for(const entity of expected) {
    assert.equal(visible[entity].length,1,'After ACK: '+entity);
    assert.equal((visible[entity][0].value as any)?.label,'persisted-'+entity);
  }
  await second.close();
});

test('a multi-entity financial command remains one operation with separate per-section statuses',()=>{
  const base={id:'one-atomic-bundle',workspaceId:'lobnan_main',
    createdAt:0,attempts:0,retryAt:0,status:'pending'} as const;
  const cmds=[
    {...base,changes:[
      {entity:'invoices',id:'inv-x',expectedVersion:0,value:{id:'inv-x'}},
      {entity:'journalEntries',id:'j-x',expectedVersion:0,value:{id:'j-x'}},
      {entity:'inventory',id:'stock-x',expectedVersion:1,value:{id:'stock-x'}}
    ]},
    {...base,id:'second',status:'conflict',changes:[
      {entity:'parties',id:'customer-x',expectedVersion:1,value:{id:'customer-x'}}
    ]},
    {...base,id:'third',status:'rejected',changes:[
      {entity:'expenses',id:'exp-x',expectedVersion:0,value:{id:'exp-x'}}
    ]}
  ] as SyncCommand[];
  const summary=summarizeEntityQueue(cmds);
  const byId=Object.fromEntries(summary.map(row=>[row.entity,row]));
  assert.equal(byId.invoices.pending,1);
  assert.equal(byId.journalEntries.pending,1);
  assert.equal(byId.inventory.pending,1);
  assert.equal(byId.parties.conflict,1);
  assert.equal(byId.expenses.rejected,1);
  assert.equal(summary.length,5);
});

test('all local repository save/delete paths and direct entity deltas report local durability',()=>{
  const bridge=read('src/services/localRepositoryWrites.ts');
  const context=read('src/context/AccountingContext.tsx');
  const app=read('src/App.tsx');
  assert.match(bridge,/accounting_save_started/);
  assert.match(bridge,/accounting_local_saved/);
  assert.match(bridge,/accounting_save_error/);
  assert.match(bridge,/await registeredWriter/);
  assert.match(context,/const writeId='write-'\+crypto\.randomUUID\(\)/);
  assert.match(context,/accounting_save_started/);
  assert.match(context,/accounting_local_saved/);
  assert.match(context,/accounting_save_error/);
  assert.match(app,/localWriteCount>0/);
  assert.match(app,/syncCoordinatorState\.pending>0/);
  assert.match(app,/syncCoordinatorState\.conflict>0/);
});
test('the incremental sync coordinator does not claim PostgreSQL approval after a pass error',()=>{
  const coordinator=read('src/sync-next/coordinator.ts');
  assert.match(coordinator,/this\.report\(\{ running: true, lastError: null \}\)/);
  assert.match(coordinator,/this\.state\.pending === 0 && this\.state\.conflict === 0 && !this\.state\.lastError/);
  assert.match(coordinator,/await this\.local\.ack\(/);
});

test('critical master-data and financial create flows refuse optimistic saves before local database readiness',()=>{
  const context=read('src/context/AccountingContext.tsx');
  for(const name of [
    'addInventoryItem','addParty','createPurchaseInvoice',
    'createPurchaseReturn','createSalesReturn','createPaymentVoucher',
    'addExpense','deleteExpense'
  ]){
    const at=context.indexOf('const '+name+' =');
    assert.ok(at>=0,name+' handler must exist');
    const start=context.slice(at,at+1100);
    assert.ok(start.includes("if(!unifiedRepoRef.current)throw new Error('LOCAL_REPOSITORY_NOT_INITIALIZED:"),
      name+' must fail closed before its first React-state update');
  }
});
test('in-flight local writes prevent build reload and trigger a close-warning where browsers support it',()=>{
  const app=read('src/App.tsx');
  const navbar=read('src/components/Navbar.tsx');
  assert.match(app,/const mayApplyBuildUpdate = !hasUnsyncedChanges && localWriteCount===0/);
  assert.match(app,/outstandingLocalWrites\.current\.size===0/);
  assert.match(app,/window\.addEventListener\('beforeunload',warnUnconfirmedLocalSave\)/);
  assert.match(navbar,/syncCoordinatorState\?\.pending/);
  assert.match(navbar,/syncCoordinatorState\?\.conflict/);
  assert.match(navbar,/syncCoordinatorState\?\.archived/);
});

test('after reopening offline, the same durable 28-entity command is pushed exactly once and PostgreSQL ACK clears the outbox',async()=>{
  const workspace='e2e-reopen-'+crypto.randomUUID();
  const namespace='all-entities-reopen-'+crypto.randomUUID();
  const first=new LocalSyncDb(workspace,namespace);
  const changes:ProposedChange[]=expected.map((e,i)=>({
    entity:e as EntityName,id:'local-sync-'+e+'-'+i,
    value:{id:'local-sync-'+e+'-'+i,note:'offline-'+e}
  }));
  const saved=await first.enqueue(changes);
  await first.close();

  const restored=new LocalSyncDb(workspace,namespace);
  const receipts:string[]=[];
  const transport={
    push:async(command:SyncCommand)=>{
      receipts.push(command.id);
      return {commandId:command.id,
        changes:command.changes.map(c=>({...c,version:1}))};
    },
    pull:async()=>[],
    watchLatest:()=>()=>{}
  };
  const coordinator=new SyncCoordinator(restored,transport as any,workspace);
  try{
    await coordinator.start();
    const confirmed=await coordinator.syncNow(10_000);
    assert.equal(confirmed.pending,0);
    assert.equal(confirmed.conflict,0);
    assert.equal(receipts.length,1);
    assert.equal(receipts[0],saved.id);
    assert.equal((await restored.pending()).length,0);
    const all=await restored.listVisibleGrouped(expected as EntityName[]);
    for(const entity of expected)assert.equal(all[entity].length,1,entity);
  }finally{
    coordinator.stop();
    await restored.close();
  }
});
