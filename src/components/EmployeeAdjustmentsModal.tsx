import React, { useState, useEffect } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { Employee, Account } from '../types';
import { posSound } from '../utils/audio';
import {
  X,
  CreditCard,
  DollarSign,
  MinusCircle,
  PlusCircle,
  AlertCircle,
  Building2,
  Calendar,
  FileText,
  CheckCircle2,
  Wallet
} from 'lucide-react';

interface EmployeeAdjustmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'advance' | 'deduction' | 'incentive';
  preselectedEmployeeId?: string;
}

export const EmployeeAdjustmentsModal: React.FC<EmployeeAdjustmentsModalProps> = ({
  isOpen,
  onClose,
  initialType = 'advance',
  preselectedEmployeeId
}) => {
  const {
    employees,
    accounts,
    treasuries,
    addEmployeeAdvance,
    addEmployeeDeduction,
    addEmployeeIncentive
  } = useAccounting();

  const [activeType, setActiveType] = useState<'advance' | 'deduction' | 'incentive'>(initialType);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [treasuryAccountCode, setTreasuryAccountCode] = useState<string>('1101');
  const [disburseImmediately, setDisburseImmediately] = useState<boolean>(true);

  // Available treasuries
  const selectedTreasury = treasuries.find(t => t.accountCode === treasuryAccountCode) || accounts.find(a => a.code === treasuryAccountCode);

  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      setSelectedEmployeeId(preselectedEmployeeId || (employees.length > 0 ? employees[0].id : ''));
      setAmount(0);
      setDate(new Date().toISOString().split('T')[0]);
      setReason('');
      setTreasuryAccountCode('1101');
      setDisburseImmediately(true);
    }
  }, [isOpen, initialType, preselectedEmployeeId, employees]);

  if (!isOpen) return null;

  const currentEmployee = employees.find(e => e.id === selectedEmployeeId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEmployeeId) {
      alert('يرجى اختيار الموظف');
      return;
    }

    if (amount <= 0) {
      alert('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    if (!reason.trim()) {
      alert('يرجى تحديد السبب أو الملاحظات');
      return;
    }

    if (activeType === 'advance') {
      if (disburseImmediately && selectedTreasury && selectedTreasury.balance < amount) {
        if (!window.confirm(`تنبيه: رصيد ${selectedTreasury.name} الحالي (${selectedTreasury.balance.toLocaleString()} ر.س) أقل من مبلغ السلفة (${amount.toLocaleString()} ر.س). هل ترغب في المتابعة على أية حال؟`)) {
          return;
        }
      }

      addEmployeeAdvance(
        selectedEmployeeId,
        amount,
        date,
        treasuryAccountCode,
        reason.trim(),
        disburseImmediately
      );
      posSound.playCashBeep();
    } else if (activeType === 'deduction') {
      addEmployeeDeduction(
        selectedEmployeeId,
        amount,
        date,
        reason.trim()
      );
      posSound.playSuccessBeep();
    } else {
      addEmployeeIncentive(
        selectedEmployeeId,
        amount,
        date,
        reason.trim()
      );
      posSound.playSuccessBeep();
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden my-auto" dir="rtl">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              activeType === 'advance' ? 'bg-amber-500' : activeType === 'deduction' ? 'bg-rose-500' : 'bg-emerald-500'
            }`}>
              {activeType === 'advance' && <CreditCard className="w-5 h-5 text-white" />}
              {activeType === 'deduction' && <MinusCircle className="w-5 h-5 text-white" />}
              {activeType === 'incentive' && <PlusCircle className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h2 className="font-bold text-base">تسجيل حركة موظف</h2>
              <p className="text-xs text-slate-300">سلفة نقدية أو خصم جزائي أو حافز ومكافأة</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Type Selector Tabs */}
        <div className="grid grid-cols-3 p-2 bg-slate-100 border-b border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveType('advance')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeType === 'advance'
                ? 'bg-white text-amber-700 shadow-xs border border-amber-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-amber-600" />
            <span>سلفة موظف</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveType('deduction')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeType === 'deduction'
                ? 'bg-white text-rose-700 shadow-xs border border-rose-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MinusCircle className="w-4 h-4 text-rose-600" />
            <span>خصم / جزاء</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveType('incentive')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeType === 'incentive'
                ? 'bg-white text-emerald-700 shadow-xs border border-emerald-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span>حافز / مكافأة</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          {/* Employee Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الموظف المستفيد <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
              required
            >
              <option value="">-- اختر الموظف --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.jobTitle}) - راتب: {emp.salaryAmount.toLocaleString()} ر.س ({emp.salaryType === 'monthly' ? 'شهري' : emp.salaryType === 'weekly' ? 'أسبوعي' : 'يومي'})
                </option>
              ))}
            </select>

            {currentEmployee && (
              <div className="mt-1.5 px-3 py-1.5 bg-blue-50/70 rounded-lg border border-blue-100 flex items-center justify-between text-[11px] text-blue-800">
                <span>نظام الراتب: {currentEmployee.salaryType === 'monthly' ? 'شهري' : currentEmployee.salaryType === 'weekly' ? 'أسبوعي' : 'يومي'}</span>
                <span>الراتب الأساسي: <strong>{currentEmployee.salaryAmount.toLocaleString()} ر.س</strong></span>
                <span>البدلات: <strong>{currentEmployee.allowances || 0} ر.س</strong></span>
              </div>
            )}
          </div>

          {/* Amount & Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                المبلغ (ر.س) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amount || ''}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-3.5 pl-12 py-2.5 text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">ر.س</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                التاريخ <span className="text-rose-500">*</span>
              </label>
              <DateInput value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
            </div>
          </div>

          {/* Treasury Selection (Only for Advance) */}
          {activeType === 'advance' && (
            <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-amber-600" />
                    الخزنة المطلوبة للصرف <span className="text-rose-500">*</span>
                  </span>
                  {selectedTreasury && (
                    <span className="text-[11px] text-slate-600 font-mono">
                      الرصيد المتاح: <strong className="text-slate-900">{selectedTreasury.balance.toLocaleString()} ر.س</strong>
                    </span>
                  )}
                </label>
                <select
                  value={treasuryAccountCode}
                  onChange={e => setTreasuryAccountCode(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-medium"
                >
                  {treasuries.map(t => (
                    <option key={t.id} value={t.accountCode}>
                      {t.name} (المتاح: {t.balance.toLocaleString()} ر.س) - كود {t.accountCode}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60">
                <input
                  type="checkbox"
                  id="disburseImmediately"
                  checked={disburseImmediately}
                  onChange={e => setDisburseImmediately(e.target.checked)}
                  className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="disburseImmediately" className="text-xs text-slate-700 font-medium cursor-pointer">
                  صرف السلفة فوراً من الخزينة الآن (إنشاء سند صرف وقيد محاسبي يخصم من الخزينة)
                </label>
              </div>
            </div>
          )}

          {/* Reason / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              السبب والملاحظات <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={
                activeType === 'advance'
                  ? 'مثال: سلفة لحالة طارئة تخصم من راتب نهاية الشهر'
                  : activeType === 'deduction'
                  ? 'مثال: خصم غياب يومين أو تأخير متكرر أو تلف مطبوعات'
                  : 'مثال: مكافأة إنجاز مطبوعات المعرض في وقت قياسي أو ساعات إضافية'
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Impact preview */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>الأثر في كشف الرواتب:</span>
            </div>
            <span className="font-bold text-slate-900">
              {activeType === 'advance' && `سيتم اقتطاع مبلغ (${amount.toLocaleString()} ر.س) من صافي الراتب القادم للموظف`}
              {activeType === 'deduction' && `سيتم خصم مبلغ (${amount.toLocaleString()} ر.س) من إجمالي استحقاقات الموظف`}
              {activeType === 'incentive' && `سيتم إضافة مبلغ (${amount.toLocaleString()} ر.س) إلى مستحقات الموظف في الكشف`}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className={`px-5 py-2 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ${
                activeType === 'advance'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : activeType === 'deduction'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {activeType === 'advance' ? 'تسجيل وصرف السلفة' : activeType === 'deduction' ? 'تسجيل الخصم' : 'تسجيل الحافز'}
              </span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
