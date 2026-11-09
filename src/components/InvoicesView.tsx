import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Invoice } from '../types';
import {
  FileText,
  Search,
  Printer,
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  CreditCard,
  Banknote,
  Building2,
  GitBranch,
  Layers,
  CheckCircle2,
  ArrowLeft,
  History,
  FileSpreadsheet,
  Trash2,
  ShieldAlert,
  Edit3,
  CalendarCheck,
  Wallet,
  RefreshCw
} from 'lucide-react';
import { InvoiceStatusHistoryModal } from './pos/InvoiceStatusHistoryModal';
import { DraftInvoicesQueueModal } from './pos/DraftInvoicesQueueModal';
import { DeletedInvoicesModal } from './pos/DeletedInvoicesModal';
import { InvoiceAuditLogModal } from './pos/InvoiceAuditLogModal';
import { DeleteAllSalesInvoicesModal } from './modals/DeleteAllSalesInvoicesModal';
import {
  getInvoiceWorkflowStatusMeta,
  getInvoicePaymentStatusMeta,
  computeInvoicePaymentStatus,
  getInvoiceTreasuryDisplay
} from '../utils/invoiceStatusUtils';
import { formatDateDisplay } from '../utils/dateUtils';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';
import { printDetailedSalesInvoiceRegister } from '../utils/printDetailedSalesInvoiceRegister';

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
    parties,
    setSelectedInvoiceForPrint,
    setSelectedInvoiceForLifecycle,
    settings,
    setActiveTab,
    setEditingPosInvoiceId,
    deleteInvoice,
    recoverInvoicesFromAllBackups
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
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  const handleRecoverInvoices = async () => {
    setIsRecovering(true);
    setRecoveryNotice(null);
    try {
      const res = await recoverInvoicesFromAllBackups();
      setRecoveryNotice(res.message);
    } catch (e: any) {
      setRecoveryNotice('حدث خطأ أثناء فحص واسترجاع الفواتير: ' + (e?.message || 'غير معروف'));
    } finally {
      setIsRecovering(false);
    }
  };

  const filteredInvoices = invoices
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
    const periodLabel = dateFilterMode === 'all'
      ? 'جميع التواريخ'
      : dateFilterMode === 'single'
        ? 'يوم ' + formatDateDisplay(singleDate)
        : dateFrom && dateTo
          ? 'من ' + formatDateDisplay(dateFrom) + ' إلى ' + formatDateDisplay(dateTo)
          : dateFrom
            ? 'من ' + formatDateDisplay(dateFrom) + ' فصاعدًا'
            : dateTo
              ? 'حتى ' + formatDateDisplay(dateTo)
              : 'جميع التواريخ';
    const invoiceTypeLabel = filterType === 'pos'
      ? 'فواتير نقطة البيع'
      : filterType === 'print_order'
        ? 'فواتير أوامر الطباعة'
        : 'كافة أنواع الفواتير';
    printDetailedSalesInvoiceRegister(filteredInvoices, {
      companyName: settings.companyName || 'مطبعة ومكتبة لبنان',
      periodLabel,
      invoiceTypeLabel,
      searchLabel: searchQuery.trim(),
      customerName: invoice => formatInvoiceCustomerDisplay(invoice, parties),
      treasuries
    });
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">سجل فواتير المبيعات</h2>
            <p className="text-[10px] text-slate-400 font-light">فواتير نقاط البيع السريعة، وأوامر مطبوعات المطبعة المعتمدة</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRecoverInvoices}
            disabled={isRecovering}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
            title="فحص واسترجاع ودمج كافة الفواتير المدخلة من كافة النسخ الاحتياطية وقاعدة البيانات السحابية"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-100 ${isRecovering ? 'animate-spin' : ''}`} />
            <span>{isRecovering ? 'جاري الاسترجاع والدمج...' : 'استرجاع ودمج الفواتير'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDeleteAllModalOpen(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
            title="حذف كافة فواتير المبيعات من قاعدة البيانات واسترجاع المخزون وحذف السندات المرتبطة"
          >
            <Trash2 className="w-4 h-4 text-rose-200" />
            <span>حذف كل فواتير المبيعات</span>
            {invoices.length > 0 && (
              <span className="bg-rose-800 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full font-mono">
                {invoices.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsDeletedInvoicesOpen(true)}
            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
            title="سلة فواتير المبيعات المحذوفة - استعراض وتعديل واسترجاع الفواتير المحذوفة"
          >
            <Trash2 className="w-4 h-4 text-amber-700" />
            <span>سلة الفواتير المحذوفة</span>
            {(deletedInvoices?.length || 0) > 0 && (
              <span className="bg-amber-500 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded-full font-mono">
                {deletedInvoices.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsAuditLogOpen(true)}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
            title="سجل تدقيق الحذف من قاعدة البيانات السحابية (Audit Log)"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>سجل الحذف (Audit Log)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily_entry_sheet')}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            title="فتح شاشة كشف الإدخال اليومي لتسجيل ومتابعة الحركات اليومية"
          >
            <CalendarCheck className="w-4 h-4 text-blue-200" />
            <span>كشف إدخال يومي</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('excel_drafts')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
            title="فتح الشاشة المخصصة لإدارة واستيراد مسودات الفواتير من Excel و OneDrive وتعديلها واعتمادها بالتتابع"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>مسودات Excel / OneDrive</span>
          </button>

          <div className="text-left bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-500 block">إجمالي الفواتير المعروضة:</span>
            <strong className="text-slate-900 text-sm font-mono font-black">
              {(totalInvoiced || 0).toLocaleString('ar-SA')} {settings.currency}
            </strong>
          </div>
        </div>
      </div>

      {recoveryNotice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-4 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{recoveryNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecoveryNotice(null)}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Single-Entry 7-Stage Cascade Architecture Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl border border-indigo-900/50 shadow-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold">دورة الإدخال الواحد المؤتمتة (Single Entry Cascading Flow)</h3>
              <p className="text-[11px] text-slate-400">تُسجل الفاتورة مرة واحدة لتُحدث تلقائياً السلسلة المحاسبية الكاملة دون أي تكرار يدوي:</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            ✓ ترحيل فوري متوازي 100%
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 text-center text-[11px] pt-2 border-t border-slate-800">
          <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 font-medium text-slate-200">
            1. الفاتورة
          </div>
          <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 font-medium text-slate-200">
            2. المخزون
          </div>
          <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 font-medium text-slate-200">
            3. العميل
          </div>
          <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 font-medium text-slate-200">
            4. الصندوق/البنك
          </div>
          <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 font-medium text-slate-200">
            5. تكلفة المبيعات
          </div>
          <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 font-medium text-slate-200">
            6. الحسابات
          </div>
          <div className="bg-indigo-900/80 p-1.5 rounded-lg border border-indigo-700 font-bold text-indigo-200">
            7. التقارير
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث برقم الفاتورة، اسم العميل..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700"
          >
            <option value="all">كافة أنواع الفواتير</option>
            <option value="pos">فواتير نقطة البيع (الكاشير)</option>
            <option value="print_order">فواتير أوامر الطباعة</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2" dir="rtl" aria-label="تصفية فواتير المبيعات حسب التاريخ">
          <label htmlFor="sales-invoices-date-mode" className="text-xs font-bold text-slate-700 whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5 inline-block ml-1 text-indigo-600" />
            تصفية حسب التاريخ
          </label>
          <select
            id="sales-invoices-date-mode"
            value={dateFilterMode}
            onChange={e => setDateFilterMode(e.target.value as InvoiceDateFilterMode)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700"
          >
            <option value="all">كل الفواتير</option>
            <option value="single">تاريخ محدد</option>
            <option value="range">من تاريخ إلى تاريخ</option>
          </select>

          {dateFilterMode === 'single' && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-600">
              <span>التاريخ</span>
              <input
                type="date"
                aria-label="تاريخ الفواتير المطلوب"
                value={singleDate}
                onChange={e => setSingleDate(e.target.value)}
                dir="ltr"
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800"
              />
            </label>
          )}

          {dateFilterMode === 'range' && (
            <>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <span>من</span>
                <input
                  type="date"
                  aria-label="من تاريخ"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={e => setDateFrom(e.target.value)}
                  dir="ltr"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800"
                />
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <span>إلى</span>
                <input
                  type="date"
                  aria-label="إلى تاريخ"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={e => setDateTo(e.target.value)}
                  dir="ltr"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800"
                />
              </label>
            </>
          )}

          {dateFilterMode !== 'all' && (
            <button
              type="button"
              onClick={() => { setDateFilterMode('all'); setDateFrom(''); setDateTo(''); }}
              className="text-xs text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl"
              title="إلغاء تصفية التاريخ وعرض جميع الفواتير"
            >
              عرض كل الفواتير
            </button>
          )}
          <button
            type="button"
            onClick={handlePrintDetailedInvoices}
            disabled={filteredInvoices.length === 0}
            className="inline-flex items-center gap-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl px-4 py-2 shadow-xs transition-colors"
            title="طباعة كشف تفصيلي للفواتير المطابقة للتاريخ والبحث ونوع الفاتورة"
          >
            <Printer className="w-4 h-4" />
            طباعة كشف الفواتير المعروضة
          </button>
          <span className="text-[11px] text-slate-500" role="status">
            المعروض: {filteredInvoices.length} من {invoices.length} فاتورة
          </span>
        </div>
      </div>

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

      {/* Delete All Sales Invoices Modal */}
      <DeleteAllSalesInvoicesModal
        isOpen={isDeleteAllModalOpen}
        onClose={() => setIsDeleteAllModalOpen(false)}
      />
    </div>
  );
};
