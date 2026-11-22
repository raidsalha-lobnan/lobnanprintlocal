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


test('PostgreSQL-verified eight-person roster survives reopening IndexedDB after a stale seven-person display',async()=>{
  const workspace='staff-roster-'+crypto.randomUUID();
  const namespace='staff-roster-verification-'+crypto.randomUUID();
  const first=new LocalSyncDb(workspace,namespace);
  await first.initializeAuthoritativeSnapshot(
    Array.from({length:8},(_,i)=>employee(String(i+1).padStart(3,'0'),1)),cursor(1));
  assert.equal((await first.verifiedEmployeeIds())?.length,8);
  await first.close();
  const reopened=new LocalSyncDb(workspace,namespace);
  try{
    assert.deepEqual((await reopened.verifiedEmployeeIds())?.slice(-1),['008']);
    // Central confirmation of a real seven-person roster updates the
    // saved identity checkpoint; it does not delete local staff by itself.
    const result=await reopened.restoreMissingEmployees(
      Array.from({length:7},(_,i)=>employee(String(i+1).padStart(3,'0'),1)),1);
    assert.deepEqual(result,{added:0,updated:0});
    assert.equal((await reopened.verifiedEmployeeIds())?.length,7);
    assert.equal((await reopened.listVisibleGrouped(['employees'])).employees.length,8,
      'a roster check never deletes employees; only versioned events may do that');
  }finally{await reopened.close();}
});


test('employee history identifies a past broad-snapshot removal and the later verified repair',async()=>{
  const db=new LocalSyncDb('staff-history-'+crypto.randomUUID());
  await db.initializeAuthoritativeSnapshot([employee('001',1),employee('008',1)],cursor(1));
  try{
    // Reproduces the UNSCOPED historical invoice recovery: role-filtered
    // bootstrap mistakenly omits employee 008 and prunes the local record.
    await db.refreshAuthoritativeSnapshot([employee('001',1)],cursor(2));
    assert.equal((await db.listVisibleGrouped(['employees'])).employees.length,1);
    const removals=await db.employeeProjectionHistory();
    assert.ok(removals.some(row=>row.id==='008' &&
      row.origin==='old-snapshot-pruning'));
    await db.restoreMissingEmployees([employee('001',1),employee('008',1)],2);
    assert.equal((await db.listVisibleGrouped(['employees'])).employees.length,2);
    assert.ok((await db.employeeProjectionHistory()).some(row=>row.id==='008' &&
      row.origin==='verified-repair'));
  }finally{await db.close();}
});

test('employee history distinguishes a real server tombstone from snapshot pruning',async()=>{
  const db=new LocalSyncDb('staff-event-'+crypto.randomUUID());
  await db.initializeAuthoritativeSnapshot([employee('008',1)],cursor(1));
  try{
    await db.applyEvent({commandId:'central-deletion-employee-008',
      changes:[{entity:'employees',id:'008',value:null,version:2}],cursor:cursor(2)});
    const history=await db.employeeProjectionHistory();
    assert.ok(history.some(row=>row.id==='008'&&row.origin==='server-event'&&
      row.operation==='deleted'&&row.version===2));
  }finally{await db.close();}
});
