/**
 * Pure, read-only reconciliation of invoice-linked journal revenue.
 * IMPORTANT: This is a candidate-finding tool, NOT an adjustment planner.
 * It cannot prove the absence of journals using other reference IDs.
 */
const MONEY_TOLERANCE_CENTS = 1;
const cents = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const rowValue = row => row?.value ?? row ?? {};
const rowId = row => String(row?.record_id ?? row?.id ?? rowValue(row).id ?? '');
const toAmount = n => Math.round(n) / 100;

export function reconcileInvoiceLinkedRevenue(invoices, journalEntries) {
  const byInvoice = new Map();
  const problems = [];
  const invoiceIds = new Set(invoices.map(rowId));
  let invalidJournalLines = 0;
  const orphanJournals = [];
  for (const row of journalEntries) {
    const journal = rowValue(row);
    const referenceId = String(journal.referenceId ?? '');
    const type = String(journal.referenceType ?? '');
    if (!referenceId) continue;
    if (!invoiceIds.has(referenceId)) {
      if (['pos_invoice', 'cogs', 'invoice_correction'].includes(type)) {
        orphanJournals.push({journalId:rowId(row),referenceId,referenceType:type});
      }
      continue;
    }
    let item = byInvoice.get(referenceId);
    if (!item) {
      item = {netRevenueCents:0,netCostCents:0,revenueLines:0,corrections:0,journals:[],invalidLine:false};
      byInvoice.set(referenceId,item);
    }
    item.journals.push({id:rowId(row),referenceType:type});
    if (type === 'invoice_correction') item.corrections++;
    if (!Array.isArray(journal.lines)) {
      item.invalidLine = true;
      invalidJournalLines++;
      continue;
    }
    for (const line of journal.lines) {
      const debit = cents(line?.debit ?? 0);
      const credit = cents(line?.credit ?? 0);
      if (debit === null || credit === null || debit < 0 || credit < 0) {
        item.invalidLine = true;
        invalidJournalLines++;
        continue;
      }
      const code = String(line?.accountCode ?? '');
      if (code === '4101') {
        item.netRevenueCents += credit - debit;
        item.revenueLines++;
      }
      if (code === '5101') item.netCostCents += debit - credit;
    }
  }

  const cases = [];
  const totals = {positiveVarianceCents:0,negativeVarianceCents:0};
  for (const row of invoices) {
    const invoice = rowValue(row);
    const id = rowId(row);
    const number = String(invoice.invoiceNumber || '').trim();
    const linked = byInvoice.get(id) ?? {netRevenueCents:0,netCostCents:0,revenueLines:0,corrections:0,journals:[],invalidLine:false};
    const expectedRaw = invoice.baseTotalAmount ?? invoice.totalAmount;
    const expectedCents = cents(expectedRaw);
    const context = {
      invoiceNumber:number,invoiceId:id,
      expectedBaseAmount:expectedCents === null ? null : toAmount(expectedCents),
      linkedRevenue:toAmount(linked.netRevenueCents),
      linkedCost:toAmount(linked.netCostCents),
      linkedJournalCount:linked.journals.length,
      linkedCorrectionCount:linked.corrections,
      linkedJournalIds:linked.journals.map(x=>x.id)
    };
    if (expectedCents === null || expectedCents < 0) {
      problems.push({...context,reason:'INVALID_INVOICE_EXPECTED_AMOUNT'});
      continue;
    }
    if (linked.invalidLine) {
      problems.push({...context,reason:'INVALID_LINKED_JOURNAL_LINE'});
      continue;
    }
    if (linked.revenueLines === 0) {
      if (invoice.isAccountingPosted === true) {
        problems.push({...context,reason:'POSTED_WITHOUT_LINKED_REVENUE'});
      }
      continue;
    }
    const differenceCents = linked.netRevenueCents - expectedCents;
    if (Math.abs(differenceCents) > MONEY_TOLERANCE_CENTS) {
      const reason = differenceCents > 0 ? 'LINKED_REVENUE_ABOVE_INVOICE' : 'LINKED_REVENUE_BELOW_INVOICE';
      const caseRecord = {...context,reason,variance:toAmount(differenceCents),
        // NOT proposed journal entries. Tax, charges, exchange and journals
        // without the invoice UUID must be reconciled before posting changes.
        requiresManualReconciliation:true};
      cases.push(caseRecord);
      if (differenceCents > 0) totals.positiveVarianceCents += differenceCents;
      else totals.negativeVarianceCents += differenceCents;
    }
  }
  return {
    invoiceCount:invoices.length,journalCount:journalEntries.length,
    linkedRevenueVarianceCount:cases.length,
    positiveLinkedVariance:toAmount(totals.positiveVarianceCents),
    negativeLinkedVariance:toAmount(totals.negativeVarianceCents),
    cases,problems,orphanJournals,invalidJournalLines,
    limitation:'Only journals linked by immutable invoice record ID are included. Do not create adjustments from this report alone.'
  };
}

/** Runs the reconciliation inside a PostgreSQL repeatable-read, read-only snapshot. */
export async function runReadOnlyInvoiceNetAudit(pool, workspace = 'lobnan_main') {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    const [invoices, journals] = await Promise.all([
      client.query('SELECT record_id, version, value FROM sync_records WHERE workspace=$1 AND entity=$2', [workspace, 'invoices']),
      client.query('SELECT record_id, version, value FROM sync_records WHERE workspace=$1 AND entity=$2', [workspace, 'journalEntries'])
    ]);
    const report = reconcileInvoiceLinkedRevenue(invoices.rows, journals.rows);
    await client.query('COMMIT');
    transactionStarted = false;
    return {...report, workspace, generatedAt: new Date().toISOString()};
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
