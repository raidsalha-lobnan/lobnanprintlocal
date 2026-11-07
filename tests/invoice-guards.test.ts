import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditInvoices,
  prepareNewOfflineInvoice,
  type InvoiceAuditRow
} from '../src/sync-next/invoiceSyncGuard';
import { planInvoiceNumbers } from '../src/sync-next/invoiceNumberGuard';
import type { VersionedChange } from '../src/sync-next/types';

test('prepareNewOfflineInvoice assigns TEMP prefix and marks invoice as unofficial', () => {
  const inv = prepareNewOfflineInvoice({
    id: 'inv-uuid-abc-123',
    customerName: 'عميل تجريبي',
    totalAmount: 500
  });

  assert.equal(inv.id, 'inv-uuid-abc-123');
  assert.equal(inv.invoiceNumber, 'TEMP-inv-uuid-abc-123');
  assert.equal(inv.isOfficial, false);

  assert.throws(() => {
    prepareNewOfflineInvoice({ id: '' } as any);
  }, /stable ID/);
});

test('auditInvoices accurately detects NUMBER_COLLISION, SAME_ID_DIFFERENT_NUMBER, and SAME_ID_DIFFERENT_CONTENT', () => {
  // Scenario 1: Invoice 63 and 64 collision test
  const rows: InvoiceAuditRow[] = [
    {
      source: 'device_A',
      id: 'uuid-1',
      invoiceNumber: 'INV-0063',
      customerName: 'عميل أ',
      totalAmount: 1500,
      date: '2026-11-06'
    },
    {
      source: 'device_B',
      id: 'uuid-2',
      invoiceNumber: 'INV-0063',
      customerName: 'عميل ب',
      totalAmount: 2800,
      date: '2026-11-06'
    },
    {
      source: 'device_A',
      id: 'uuid-3',
      invoiceNumber: 'INV-0064',
      customerName: 'عميل ج',
      totalAmount: 500,
      date: '2026-11-06'
    },
    {
      source: 'device_B',
      id: 'uuid-3',
      invoiceNumber: 'INV-0065', // Same ID uuid-3 has different number on device B
      customerName: 'عميل ج',
      totalAmount: 500,
      date: '2026-11-06'
    },
    {
      source: 'device_A',
      id: 'uuid-4',
      invoiceNumber: 'INV-0070',
      customerName: 'عميل د',
      totalAmount: 1000,
      date: '2026-11-06'
    },
    {
      source: 'device_B',
      id: 'uuid-4',
      invoiceNumber: 'INV-0070',
      customerName: 'عميل د معدل', // Same ID uuid-4 has different content
      totalAmount: 1200,
      date: '2026-11-06'
    }
  ];

  const issues = auditInvoices(rows);
  assert.equal(issues.length, 3);

  const numCollision = issues.find(i => i.kind === 'NUMBER_COLLISION');
  assert.ok(numCollision);
  assert.equal(numCollision.key, 'INV-0063');
  assert.equal(numCollision.rows.length, 2);

  const diffNum = issues.find(i => i.kind === 'SAME_ID_DIFFERENT_NUMBER');
  assert.ok(diffNum);
  assert.equal(diffNum.key, 'uuid-3');

  const diffContent = issues.find(i => i.kind === 'SAME_ID_DIFFERENT_CONTENT');
  assert.ok(diffContent);
  assert.equal(diffContent.key, 'uuid-4');
});

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const app = getApps().length === 0 ? initializeApp({ projectId: 'test-audit-proj' }) : getApps()[0];
const fakeDb = getFirestore(app);

test('planInvoiceNumbers enforces TEMP number rule and rejects local official numbers', async () => {
  const fakeTx: any = {};
  const changes: VersionedChange[] = [
    {
      entity: 'invoices',
      id: 'new-inv-1',
      expectedVersion: 0,
      value: { id: 'new-inv-1', invoiceNumber: 'INV-0099' } // Invalid: offline client tried to pick official number
    }
  ];

  await assert.rejects(
    async () => {
      await planInvoiceNumbers(fakeDb, fakeTx, 'test-ws', changes);
    },
    /NEW_INVOICE_REQUIRES_TEMP_NUMBER/
  );
});

test('planInvoiceNumbers prevents numbering when registry is not ready', async () => {
  const fakeTx: any = {
    get: async (ref: any) => {
      // readySnap: ready is false
      return {
        exists: () => true,
        data: () => ({ ready: false })
      };
    }
  };
  const changes: VersionedChange[] = [
    {
      entity: 'invoices',
      id: 'new-inv-1',
      expectedVersion: 0,
      value: { id: 'new-inv-1', invoiceNumber: 'TEMP-new-inv-1' }
    }
  ];

  await assert.rejects(
    async () => {
      await planInvoiceNumbers(fakeDb, fakeTx, 'test-ws', changes);
    },
    /INVOICE_REGISTRY_NOT_READY/
  );
});

test('planInvoiceNumbers allocates sequential official numbers and validates claims', async () => {
  const writtenDocs: { ref: any; data: any; options?: any }[] = [];

  const store = new Map<string, any>();
  // base path: lobnan_sync_workspaces/test-ws
  store.set('lobnan_sync_workspaces/test-ws/meta/invoiceNumberingReady', { ready: true });
  store.set('lobnan_sync_workspaces/test-ws/counters/invoices_global', { seq: 64 }); // Current highest sequence is 64

  const fakeTx: any = {
    get: async (ref: any) => {
      const path = ref.path;
      const data = store.get(path);
      return {
        exists: () => data !== undefined,
        data: () => data
      };
    },
    set: (ref: any, data: any, options?: any) => {
      writtenDocs.push({ ref, data, options });
    }
  };

  // 2 new invoices submitted in single atomic command
  const changes: VersionedChange[] = [
    {
      entity: 'invoices',
      id: 'inv-uuid-new-1',
      expectedVersion: 0,
      value: { id: 'inv-uuid-new-1', invoiceNumber: 'TEMP-inv-uuid-new-1' }
    },
    {
      entity: 'invoices',
      id: 'inv-uuid-new-2',
      expectedVersion: 0,
      value: { id: 'inv-uuid-new-2', invoiceNumber: 'TEMP-inv-uuid-new-2' }
    }
  ];

  const plan = await planInvoiceNumbers(fakeDb, fakeTx, 'test-ws', changes);

  assert.equal(plan.numbers.get('inv-uuid-new-1'), 'INV-0065');
  assert.equal(plan.numbers.get('inv-uuid-new-2'), 'INV-0066');

  // Execute plan write
  plan.write();

  assert.equal(writtenDocs.length, 3); // 2 claims + 1 counter update
  const counterWrite = writtenDocs.find(w => w.ref.path.endsWith('counters/invoices_global'));
  assert.ok(counterWrite);
  assert.equal(counterWrite.data.seq, 66);
});
