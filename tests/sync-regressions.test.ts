import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJsonObject, validateChanges, VersionConflict, type SyncCommand } from '../src/sync-next/types';
import { SyncCoordinator, type SyncTransport } from '../src/sync-next/coordinator';
import type { LocalSyncDb } from '../src/sync-next/localDb';

test('optional undefined omitted without losing valid form entries', () => {
  const nested = { label: 'جديد' };
  const obj = toJsonObject({ id: 'customer-1', nickname: undefined as any,
    nested, also: nested, lines: [undefined as any, 5] });
  assert.deepEqual(obj, { id: 'customer-1', nested: { label: 'جديد' },
    also: { label: 'جديد' }, lines: [null, 5] });
  assert.throws(() => toJsonObject({ total: NaN }), /non-finite/);
  const cyc: any = {}; cyc.self = cyc;
  assert.throws(() => toJsonObject(cyc), /Circular/);
});

test('a nested list is not valid as one entity record', () => {
  assert.throws(() => validateChanges([{ entity: 'treasuries', id: 'invalid', value: [] as any }]), /plain object/);
});

class FakeLocal {
  commands: SyncCommand[];
  constructor(command: SyncCommand) { this.commands = [command]; }
  async pending(){ return [...this.commands]; }
  async ack(id: string){ this.commands = this.commands.filter(c => c.id !== id); }
  async markError(id: string,status: SyncCommand['status'],reason: string){
    this.commands = this.commands.map(c => c.id === id ? { ...c, status, error: reason, attempts: c.attempts + 1 } : c);
  }
  async cursor(){ return null; }
  async applyEvent(){}
}
function command(id: string): SyncCommand {
  return { id, workspaceId:'main',createdAt:1,attempts:0,retryAt:0,status:'pending',
    changes:[{entity:'invoices',id:'invoice-1',value:{id:'invoice-1'},expectedVersion:0}] };
}
function makeRemote(pusher: SyncTransport['push']): SyncTransport {
  return {push:pusher,pull:async()=>[],watchLatest:()=>()=>{}};
}
test('server failure cannot mark queued accounting invoice as synced', async () => {
  const local = new FakeLocal(command('failed-op'));
  const coordinator = new SyncCoordinator(local as unknown as LocalSyncDb,
    makeRemote(async()=>{throw new VersionConflict('invoices','invoice-1',0,2);}));
  await coordinator.start(); await coordinator.waitUntilIdle();
  // Conflicted financial work must never be reported as a successful sync.
  await assert.rejects(()=>coordinator.syncNow(),/SYNC_INCOMPLETE/);
  assert.equal(local.commands.length,1);
  assert.equal(local.commands[0].status,'conflict');
  coordinator.stop();
});
test('server ACK publishes record to active UI subscribers',async()=>{
  const local = new FakeLocal(command('ok-op'));
  const coordinator = new SyncCoordinator(local as unknown as LocalSyncDb,
    makeRemote(async c=>({commandId:c.id,changes:[{entity:'invoices',id:'invoice-1',version:1,value:{id:'invoice-1',invoiceNumber:'INV-0001'}}]})));
  let received = '';
  coordinator.onApplied(changes => {received = String((changes[0].value as any)?.invoiceNumber);});
  await coordinator.start();await coordinator.waitUntilIdle();
  assert.equal(received,'INV-0001');
  assert.equal(local.commands.length,0);
  coordinator.stop();
});
