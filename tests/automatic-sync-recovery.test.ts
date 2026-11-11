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
