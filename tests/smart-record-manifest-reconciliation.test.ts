import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {recordKey,type StoredRecord,type RecordVersion,type ServerCursor} from '../src/sync-next/types';

const cursor=(sequence:number):ServerCursor=>({sequence,seconds:0,nanoseconds:0,eventId:String(sequence)});
const employee=(id:string,version=1):StoredRecord=>({
  entity:'employees',id,key:recordKey('employees',id),version,
  value:{id,code:id,name:'موظف '+id}
});
const invoice=(i:number):StoredRecord=>{
  const id='invoice-'+i;
  return {entity:'invoices',id,key:recordKey('invoices',id),version:1,
    value:{id,invoiceNumber:'INV-'+i,totalAmount:i}};
};
const manifest=(rows:StoredRecord[]):RecordVersion[]=>rows.filter(r=>r.value!==null)
  .map(r=>({entity:r.entity,id:r.id,version:r.version}));

test('smart sync restores the absent eighth employee even after its original event cursor was consumed',async()=>{
  const db=new LocalSyncDb('staff-manifest-'+crypto.randomUUID());
  const central=Array.from({length:8},(_,i)=>employee('emp-'+(i+1)));
  const local=[...central.slice(0,7),...Array.from({length:1000},(_,i)=>invoice(i+1))];
  await db.initializeAuthoritativeSnapshot(local,cursor(999));
  try{
    const original=(await db.cursor())?.sequence;
    const differences=await db.missingServerVersions(manifest(central));
    assert.deepEqual(differences.map(r=>r.id),['emp-8']);
    assert.equal(await db.adoptAuthoritativeRecords([central[7]]),1);
    assert.equal((await db.listVisibleGrouped(['employees'])).employees.length,8);
    assert.equal((await db.cursor())?.sequence,original,'the event cursor must not be forged');
    assert.equal((await db.listVisibleGrouped(['invoices'])).invoices.length,1000);
  }finally{await db.close();}
});

test('smart version audit checks thousands of records without scanning document payloads',async()=>{
  const db=new LocalSyncDb('fast-manifest-'+crypto.randomUUID());
  const rows=Array.from({length:1000},(_,i)=>invoice(i+1));
  await db.initializeAuthoritativeSnapshot(rows,cursor(100));
  const old=IDBObjectStore.prototype.getAll;
  let scans=0;
  (IDBObjectStore.prototype as any).getAll=function(this:IDBObjectStore,...args:unknown[]){
    if(this.name==='records'){scans++;throw Error('ACCIDENTAL_FULL_RECORD_SCAN');}
    return old.apply(this,args as Parameters<typeof old>);
  };
  try{
    const missing=await db.missingServerVersions(manifest(rows));
    assert.deepEqual(missing,[]);
    assert.equal(scans,0);
    const stale={...rows[599],version:2,value:{...rows[599].value,totalAmount:999}};
    const [difference]=await db.missingServerVersions(manifest([stale]));
    assert.equal(difference.id,rows[599].id);
    assert.equal(await db.adoptAuthoritativeRecords([stale]),1);
    const updated=await db.listVisibleByKeys([{entity:'invoices',id:stale.id}]);
    assert.equal(updated[recordKey('invoices',stale.id)]?.version,2);
  }finally{
    (IDBObjectStore.prototype as any).getAll=old;
    await db.close();
  }
});

test('smart reconciliation cannot overwrite a pending or rejected local staff edit',async()=>{
  const db=new LocalSyncDb('safe-manifest-'+crypto.randomUUID());
  await db.initializeAuthoritativeSnapshot([employee('emp-1')],cursor(1));
  try{
    const pending=await db.enqueue([{
      entity:'employees',id:'emp-8',value:{id:'emp-8',name:'تعديل محلي لم يعتمد'}
    }]);
    assert.deepEqual(await db.missingServerVersions(manifest([employee('emp-8',2)])),[]);
    assert.equal(await db.adoptAuthoritativeRecords([employee('emp-8',2)]),0);
    assert.equal((await db.pending()).find(r=>r.id===pending.id)?.status,'pending');
    await db.markError(pending.id,'rejected','SERVER_REJECTED');
    assert.deepEqual(await db.missingServerVersions(manifest([employee('emp-8',2)])),[]);
    assert.equal(await db.adoptAuthoritativeRecords([employee('emp-8',2)]),0);
    assert.equal((await db.pending()).find(r=>r.id===pending.id)?.status,'rejected');
  }finally{await db.close();}
});

test('an SQL manifest omitting an ID is never treated as permission to delete it',async()=>{
  const db=new LocalSyncDb('no-manifest-delete-'+crypto.randomUUID());
  await db.initializeAuthoritativeSnapshot([employee('emp-1'),employee('emp-8')],cursor(1));
  try{
    const missing=await db.missingServerVersions(manifest([employee('emp-1')]));
    assert.deepEqual(missing,[]);
    assert.equal((await db.listVisibleGrouped(['employees'])).employees.length,2);
  }finally{await db.close();}
});
