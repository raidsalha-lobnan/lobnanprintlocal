import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SyncCommand} from '../src/sync-next/types';
import {buildSafeQueueDiagnostic,classifyQueueFailure} from '../src/sync-next/syncOutboxDiagnosis';

const cmd=(id:string,status:SyncCommand['status'],entity:'parties'|'invoices',error:string):SyncCommand=>({
 id,workspaceId:'lobnan_main',status,createdAt:1794480000000,
 retryAt:0,attempts:1,error,
 changes:[{entity,id:entity==='parties'?'pt-123':'inv-123',expectedVersion:27,
   value:{id:entity==='parties'?'pt-123':'inv-123',
     name:'private customer name',secretToken:'secret-sensitive-should-not-export',
     totalAmount:1234567}}]
});
test('safe queue report reveals failure categories and blockers but no financial/client payload',()=>{
 const queue=[
   cmd('bad-001','rejected','parties','BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION: private customer'),
   cmd('bad-002','conflict','parties','VERSION_CONFLICT private customer'),
   cmd('bad-003','rejected','invoices','ENTITY_PERMISSION_DENIED: 1234567'),
   cmd('bad-004','pending','parties','SESSION_LOGIN_REQUIRED')
 ];
 const diag=buildSafeQueueDiagnostic(queue,'2026-11-12T12:00:00.000Z');
 assert.deepEqual(diag.totals,{all:4,pending:1,conflict:1,rejected:2});
 assert.equal(diag.blockers.find(x=>x.id==='pt-123')?.failed,2);
 assert.equal(diag.byEntity.find(x=>x.entity==='parties')?.count,3);
 const json=JSON.stringify(diag);
 assert.ok(!json.includes('private customer name'));
 assert.ok(!json.includes('secret-sensitive-should-not-export'));
 assert.ok(!json.includes('1234567'));
 assert.ok(!json.includes('secretToken'));
 assert.ok(json.includes('ENTITY_PERMISSION_DENIED'));
});
test('unrecognized failure strings are never exported directly',()=>{
 assert.equal(classifyQueueFailure('INTERNAL_ERROR passport 501 account 102'),
   'OTHER_ERROR_REQUIRES_REVIEW');
 assert.equal(classifyQueueFailure(''),'NO_ERROR_RECORDED');
});
