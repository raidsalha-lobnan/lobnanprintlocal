import {durableWriteTransaction} from '../sync-next/durableWriteTransaction';
export type TaxInvoiceLine={item:string;qty:string;price:string;fontSize?:number};
export type TaxHandStyle='ruqaa'|'lemonada'|'katibeh'|'lateef'|'playpen'|'mikhak'|'marhey'|'ruwudu'|'rakkas'|'alkalami';
export type TaxHeaderFontKey='customer'|'address'|'date'|'note'|'total'|'vat'|'grand'|'words';
export type TaxPrintData={serial:string;date:string;customer:string;address:string;lines:TaxInvoiceLine[];vat:string;note:string;words:string;size:number;cancelEmpty:boolean;headerSizes:Partial<Record<TaxHeaderFontKey,number>>;style:TaxHandStyle;playpenWeight:number;contextual:boolean;alternate:'standard'|'ss01'|'ss02';applyStamp:boolean};
export type TaxPrintRecord={id:string;createdAt:string;updatedAt:string;data:TaxPrintData;stampData:string;totalCents:number;renderedPng:Blob;serial:string};
const DB='lobnan-tax-print-archive-v1',STORE='documents';
function req<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function done(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('ARCHIVE_ABORTED'));tx.onerror=()=>reject(tx.error||Error('ARCHIVE_WRITE_FAILED'));});}
async function open(){
 const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{const store=r.result.createObjectStore(STORE,{keyPath:'id'});store.createIndex('serial','serial',{unique:true});};
 return new Promise<IDBDatabase>((resolve,reject)=>{
  let settled=false;const timeout=setTimeout(()=>{settled=true;reject(Error('ARCHIVE_OPEN_TIMEOUT'));},5000);
  r.onsuccess=()=>{clearTimeout(timeout);if(settled){r.result.close();return;}settled=true;resolve(r.result);};
  r.onerror=()=>{clearTimeout(timeout);if(!settled){settled=true;reject(r.error);}};
  r.onblocked=()=>{clearTimeout(timeout);if(!settled){settled=true;reject(Error('ARCHIVE_BLOCKED'));}};
 });
}
/** Local print-only archive; no repository, ledger, inventory, party or server writes. */
export async function saveTaxPrintRecord(record:TaxPrintRecord,expectedUpdatedAt?:string){
 if(!record.id||record.serial!==record.data.serial||!/^\d{1,12}$/.test(record.serial)||!record.renderedPng.size)throw Error('INVALID_PRINT_RECORD');
 const db=await open();
 try{
  const tx=durableWriteTransaction(db,STORE),finished=done(tx);
  try{
   const store=tx.objectStore(STORE);
   const prior=await req(store.get(record.id)) as TaxPrintRecord|undefined;
   if(prior?.updatedAt!==expectedUpdatedAt)throw Error('ARCHIVE_RECORD_CHANGED');
   const duplicate=await req(store.index('serial').getKey(record.serial));
   if(duplicate!==undefined&&duplicate!==record.id)throw Error('ARCHIVE_SERIAL_EXISTS');
   store.put(record);
   await finished;
  }catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
 }finally{db.close();}
}
export type TaxPrintSummary=Omit<TaxPrintRecord,'renderedPng'|'stampData'|'data'>&{customer:string;date:string};
export async function listTaxPrintRecords():Promise<TaxPrintSummary[]>{
 const db=await open();try{
  const tx=db.transaction(STORE,'readonly'),finished=done(tx),out:TaxPrintSummary[]=[];
  await new Promise<void>((resolve,reject)=>{const cursor=tx.objectStore(STORE).openCursor();cursor.onerror=()=>reject(cursor.error);cursor.onsuccess=()=>{const c=cursor.result;if(!c){resolve();return;}const r=c.value as TaxPrintRecord;out.push({id:r.id,serial:r.serial,createdAt:r.createdAt,updatedAt:r.updatedAt,totalCents:r.totalCents,customer:r.data.customer,date:r.data.date});c.continue();};});
  await finished;return out.sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
 }finally{db.close();}
}
export async function readTaxPrintRecord(id:string):Promise<TaxPrintRecord|undefined>{
 const db=await open();try{const tx=db.transaction(STORE,'readonly');return await req(tx.objectStore(STORE).get(id));}finally{db.close();}
}
