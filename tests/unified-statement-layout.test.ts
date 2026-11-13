import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('all customer and supplier financial statement routes use one authoritative document component', () => {
  const modal = load('../src/components/AccountStatementModal.tsx');
  const reports = load('../src/components/ReportsView.tsx');
  const document = load('../src/components/UnifiedPartyStatementDocument.tsx');
  assert.match(modal, /<UnifiedPartyStatementDocument\s/);
  assert.equal((reports.match(/<UnifiedPartyStatementDocument\s/g) || []).length, 2);
  assert.match(reports, /activeReport === 'customer_statement'/);
  assert.match(reports, /activeReport === 'supplier_statement'/);
  assert.equal((document.match(/invoice-financial-strip/g) || []).length, 1);
  assert.match(document, /hasVisibleInvoiceDimensions/);
  assert.match(document, /showItemDetails && row\.items/);
  assert.match(document, /row\.paidAmount/);
  assert.match(document, /row\.remainingAmount/);
  assert.doesNotMatch(reports, /مدين \(عليه\)/);
  assert.doesNotMatch(reports, /الرصيد التراكمي/);
});

test('statement data paths include identical finance sources', () => {
  const modal = load('../src/components/AccountStatementModal.tsx');
  const reports = load('../src/components/ReportsView.tsx');
  const customerSource = reports.split('const customerStatementData = useMemo')[1]?.split('// REPORT 2')[0] || '';
  const modalSource = modal.split('const partyStatement = useMemo')[1]?.split('// Generate Employee Statement')[0] || '';
  for (const source of ['invoices','purchases','purchaseReturns','salesReturns','vouchers','printOrders','journalEntries','debtClearings']) {
    assert.ok(modalSource.includes(source), 'modal missing '+source);
    assert.ok(customerSource.includes(source), 'reports missing '+source);
  }
});
