import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {LocalSyncDb} from '../src/sync-next/localDb';
import {LocalHttpSyncTransport} from '../src/sync-next/httpTransport';
import {recordKey} from '../src/sync-next/types';

const invoice = {id:'sale-id', invoiceNumber:'INV-0001', date:'2026-11-21', items:[], notes:'original'};
const row = {entity:'invoices' as const, id:invoice.id, value:invoice, version:3, key:recordKey('invoices',invoice.id)};
const change = {entity:row.entity, id:row.id, value:{...invoice,notes:'local edit'}};
const cursor = {seconds:0,nanoseconds:0,eventId:'bootstrap',sequence:1};

test('reload preserves a revision and lost reply retries the identical request on the revision endpoint', async () => {
  const name = crypto.randomUUID();
  let db = new LocalSyncDb(name);
  try {
    await db.initializeAuthoritativeSnapshot([row],cursor);
    const queued = await db.enqueue([change],crypto.randomUUID(),undefined,3);
    await db.close();
    db = new LocalSyncDb(name);
    assert.deepEqual(await db.pending(),[queued]);
    assert.deepEqual((await db.listVisible('invoices'))[0].value,invoice);
    const transport = new LocalHttpSyncTransport('https://localhost', 'token', name);
    const requests: unknown[] = [];
    const changes = [{...change,version:4}];
    transport.reviseInvoice = async body => {
      requests.push(body);
      if (requests.length === 1) throw Error('lost reply');
      return {commandId:body.commandId,changes};
    };
    await assert.rejects(transport.push(queued),/lost reply/);
    await db.applyEvent({commandId:queued.id,changes,cursor:{...cursor,sequence:2}});
    const [retry] = await db.pending();
    const receipt = await transport.push(retry);
    assert.deepEqual(requests[0],requests[1]);
    await db.ack(receipt.commandId,receipt.changes);
    assert.deepEqual(await db.pending(),[]);
    assert.deepEqual((await db.confirmedInvoice(row.id))?.value,change.value);
  } finally {await db.close();}
});

test('conflicting edit survives reload, leaves approved totals alone and needs a current explicit decision', async () => {
  const name = crypto.randomUUID();
  let db = new LocalSyncDb(name);
  try {
    await db.initializeAuthoritativeSnapshot([row],cursor);
    const queued = await db.enqueue([change],crypto.randomUUID(),undefined,3);
    await assert.rejects(db.enqueue([change],crypto.randomUUID(),undefined,3),/PENDING_LOCAL/);
    const other = {...change,value:{...invoice,notes:'other device'},version:4};
    await db.applyEvent({commandId:'other-device',changes:[other],cursor:{...cursor,sequence:2}});
    await db.markError(queued.id,'conflict','VERSION_CONFLICT');
    await db.close();
    db = new LocalSyncDb(name);
    assert.deepEqual((await db.pending())[0].changes[0].value,change.value);
    assert.deepEqual((await db.listVisibleGrouped(['invoices'])).invoices[0].value,other.value);
    await assert.rejects(db.resolveReviewedRevision(queued.id,3,true),/تغيرت/);
    await db.resolveReviewedRevision(queued.id,4,true);
    const [reviewed] = await db.pending();
    assert.notEqual(reviewed.id,queued.id);
    assert.equal(reviewed.changes[0].expectedVersion,4);
    assert.equal(reviewed.invoiceRevision,true);
    assert.deepEqual(reviewed.changes[0].value,change.value);
  } finally {await db.close();}
});

test('a new offline sale remains in the register after closing and reopening its local database',async () => {
  const name = crypto.randomUUID();
  let db = new LocalSyncDb(name);
  try {
    await db.initializeAuthoritativeSnapshot([],cursor);
    const id = 'inv-pos-' + crypto.randomUUID();
    const sale = {...invoice,id,invoiceNumber:'TEMP-1',notes:'offline',items:[{itemId:'item',quantity:2}]};
    const commandId = crypto.randomUUID();
    await db.enqueue([{entity:'invoices',id,value:sale}],commandId,id);
    await db.close();
    db = new LocalSyncDb(name);
    assert.deepEqual((await db.listVisibleGrouped(['invoices'])).invoices[0].value,sale);
    assert.equal((await db.pending())[0].id,commandId);
  } finally {await db.close();}
});
