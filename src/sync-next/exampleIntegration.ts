import {
  createUnifiedDataLayer
} from './boot';

import {
  buildAtomicPosting
} from './accountingPosting';

export async function runExampleIntegrationPattern() {
  // Initialize once per company/workspace,
  // only AFTER legacy-data migration is complete.
  const layer = await createUnifiedDataLayer(
    'lobnan_main'
  );

  // Example: a customer.
  // Same ID must be used in all screens.
  const customerId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  await layer.repository.commit(
    [{
      entity: 'parties',
      id: customerId,
      value: {
        id: customerId,
        name: 'عميل تجريبي',
        type: 'customer'
      }
    }],
    operationId
  );

  // A financial operation example.
  // Values are in minor currency units.
  const invoiceId = crypto.randomUUID();
  const journalId = crypto.randomUUID();

  const posting = buildAtomicPosting({
    documentEntity: 'invoices',
    documentId: invoiceId,
    document: {
      id: invoiceId,
      customerId,
      totalMinor: 12500,
      status: 'pending'
    },
    journalId,
    journalDate: '2026-11-06',
    currency: 'ILS',
    lines: [
      {
        accountId: 'CASH_ACCOUNT_ID',
        debitMinor: 12500,
        creditMinor: 0
      },
      {
        accountId: 'SALES_ACCOUNT_ID',
        debitMinor: 0,
        creditMinor: 12500
      }
    ],
    movements: []
  });

  await layer.repository.commit(
    posting,
    `post-${invoiceId}`
  );

  // IMPORTANT:
  // commit() confirms LOCAL storage only.
  // It does not mean the invoice is cloud-approved.
  return { customerId, invoiceId, layer };
}
