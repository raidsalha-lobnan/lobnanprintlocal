import type { Invoice, Treasury } from '../types';
import { formatDateDisplay } from './dateUtils';

export interface DetailedSalesReportOptions {
  companyName: string;
  periodLabel: string;
  invoiceTypeLabel: string;
  searchLabel: string;
  customerName: (invoice: Invoice) => string;
  treasuries: Treasury[];
}

const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};
const escapeHtml = (value: unknown): string => String(value ?? '').replace(
  /[&<>"']/g,
  character => htmlEntities[character] || character
);

const safeNumber = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};
const formatAmount = (value: unknown): string => safeNumber(value).toLocaleString(
  'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }
);
const formatQuantity = (value: unknown): string => safeNumber(value).toLocaleString(
  'en-US', { maximumFractionDigits: 4 }
);

const currencyFor = (invoice: Invoice): { key: string; label: string } => {
  const key = String(invoice.currency || (invoice.currencySymbol === '₪' ? 'ILS' : invoice.currencySymbol || 'ILS'));
  const label = String(invoice.currencySymbol || (key === 'ILS' ? '₪' : key));
  return { key, label };
};

const paymentLabel = (invoice: Invoice): string => {
  const method: Record<string, string> = {
    cash: 'نقدي',
    card: 'شبكة / بطاقة',
    credit: 'آجل',
    bank_transfer: 'تحويل بنكي',
    cheque: 'شيك',
    electronic: 'إلكتروني',
    e_wallet: 'محفظة إلكترونية'
  };
  return method[invoice.paymentMethod] || String(invoice.paymentMethod || 'غير محدد');
};
const textOrDash = (value: unknown): string => {
  if (value === null || value === undefined || String(value).trim() === '') return '—';
  return String(value);
};
const dimensionOrDash = (value: number | undefined): string =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—' : formatQuantity(value);
const itemNotes = (item: Invoice['items'][number]): string[] => {
  const notes = [item.description, item.notes]
    .map(value => String(value || '').trim()).filter(Boolean);
  if (item.dimensions && !notes.includes(item.dimensions)) {
    notes.push('الأبعاد المسجلة: ' + item.dimensions);
  }
  return [...new Set(notes)];
};
const treasuryDescription = (code: string | undefined, treasuries: Treasury[]): string => {
  if (!code) return 'الصندوق / الحساب غير محدد في الفاتورة';
  const treasury = treasuries.find(t => t.accountCode === code || t.id === code);
  return treasury
    ? `${treasury.name} (${treasury.accountCode || code})`
    : `رمز الحساب ${code} (الاسم غير متوفر في سجل الخزائن)`;
};
const paymentDetails = (invoice: Invoice, treasuries: Treasury[]): string[] => {
  const currency = currencyFor(invoice).label;
  const paid = safeNumber(invoice.paidAmount);
  const remaining = safeNumber(invoice.remainingAmount ??
    (safeNumber(invoice.totalAmount) - paid));
  const cash = safeNumber(invoice.cashPaidAmount);
  const bank = safeNumber(invoice.bankPaidAmount);
  const hasCashSplit = cash > 0;
  const hasBankSplit = bank > 0;
  const hasSplit = hasCashSplit || hasBankSplit;
  const fallbackCode = invoice.treasuryAccountCode;
  const details = ['طريقة الدفع المسجلة: ' + paymentLabel(invoice)];

  if (hasCashSplit || (!hasSplit && paid > 0 && invoice.paymentMethod === 'cash')) {
    const amount = hasCashSplit ? cash : paid;
    details.push('نقدًا: ' + formatAmount(amount) + ' ' + currency +
      ' — ' + treasuryDescription(invoice.cashTreasuryCode || fallbackCode, treasuries));
  }
  if (hasBankSplit || (!hasSplit && paid > 0 &&
      (invoice.paymentMethod === 'card' || invoice.paymentMethod === 'bank_transfer'))) {
    const amount = hasBankSplit ? bank : paid;
    details.push('بنك / شبكة: ' + formatAmount(amount) + ' ' + currency +
      ' — ' + treasuryDescription(invoice.bankTreasuryCode || fallbackCode, treasuries));
  }
  if (!hasSplit && paid > 0 && invoice.paymentMethod === 'credit') {
    details.push('دفعات مسجلة: ' + formatAmount(paid) + ' ' + currency +
      ' (طريقة تحصيلها / صندوقها غير مفصلين في الفاتورة)');
  }
  if (!hasSplit && paid > 0 && !['cash', 'card', 'bank_transfer', 'credit']
    .includes(invoice.paymentMethod)) {
    details.push('مدفوع: ' + formatAmount(paid) + ' ' + currency +
      ' — تفاصيل وسيلة التحصيل غير متوفرة');
  }
  if (remaining > 0.005) {
    details.push('آجل / ذمم مدينة: ' + formatAmount(remaining) + ' ' + currency);
  }
  if (hasSplit && Math.abs(cash + bank - paid) > 0.011) {
    details.push('تنبيه مراجعة: مجموع تفاصيل النقد والبنك لا يطابق إجمالي المدفوع المسجل');
  }
  if (invoice.paymentNotes?.trim()) {
    details.push('ملاحظة السداد: ' + invoice.paymentNotes.trim());
  }
  return details;
};

const statusLabel = (invoice: Invoice): string => {
  const remaining = safeNumber(invoice.remainingAmount ?? (safeNumber(invoice.totalAmount) - safeNumber(invoice.paidAmount)));
  if (remaining <= 0.005) return 'مسددة';
  if (safeNumber(invoice.paidAmount) > 0.005) return 'مسددة جزئيًا';
  return 'غير مسددة';
};

/**
 * Print exactly the invoices visible in the current sales register.
 * The report reads values only; it never posts, edits or recalculates ledgers.
 * Totals are grouped by invoice currency to avoid adding unlike currencies.
 */
export function printDetailedSalesInvoiceRegister(
  invoices: Invoice[],
  options: DetailedSalesReportOptions
): boolean {
  if (!invoices.length) return false;
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('تعذّر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع.');
    return false;
  }

  const totals = new Map<string, { label: string; count: number; total: number; paid: number; remaining: number; tax: number; discount: number }>();
  for (const invoice of invoices) {
    const currency = currencyFor(invoice);
    const current = totals.get(currency.key) || {
      label: currency.label, count: 0, total: 0, paid: 0, remaining: 0, tax: 0, discount: 0
    };
    current.count += 1;
    current.total += safeNumber(invoice.totalAmount);
    current.paid += safeNumber(invoice.paidAmount);
    current.remaining += safeNumber(invoice.remainingAmount ?? (safeNumber(invoice.totalAmount) - safeNumber(invoice.paidAmount)));
    current.tax += safeNumber(invoice.taxAmount);
    current.discount += safeNumber(invoice.discountTotal);
    totals.set(currency.key, current);
  }

  const totalRows = Array.from(totals.entries()).map(([key, row]) =>
    '<tr><td>' + escapeHtml(key) + '</td><td>' + escapeHtml(row.count) +
    '</td><td>' + formatAmount(row.total) + ' ' + escapeHtml(row.label) +
    '</td><td>' + formatAmount(row.paid) + ' ' + escapeHtml(row.label) +
    '</td><td>' + formatAmount(row.remaining) + ' ' + escapeHtml(row.label) +
    '</td><td>' + formatAmount(row.discount) + ' ' + escapeHtml(row.label) +
    '</td><td>' + formatAmount(row.tax) + ' ' + escapeHtml(row.label) + '</td></tr>'
  ).join('');

  const invoiceSections = invoices.map((invoice, index) => {
    const symbol = currencyFor(invoice).label;
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const rows = items.length ? items.map((item, lineIndex) => {
      const notes = itemNotes(item);
      return '<tr><td>' + escapeHtml(lineIndex + 1) + '</td><td>' +
        escapeHtml(item.itemCode || item.itemId || '—') + '</td><td>' +
        '<div class="item-name">' + escapeHtml(item.itemName || '—') + '</div>' +
        (notes.length
          ? '<div class="item-note">' + notes.map(escapeHtml).join(' | ') + '</div>'
          : '<div class="item-note muted">لا توجد ملاحظات للصنف</div>') +
        '</td><td class="num">' + escapeHtml(dimensionOrDash(item.length)) +
        '</td><td class="num">' + escapeHtml(dimensionOrDash(item.width)) +
        '</td><td class="num">' + escapeHtml(dimensionOrDash(item.count)) +
        '</td><td class="num">' + formatQuantity(item.quantity) +
        '</td><td class="num">' + formatAmount(item.unitPrice) +
        '</td><td class="num">' + formatAmount(item.discount) +
        '</td><td class="num">' + formatAmount(item.tax) +
        '</td><td class="num strong">' + formatAmount(item.total) + '</td></tr>';
    }).join('') : '<tr><td colspan="11" class="center">لا توجد أصناف مسجلة</td></tr>';
    const payment = paymentDetails(invoice, options.treasuries);
    const invoiceNote = String(invoice.notes || '').trim();

    return [
      '<section class="invoice">',
      '<div class="invoice-heading"><strong>فاتورة ' + escapeHtml(index + 1) + ' / ' +
        escapeHtml(invoice.invoiceNumber) + '</strong><span>التاريخ: ' +
        escapeHtml(formatDateDisplay(invoice.date)) + '</span><span>العميل: ' +
        escapeHtml(options.customerName(invoice)) + '</span></div>',
      '<div class="meta">النوع: ' +
        escapeHtml(invoice.type === 'pos' ? 'نقطة بيع' : invoice.type === 'print_order' ? 'أمر مطبعة' : 'مبيعات') +
        ' | حالة السداد: ' + escapeHtml(statusLabel(invoice)) +
        (invoice.warehouse ? ' | المخزن: ' + escapeHtml(invoice.warehouse) : '') +
        '</div>',
      '<div class="payment-review"><strong>تفاصيل الدفع والصندوق / البنك:</strong> ' +
        payment.map(detail => '<span>' + escapeHtml(detail) + '</span>').join('') + '</div>',
      invoiceNote ? '<div class="invoice-note"><strong>ملاحظات الفاتورة:</strong> ' +
        escapeHtml(invoiceNote) + '</div>' : '',
      '<table class="lines"><thead><tr><th>#</th><th>كود الصنف</th><th>الصنف / ملاحظات الصنف</th>' +
        '<th>الطول</th><th>العرض</th><th>العدد</th><th>الكمية</th>' +
        '<th>سعر الوحدة</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead>',
      '<tbody>', rows, '</tbody></table>',
      '<div class="invoice-totals">',
      '<span>قبل الخصم: <b>' + formatAmount(invoice.subtotal) + ' ' + escapeHtml(symbol) + '</b></span>',
      '<span>الخصم: <b>' + formatAmount(invoice.discountTotal) + ' ' + escapeHtml(symbol) + '</b></span>',
      '<span>الضريبة: <b>' + formatAmount(invoice.taxAmount) + ' ' + escapeHtml(symbol) + '</b></span>',
      safeNumber(invoice.additionalCharges) !== 0
        ? '<span>إضافات: <b>' + formatAmount(invoice.additionalCharges) + ' ' + escapeHtml(symbol) + '</b></span>'
        : '',
      '<span>الإجمالي: <b>' + formatAmount(invoice.totalAmount) + ' ' + escapeHtml(symbol) + '</b></span>',
      '<span>المدفوع: <b>' + formatAmount(invoice.paidAmount) + ' ' + escapeHtml(symbol) + '</b></span>',
      '<span>المتبقي: <b>' + formatAmount(invoice.remainingAmount ?? (safeNumber(invoice.totalAmount) - safeNumber(invoice.paidAmount))) +
        ' ' + escapeHtml(symbol) + '</b></span>',
      '</div>',
      '</section>'
    ].join('');
  }).join('');

  const printedAt = new Date().toLocaleString('ar-EG');
  const html = [
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>كشف تفصيلي لفواتير المبيعات</title>',
    '<style>',
    '@page { size: A4 landscape; margin: 10mm; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; padding: 15px; color: #15263b; font-family: Tahoma, Arial, sans-serif; font-size: 11px; }',
    'h1 { font-size: 20px; margin: 5px 0; } h2 { font-size: 13px; margin: 14px 0 6px; }',
    '.company { color: #526579; font-size: 12px; font-weight: bold; }',
    '.header { border-bottom: 2px solid #193c5c; padding-bottom: 11px; margin-bottom: 14px; }',
    '.criteria { display: flex; flex-wrap: wrap; gap: 7px 20px; margin: 9px 0; color: #344b63; }',
    '.summary, .lines { width: 100%; border-collapse: collapse; direction: rtl; }',
    'th { background: #e9eff5; color: #182f47; font-weight: bold; }',
    'th, td { border: 1px solid #c4ced8; padding: 5px 6px; text-align: right; vertical-align: top; }',
    '.summary th, .summary td { white-space: nowrap; }',
    '.invoice { margin: 12px 0 17px; break-inside: auto; page-break-inside: auto; }',
    '.invoice-heading { background: #edf3fa; padding: 8px; display: flex; flex-wrap: wrap; gap: 8px 22px; border: 1px solid #c4ced8; }',
    '.invoice-heading strong { font-size: 12px; } .meta { padding: 6px 4px; color: #465a6e; }',
    '.lines th:nth-child(3) { min-width: 185px; }',
    '.lines td:nth-child(3) { white-space: pre-wrap; overflow-wrap: anywhere; }',
    '.lines th, .lines td { padding: 4px 5px; font-size: 9px; }',
    '.invoice-heading { break-after: avoid; page-break-after: avoid; }',
    '.item-name { font-weight: 700; }',
    '.payment-review { border: 1px solid #cbd5e1; border-top: 0; background: #f7fafc; padding: 7px 9px; }',
    '.payment-review strong { display: block; margin-bottom: 4px; }',
    '.payment-review span { display: inline-block; margin: 2px 13px 2px 0; padding: 3px 5px; border: 1px solid #dde5ee; background: white; }',
    '.invoice-note { background: #fff9e9; border: 1px solid #edd9a5; padding: 7px 9px; white-space: pre-wrap; overflow-wrap: anywhere; }',
    '.num { white-space: nowrap; direction: ltr; text-align: right; font-variant-numeric: tabular-nums; }',
    '.strong { font-weight: bold; } .center { text-align: center; color: #62758a; }',
    '.item-note { font-size: 9px; color: #455d76; padding-top: 3px; white-space: pre-wrap; }',
    '.item-note.muted { color: #8a98a9; font-weight: normal; }',
    '.invoice-totals { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px 15px; margin-top: 6px; }',
    '.invoice-totals span { white-space: nowrap; }',
    '.foot { margin: 17px 0 0; padding-top: 8px; border-top: 1px solid #c4ced8; font-size: 9px; color: #64748b; }',
    '.print-controls { display: flex; gap: 8px; justify-content: flex-start; margin: 0 0 12px; }',
    '.print-controls button { border: 0; border-radius: 6px; padding: 8px 16px; color: white; background: #1c4f79; cursor: pointer; }',
    '@media print { body { padding: 0; } .print-controls { display: none; } ',
    'thead { display: table-header-group; } tr { break-inside: avoid; } }',
    '</style></head><body>',
    '<div class="print-controls"><button type="button" onclick="window.print()">طباعة الكشف / حفظ PDF</button></div>',
    '<header class="header"><div class="company">' + escapeHtml(options.companyName || 'سجل فواتير المبيعات') + '</div>',
    '<h1>كشف تفصيلي لفواتير المبيعات</h1>',
    '<div class="criteria"><span><b>الفترة:</b> ' + escapeHtml(options.periodLabel) + '</span>',
    '<span><b>نوع الفواتير:</b> ' + escapeHtml(options.invoiceTypeLabel) + '</span>',
    options.searchLabel ? '<span><b>البحث:</b> ' + escapeHtml(options.searchLabel) + '</span>' : '',
    '<span><b>العدد:</b> ' + escapeHtml(invoices.length) + '</span>',
    '<span><b>تاريخ طباعة الكشف:</b> ' + escapeHtml(printedAt) + '</span></div></header>',
    '<h2>الإجماليات حسب العملة</h2>',
    '<table class="summary"><thead><tr><th>العملة</th><th>عدد الفواتير</th><th>الإجمالي</th><th>المدفوع</th>',
    '<th>المتبقي</th><th>الخصومات</th><th>الضرائب</th></tr></thead><tbody>',
    totalRows, '</tbody></table>',
    '<h2>تفاصيل الفواتير المعروضة</h2>',
    invoiceSections,
    '<footer class="foot">هذا الكشف يعرض الحالات الحالية للفواتير المطابقة للفلاتر فقط، ولا ينشئ أي قيود أو مستندات مالية جديدة.</footer>',
    '</body></html>'
  ].join('');

  popup.onload = () => {
    popup.focus();
    popup.print();
  };
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return true;
}
