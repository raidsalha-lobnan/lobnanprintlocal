import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Invoice } from '../types';
import {
  FileText,
  Search,
  Printer,
  Calendar,
  CreditCard,
  Banknote,
  Building2,
  GitBranch,
  History,
  FileSpreadsheet,
  Trash2,
  ShieldAlert,
  Edit3,
  CalendarCheck,
  Wallet,
  X
} from 'lucide-react';
import { InvoiceStatusHistoryModal } from './pos/InvoiceStatusHistoryModal';
import { DraftInvoicesQueueModal } from './pos/DraftInvoicesQueueModal';
import { DeletedInvoicesModal } from './pos/DeletedInvoicesModal';
import { InvoiceAuditLogModal } from './pos/InvoiceAuditLogModal';
import {
  getInvoiceWorkflowStatusMeta,
  getInvoicePaymentStatusMeta,
  computeInvoicePaymentStatus,
  getInvoiceTreasuryDisplay
} from '../utils/invoiceStatusUtils';
import { formatDateDisplay } from '../utils/dateUtils';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';
import { printDetailedSalesInvoiceRegister } from '../utils/printDetailedSalesInvoiceRegister';
import { approvedCatalogCategories } from '../utils/approvedCatalogOptions';
import { salesReportPeriod } from '../utils/salesReportPeriod';
import { salesReportCustomerName } from '../utils/salesReportCustomer';
import { separateInvoiceConfirmation } from '../utils/invoiceConfirmation';

type InvoiceDateFilterMode = 'all' | 'single' | 'range';

// Filter by the invoice's currently approved document date, not creation,
// import or audit timestamps. Historical DD/MM/YYYY invoices are supported.
const toInvoiceDateKey = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const datePart = String(raw).trim().split('T')[0].replace(/[.]/g, '/');
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(datePart);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const legacy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(datePart);
  if (legacy) return `${legacy[3]}-${legacy[2].padStart(2, '0')}-${legacy[1].padStart(2, '0')}`;
  return '';
};

const currentLocalDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const InvoicesView: React.FC = () => {
  const {
    invoices,
    deletedInvoices,
    treasuries,
    inventory,
    parties,
    setSelectedInvoiceForPrint,
    setSelectedInvoiceForLifecycle,
    settings,
    setActiveTab,
    setEditingPosInvoiceId,
    openConflictModal,
    deleteInvoice
  } = useAccounting();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [dateFilterMode, setDateFilterMode] = useState<InvoiceDateFilterMode>('all');
  const [singleDate, setSingleDate] = useState<string>(currentLocalDate);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedInvoiceForStatus, setSelectedInvoiceForStatus] = useState<Invoice | null>(null);
  const [isDraftQueueOpen, setIsDraftQueueOpen] = useState<boolean>(false);
  const [isDeletedInvoicesOpen, setIsDeletedInvoicesOpen] = useState<boolean>(false);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState<boolean>(false);

  // Never count a locally queued TEMP document as an officially numbered sale.
  // It remains visible below in a separate, non-printable recovery section.
  const {confirmed: confirmedInvoices, awaitingConfirmation} = separateInvoiceConfirmation(invoices);
  const filteredInvoices = confirmedInvoices
    .filter(inv => {
      const matchType = filterType === 'all' || inv.type === filterType;
      const invoiceDate = toInvoiceDateKey(inv.date);
      const matchDate = dateFilterMode === 'all' ||
        (dateFilterMode === 'single' && invoiceDate === singleDate) ||
        (dateFilterMode === 'range' && !!invoiceDate &&
          (!dateFrom || invoiceDate >= dateFrom) &&
          (!dateTo || invoiceDate <= dateTo));
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        (inv.subCustomerName && inv.subCustomerName.toLowerCase().includes(q)) ||
        formatInvoiceCustomerDisplay(inv, parties).toLowerCase().includes(q);
      return matchType && matchSearch && matchDate;
    })
    .sort((a, b) => {
      // Sort strictly by invoice number descending: highest / latest number is at top of table
      const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numB - numA;
      const strCmp = (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
      if (strCmp !== 0) return strCmp;
      const createdCmp = (b.createdAt || '').localeCompare(a.createdAt || '');
      if (createdCmp !== 0) return createdCmp;
      return (b.date || '').localeCompare(a.date || '');
    });

  const totalInvoiced = filteredInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0);

  const handlePrintDetailedInvoices = () => {
    const periodLabel = salesReportPeriod(filteredInvoices, {
      mode: dateFilterMode, singleDate, dateFrom, dateTo,
    });
    const invoiceTypeLabel = filterType === 'pos' ? 'فواتير نقاط البيع' :
      filterType === 'print_order' ? 'فواتير أوامر الطباعة' : 'كافة أنواع الفواتير';
    const categoryNames = new Map(
      approvedCatalogCategories(settings.categories || []).map(category => [category.id, category.name])
    );
    const categoryByItem = new Map(inventory.map(item => [item.id, item.category]));
    printDetailedSalesInvoiceRegister(filteredInvoices, {
      companyName: settings.businessName || settings.name || 'المنشأة',
      settings,
      periodLabel,
      invoiceTypeLabel,
      searchLabel: searchQuery.trim(),
      customerName: invoice => salesReportCustomerName(invoice, parties),
      categoryName: invoice => {
        const ids = [...new Set((invoice.items || []).map(item =>
          categoryByItem.get(item.itemId) || item.category
        ).filter((value): value is string => Boolean(value)))];
        return ids.map(id => categoryNames.get(id) || id).join('، ');
      },
      treasuries,
    });
  };


  return (
    <div className="space-y-3">
      {/* One compact, responsive sales register command bar. */}
      <section
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs"
        dir="rtl"
        aria-label="سجل فواتير المبيعات وأدواته"
      >
        <div className="flex shrink-0 items-center gap-2 border-l border-slate-200 pl-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <FileText className="h-4 w-4" />
          </span>
          <h2 className="whitespace-nowrap text-sm font-bold text-slate-900">
            سجل فواتير المبيعات
          </h2>
        </div>

        <div className="relative min-w-[175px] max-w-[280px] flex-[1_1_190px]">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="بحث في فواتير المبيعات"
            placeholder="رقم الفاتورة أو اسم العميل..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-9 pl-2 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <select
          value={filterType}
          onChange={event => setFilterType(event.target.value)}
          aria-label="تصفية فواتير المبيعات حسب النوع"
          className="h-9 min-w-[125px] rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700"
        >
          <option value="all">كل أنواع الفواتير</option>
          <option value="pos">نقطة بيع</option>
          <option value="print_order">أوامر طباعة</option>
        </select>

        <div className="flex shrink-0 items-center gap-1.5" aria-label="تصفية الفواتير حسب التاريخ">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <select
            id="sales-invoices-date-mode"
            value={dateFilterMode}
            onChange={event => setDateFilterMode(event.target.value as InvoiceDateFilterMode)}
            aria-label="فترة الفواتير"
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700"
          >
            <option value="all">جميع التواريخ</option>
            <option value="single">تاريخ محدد</option>
            <option value="range">فترة زمنية</option>
          </select>
          {dateFilterMode === 'single' && (
            <input
              type="date"
              aria-label="تاريخ الفواتير المطلوب"
              value={singleDate}
              onChange={event => setSingleDate(event.target.value)}
              dir="ltr"
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-xs text-slate-800"
            />
          )}
          {dateFilterMode === 'range' && (
            <>
              <input
                type="date"
                aria-label="من تاريخ"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={event => setDateFrom(event.target.value)}
                dir="ltr"
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-xs text-slate-800"
              />
              <input
                type="date"
                aria-label="إلى تاريخ"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={event => setDateTo(event.target.value)}
                dir="ltr"
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-xs text-slate-800"
              />
            </>
          )}
          {dateFilterMode !== 'all' && (
            <button
              type="button"
              onClick={() => { setDateFilterMode('all'); setDateFrom(''); setDateTo(''); }}
              title="إلغاء تصفية التاريخ"
              aria-label="إلغاء تصفية التاريخ"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrintDetailedInvoices}
            disabled={filteredInvoices.length === 0}
            title="طباعة كشف تفصيلي بالفواتير المعروضة طبقًا للتصفية"
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-700 px-2.5 text-xs font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Printer className="h-4 w-4" />
            طباعة الكشف
          </button>

          <button
            type="button"
            onClick={() => setIsDeletedInvoicesOpen(true)}
            title="عرض سلة فواتير المبيعات المحذوفة واسترجاعها"
            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            المحذوفة
            {(deletedInvoices?.length || 0) > 0 && (
              <span className="rounded-full bg-amber-200 px-1.5 text-[10px] font-bold">{deletedInvoices.length}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsAuditLogOpen(true)}
            title="سجل تدقيق عمليات حذف الفواتير"
            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            سجل الحذف
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily_entry_sheet')}
            title="كشف الإدخال اليومي"
            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            الإدخال اليومي
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('excel_drafts')}
            title="إدارة واستيراد مسودات الفواتير من Excel و OneDrive"
            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            مسودات Excel
          </button>
        </div>

        <div className="mr-auto flex shrink-0 flex-wrap items-center gap-2 border-r border-slate-200 pr-2 text-[11px]">
          <span className="whitespace-nowrap font-semibold text-slate-600" role="status">
            {filteredInvoices.length} / {confirmedInvoices.length} فاتورة معتمدة
          </span>
          <span className="whitespace-nowrap font-bold tabular-nums text-slate-900" title="إجمالي الفواتير المعروضة">
            {totalInvoiced.toLocaleString('ar-SA')} {settings.currency}
          </span>
        </div>
      </section>

      {/* Locally durable sales are not official PostgreSQL invoices yet.
          Keep them accessible for recovery, but NEVER in official totals or prints. */}
      {awaitingConfirmation.length > 0 && (
        <section
          data-testid="sales-awaiting-postgres-confirmation"
          dir="rtl"
          className="rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-2.5 space-y-2 print:hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0" />
              <strong className="text-xs text-amber-950">
                {awaitingConfirmation.length} فاتورة محفوظة محليًا ولم تتسلم رقمًا رسميًا بعد
              </strong>
            </div>
            <button
              type="button"
              onClick={openConflictModal}
              className="text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
            >
              متابعة حالة المزامنة
            </button>
          </div>
          <p className="text-xs text-amber-900">
            يحاول البرنامج مزامنتها تلقائيًا. هذه الفواتير غير مدرجة في الإجمالي أو كشف الفواتير الرسمي؛ لا تُعد إدخالها ولا تحذف بيانات المتصفح.
          </p>
          <div className="flex flex-wrap gap-2">
            {awaitingConfirmation.map(invoice => (
              <div
                key={invoice.id}
                title={invoice.invoiceNumber}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs"
              >
                <span className="font-semibold text-amber-900">بانتظار اعتماد PostgreSQL</span>
                <span className="font-mono text-slate-500" dir="ltr">
                  {invoice.invoiceNumber.length > 28 ? invoice.invoiceNumber.slice(0, 24) + '…' : invoice.invoiceNumber}
                </span>
                <span className="text-slate-700">{formatInvoiceCustomerDisplay(invoice, parties)}</span>
                <span className="font-semibold tabular-nums">{invoice.totalAmount.toLocaleString('ar-SA')} {invoice.currencySymbol || settings.currency}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invoices Table - Single line per invoice */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr className="whitespace-nowrap">
                <th className="py-2.5 px-3">رقم الفاتورة</th>
                <th className="py-2.5 px-3">التاريخ</th>
                <th className="py-2.5 px-3 min-w-[220px] max-w-[340px]">العميل</th>
                <th className="py-2.5 px-3">النوع</th>
                <th className="py-2.5 px-3">طريقة الدفع</th>
                <th className="py-2.5 px-2 text-center">الصندوق / الخزينة</th>
                <th className="py-2.5 px-2 text-center w-28 min-w-[105px] max-w-[110px]">قبل الضريبة</th>
                <th className="py-2.5 px-2 text-center w-28 min-w-[105px] max-w-[110px]">الضريبة ({settings.vatRate}%)</th>
                <th className="py-2.5 px-2 text-center w-28 min-w-[105px] max-w-[110px]">الإجمالي</th>
                <th className="py-2.5 px-3">الحالة</th>
                <th className="py-2.5 px-2 text-center shrink-0">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 px-4 text-center text-sm text-slate-500">
                    لا توجد فواتير تطابق التاريخ أو خيارات البحث المحددة.
                  </td>
                </tr>
              )}
              {filteredInvoices.map((inv, idx) => (
                <tr key={`${inv.id || 'inv'}-${idx}`} className="hover:bg-slate-50/80 whitespace-nowrap transition-colors h-11">
                  <td className="py-2 px-3 whitespace-nowrap align-middle">
                    <button
                      onClick={() => {
                        setEditingPosInvoiceId(inv.id);
                        setActiveTab('pos');
                      }}
                      className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                      title="فتح لتعديل الفاتورة المباشر في شاشة الكاشير"
                    >
                      {inv.invoiceNumber}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-slate-500 whitespace-nowrap font-mono text-[11px] align-middle">{formatDateDisplay(inv.date)}</td>
                  <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap min-w-[220px] max-w-[340px] truncate align-middle" title={formatInvoiceCustomerDisplay(inv, parties)}>
                    {formatInvoiceCustomerDisplay(inv, parties)}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap align-middle">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-md font-medium inline-block ${
                        inv.type === 'pos' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      {inv.type === 'pos' ? 'نقطة بيع' : 'أمر مطبعة'}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap align-middle">
                    <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded inline-flex items-center gap-1 w-max">
                      {inv.paymentMethod === 'cash' ? (
                        <>
                          <Banknote className="w-3 h-3 text-emerald-600" />
                          <span>نقدي</span>
                        </>
                      ) : inv.paymentMethod === 'card' ? (
                        <>
                          <CreditCard className="w-3 h-3 text-blue-600" />
                          <span>شبكة</span>
                        </>
                      ) : (
                        <>
                          <Building2 className="w-3 h-3 text-amber-600" />
                          <span>آجل</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center whitespace-nowrap align-middle">
                    {(() => {
                      const tInfo = getInvoiceTreasuryDisplay(inv, treasuries);
                      return (
                        <span
                          className={`text-[11px] border px-2 py-0.5 rounded-md font-semibold inline-flex items-center gap-1 shadow-2xs max-w-[210px] truncate ${tInfo.badgeClass}`}
                          title={tInfo.label}
                        >
                          {tInfo.iconType === 'cash' && <Banknote className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          {tInfo.iconType === 'bank' && <CreditCard className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                          {tInfo.iconType === 'wallet' && <Wallet className="w-3.5 h-3.5 text-cyan-600 shrink-0" />}
                          {tInfo.iconType === 'credit' && <span className="text-slate-400 font-bold px-0.5">—</span>}
                          <span className="truncate">{tInfo.label}</span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-semibold text-slate-600 whitespace-nowrap align-middle w-28 min-w-[105px] max-w-[110px]">
                    {((inv.subtotal || 0) - (inv.discountTotal || 0)).toLocaleString('ar-SA')} {inv.currencySymbol || settings.currency}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-slate-500 whitespace-nowrap align-middle w-28 min-w-[105px] max-w-[110px]">
                    {(inv.taxAmount || 0).toLocaleString('ar-SA')} {inv.currencySymbol || settings.currency}
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-bold text-slate-900 text-xs whitespace-nowrap align-middle w-28 min-w-[105px] max-w-[110px]">
                    {(inv.totalAmount || 0).toLocaleString('ar-SA')} {inv.currencySymbol || settings.currency}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap align-middle">
                    {(() => {
                      const wfMeta = getInvoiceWorkflowStatusMeta(inv.workflowStatus);
                      const computedPayStatus = computeInvoicePaymentStatus({
                        paymentMethod: inv.paymentMethod,
                        totalAmount: inv.totalAmount,
                        paidAmount: inv.paidAmount,
                        remainingAmount: inv.remainingAmount,
                        cashPaidAmount: inv.cashPaidAmount,
                        bankPaidAmount: inv.bankPaidAmount,
                        explicitPaymentStatus: inv.paymentStatus
                      });
                      const payMeta = getInvoicePaymentStatusMeta(computedPayStatus);
                      return (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border ${wfMeta.badgeBg} ${wfMeta.badgeText} ${wfMeta.badgeBorder} inline-flex items-center gap-1`}
                            title={wfMeta.description}
                          >
                            <span>{wfMeta.label}</span>
                          </span>

                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${payMeta.bgColor} ${payMeta.color} ${payMeta.borderColor} inline-flex items-center`}
                            title={payMeta.description}
                          >
                            {payMeta.label}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-2 px-2 text-center whitespace-nowrap align-middle shrink-0">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingPosInvoiceId(inv.id);
                          setActiveTab('pos');
                        }}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded text-[10.5px] font-semibold cursor-pointer transition-colors border border-amber-200"
                        title="تعديل الفاتورة في شاشة الكاشير والمبيعات"
                      >
                        <Edit3 className="w-3 h-3 text-amber-600" />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => setSelectedInvoiceForStatus(inv)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10.5px] font-semibold cursor-pointer transition-colors border border-blue-200"
                        title={`سجل توثيق حالات الفاتورة (${inv.statusHistory?.length || 1})`}
                      >
                        <History className="w-3 h-3 text-blue-600" />
                        <span>سجل الحالة</span>
                      </button>
                      <button
                        onClick={() => setSelectedInvoiceForLifecycle(inv)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded text-[10.5px] font-semibold cursor-pointer transition-colors border border-emerald-200"
                        title="عرض مسار الحركة الآلية للعملية (7 مراحل)"
                      >
                        <GitBranch className="w-3 h-3 text-emerald-600" />
                        <span>مسار الحركة</span>
                      </button>
                      <button
                        onClick={() => setSelectedInvoiceForPrint(inv)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[10.5px] font-semibold cursor-pointer transition-colors border border-indigo-200"
                        title="طباعة الفاتورة"
                      >
                        <Printer className="w-3 h-3 text-indigo-600" />
                        <span>طباعة</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`هل أنت متأكد من حذف الفاتورة رقم (${inv.invoiceNumber}) ونقلها لسلة المحذوفات؟\n(يمكنك استعادتها وتعديلها في أي وقت لاحقاً)`)) {
                            deleteInvoice(inv.id);
                          }
                        }}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10.5px] font-semibold cursor-pointer transition-colors border border-rose-200"
                        title="حذف الفاتورة ونقلها إلى سلة المحذوفات"
                      >
                        <Trash2 className="w-3 h-3 text-rose-600" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Status & Audit History Modal */}
      {selectedInvoiceForStatus && (
        <InvoiceStatusHistoryModal
          invoice={selectedInvoiceForStatus}
          isOpen={!!selectedInvoiceForStatus}
          onClose={() => setSelectedInvoiceForStatus(null)}
        />
      )}

      {/* Live Sheet / OneDrive / Excel Drafts Modal */}
      <DraftInvoicesQueueModal
        isOpen={isDraftQueueOpen}
        onClose={() => setIsDraftQueueOpen(false)}
        onOpenInPos={() => {
          setIsDraftQueueOpen(false);
          setActiveTab('pos');
        }}
      />

      {/* Deleted Invoices Modal (Recycle Bin / Restore & Edit) */}
      <DeletedInvoicesModal
        isOpen={isDeletedInvoicesOpen}
        onClose={() => setIsDeletedInvoicesOpen(false)}
        onLoadInvoiceToScreen={(inv) => {
          setEditingPosInvoiceId(inv.id);
          setActiveTab('pos');
          setIsDeletedInvoicesOpen(false);
        }}
      />

      {/* Delete Audit Log Modal */}
      <InvoiceAuditLogModal
        isOpen={isAuditLogOpen}
        onClose={() => setIsAuditLogOpen(false)}
        initialInvoiceId="29"
      />
    </div>
  );
};
