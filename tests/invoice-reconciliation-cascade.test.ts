import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeInvoicesWithUpsertAndConflictResolution, resolveInvoiceConflicts } from '../src/utils/syncConflicts';
import { Invoice, JournalEntry, PaymentVoucher, StockMovement } from '../src/types';

test('Invoice 63 and Invoice 64 maintain UUID identity, correct numbers, and cascade to all linked screens', () => {
  const inv63: any = {
    id: 'uuid-inv-63',
    invoiceNumber: 'INV-0063',
    type: 'sales',
    customerName: 'عميل الفاتورة 63',
    totalAmount: 1500,
    paidAmount: 1500,
    remainingAmount: 0,
    subtotal: 1500,
    discountTotal: 0,
    taxRate: 0,
    status: 'paid',
    date: '2026-11-06',
    createdAt: '2026-11-06T10:00:00.000Z',
    items: [{ itemId: 'item-1', itemName: 'مطبوعات 63', quantity: 10, unitPrice: 150, total: 1500 }]
  };

  const inv64: any = {
    id: 'uuid-inv-64',
    invoiceNumber: 'INV-0064',
    type: 'sales',
    customerName: 'عميل الفاتورة 64',
    totalAmount: 2800,
    paidAmount: 2800,
    remainingAmount: 0,
    subtotal: 2800,
    discountTotal: 0,
    taxRate: 0,
    status: 'paid',
    date: '2026-11-06',
    createdAt: '2026-11-06T10:05:00.000Z',
    items: [{ itemId: 'item-2', itemName: 'مطبوعات 64', quantity: 20, unitPrice: 140, total: 2800 }]
  };

  const linkedJournals: any[] = [
    {
      id: 'je-63',
      entryNumber: 'JE-0063',
      date: '2026-11-06',
      description: 'فاتورة مبيعات رقم INV-0063 للعميل عميل الفاتورة 63',
      referenceId: 'uuid-inv-63',
      referenceType: 'invoice',
      createdAt: '2026-11-06T10:00:00.000Z',
      lines: []
    },
    {
      id: 'je-64',
      entryNumber: 'JE-0064',
      date: '2026-11-06',
      description: 'فاتورة مبيعات رقم INV-0064 للعميل عميل الفاتورة 64',
      referenceId: 'uuid-inv-64',
      referenceType: 'invoice',
      createdAt: '2026-11-06T10:05:00.000Z',
      lines: []
    }
  ];

  const linkedVouchers: any[] = [
    {
      id: 'v-63',
      voucherNumber: 'V-0063',
      type: 'receipt',
      amount: 1500,
      date: '2026-11-06',
      partyId: 'p-63',
      partyName: 'عميل الفاتورة 63',
      paymentMethod: 'cash',
      accountCode: 'CASH',
      referenceInvoiceId: 'uuid-inv-63',
      description: 'سند قبض الفاتورة INV-0063'
    }
  ];

  const linkedStockMovements: any[] = [
    {
      id: 'sm-63',
      itemId: 'item-1',
      type: 'OUT',
      quantity: 10,
      date: '2026-11-06',
      referenceNumber: 'INV-0063',
      referenceId: 'uuid-inv-63'
    },
    {
      id: 'sm-64',
      itemId: 'item-2',
      type: 'OUT',
      quantity: 20,
      date: '2026-11-06',
      referenceNumber: 'INV-0064',
      referenceId: 'uuid-inv-64'
    }
  ];

  const reconciled = resolveInvoiceConflicts(
    [inv63, inv64] as Invoice[],
    [],
    linkedJournals as JournalEntry[],
    linkedVouchers as PaymentVoucher[],
    linkedStockMovements as StockMovement[]
  );

  assert.equal(reconciled.updatedInvoices.length, 2);
  
  const res63 = reconciled.updatedInvoices.find(i => i.id === 'uuid-inv-63');
  const res64 = reconciled.updatedInvoices.find(i => i.id === 'uuid-inv-64');

  assert.ok(res63);
  assert.ok(res64);
  assert.equal(res63.invoiceNumber, 'INV-0063');
  assert.equal(res64.invoiceNumber, 'INV-0064');

  // Check cascading to journals
  const resJe63 = reconciled.updatedJournalEntries.find(j => j.referenceId === 'uuid-inv-63');
  const resJe64 = reconciled.updatedJournalEntries.find(j => j.referenceId === 'uuid-inv-64');
  assert.ok(resJe63?.description.includes('INV-0063'));
  assert.ok(resJe64?.description.includes('INV-0064'));

  // Check cascading to stock movements
  const resSm63 = reconciled.updatedStockMovements.find(sm => (sm as any).referenceId === 'uuid-inv-63');
  const resSm64 = reconciled.updatedStockMovements.find(sm => (sm as any).referenceId === 'uuid-inv-64');
  assert.equal(resSm63?.referenceNumber, 'INV-0063');
  assert.equal(resSm64?.referenceNumber, 'INV-0064');
});

test('Collision handling renumbers conflicting invoice while maintaining immutable UUID and cascading new number', () => {
  // Device 1 created invoice with UUID A and number INV-0063
  const invA: any = {
    id: 'uuid-device1-63',
    invoiceNumber: 'INV-0063',
    type: 'sales',
    customerName: 'عميل جهاز 1',
    totalAmount: 1000,
    paidAmount: 1000,
    remainingAmount: 0,
    subtotal: 1000,
    discountTotal: 0,
    taxRate: 0,
    status: 'paid',
    date: '2026-11-06',
    createdAt: '2026-11-06T10:00:00.000Z',
    items: []
  };

  // Device 2 ALSO created invoice with UUID B and number INV-0063 at T10:01
  const invB: any = {
    id: 'uuid-device2-63',
    invoiceNumber: 'INV-0063',
    type: 'sales',
    customerName: 'عميل جهاز 2',
    totalAmount: 2000,
    paidAmount: 2000,
    remainingAmount: 0,
    subtotal: 2000,
    discountTotal: 0,
    taxRate: 0,
    status: 'paid',
    date: '2026-11-06',
    createdAt: '2026-11-06T10:01:00.000Z',
    items: []
  };

  const journals: any[] = [
    {
      id: 'je-device2-63',
      entryNumber: 'JE-0063',
      date: '2026-11-06',
      description: 'قيد مبيعات فاتورة رقم INV-0063',
      referenceId: 'uuid-device2-63',
      referenceType: 'invoice',
      createdAt: '2026-11-06T10:01:00.000Z',
      lines: []
    }
  ];

  const reconciled = resolveInvoiceConflicts(
    [invA] as Invoice[],
    [invB] as Invoice[],
    journals as JournalEntry[],
    [],
    []
  );

  assert.equal(reconciled.updatedInvoices.length, 2);

  const resA = reconciled.updatedInvoices.find(i => i.id === 'uuid-device1-63');
  const resB = reconciled.updatedInvoices.find(i => i.id === 'uuid-device2-63');

  assert.equal(resA?.invoiceNumber, 'INV-0063');
  // Device 2's invoice received next unique sequential number
  assert.equal(resB?.invoiceNumber, 'INV-0064');

  // Cascaded to linked journal entry for UUID B
  const resJeB = reconciled.updatedJournalEntries.find(j => j.referenceId === 'uuid-device2-63');
  assert.ok(resJeB?.description.includes('INV-0064'));
});
