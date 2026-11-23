import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import 'fake-indexeddb/auto';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {recordKey,type StoredRecord} from '../src/sync-next/types';

const boot=readFileSync(new URL('../src/sync-next/boot.ts',import.meta.url),'utf8');
const localSource=readFileSync(new URL('../src/sync-next/localDb.ts',import.meta.url),'utf8');

test('existing authorized offline cache becomes writable before any remote directory refresh',()=>{
 const start=boot.indexOf('const verifiedCachedActor=');
 const verifyGate=boot.indexOf('if(secureLoginEnabled() && !verifiedCachedActor)',start);
 const coordinator=boot.indexOf('await coordinator.start()',verifyGate);
 const asyncRefresh=boot.indexOf('void syncDirectory().catch(',coordinator);
 assert.ok(start>=0&&verifyGate>start&&coordinator>verifyGate&&asyncRefresh>coordinator,
  'after validating the SAME actor, the cashier must start from IDB without awaiting network directory');
 assert.match(boot,/await local\.canOpenVerifiedOfflineCache\(actorId\)/);
 assert.match(boot,/if\(secureLoginEnabled\(\) && !verifiedCachedActor\)\{[\s\S]*?await syncDirectory\(\)/);
 assert.match(boot,/if\(status==='empty'\)[\s\S]*?await remote\.fetchAuthoritativeBootstrap\(\)/);
 assert.equal(boot.split('await remote.fetchAuthoritativeBootstrap()').length-1,1);
});

test('offline actor proof is atomically saved with the server-confirmed user directory',()=>{
 const start=localSource.indexOf('async refreshAuthorizedDirectory(');
 const end=localSource.indexOf('async seedFromCloud(',start);
 assert.ok(start>0&&end>start);
 const body=localSource.slice(start,end);
 assert.match(body,/db\.transaction\(\[RECORDS,OUTBOX,META\],'readwrite'\)/);
 assert.match(body,/tx\.objectStore\(META\)\.put\(\{key:VERIFIED_OFFLINE_ACTOR_KEY/);
 assert.match(body,/await done/);
 assert.match(body,/POSTGRES_DIRECTORY_MISSING_CURRENT_ACTOR/);
 assert.match(localSource,/legacyIdentity\?\.value\?\.actorId===actorId/);
 assert.match(localSource,/actorId!==getCurrentSessionActorId\(\)/);
});

test('an offline POS invoice queues durably in IndexedDB with the original identity across a browser restart',async()=>{
 const workspace='verified-cashier-'+crypto.randomUUID();
 const namespace='verified-pos-offline-'+crypto.randomUUID();
 const row:StoredRecord={
  key:recordKey('inventory','item-1'),entity:'inventory',id:'item-1',
  version:1,value:{id:'item-1',code:'PRI-00001',name:'صنف معتمد',stockQuantity:50}
 };
 const first=new LocalSyncDb(workspace,namespace);
 await first.initializeAuthoritativeSnapshot([row],{
  sequence:1,eventId:'bootstrap',seconds:0,nanoseconds:0
 });
 assert.equal(await first.bootstrapStatus(),'initialized');
 const stableCommandId=crypto.randomUUID();
 await first.enqueue([{
  entity:'invoices',id:'inv-pos-offline-001',
  value:{id:'inv-pos-offline-001',invoiceNumber:'TEMP-inv-pos-offline-001',
   totalAmount:93,items:[{itemId:'item-1',quantity:1,unitPrice:93}]}
 }],stableCommandId);
 await first.close();
 const reopened=new LocalSyncDb(workspace,namespace);
 try{
  assert.equal(await reopened.bootstrapStatus(),'initialized');
  assert.equal((await reopened.cursor())?.sequence,1,'offline save does not invent server progress');
  const pending=await reopened.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].id,stableCommandId,'never allocate a new invoice command when reconnecting');
  assert.equal(pending[0].status,'pending');
  assert.equal(pending[0].changes[0].entity,'invoices');
  assert.equal((pending[0].changes[0].value as any).totalAmount,93);
 }finally{await reopened.close()}
});
