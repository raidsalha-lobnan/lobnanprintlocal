/**
 * PostgreSQL + IndexedDB durable record operations.
 *
 * This module contains NO third-party cloud SDK, remote client, or alternate
 * database. The active writer is registered by createUnifiedDataLayer and
 * enqueues a durable IndexedDB command; the coordinator alone sends it to
 * authenticated PostgreSQL and records its server acknowledgement.
 */
type LocalOperation='set'|'delete';
export type LocalRecordRef=Readonly<{path:string;id:string}>;
type LocalWriter=(
  operation:LocalOperation,ref:LocalRecordRef,payload?:unknown,
  options?:{merge?:boolean}
)=>Promise<boolean>;

let registeredWriter:LocalWriter|null=null;
export function registerLocalRepositoryWriter(writer:LocalWriter):()=>void{
  registeredWriter=writer;
  return ()=>{if(registeredWriter===writer)registeredWriter=null;};
}

export function localRecordRef(entity:unknown,id:unknown):LocalRecordRef{
  if(!entity||!id)throw new Error('LOCAL_RECORD_REFERENCE_REQUIRED');
  return {path:String(entity)+'/'+String(id),id:String(id)};
}

export function localCollectionRef(entity:string):{path:string}{
  return {path:String(entity)};
}

// Historical mass-read and batch flows have deliberately NOT been bridged:
// supporting them as automatic collection rewrites would risk invoices,
// salaries, and queued offline commands. Convert each operation explicitly
// into an audited PostgreSQL transaction before enabling it.
export function readDisabledCollection(_ref:unknown):Promise<any>{
  return Promise.reject(new Error('READ_REQUIRES_CANONICAL_POSTGRES_REPOSITORY'));
}
export function disabledUnsafeBatch():any{
  throw new Error('BATCH_REQUIRES_ATOMIC_POSTGRES_COMMAND');
}

function dispatchSaveEvent(eventName:string,entity:string,writeId:string,error?:unknown){
  if(typeof window==='undefined')return;
  try{
    window.dispatchEvent(new CustomEvent(eventName,{
      detail:{entity,writeId,...(error?{error:String(error)}:{})}
    }));
  }catch{/* Event delivery cannot change an IndexedDB commit outcome. */}
}
async function persist(
  operation:LocalOperation,reference:LocalRecordRef,payload?:unknown,
  options?:{merge?:boolean}
):Promise<void>{
  const entity=String(reference?.path||'').split('/')[0]||'unknown';
  const writeId='local-write-'+crypto.randomUUID();
  dispatchSaveEvent('accounting_save_started',entity,writeId);
  try{
    if(!registeredWriter)throw new Error('DURABLE_REPOSITORY_NOT_INITIALIZED');
    const persisted=await registeredWriter(operation,reference,payload,options);
    if(!persisted)throw new Error('ENTITY_NOT_SUPPORTED_BY_DURABLE_REPOSITORY');
    dispatchSaveEvent('accounting_local_saved',entity,writeId);
  }catch(error){
    dispatchSaveEvent('accounting_save_error',entity,writeId,error);
    throw error;
  }
}
export function persistLocalRecord(
  reference:LocalRecordRef,payload:unknown,options?:{merge?:boolean}
):Promise<void>{
  return persist('set',reference,payload,options);
}
export function removeLocalRecord(reference:LocalRecordRef):Promise<void>{
  return persist('delete',reference);
}
