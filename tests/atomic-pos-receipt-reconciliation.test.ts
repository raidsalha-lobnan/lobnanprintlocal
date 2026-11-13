import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator,type SyncTransport} from '../src/sync-next/coordinator';
import {matchesCommittedAtomicPosReceipt} from '../src/sync-next/atomicReceiptProof';
import type {StoredRecord,ServerCursor,CommitReceipt} from '../src/sync-next/types';

const cursor:ServerCursor={sequence:1,seconds:0,nanoseconds:0,eventId:'1'};
const records:StoredRecord[]=[
 {key:'inventory\u001fitem',entity:'inventory',id:'item',version:1,
  value:{id:'item',code:'PRI-00001',stockQuantity:-2,purchasePrice:90}},
 {key:'parties\u001fcustomer',entity:'parties',id:'customer',version:1,
  value:{id:'customer',type:'customer',code:'CUST-0002',balance:0}}
];
const proposed=[
 {entity:'invoices' as const,id:'invoice',value:{id:'invoice',invoiceNumber:'TEMP-invoice',
    isAccountingPosted:true,customerId:'customer',totalAmount:697.5}},
 {entity:'journalEntries' as const,id:'sales-journal',value:{id:'sales-journal'}},
 {entity:'journalEntries' as const,id:'cogs-journal',value:{id:'cogs-journal'}},
 {entity:'stockMovements' as const,id:'stock-movement',value:{id:'stock-movement'}},
 {entity:'inventory' as const,id:'item',value:{...records[0].value,stockQuantity:-6.75}},
 {entity:'parties' as const,id:'customer',value:{...records[1].value,balance:697.5}}
];
async function setup(){
 const db=new LocalSyncDb('atomic-receipt-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot(records,cursor);
 const cmd=await db.enqueue(proposed,'ebb9581a-b513-45a3-ba97-0e9580163a41','invoice');
 await db.markError(cmd.id,'rejected','ATOMIC_POS_STOCK_METADATA_CHANGE_FORBIDDEN');
 const current=(await db.pending())[0];
 const receipt:CommitReceipt={
  commandId:cmd.id,
  changes:current.changes.map(c=>({
   entity:c.entity,id:c.id,version:c.expectedVersion+1,
   value:c.entity==='invoices'
    ? {...c.value,invoiceNumber:'INV-0274',isOfficial:true}
    : c.entity==='inventory'
     ? {...c.value,stockQuantity:-6.75,warehouseCacheReconciliationRequired:true}
     : c.value
  }))
 };
 return {db,current,receipt};
}
function transport(overrides:Partial<SyncTransport>):SyncTransport{
 return {async push(){throw Error('NEVER_REPLAY_VERIFIED_FINANCIAL_COMMAND');},
  async pull(){return []},
  async fetchAuthoritativeBootstrap(){return {records,cursor}},
  watchLatest(){return ()=>{}},
  ...overrides};
}
test('server-proven fingerprint receipt resolves a previously rejected atomic invoice with NO replay',async()=>{
 const {db,current,receipt}=await setup();
 assert.equal(matchesCommittedAtomicPosReceipt(current,receipt),true);
 let checks=0;
 const coordinator=new SyncCoordinator(db,transport({
  async checkAtomicPosReceipts(proofs){
   checks++;assert.equal(proofs.length,1);assert.equal(proofs[0].id,current.id);
   assert.match(proofs[0].fingerprint,/^[a-f0-9]{64}$/);
   return [receipt];
  }
 }), 'lobnan_main');
 try{
  await coordinator.start();
  await coordinator.waitUntilIdle();
  assert.ok(checks>=1);
  assert.equal((await db.pending()).length,0);
  const invoice=(await db.listVisible('invoices')).find(r=>r.id==='invoice');
  assert.equal(invoice?.value?.invoiceNumber,'INV-0274');
  assert.equal((await db.listVisible('inventory')).find(r=>r.id==='item')?.value?.stockQuantity,-6.75);
 }finally{coordinator.stop();await db.close()}
});
test('a receipt with different invoice amount is rejected and original outbox remains preserved',async()=>{
 const {db,current,receipt}=await setup();
 const bad={...receipt,changes:receipt.changes.map(c=>c.entity==='invoices'
  ? {...c,value:{...c.value,totalAmount:999}}:c)};
 assert.equal(matchesCommittedAtomicPosReceipt(current,bad),false);
 const coordinator=new SyncCoordinator(db,transport({
  async checkAtomicPosReceipts(){return [bad]}
 }), 'lobnan_main');
 try{
  await coordinator.start();
  await coordinator.waitUntilIdle();
  const pending=await db.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].status,'rejected');
 }finally{coordinator.stop();await db.close()}
});
