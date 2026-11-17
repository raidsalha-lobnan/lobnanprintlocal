import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {repositoryStartupNeedsManualAction,repositoryStartupRetryDelay} from '../src/sync-next/repositoryStartupRetry';

test('ordinary network startup errors retry with bounded backoff',()=>{
 assert.equal(repositoryStartupNeedsManualAction(new Error('LOCAL_SYNC_HTTP_503')),false);
 assert.equal(repositoryStartupNeedsManualAction(new Error('Failed to fetch')),false);
 assert.deepEqual([0,1,2,3,4,5,6].map(repositoryStartupRetryDelay),
  [2000,4000,8000,16000,30000,30000,30000]);
});

test('reconciliation, login and unsafe boot states stop automatic retries',()=>{
 for(const reason of ['EXISTING_LOCAL_DATA_REQUIRES_RECONCILIATION',
  'SESSION_LOGIN_REQUIRED','WORKSPACE_MISMATCH','LOCAL_SYNC_NOT_CONFIGURED',
  'SECURE_SYNC_API_MUST_USE_HTTPS','LOCAL_STORAGE_SESSION_CLOSED'])
   assert.equal(repositoryStartupNeedsManualAction(new Error(reason)),true,reason);
});

test('accounting context schedules bounded retry but never launches overlapping boot sessions',()=>{
 const s=readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');
 assert.ok(s.includes('if (unmounted || initializationInFlight || unifiedRepoRef.current) return;'));
 assert.ok(s.includes('repositoryStartupRetryDelay(retries++)'));
 assert.ok(s.includes('repositoryStartupNeedsManualAction(e)'));
 assert.ok(s.includes("window.addEventListener('online', wakeUpInitialization)"));
 assert.ok(s.includes('if (retryTimer) clearTimeout(retryTimer)'));
});

test('cashier does not issue any financial write until repository exists',()=>{
 const s=readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');
 const save=s.slice(s.indexOf('const handleSaveInvoice = async'),s.indexOf('handleSaveInvoiceRef.current = handleSaveInvoice'));
 const guard=save.indexOf('if (!unifiedRepository) {');
 const submit=save.indexOf('postRes = await postPosSaleOnline(');
 assert.ok(guard>=0&&submit>guard);
 const guardEnd=save.indexOf('return;',guard);
 assert.ok(guardEnd<submit,'Guard must return before calling PostgreSQL');
 assert.ok(save.includes('const intendedEditingInvoiceId='));
 assert.ok(save.includes('if(editingId){'),'Successful edits must remain open');
});
