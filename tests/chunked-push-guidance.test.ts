import test from 'node:test';
import assert from 'node:assert/strict';
import {explainSyncFailure} from '../src/sync-next/syncFailureGuide';

test('413 identifies a transport payload limit, not a financial conflict or a deleted invoice',()=>{
  const guidance=explainSyncFailure('LOCAL_SYNC_HTTP_413','invoices');
  assert.equal(guidance.kind,'inspect');
  assert.match(guidance.title,/حجم/);
  assert.equal(guidance.safeToRetry,false);
});
test('old server without chunked support tells the operator to update the PostgreSQL host, not the browser database',()=>{
  const guide=explainSyncFailure('SYNC_HTTP_413_CHUNKED_SERVER_UPDATE_REQUIRED','invoices');
  assert.equal(guide.kind,'inspect');
  assert.match(guide.nextStep,/Node\.js/);
  assert.match(guide.nextStep,/لا تمسح بيانات المتصفح/);
});
