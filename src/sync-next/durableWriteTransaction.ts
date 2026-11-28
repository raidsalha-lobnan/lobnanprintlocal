/** Request disk-flushed IndexedDB commits where supported. Never retry quota or write failures. */
export function durableWriteTransaction(db:IDBDatabase,stores:string|string[]):IDBTransaction{
  try{return db.transaction(stores,'readwrite',{durability:'strict'});}
  catch(error){
    if(!(error instanceof TypeError))throw error;
    return db.transaction(stores,'readwrite');
  }
}
