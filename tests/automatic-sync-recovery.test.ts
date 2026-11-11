import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {explainSyncFailure} from '../src/sync-next/syncFailureGuide';
import {classifyQueueSafety} from '../src/sync-next/queueSafety';
import 'fake-indexeddb/auto';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator} from '../src/sync-next/coordinator';

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

test('secondary-device rejected stock item cannot be deleted as an unprotected queue entry',()=>{
 const cmd={id:'rejected-stock',workspaceId:'w',createdAt:0,
  retryAt:0,attempts:1,status:'rejected',error:'ENTITY_SERIAL_ALREADY_USED',
  changes:[{entity:'inventory',id:'inv-1',expectedVersion:0,
   value:{id:'inv-1',code:'PRI-00002'}}]};
 const classification=classifyQueueSafety(cmd as any);
 assert.equal(classification.allowDiscard,false);
 assert.equal(classification.allowRenumber,false);
 assert.equal(classification.allowRetry,false);
});
test('reconnection resets only transient network retry delays, not rejected accounting actions',async()=>{
 const db=new LocalSyncDb('w-'+crypto.randomUUID());
 const cmd=await db.enqueue([{entity:'inventory',id:'inv-a',
  value:{id:'inv-a',code:'PRI-00002'}}]);
 await db.markError(cmd.id,'pending','LOCAL_SYNC_HTTP_503',Date.now()+600000);
 const blocked=await db.enqueue([{entity:'invoices',id:'inv-b',
  value:{id:'inv-b',invoiceNumber:'TEMP-x'}}]);
 await db.markError(blocked.id,'rejected','ENTITY_PERMISSION_DENIED');
 const coordinator=new SyncCoordinator(db as any,{} as any,'w');
 await (coordinator as any).releaseTransportBackoffAfterReconnect();
 const current=await db.pending();
 const network=current.find(x=>x.id===cmd.id)!;
 const denied=current.find(x=>x.id===blocked.id)!;
 assert.equal(network.status,'pending');
 assert.equal(network.retryAt,0);
 assert.equal(denied.status,'rejected');
 assert.equal(denied.error,'ENTITY_PERMISSION_DENIED');
 await db.close();
});
test('local receipt-review flag does not trigger the hazardous unbootstrapped migration gate',()=>{
 const boot=readFileSync(new URL('../src/sync-next/boot.ts',import.meta.url),'utf8');
 assert.match(context,/lobnan_postgres_receipt_review_required/);
 assert.doesNotMatch(context,/setItem\('lobnan_postgres_reconciliation_required'/);
 assert.match(boot,/confirmedCursor/);
 assert.match(boot,/localStorage\.removeItem\('lobnan_postgres_reconciliation_required'\)/);
});
