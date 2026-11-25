import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateFromPinnedSqlite,mirrorCompletedTransaction} from '../src/sync-next/desktopSqliteMirror';

const names=['records','outbox','meta','receipts'];
function opened(name:string):Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(name,1);
  r.onupgradeneeded=()=>{
   for(const key of names)
    r.result.createObjectStore(key,{keyPath:key==='records'?'key':key==='meta'?'key':'id'});
  };
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error);
 });
}
function completed(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error);
 });
}
async function remove(name:string){
 await new Promise<void>((resolve,reject)=>{
  const r=indexedDB.deleteDatabase(name);
  r.onsuccess=()=>resolve();
  r.onerror=()=>reject(r.error);
 });
}
test('desktop mirrors an atomic invoice outbox and recovers an emptied profile',async()=>{
 const saved=new Map<string,Record<string,unknown[]>>();
 (globalThis as any).electronAPI={
  sqliteLocalStorage:true,
  readStores:async(name:string)=>saved.get(name)||{},
  writeStores:async(name:string,patch:Record<string,unknown[]>)=>{
   saved.set(name,{...(saved.get(name)||{}),...structuredClone(patch)});
   return true;
  }
 };
 const name='lobnan-offline-v1-test-'+crypto.randomUUID();
 const db=await opened(name);
 try{
  await hydrateFromPinnedSqlite(db);
  const tx=db.transaction(['outbox','meta'],'readwrite');
  tx.objectStore('outbox').put({id:'cmd-safe',changes:[{entity:'invoices',id:'inv-safe'}]});
  tx.objectStore('meta').put({key:'serverCursor',value:1});
  await completed(tx);
  await mirrorCompletedTransaction(tx);
  assert.equal((saved.get(name)?.outbox?.[0] as any)?.id,'cmd-safe');
  db.close();await remove(name);
  const restored=await opened(name);
  try{
   await hydrateFromPinnedSqlite(restored);
   const read=restored.transaction('outbox','readonly').objectStore('outbox').get('cmd-safe');
   const record=await new Promise<any>((resolve,reject)=>{
    read.onsuccess=()=>resolve(read.result);
    read.onerror=()=>reject(read.error);
   });
   assert.equal(record.id,'cmd-safe');
  }finally{restored.close();}
 }finally{
  try{db.close();}catch{}
  await remove(name);
  delete (globalThis as any).electronAPI;
 }
});
test('normal Chrome IndexedDB path never calls native SQLite methods',async()=>{
 delete (globalThis as any).electronAPI;
 const name='lobnan-offline-v1-test-'+crypto.randomUUID();
 const db=await opened(name);
 try{
  await hydrateFromPinnedSqlite(db);
  const tx=db.transaction('meta','readwrite');
  tx.objectStore('meta').put({key:'test',value:1});
  await completed(tx);
  await mirrorCompletedTransaction(tx);
  assert.ok(true);
 }finally{db.close();await remove(name);}
});
