import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWithSyncDeadline,deadlineForSyncPath} from '../sync-next/requestDeadline';

test('stalled transport is aborted and becomes a retryable timeout',async()=>{
  let aborted=false;
  const stalled:typeof fetch=async(_url,init)=>new Promise<Response>((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>{
      aborted=true;reject(new Error('native abort'));
    },{once:true});
  });
  await assert.rejects(
    fetchWithSyncDeadline('https://api.test/api/v1/push?',{method:'POST',body:'{}'},10,stalled),
    /LOCAL_SYNC_HTTP_TIMEOUT/
  );
  assert.equal(aborted,true);
});

test('normal response is returned unchanged',async()=>{
  const response=new Response(JSON.stringify({ok:true}),{status:200});
  let capturedSignal:AbortSignal|undefined;
  const fetcher:typeof fetch=async(_url,init)=>{
    capturedSignal=init?.signal??undefined;
    return response;
  };
  assert.strictEqual(await fetchWithSyncDeadline('https://api.test',{method:'GET'},1000,fetcher),response);
  assert.equal(capturedSignal?.aborted,false);
});

test('caller cancellation is not falsely reported as network timeout',async()=>{
  const caller=new AbortController();
  const fetcher:typeof fetch=async(_url,init)=>new Promise<Response>((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>reject(new Error('cancelled')), {once:true});
  });
  const promise=fetchWithSyncDeadline('https://api.test',{signal:caller.signal},1000,fetcher);
  caller.abort();
  await assert.rejects(promise,/cancelled/);
});

test('ordinary network failure keeps original error to follow standard backoff',async()=>{
  const fetcher:typeof fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(fetchWithSyncDeadline('https://api.test',{},1000,fetcher),/Failed to fetch/);
});

test('timeouts reflect transaction and snapshot costs',()=>{
  assert.equal(deadlineForSyncPath('head?workspace=lobnan_main'),12000);
  assert.equal(deadlineForSyncPath('push?workspace=lobnan_main'),35000);
  assert.equal(deadlineForSyncPath('invoices/revise?workspace=lobnan_main'),35000);
  assert.equal(deadlineForSyncPath('bootstrap?workspace=lobnan_main'),45000);
  assert.equal(deadlineForSyncPath('events?after=0'),20000);
});
