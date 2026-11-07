export interface InvoiceAuditRow {
  source: string;
  id: string;
  invoiceNumber: string;
  customerName?: string;
  totalAmount?: number;
  date?: string;
}

export interface InvoiceIssue {
  kind:
    | 'NUMBER_COLLISION'
    | 'SAME_ID_DIFFERENT_NUMBER'
    | 'SAME_ID_DIFFERENT_CONTENT';
  key: string;
  rows: InvoiceAuditRow[];
}

export function prepareNewOfflineInvoice<
  T extends { id: string; invoiceNumber?: string }
>(invoice: T): T & { invoiceNumber: string; isOfficial: false } {
  if (!invoice.id) {
    throw new Error('Invoice requires a stable ID');
  }

  return {
    ...invoice,
    invoiceNumber: `TEMP-${invoice.id}`,
    isOfficial: false
  };
}

export function auditInvoices(
  rows: InvoiceAuditRow[]
): InvoiceIssue[] {
  const byNumber = new Map<string, InvoiceAuditRow[]>();
  const byId = new Map<string, InvoiceAuditRow[]>();

  for (const row of rows) {
    if (!row.id || !row.source) {
      throw new Error('Missing invoice identity');
    }

    const number = (row.invoiceNumber || '').trim();

    if (/^INV-\d+$/.test(number)) {
      byNumber.set(number, [
        ...(byNumber.get(number) || []),
        row
      ]);
    }

    byId.set(row.id, [
      ...(byId.get(row.id) || []),
      row
    ]);
  }

  const issues: InvoiceIssue[] = [];

  for (const [number, group] of byNumber) {
    if (new Set(group.map(r => r.id)).size > 1) {
      issues.push({
        kind: 'NUMBER_COLLISION',
        key: number,
        rows: group
      });
    }
  }

  for (const [id, group] of byId) {
    if (
      new Set(group.map(r => r.invoiceNumber)).size > 1
    ) {
      issues.push({
        kind: 'SAME_ID_DIFFERENT_NUMBER',
        key: id,
        rows: group
      });
    }

    const contents = group.map(r =>
      JSON.stringify([
        r.customerName,
        r.totalAmount,
        r.date
      ])
    );

    if (new Set(contents).size > 1) {
      issues.push({
        kind: 'SAME_ID_DIFFERENT_CONTENT',
        key: id,
        rows: group
      });
    }
  }

  return issues;
}
