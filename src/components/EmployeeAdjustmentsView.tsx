import React, { useState, useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { EmployeeAdvance, EmployeeDeduction, EmployeeIncentive } from '../types';
import {
  CreditCard,
  MinusCircle,
  PlusCircle,
  Search,
  Filter,
  Calendar,
  DollarSign,
  Wallet,
  CheckCircle2,
  Clock,
  XCircle,
  Printer,
  FileText,
  UserCheck
} from 'lucide-react';

interface EmployeeAdjustmentsViewProps {
  onOpenAddModal: (type: 'advance' | 'deduction' | 'incentive', employeeId?: string) => void;
}

export const EmployeeAdjustmentsView: React.FC<EmployeeAdjustmentsViewProps> = ({ onOpenAddModal }) => {
  const {
    employeeAdvances,
    cancelEmployeeAdvance,
    employeeDeductions,
    cancelEmployeeDeduction,
    employeeIncentives,
    cancelEmployeeIncentive,
    settings
  } = useAccounting();

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'advance' | 'deduction' | 'incentive'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'deducted' | 'paid' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Combine adjustments into a unified list
  const unifiedList = useMemo(() => {
    const list: Array<{
      id: string;
      itemType: 'advance' | 'deduction' | 'incentive';
      employeeId: string;
      employeeName: string;
      date: string;
      amount: number;
      reason: string;
      status: 'pending' | 'deducted' | 'paid' | 'cancelled';
      treasuryName?: string;
      voucherNumber?: string;
      payrollSheetTitle?: string;
      payrollSheetId?: string;
      raw: EmployeeAdvance | EmployeeDeduction | EmployeeIncentive;
    }> = [];

    if (filterType === 'all' || filterType === 'advance') {
      employeeAdvances.forEach(adv => {
        list.push({
          id: adv.id,
          itemType: 'advance',
          employeeId: adv.employeeId,
          employeeName: adv.employeeName,
          date: adv.date,
          amount: adv.amount,
          reason: adv.reason,
          status: adv.status,
          treasuryName: adv.treasuryName,
          voucherNumber: adv.voucherNumber,
          payrollSheetTitle: adv.payrollSheetTitle,
          payrollSheetId: adv.payrollSheetId,
          raw: adv
        });
      });
    }

    if (filterType === 'all' || filterType === 'deduction') {
      employeeDeductions.forEach(ded => {
        list.push({
          id: ded.id,
          itemType: 'deduction',
          employeeId: ded.employeeId,
          employeeName: ded.employeeName,
          date: ded.date,
          amount: ded.amount,
          reason: ded.reason,
          status: ded.status,
          payrollSheetTitle: ded.payrollSheetTitle,
          payrollSheetId: ded.payrollSheetId,
          raw: ded
        });
      });
    }

    if (filterType === 'all' || filterType === 'incentive') {
      employeeIncentives.forEach(inc => {
        list.push({
          id: inc.id,
          itemType: 'incentive',
          employeeId: inc.employeeId,
          employeeName: inc.employeeName,
          date: inc.date,
          amount: inc.amount,
          reason: inc.reason,
          status: inc.status,
          payrollSheetTitle: inc.payrollSheetTitle,
          payrollSheetId: inc.payrollSheetId,
          raw: inc
        });
      });
    }

    // Sort newest date first
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Apply status and search filters
    return list.filter(item => {
      const matchStatus = filterStatus === 'all' || item.status === filterStatus;
      const matchSearch =
        searchQuery.trim() === '' ||
        item.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.voucherNumber && item.voucherNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.payrollSheetTitle && item.payrollSheetTitle.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchStatus && matchSearch;
    });
  }, [employeeAdvances, employeeDeductions, employeeIncentives, filterType, filterStatus, searchQuery]);

  // Totals
  const pendingAdvancesTotal = employeeAdvances.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0);
  const pendingDeductionsTotal = employeeDeductions.filter(d => d.status === 'pending').reduce((s, d) => s + d.amount, 0);
  const pendingIncentivesTotal = employeeIncentives.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);

  const handleCancel = (item: { id: string; itemType: 'advance' | 'deduction' | 'incentive' }) => {
    if (window.confirm('هل أنت متأكد من إلغاء هذه الحركة؟')) {
      if (item.itemType === 'advance') {
        cancelEmployeeAdvance(item.id);
      } else if (item.itemType === 'deduction') {
        cancelEmployeeDeduction(item.id);
      } else {
        cancelEmployeeIncentive(item.id);
      }
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-light font-medium">
            <span>سلف معلقة للاقتطاع</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-black font-mono text-amber-700 mt-1">
            {pendingAdvancesTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">{settings.currency}</span>
          </div>
          <div className="text-[9px] text-slate-400 font-light mt-0.5">
            {employeeAdvances.filter(a => a.status === 'pending').length} سلفة في انتظار كشف الرواتب
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-light font-medium">
            <span>خصومات معلقة للاقتطاع</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <MinusCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-black font-mono text-rose-700 mt-1">
            {pendingDeductionsTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">{settings.currency}</span>
          </div>
          <div className="text-[9px] text-slate-400 font-light mt-0.5">
            {employeeDeductions.filter(d => d.status === 'pending').length} خصم مسجل
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-light font-medium">
            <span>حوافز ومكافآت معلقة</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PlusCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-black font-mono text-emerald-700 mt-1">
            {pendingIncentivesTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">{settings.currency}</span>
          </div>
          <div className="text-[9px] text-slate-400 font-light mt-0.5">
            {employeeIncentives.filter(i => i.status === 'pending').length} حافز ومكافأة
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="text-[10px] text-slate-400 font-light font-medium">إجراءات سريعة للموظفين</div>
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={() => onOpenAddModal('advance')}
              className="flex-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>+ سلفة</span>
            </button>
            <button
              onClick={() => onOpenAddModal('deduction')}
              className="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <MinusCircle className="w-3.5 h-3.5" />
              <span>+ خصم</span>
            </button>
            <button
              onClick={() => onOpenAddModal('incentive')}
              className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ حافز</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        
        {/* Type pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              filterType === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الكل ({unifiedList.length})
          </button>
          <button
            onClick={() => setFilterType('advance')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
              filterType === 'advance' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>السلف</span>
          </button>
          <button
            onClick={() => setFilterType('deduction')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
              filterType === 'deduction' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MinusCircle className="w-3.5 h-3.5" />
            <span>الخصومات</span>
          </button>
          <button
            onClick={() => setFilterType('incentive')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
              filterType === 'incentive' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>الحوافز</span>
          </button>
        </div>

        {/* Status Filter & Search */}
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-700"
          >
            <option value="all">كافة الحالات</option>
            <option value="pending">معلق للاحتساب في الكشف</option>
            <option value="deducted">تم اقتطاعه من الكشف</option>
            <option value="paid">تم صرفه للموظف</option>
            <option value="cancelled">ملغي</option>
          </select>

          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث بالموظف أو السبب..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-8 pl-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

      </div>

      {/* Adjustments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {unifiedList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            لا توجد حركات مسجلة تطابق خيارات التصفية
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                  <th className="p-3">نوع الحركة</th>
                  <th className="p-3">الموظف</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3 text-center">المبلغ</th>
                  <th className="p-3">الخزينة والسند (إن وجد)</th>
                  <th className="p-3">السبب والملاحظات</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unifiedList.map(item => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      
                      {/* Type Badge */}
                      <td className="p-3">
                        {item.itemType === 'advance' && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                            <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                            <span>سلفة نقدية</span>
                          </span>
                        )}
                        {item.itemType === 'deduction' && (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                            <MinusCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>خصم / جزاء</span>
                          </span>
                        )}
                        {item.itemType === 'incentive' && (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>حافز / مكافأة</span>
                          </span>
                        )}
                      </td>

                      {/* Employee Name */}
                      <td className="p-3 font-bold text-slate-900">
                        {item.employeeName}
                      </td>

                      {/* Date */}
                      <td className="p-3 font-mono text-slate-600">
                        {item.date}
                      </td>

                      {/* Amount */}
                      <td className="p-3 text-center font-mono font-bold text-sm">
                        <span className={
                          item.itemType === 'advance'
                            ? 'text-amber-700'
                            : item.itemType === 'deduction'
                            ? 'text-rose-600'
                            : 'text-emerald-700'
                        }>
                          {item.itemType === 'deduction' || item.itemType === 'advance' ? '-' : '+'}
                          {item.amount.toLocaleString()} {settings.currency}
                        </span>
                      </td>

                      {/* Treasury & Voucher */}
                      <td className="p-3 text-slate-600">
                        {item.treasuryName ? (
                          <div>
                            <span className="font-semibold text-slate-800 flex items-center gap-1">
                              <Wallet className="w-3 h-3 text-slate-400" />
                              {item.treasuryName}
                            </span>
                            {item.voucherNumber && (
                              <span className="font-mono text-[10px] text-blue-700 block">
                                سند: {item.voucherNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="p-3 text-slate-700 max-w-xs">
                        <div className="truncate" title={item.reason}>{item.reason}</div>
                        {item.payrollSheetTitle && (
                          <div className="text-[10px] text-blue-600 mt-0.5 font-medium">
                            مسجلة ضمن: {item.payrollSheetTitle}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <Clock className="w-3 h-3 text-amber-500" />
                            <span>معلق للاحتساب</span>
                          </span>
                        )}
                        {item.status === 'deducted' && (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-blue-500" />
                            <span>تم اقتطاعه بالكشف</span>
                          </span>
                        )}
                        {item.status === 'paid' && (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>تم الصرف</span>
                          </span>
                        )}
                        {item.status === 'cancelled' && (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <XCircle className="w-3 h-3 text-slate-400" />
                            <span>ملغي</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        {item.status === 'pending' ? (
                          <button
                            onClick={() => handleCancel(item)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold transition-colors cursor-pointer"
                            title="إلغاء الحركة"
                          >
                            إلغاء
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">مكتمل</span>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
