import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { ReceiptVoucherModal } from './pos/ReceiptVoucherModal';
import {resolveReceiptRoute,sumReceiptRoutes} from '../utils/receiptRouting';
import {printReceiptRegister} from '../utils/printReceiptRegister';
import type {PaymentVoucher} from '../types';
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  User,
  Filter,
  Printer,
  Pencil,
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
  const [dateMode,setDateMode] = useState<'all'|'day'|'range'>('all');
  const [selectedDay,setSelectedDay] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportError,setReportError] = useState('');

  // Modal open
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVoucher,setEditingVoucher] = useState<PaymentVoucher|null>(null);

  // Filtered vouchers
  const filteredVouchers = useMemo(() => {
    return receiptVouchers.filter(v => {
      const method=resolveReceiptRoute(v,treasuries);
      if(methodFilter !== 'all' && (methodFilter==='cash'?method!=='cash':
         methodFilter==='cheque'?method!=='cheque':!['bank_transfer','wallet'].includes(method))) return false;
      if (dateMode==='day' && selectedDay && v.date!==selectedDay) return false;
      if (dateMode==='range' && fromDate && v.date < fromDate) return false;
      if (dateMode==='range' && toDate && v.date > toDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = v.voucherNumber.toLowerCase().includes(q);
        const matchParty = v.partyName && v.partyName.toLowerCase().includes(q);
        const matchDesc = v.description && v.description.toLowerCase().includes(q);
        if (!matchNum && !matchParty && !matchDesc) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [receiptVouchers,treasuries, methodFilter, dateMode, selectedDay, fromDate, toDate, searchQuery]);

  // Statistics
  const todayIso = new Date().toISOString().split('T')[0];
  const totalAmount = receiptVouchers.reduce((sum, v) => sum + v.amount, 0);
  const todayAmount = receiptVouchers.filter(v => v.date === todayIso).reduce((sum, v) => sum + v.amount, 0);
  const routedTotals=sumReceiptRoutes(receiptVouchers,treasuries);
  const cashTotal=routedTotals.cash;
  const bankTotal=routedTotals.noncash;

  const reportPeriod=dateMode==='all'?'جميع التواريخ':dateMode==='day'
    ?(selectedDay?'يوم '+selectedDay:'جميع التواريخ'):
    (fromDate&&toDate?'من '+fromDate+' إلى '+toDate:
      fromDate?'من '+fromDate:toDate?'حتى '+toDate:'جميع التواريخ');
  const printRegister=()=>{
    setReportError('');
    if(dateMode==='range'&&fromDate&&toDate&&fromDate>toDate){
      setReportError('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');return;
    }
    try {
      printReceiptRegister(filteredVouchers,{
        settings,treasuries,periodLabel:reportPeriod,query:searchQuery,
        methodLabel:methodFilter==='all'?'كل طرق القبض':
          methodFilter==='cash'?'نقدًا':methodFilter==='cheque'?'شيكات':'بنكي ومحافظ'
      });
    }catch(error){setReportError(error instanceof Error?error.message:'تعذر طباعة الكشف.');}
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'cash':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
            <DollarSign className="w-3 h-3" />
            <span>نقداً (كاش)</span>
          </span>
        );
      case 'wallet':
        return <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded text-[11px] font-medium"><CreditCard className="w-3 h-3"/>محفظة إلكترونية</span>;
      case 'unknown':
        return <span className="text-amber-700 font-bold text-xs">صندوق غير معروف</span>;
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
      {/* Header, search, filters and actions share one desktop row */}
      <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs flex flex-wrap xl:flex-nowrap items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md"><Receipt className="w-4 h-4"/></span>
          <h1 className="text-sm 2xl:text-base font-bold text-slate-800 whitespace-nowrap">سندات القبض (التحصيلات المالية)</h1>
        </div>
      <div className="flex flex-1 min-w-0 items-center gap-1.5 flex-wrap xl:flex-nowrap">
        <div className="relative w-full sm:w-36 xl:w-40 2xl:w-52 shrink-0">
          <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" placeholder="بحث بالسند أو الاسم أو البيان"
            value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
            className="w-full pl-2 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"/>
        </div>
        <select value={methodFilter}
          onChange={e=>setMethodFilter(e.target.value as typeof methodFilter)}
          className="bg-slate-50 border border-slate-200 rounded-md px-2 py-2 text-xs">
          <option value="all">كل طرق القبض</option>
          <option value="cash">نقدًا (كاش)</option>
          <option value="bank_transfer">بنكي / محفظة</option>
          <option value="cheque">شيك</option>
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-600">التاريخ</span>
          <select value={dateMode} onChange={e=>setDateMode(e.target.value as typeof dateMode)}
            className="bg-slate-50 border border-slate-200 rounded-md px-2 py-2 text-xs">
            <option value="all">الكل</option>
            <option value="day">يوم محدد</option>
            <option value="range">فترة</option>
          </select>
        </div>
        {dateMode==='day'&&<DateInput value={selectedDay} onChange={e=>setSelectedDay(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-xs"/>}
        {dateMode==='range'&&<div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">من</span>
          <DateInput value={fromDate} onChange={e=>setFromDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-xs"/>
          <span className="text-slate-500">إلى</span>
          <DateInput value={toDate} onChange={e=>setToDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-xs"/>
        </div>}
        {(searchQuery||methodFilter!=='all'||dateMode!=='all')&&
          <button type="button" className="text-emerald-700 text-xs px-2 py-2"
            onClick={()=>{setSearchQuery('');setMethodFilter('all');setDateMode('all');setSelectedDay('');setFromDate('');setToDate('');setReportError('');}}>إلغاء الفلاتر</button>}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">{filteredVouchers.length} سند</span>
          <button type="button" onClick={printRegister}
            className="flex items-center gap-1 rounded-md bg-blue-700 hover:bg-blue-800 text-white px-2 py-2 text-[11px] font-bold whitespace-nowrap">
            <Printer size={15}/>طباعة كشف السندات
          </button>
        </div>
      </div>
        <button type="button" onClick={() => {setEditingVoucher(null);setIsModalOpen(true)}}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] px-3 py-2 rounded-md flex items-center justify-center gap-1 shrink-0 whitespace-nowrap">
          <Plus className="w-3.5 h-3.5"/>تحرير سند قبض جديد
        </button>
      </div>

      {/* Compact single-line KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs flex items-center gap-2 min-w-0" title={`${receiptVouchers.length} سند قبض معتمد`}>
          <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">إجمالي المقبوضات المسجلة</span>
          <strong className="text-sm font-mono font-bold text-emerald-600 whitespace-nowrap">{totalAmount.toLocaleString('ar-SA')} {settings.currency}</strong>
          <span className="text-[10px] text-slate-400 truncate" title={`${receiptVouchers.length} سند قبض معتمد`}>({receiptVouchers.length} سند)</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">مقبوضات اليوم</span>
          <strong className="text-sm font-mono font-bold text-slate-800 whitespace-nowrap">{todayAmount.toLocaleString('ar-SA')} {settings.currency}</strong>
          <span className="text-[10px] text-slate-400 truncate" title="سداد فواتير ودفعات جارية">سداد فواتير ودفعات جارية</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">المقبوضات النقدية (الكاش)</span>
          <strong className="text-sm font-mono font-bold text-slate-800 whitespace-nowrap">{cashTotal.toLocaleString('ar-SA')} {settings.currency}</strong>
          <span className="text-[10px] text-slate-400 truncate" title="أودعت في صناديق الكاشير">أودعت في صناديق الكاشير</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">المقبوضات البنكية والشيكات</span>
          <strong className="text-sm font-mono font-bold text-blue-600 whitespace-nowrap">{bankTotal.toLocaleString('ar-SA')} {settings.currency}</strong>
          <span className="text-[10px] text-slate-400 truncate" title="حوالات وشيكات تحت التحصيل">حوالات وشيكات تحت التحصيل</span>
        </div>
      </div>

      {reportError&&<div role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-xs">{reportError}</div>}

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
                  const treasury = treasuries.find(t => t.accountCode === (v.treasuryAccountCode||v.accountCode));
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
                        <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                          {v.description || 'سداد دفعة من الحساب'}
                        </div>
                      </td>
                      <td className="p-3">{getMethodBadge(resolveReceiptRoute(v,treasuries))}</td>
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
                          <button onClick={()=>{setEditingVoucher(v);setIsModalOpen(true)}}
                            className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-md cursor-pointer" title="تعديل سند القبض">
                            <Pencil className="w-4 h-4"/>
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
        onClose={() => {setIsModalOpen(false);setEditingVoucher(null)}}
        editingVoucher={editingVoucher}
      />
    </div>
  );
};
