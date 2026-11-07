import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { ReceiptVoucherModal } from './pos/ReceiptVoucherModal';
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  User,
  Filter,
  Printer,
  Trash2,
  DollarSign,
  TrendingUp,
  Landmark,
  FileText,
  CreditCard,
  Building2,
  CheckCircle2
} from 'lucide-react';

export const ReceiptVouchersView: React.FC = () => {
  const {
    vouchers,
    deletePaymentVoucher,
    setSelectedVoucherForPrint,
    parties,
    treasuries,
    settings
  } = useAccounting();

  // Receipt vouchers only
  const receiptVouchers = useMemo(() => {
    return vouchers.filter(v => v.type === 'receipt');
  }, [vouchers]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | 'cash' | 'bank_transfer' | 'cheque'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal open
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filtered vouchers
  const filteredVouchers = useMemo(() => {
    return receiptVouchers.filter(v => {
      if (methodFilter !== 'all' && v.paymentMethod !== methodFilter) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = v.voucherNumber.toLowerCase().includes(q);
        const matchParty = v.partyName && v.partyName.toLowerCase().includes(q);
        const matchDesc = v.description && v.description.toLowerCase().includes(q);
        if (!matchNum && !matchParty && !matchDesc) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [receiptVouchers, methodFilter, fromDate, toDate, searchQuery]);

  // Statistics
  const todayIso = new Date().toISOString().split('T')[0];
  const totalAmount = receiptVouchers.reduce((sum, v) => sum + v.amount, 0);
  const todayAmount = receiptVouchers.filter(v => v.date === todayIso).reduce((sum, v) => sum + v.amount, 0);
  const cashTotal = receiptVouchers.filter(v => v.paymentMethod === 'cash').reduce((sum, v) => sum + v.amount, 0);
  const bankTotal = receiptVouchers.filter(v => v.paymentMethod === 'bank_transfer' || v.paymentMethod === 'cheque').reduce((sum, v) => sum + v.amount, 0);

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'cash':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
            <DollarSign className="w-3 h-3" />
            <span>نقداً (كاش)</span>
          </span>
        );
      case 'bank_transfer':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">
            <Landmark className="w-3 h-3" />
            <span>تحويل بنكي</span>
          </span>
        );
      case 'cheque':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-[11px] font-medium">
            <CreditCard className="w-3 h-3" />
            <span>شيك بنكي</span>
          </span>
        );
      default:
        return <span className="text-[10px] text-slate-400 font-light">{method}</span>;
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Top Header & Actions */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Receipt className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-800">سندات القبض (التحصيلات المالية)</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-light mt-1">
            إدارة وتحرير وطباعة سندات القبض المالية للعملاء وإيداع المبالغ بالصناديق والحسابات البنكية مع الترحيل المحاسبي التلقائي
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>تحرير سند قبض جديد</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">إجمالي المقبوضات المسجلة</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-emerald-600">
              {totalAmount.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">{receiptVouchers.length} سند قبض معتمد</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">مقبوضات اليوم</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-slate-800">
              {todayAmount.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-emerald-600 mt-1 block">سداد فواتير ودفعات جارية</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">المقبوضات النقدية (الكاش)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-slate-800">
              {cashTotal.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">أودعت في صناديق الكاشير</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">المقبوضات البنكية والشيكات</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-blue-600">
              {bankTotal.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">حوالات وشيكات تحت التحصيل</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث برقم السند، اسم العميل، البيان..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">كل طرق الدفع</option>
              <option value="cash">نقداً (كاش)</option>
              <option value="bank_transfer">تحويل بنكي</option>
              <option value="cheque">شيك</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="text-[11px] text-slate-400">من:</span>
          <DateInput value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">إلى:</span>
          <DateInput value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
          />
          {(searchQuery || methodFilter !== 'all' || fromDate || toDate) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setMethodFilter('all');
                setFromDate('');
                setToDate('');
              }}
              className="text-emerald-600 hover:text-emerald-700 text-[11px] font-medium px-2 py-1"
            >
              إلغاء الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="p-3">رقم السند</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">المقبوض منه (العميل)</th>
                <th className="p-3">البيان والشرح</th>
                <th className="p-3">طريقة القبض</th>
                <th className="p-3">الصندوق / الحساب المودع فيه</th>
                <th className="p-3">المبلغ المقبوض</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">لا توجد سندات قبض مطابقة لمعايير البحث</p>
                  </td>
                </tr>
              ) : (
                filteredVouchers.map((v, idx) => {
                  const party = parties.find(p => p.id === v.partyId);
                  const treasury = treasuries.find(t => t.accountCode === v.accountCode || t.accountCode === v.treasuryAccountCode);
                  const treasuryName = treasury?.name || (v.paymentMethod === 'cash' ? 'الصندوق الرئيسي (الكاشير)' : 'الحساب البنكي');

                  return (
                    <tr key={`${v.id || 'rec-v'}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono font-bold text-emerald-600">
                        {v.voucherNumber}
                      </td>
                      <td className="p-3 text-slate-600">{v.date}</td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-800 block">
                          {v.partyName || party?.name || 'عميل نقدي'}
                        </span>
                        {party?.phone && (
                          <span className="text-[10px] text-slate-400 font-mono">{party.phone}</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-700">
                        <div className="flex items-center gap-1.5 bg-blue-50/70 border border-blue-200/70 rounded-lg px-2 py-1 text-xs text-blue-950 font-medium max-w-[280px]">
                          <FileText className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                          <span className="font-bold text-blue-900 shrink-0 text-[11px]">ملاحظة مرتبطة بالسند:</span>
                          <span className="truncate" title={v.description || 'سداد دفعة'}>
                            {v.description || 'سداد دفعة من الحساب'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">{getMethodBadge(v.paymentMethod)}</td>
                      <td className="p-3 text-slate-600 font-medium">
                        {treasuryName}
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-700 text-sm">
                        {v.amount.toLocaleString('ar-SA')} {v.currencySymbol || settings.currency}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedVoucherForPrint(v)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            title="طباعة سند القبض الرسمي"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`هل أنت متأكد من حذف سند القبض ${v.voucherNumber}؟`)) {
                                deletePaymentVoucher(v.id);
                              }
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="حذف سند القبض"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Modal for Creating Receipt Voucher */}
      <ReceiptVoucherModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
