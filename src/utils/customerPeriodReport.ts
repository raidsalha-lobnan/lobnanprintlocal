import { REPORT_TYPOGRAPHY_CSS } from './reportTypography';
import type {
  Party, Invoice, PaymentVoucher, PurchaseInvoice, PurchaseReturn,
  SalesReturn, PrintJobOrder, JournalEntry, DebtClearingRecord
} from '../types';
import { generateAccountStatement } from './statementGenerator';
import { isCashCustomerParty } from './partyUtils';

export type CustomerPeriodMode = 'all' | 'day' | 'range';
export type CustomerListKind = 'main' | 'sub';

export interface CustomerReportSource {
  parties: Party[];
  invoices: Invoice[];
  vouchers: PaymentVoucher[];
  purchases: PurchaseInvoice[];
  purchaseReturns: PurchaseReturn[];
  salesReturns: SalesReturn[];
  printOrders: PrintJobOrder[];
  journalEntries: JournalEntry[];
  debtClearings: DebtClearingRecord[];
}
export interface CustomerPeriodFilter {
  mode: CustomerPeriodMode;
  day: string;
  from: string;
  to: string;
  list: CustomerListKind;
  query: string;
}
export interface CustomerPeriodRow {
  party: Party;
  opening: number;
  sales: number;
  receipts: number;
  adjustments: number;
  movement: number;
  closing: number;
  invoiceCount: number;
}

const cents = (value: number): number => Math.round((Number(value) || 0) * 100);
const money = (centsValue: number): number => centsValue / 100;
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const serial = (code?: string): number => {
  const match = String(code || '').match(/(\d+)\s*$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};
export const orderCustomerCodes = (a: Party, b: Party): number => {
  const aCash = isCashCustomerParty(a) || a.code?.toUpperCase() === 'CUST-0001';
  const bCash = isCashCustomerParty(b) || b.code?.toUpperCase() === 'CUST-0001';
  if(aCash !== bCash) return aCash ? -1 : 1;
  return serial(a.code) - serial(b.code) ||
    String(a.code || '').localeCompare(String(b.code || ''), 'en', {numeric: true}) ||
    a.id.localeCompare(b.id);
};

export function customerDateBounds(filter: CustomerPeriodFilter): {
  from?: string; to?: string; label: string
} {
  if (filter.mode === 'all') return {label: 'جميع التواريخ'};
  if (filter.mode === 'day') return {
    from: filter.day, to: filter.day, label: 'يوم ' + filter.day
  };
  if (filter.from && filter.to && filter.from > filter.to)
    throw new Error('تاريخ البداية لا يجوز أن يكون بعد تاريخ النهاية.');
  return {
    from: filter.from || undefined, to: filter.to || undefined,
    label: filter.from && filter.to
      ? 'من ' + filter.from + ' إلى ' + filter.to
      : filter.from ? 'من ' + filter.from
      : filter.to ? 'حتى ' + filter.to : 'جميع التواريخ'
  };
}

export function customerPeriodRows(
  source: CustomerReportSource, filter: CustomerPeriodFilter
): CustomerPeriodRow[] {
  const bounds = customerDateBounds(filter);
  const query = filter.query.trim().toLocaleLowerCase('ar');
  const subCustomers = source.parties.filter(p => p.isSubCustomer);
  return source.parties
    .filter(p => p.type === 'customer' || p.type === 'both')
    .filter(p => filter.list === 'sub' ? !!p.isSubCustomer : !p.isSubCustomer)
    .filter(p => !query || [
      p.code, p.name, p.phone, p.contactPerson, p.city
    ].some(part => String(part || '').toLocaleLowerCase('ar').includes(query)))
    .sort(orderCustomerCodes)
    .map(party => {
      const statement = generateAccountStatement({
        party, fromDate: bounds.from, toDate: bounds.to,
        subCustomerId: party.isSubCustomer ? party.id : undefined,
        subCustomers, invoices: source.invoices, vouchers: source.vouchers,
        purchases: source.purchases, purchaseReturns: source.purchaseReturns,
        salesReturns: source.salesReturns, printOrders: source.printOrders,
        journalEntries: source.journalEntries, debtClearings: source.debtClearings
      });
      const salesRows = statement.rows.filter(row => row.type === 'invoice');
      const receiptRows = statement.rows.filter(row => row.type === 'receipt');
      const opening = cents(statement.openingBalance);
      const sales = sum(salesRows.map(row => cents(row.debit - row.credit)));
      const receipts = sum(receiptRows.map(row => cents(row.credit - row.debit)));
      const movement = cents(statement.netMovement);
      // Returns, offsets, manual journals, opening adjustments, refunds etc.
      // remain explicitly visible rather than being mislabeled as cash receipts.
      const adjustments = movement - sales + receipts;
      const closing = cents(statement.closingBalance);
      if (Math.abs(opening + movement - closing) > 1) {
        throw new Error('اختلاف في صافي رصيد كشف الحساب للعميل ' + party.code);
      }
      return {
        party, opening: money(opening), sales: money(sales),
        receipts: money(receipts), adjustments: money(adjustments),
        movement: money(movement), closing: money(closing),
        invoiceCount: salesRows.length
      };
    });
}

export const customerPeriodTotals = (rows: CustomerPeriodRow[]) => ({
  // The main customer's account includes sub-customer movements. Sum a main
  // register alone, or a sub register alone, NEVER add both grand totals.
  opening: money(sum(rows.map(x => cents(x.opening)))),
  sales: money(sum(rows.map(x => cents(x.sales)))),
  receipts: money(sum(rows.map(x => cents(x.receipts)))),
  adjustments: money(sum(rows.map(x => cents(x.adjustments)))),
  movement: money(sum(rows.map(x => cents(x.movement)))),
  closing: money(sum(rows.map(x => cents(x.closing)))),
  invoiceCount: sum(rows.map(x => x.invoiceCount)),
  customerCount: rows.length
});

const entities: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};
const esc = (text: unknown): string =>
  String(text ?? '').replace(/[&<>"']/g, value => entities[value] || value);
const number = (n: number): string =>
  n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

export function printCustomerPeriodRegister(
  source: CustomerReportSource, filter: CustomerPeriodFilter,
  businessName: string, currencySymbol: string
): void {
  const bounds = customerDateBounds(filter);
  // Both lists are printed in distinct sections, with only main accounts
  // included in the consolidated grand total.
  const mainRows = customerPeriodRows(source, {...filter, list:'main'});
  const subRows = customerPeriodRows(source, {...filter, list:'sub'});
  const openingPopup = window.open('', '_blank');
  if (!openingPopup) {
    window.alert('يرجى السماح بفتح نافذة الطباعة.');
    return;
  }
  const mainTotal = customerPeriodTotals(mainRows);
  const subtotal = (rows: CustomerPeriodRow[], heading: string) => {
    const totals = customerPeriodTotals(rows);
    const body = rows.map(row => {
      const parent = row.party.isSubCustomer && row.party.parentPartyId
        ? source.parties.find(p => p.id === row.party.parentPartyId) : null;
      return '<tr class="' + (isCashCustomerParty(row.party) ? 'cash' : '') + '">' +
        '<td class="code">' + esc(row.party.code) + '</td>' +
        '<td class="customer">' + esc(row.party.name) +
        (parent ? '<small>تابع لـ: ' + esc(parent.name) + '</small>' : '') +
        '</td><td>' + row.invoiceCount + '</td>' +
        [row.opening, row.sales, row.receipts, row.adjustments, row.movement, row.closing]
          .map(n => '<td class="num">' + number(n) + '</td>').join('') +
        '</tr>';
    }).join('');
    return '<section><h2>' + esc(heading) + ' <small>عدد الحسابات: ' + rows.length + '</small></h2>' +
      '<table><colgroup><col style="width:11%"><col style="width:23%"><col style="width:6%">' +
      '<col style="width:10%"><col style="width:10%"><col style="width:10%">' +
      '<col style="width:10%"><col style="width:10%"><col style="width:10%"></colgroup>' +
      '<thead><tr><th>رقم العميل</th><th>الاسم</th><th>الفواتير</th>' +
      '<th>رصيد أول الفترة</th><th>مبيعات الفترة</th><th>مقبوضات الفترة</th>' +
      '<th>التسويات ±</th><th>صافي الحركة</th><th>رصيد آخر الفترة</th></tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="9">لا يوجد عملاء مطابقون للبحث.</td></tr>') +
      '<tr class="total"><td colspan="2">إجمالي ' + esc(heading) + '</td>' +
      '<td>' + totals.invoiceCount + '</td>' +
      [totals.opening, totals.sales, totals.receipts, totals.adjustments, totals.movement, totals.closing]
        .map(n => '<td class="num">' + number(n) + '</td>').join('') + '</tr>' +
      '</tbody></table></section>';
  };
  const printed = new Date().toLocaleString('ar-EG');
  const markup = [
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">',
    '<title>كشف حركة وأرصدة العملاء</title><style>',
    REPORT_TYPOGRAPHY_CSS,
    '@page{size:A4 landscape;margin:9mm}',
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}',
    'body{font-family:Tahoma,Arial,sans-serif;color:#152b47;margin:0;font-size:11px}',
    'header{border-bottom:2px solid #153b66;padding:7px 0 12px;text-align:center}',
    'h1{font-size:19px;margin:6px} h2{font-size:13px;background:#eaf1fa;border-right:3px solid #24619c;padding:8px;margin:16px 0 8px}',
    'h2 small{font-size:10px;color:#53657c;margin:0 12px}',
    '.metadata{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:9px}',
    'table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px}',
    'thead{display:table-header-group}',
    'th,td{border:1px solid #bbc9d9;padding:5px 4px;text-align:right;vertical-align:middle}',
    'th{background:#d9e7f6!important;color:#1b3a60;font-weight:800}',
    'tbody tr:nth-child(even) td{background:#f1f6fc!important}',
    'tbody tr.cash td{background:#ecf5ff!important;font-weight:700}',
    '.code{direction:ltr;text-align:center;font-weight:700;white-space:nowrap}',
    '.customer{font-weight:700}.customer small{display:block;color:#677991;font-weight:400}',
    '.num{direction:ltr;text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}',
    'tr.total td{background:#183e6f!important;color:white!important;font-weight:800}',
    '.notes{background:#f4f7fb;border:1px solid #ced8e3;padding:8px;margin:13px 0}',
    '.summary{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}',
    '.summary span{border:1px solid #c5d4e3;background:#f2f7fc;padding:6px 10px;white-space:nowrap}',
    '.actions{margin:0 0 12px}.actions button{cursor:pointer;border:0;padding:8px 14px;background:#155ca4;color:#fff;border-radius:6px}',
    'section{page-break-inside:auto}tr{break-inside:avoid;page-break-inside:avoid}',
    '@media print{.actions{display:none}}',
    '</style></head><body>',
    '<div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div>',
    '<header><strong>' + esc(businessName) + '</strong><h1>كشف حركة وأرصدة العملاء</h1>',
    '<div class="metadata"><span>الفترة: ' + esc(bounds.label) + '</span>' +
      '<span>البحث: ' + esc(filter.query || 'كل العملاء') + '</span>' +
      '<span>تاريخ إعداد الكشف: ' + esc(printed) + '</span></div></header>',
    '<div class="summary"><span>الرصيد الختامي للرئيسيين: ' +
      number(mainTotal.closing) + ' ' + esc(currencySymbol) + '</span>' +
      '<span>مبيعات الفترة: ' + number(mainTotal.sales) + ' ' + esc(currencySymbol) + '</span>' +
      '<span>مقبوضات الفترة: ' + number(mainTotal.receipts) + ' ' + esc(currencySymbol) + '</span></div>',
    subtotal(mainRows, 'العملاء الرئيسيون'),
    subtotal(subRows, 'العملاء الفرعيون — للعرض التفصيلي فقط'),
    '<div class="notes"><b>ملاحظة محاسبية:</b> رصيد العميل الرئيسي يشمل معاملات العملاء الفرعيين المرتبطة به؛ ' +
      'لذلك إجمالي الكشف الموحد هو إجمالي الرئيسيين فقط، ولا تُجمع أرصدة الفرعيين فوقه مرة أخرى. ' +
      'رصيد آخر الفترة = رصيد أول الفترة + المبيعات − المقبوضات ± التسويات. ' +
      'التسويات تشمل المرتجعات والمقاصات والقيود المسموح بها وسندات الصرف ذات الأثر على الذمة. ' +
      'الأرصدة محسوبة من كشف الحساب، ولا تُعد هذه الطباعة قيدًا محاسبيًا جديدًا.</div>',
    '</body></html>'
  ].join('');
  openingPopup.document.open();
  openingPopup.document.write(markup);
  openingPopup.document.close();
  openingPopup.onload = () => { openingPopup.focus(); openingPopup.print(); };
}


/** Export the same reviewed customer data to Excel-compatible UTF-8 CSV. */
export function exportCustomerPeriodCSV(
  source: CustomerReportSource, filter: CustomerPeriodFilter
): void {
  const bounds = customerDateBounds(filter);
  const csvText = (value: unknown): string => {
    const raw = String(value ?? '');
    // Customer names must never be interpreted as Excel formulae.
    const safe = /^[=+@\t\r\n]/.test(raw) || /^-\D/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const headers = ['الرقم التسلسلي','اسم العميل','النوع','العميل الرئيسي',
    'رصيد أول الفترة','مبيعات الفترة','المقبوضات','التسويات',
    'صافي حركة الفترة','عدد الفواتير','رصيد آخر الفترة'];
  const rows: unknown[][] = [
    ['كشف حركة وأرصدة العملاء'],
    ['الفترة', bounds.label],
    ['ملاحظة','إجمالي الرئيسيين هو الإجمالي المحاسبي الموحد، والفرعيون للتفصيل فقط.']
  ];
  for (const entry of [
    {list:'main' as const,label:'العملاء الرئيسيون'},
    {list:'sub' as const,label:'العملاء الفرعيون'}
  ]) {
    const data = customerPeriodRows(source,{...filter,list:entry.list});
    const totals = customerPeriodTotals(data);
    rows.push([], [entry.label], headers);
    for(const row of data){
      const parent = row.party.parentPartyId
        ? source.parties.find(p=>p.id===row.party.parentPartyId) : null;
      rows.push([
        row.party.code,row.party.name,entry.list==='main'?'رئيسي':'فرعي',
        parent?.name||'',row.opening,row.sales,row.receipts,row.adjustments,
        row.movement,row.invoiceCount,row.closing
      ]);
    }
    rows.push(['إجمالي '+entry.label,'','','', totals.opening,totals.sales,
      totals.receipts,totals.adjustments,totals.movement,
      totals.invoiceCount,totals.closing]);
  }
  const csv = '\uFEFF' + rows.map(row=>row.map(value=>typeof value==='number'
    ? String(value) : csvText(value)).join(',')).join('\r\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = filter.mode==='all'?'كامل':
    filter.mode==='day'?filter.day:(filter.from||'البداية')+'-'+(filter.to||'النهاية');
  a.download = 'كشف-العملاء-'+suffix+'.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
