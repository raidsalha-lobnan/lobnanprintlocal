import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planConflictResolution,planAtomicCommandAlreadyConfirmed} from '../src/sync-next/conflictResolution';
import type {SyncCommand,StoredRecord} from '../src/sync-next/types';
const rec=(version:number,value:Record<string,any>):StoredRecord=>({
  key:'parties\u001fp1',entity:'parties',id:'p1',version,value});
const cmd=(value:Record<string,any>,base?:StoredRecord|null):SyncCommand=>({
  id:'id_test_00000001',workspaceId:'w',status:'conflict',createdAt:1,attempts:1,retryAt:0,
  changes:[{entity:'parties',id:'p1',expectedVersion:1,value}],
  ...(base!==undefined?{baseRecords:[base]}:{})
});
const original={id:'p1',name:'Party',phone:'111',notes:'first',balance:600};
test('identical server version auto-confirms without another write',()=>{
 const c=cmd({...original,phone:'222'});
 const answer=planConflictResolution(c,rec(3,{...original,phone:'222'}));
 assert.equal(answer.kind,'already-confirmed');
});
test('three-way contact merge carries remote financial balance without overwriting it',()=>{
 const c=cmd({...original,phone:'222'},rec(1,original));
 const answer=planConflictResolution(c,rec(3,{...original,notes:'second',balance:750}));
 assert.equal(answer.kind,'rebase');
 if(answer.kind==='rebase'){
  assert.equal(answer.expectedVersion,3);
  assert.equal(answer.merged.balance,750);
  assert.equal(answer.merged.notes,'second');
  assert.equal(answer.merged.phone,'222');
 }
});
test('simultaneous edits to the same contact field remain manual',()=>{
 const c=cmd({...original,phone:'222'},rec(1,original));
 assert.deepEqual(planConflictResolution(c,rec(3,{...original,phone:'333'})).kind,'manual');
});
test('never auto-merge financial balance, legal name, deletes or absent baseline',()=>{
 const remote=rec(3,{...original,balance:750});
 assert.equal(planConflictResolution(cmd({...original,balance:620},rec(1,original)),remote).kind,'manual');
 assert.equal(planConflictResolution(cmd({...original,name:'Different'},rec(1,original)),remote).kind,'manual');
 assert.equal(planConflictResolution(cmd({...original,phone:'222'}),remote).kind,'manual');
 const noValue=cmd({...original,phone:'222'},rec(1,original));
 noValue.changes[0].value=null;
 assert.equal(planConflictResolution(noValue,remote).kind,'manual');
});
test('manual when there is another queued command or when authoritative record is missing',()=>{
 const c=cmd({...original,phone:'222'},rec(1,original));
 assert.equal(planConflictResolution(c,rec(2,original),true).kind,'manual');
 assert.equal(planConflictResolution(c,null).kind,'manual');
});

test('multi-record transaction is only auto-confirmed when every single record matches server',()=>{
 const batch:SyncCommand={...cmd({...original}),changes:[
  {entity:'parties',id:'p1',expectedVersion:1,value:{...original,phone:'222'}},
  {entity:'invoices',id:'i1',expectedVersion:1,value:{id:'i1',invoiceNumber:'INV-0001',totalAmount:5}}
 ]};
 const records=new Map<string,StoredRecord>([
  ['parties\u001fp1',rec(2,{...original,phone:'222'})],
  ['invoices\u001fi1',{key:'invoices\u001fi1',entity:'invoices',id:'i1',version:2,
    value:{id:'i1',invoiceNumber:'INV-0001',totalAmount:5}}]
 ]);
 assert.equal(planAtomicCommandAlreadyConfirmed(batch,records)?.length,2);
 assert.equal(planAtomicCommandAlreadyConfirmed(batch,records,true),null);
 records.set('invoices\u001fi1',{...records.get('invoices\u001fi1')!,
   value:{id:'i1',invoiceNumber:'INV-0001',totalAmount:6}});
 assert.equal(planAtomicCommandAlreadyConfirmed(batch,records),null);
});
