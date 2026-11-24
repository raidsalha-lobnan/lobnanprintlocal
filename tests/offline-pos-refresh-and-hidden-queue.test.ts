import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import 'fake-indexeddb/auto';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {recordKey,type StoredRecord} from '../src/sync-next/types';

const partiesView=readFileSync(new URL('../src/components/PartiesView.tsx',import.meta.url),'utf8');
const salesView=readFileSync(new URL('../src/components/InvoicesView.tsx',import.meta.url),'utf8');

test('creating a new customer never closes the editor or plays success before awaited IndexedDB commit',()=>{
  const handler=partiesView.slice(partiesView.indexOf('const handleSaveParty ='),
    partiesView.indexOf('const handleDeleteParty ='));
  const awaitAt=handler.indexOf('const createdParty = await addParty(');
  const finished=handler.indexOf("finishMasterForm('party', savedPartyId)");
  const successBeep=handler.indexOf('posSound.playSuccessBeep();',awaitAt);
  assert.ok(handler.includes('const handleSaveParty = async'),'customer form must await storage');
  assert.ok(awaitAt>=0&&successBeep>awaitAt&&finished>awaitAt);
  assert.match(handler,/catch \(err: any\)[\s\S]*لم يُحفظ العميل على هذا الجهاز/);
  assert.match(partiesView,/disabled=\{isPartySaving\}/);
});

test('server-rejected offline invoice + customer survive refresh in the outbox, never falsely shown as official',async()=>{
  const namespace='durable-refresh-'+crypto.randomUUID();
  const workspace='work-'+crypto.randomUUID();
  const initial:StoredRecord={
    key:recordKey('inventory','item-1'),entity:'inventory',id:'item-1',version:1,
    value:{id:'item-1',code:'PRI-00001',name:'صنف'}
  };
  const before=new LocalSyncDb(workspace,namespace);
  try{
    await before.initializeAuthoritativeSnapshot([initial],
      {sequence:3,eventId:'boot',seconds:0,nanoseconds:0});
    const invoice=await before.enqueue([{entity:'invoices',id:'inv-pos-offline-01',
      value:{id:'inv-pos-offline-01',invoiceNumber:'TEMP-inv-pos-offline-01',totalAmount:110}}]);
    const customer=await before.enqueue([{entity:'parties',id:'pt-offline-01',
      value:{id:'pt-offline-01',name:'عميل أوفلاين',code:'CUST-0200'}}]);
    assert.equal((await before.listVisible('invoices')).length,1);
    assert.equal((await before.listVisible('parties')).length,1);
    await before.markError(invoice.id,'rejected','ENTITY_PERMISSION_DENIED');
    await before.markError(customer.id,'rejected','VERSION_CONFLICT');
    // The ordinary official projection hides rejected records on purpose.
    assert.equal((await before.listVisible('invoices')).length,0);
    assert.equal((await before.listVisible('parties')).length,0);
  } finally {await before.close()}
  const after=new LocalSyncDb(workspace,namespace);
  try{
    assert.equal(await after.bootstrapStatus(),'initialized');
    const queued=await after.pending();
    assert.equal(queued.length,2,'refresh must never erase locally committed commands');
    assert.deepEqual(queued.map(c=>c.status),['rejected','rejected']);
    assert.equal(queued.find(c=>c.changes[0].entity==='invoices')?.changes[0].value?.invoiceNumber,
      'TEMP-inv-pos-offline-01');
    assert.equal(queued.find(c=>c.changes[0].entity==='parties')?.changes[0].value?.name,
      'عميل أوفلاين');
    assert.equal((await after.cursor())?.sequence,3);
  } finally {await after.close()}
});

test('sales and customer headers disclose local/rejected outbox state instead of silently hiding it',()=>{
  assert.match(salesView,/setLocalInvoiceQueue\(operations\)/);
  assert.match(salesView,/sales-invoices-local-queue/);
  assert.match(salesView,/localBlockedInvoices/);
  assert.match(partiesView,/customers-local-outbox/);
  assert.match(partiesView,/localPartyQueue\.blocked/);
});

const quickAdd=readFileSync(new URL('../src/components/pos/QuickAddPartyModal.tsx',import.meta.url),'utf8');
const posView=readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');

test('POS quick-add customer waits for the local write and keeps inputs on failure',()=>{
 const start=quickAdd.indexOf('const handleSubmit = async');
 const end=quickAdd.indexOf('\n  return (',start);
 const section=quickAdd.slice(start,end);
 assert.match(section,/const created = await addParty\(/);
 assert.match(section,/onSuccess\(\{ id: created\.id/);
 assert.ok(section.indexOf('const created = await addParty(')<section.indexOf('onSuccess({ id: created.id'));
 assert.match(section,/setErrorMessage\('لم يتم حفظ الطرف على هذا الجهاز/);
 assert.match(quickAdd,/disabled=\{savingEntry\}/);
});

test('cashier and customer editors warn on reload ONLY while a durable save is in progress',()=>{
 assert.match(posView,/posSaveUiInFlightRef\.current\)return;[\s\S]*?event\.preventDefault\(\)/);
 assert.match(partiesView,/partySaveInFlightRef\.current\)return;[\s\S]*?event\.preventDefault\(\)/);
 assert.match(quickAdd,/saveInFlightRef\.current\)return;[\s\S]*?event\.preventDefault\(\)/);
});
