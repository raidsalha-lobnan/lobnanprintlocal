import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {recordKey,type StoredRecord} from '../src/sync-next/types';

function verifiedSession(actor:string){
  (globalThis as any).sessionStorage={
    getItem:(key:string)=>key==='lobnan_postgres_session_actor_id'?actor:null,
    setItem:()=>{},removeItem:()=>{}
  };
}
const row=(entity:'users'|'roles'|'invoices'|'parties',id:string,rest:Record<string,unknown>={}):StoredRecord=>({
  key:recordKey(entity,id),entity,id,version:1,value:{id,...rest} as any
});
function request<T>(r:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
}
function done(tx:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
}
async function deleteBootstrapMarker(dbName:string,mutate?:(store:IDBObjectStore)=>void){
  const database=await request(indexedDB.open(dbName));
  const tx=database.transaction('meta','readwrite');
  const completed=done(tx);
  tx.objectStore('meta').delete('authoritativeBootstrap');
  mutate?.(tx.objectStore('meta'));
  await completed;
  database.close();
}
async function setup(){
  const workspace='verified-repair-'+crypto.randomUUID();
  const namespace='test-bootstrap-'+crypto.randomUUID();
  const dbName=namespace+'-'+workspace;
  verifiedSession('usr-1');
  const db=new LocalSyncDb(workspace,namespace);
  const cursor={sequence:17,eventId:'sql-confirmed',seconds:0,nanoseconds:0};
  await db.initializeAuthoritativeSnapshot([
    row('users','usr-1',{fullName:'Original owner'}),
    row('roles','admin',{code:'ADMIN'}),
    row('invoices','inv-confirmed',{invoiceNumber:'INV-001',totalAmount:93}),
    row('parties','customer-confirmed',{code:'CUST-001'})
  ],cursor);
  // SQL-authenticated directory success persists a second, independent
  // actor proof. The original bootstrap persisted the roster actor.
  await db.refreshAuthorizedDirectory([
    row('users','usr-1',{fullName:'Original owner'}),
    row('roles','admin',{code:'ADMIN'})
  ],'usr-1');
  const cmd=await db.enqueue([{
    entity:'invoices',id:'inv-offline',
    value:{id:'inv-offline',invoiceNumber:'TEMP-inv-offline',totalAmount:35}
  }]);
  await deleteBootstrapMarker(dbName);
  return {db,dbName,cmd,cursor};
}

test('actual historical case: two SQL identity proofs + cursor repair missing flag without touching pending sales, customer or cursor',async()=>{
  const {db,cmd,cursor}=await setup();
  try{
    assert.equal(await db.bootstrapStatus(),'existing-data');
    const before=await db.pending();
    assert.equal(before.length,1);
    assert.equal(await db.repairVerifiedBootstrapMetadata('usr-1'),true);
    assert.equal(await db.bootstrapStatus(),'initialized');
    assert.deepEqual(await db.cursor(),cursor);
    assert.deepEqual(await db.pending(),before);
    assert.equal((await db.listVisible('invoices')).length,2);
    assert.equal((await db.listVisible('parties')).length,1);
    assert.equal((await db.pending())[0].id,cmd.id);
    assert.equal(await db.repairVerifiedBootstrapMetadata('usr-1'),false,'idempotent');
  }finally{await db.close()}
});

test('another actor cannot turn old user financial records into verified offline cache',async()=>{
  const {db,dbName}=await setup();
  try{
    await deleteBootstrapMarker(dbName,store=>
      store.put({key:'verifiedOfflineActorV1',value:{actorId:'usr-2'}}));
    assert.equal(await db.repairVerifiedBootstrapMetadata('usr-1'),false);
    assert.equal(await db.bootstrapStatus(),'existing-data');
    assert.equal((await db.pending()).length,1);
  }finally{await db.close()}
});

test('missing SQL event cursor is not repaired from records or offline drafts alone',async()=>{
  const {db,dbName}=await setup();
  try{
    await deleteBootstrapMarker(dbName,store=>store.delete('serverCursor'));
    assert.equal(await db.repairVerifiedBootstrapMetadata('usr-1'),false);
    assert.equal(await db.bootstrapStatus(),'existing-data');
    assert.equal((await db.pending()).length,1);
  }finally{await db.close()}
});
