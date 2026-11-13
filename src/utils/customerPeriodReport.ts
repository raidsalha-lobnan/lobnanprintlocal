import { REPORT_TYPOGRAPHY_CSS } from './reportTypography';
import { renderBusinessReportHeader } from './reportBusinessHeader';
import type { BusinessSettings } from '../types';
import type {
  Party, Invoice, PaymentVoucher, PurchaseInvoice, PurchaseReturn,
  SalesReturn, PrintJobOrder, JournalEntry, DebtClearingRecord
} from '../types';
import { generateAccountStatement } from './statementGenerator';
import { indexedSubCustomers, normalizeSubCustomerName } from './subCustomerIdentity';
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
  const query = normalizeSubCustomerName(filter.query);
  const subCustomers = indexedSubCustomers(source.parties, source.invoices);
  return [...source.parties.filter(p => !p.isSubCustomer), ...subCustomers]
    .filter(p => p.type === 'customer' || p.type === 'both')
    .filter(p => filter.list === 'sub' ? !!p.isSubCustomer : !p.isSubCustomer)
    .filter(p => !query || [
      p.code, p.name, p.phone, p.contactPerson, p.city
    ].some(part => normalizeSubCustomerName(String(part || '')).includes(query)))
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
  businessName: string, currencySymbol: string, settings?: BusinessSettings
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
    '@page{size:A4 portrait;margin:9mm 8mm 11mm}',
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}',
    'html{background:#e9eef5}body{font:9pt/1.27 Tahoma,Arial,sans-serif;color:#142947;margin:0 auto;max-width:210mm;background:white;padding:8mm}',
    '.business-letterhead{margin-bottom:2mm;width:100%}.business-letterhead img{display:block;width:100%;height:25mm;object-fit:contain;object-position:center}',
    '.business-standard{display:flex;direction:rtl;align-items:center;gap:3mm;min-height:23mm;margin-bottom:2mm;border-bottom:1px solid #2b608d;padding-bottom:1mm}',
    '.business-logo{height:20mm;width:20mm;object-fit:contain}.business-identity{display:flex;flex-direction:column;min-width:0;flex:1}',
    '.business-identity strong{font-size:13.5pt;color:#103e6b}.business-identity small{font-size:7.5pt;color:#435a72}',
    '.business-contact{display:flex;flex-direction:column;gap:1mm;max-width:42%;font-size:7pt;color:#253d5a}',
    'h1{font-size:15pt;margin:2mm 0;text-align:center;color:#123e67} h2{font-size:9pt;background:#eef4fb;border-right:2px solid #225781;padding:1.5mm 2mm;margin:4mm 0 1.5mm;break-after:avoid}',
    'h2 small{font-size:10px;color:#53657c;margin:0 12px}',
    '.criteria{display:flex;flex-wrap:wrap;gap:1mm 4mm;padding:1mm 0 2mm;border-bottom:1px solid #1b5284;font-size:8pt}',
    'table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:7.25pt;direction:rtl}',
    'thead{display:table-header-group}',
    'th,td{border:1px solid #a9bdcf;padding:1.05mm .55mm;text-align:center;vertical-align:middle;overflow-wrap:anywhere;line-height:1.22}',
    'th{background:#eef4fb!important;color:#16436c;font-weight:700;font-size:7pt}',
    'tbody tr:nth-child(even) td{background:#f1f6fc!important}',
    'tbody tr.cash td{background:#ecf5ff!important;font-weight:700}',
    '.code{direction:ltr;text-align:center;font-weight:700;white-space:nowrap;font-size:7pt}',
    '.customer{text-align:right;font-weight:700}.customer small{display:block;color:#677991;font-weight:400;font-size:6.6pt}',
    '.num{direction:ltr;text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:7pt}',
    'tr.total td{background:#e2ecf7!important;color:#123c64;font-weight:800}',
    '.notes{border-top:1px solid #aac0d5;padding:2mm 0;margin-top:3mm;font-size:7.2pt;color:#455d76}',
    '.summary{display:flex;gap:2mm;flex-wrap:wrap;margin:3mm 0}',
    '.summary span{border:1px solid #adbed1;background:#eef4fb;padding:1.5mm 2mm;font-size:8pt}',
    '.actions{margin:0 0 12px}.actions button{cursor:pointer;border:0;padding:8px 14px;background:#155ca4;color:#fff;border-radius:6px}',
    'section{page-break-inside:auto}tr{break-inside:avoid;page-break-inside:avoid}',
    '@media print{html,body{background:white!important;max-width:none;margin:0;padding:0}.actions{display:none!important}}',
    '</style></head><body>',
    '<div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div>',
    '<header>' + (settings ? renderBusinessReportHeader(settings) : '<div class="business-standard"><div class="business-identity"><strong>' + esc(businessName) + '</strong></div></div>') + '<h1>كشف حركة وأرصدة العملاء</h1>',
    '<div class="criteria"><span><b>الفترة:</b> ' + esc(bounds.label) + '</span>' +
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
