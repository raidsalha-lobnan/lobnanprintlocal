import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {SyncCoordinator,type SyncTransport} from '../src/sync-next/coordinator';
import {PermanentSyncError,type ProposedChange,type StoredRecord,type ServerCursor} from '../src/sync-next/types';

const cursor:ServerCursor={sequence:1,seconds:0,nanoseconds:0,eventId:'1'};
const catalog:StoredRecord[]=[
  {key:'parties\u001fcustomer-1',entity:'parties',id:'customer-1',version:1,
   value:{id:'customer-1',type:'customer',code:'CUST-0002',balance:0}},
  {key:'inventory\u001fstock-1',entity:'inventory',id:'stock-1',version:1,
   value:{id:'stock-1',code:'PRI-00001',purchasePrice:3,stockQuantity:-1}}
];
const sale=(id:string):ProposedChange[]=>[
  {entity:'invoices',id,value:{id,isAccountingPosted:true,customerId:'customer-1',invoiceNumber:'TEMP-'+id,totalAmount:15}},
  {entity:'journalEntries',id:'journal-'+id,value:{id:'journal-'+id,referenceType:'pos_invoice',referenceId:id}},
  {entity:'stockMovements',id:'movement-'+id,value:{id:'movement-'+id,itemId:'stock-1',
    sourceInvoiceId:id,referenceType:'pos_invoice',type:'out_sale',quantity:1}},
  {entity:'parties',id:'customer-1',value:{...catalog[0].value!,balance:15}},
  {entity:'inventory',id:'stock-1',value:{...catalog[1].value!,stockQuantity:-2}}
];
async function prepare(name:string){
 const db=new LocalSyncDb(name+'-'+crypto.randomUUID());
 await db.initializeAuthoritativeSnapshot(catalog,cursor);
 return db;
}
function stub(overrides:Partial<SyncTransport>={}):SyncTransport{
 return {
   async push(cmd){return {commandId:cmd.id,changes:cmd.changes.map(c=>({...c,version:c.expectedVersion+1}))};},
   async pull(){return [];},
   async fetchAuthoritativeBootstrap(){return {records:catalog,cursor};},
   watchLatest(){return ()=>{};},
   ...overrides
 };
}

test('one rejected atomic sale does not block a newer independent sale of the same existing stock and customer',async()=>{
 const db=await prepare('sale-bypass');
 const old=await db.enqueue(sale('sale-aaa'),'command-aaa','sale-aaa');
 await db.markError(old.id,'rejected','ATOMIC_POS_STOCK_DELTA_INCONSISTENT');
 const newer=await db.enqueue(sale('sale-bbb'),'command-bbb','sale-bbb');
 assert.equal(newer.changes.find(c=>c.entity==='inventory')?.expectedVersion,1,
  'do not invent version 2 from a rejected local invoice');
 assert.equal(newer.changes.find(c=>c.entity==='parties')?.expectedVersion,1);
 const sent:string[]=[];
 const remote=stub({
  async push(cmd){sent.push(cmd.id);
   assert.equal(cmd.id,newer.id,'never resend an old rejection without server capability');
   return {commandId:cmd.id,changes:cmd.changes.map(c=>({...c,version:c.expectedVersion+1}))};
  }
 });
 const coord=new SyncCoordinator(db,remote,'lobnan_main');
 try{
  await coord.start();await coord.waitUntilIdle();
  assert.deepEqual(sent,[newer.id]);
  assert.deepEqual((await db.pending()).map(c=>c.id),[old.id]);
 }finally{coord.stop();await db.close();}
});

test('server-advertised atomic repair retries original rejected command exactly once and acknowledges receipt',async()=>{
 const db=await prepare('automatic-repair');
 const old=await db.enqueue(sale('sale-ccc'),'command-ccc','sale-ccc');
 await db.markError(old.id,'rejected','ATOMIC_POS_STOCK_METADATA_CHANGE_FORBIDDEN');
 const sent:string[]=[];
 const remote=stub({
  async supportsAtomicPosRebase(){return true;},
  async push(cmd){sent.push(cmd.id);
   return {commandId:cmd.id,changes:cmd.changes.map(c=>({...c,version:c.expectedVersion+1}))};}
 });
 const coord=new SyncCoordinator(db,remote,'lobnan_main');
 try{
  await coord.start();await coord.waitUntilIdle();
  assert.deepEqual(sent,[old.id]);
  assert.equal((await db.pending()).length,0);
 }finally{coord.stop();await db.close();}
});

test('without backend feature proof the rejected accounting command is not retried',async()=>{
 const db=await prepare('no-feature');
 const old=await db.enqueue(sale('sale-ddd'),'command-ddd','sale-ddd');
 await db.markError(old.id,'rejected','ATOMIC_POS_STOCK_DELTA_INCONSISTENT');
 let sends=0;
 const remote=stub({
  async supportsAtomicPosRebase(){return false;},
  async push(){sends++;throw Error('Unsafe retry');}
 });
 const coord=new SyncCoordinator(db,remote,'lobnan_main');
 try{
  await coord.start();await coord.waitUntilIdle();
  assert.equal(sends,0);
  assert.equal((await db.pending())[0].status,'rejected');
 }finally{coord.stop();await db.close();}
});

test('a refused recovery stays durable and never retries repeatedly',async()=>{
 const db=await prepare('one-repair');
 const old=await db.enqueue(sale('sale-eee'),'command-eee','sale-eee');
 await db.markError(old.id,'rejected','ATOMIC_POS_STOCK_DELTA_INCONSISTENT');
 let sends=0;
 const remote=stub({
  async supportsAtomicPosRebase(){return true;},
  async push(){sends++;throw new PermanentSyncError('ATOMIC_POS_COST_CHANGED_REFRESH_SALE');}
 });
 const coord=new SyncCoordinator(db,remote,'lobnan_main');
 try{
  await coord.start();await coord.waitUntilIdle();
  coord.requestSync();await coord.waitUntilIdle();
  assert.equal(sends,1);
  const pending=await db.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].status,'rejected');
  assert.equal(pending[0].autoRecoveryAttempts,1);
 }finally{coord.stop();await db.close();}
});

test('an unrelated ordinary customer edit does NOT receive atomic-sale dependency bypass',async()=>{
 const db=await prepare('no-ordinary-bypass');
 const edit=await db.enqueue([{entity:'parties',id:'customer-1',
  value:{...catalog[0].value!,name:'An uncommitted edit'}}],'command-edited');
 await db.markError(edit.id,'rejected','VERSION_CONFLICT');
 await assert.rejects(()=>db.enqueue(sale('sale-fff'),'command-fff','sale-fff'),
  /RECORD_HAS_UNRESOLVED_CONFLICT/);
 assert.equal((await db.pending()).length,1);
 await db.close();
});

test('different new POS invoices never bypass collision on a shared JOURNAL or invoice identity',async()=>{
 const db=await prepare('no-journal-bypass');
 const old=await db.enqueue(sale('sale-ggg'),'command-ggg','sale-ggg');
 await db.markError(old.id,'rejected','ENTITY_PERMISSION_DENIED');
 const duplicate=sale('sale-hhh').map(c=>c.entity==='journalEntries'
  ? {...c,id:'journal-sale-ggg',value:{...c.value!,id:'journal-sale-ggg'}} : c);
 await assert.rejects(()=>db.enqueue(duplicate,'command-hhh','sale-hhh'),
  /RECORD_HAS_UNRESOLVED_CONFLICT/);
 await db.close();
});
