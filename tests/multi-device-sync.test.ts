import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncCoordinator, type SyncTransport } from '../src/sync-next/coordinator';
import { LocalSyncDb } from '../src/sync-next/localDb';
import {
  AppliedChange,
  CommitReceipt,
  ServerCursor,
  ServerEvent,
  SyncCommand,
  VersionConflict
} from '../src/sync-next/types';
import { buildAtomicPosting } from '../src/sync-next/accountingPosting';

class SharedServerTransport implements SyncTransport {
  events: ServerEvent[] = [];
  records = new Map<string, { value: any; version: number }>();
  counters = new Map<string, number>();
  clients = new Set<() => void>();

  async push(command: SyncCommand): Promise<CommitReceipt> {
    const applied: AppliedChange[] = [];

    for (const c of command.changes) {
      const recKey = `${c.entity}/${c.id}`;
      const existing = this.records.get(recKey);
      const actualVersion = existing?.version ?? 0;

      if (actualVersion !== c.expectedVersion) {
        throw new VersionConflict(c.entity, c.id, c.expectedVersion, actualVersion);
      }

      let val = c.value ? { ...c.value } : null;
      if (val && c.entity === 'invoices') {
        const invNum = String(val.invoiceNumber || '');
        if (!invNum || invNum.startsWith('TEMP-')) {
          const year = '2026';
          const counterKey = `invoices_${year}`;
          const currentSeq = (this.counters.get(counterKey) ?? 0) + 1;
          this.counters.set(counterKey, currentSeq);
          val.invoiceNumber = `INV-${String(currentSeq).padStart(4, '0')}`;
          val.isOfficial = true;
          val.officialAllocatedAt = Date.now();
        }
      }

      const nextVersion = actualVersion + 1;
      this.records.set(recKey, { value: val, version: nextVersion });
      applied.push({
        entity: c.entity,
        id: c.id,
        value: val,
        version: nextVersion
      });
    }

    const cursor: ServerCursor = {
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: 0,
      eventId: command.id,
      sequence: this.events.length + 1
    };

    const event: ServerEvent = {
      commandId: command.id,
      changes: applied,
      cursor
    };

    this.events.push(event);

    // Broadcast to online listeners
    for (const notify of this.clients) {
      try { notify(); } catch {}
    }

    return { commandId: command.id, changes: applied };
  }

  async pull(cursor: ServerCursor | null, pageSize = 100): Promise<ServerEvent[]> {
    if (!cursor) {
      return this.events.slice(0, pageSize);
    }
    const idx = this.events.findIndex(e => e.commandId === cursor.eventId);
    if (idx === -1) {
      return this.events.slice(0, pageSize);
    }
    return this.events.slice(idx + 1, idx + 1 + pageSize);
  }

  watchLatest(onChanged: () => void): () => void {
    this.clients.add(onChanged);
    return () => this.clients.delete(onChanged);
  }
}

test('Mandatory Acceptance Test: Two-device sync, offline disconnect/reconnect, atomic sequential numbering & zero loss', async () => {
  const server = new SharedServerTransport();

  const dbA = new LocalSyncDb('device_A_workspace');
  const dbB = new LocalSyncDb('device_B_workspace');

  const coordA = new SyncCoordinator(dbA, server, 'device_A_workspace');
  const coordB = new SyncCoordinator(dbB, server, 'device_B_workspace');

  let stateA: Record<string, any>[] = [];
  let stateB: Record<string, any>[] = [];

  coordA.onApplied(async () => {
    const list = await dbA.listVisible('invoices');
    stateA = list.map(r => r.value as Record<string, any>);
  });

  coordB.onApplied(async () => {
    const list = await dbB.listVisible('invoices');
    stateB = list.map(r => r.value as Record<string, any>);
  });

  await coordA.start();
  await coordB.start();
  await coordA.waitUntilIdle();
  await coordB.waitUntilIdle();

  // --- Step 1: Device A creates Invoice 1 online ---
  const invA_Id = 'inv-A-' + crypto.randomUUID().slice(0, 8);
  const postingA = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: invA_Id,
    document: {
      id: invA_Id,
      customerName: 'عميل أ',
      totalAmount: 1500,
      invoiceNumber: `TEMP-INV-2026-${invA_Id}`
    },
    journalId: 'journal-A-' + crypto.randomUUID().slice(0, 8),
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      { accountId: '1101', debitMinor: 150000, creditMinor: 0 },
      { accountId: '4101', debitMinor: 0, creditMinor: 150000 }
    ],
    movements: [
      { entity: 'stockMovements', id: 'sm-A', value: { id: 'sm-A', sourceDocumentId: invA_Id, quantity: -10 } }
    ]
  });

  await dbA.enqueue(postingA);
  coordA.requestSync();
  await coordA.waitUntilIdle();
  await coordB.waitUntilIdle();

  const inv1_DeviceA = (await dbA.listVisible('invoices')).find(r => r.id === invA_Id)?.value as any;
  assert.ok(inv1_DeviceA);
  assert.equal(inv1_DeviceA.invoiceNumber, 'INV-0001');
  assert.equal(inv1_DeviceA.isOfficial, true);

  // --- Step 2: Device B goes offline & creates Invoice 2 locally ---
  // Simulate Device B network disconnection by stopping coordinator B
  coordB.stop();

  const invB_Id = 'inv-B-' + crypto.randomUUID().slice(0, 8);
  const tempNumberB = `TEMP-INV-2026-OFFLINE-B`;
  const postingB = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: invB_Id,
    document: {
      id: invB_Id,
      customerName: 'عميل ب',
      totalAmount: 2500,
      invoiceNumber: tempNumberB
    },
    journalId: 'journal-B-' + crypto.randomUUID().slice(0, 8),
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      { accountId: '1101', debitMinor: 250000, creditMinor: 0 },
      { accountId: '4101', debitMinor: 0, creditMinor: 250000 }
    ],
    movements: [
      { entity: 'stockMovements', id: 'sm-B', value: { id: 'sm-B', sourceDocumentId: invB_Id, quantity: -5 } }
    ]
  });

  await dbB.enqueue(postingB);
  // While offline, local DB shows invoice with temporary number
  const inv2_OfflineDeviceB = (await dbB.listVisible('invoices')).find(r => r.id === invB_Id)?.value as any;
  assert.ok(inv2_OfflineDeviceB);
  assert.equal(inv2_OfflineDeviceB.invoiceNumber, tempNumberB);

  // --- Step 3: Device A (online) creates Invoice 3 ---
  const invC_Id = 'inv-C-' + crypto.randomUUID().slice(0, 8);
  const postingC = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: invC_Id,
    document: {
      id: invC_Id,
      customerName: 'عميل ج',
      totalAmount: 3200,
      invoiceNumber: `TEMP-INV-2026-${invC_Id}`
    },
    journalId: 'journal-C-' + crypto.randomUUID().slice(0, 8),
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      { accountId: '1101', debitMinor: 320000, creditMinor: 0 },
      { accountId: '4101', debitMinor: 0, creditMinor: 320000 }
    ],
    movements: [
      { entity: 'stockMovements', id: 'sm-C', value: { id: 'sm-C', sourceDocumentId: invC_Id, quantity: -2 } }
    ]
  });

  await dbA.enqueue(postingC);
  coordA.requestSync();
  await coordA.waitUntilIdle();

  const inv3_DeviceA = (await dbA.listVisible('invoices')).find(r => r.id === invC_Id)?.value as any;
  assert.ok(inv3_DeviceA);
  assert.equal(inv3_DeviceA.invoiceNumber, 'INV-0002');

  // --- Step 4: Device B reconnects to network ---
  await coordB.start();
  coordB.requestSync();
  await coordB.waitUntilIdle();
  await coordA.waitUntilIdle();

  // --- Step 5: Final Cross-Device Reconciled State Validation ---
  const finalInvoicesA = (await dbA.listVisible('invoices')).map(r => r.value as any);
  const finalInvoicesB = (await dbB.listVisible('invoices')).map(r => r.value as any);

  assert.equal(finalInvoicesA.length, 3, 'Device A must hold exactly 3 invoices');
  assert.equal(finalInvoicesB.length, 3, 'Device B must hold exactly 3 invoices');

  // Build maps by immutable UUID `id`
  const mapA = new Map(finalInvoicesA.map(i => [i.id, i]));
  const mapB = new Map(finalInvoicesB.map(i => [i.id, i]));

  // Validate every invoice matches 100% on both devices
  for (const [id, invA] of mapA) {
    const invB = mapB.get(id);
    assert.ok(invB, `Device B missing invoice ${id}`);
    assert.equal(invA.id, invB.id, 'Immutable UUID id must match');
    assert.equal(invA.invoiceNumber, invB.invoiceNumber, 'Official sequential invoice number must match');
    assert.equal(invA.customerName, invB.customerName, 'Customer name must match');
    assert.equal(invA.totalAmount, invB.totalAmount, 'Total amount must match');
    assert.equal(invA.isOfficial, true, 'Invoice must be marked official after cloud confirmation');
  }

  // Validate official invoice numbers allocated sequentially without gap or duplicate
  const officialNumbersA = finalInvoicesA.map(i => i.invoiceNumber).sort();
  const officialNumbersB = finalInvoicesB.map(i => i.invoiceNumber).sort();

  assert.deepEqual(officialNumbersA, ['INV-0001', 'INV-0002', 'INV-0003']);
  assert.deepEqual(officialNumbersB, ['INV-0001', 'INV-0002', 'INV-0003']);

  coordA.stop();
  coordB.stop();
  await dbA.close();
  await dbB.close();
});
