import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {recordKey,type StoredRecord,type ServerCursor} from '../src/sync-next/types';

const cursor=(sequence:number):ServerCursor=>({
  sequence,eventId:'event-'+sequence,seconds:0,nanoseconds:0
});
const invoice=(n:number,version=1):StoredRecord=>{
  const id='invoice-'+n;
  return {key:recordKey('invoices',id),entity:'invoices',id,version,value:{
    id,invoiceNumber:'INV-'+String(n).padStart(5,'0'),totalAmount:n
  }};
};

test('local incremental invoice projection reads individual IDs without scanning 500 invoices',async()=>{
  const db=new LocalSyncDb('incremental-invoice-'+crypto.randomUUID());
  const rows=Array.from({length:500},(_,i)=>invoice(i+1));
  await db.initializeAuthoritativeSnapshot(rows,cursor(1));
  const notifications:Array<readonly {entity:string;id:string}[]|undefined>=[];
  const unsubscribe=db.subscribe((changed,keys)=>{
    if(changed)notifications.push(keys);
  });
  const nativeGetAll=IDBObjectStore.prototype.getAll;
  let recordStoreFullReads=0;
  (IDBObjectStore.prototype as any).getAll=function(this:IDBObjectStore,...args:unknown[]){
    if(this.name==='records'){
      recordStoreFullReads++;
      throw new Error('FULL_RECORD_STORE_SCAN_FOR_ONE_CHANGED_INVOICE');
    }
    return nativeGetAll.apply(this,args as Parameters<typeof nativeGetAll>);
  };
  try{
    await db.applyEvent({
      commandId:'remote-invoice-edit',
      changes:[{entity:'invoices',id:'invoice-410',version:2,
        value:{id:'invoice-410',invoiceNumber:'INV-00410',totalAmount:999}}],
      cursor:cursor(2)
    });
    assert.deepEqual(notifications.at(-1),[{entity:'invoices',id:'invoice-410'}]);
    // A targeted multi-collection query must NOT scan the 500 invoice rows.
    const nonInvoiceGroups=await db.listVisibleGrouped(['parties','inventory']);
    assert.equal(nonInvoiceGroups.parties.length,0);
    assert.equal(nonInvoiceGroups.inventory.length,0);
    const rowsById=await db.listVisibleByKeys([
      {entity:'invoices',id:'invoice-410'},
      {entity:'invoices',id:'invoice-1'}
    ]);
    assert.equal(rowsById[recordKey('invoices','invoice-410')]?.value?.totalAmount,999);
    assert.equal(rowsById[recordKey('invoices','invoice-1')]?.value?.totalAmount,1);
    const pending=await db.enqueue([{
      entity:'invoices',id:'invoice-410',
      value:{id:'invoice-410',invoiceNumber:'INV-00410',totalAmount:1200}
    }]);
    const draft=await db.listVisibleByKeys([{entity:'invoices',id:'invoice-410'}]);
    assert.equal(draft[recordKey('invoices','invoice-410')]?.pending,true);
    assert.equal(draft[recordKey('invoices','invoice-410')]?.value?.totalAmount,1200);
    assert.equal(pending.status,'pending');
    assert.equal(recordStoreFullReads,0);
  }finally{
    (IDBObjectStore.prototype as any).getAll=nativeGetAll;
    unsubscribe();
    await db.close();
  }
});
