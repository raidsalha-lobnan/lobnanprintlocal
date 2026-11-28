import {durableWriteTransaction} from '../sync-next/durableWriteTransaction';
import {heldSnapshotsMatch,mergeHeldRecovery} from './heldPosInvoices';

type Held={id:string;localOnly?:boolean};
const DB='lobnan-local-held-pos-v1', STORE='owner-cache';
function request<T>(req:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('HELD_CACHE_REQUEST_FAILED'));});
}
function done(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('HELD_CACHE_ABORTED'));tx.onerror=()=>reject(tx.error||Error('HELD_CACHE_WRITE_FAILED'));});
}
function assertKey(key:string){
 if(!/^pos_(?:mobile_)?held_private_cache_v1_.+/.test(key)||key.endsWith('_none'))throw Error('HELD_CACHE_OWNER_REQUIRED');
}
async function change<T extends Held>(key:string,update:(rows:T[])=>T[]):Promise<T[]>{
 assertKey(key);
 const open=indexedDB.open(DB,1);
 open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains(STORE))open.result.createObjectStore(STORE);};
 const db=await request(open);
 try{
  const tx=durableWriteTransaction(db,STORE), committed=done(tx);
  try{
   const store=tx.objectStore(STORE);
   let rows=await request(store.get(key)) as T[]|undefined;
   if(rows===undefined){
    // One-time migration. Never prefer a stale LocalStorage copy to a committed IDB snapshot.
    try{const old=JSON.parse(localStorage.getItem(key)||'[]');rows=Array.isArray(old)?old:[];}catch{rows=[];}
   }
   if(!Array.isArray(rows))throw Error('HELD_CACHE_INVALID');
   const next=update(rows);
   store.put(next,key);
   await committed;
   // Compatibility only. Failure here cannot invalidate the durable checkpoint.
   try{localStorage.setItem(key,JSON.stringify(next));}catch{}
   return next;
  }catch(error){try{tx.abort();}catch{}await committed.catch(()=>{});throw error;}
 }finally{db.close();}
}
export function readLocalHeldCache<T extends Held>(key:string){return change<T>(key,rows=>rows);}
export function checkpointLocalHeld<T extends Held>(key:string,held:T){
 if(!held.id||held.localOnly!==true)throw Error('HELD_CACHE_PENDING_REQUIRED');
 return change<T>(key,rows=>[held,...rows.filter(row=>row.id!==held.id)]);
}
export function reconcileLocalHeld<T extends Held>(key:string,remote:T[]){
 // Re-read the latest pending versions inside the same transaction; never overwrite
 // a concurrent local-only hold with an older server response.
 return change<T>(key,rows=>mergeHeldRecovery(remote,rows));
}
export function confirmLocalHeld<T extends Held>(key:string,pending:T,confirmed:T){
 return change<T>(key,rows=>{
  const current=rows.find(row=>row.id===pending.id);
  if(current&&!heldSnapshotsMatch(current,pending))return rows;
  return [confirmed,...rows.filter(row=>row.id!==pending.id)];
 });
}
export function removeLocalHeld<T extends Held>(key:string,id:string){
 return change<T>(key,rows=>rows.filter(row=>row.id!==id));
}
export function isHeldTransportUnavailable(error:unknown){
 return (typeof navigator!=='undefined'&&navigator.onLine===false)||error instanceof TypeError||
  /LOCAL_SYNC_HTTP_TIMEOUT|LOCAL_HELD_OFFLINE|HELD_INVOICE_HTTP_(?:502|503|504)|FAILED TO FETCH|NETWORKERROR/i.test(String(error));
}
