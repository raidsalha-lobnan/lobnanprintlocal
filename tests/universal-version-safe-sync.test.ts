import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalSyncDb } from '../src/sync-next/localDb';
import { UnifiedRepository } from '../src/sync-next/repository';
import type { SyncCoordinator } from '../src/sync-next/coordinator';
import type { EntityName, ServerEvent, ServerCursor, StoredRecord } from '../src/sync-next/types';

const cursor = (n: number): ServerCursor => ({seconds: 1794475000, nanoseconds: n, sequence:n, eventId:'test-'+n});
const row=(entity:EntityName,id:string,version:number,value:Record<string,unknown>):StoredRecord=>
  ({key:entity+'\u001f'+id,entity,id,version,value:value as StoredRecord['value']});
const event=(seq:number,version:number,edited:string):ServerEvent=>({
  commandId:'sync-event-'+seq,
  cursor:cursor(seq),
  changes:[
    {entity:'parties',id:'party-general',version,value:{id:'party-general',code:'CUST-0045',name:edited,balance:80}},
    {entity:'invoices',id:'invoice-general',version,value:{id:'invoice-general',invoiceNumber:'INV-0172',customerId:'party-general',totalAmount:80,revision:version}},
    {entity:'inventory',id:'sku-general',version,value:{id:'sku-general',name:'Item '+version,stockQuantity:10}},
    {entity:'settings',id:'global',version,value:{id:'global',companyName:'Company '+version}},
    {entity:'warehouseOperations',id:'wh-general',version,value:{id:'wh-general',status:'revision-'+version}}
  ]
});
const setup=async(name:string)=>{
  const local=new LocalSyncDb(name, 'lobnan-e2e-version-snapshot');
  await local.initializeAuthoritativeSnapshot([
    row('parties','party-general',1,{id:'party-general',code:'CUST-0045',name:'الاسم السابق',balance:80}),
    row('invoices','invoice-general',1,{id:'invoice-general',invoiceNumber:'INV-0172',customerId:'party-general',totalAmount:80,revision:1}),
    row('inventory','sku-general',1,{id:'sku-general',name:'Item 1',stockQuantity:10}),
    row('settings','global',1,{id:'global',companyName:'Company 1'}),
    row('warehouseOperations','wh-general',1,{id:'wh-general',status:'revision-1'})
  ],cursor(0));
  return local;
};
test('A one-character customer edit propagates to every open tab from an authenticated event', async()=>{
  const name='lobnan-cross-tab-'+crypto.randomUUID();
  const tabA=await setup(name);
  const tabB=new LocalSyncDb(name,'lobnan-e2e-version-snapshot');
  let crossTabSignals=0;
  const stop=tabB.subscribe(changed=>{if(changed)crossTabSignals++;});
  try{
    await tabA.applyEvent(event(1,2,'الاسم السابف'));
    const a=await tabA.listVisibleGrouped(['parties','invoices','inventory','settings','warehouseOperations']);
    const b=await tabB.listVisibleGrouped(['parties','invoices','inventory','settings','warehouseOperations']);
    assert.deepEqual(b,a);
    assert.equal(b.parties[0]?.value?.name,'الاسم السابف');
    assert.equal(b.invoices[0]?.value?.customerId,'party-general');
    assert.equal(b.invoices[0]?.value?.totalAmount,80);
    for(let attempt=0;attempt<25&&!crossTabSignals;attempt++){
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.ok(crossTabSignals>0,'other open tab should be notified');
  }finally{
    stop();await tabA.close();await tabB.close();
  }
});
test('Out-of-order older sync events can never revert a newer customer or inventory version',async()=>{
  const db=await setup('lobnan-out-of-order-'+crypto.randomUUID());
  try{
    await db.applyEvent(event(3,3,'الاسم الصحيح 3'));
    await db.applyEvent(event(2,2,'اسم قديم 2'));
    const data=await db.listVisibleGrouped(['parties','invoices','inventory','settings','warehouseOperations']);
    for(const key of ['parties','invoices','inventory','settings','warehouseOperations']){
      assert.equal(data[key].length,1);
      assert.equal(data[key][0].version,3);
    }
    assert.equal(data.parties[0].value?.name,'الاسم الصحيح 3');
    assert.equal(data.settings[0].value?.companyName,'Company 3');
  }finally{await db.close();}
});
test('Atomic grouped screen reads never mix invoice and customer revisions',async()=>{
  const db=await setup('lobnan-atomic-ui-'+crypto.randomUUID());
  try{
    for(let revision=2;revision<=17;revision++){
      const apply=db.applyEvent(event(revision,revision,'اسم '+revision));
      const read=db.listVisibleGrouped(['parties','invoices','inventory','settings']);
      const snapshot=await read;
      await apply;
      assert.equal(snapshot.parties[0].version,snapshot.invoices[0].version);
      assert.equal(snapshot.parties[0].version,snapshot.inventory[0].version);
      assert.equal(snapshot.parties[0].version,snapshot.settings[0].version);
      const after=await db.listVisibleGrouped(['parties','invoices']);
      assert.equal(after.parties[0].version,revision);
      assert.equal(after.invoices[0].version,revision);
    }
  }finally{await db.close();}
});
test('UnifiedRepository reads every visible entity from the consistent grouped view',async()=>{
  const db=await setup('lobnan-ui-entity-all-'+crypto.randomUUID());
  const repo=new UnifiedRepository(db,{requestSync(){}} as unknown as SyncCoordinator);
  try{
    const result=await repo.getAllVisibleGrouped();
    assert.equal(result.parties.length,1);
    assert.equal(result.invoices.length,1);
    assert.equal(result.inventory.length,1);
    assert.equal(result.settings.length,1);
    assert.equal(result.warehouseOperations.length,1);
    for(const entity of ['vouchers','purchases','salesReturns','purchaseReturns','journalEntries','accounts','treasuries','treasuryTransactions','expenses','employees','payrollSheets','stockMovements','companies','branches','warehouses','roles','users','dailyEntrySheets','debtClearings','printOrders']){
      assert.ok(Array.isArray(result[entity]),entity+' missing from unified view');
    }
  }finally{await db.close();}
});
test('Legacy unversioned state subscriptions cannot bypass canonical IndexedDB projections',()=>{
  const source=readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');
  assert.ok(!source.includes('layer.coordinator.onApplied(changes =>'),
    'raw server event bypass would apply old values after IndexedDB rejects them');
  assert.ok(!source.includes("window.addEventListener('storage', handleStorageEvent)"),
    'full localStorage arrays must not overwrite PostgreSQL record versions');
  assert.ok(!source.includes('setParties(data);'),
    'raw legacy BroadcastChannel snapshots must not bypass the version check');
});
