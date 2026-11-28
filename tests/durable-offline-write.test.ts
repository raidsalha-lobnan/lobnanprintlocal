import test from 'node:test';
import assert from 'node:assert/strict';
import {durableWriteTransaction} from '../src/sync-next/durableWriteTransaction';
import {readFileSync} from 'node:fs';
test('strict commit requests explicit disk durability and does not retry real failures',()=>{
 const calls:unknown[][]=[];const tx={} as IDBTransaction;
 const db={transaction:(...args:unknown[])=>{calls.push(args);return tx;}} as unknown as IDBDatabase;
 assert.equal(durableWriteTransaction(db,['records','outbox']),tx);
 assert.deepEqual(calls,[[['records','outbox'],'readwrite',{durability:'strict'}]]);
 const failure=new DOMException('full','QuotaExceededError');let attempts=0;
 const bad={transaction:()=>{attempts++;throw failure;}} as unknown as IDBDatabase;
 assert.throws(()=>durableWriteTransaction(bad,'outbox'),e=>e===failure);assert.equal(attempts,1);
});
test('legacy engine options rejection falls back without retrying a write',()=>{
 const tx={} as IDBTransaction;let attempts=0;
 const db={transaction:(...args:unknown[])=>{attempts++;if(args.length===3)throw new TypeError('unsupported');return tx;}} as unknown as IDBDatabase;
 assert.equal(durableWriteTransaction(db,'outbox'),tx);assert.equal(attempts,2);
});
test('offline app shell includes local fonts and excludes live API and Telegram routes',()=>{
 const config=readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8');
 assert.match(config,/woff2,ttf,otf,wasm/);assert.match(config,/navigateFallbackDenylist/);
 assert.ok(config.includes('**/api/**'));assert.match(config,/skipWaiting: false/);
});
