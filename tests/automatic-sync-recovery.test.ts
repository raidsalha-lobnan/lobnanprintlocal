import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {explainSyncFailure} from '../src/sync-next/syncFailureGuide';

const context=readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');

test('new customer and stock item have exactly one durable enqueue path each',()=>{
 const inventory=context.slice(context.indexOf('  const addInventoryItem = '),context.indexOf('  const updateInventoryItem = '));
 const party=context.slice(context.indexOf('  const addParty = '),context.indexOf('  const updateParty = '));
 const movement=context.slice(context.indexOf('  const addStockMovement = '),context.indexOf('  const addInventoryItem = '));
 assert.match(inventory,/crypto\.randomUUID\(\)/);
 assert.match(party,/crypto\.randomUUID\(\)/);
 assert.match(inventory,/pushToServerSync\('inventory', newItem\)/);
 assert.match(party,/pushToServerSync\('parties', newParty\)/);
 assert.doesNotMatch(inventory,/setDoc\(doc\(db, 'inventory', newItem.id/);
 assert.doesNotMatch(party,/setDoc\(doc\(db, 'parties', newParty.id/);
 assert.doesNotMatch(movement,/setDoc\(doc\(db, 'stockMovements', newMovement.id/);
});
test('React state updater callbacks do not launch network/outbox writes for new customer, item or stock movement',()=>{
 const movement=context.slice(context.indexOf('  const addStockMovement = '),context.indexOf('  const addInventoryItem = '));
 const inventory=context.slice(context.indexOf('  const addInventoryItem = '),context.indexOf('  const updateInventoryItem = '));
 const party=context.slice(context.indexOf('  const addParty = '),context.indexOf('  const updateParty = '));
 const checks=[
  [movement,"pushToServerSync('stockMovements', newMovement)"],
  [inventory,"pushToServerSync('inventory', newItem)"],
  [party,"pushToServerSync('parties', newParty)"]
 ] as const;
 for(const [section,enqueue] of checks){
  const callbackEnd=section.search(/return next;\r?\n    \}\);/);
  assert.ok(callbackEnd>=0,'state updater closure is present');
  const queueAt=section.indexOf(enqueue);
  assert.ok(queueAt>callbackEnd,'durable enqueue happens after React state updater');
  assert.equal(section.split(enqueue).length-1,1,'one durable enqueue per action');
 }
});

test('editing a customer or item does not queue identical changes twice',()=>{
 const item=context.slice(context.indexOf('  const updateInventoryItem = '),context.indexOf('  const deleteInventoryItem = '));
 const party=context.slice(context.indexOf('  const updateParty = '),context.indexOf('  const deleteParty = '));
 assert.match(item,/pushToServerSync\('inventory', merged\)/);
 assert.match(party,/pushToServerSync\('parties', merged\)/);
 assert.doesNotMatch(item,/setDoc\(doc\(db, 'inventory', id\), cleanDocForFirestore\(merged\)/);
 assert.doesNotMatch(party,/setDoc\(doc\(db, 'parties', targetId\), cleanDocForFirestore\(merged\)/);
});
test('temporary transport errors retry but accounting problems never auto post',()=>{
 const transient=explainSyncFailure('LOCAL_SYNC_HTTP_503','inventory');
 assert.equal(transient.kind,'automatic-retry');
 assert.equal(transient.safeToRetry,true);
 for(const reason of [
  'INVOICE_REVISION_BASELINE_NEEDS_RECONCILIATION',
  'DUPLICATE_INVOICE_JOURNAL_REJECTED',
  'BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION'
 ]){
  const diagnosis=explainSyncFailure(reason,'invoices');
  assert.equal(diagnosis.kind,'review-ledger',reason);
  assert.equal(diagnosis.safeToRetry,false);
 }
 const stale=explainSyncFailure('VERSION_CONFLICT','parties');
 assert.equal(stale.kind,'reopen-authoritative');
 assert.equal(stale.safeToRetry,false);
 const blocked=explainSyncFailure('PARTY_HAS_FINANCIAL_REFERENCES','parties');
 assert.equal(blocked.kind,'fix-input');
});
test('unknown financial rejections never silently retry or disappear',()=>{
 const unknown=explainSyncFailure('SOME_UNFAMILIAR_CODE','journalEntries');
 assert.equal(unknown.kind,'review-ledger');
 assert.equal(unknown.safeToRetry,false);
});

test('new stock item with opening quantity is queued atomically and auto-generated prefills are marked',()=>{
 const section=context.slice(context.indexOf('  const addInventoryItem = '),
   context.indexOf('  const updateInventoryItem = '));
 assert.match(section,/automaticallySuggested/);
 assert.match(section,/proposedAutoCode/);
 assert.match(section,/_serverAutoCode = true/);
 assert.match(section,/repo\.commit\(\[/);
 assert.match(section,/entity: 'inventory', id, value: newItem/);
 assert.match(section,/entity: 'stockMovements', id: openingMovement.id/);
 assert.doesNotMatch(section,/addStockMovement\(/);
 assert.match(section,/pushToServerSync\('inventory', newItem\)/);
});
