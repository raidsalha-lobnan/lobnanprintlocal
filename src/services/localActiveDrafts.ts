import {durableWriteTransaction} from '../sync-next/durableWriteTransaction';
type DraftRow={key:string;raw:string|null;at:number};
const DB='lobnan-active-pos-drafts-v1',STORE='drafts';
const prefix=/^(?:pos_active_full_draft|mobile_pos_active_draft):[^:]+:.+$/;
const rows=new Map<string,DraftRow>();
const pending=new Map<string,Promise<void>>();
const failures=new Map<string,unknown>();
function req<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function done(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('DRAFT_ABORTED'));tx.onerror=()=>reject(tx.error||Error('DRAFT_WRITE_FAILED'));});}
async function open(){
 const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'key'});};
 return req(r);
}
function legacy(key:string):DraftRow|undefined{
 try{
  const raw=localStorage.getItem(key);
  const at=Number(localStorage.getItem('lobnan-draft-revision:'+key)||0);
  let oldAt=0;try{oldAt=Number(JSON.parse(raw||'{}')?.timestamp)||0;}catch{}
  if(raw===null&&!at)return undefined;
  return {key,raw,at:Math.max(at,oldAt)};
 }catch{return undefined;}
}
function current(key:string){
 const disk=rows.get(key),old=legacy(key);
 return old&&(!disk||old.at>disk.at)?old:disk;
}
async function commit(row:DraftRow){
 const db=await open();
 try{
  const tx=durableWriteTransaction(db,STORE),finished=done(tx);
  try{
   const store=tx.objectStore(STORE);
   const previous=await req(store.get(row.key)) as DraftRow|undefined;
   // Do not overwrite a more recent checkpoint from another tab.
   if(!previous||previous.at<=row.at)store.put(row);
   await finished;
  }catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
 }finally{db.close();}
}
function notify(){if(typeof window!=='undefined')window.dispatchEvent(new Event('lobnan-draft-storage-state'));}
function write(key:string,raw:string|null){
 if(!prefix.test(key))throw Error('DRAFT_OWNER_SCOPE_REQUIRED');
 const row={key,raw,at:Math.max(Date.now(),(current(key)?.at||0)+1)};
 rows.set(key,row);
 // Synchronous compatibility checkpoint protects edits until the strict IDB commit.
 try{
  if(raw===null)localStorage.removeItem(key);else localStorage.setItem(key,raw);
  localStorage.setItem('lobnan-draft-revision:'+key,String(row.at));
 }catch(error){console.warn('Draft compatibility checkpoint unavailable',error);}
 const previous=pending.get(key)||Promise.resolve();
 const next=previous.catch(()=>{}).then(()=>commit(row));
 pending.set(key,next);notify();
 void next.then(()=>{if(pending.get(key)===next){pending.delete(key);failures.delete(key);notify();}},
 error=>{if(pending.get(key)===next){pending.delete(key);failures.set(key,error);notify();}});
}
function keys(){
 const result=new Set(rows.keys());
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&prefix.test(k))result.add(k);}}catch{}
 return [...result].filter(k=>current(k)?.raw!=null);
}
/** Owner-scoped draft storage only: no accounting records, outbox or authentication. */
export const activeDraftStorage={
 get length(){return keys().length;},key:(i:number)=>keys()[i]??null,
 getItem:(key:string)=>current(key)?.raw??null,
 setItem:(key:string,raw:string)=>write(key,raw),
 removeItem:(key:string)=>write(key,null)
};
export async function flushActiveDraft(key:string):Promise<void>{
 while(pending.has(key))await pending.get(key);
 if(failures.has(key))throw failures.get(key);
}
export function activeDraftNeedsAttention(key?:string){
 return key?pending.has(key)||failures.has(key):pending.size>0||failures.size>0;
}
export function activeDraftFailed(key?:string){return key?failures.has(key):failures.size>0;}
/** Restore before React state initializers run. Never migrate or erase another account's data. */
export async function initializeActiveDrafts(){
 const db=await open();
 try{
  const tx=db.transaction(STORE,'readonly'),finished=done(tx);
  const saved=await req(tx.objectStore(STORE).getAll()) as DraftRow[];
  await finished;
  for(const row of saved)if(prefix.test(row.key)&&!rows.has(row.key))rows.set(row.key,row);
 }finally{db.close();}
}
export function mobileDraftRecovery(owner:string,activeKey:string){
 const start='mobile_pos_active_draft:'+owner+':';
 return keys().filter(k=>owner&&k!==activeKey&&k.startsWith(start)).flatMap(key=>{
  const raw=activeDraftStorage.getItem(key);
  if(!raw)return [];
  try{
   const d=JSON.parse(raw);
   if(!Array.isArray(d.cart)||(!d.cart.length&&!String(d.invoiceNotes||'').trim()))return [];
   return [{key,raw,at:Number(d.timestamp)||0,customer:String(d.customerNameInput||'فاتورة')}];
  }catch{return [];}
 }).sort((a,b)=>b.at-a.at).slice(0,3);
}
