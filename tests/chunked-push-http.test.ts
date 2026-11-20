import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {LocalHttpSyncTransport} from '../src/sync-next/httpTransport';
import type {SyncCommand} from '../src/sync-next/types';

function command(size:number):SyncCommand{
  const id=crypto.randomUUID();
  return {id,workspaceId:'lobnan_main',actorId:'usr-1',
    createdAt:Date.now(),attempts:1,retryAt:0,status:'pending',
    atomicInvoiceId:'inv-pos-big-one',
    changes:[{entity:'invoices',id:'inv-pos-big-one',expectedVersion:0,
      value:{id:'inv-pos-big-one',invoiceNumber:'TEMP-inv-pos-big-one',
        totalAmount:1495,notes:'فاتورة مؤسسة 4TDK',
        imageThumbnail:'data:image/jpeg;base64,'+'A'.repeat(size)}}]};
}
function json(value:unknown,status=200):Response{
  return new Response(JSON.stringify(value),{
    status,headers:{'Content-Type':'application/json'}
  });
}
test('large original offline command is transported in pieces, never split into financial postings',async()=>{
  const prior=globalThis.fetch;
  const original=command(1_100_000);
  const before=JSON.stringify(original);
  const parts=new Map<number,Uint8Array>();
  let commitCalls=0,rawPushCalls=0,meta:any;
  globalThis.fetch=(async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/api/v1/health')return json({ok:true,features:{pushChunksV1:true}});
    if(path==='/api/v1/push'){rawPushCalls++;return json({code:'PAYLOAD_TOO_LARGE'},413)}
    if(path==='/api/v1/push/chunks'){
      const body=JSON.parse(String(init?.body));
      meta=body;
      parts.set(body.index,Uint8Array.from(atob(body.dataBase64),c=>c.charCodeAt(0)));
      return json({ok:true,index:body.index});
    }
    if(path==='/api/v1/push/chunks/commit'){
      const manifest=JSON.parse(String(init?.body));
      assert.equal(manifest.commandId,original.id);
      const bytes=new Uint8Array([...parts.keys()].sort((a,b)=>a-b)
        .flatMap(i=>Array.from(parts.get(i)!)));
      const recovered=new TextDecoder().decode(bytes);
      assert.equal(recovered,before);
      assert.deepEqual(JSON.parse(recovered),original);
      assert.equal(manifest.sha256,meta.sha256);
      commitCalls++;
      return json({commandId:original.id,changes:[]});
    }
    throw Error('Unexpected endpoint '+path);
  }) as typeof fetch;
  try{
    const remote=new LocalHttpSyncTransport('https://example.test','token','lobnan_main');
    const receipt=await remote.push(original);
    assert.equal(receipt.commandId,original.id);
    assert.equal(rawPushCalls,0,'Do not send oversized raw request when chunking is available');
    assert.ok(parts.size>2);
    assert.equal(commitCalls,1);
    assert.equal(JSON.stringify(original),before,'Local command must remain immutable');
  }finally{globalThis.fetch=prior}
});
test('an intermediary HTML 413 falls back to chunks with the original command id',async()=>{
  const prior=globalThis.fetch;
  const cmd=command(100_000);
  let rawRequests=0,staged=0,committed=0;
  globalThis.fetch=(async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/api/v1/push'){
      rawRequests++;
      return new Response('<html>HTTP 413</html>',{status:413,
        headers:{'content-type':'text/html'}});
    }
    if(path==='/api/v1/health')return json({ok:true,features:{pushChunksV1:true}});
    if(path==='/api/v1/push/chunks'){staged++;return json({ok:true})}
    if(path==='/api/v1/push/chunks/commit'){
      committed++;
      assert.equal(JSON.parse(String(init?.body)).commandId,cmd.id);
      return json({commandId:cmd.id,changes:[]});
    }
    throw Error(path);
  }) as typeof fetch;
  try{
    const remote=new LocalHttpSyncTransport('https://example.test','token','lobnan_main');
    assert.equal((await remote.push(cmd)).commandId,cmd.id);
    assert.equal(rawRequests,1);
    assert.ok(staged>0);
    assert.equal(committed,1);
  }finally{globalThis.fetch=prior}
});
test('if PostgreSQL server has not been updated, 413 stays in outbox and gives an actionable error',async()=>{
  const prior=globalThis.fetch;
  const cmd=command(100_000);
  let chunks=0;
  globalThis.fetch=(async(input)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/api/v1/push')
      return json({code:'PAYLOAD_TOO_LARGE'},413);
    if(path==='/api/v1/health')return json({ok:true,features:{}});
    if(path.includes('chunks'))chunks++;
    return json({code:'NOT_FOUND'},404);
  }) as typeof fetch;
  try{
    const remote=new LocalHttpSyncTransport('https://example.test','token','lobnan_main');
    await assert.rejects(()=>remote.push(cmd),/SYNC_HTTP_413_CHUNKED_SERVER_UPDATE_REQUIRED/);
    assert.equal(chunks,0);
  }finally{globalThis.fetch=prior}
});
