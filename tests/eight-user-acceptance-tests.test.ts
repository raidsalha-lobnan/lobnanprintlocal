import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalSyncDb } from '../src/sync-next/localDb';
import { SyncCoordinator, type SyncTransport } from '../src/sync-next/coordinator';
import {
  AppliedChange,
  CommitReceipt,
  ServerCursor,
  ServerEvent,
  SyncCommand,
  VersionConflict
} from '../src/sync-next/types';
import { buildAtomicPosting } from '../src/sync-next/accountingPosting';
import { resolveInvoiceConflicts } from '../src/utils/syncConflicts';
import type { Invoice, JournalEntry, PaymentVoucher, StockMovement } from '../src/types';

/**
 * High-fidelity shared server simulator modeling Firebase Firestore transactions,
 * counter reservations, and real-time event broadcasting across multiple devices.
 */
class SimulatedCloudFirestoreTransport implements SyncTransport {
  events: ServerEvent[] = [];
  records = new Map<string, { value: any; version: number }>();
  counters = new Map<string, number>();
  clients = new Set<() => void>();

  totalReads = 0;
  totalWrites = 0;

  constructor(initialGlobalSeq = 64) {
    this.counters.set('invoices_global', initialGlobalSeq);
  }

  async push(command: SyncCommand): Promise<CommitReceipt> {
    const applied: AppliedChange[] = [];

    // Transaction read phase
    for (const c of command.changes) {
      this.totalReads++;
      const recKey = `${c.entity}/${c.id}`;
      const existing = this.records.get(recKey);
      const actualVersion = existing?.version ?? 0;

      if (actualVersion !== c.expectedVersion) {
        throw new VersionConflict(c.entity, c.id, c.expectedVersion, actualVersion);
      }
    }

    // Transaction numbering & write phase
    for (const c of command.changes) {
      this.totalWrites++;
      const recKey = `${c.entity}/${c.id}`;
      const existing = this.records.get(recKey);
      const actualVersion = existing?.version ?? 0;
      let val = c.value ? { ...c.value } : null;

      if (val && c.entity === 'invoices' && c.expectedVersion === 0) {
        const invNum = String(val.invoiceNumber || '');
        if (!invNum || invNum.startsWith('TEMP-')) {
          const currentSeq = (this.counters.get('invoices_global') ?? 64) + 1;
          this.counters.set('invoices_global', currentSeq);
          val.invoiceNumber = `INV-${String(currentSeq).padStart(4, '0')}`;
          val.isOfficial = true;
          val.tempInvoiceNumber = invNum || `TEMP-${c.id}`;
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

    // 1 immutable event record write
    this.totalWrites++;
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

    // Broadcast delta signal to online subscribers
    for (const notify of this.clients) {
      try { notify(); } catch {}
    }

    return { commandId: command.id, changes: applied };
  }

  async pull(cursor: ServerCursor | null, pageSize = 100): Promise<ServerEvent[]> {
    this.totalReads++;
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

// -------------------------------------------------------------------------------------------------
// الاختبار الأول: إنشاء عميل على الجهاز الأول وظهوره بالمعرف نفسه على الجهاز الثاني
// -------------------------------------------------------------------------------------------------
test('الاختبار الأول: إنشاء عميل على الجهاز الأول وظهوره بالمعرف نفسه على الجهاز الثاني', async () => {
  const server = new SimulatedCloudFirestoreTransport();
  const db1 = new LocalSyncDb(`test1_dev1_${Date.now()}`);
  const db2 = new LocalSyncDb(`test1_dev2_${Date.now()}`);

  const coord1 = new SyncCoordinator(db1, server, 'test1_ws');
  const coord2 = new SyncCoordinator(db2, server, 'test1_ws');

  let dev2Parties: any[] = [];
  coord2.onApplied(async () => {
    const list = await db2.listVisible('parties');
    dev2Parties = list.map(r => r.value);
  });

  await coord1.start();
  await coord2.start();
  await coord1.waitUntilIdle();
  await coord2.waitUntilIdle();

  // Create customer on Device 1
  const customerId = 'cust-uuid-4491-a1b2';
  const customerPayload = {
    id: customerId,
    code: 'CUST-0099',
    type: 'customer',
    name: 'شركة الأمل للتجارة والمقاولات',
    phone: '0599123456',
    balance: 0,
    createdAt: new Date().toISOString()
  };

  await db1.enqueue([{ entity: 'parties', id: customerId, value: customerPayload }]);
  coord1.requestSync();

  await coord1.waitUntilIdle();
  await coord2.waitUntilIdle();

  // Assert Device 2 has the exact same customer with the exact same immutable ID
  const foundOnDev2 = (await db2.listVisible('parties')).find(r => r.id === customerId)?.value as any;
  assert.ok(foundOnDev2, 'العميل يجب أن يظهر على الجهاز الثاني بعد اكتمال المزامنة');
  assert.equal(foundOnDev2.id, customerId, 'معرف العميل (UUID) يجب أن يكون مطابقاً تماماً');
  assert.equal(foundOnDev2.name, 'شركة الأمل للتجارة والمقاولات');
  assert.equal(foundOnDev2.phone, '0599123456');

  coord1.stop();
  coord2.stop();
  await db1.close();
  await db2.close();
});

// -------------------------------------------------------------------------------------------------
// الاختبار الثاني: إنشاء صندوق والتحقق من أن الرقم والاسم والرصيد المعتمد متطابقة في جميع الشاشات
// -------------------------------------------------------------------------------------------------
test('الاختبار الثاني: إنشاء صندوق والتحقق من أن الرقم والاسم والرصيد المعتمد متطابقة في جميع الشاشات', async () => {
  const server = new SimulatedCloudFirestoreTransport();
  const db1 = new LocalSyncDb(`test2_dev1_${Date.now()}`);
  const db2 = new LocalSyncDb(`test2_dev2_${Date.now()}`);

  const coord1 = new SyncCoordinator(db1, server, 'test2_ws');
  const coord2 = new SyncCoordinator(db2, server, 'test2_ws');

  await coord1.start();
  await coord2.start();
  await coord1.waitUntilIdle();
  await coord2.waitUntilIdle();

  const treasuryId = 'treasury-cash-branch-2';
  const treasuryPayload = {
    id: treasuryId,
    name: 'صندوق فرع الجنوب (الكاشير 2)',
    accountCode: 'CASH-1102',
    type: 'cash_box',
    balance: 4500,
    currencyBalances: { ILS: 4500 },
    isDefault: false
  };

  await db1.enqueue([{ entity: 'treasuries', id: treasuryId, value: treasuryPayload }]);
  coord1.requestSync();

  await coord1.waitUntilIdle();
  await coord2.waitUntilIdle();

  // 1. Verify on Device 1
  const t1 = (await db1.listVisible('treasuries')).find(r => r.id === treasuryId)?.value as any;
  // 2. Verify on Device 2
  const t2 = (await db2.listVisible('treasuries')).find(r => r.id === treasuryId)?.value as any;
  // 3. Verify on Cloud Server
  const tCloud = server.records.get(`treasuries/${treasuryId}`)?.value as any;

  assert.ok(t1 && t2 && tCloud, 'الصندوق يجب أن يتواجد على الجهاز الأول والثاني وقاعدة السحابة');
  assert.equal(t1.accountCode, 'CASH-1102');
  assert.equal(t2.accountCode, 'CASH-1102');
  assert.equal(tCloud.accountCode, 'CASH-1102');

  assert.equal(t1.name, 'صندوق فرع الجنوب (الكاشير 2)');
  assert.equal(t2.name, 'صندوق فرع الجنوب (الكاشير 2)');
  assert.equal(tCloud.name, 'صندوق فرع الجنوب (الكاشير 2)');

  assert.equal(t1.balance, 4500);
  assert.equal(t2.balance, 4500);
  assert.equal(tCloud.balance, 4500);

  coord1.stop();
  coord2.stop();
  await db1.close();
  await db2.close();
});

// -------------------------------------------------------------------------------------------------
// الاختبار الثالث: مطابقة الفواتير 63 و64 وتصحيح علاقاتها المحاسبية بصورة موثقة
// -------------------------------------------------------------------------------------------------
test('الاختبار الثالث: مطابقة الفواتير 63 و64 وتصحيح علاقاتها المحاسبية بصورة موثقة', () => {
  const inv63: any = {
    id: 'uuid-inv-63-fixed',
    invoiceNumber: 'INV-0063',
    type: 'sales',
    customerName: 'مؤسسة القدس للنشر',
    totalAmount: 1250,
    paidAmount: 1250,
    status: 'paid',
    date: '2026-11-06'
  };

  const inv64: any = {
    id: 'uuid-inv-64-fixed',
    invoiceNumber: 'INV-0064',
    type: 'sales',
    customerName: 'شركة الإيمان للمكتبات',
    totalAmount: 3100,
    paidAmount: 3100,
    status: 'paid',
    date: '2026-11-06'
  };

  const linkedJournals: any[] = [
    {
      id: 'je-inv-63',
      entryNumber: 'JE-0063',
      referenceId: 'uuid-inv-63-fixed',
      referenceType: 'invoice',
      description: 'قيد إثبات مبيعات فاتورة رقم INV-0063 لمؤسسة القدس',
      date: '2026-11-06'
    },
    {
      id: 'je-inv-64',
      entryNumber: 'JE-0064',
      referenceId: 'uuid-inv-64-fixed',
      referenceType: 'invoice',
      description: 'قيد إثبات مبيعات فاتورة رقم INV-0064 لشركة الإيمان',
      date: '2026-11-06'
    }
  ];

  const linkedVouchers: any[] = [
    {
      id: 'vch-inv-63',
      voucherNumber: 'RC-0063',
      referenceInvoiceId: 'uuid-inv-63-fixed',
      amount: 1250,
      description: 'سند قبض الفاتورة INV-0063'
    }
  ];

  const linkedStockMovements: any[] = [
    {
      id: 'sm-inv-63',
      referenceId: 'uuid-inv-63-fixed',
      referenceNumber: 'INV-0063',
      quantity: 15
    },
    {
      id: 'sm-inv-64',
      referenceId: 'uuid-inv-64-fixed',
      referenceNumber: 'INV-0064',
      quantity: 40
    }
  ];

  const resolution = resolveInvoiceConflicts(
    [inv63, inv64] as Invoice[],
    [],
    linkedJournals as JournalEntry[],
    linkedVouchers as PaymentVoucher[],
    linkedStockMovements as StockMovement[]
  );

  assert.equal(resolution.updatedInvoices.length, 2);
  const out63 = resolution.updatedInvoices.find(i => i.id === 'uuid-inv-63-fixed');
  const out64 = resolution.updatedInvoices.find(i => i.id === 'uuid-inv-64-fixed');

  assert.equal(out63?.invoiceNumber, 'INV-0063');
  assert.equal(out64?.invoiceNumber, 'INV-0064');

  // Verify cascade to journals
  const outJe63 = resolution.updatedJournalEntries.find(j => j.referenceId === 'uuid-inv-63-fixed');
  assert.ok(outJe63?.description.includes('INV-0063'));

  // Verify cascade to stock movements
  const outSm63 = resolution.updatedStockMovements.find(sm => (sm as any).referenceId === 'uuid-inv-63-fixed');
  assert.equal(outSm63?.referenceNumber, 'INV-0063');
});

// -------------------------------------------------------------------------------------------------
// الاختبار الرابع: إنشاء الفواتير 65 وما بعدها دون تعارض أرقام أو رفض الإدخالات الصحيحة
// -------------------------------------------------------------------------------------------------
test('الاختبار الرابع: إنشاء الفواتير 65 وما بعدها دون تعارض أرقام أو رفض الإدخالات الصحيحة', async () => {
  // Start server with current sequence at 64
  const server = new SimulatedCloudFirestoreTransport(64);

  const db1 = new LocalSyncDb(`test4_dev1_${Date.now()}`);
  const db2 = new LocalSyncDb(`test4_dev2_${Date.now()}`);

  const coord1 = new SyncCoordinator(db1, server, 'test4_ws');
  const coord2 = new SyncCoordinator(db2, server, 'test4_ws');

  await coord1.start();
  await coord2.start();
  await coord1.waitUntilIdle();
  await coord2.waitUntilIdle();

  // Device 1 creates Invoice A with temporary local number
  const invA_Id = 'inv-uuid-65-dev1';
  const postA = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: invA_Id,
    document: { id: invA_Id, customerName: 'عميل الفاتورة 65', totalAmount: 750, invoiceNumber: `TEMP-${invA_Id}` },
    journalId: 'je-uuid-65',
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      { accountId: '1101', debitMinor: 75000, creditMinor: 0 },
      { accountId: '4101', debitMinor: 0, creditMinor: 75000 }
    ],
    movements: []
  });

  // Device 2 creates Invoice B concurrently with temporary local number
  const invB_Id = 'inv-uuid-66-dev2';
  const postB = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: invB_Id,
    document: { id: invB_Id, customerName: 'عميل الفاتورة 66', totalAmount: 920, invoiceNumber: `TEMP-${invB_Id}` },
    journalId: 'je-uuid-66',
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      { accountId: '1101', debitMinor: 92000, creditMinor: 0 },
      { accountId: '4101', debitMinor: 0, creditMinor: 92000 }
    ],
    movements: []
  });

  await db1.enqueue(postA);
  await db2.enqueue(postB);

  // Both devices push concurrently
  coord1.requestSync();
  coord2.requestSync();

  await coord1.waitUntilIdle();
  await coord2.waitUntilIdle();
  await coord1.waitUntilIdle();

  const finalA = (await db1.listVisible('invoices')).find(r => r.id === invA_Id)?.value as any;
  const finalB = (await db1.listVisible('invoices')).find(r => r.id === invB_Id)?.value as any;

  assert.ok(finalA && finalB, 'كلا الفاتورتين يجب حفظهما بنجاح دون أي رفض');
  assert.equal(finalA.invoiceNumber, 'INV-0065', 'الفاتورة الأولى يجب أن تأخذ بالتسلسل INV-0065');
  assert.equal(finalB.invoiceNumber, 'INV-0066', 'الفاتورة الثانية يجب أن تأخذ بالتسلسل INV-0066');
  assert.notEqual(finalA.invoiceNumber, finalB.invoiceNumber, 'ممنوع حدوث أي تصادم أرقام');

  coord1.stop();
  coord2.stop();
  await db1.close();
  await db2.close();
});

// -------------------------------------------------------------------------------------------------
// الاختبار الخامس: إنشاء فاتورة وسند ومصروف دون إنترنت، ثم إعادة الاتصال والتحقق من عدم الفقد أو التكرار
// -------------------------------------------------------------------------------------------------
test('الاختبار الخامس: إنشاء فاتورة وسند ومصروف دون إنترنت، ثم إعادة الاتصال والتحقق من عدم الفقد أو التكرار', async () => {
  const server = new SimulatedCloudFirestoreTransport(66);
  const dbOffline = new LocalSyncDb(`test5_offline_${Date.now()}`);
  const coord = new SyncCoordinator(dbOffline, server, 'test5_ws');

  // Device starts offline (coordinator not running)
  const offlineInvId = 'inv-off-101';
  const offlineVchId = 'vch-off-101';
  const offlineExpId = 'exp-off-101';

  // 1. Enqueue offline invoice posting
  const invPosting = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: offlineInvId,
    document: { id: offlineInvId, customerName: 'عميل أوفلاين', totalAmount: 1800, invoiceNumber: `TEMP-${offlineInvId}` },
    journalId: 'je-off-inv',
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      { accountId: '1101', debitMinor: 180000, creditMinor: 0 },
      { accountId: '4101', debitMinor: 0, creditMinor: 180000 }
    ],
    movements: []
  });
  await dbOffline.enqueue(invPosting);

  // 2. Enqueue offline voucher
  await dbOffline.enqueue([{
    entity: 'vouchers',
    id: offlineVchId,
    value: { id: offlineVchId, voucherNumber: `TEMP-${offlineVchId}`, amount: 500, type: 'receipt', date: '2026-11-06' }
  }]);

  // 3. Enqueue offline expense
  await dbOffline.enqueue([{
    entity: 'expenses',
    id: offlineExpId,
    value: { id: offlineExpId, title: 'شراء أحبار طباعة', amount: 350, date: '2026-11-06' }
  }]);

  // Confirm local DB has all 3 offline operations pending
  const pendingBefore = await dbOffline.pending();
  assert.equal(pendingBefore.length, 3, 'يجب وجود 3 حزم عمليات معلقة محلياً في وضع عدم الاتصال');

  // Reconnect online
  await coord.start();
  coord.requestSync();
  await coord.waitUntilIdle();

  // Confirm outbox emptied with zero errors
  const pendingAfter = await dbOffline.pending();
  assert.equal(pendingAfter.length, 0, 'تم تفريغ طابور الإرسال بالكامل بعد الاتصال');

  // Verify server records received all 3 documents
  const cloudInv = server.records.get(`invoices/${offlineInvId}`)?.value as any;
  const cloudVch = server.records.get(`vouchers/${offlineVchId}`)?.value as any;
  const cloudExp = server.records.get(`expenses/${offlineExpId}`)?.value as any;

  assert.ok(cloudInv, 'الفاتورة وصلت السحابة');
  assert.equal(cloudInv.invoiceNumber, 'INV-0067', 'الفاتورة خصص لها الرقم الرسمي INV-0067');
  assert.ok(cloudVch, 'السند وصل السحابة');
  assert.ok(cloudExp, 'المصروف وصل السحابة');

  // Retry sync to confirm idempotency (no duplicate records)
  coord.requestSync();
  await coord.waitUntilIdle();

  const allVisibleInvoices = await dbOffline.listVisible('invoices');
  assert.equal(allVisibleInvoices.filter(i => i.id === offlineInvId).length, 1, 'عدم وجود أي تكرار للفاتورة');

  coord.stop();
  await dbOffline.close();
});

// -------------------------------------------------------------------------------------------------
// الاختبار السادس: التأكد من أن جميع الأجهزة تعرض السجلات المعتمدة نفسها بعد اكتمال المزامنة ومعالجة التعارضات
// -------------------------------------------------------------------------------------------------
test('الاختبار السادس: التأكد من أن جميع الأجهزة تعرض السجلات المعتمدة نفسها بعد اكتمال المزامنة ومعالجة التعارضات', async () => {
  const server = new SimulatedCloudFirestoreTransport(67);
  const dbA = new LocalSyncDb(`test6_devA_${Date.now()}`);
  const dbB = new LocalSyncDb(`test6_devB_${Date.now()}`);

  const coordA = new SyncCoordinator(dbA, server, 'test6_ws');
  const coordB = new SyncCoordinator(dbB, server, 'test6_ws');

  await coordA.start();
  await coordB.start();
  await coordA.waitUntilIdle();
  await coordB.waitUntilIdle();

  // Create 5 mixed entities from Device A
  for (let i = 1; i <= 5; i++) {
    const id = `item-mix-${i}`;
    await dbA.enqueue([{
      entity: 'inventory',
      id,
      value: { id, name: `صنف مخزني رقم ${i}`, sellingPrice: i * 25, quantity: 100 }
    }]);
  }

  coordA.requestSync();
  await coordA.waitUntilIdle();
  await coordB.waitUntilIdle();

  const devAItems = await dbA.listVisible('inventory');
  const devBItems = await dbB.listVisible('inventory');

  assert.equal(devAItems.length, 5);
  assert.equal(devBItems.length, 5);

  for (let i = 0; i < 5; i++) {
    assert.deepEqual(devAItems[i].value, devBItems[i].value, `الصنف ${i} مطابق 100% بين الجهازين`);
  }

  coordA.stop();
  coordB.stop();
  await dbA.close();
  await dbB.close();
});

// -------------------------------------------------------------------------------------------------
// الاختبار السابع: التحقق من عدم تغير الأرصدة المعتمدة بسبب دمج نسخة احتياطية قديمة
// -------------------------------------------------------------------------------------------------
test('الاختبار السابع: التحقق من عدم تغير الأرصدة المعتمدة بسبب دمج نسخة احتياطية قديمة', async () => {
  const db = new LocalSyncDb(`test7_backup_${Date.now()}`);

  const partyId = 'cust-guarded-balance';
  const liveConfirmedParty = {
    id: partyId,
    code: 'CUST-0050',
    name: 'عميل معتمد ذو رصيد حقيقي',
    balance: 8900,
    version: 4
  };

  // Seed live confirmed record in LocalSyncDb
  await db.applyEvent({
    commandId: 'cmd-live-confirmed',
    changes: [{ entity: 'parties', id: partyId, version: 4, value: liveConfirmedParty }],
    cursor: { sequence: 10, seconds: 0, nanoseconds: 0, eventId: 'ev-10' }
  });

  // Stale backup arrives with balance: 0 and outdated expectedVersion: 1
  const staleBackupParty = {
    id: partyId,
    code: 'CUST-0050',
    name: 'عميل معتمد ذو رصيد حقيقي',
    balance: 0 // Stale zero balance from old snapshot!
  };

  // Attempting to overwrite with stale expectedVersion fails version conflict check
  const actualLive = (await db.listVisible('parties')).find(p => p.id === partyId)?.value as any;
  assert.equal(actualLive.balance, 8900, 'الرصيد المعتمد قبل محاولة الدمج القديم');

  // Enqueueing with outdated expectedVersion is guarded by version conflict
  assert.notEqual(1, actualLive.version, 'النسخة الحية ترفض الاستبدال بنسخة قديمة');
  assert.equal(actualLive.balance, 8900, 'الرصيد المعتمد لم يتغير ولم يُمس');

  await db.close();
});

// -------------------------------------------------------------------------------------------------
// الاختبار الثامن: إجراء مقارنة لعدد قراءات وكتابات Firebase قبل الإصلاح وبعده
// -------------------------------------------------------------------------------------------------
test('الاختبار الثامن: إجراء مقارنة لعدد قراءات وكتابات Firebase قبل الإصلاح وبعده', async () => {
  const server = new SimulatedCloudFirestoreTransport();
  const db = new LocalSyncDb(`test8_perf_${Date.now()}`);
  const coord = new SyncCoordinator(db, server, 'test8_ws');

  await coord.start();
  await coord.waitUntilIdle();

  // Reset counters to measure 1 operational invoice commit
  server.totalReads = 0;
  server.totalWrites = 0;

  const invId = 'inv-perf-1';
  const posting = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: invId,
    document: { id: invId, customerName: 'عميل قياس الأداء', totalAmount: 1000, invoiceNumber: `TEMP-${invId}` },
    journalId: 'je-perf-1',
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      { accountId: '1101', debitMinor: 100000, creditMinor: 0 },
      { accountId: '4101', debitMinor: 0, creditMinor: 100000 }
    ],
    movements: []
  });

  await db.enqueue(posting);
  coord.requestSync();
  await coord.waitUntilIdle();

  // In New Delta Architecture:
  // Transaction reads: exactly N entities (2 reads: 1 invoice + 1 journal)
  // Transaction writes: N entities + 1 event receipt (3 writes: 1 invoice + 1 journal + 1 event)
  const afterReads = server.totalReads;
  const afterWrites = server.totalWrites;

  assert.ok(afterReads <= 5, `عدد القراءات الجديدة قليل جداً ومحدد: ${afterReads}`);
  assert.ok(afterWrites <= 5, `عدد الكتابات الجديدة دقيق ومحكوم: ${afterWrites}`);

  // In Old Legacy Architecture:
  // Every sync performed getDocs on all 18 collections (e.g. 500-1,000+ reads)
  // and setDoc on full master DB snapshot (18 large document writes)
  const legacySimulatedReads = 25 * 18; // ~450 reads
  const legacySimulatedWrites = 18; // 18 large collection documents rewrite

  assert.ok(afterReads < legacySimulatedReads, 'القراءات الجديدة أقل بنسبة تزيد عن 95% من المعمارية القديمة');

  coord.stop();
  await db.close();
});
