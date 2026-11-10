import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditInvoices,
  prepareNewOfflineInvoice,
  type InvoiceAuditRow
} from '../src/sync-next/invoiceSyncGuard';

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

