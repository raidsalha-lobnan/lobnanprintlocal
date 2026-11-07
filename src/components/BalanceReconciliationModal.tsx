import React, { useState, useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Party } from '../types';
import {
  getPartyBalanceReconciliation,
  PartyReconciliationResult
} from '../utils/statementGenerator';
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Printer,
  Download,
  FileText,
  Scale,
  SlidersHorizontal,
  Eye,
  Info,
  Building,
  UserCheck,
  ShieldAlert,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';

interface BalanceReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BalanceReconciliationModal: React.FC<BalanceReconciliationModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    parties,
    invoices = [],
    vouchers = [],
    purchases = [],
    purchaseReturns = [],
    salesReturns = [],
    printOrders = [],
    journalEntries = [],
    debtClearings = [],
    settings,
    reconcileAllPartyBalances,
    updateParty,
    setSelectedPartyForStatement
  } = useAccounting();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'mismatch' | 'customer' | 'supplier'>('all');
  const [selectedResultForDetail, setSelectedResultForDetail] = useState<PartyReconciliationResult | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  // Compute reconciliation for all non-sub parties (or all parties)
  const reconciliationResults = useMemo(() => {
    return parties
      .filter(p => !p.isSubCustomer)
      .map(p =>
        getPartyBalanceReconciliation(
          p,
          invoices,
          vouchers,
          purchases,
          purchaseReturns,
          salesReturns,
          printOrders,
          journalEntries,
          debtClearings
        )
      );
  }, [parties, invoices, vouchers, purchases, purchaseReturns, salesReturns, printOrders, journalEntries, debtClearings]);

  // Statistics
  const totalParties = reconciliationResults.length;
  const mismatchedParties = useMemo(
    () => reconciliationResults.filter(r => r.hasMismatch),
    [reconciliationResults]
  );
  const matchedCount = totalParties - mismatchedParties.length;
  const totalDiscrepancySum = useMemo(
    () => mismatchedParties.reduce((acc, r) => acc + Math.abs(r.discrepancy), 0),
    [mismatchedParties]
  );

  // Filtered list
  const filteredResults = useMemo(() => {
    return reconciliationResults.filter(res => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        res.partyName.toLowerCase().includes(q) ||
        res.partyCode.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (filterMode === 'mismatch') return res.hasMismatch;
      if (filterMode === 'customer') return res.partyType === 'customer' || res.partyType === 'both';
      if (filterMode === 'supplier') return res.partyType === 'supplier' || res.partyType === 'both';
      return true;
    });
  }, [reconciliationResults, searchQuery, filterMode]);

  if (!isOpen) return null;

  // Single Party Fix
  const handleFixSingleParty = (res: PartyReconciliationResult) => {
    updateParty(res.partyId, { balance: res.calculatedBalance });
    setToastMessage(`تم تصحيح ومطابقة رصيد ${res.partyName} بنجاح إلى (${res.calculatedBalance.toLocaleString('ar-SA')} ${settings.currency})`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Reconcile All Action
  const handleReconcileAll = () => {
    setIsReconciling(true);
    setTimeout(() => {
      const res = reconcileAllPartyBalances();
      setIsReconciling(false);
      setToastMessage(
        res.mismatchedCount > 0
          ? `تمت معالجة ومطابقة ${res.mismatchedCount} حساب كان يحتوي على فروقات بنجاح!`
          : 'جميع الحسابات متطابقة تماماً مع سجل العمليات والدفاتر المحاسبية!'
      );
      setTimeout(() => setToastMessage(null), 5000);
    }, 300);
  };

  // Export CSV Report
  const handleExportCSV = () => {
    const headers = [
      'الكود',
      'اسم الحساب',
      'نوع الحساب',
      'الرصيد الافتتاحي',
      'إجمالي المدين',
      'إجمالي الدائن',
      'الرصيد المحسوب (الدفتر)',
      'الرصيد المسجل (قاعدة البيانات)',
      'الفرق',
      'حالة المطابقة',
      'تفاصيل وسبب الفرق'
    ];

    const rows = reconciliationResults.map(r => [
      r.partyCode,
      `"${r.partyName.replace(/"/g, '""')}"`,
      r.partyType === 'customer' ? 'عميل' : r.partyType === 'supplier' ? 'مورد' : 'عميل ومورد',
      r.openingBalance.toFixed(2),
      r.totalDebit.toFixed(2),
      r.totalCredit.toFixed(2),
      r.calculatedBalance.toFixed(2),
      r.storedBalance.toFixed(2),
      r.discrepancy.toFixed(2),
      r.hasMismatch ? 'غير متطابق ⚠️' : 'متطابق ✅',
      `"${r.mismatchReason.replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `تقرير_مطابقة_الأرصدة_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-right font-sans">
        
        {/* Header Bar */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/30 text-blue-400 rounded-lg border border-blue-500/30">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <span>شاشة مراجعة ومطابقة الأرصدة (Balance Reconciliation)</span>
                {mismatchedParties.length > 0 ? (
                  <span className="text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full">
                    يوجد {mismatchedParties.length} حساب يحتاج مطابقة
                  </span>
                ) : (
                  <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    جميع الأرصدة متطابقة ✅
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 font-light">
                مراجعة ومطابقة أرصدة قاعدة البيانات مع حركة فواتير البيع، المشتريات، سندات القبض والصرف والرصيد الافتتاحي
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-inner animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="hover:opacity-80">✕</button>
          </div>
        )}

        {/* Main Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-medium">إجمالي الحسابات</span>
              <div className="font-mono font-extrabold text-xl text-slate-800 mt-1">{totalParties}</div>
              <span className="text-[10px] text-slate-400">عملاء وموردين مسجلين</span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs">
              <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>حسابات متطابقة</span>
              </span>
              <div className="font-mono font-extrabold text-xl text-emerald-700 mt-1">{matchedCount}</div>
              <span className="text-[10px] text-emerald-600/80">
                {totalParties > 0 ? Math.round((matchedCount / totalParties) * 100) : 100}% مطابقة سليمة
              </span>
            </div>

            <div className={`bg-white p-3 rounded-lg border shadow-2xs ${mismatchedParties.length > 0 ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'}`}>
              <span className="text-[11px] text-rose-700 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>حسابات بها فروقات</span>
              </span>
              <div className="font-mono font-extrabold text-xl text-rose-700 mt-1">{mismatchedParties.length}</div>
              <span className="text-[10px] text-rose-600">تتطلب تحديث ومطابقة</span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-amber-200 shadow-2xs">
              <span className="text-[11px] text-amber-700 font-medium">إجمالي قيمة الفروقات</span>
              <div className="font-mono font-extrabold text-lg text-amber-800 mt-1">
                {totalDiscrepancySum.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
              </div>
              <span className="text-[10px] text-amber-600">فارق تجميعي بين الدفاتر والدليل</span>
            </div>
          </div>

          {/* Controls Bar & Fast Action */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs shrink-0 overflow-x-auto">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                  filterMode === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الكل ({totalParties})
              </button>
              <button
                onClick={() => setFilterMode('mismatch')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  filterMode === 'mismatch' ? 'bg-rose-600 text-white shadow-2xs' : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>غير متطابق ({mismatchedParties.length})</span>
              </button>
              <button
                onClick={() => setFilterMode('customer')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                  filterMode === 'customer' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                العملاء
              </button>
              <button
                onClick={() => setFilterMode('supplier')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                  filterMode === 'supplier' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الموردين
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث باسم الحساب أو الكود..."
                className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleReconcileAll}
                disabled={isReconciling}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                title="تحديث ومطابقة جميع الأرصدة بقاعدة البيانات مع دفاتر العمليات بنقرة واحدة"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                <span>مطابقة وتحديث الأرصدة تلقائياً</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition-colors cursor-pointer border border-slate-200"
                title="تصدير كملف إكسل CSV"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                onClick={handlePrintReport}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition-colors cursor-pointer border border-slate-200"
                title="طباعة التقرير"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Results Comparison Table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-800 text-white font-bold text-[11px] border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">الكود</th>
                    <th className="py-2.5 px-3">اسم الحساب والنوع</th>
                    <th className="py-2.5 px-3 text-center">الرصيد الافتتاحي</th>
                    <th className="py-2.5 px-3 text-center">إجمالي المبيعات/المشتريات</th>
                    <th className="py-2.5 px-3 text-center">إجمالي السندات (قبض/صرف)</th>
                    <th className="py-2.5 px-3 text-center">الرصيد المحسوب (الدفتر)</th>
                    <th className="py-2.5 px-3 text-center">الرصيد المسجل (قاعدة البيانات)</th>
                    <th className="py-2.5 px-3 text-center">الفارق / الخلل</th>
                    <th className="py-2.5 px-3 text-center">حالة المطابقة</th>
                    <th className="py-2.5 px-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                        لا توجد نتائج مطابقة للبحث أو التصفية الحالية.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map(res => {
                      const isCustomer = res.partyType === 'customer' || res.partyType === 'both';
                      const isSupplier = res.partyType === 'supplier' || res.partyType === 'both';

                      return (
                        <tr
                          key={res.partyId}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            res.hasMismatch ? 'bg-rose-50/20 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-600">{res.partyCode || '-'}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{res.partyName}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                isCustomer ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {isCustomer && !isSupplier ? 'عميل' : isSupplier && !isCustomer ? 'مورد' : 'كلاهما'}
                              </span>
                            </div>
                          </td>

                          {/* Opening Balance */}
                          <td className="py-2.5 px-3 text-center font-mono">
                            {res.openingBalance !== 0 ? (
                              <span className={res.openingBalanceType === 'credit' ? 'text-rose-600' : 'text-blue-600'}>
                                {res.openingBalance.toLocaleString('ar-SA')} ({res.openingBalanceType === 'credit' ? 'دائن' : 'مدين'})
                              </span>
                            ) : (
                              <span className="text-slate-300">0.00</span>
                            )}
                          </td>

                          {/* Sales / Purchases Debit/Credit */}
                          <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                            {isCustomer && (
                              <div>فواتير: <span className="font-bold">{res.breakdown.invoicesDebit.toLocaleString('ar-SA')}</span></div>
                            )}
                            {isSupplier && (
                              <div>مشتريات: <span className="font-bold">{res.breakdown.purchasesCredit.toLocaleString('ar-SA')}</span></div>
                            )}
                          </td>

                          {/* Vouchers */}
                          <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                            {res.breakdown.vouchersReceiptCredit > 0 && (
                              <div className="text-emerald-700">قبض: {res.breakdown.vouchersReceiptCredit.toLocaleString('ar-SA')}</div>
                            )}
                            {res.breakdown.vouchersPaymentDebit > 0 && (
                              <div className="text-blue-700">صرف: {res.breakdown.vouchersPaymentDebit.toLocaleString('ar-SA')}</div>
                            )}
                            {res.breakdown.vouchersReceiptCredit === 0 && res.breakdown.vouchersPaymentDebit === 0 && (
                              <span className="text-slate-300">0.00</span>
                            )}
                          </td>

                          {/* Calculated Ledger Balance */}
                          <td className="py-2.5 px-3 text-center font-mono font-extrabold bg-blue-50/50 text-blue-900 border-x border-blue-100">
                            {res.calculatedBalance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                            <span className="block text-[9px] font-normal text-slate-500">
                              {res.calculatedBalance > 0 ? '(لنا مطلوب منه)' : res.calculatedBalance < 0 ? '(علينا مستحق له)' : '(خالص)'}
                            </span>
                          </td>

                          {/* Stored DB Balance */}
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                            {res.storedBalance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                          </td>

                          {/* Discrepancy */}
                          <td className="py-2.5 px-3 text-center font-mono font-bold">
                            {res.hasMismatch ? (
                              <span className={`px-2 py-0.5 rounded text-[11px] ${
                                res.discrepancy > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
                              }`}>
                                {res.discrepancy > 0 ? `+${res.discrepancy.toLocaleString('ar-SA')}` : res.discrepancy.toLocaleString('ar-SA')}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-normal">0.00</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-2.5 px-3 text-center">
                            {res.hasMismatch ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>غير متطابق</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>متطابق ✅</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setSelectedResultForDetail(res)}
                                className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                                title="معاينة تفاصيل الخلل والحسبة"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-600" />
                                <span>التفاصيل</span>
                              </button>

                              {res.hasMismatch && (
                                <button
                                  onClick={() => handleFixSingleParty(res)}
                                  className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded text-[10px] font-bold cursor-pointer"
                                  title="تحديث هذا الحساب ورصيده فقط"
                                >
                                  مطابقة
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              قاعدة المطابقة: الرصيد المعتمد = الرصيد الافتتاحي + فواتير المبيعات/المشتريات - المباشرة - سندات القبض والصرف - المردودات والمقاصة.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* Detail Breakdown Modal Drawer */}
      {selectedResultForDetail && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl text-right p-4 space-y-4">
            
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900">
                  تفاصيل وحسبة الخلل للطرف: {selectedResultForDetail.partyName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedResultForDetail(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Alert Banner for mismatch */}
            <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
              selectedResultForDetail.hasMismatch
                ? 'bg-rose-50 border-rose-300 text-rose-900 font-semibold'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}>
              {selectedResultForDetail.mismatchReason}
            </div>

            {/* Breakdown Table */}
            <div className="border rounded-lg overflow-hidden text-xs">
              <table className="w-full text-right divide-y divide-slate-100">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="py-2 px-3">بند الحركة</th>
                    <th className="py-2 px-3 text-center">مدين (+)</th>
                    <th className="py-2 px-3 text-center">دائن (-)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-1.5 px-3">الرصيد الافتتاحي التأسيسي</td>
                    <td className="py-1.5 px-3 text-center font-mono">{selectedResultForDetail.breakdown.openingDebit.toLocaleString('ar-SA')}</td>
                    <td className="py-1.5 px-3 text-center font-mono">{selectedResultForDetail.breakdown.openingCredit.toLocaleString('ar-SA')}</td>
                  </tr>
                  {selectedResultForDetail.breakdown.invoicesDebit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">إجمالي فواتير المبيعات (سحوبات)</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-blue-700">{selectedResultForDetail.breakdown.invoicesDebit.toLocaleString('ar-SA')}</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.invoicesCredit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">سدادات مسددة مع فواتير المبيعات</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-emerald-700">{selectedResultForDetail.breakdown.invoicesCredit.toLocaleString('ar-SA')}</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.purchasesCredit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">إجمالي فواتير المشتريات من المورد</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-purple-700">{selectedResultForDetail.breakdown.purchasesCredit.toLocaleString('ar-SA')}</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.vouchersReceiptCredit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">إجمالي سندات القبض المستلمة (تحصيلات)</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-emerald-700">{selectedResultForDetail.breakdown.vouchersReceiptCredit.toLocaleString('ar-SA')}</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.vouchersPaymentDebit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">إجمالي سندات الصرف (سدادات)</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-blue-700">{selectedResultForDetail.breakdown.vouchersPaymentDebit.toLocaleString('ar-SA')}</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.salesReturnsCredit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">مردودات مبيعات</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-amber-700">{selectedResultForDetail.breakdown.salesReturnsCredit.toLocaleString('ar-SA')}</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.purchaseReturnsDebit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">مردودات مشتريات للمورد</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-emerald-700">{selectedResultForDetail.breakdown.purchaseReturnsDebit.toLocaleString('ar-SA')}</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.printOrdersDebit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">أوامر تشغيل مطبعة مسلمة غير مفلترة</td>
                      <td className="py-1.5 px-3 text-center font-mono font-bold text-blue-700">{selectedResultForDetail.breakdown.printOrdersDebit.toLocaleString('ar-SA')}</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                    </tr>
                  )}
                  {selectedResultForDetail.breakdown.debtClearingsCredit > 0 && (
                    <tr>
                      <td className="py-1.5 px-3">مقاصة تسوية حسابات</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-300">0.00</td>
                      <td className="py-1.5 px-3 text-center font-mono text-emerald-700">{selectedResultForDetail.breakdown.debtClearingsCredit.toLocaleString('ar-SA')}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-900 text-white font-bold border-t">
                    <td className="py-2 px-3">الصافي المحسوب الدفتري النهائي</td>
                    <td colSpan={2} className="py-2 px-3 text-center font-mono text-emerald-400">
                      {selectedResultForDetail.calculatedBalance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                    </td>
                  </tr>
                  <tr className="bg-slate-100 font-bold border-t text-slate-800">
                    <td className="py-2 px-3">الرصيد القائم المسجل بقاعدة البيانات</td>
                    <td colSpan={2} className="py-2 px-3 text-center font-mono">
                      {selectedResultForDetail.storedBalance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              {selectedResultForDetail.hasMismatch && (
                <button
                  onClick={() => {
                    handleFixSingleParty(selectedResultForDetail);
                    setSelectedResultForDetail(null);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  اعتماد وتصحيح الرصيد الآن
                </button>
              )}
              <button
                onClick={() => setSelectedResultForDetail(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
