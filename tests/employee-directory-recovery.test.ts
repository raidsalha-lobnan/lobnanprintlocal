import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {recordKey,type ServerCursor,type StoredRecord} from '../src/sync-next/types';

const cursor=(sequence:number):ServerCursor=>({
  sequence,seconds:0,nanoseconds:0,eventId:'event-'+sequence
});
const employee=(id:string,version:number):StoredRecord=>({
  key:recordKey('employees',id),entity:'employees',id,version,
  value:{id,code:'EMP-'+id,name:'موظف '+id,jobTitle:'طباعة'}
});

test('manual authoritative verification recovers stale local employee tombstones',async()=>{
  const db=new LocalSyncDb('employees-repair-'+crypto.randomUUID());
  await db.initializeAuthoritativeSnapshot([employee('001',1),employee('008',1)],cursor(1));
  try{
    await db.applyEvent({
      commandId:'old-tombstone-008',
      changes:[{entity:'employees',id:'008',version:2,value:null}],
      cursor:cursor(2)
    });
    assert.equal((await db.listVisibleGrouped(['employees'])).employees.length,1);
    const restored=await db.restoreMissingEmployees([employee('001',1),employee('008',3)],3);
    assert.deepEqual(restored,{added:0,updated:1});
    const after=await db.listVisibleGrouped(['employees']);
    assert.equal(after.employees.length,2);
    assert.equal(after.employees.find(row=>row.id==='008')?.version,3);
    assert.equal((await db.pending()).length,0);
  }finally{await db.close();}
});

test('missing staff are restored from PostgreSQL without losing pending local employee edits',async()=>{
  const db=new LocalSyncDb('employees-protect-'+crypto.randomUUID());
  await db.initializeAuthoritativeSnapshot([employee('001',1)],cursor(4));
  try{
    const protectedDraft=await db.enqueue([{
      entity:'employees',id:'008',
      value:{id:'008',code:'EMP-008',name:'موظف ٨ المحلي',jobTitle:'طباعة'}
    }]);
    const restored=await db.restoreMissingEmployees([employee('001',1),employee('008',1)],4);
    assert.deepEqual(restored,{added:0,updated:0},'unsynced staff must never be overwritten');
    assert.equal((await db.pending()).find(c=>c.id===protectedDraft.id)?.status,'pending');
    const local=(await db.listVisibleGrouped(['employees'])).employees;
    assert.equal(local.length,2);
    assert.equal(local.find(e=>e.id==='008')?.value?.name,'موظف ٨ المحلي');
    await assert.rejects(()=>db.restoreMissingEmployees([employee('009',1)],3));
  }finally{await db.close();}
});


test('invoice-only cache recovery cannot remove employee 008 from a filtered server snapshot',async()=>{
  const db=new LocalSyncDb('invoice-scoped-employee-'+crypto.randomUUID());
  const staff=Array.from({length:8},(_,i)=>employee(String(i+1).padStart(3,'0'),1));
  const invoice={
    key:recordKey('invoices','invoice-001'),entity:'invoices' as const,id:'invoice-001',
    version:1,value:{id:'invoice-001',invoiceNumber:'INV-0001',totalAmount:10}
  };
  await db.initializeAuthoritativeSnapshot([...staff,invoice],cursor(1));
  try{
    const before=(await db.listVisibleGrouped(['employees'])).employees;
    assert.equal(before.length,8);
    // The server response used to repair an empty invoice table may be
    // permission-filtered and omit one or ALL employees. Such absences are
    // not authoritative employee deletion events.
    const filteredSnapshot=[...staff.slice(0,7),{
      ...invoice,version:2,value:{...invoice.value,totalAmount:12}
    }];
    await db.refreshAuthoritativeSnapshot(filteredSnapshot,cursor(2),['invoices']);
    const after=await db.listVisibleGrouped(['employees','invoices']);
    assert.equal(after.employees.length,8,'staff records must survive invoice repair');
    assert.ok(after.employees.some(row=>row.id==='008'&&row.value?.name==='موظف 008'));
    assert.equal(after.invoices[0]?.value?.totalAmount,12);

    // Even when the snapshot includes NO employee rows, no staff is touched.
    await db.refreshAuthoritativeSnapshot([{
      ...invoice,version:3,value:{...invoice.value,totalAmount:13}
    }],cursor(3),['invoices']);
    assert.equal((await db.listVisibleGrouped(['employees'])).employees.length,8);
  }finally{await db.close();}
});
