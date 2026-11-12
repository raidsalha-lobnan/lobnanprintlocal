import test from 'node:test';
import assert from 'node:assert/strict';
import {stablePosJournalId,stablePosStockMovementId} from './posPostingIdentity';

test('retries and repeated React updater evaluations cannot invent new sale journal IDs',()=>{
 const invoice='inv-pos-25b86a4d-1234-41c4-91cf-bca2aa431912';
 const a=stablePosJournalId('pos_invoice',invoice);
 const b=stablePosJournalId('pos_invoice',invoice);
 const cost=stablePosJournalId('cogs',invoice);
 assert.equal(a,b);
 assert.notEqual(a,cost);
 assert.notEqual(a,stablePosJournalId('pos_invoice','inv-pos-other'));
 assert.ok(a.length<=180);
});

test('one movement identity per invoice and item, independent of execution order or wall clock',()=>{
 const inv='TEMP-inv-pos-20261113-aaa';
 const itemA='inv-5de68f';
 const itemB='inv-6dee9f';
 const one=stablePosStockMovementId(inv,itemA);
 assert.equal(one,stablePosStockMovementId(inv,itemA));
 assert.notEqual(one,stablePosStockMovementId(inv,itemB));
 assert.notEqual(one,stablePosStockMovementId('TEMP-inv-pos-20261113-bbb',itemA));
 assert.ok(one.length<=180);
});

test('length-prefixed components prevent delimiter collision',()=>{
 assert.notEqual(stablePosStockMovementId('a-b','c'),stablePosStockMovementId('a','b-c'));
});

test('unsafe or oversized identifiers fail closed before touching financial outbox',()=>{
 assert.throws(()=>stablePosJournalId('cogs',''),/INVALID_POS_EFFECT/);
 assert.throws(()=>stablePosJournalId('pos_invoice','bad/ref'),/INVALID_POS_EFFECT/);
 assert.throws(()=>stablePosStockMovementId('TEMP-inv',''),/INVALID_POS_EFFECT/);
 assert.throws(()=>stablePosStockMovementId('REF','x'.repeat(180)),/POS_EFFECT_ID_EXCEEDS_SERVER_LIMIT/);
});
