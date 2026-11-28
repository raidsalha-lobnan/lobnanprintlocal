import {durableWriteTransaction} from './durableWriteTransaction';
/**
 * Durable POS save-attempt identity store for Chrome/Edge.
 *
 * localStorage has a small (often ~5 MiB) per-origin limit and must never
 * prevent financial commands from reaching the durable IndexedDB outbox.
 * This small database keeps the immutable invoice/command IDs and signature.
 *
 * Do not clear historical localStorage keys on migration: another tab running
 * the previous build may still be using the original attempt.
 */
const DATABASE_NAME = 'lobnan-pos-attempt-identity-v1';
const STORE = 'attempts';

export type PosAttemptIdentity = {
  invoiceId: string;
  commandId: string;
  createdAt: string;
  signature: string;
};

type NativeAttemptBridge={
 sqliteLocalStorage?:boolean;
 readPosAttempt:(key:string)=>Promise<PosAttemptIdentity|null>;
 savePosAttempt:(key:string,value:PosAttemptIdentity)=>Promise<boolean>;
 deletePosAttempt:(key:string)=>Promise<boolean>;
};
function nativeBridge():NativeAttemptBridge|null{
 const api=(globalThis as unknown as {electronAPI?:NativeAttemptBridge}).electronAPI;
 return api?.sqliteLocalStorage && typeof api.readPosAttempt==='function' &&
  typeof api.savePosAttempt==='function' && typeof api.deletePosAttempt==='function'
   ?api:null;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DATABASE_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, {keyPath:'key'});
        }
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          databasePromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error || new Error('POS_ATTEMPT_IDB_OPEN_FAILED'));
      req.onblocked = () => console.warn('POS_ATTEMPT_IDB_UPGRADE_BLOCKED');
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve,reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('POS_ATTEMPT_IDB_ABORTED'));
    tx.onerror = () => reject(tx.error || new Error('POS_ATTEMPT_IDB_FAILED'));
  });
}

function checkKey(key:string):void {
  if (!key.startsWith('lobnan_pending_atomic_pos_attempt')) {
    throw new Error('INVALID_POS_ATTEMPT_KEY');
  }
}

async function indexedAttempt(key:string): Promise<PosAttemptIdentity|null> {
  const db=await database();
  const tx=db.transaction(STORE,'readonly');
  const done=committed(tx);
  const item=await new Promise<{key:string;value:PosAttemptIdentity}|undefined>((resolve,reject)=>{
    const req=tx.objectStore(STORE).get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error || new Error('POS_ATTEMPT_IDB_READ_FAILED'));
  });
  await done;
  return item?.value || null;
}

export async function readPosAttempt(key:string): Promise<PosAttemptIdentity|null> {
  checkKey(key);
  const native=nativeBridge();
  if(native)return native.readPosAttempt(key);
  const saved=await indexedAttempt(key);
  if(saved) return saved;

  // Recover older, not-yet-queued attempts without overwriting their IDs.
  // This READ is safe even when the old localStorage quota is exhausted.
  let old:PosAttemptIdentity|null=null;
  try {
    const raw=localStorage.getItem(key);
    old=raw?JSON.parse(raw) as PosAttemptIdentity:null;
  } catch {}
  if (old) await writePosAttempt(key,old);
  return old;
}

export async function writePosAttempt(key:string,value:PosAttemptIdentity):Promise<void> {
  checkKey(key);
  const native=nativeBridge();
  if(native){
    if(await native.savePosAttempt(key,value)!==true)throw Error('DESKTOP_POS_ATTEMPT_NOT_DURABLE');
    return;
  }
  const db=await database();
  const tx=durableWriteTransaction(db,STORE);
  const done=committed(tx);
  tx.objectStore(STORE).put({key,value});
  // Only report local persistence after IndexedDB's transaction completes.
  await done;
}

export async function removePosAttempt(key:string):Promise<void> {
  checkKey(key);
  const native=nativeBridge();
  if(native){
    if(await native.deletePosAttempt(key)!==true)throw Error('DESKTOP_POS_ATTEMPT_REMOVE_UNCONFIRMED');
    return;
  }
  const db=await database();
  const tx=durableWriteTransaction(db,STORE);
  const done=committed(tx);
  tx.objectStore(STORE).delete(key);
  await done;
  // Best effort legacy cleanup; never require localStorage writes.
  try {localStorage.removeItem(key);}catch{}
}
