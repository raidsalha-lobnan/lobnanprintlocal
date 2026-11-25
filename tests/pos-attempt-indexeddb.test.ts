import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readPosAttempt,writePosAttempt,removePosAttempt} from '../src/sync-next/posAttemptStore';
import {readFileSync} from 'node:fs';

const identity=(suffix:string)=>({
  invoiceId:'inv-pos-'+suffix,
  commandId:suffix,
  createdAt:'2026-11-25T12:00:00.000Z',
  signature:'signature-'+suffix
});
const key=(suffix:string)=>'lobnan_pending_atomic_pos_attempt:'+suffix;

test('financial attempt survives exhausted localStorage via committed IndexedDB',async()=>{
  const old=(globalThis as any).localStorage;
  (globalThis as any).localStorage={
    getItem:()=>null,
    setItem:()=>{throw Object.assign(new Error('QuotaExceededError'),{name:'QuotaExceededError'});},
    removeItem:()=>{throw new Error('localStorage unavailable');}
  };
  const k=key(crypto.randomUUID()),value=identity(crypto.randomUUID());
  try{
    await writePosAttempt(k,value);
    assert.deepEqual(await readPosAttempt(k),value);
    await removePosAttempt(k);
    assert.equal(await readPosAttempt(k),null);
  }finally{(globalThis as any).localStorage=old;}
});

test('preserves legacy unsent attempt ID during migration without deleting old-tab key',async()=>{
  const k=key(crypto.randomUUID()),value=identity(crypto.randomUUID());
  const old=(globalThis as any).localStorage;
  let removed=false;
  (globalThis as any).localStorage={
    getItem:(candidate:string)=>candidate===k?JSON.stringify(value):null,
    setItem:()=>{throw new Error('full');},
    removeItem:()=>{removed=true;}
  };
  try{
    assert.deepEqual(await readPosAttempt(k),value);
    assert.equal(removed,false);
    assert.deepEqual(await readPosAttempt(k),value);
  }finally{
    (globalThis as any).localStorage=old;
    await removePosAttempt(k);
  }
});

test('new posted POS sale never requires localStorage.setItem of attempt identity',()=>{
  const source=readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');
  const start=source.indexOf('// Secure POS sale: exactly one locally durable command');
  const end=source.indexOf('// Unsecured legacy path only',start);
  assert.ok(start>0&&end>start);
  const sale=source.slice(start,end);
  assert.match(sale,/await readPosAttempt\(pendingKey\)/);
  assert.match(sale,/await writePosAttempt\(pendingKey,\{invoiceId,commandId,createdAt,signature\}\)/);
  assert.doesNotMatch(sale,/localStorage\.setItem\(pendingKey/);
  assert.match(sale,/await enqueueAtomicInvoicePosting\(repo,posting\)/);
  assert.match(sale,/LOCAL_INVOICE_SAVE_RECEIPT_MISSING/);
});
