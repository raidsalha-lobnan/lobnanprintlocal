import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {EntityName,SyncCommand} from '../sync-next/types';
import {classifyQueueSafety} from '../sync-next/queueSafety';

const sample=(entity:EntityName,status:SyncCommand['status'],error:string,quantity=1):SyncCommand=>({
  id:'sync-example',workspaceId:'lobnan_main',createdAt:1,
  attempts:1,retryAt:0,status,error,changes:Array.from({length:quantity},(_,i)=>({
    entity,id:'record-'+i,expectedVersion:1,value:{id:'record-'+i},
  })),
});

test('403 invoice permission rejection cannot trigger invoice renumber, retry or discard',()=>{
  const check=classifyQueueSafety(sample('invoices','rejected','PermanentSyncError: ENTITY_PERMISSION_DENIED: 403'));
  assert.equal(check.code,'permission');
  assert.equal(check.allowRenumber,false);
  assert.equal(check.allowRetry,false);
  assert.equal(check.allowDiscard,false);
  assert.match(check.advice,/الصلاحية|صلاحية/);
});
test('409 bulk-party account snapshot is a ledger safety rejection, not an invoice number problem',()=>{
  const check=classifyQueueSafety(sample('parties','rejected',
    'BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION: 409',70));
  assert.equal(check.code,'party-bulk');
  assert.equal(check.allowRenumber,false);
  assert.equal(check.allowRetry,false);
  assert.equal(check.allowDiscard,false);
});
test('financial version errors cannot be fixed by automatic renumbering',()=>{
  const check=classifyQueueSafety(sample('invoices','conflict',
    'VERSION_CONFLICT invoices/record expected=2 actual=3'));
  assert.equal(check.allowRenumber,false);
  assert.equal(check.allowRetry,false);
  assert.equal(check.allowDiscard,false);
});
test('even an explicit invoice number collision requires read-only reconciliation first',()=>{
  const check=classifyQueueSafety(sample('invoices','conflict','INVOICE_NUMBER_CONFLICT: 409'));
  assert.equal(check.code,'invoice-number');
  assert.equal(check.allowRenumber,false);
  assert.equal(check.allowRetry,false);
  assert.equal(check.allowDiscard,false);
});
test('pending payment or invoice commits are never discardable from queue UI',()=>{
  for(const entity of ['invoices','parties','vouchers','stockMovements'] as EntityName[]){
    const check=classifyQueueSafety(sample(entity,'pending','Network unavailable'));
    assert.equal(check.allowDiscard,false);
  }
});
test('nonfinancial configuration version conflict can be manually retried without dropping data',()=>{
  const check=classifyQueueSafety(sample('settings','conflict','VERSION_CONFLICT'));
  assert.equal(check.allowRetry,true);
  assert.equal(check.allowDiscard,false);
});
test('sync diagnostics UI does not label a blocked queue as completely synchronized',()=>{
  const source=readFileSync(new URL('../components/SyncConflictModal.tsx',import.meta.url),'utf8');
  assert.match(source,/classifyQueueSafety\(cmd\)\.allowRenumber/);
  assert.match(source,/classifyQueueSafety\(cmd\)\.allowRetry/);
  assert.match(source,/classifyQueueSafety\(cmd\)\.allowDiscard/);
  assert.doesNotMatch(source,/طابور الانتظار فارغ تماماً/);
  assert.doesNotMatch(source,/جميع البيانات منسقة ومزامنة بنجاح/);
  assert.match(source,/فراغ طابور الإرسال لا يعني اكتمال المزامنة/);
  assert.match(source,/الحركات غير المرسلة محفوظة محليًا/);
});
