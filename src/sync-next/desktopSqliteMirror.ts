/**
 * Installed Windows only.
 *
 * Existing browser tabs and Chrome/Edge PWA sessions continue using IndexedDB
 * exactly as before. Desktop IndexedDB itself resides on the pinned data disk.
 *
 * For every committed desktop IDB transaction, a complete durable snapshot of
 * its touched stores is mirrored into the pinned SQLite database before the
 * accounting operation reports local-save success. The mirror is a recovery
 * copy; it never silently overwrites a live non-empty outbox.
 */
const STORES=['records','outbox','meta','receipts'] as const;
type StoreName=typeof STORES[number];
type NativeBridge={
 sqliteLocalStorage?:boolean;
 readStores:(name:string)=>Promise<Partial<Record<StoreName,unknown[]>>>;
 writeStores:(name:string,rows:Partial<Record<StoreName,unknown[]>>)=>Promise<boolean>;
};
function native():NativeBridge|null{
 const bridge=(globalThis as unknown as {electronAPI?:NativeBridge}).electronAPI;
 return bridge?.sqliteLocalStorage&&typeof bridge.readStores==='function'&&
  typeof bridge.writeStores==='function'?bridge:null;
}
function request<T>(r:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error);
 });
}
function completed(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(tx.error||Error('DESKTOP_IDB_ABORTED'));
  tx.onerror=()=>reject(tx.error||Error('DESKTOP_IDB_FAILED'));
 });
}
async function snapshot(db:IDBDatabase,names:readonly string[]){
 const tx=db.transaction([...names],'readonly');
 const done=completed(tx);
 const list=await Promise.all(names.map(async name=>
  [name,await request(tx.objectStore(name).getAll())] as const));
 await done;
 return Object.fromEntries(list) as Record<StoreName,unknown[]>;
}
const queue=new Map<string,Promise<void>>();
export async function mirrorCompletedTransaction(tx:IDBTransaction):Promise<void>{
 const api=native();
 if(!api||tx.mode!=='readwrite')return;
 const names=Array.from(tx.objectStoreNames)
  .filter(name=>STORES.includes(name as StoreName));
 if(!names.length)return;
 const name=tx.db.name,db=tx.db;
 const previous=queue.get(name)||Promise.resolve();
 // Serialize mirrors in the order their IDB transactions completed.
 const next=previous.catch(()=>{}).then(async()=>{
  const rows=await snapshot(db,names);
  if(await api.writeStores(name,rows)!==true)
   throw Error('DESKTOP_SQLITE_MIRROR_NOT_DURABLE');
 });
 queue.set(name,next);
 try{await next;}finally{if(queue.get(name)===next)queue.delete(name);}
}
export async function hydrateFromPinnedSqlite(db:IDBDatabase):Promise<void>{
 const api=native();
 if(!api)return;
 const local=await snapshot(db,STORES);
 const count=STORES.reduce((sum,key)=>sum+(local[key]?.length||0),0);
 const saved=await api.readStores(db.name);
 const nativePresent=STORES.some(key=>Array.isArray(saved?.[key]));
 if(!nativePresent){
  if(count>0&&await api.writeStores(db.name,local)!==true)
   throw Error('DESKTOP_SQLITE_INITIAL_MIRROR_FAILED');
  return;
 }
 if(count===0){
  if(!Array.isArray(saved?.meta))
   throw Error('DESKTOP_SQLITE_INCOMPLETE_SNAPSHOT_REVIEW_REQUIRED');
  const tx=db.transaction([...STORES],'readwrite');
  const done=completed(tx);
  try{
   for(const key of STORES)
    for(const row of saved[key]||[])tx.objectStore(key).put(row);
   await done;
  }catch(error){
   try{tx.abort();}catch{}
   await done.catch(()=>{});
   throw error;
  }
  return;
 }
 // Fail closed if SQLite holds a pending financial operation that the live
 // IDB store does not contain, unless that operation is acknowledged.
 const localOutbox=new Set((local.outbox||[]).map(x=>(x as {id?:string})?.id));
 const receipts=new Set((local.receipts||[]).map(x=>(x as {id?:string})?.id));
 const nativePending=(saved.outbox||[]) as Array<{id?:string}>;
 if(nativePending.some(x=>x.id&&!localOutbox.has(x.id)&&!receipts.has(x.id)))
  throw Error('DESKTOP_SQLITE_PENDING_OUTBOX_RECONCILIATION_REQUIRED');
 const known=new Set(nativePending.map(x=>x.id));
 const outboxMismatch=localOutbox.size!==nativePending.length||
  [...localOutbox].some(id=>!known.has(id));
 const patch=STORES.filter(key=>!Array.isArray(saved[key])||
  (key==='outbox'&&outboxMismatch));
 if(patch.length&&await api.writeStores(db.name,
  Object.fromEntries(patch.map(key=>[key,local[key]])) as Record<StoreName,unknown[]>)!==true)
  throw Error('DESKTOP_SQLITE_REPAIR_NOT_DURABLE');
}
export function hasDesktopSqlite():boolean{return Boolean(native());}
