import type { Invoice } from '../types';
import { formatDateDisplay } from './dateUtils';

export interface DetailedSalesReportOptions {
  companyName: string;
  periodLabel: string;
  invoiceTypeLabel: string;
  searchLabel: string;
  customerName: (invoice: Invoice) => string;
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
    const rows = items.length ? items.map((item, lineIndex) =>
      '<tr><td>' + escapeHtml(lineIndex + 1) + '</td><td>' +
        escapeHtml(item.itemCode || item.itemId || '—') + '</td><td>' +
        escapeHtml(item.itemName || '—') +
        (item.description ? '<div class="item-note">' + escapeHtml(item.description) + '</div>' : '') +
        '</td><td class="num">' + formatQuantity(item.quantity) + '</td><td class="num">' +
        formatAmount(item.unitPrice) + '</td><td class="num">' +
        formatAmount(item.discount) + '</td><td class="num">' +
        formatAmount(item.tax) + '</td><td class="num strong">' +
        formatAmount(item.total) + '</td></tr>'
    ).join('') : '<tr><td colspan="8" class="center">لا توجد أصناف مسجلة</td></tr>';

    return [
      '<section class="invoice">',
      '<div class="invoice-heading"><strong>فاتورة ' + escapeHtml(index + 1) + ' / ' +
        escapeHtml(invoice.invoiceNumber) + '</strong><span>التاريخ: ' +
        escapeHtml(formatDateDisplay(invoice.date)) + '</span><span>العميل: ' +
        escapeHtml(options.customerName(invoice)) + '</span></div>',
      '<div class="meta">النوع: ' +
        escapeHtml(invoice.type === 'pos' ? 'نقطة بيع' : invoice.type === 'print_order' ? 'أمر مطبعة' : 'مبيعات') +
        ' | طريقة الدفع: ' + escapeHtml(paymentLabel(invoice)) +
        ' | الحالة: ' + escapeHtml(statusLabel(invoice)) +
        (invoice.warehouse ? ' | المخزن: ' + escapeHtml(invoice.warehouse) : '') +
        '</div>',
      '<table class="lines"><thead><tr><th>#</th><th>كود الصنف</th><th>الصنف / البيان</th>' +
        '<th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead>',
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
    '.invoice { margin: 12px 0 17px; break-inside: avoid-page; page-break-inside: avoid; }',
    '.invoice-heading { background: #edf3fa; padding: 8px; display: flex; flex-wrap: wrap; gap: 8px 22px; border: 1px solid #c4ced8; }',
    '.invoice-heading strong { font-size: 12px; } .meta { padding: 6px 4px; color: #465a6e; }',
    '.lines th:nth-child(3) { min-width: 150px; }',
    '.num { white-space: nowrap; direction: ltr; text-align: right; font-variant-numeric: tabular-nums; }',
    '.strong { font-weight: bold; } .center { text-align: center; color: #62758a; }',
    '.item-note { font-size: 9px; color: #596d80; padding-top: 2px; white-space: pre-wrap; }',
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
