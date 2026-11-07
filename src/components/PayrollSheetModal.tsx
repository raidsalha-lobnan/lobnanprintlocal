import React, { useState, useEffect, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import {
  Employee,
  PayrollSheet,
  PayrollSheetItem,
  SalaryType
} from '../types';
import { posSound } from '../utils/audio';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Wallet,
  Users,
  DollarSign,
  AlertTriangle,
  Layers,
  Save,
  Send,
  PlusCircle,
  MinusCircle,
  HelpCircle
} from 'lucide-react';

interface PayrollSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSheet?: PayrollSheet | null;
}

export const PayrollSheetModal: React.FC<PayrollSheetModalProps> = ({
  isOpen,
  onClose,
  editingSheet
}) => {
  const {
    employees,
    accounts,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    createDraftPayrollSheet,
    updateDraftPayrollSheet,
    approveAndDisbursePayrollSheet
  } = useAccounting();

  // Wizard Configuration State
  const [title, setTitle] = useState('');
  const [calculationSystem, setCalculationSystem] = useState<'all' | SalaryType>('all');
  const [period, setPeriod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [treasuryAccountCode, setTreasuryAccountCode] = useState('1101');
  const [notes, setNotes] = useState('');

  // Default parameters for calculations
  const [defaultWorkDaysDaily, setDefaultWorkDaysDaily] = useState<number>(26);
  const [defaultWeeksCount, setDefaultWeeksCount] = useState<number>(4);

  // Line items state
  const [items, setItems] = useState<PayrollSheetItem[]>([]);

  // Selected treasury details
  const selectedTreasury = accounts.find(a => a.code === treasuryAccountCode);

  // Initialize or re-populate when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const today = new Date();
    const monthNames = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const currentMonthName = monthNames[today.getMonth()];
    const currentYear = today.getFullYear();

    if (editingSheet) {
      setTitle(editingSheet.title);
      setCalculationSystem(editingSheet.calculationSystem);
      setPeriod(editingSheet.period);
      setStartDate(editingSheet.startDate);
      setEndDate(editingSheet.endDate);
      setTreasuryAccountCode(editingSheet.treasuryAccountCode || '1101');
      setNotes(editingSheet.notes || '');
      setItems(editingSheet.items);
    } else {
      // New Draft default values
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

      setTitle(`كشف رواتب شهر ${currentMonthName} ${currentYear}`);
      setCalculationSystem('all');
      setPeriod(`شهر ${currentMonthName} ${currentYear}`);
      setStartDate(firstDay);
      setEndDate(lastDay);
      setTreasuryAccountCode('1101');
      setNotes(`مسودة كشف رواتب العاملين والموظفين لشهر ${currentMonthName}`);

      generateInitialItems('all', 26, 4);
    }
  }, [isOpen, editingSheet, employees]);

  // Function to build line items from current active employees and their pending advances/deductions/incentives
  const generateInitialItems = (
    systemFilter: 'all' | SalaryType,
    workDaysDaily: number,
    weeksCount: number
  ) => {
    const activeEmployees = employees.filter(e => e.status === 'active');
    const filteredEmployees = systemFilter === 'all'
      ? activeEmployees
      : activeEmployees.filter(e => e.salaryType === systemFilter);

    const generatedItems: PayrollSheetItem[] = filteredEmployees.map(emp => {
      // Calculate basic salary for the period
      let basic = emp.salaryAmount || 0;
      let actualDays: number | undefined = undefined;

      if (emp.salaryType === 'daily') {
        actualDays = workDaysDaily;
        basic = (emp.salaryAmount || 0) * workDaysDaily;
      } else if (emp.salaryType === 'weekly') {
        basic = (emp.salaryAmount || 0) * weeksCount;
      }

      const allowances = emp.allowances || 0;

      // Pending advances for this employee
      const empPendingAdvances = employeeAdvances
        .filter(a => a.employeeId === emp.id && a.status === 'pending')
        .reduce((sum, a) => sum + a.amount, 0);

      // Pending deductions
      const empPendingDeductions = employeeDeductions
        .filter(d => d.employeeId === emp.id && d.status === 'pending')
        .reduce((sum, d) => sum + d.amount, 0);

      // Pending incentives
      const empPendingIncentives = employeeIncentives
        .filter(i => i.employeeId === emp.id && i.status === 'pending')
        .reduce((sum, i) => sum + i.amount, 0);

      const netSalary = Math.max(0, basic + allowances + empPendingIncentives - empPendingDeductions - empPendingAdvances);

      return {
        id: 'psi-' + emp.id,
        employeeId: emp.id,
        employeeName: emp.name,
        jobTitle: emp.jobTitle,
        salaryType: emp.salaryType,
        workDays: actualDays,
        basicSalary: basic,
        allowances,
        incentives: empPendingIncentives,
        deductions: empPendingDeductions,
        advancesDeducted: empPendingAdvances,
        netSalary,
        isIncluded: true
      };
    });

    setItems(generatedItems);
  };

  // When calculation system or default days change in new draft mode
  const handleSystemFilterChange = (newSystem: 'all' | SalaryType) => {
    setCalculationSystem(newSystem);
    if (!editingSheet) {
      generateInitialItems(newSystem, defaultWorkDaysDaily, defaultWeeksCount);
      
      const today = new Date();
      if (newSystem === 'weekly') {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        const startStr = start.toISOString().split('T')[0];
        const endStr = today.toISOString().split('T')[0];
        setStartDate(startStr);
        setEndDate(endStr);
        setPeriod(`أسبوعي`);
        setTitle(`كشف رواتب أسبوعي: ${startStr} إلى ${endStr}`);
      } else if (newSystem === 'daily') {
        const str = today.toISOString().split('T')[0];
        setStartDate(str);
        setEndDate(str);
        setPeriod(`يومي`);
        setTitle(`كشف رواتب يومي: ${str}`);
      } else {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
        const currentMonthName = today.toLocaleDateString('ar-EG', { month: 'long' });
        setStartDate(firstDay);
        setEndDate(lastDay);
        setPeriod(`شهر ${currentMonthName} ${today.getFullYear()}`);
        setTitle(`كشف رواتب شهر ${currentMonthName} ${today.getFullYear()}`);
      }
    }
  };

  const handleDefaultDaysChange = (newDays: number) => {
    setDefaultWorkDaysDaily(newDays);
    setItems(prev =>
      prev.map(item => {
        if (item.salaryType === 'daily') {
          const emp = employees.find(e => e.id === item.employeeId);
          const dailyRate = emp ? emp.salaryAmount : 0;
          const newBasic = dailyRate * newDays;
          const newNet = Math.max(0, newBasic + item.allowances + item.incentives - item.deductions - item.advancesDeducted);
          return {
            ...item,
            workDays: newDays,
            basicSalary: newBasic,
            netSalary: newNet
          };
        }
        return item;
      })
    );
  };

  // Toggle employee inclusion
  const handleToggleInclude = (itemId: string) => {
    setItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, isIncluded: !item.isIncluded } : item
      )
    );
  };

  // Update item numerical field
  const handleUpdateItemField = (
    itemId: string,
    field: 'basicSalary' | 'allowances' | 'incentives' | 'deductions' | 'advancesDeducted' | 'workDays',
    val: number
  ) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const updated = { ...item, [field]: Math.max(0, val) };

          // If daily workDays changed, recalculate basic
          if (field === 'workDays' && item.salaryType === 'daily') {
            const emp = employees.find(e => e.id === item.employeeId);
            const dailyRate = emp ? emp.salaryAmount : 0;
            updated.basicSalary = dailyRate * Math.max(0, val);
          }

          updated.netSalary = Math.max(
            0,
            updated.basicSalary + updated.allowances + updated.incentives - updated.deductions - updated.advancesDeducted
          );
          return updated;
        }
        return item;
      })
    );
  };

  // Calculate live summary totals for included items
  const summary = useMemo(() => {
    const included = items.filter(i => i.isIncluded);
    const totalBasic = included.reduce((s, i) => s + i.basicSalary, 0);
    const totalAllowances = included.reduce((s, i) => s + i.allowances, 0);
    const totalIncentives = included.reduce((s, i) => s + i.incentives, 0);
    const totalDeductions = included.reduce((s, i) => s + i.deductions, 0);
    const totalAdvances = included.reduce((s, i) => s + i.advancesDeducted, 0);
    const totalNet = included.reduce((s, i) => s + i.netSalary, 0);

    return {
      employeesCount: included.length,
      totalBasic,
      totalAllowances,
      totalIncentives,
      totalDeductions,
      totalAdvances,
      totalNet
    };
  }, [items]);

  if (!isOpen) return null;

  // Save as draft
  const handleSaveDraft = () => {
    if (!title.trim()) {
      alert('يرجى كتابة عنوان الكشف');
      return;
    }

    if (summary.employeesCount === 0) {
      alert('يرجى تضمين موظف واحد على الأقل في الكشف');
      return;
    }

    const treasuryName = selectedTreasury ? selectedTreasury.name : 'الصندوق النقدي (الكاشير)';

    const sheetPayload = {
      title: title.trim(),
      period: period.trim() || 'فترة حالية',
      startDate,
      endDate,
      salaryType: calculationSystem === 'all' ? 'monthly' : calculationSystem,
      treasuryAccountCode,
      treasuryName,
      items,
      totalBasic: summary.totalBasic,
      totalAllowances: summary.totalAllowances,
      totalIncentives: summary.totalIncentives,
      totalDeductions: summary.totalDeductions,
      totalAdvances: summary.totalAdvances,
      totalNet: summary.totalNet,
      employeesCount: summary.employeesCount,
      notes: notes.trim() || undefined
    };

    if (editingSheet) {
      updateDraftPayrollSheet(editingSheet.id, sheetPayload);
    } else {
      createDraftPayrollSheet(sheetPayload);
    }

    posSound.playSuccessBeep();
    onClose();
  };

  // Approve & Disburse immediately
  const handleApproveAndDisburse = () => {
    if (!title.trim()) {
      alert('يرجى كتابة عنوان الكشف');
      return;
    }

    if (summary.employeesCount === 0) {
      alert('يرجى تضمين موظف واحد على الأقل في الكشف');
      return;
    }

    if (selectedTreasury && selectedTreasury.balance < summary.totalNet) {
      alert(
        `تنبيه مالي: رصيد ${selectedTreasury.name} الحالي (${selectedTreasury.balance.toLocaleString()} ر.س) غير كافٍ لصرف إجمالي الرواتب (${summary.totalNet.toLocaleString()} ر.س). يرجى تغذية الخزينة أو اختيار الخزينة الأخرى.`
      );
      return;
    }

    if (
      !window.confirm(
        `هل أنت متأكد من اعتماد وصرف كشف الرواتب "${title}"؟\n\nسيتم خصم إجمالي الصافي (${summary.totalNet.toLocaleString()} ر.س) فوراً من ${selectedTreasury?.name}، وتسجيل سند صرف وقيد محاسبي، وتحديث سجلات الموظفين وسداد السلف.`
      )
    ) {
      return;
    }

    const treasuryName = selectedTreasury ? selectedTreasury.name : 'الصندوق النقدي (الكاشير)';

    const sheetPayload = {
      title: title.trim(),
      period: period.trim() || 'فترة حالية',
      startDate,
      endDate,
      salaryType: calculationSystem === 'all' ? 'monthly' : calculationSystem,
      treasuryAccountCode,
      treasuryName,
      items,
      totalBasic: summary.totalBasic,
      totalAllowances: summary.totalAllowances,
      totalIncentives: summary.totalIncentives,
      totalDeductions: summary.totalDeductions,
      totalAdvances: summary.totalAdvances,
      totalNet: summary.totalNet,
      employeesCount: summary.employeesCount,
      notes: notes.trim() || undefined
    };

    let targetSheetId = editingSheet ? editingSheet.id : '';
    if (editingSheet) {
      updateDraftPayrollSheet(editingSheet.id, sheetPayload);
    } else {
      const created = createDraftPayrollSheet(sheetPayload);
      targetSheetId = created.id;
    }

    const result = approveAndDisbursePayrollSheet(targetSheetId, treasuryAccountCode);
    if (result.success) {
      posSound.playCashBeep();
      onClose();
    } else {
      alert(result.message || 'حدث خطأ أثناء الصرف');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]" dir="rtl">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">
                {editingSheet ? `تعديل مسودة كشف الرواتب (${editingSheet.sheetNumber})` : 'إنشاء مسودة كشف رواتب ومسير أجور'}
              </h2>
              <p className="text-xs text-slate-300">
                تحديد نظام الاحتساب، تسوية السلف والخصومات والحوافز، واختيار خزينة الصرف
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          
          {/* Top Controls Grid */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            
            {/* Title */}
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                عنوان الكشف / المسمى <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="مثال: كشف رواتب شهر مارس 2026"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Calculation System */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                نظام الاحتساب <span className="text-rose-500">*</span>
              </label>
              <select
                value={calculationSystem}
                onChange={e => handleSystemFilterChange(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">كافة الأنظمة (شهري، أسبوعي، يومي)</option>
                <option value="monthly">الرواتب الشهرية فقط</option>
                <option value="weekly">الرواتب الأسبوعية فقط</option>
                <option value="daily">أجور اليومية فقط</option>
              </select>
            </div>

            {/* Period */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                وصف الفترة <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                placeholder="مثال: مارس 2026 أو الأسبوع 10"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Dates */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">من تاريخ</label>
              <DateInput value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">إلى تاريخ</label>
              <DateInput value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800"
              />
            </div>

            {/* Treasury Selection (Critical user requirement) */}
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-blue-900">
                  <Wallet className="w-3.5 h-3.5 text-blue-600" />
                  خزينة الصرف المحددة (يُخصم منها المبلغ عند الاعتماد) <span className="text-rose-500">*</span>
                </span>
                {selectedTreasury && (
                  <span className="text-[11px] font-mono">
                    الرصيد المتاح: <strong className={selectedTreasury.balance >= summary.totalNet ? 'text-emerald-700' : 'text-rose-600'}>
                      {selectedTreasury.balance.toLocaleString()} ر.س
                    </strong>
                  </span>
                )}
              </label>
              <select
                value={treasuryAccountCode}
                onChange={e => setTreasuryAccountCode(e.target.value)}
                className="w-full bg-white border-2 border-blue-400 rounded-lg px-3 py-2 text-xs font-bold text-blue-950 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="1101">الصندوق النقدي (الكاشير الرئيسي) - كود 1101</option>
                <option value="1102">الحساب البنكي (شيكات وحوالات) - كود 1102</option>
              </select>
            </div>

          </div>

          {/* Daily / Weekly Helper Options (Only shown if relevant) */}
          {(calculationSystem === 'all' || calculationSystem === 'daily') && (
            <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-700" />
                <span className="font-bold text-amber-900">أيام العمل الافتراضية لأصحاب اليومية في هذا الكشف:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={defaultWorkDaysDaily}
                  onChange={e => handleDefaultDaysChange(parseInt(e.target.value) || 0)}
                  className="w-20 bg-white border border-amber-300 rounded-lg px-2 py-1 text-center font-mono font-bold text-slate-900"
                />
                <span className="text-slate-600">يوم عمل (تُحسب تلقائياً: اليومية × الأيام)</span>
              </div>
            </div>
          )}

          {/* Employees Calculation Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-600" />
                <span>جدول احتساب رواتب الموظفين ({items.filter(i => i.isIncluded).length} من {items.length} موظف مشمول)</span>
              </h3>
              <span className="text-[10px] text-slate-400 font-light">
                يتم استدعاء السلف والخصومات والحوافز المعلقة تلقائياً وتطبيقها في المعادلة
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold text-[11px]">
                      <th className="p-2.5 text-center w-10">تضمين</th>
                      <th className="p-2.5">الموظف والوظيفة</th>
                      <th className="p-2.5 text-center">النظام</th>
                      <th className="p-2.5 text-center min-w-[90px]">الأساسي</th>
                      <th className="p-2.5 text-center min-w-[75px]">البدلات</th>
                      <th className="p-2.5 text-center min-w-[85px] text-emerald-800">+ الحوافز</th>
                      <th className="p-2.5 text-center min-w-[85px] text-rose-800">- الخصومات</th>
                      <th className="p-2.5 text-center min-w-[95px] text-amber-900">- السلف المستقطعة</th>
                      <th className="p-2.5 text-center min-w-[110px] font-black bg-blue-50 text-blue-900">صافي المستحق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => {
                      const salaryLabel = item.salaryType === 'monthly' ? 'شهري' : item.salaryType === 'weekly' ? 'أسبوعي' : 'يومي';
                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            !item.isIncluded
                              ? 'bg-slate-50/50 opacity-40'
                              : 'hover:bg-blue-50/20 bg-white'
                          }`}
                        >
                          {/* Include checkbox */}
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={item.isIncluded}
                              onChange={() => handleToggleInclude(item.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                            />
                          </td>

                          {/* Name & Job */}
                          <td className="p-2.5">
                            <div className="font-bold text-slate-900">{item.employeeName}</div>
                            <div className="text-[9px] text-slate-400 font-light">{item.jobTitle}</div>
                          </td>

                          {/* Salary Type & workdays */}
                          <td className="p-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {salaryLabel}
                            </span>
                            {item.salaryType === 'daily' && (
                              <div className="mt-1 flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.workDays || defaultWorkDaysDaily}
                                  onChange={e => handleUpdateItemField(item.id, 'workDays', parseInt(e.target.value) || 0)}
                                  className="w-12 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-center font-mono text-[10px]"
                                  title="أيام العمل الفعلية"
                                />
                                <span className="text-[9px] text-slate-400">يوم</span>
                              </div>
                            )}
                          </td>

                          {/* Basic Salary */}
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.basicSalary}
                              onChange={e => handleUpdateItemField(item.id, 'basicSalary', parseFloat(e.target.value) || 0)}
                              className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold text-slate-800 focus:bg-white"
                            />
                          </td>

                          {/* Allowances */}
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.allowances}
                              onChange={e => handleUpdateItemField(item.id, 'allowances', parseFloat(e.target.value) || 0)}
                              className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center font-mono text-slate-800 focus:bg-white"
                            />
                          </td>

                          {/* Incentives */}
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.incentives}
                              onChange={e => handleUpdateItemField(item.id, 'incentives', parseFloat(e.target.value) || 0)}
                              className="w-18 bg-emerald-50/60 border border-emerald-200 rounded-lg px-2 py-1 text-center font-mono font-bold text-emerald-800 focus:bg-white"
                            />
                          </td>

                          {/* Deductions */}
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.deductions}
                              onChange={e => handleUpdateItemField(item.id, 'deductions', parseFloat(e.target.value) || 0)}
                              className="w-18 bg-rose-50/60 border border-rose-200 rounded-lg px-2 py-1 text-center font-mono font-bold text-rose-800 focus:bg-white"
                            />
                          </td>

                          {/* Advances Deducted */}
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.advancesDeducted}
                              onChange={e => handleUpdateItemField(item.id, 'advancesDeducted', parseFloat(e.target.value) || 0)}
                              className="w-20 bg-amber-50/60 border border-amber-200 rounded-lg px-2 py-1 text-center font-mono font-bold text-amber-900 focus:bg-white"
                            />
                          </td>

                          {/* Net Salary */}
                          <td className="p-2.5 text-center bg-blue-50/40">
                            <span className="font-mono font-black text-slate-900 text-sm">
                              {item.netSalary.toLocaleString()} ر.س
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Totals Summary Banner */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block">إجمالي الأساسي</span>
              <span className="text-sm font-bold font-mono text-white mt-1 block">
                {summary.totalBasic.toLocaleString()} ر.س
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block">إجمالي البدلات</span>
              <span className="text-sm font-bold font-mono text-white mt-1 block">
                {summary.totalAllowances.toLocaleString()} ر.س
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-[10px] text-emerald-400 block">+ إجمالي الحوافز</span>
              <span className="text-sm font-bold font-mono text-emerald-300 mt-1 block">
                +{summary.totalIncentives.toLocaleString()} ر.س
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-[10px] text-rose-400 block">- إجمالي الخصومات</span>
              <span className="text-sm font-bold font-mono text-rose-300 mt-1 block">
                -{summary.totalDeductions.toLocaleString()} ر.س
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-[10px] text-amber-400 block">- سلف مستقطعة</span>
              <span className="text-sm font-bold font-mono text-amber-300 mt-1 block">
                -{summary.totalAdvances.toLocaleString()} ر.س
              </span>
            </div>

            <div className="bg-blue-600 p-2.5 rounded-lg border border-blue-500">
              <span className="text-[10px] text-blue-100 block font-bold">صافي الكشف للصرف</span>
              <span className="text-base font-black font-mono text-white mt-0.5 block">
                {summary.totalNet.toLocaleString()} ر.س
              </span>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              الخزينة المحددة: <strong>{selectedTreasury?.name}</strong> (الرصيد: {selectedTreasury?.balance.toLocaleString()} ر.س)
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-200"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>حفظ كمسودة</span>
            </button>

            <button
              type="button"
              onClick={handleApproveAndDisburse}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>اعتماد وصرف الكشف من الخزينة</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
