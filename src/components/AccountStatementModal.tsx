import React, { useState, useMemo, useEffect } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import {
  generateAccountStatement,
  generateEmployeeStatement,
  exportStatementToCSV,
  exportEmployeeStatementToCSV,
  StatementRow,
  EmployeeStatementRow
} from '../utils/statementGenerator';
import { formatNumber } from '../utils/numberFormat';
import { tafqeet } from '../utils/tafqeet';
import {
  X,
  Printer,
  Download,
  Calendar,
  Filter,
  Users,
  Building,
  UserCheck,
  Phone,
  CreditCard,
  Receipt,
  FileText,
  BadgeDollarSign,
  Briefcase,
  ChevronDown,
  Info,
  Image as ImageIcon,
  Eye
} from 'lucide-react';
import { OfficialStamp } from './common/OfficialStamp';
import { Party, Employee } from '../types';
import { PrintHeader } from './common/PrintHeader';
import { formatDateDisplay } from '../utils/dateUtils';
import { AutocompleteCombobox, ComboboxOption } from './common/AutocompleteCombobox';
import { Search } from 'lucide-react';

const parseThumbnails = (val?: string): string[] => {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [val];
};

export const AccountStatementModal: React.FC = () => {
  const {
    selectedPartyForStatement,
    setSelectedPartyForStatement,
    selectedEmployeeForStatement,
    setSelectedEmployeeForStatement,
    parties,
    employees,
    invoices,
    purchases,
    purchaseReturns,
    vouchers,
    printOrders,
    journalEntries,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    payrollSheets,
    debtClearings,
    settings
  } = useAccounting();

  // Mode: 'party' or 'employee'
  const [statementMode, setStatementMode] = useState<'party' | 'employee'>('party');
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  // Synchronize initial selection when modal opens
  useEffect(() => {
    if (selectedEmployeeForStatement) {
      setStatementMode('employee');
      setSelectedEmpId(selectedEmployeeForStatement.id);
    } else if (selectedPartyForStatement) {
      setStatementMode('party');
      setSelectedPartyId(selectedPartyForStatement.id);
    }
  }, [selectedPartyForStatement, selectedEmployeeForStatement]);

  // Date filters
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'debit' | 'credit'>('all');
  const [showItemDetails, setShowItemDetails] = useState<boolean>(true);
  const [showImageThumbnailsInStatement, setShowImageThumbnailsInStatement] = useState<boolean>(true);
  const [previewModalImage, setPreviewModalImage] = useState<{ url: string; name: string } | null>(null);

  // Active party or employee
  const currentParty = useMemo(() => {
    if (selectedPartyId) {
      return parties.find(p => p.id === selectedPartyId) || null;
    }
    return selectedPartyForStatement;
  }, [selectedPartyId, selectedPartyForStatement, parties]);

  const parentParty = useMemo(() => {
    if (currentParty && currentParty.parentCustomerId) {
      return parties.find(p => p.id === currentParty.parentCustomerId) || null;
    }
    return null;
  }, [currentParty, parties]);

  const clientDisplayName = useMemo(() => {
    if (!currentParty) return '';
    if (currentParty.isSubCustomer && parentParty) {
      return `${parentParty.name} / ${currentParty.name}`;
    }
    if (currentParty.parentCustomerName) {
      return `${currentParty.parentCustomerName} / ${currentParty.name}`;
    }
    return currentParty.name;
  }, [currentParty, parentParty]);

  const currentEmployee = useMemo(() => {
    if (selectedEmpId) {
      return employees.find(e => e.id === selectedEmpId) || null;
    }
    return selectedEmployeeForStatement;
  }, [selectedEmpId, selectedEmployeeForStatement, employees]);

  // خيارات القائمة المنسدلة للبحث والمطابقة للعملاء والموردين
  const partyOptions: ComboboxOption[] = useMemo(() => {
    return parties.map(p => {
      const isCust = p.type === 'customer' || p.type === 'both';
      const isSupp = p.type === 'supplier';
      let badge = isCust ? 'عميل' : isSupp ? 'مورد' : 'طرف';
      if (p.isSubCustomer) badge = 'زبون فرعي';

      let subText = p.phone || '';
      if (p.parentCustomerName) {
        subText = `تابع لـ: ${p.parentCustomerName}${p.phone ? ' | ' + p.phone : ''}`;
      } else if (p.currentBalance !== undefined) {
        subText = `الرصيد: ${p.currentBalance.toFixed(2)} ${settings.currency || '₪'}${p.phone ? ' | ' + p.phone : ''}`;
      }

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        subText,
        badge,
        extraSearchCorpus: `${p.name} ${p.code || ''} ${p.phone || ''} ${p.parentCustomerName || ''} ${p.city || ''}`,
        raw: p
      };
    });
  }, [parties, settings.currency]);

  // خيارات القائمة المنسدلة للبحث والمطابقة للموظفين
  const employeeOptions: ComboboxOption[] = useMemo(() => {
    return employees.map(e => ({
      id: e.id,
      name: e.name,
      code: e.code,
      subText: `${e.jobTitle || e.position || 'موظف'}${e.phone ? ' | ' + e.phone : ''}`,
      badge: 'موظف',
      extraSearchCorpus: `${e.name} ${e.code || ''} ${e.phone || ''} ${e.jobTitle || ''}`,
      raw: e
    }));
  }, [employees]);

  // Generate Party Statement
  const partyStatement = useMemo(() => {
    if (statementMode !== 'party' || !currentParty) return null;
    return generateAccountStatement({
      party: currentParty,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      invoices,
      purchases,
      purchaseReturns,
      vouchers,
      printOrders,
      journalEntries,
      debtClearings
    });
  }, [statementMode, currentParty, fromDate, toDate, invoices, purchases, purchaseReturns, vouchers, printOrders, journalEntries, debtClearings]);

  // Generate Employee Statement
  const employeeStatement = useMemo(() => {
    if (statementMode !== 'employee' || !currentEmployee) return null;
    return generateEmployeeStatement({
      employee: currentEmployee,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      vouchers,
      advances: employeeAdvances,
      deductions: employeeDeductions,
      incentives: employeeIncentives,
      invoices,
      purchases,
      purchaseReturns,
      payrollSheets,
      journalEntries,
      debtClearings
    });
  }, [statementMode, currentEmployee, fromDate, toDate, vouchers, employeeAdvances, employeeDeductions, employeeIncentives, invoices, purchases, purchaseReturns, payrollSheets, journalEntries, debtClearings]);

  const isOpen = Boolean(selectedPartyForStatement || selectedEmployeeForStatement);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedPartyForStatement(null);
    setSelectedEmployeeForStatement(null);
    setSelectedPartyId('');
    setSelectedEmpId('');
  };

  const handlePrint = () => {
    document.body.classList.add('printing-mode');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-mode');
    }, 1000);
  };

  const handleExportCSV = () => {
    if (statementMode === 'party' && partyStatement) {
      exportStatementToCSV(partyStatement, settings.currency || '₪');
    } else if (statementMode === 'employee' && employeeStatement) {
      exportEmployeeStatementToCSV(employeeStatement, settings.currency || '₪');
    }
  };

  const setDatePreset = (preset: 'all' | 'today' | 'this_month' | 'last_month' | 'this_year') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const todayStr = now.toISOString().split('T')[0];

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'this_month') {
      const firstDay = new Date(y, m, 1).toISOString().split('T')[0];
      const lastDay = new Date(y, m + 1, 0).toISOString().split('T')[0];
      setFromDate(firstDay);
      setToDate(lastDay);
    } else if (preset === 'last_month') {
      const firstDay = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
      setFromDate(firstDay);
      setToDate(lastDay);
    } else if (preset === 'this_year') {
      const firstDay = `${y}-01-01`;
      const lastDay = `${y}-12-31`;
      setFromDate(firstDay);
      setToDate(lastDay);
    }
  };

  // Filtered rows for party
  const displayedPartyRows = partyStatement ? partyStatement.rows.filter(r => {
    if (filterType === 'debit') return r.debit > 0;
    if (filterType === 'credit') return r.credit > 0;
    return true;
  }) : [];

  // Filtered rows for employee
  const displayedEmployeeRows = employeeStatement ? employeeStatement.rows.filter(r => {
    if (filterType === 'debit') return (r.advance > 0 || r.deduction > 0 || r.disbursement > 0);
    if (filterType === 'credit') return r.entitlement > 0;
    return true;
  }) : [];

  const isCustomer = currentParty ? (currentParty.type === 'customer' || currentParty.type === 'both') : false;
  const isSupplier = currentParty ? (currentParty.type === 'supplier' || currentParty.type === 'both') : false;

  const partyTafqeet = partyStatement ? tafqeet(partyStatement.closingBalance, 'شيكل', 'أغورة') : '';
  const empTafqeet = employeeStatement ? tafqeet(employeeStatement.closingBalance, 'شيكل', 'أغورة') : '';

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible print-area">
      <div className="bg-white rounded-xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[94vh] print:max-h-none print:max-w-none print:border-none print:shadow-none print:w-full print:rounded-none">
        
        {/* Top Control Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  {statementMode === 'employee'
                    ? `كشف مالي تفصيلي للموظف: ${currentEmployee?.name || 'اختر موظف'}`
                    : `كشف حساب مالي تفصيلي: ${currentParty?.name || 'اختر حساب'}`}
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  statementMode === 'employee' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  isCustomer ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                  'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                }`}>
                  {statementMode === 'employee' ? 'موظف' : isCustomer ? 'عميل' : 'مورد خامات'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                نظام الرصيد التراكمي المستمر (Continuous Running Balance) معتمد لترويسة المنشأة والطباعة A4
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition-colors cursor-pointer"
              title="تصدير كشف الحساب إلى إكسل CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>تصدير CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
              title="طباعة رسمية A4 مع ترويسة المنشأة"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة A4</span>
            </button>

            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Entity Switcher & Date Filters (Hidden in Print) */}
        <div className="bg-slate-50 p-3 border-b border-slate-200 space-y-2.5 text-xs print:hidden">
          
          {/* Switcher Bar between Customer/Supplier and Employee */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">نوع الكشف:</span>
              <div className="flex rounded-lg bg-slate-200/80 p-0.5 border border-slate-300">
                <button
                  type="button"
                  onClick={() => {
                    setStatementMode('party');
                    if (!selectedPartyId && parties.length > 0) setSelectedPartyId(parties[0].id);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    statementMode === 'party'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>عميل / مورد</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatementMode('employee');
                    if (!selectedEmpId && employees.length > 0) setSelectedEmpId(employees[0].id);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    statementMode === 'employee'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>موظف وكادر العمل</span>
                </button>
              </div>
            </div>

            {/* Quick Entity Selector with Top Bar Toggles & Counts */}
            <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 whitespace-nowrap text-xs">
                <div className={`p-1.5 rounded-lg ${statementMode === 'party' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                  {statementMode === 'party' ? <Users className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                </div>
                <span>{statementMode === 'party' ? 'العميل:' : 'الموظف:'}</span>
              </div>
              <div className="w-56 sm:w-64">
                {statementMode === 'party' ? (
                  <AutocompleteCombobox
                    items={partyOptions}
                    selectedId={currentParty?.id || ''}
                    value={currentParty?.name || ''}
                    onSelect={(opt) => {
                      if (opt.raw) {
                        setSelectedPartyId(opt.raw.id);
                        setSelectedPartyForStatement(opt.raw);
                      }
                    }}
                    entityType="customer"
                    placeholder="ابحث واكتب اسم الزبون..."
                    className="w-full text-xs"
                    inputClassName="py-1 px-2.5 text-xs font-bold bg-white"
                  />
                ) : (
                  <AutocompleteCombobox
                    items={employeeOptions}
                    selectedId={currentEmployee?.id || ''}
                    value={currentEmployee?.name || ''}
                    onSelect={(opt) => {
                      if (opt.raw) {
                        setSelectedEmpId(opt.raw.id);
                        setSelectedEmployeeForStatement(opt.raw);
                      }
                    }}
                    entityType="employee"
                    placeholder="ابحث واكتب اسم الموظف..."
                    className="w-full text-xs"
                    inputClassName="py-1 px-2.5 text-xs font-bold bg-white"
                  />
                )}
              </div>

              {statementMode === 'party' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="h-6 w-px bg-slate-300 self-center hidden sm:block mx-1"></div>
                  
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-bold select-none font-semibold">
                    <input
                      type="checkbox"
                      checked={showItemDetails}
                      onChange={e => setShowItemDetails(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>تفاصيل بنود الفواتير والمقاسات</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowImageThumbnailsInStatement(prev => !prev)}
                    className={`px-2 py-0.5 rounded text-xs font-bold cursor-pointer transition-all flex items-center gap-1 border select-none ${
                      showImageThumbnailsInStatement
                        ? 'bg-purple-600 text-white border-purple-700 hover:bg-purple-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                    title={showImageThumbnailsInStatement ? 'إخفاء مصغرات صور الأصناف من الكشف' : 'إظهار مصغرات صور الأصناف تحت جدول الفاتورة'}
                  >
                    <ImageIcon className={`w-3.5 h-3.5 ${showImageThumbnailsInStatement ? 'text-amber-300' : 'text-purple-600'}`} />
                    <span>صور الأصناف</span>
                  </button>

                  <div className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-0.5">
                    عدد الحركات: <strong className="font-mono text-slate-900">{displayedPartyRows.length}</strong>
                  </div>
                </div>
              )}

              {statementMode === 'employee' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="h-6 w-px bg-slate-300 self-center hidden sm:block mx-1"></div>
                  
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-bold select-none font-semibold">
                    <input
                      type="checkbox"
                      checked={showItemDetails}
                      onChange={e => setShowItemDetails(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>تفاصيل العمليات والأصناف</span>
                  </label>

                  <div className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-0.5">
                    عدد الحركات: <strong className="font-mono text-slate-900">{displayedEmployeeRows.length}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Date Filter & Options Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>الفترة المحددة:</span>
              </span>

              <DateInput
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 font-mono focus:ring-1 focus:ring-blue-500"
                title="من تاريخ"
              />
              <span className="text-slate-400 font-bold">إلى</span>
              <DateInput value={toDate} onChange={e => setToDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 font-mono focus:ring-1 focus:ring-blue-500"
                title="إلى تاريخ"
              />

              <div className="flex items-center bg-slate-200/80 p-0.5 rounded-md gap-0.5 mr-1">
                <button
                  onClick={() => setDatePreset('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                    !fromDate && !toDate ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الكل
                </button>
                <button
                  onClick={() => setDatePreset('today')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  اليوم
                </button>
                <button
                  onClick={() => setDatePreset('this_month')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  هذا الشهر
                </button>
                <button
                  onClick={() => setDatePreset('last_month')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  الشهر الماضي
                </button>
                <button
                  onClick={() => setDatePreset('this_year')}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  هذا العام
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-slate-600 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>تصفية:</span>
                </span>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as any)}
                  className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">كافة الحركات (الكل)</option>
                  <option value="debit">{statementMode === 'employee' ? 'سلف ومنصرفات (مدين -)' : 'الحركات المدينة فقط (مدين / سحوبات)'}</option>
                  <option value="credit">{statementMode === 'employee' ? 'رواتب واستحقاقات (دائن +)' : 'الحركات الدائنة فقط (دائن / مقبوضات)'}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Printable Statement Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 print:p-0 print:overflow-visible report-a4-container">
          
          {/* Printable Official Facility Header (A4) - يعتمد الترويسة حسب إعدادات البرنامج واللوقو والبيانات الرسمية */}
          <PrintHeader />
          <div className="border-b-2 border-slate-900 pb-2">
            {/* سطر الكشف المبسط حسب الطلب */}
            {statementMode === 'party' && currentParty && (
              <div className="text-center font-bold text-base mb-1.5 mt-2 text-slate-900 leading-relaxed">
                {isCustomer ? 'كشف حساب عميل تفصيلي:' : 'كشف حساب مورد تفصيلي:'}{' '}
                <span className={isCustomer ? "text-blue-900" : "text-rose-900"}>
                  {clientDisplayName}
                </span>
                <div className="text-xs text-slate-600 mt-0.5 font-semibold">
                  من تاريخ: <span className="font-mono">{fromDate || 'بداية التعامل'}</span>{' '}
                  إلى تاريخ: <span className="font-mono">{toDate || 'تاريخ اليوم'}</span>
                </div>
              </div>
            )}
            {statementMode === 'employee' && currentEmployee && (
              <div className="text-center font-bold text-base mb-1.5 mt-2 text-slate-900 leading-relaxed">
                كشف حساب موظف:{' '}
                <span className="text-emerald-900">
                  {currentEmployee.name}
                </span>
                <div className="text-xs text-slate-600 mt-0.5 font-semibold">
                  من تاريخ: <span className="font-mono">{fromDate || 'بداية العمل'}</span>{' '}
                  إلى تاريخ: <span className="font-mono">{toDate || 'تاريخ اليوم'}</span>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* SECTION 1: PARTY FINANCIAL STATEMENT (CUSTOMER / SUPPLIER)*/}
          {/* ========================================================= */}
          {statementMode === 'party' && partyStatement && (
            <div className="space-y-3">
              
              {/* Summary Cards: Breakdown of Withdrawals, Receipts, Disbursements */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-semibold block">رصيد أول المدة / سابق:</span>
                  <span className="text-xs font-black font-mono text-slate-800">
                    {formatNumber(partyStatement.openingBalance, 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-slate-400 block mt-0.5">قبل تاريخ {fromDate || 'البدء'}</span>
                </div>

                <div className="bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/80">
                  <span className="text-[10px] text-emerald-700 font-semibold block">
                    {isCustomer ? 'إجمالي السحوبات (مدين):' : 'إجمالي التوريدات (دائن):'}
                  </span>
                  <span className="text-xs font-black font-mono text-emerald-800">
                    {formatNumber(isCustomer ? partyStatement.totalWithdrawals : partyStatement.totalCredit, 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-emerald-600 block mt-0.5">
                    {isCustomer ? 'فواتير المبيعات وأوامر التشغيل' : 'فواتير توريد الخامات'}
                  </span>
                </div>

                <div className="bg-blue-50/70 p-2 rounded-lg border border-blue-200/80">
                  <span className="text-[10px] text-blue-700 font-semibold block">
                    {isCustomer ? 'إجمالي المقبوضات (دائن):' : 'إجمالي الصرف والمسدد (مدين):'}
                  </span>
                  <span className="text-xs font-black font-mono text-blue-800">
                    {formatNumber(isCustomer ? partyStatement.totalReceipts : partyStatement.totalDebit, 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-blue-600 block mt-0.5">
                    {isCustomer ? 'سندات القبض والدفعات والمقاصة' : 'سندات الصرف والسداد والمقاصة'}
                  </span>
                </div>

                <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-200/80">
                  <span className="text-[10px] text-amber-700 font-semibold block">
                    {isCustomer ? 'إجمالي الصرف / مرتجعات:' : 'المردودات والمقبوضات:'}
                  </span>
                  <span className="text-xs font-black font-mono text-amber-800">
                    {formatNumber(isCustomer ? partyStatement.totalDisbursements : 0, 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-amber-600 block mt-0.5">
                    {isCustomer ? 'سندات صرف أو استردادات' : 'مرتجع مشتريات'}
                  </span>
                </div>

                <div className={`p-2 rounded-lg border ${
                  partyStatement.closingBalance > 0
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : partyStatement.closingBalance < 0
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  <span className="text-[10px] font-semibold block">
                    {isCustomer
                      ? (partyStatement.closingBalance > 0 ? 'صافي المتبقي على العميل (مدين):' : partyStatement.closingBalance < 0 ? 'رصيد دائن للعميل (دائن):' : 'الحساب متطابق (صفر):')
                      : (partyStatement.closingBalance > 0 ? 'صافي مستحق للمورد (دائن):' : partyStatement.closingBalance < 0 ? 'مبلغ مدين للمورد (مدين):' : 'الحساب خالص:')}
                  </span>
                  <span className="text-xs font-black font-mono">
                    {formatNumber(Math.abs(partyStatement.closingBalance), 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] font-bold block mt-0.5">
                    {partyStatement.closingBalance > 0 ? (isCustomer ? 'مطلوب سداده (مدين)' : 'التزام علينا (دائن)') : partyStatement.closingBalance < 0 ? (isCustomer ? 'مبلغ فائض (دائن)' : 'رصيد لصالحنا (مدين)') : 'تمت التسوية'}
                  </span>
                </div>
              </div>

              {/* Detailed Transactions Table - Optimized Font 12 & A4 Width */}
              <div className="border border-slate-400 rounded-md overflow-x-auto shadow-2xs min-h-[440px] print:min-h-0 flex flex-col justify-between bg-white print:block print:overflow-visible print:border-none print:shadow-none">
                <table className="w-full text-right report-table border-collapse h-full">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold border-b border-slate-900 print:bg-slate-200 print:text-slate-900">
                      <th className="w-8 min-w-8 text-center border-l border-slate-600 print:border-slate-400">م</th>
                      <th className="w-24 min-w-24 text-center border-l border-slate-600 print:border-slate-400">التاريخ</th>
                      <th className="border-l border-slate-600 print:border-slate-400">البيان والشرح والتفاصيل الكاملة</th>
                      <th className="w-28 min-w-28 text-left bg-rose-950/40 print:bg-rose-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap">
                        {isCustomer ? 'مدين (عليه)' : 'مدين (المسدد)'}
                      </th>
                      <th className="w-28 min-w-28 text-left bg-emerald-950/40 print:bg-emerald-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap">
                        {isCustomer ? 'دائن (له)' : 'دائن (التوريدات)'}
                      </th>
                      <th className="w-32 min-w-32 text-left bg-slate-700 print:bg-slate-300 whitespace-nowrap">
                        الرصيد التراكمي
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {/* Opening Balance Row */}
                    <tr className="bg-slate-100/90 font-bold border-b border-slate-300 text-slate-800">
                      <td className="text-center text-slate-400 font-sans border-l border-slate-300">-</td>
                      <td className="text-center text-slate-600 font-mono border-l border-slate-300">{fromDate || 'الرصيد السابق'}</td>
                      <td className="font-sans text-slate-700 font-semibold border-l border-slate-300">
                        رصيد سابق - رصيد الحساب الافتتاحي السابق (ما قبل تاريخ {fromDate || 'بدء الحركة'})
                      </td>
                      <td className="text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300">
                        {partyStatement.openingBalance > 0 ? partyStatement.openingBalance.toFixed(2) : '-'}
                      </td>
                      <td className="text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300">
                        {partyStatement.openingBalance < 0 ? Math.abs(partyStatement.openingBalance).toFixed(2) : '-'}
                      </td>
                      <td className="text-left font-black text-slate-950 bg-slate-100 font-mono whitespace-nowrap">
                        {partyStatement.openingBalance.toFixed(2)}
                      </td>
                    </tr>

                    {displayedPartyRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 font-sans font-bold">
                          لا توجد حركات مالية مسجلة خلال هذه الفترة المحددة.
                        </td>
                      </tr>
                    ) : (
                      displayedPartyRows.map((row, idx) => {
                        const typeLabel = row.typeLabel || (
                          row.type === 'invoice' ? 'فاتورة مبيعات' :
                          row.type === 'receipt' ? 'سند قبض' :
                          row.type === 'payment' ? 'سند صرف' :
                          row.type === 'purchase' ? 'فاتورة مشتريات' :
                          row.type === 'sales_return' ? 'مردودات مبيعات' :
                          row.type === 'purchase_return' ? 'مردودات مشتريات' :
                          row.type === 'clearance' ? 'مقاصة ديون' :
                          row.type === 'opening' ? 'رصيد سابق' : 'حركة مالية'
                        );

                        let note = '';
                        if (row.type === 'invoice') {
                          if (row.invoiceNotes) {
                            note = row.invoiceNotes;
                            if (row.subCustomerName) note += ` [الزبون الفرعي: ${row.subCustomerName}]`;
                          } else if (row.subCustomerName) {
                            note = `[الزبون الفرعي: ${row.subCustomerName}]`;
                          } else if (row.description) {
                            const cleaned = row.description
                              .replace(/^فاتورة مبيعات\s*(\([^)]*\))?\s*(-\s*)?/, '')
                              .replace(/-\s*إجمالي\s*[\d,.]+/gi, '')
                              .replace(/إجمالي\s*[\d,.]+/gi, '')
                              .replace(/-\s*total\s*[\d,.]+/gi, '')
                              .trim();
                            note = cleaned;
                          }
                        } else if (row.type === 'purchase') {
                          if (row.invoiceNotes) {
                            note = row.invoiceNotes;
                          } else if (row.description) {
                            const cleaned = row.description
                              .replace(/^فاتورة مشتريات\s*(\([^)]*\))?\s*(-\s*)?/, '')
                              .replace(/-\s*إجمالي\s*[\d,.]+/gi, '')
                              .replace(/إجمالي\s*[\d,.]+/gi, '')
                              .trim();
                            note = cleaned;
                          }
                        } else if (row.type === 'receipt') {
                          const rawNote = row.voucherNotes || row.description || '';
                          note = rawNote.replace(/^سند قبض\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, '');
                        } else if (row.type === 'payment') {
                          const rawNote = row.voucherNotes || row.description || '';
                          note = rawNote.replace(/^سند صرف\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, '');
                        } else if (row.type === 'sales_return' || row.type === 'purchase_return') {
                          const rawNote = row.invoiceNotes || row.voucherNotes || row.description || '';
                          note = rawNote.replace(/^مردودات (مبيعات|مشتريات)\s*(-\s*)?/, '');
                        } else {
                          note = row.description || '';
                        }
                        const trimmedNote = note.trim();

                        const hasReceiptExtraDetails = row.type === 'receipt' && Boolean(
                          row.chequeNumber || row.chequeBank || row.chequeDueDate || row.transferReference ||
                          (row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً')
                        );

                        const hasPaymentExtraDetails = row.type === 'payment' && Boolean(
                          row.chequeNumber || row.chequeBank || row.chequeDueDate || row.transferReference ||
                          (row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً')
                        );

                        return (
                        <React.Fragment key={`${row.id || 'party-row'}-${idx}`}>
                          <tr
                            className={`hover:bg-slate-50/90 transition-colors ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                            }`}
                          >
                            <td className="text-center text-slate-400 font-sans align-middle border-l border-slate-300">{idx + 1}</td>
                            <td className="text-slate-700 whitespace-nowrap text-center align-middle font-mono border-l border-slate-300">{formatDateDisplay(row.date)}</td>
                            <td className="font-sans text-slate-800 align-middle space-y-1 border-l border-slate-300">
                              {/* سطر مدمج وموحد: نوع العملية - رقم الحركة - الملاحظات */}
                              <div className="font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-1">
                                <span className="text-slate-900 font-bold">{typeLabel}</span>
                                {row.referenceNumber && row.referenceNumber !== 'OPENING' && (
                                  <>
                                    <span className="text-slate-400 font-normal">-</span>
                                    <span className="font-mono font-bold text-slate-800">{row.referenceNumber}</span>
                                  </>
                                )}
                                {trimmedNote && (
                                  <>
                                    <span className="text-slate-400 font-normal">-</span>
                                    <span className="text-slate-700 font-medium">{trimmedNote}</span>
                                  </>
                                )}
                              </div>

                              {/* تفاصيل إضافية لسند القبض بدون تكرار السند أو رقمه أو المبلغ */}
                              {hasReceiptExtraDetails && (
                                <div className="mt-1 p-1 bg-blue-50/60 border border-blue-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً' && (
                                    <div>
                                      <span className="text-slate-500">طريقة القبض: </span>
                                      <span className="font-bold text-slate-800">{row.paymentMethodLabel}</span>
                                    </div>
                                  )}
                                  {row.chequeNumber && (
                                    <div>
                                      <span className="text-slate-500">رقم الشيك: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeNumber}</span>
                                    </div>
                                  )}
                                  {row.chequeBank && (
                                    <div>
                                      <span className="text-slate-500">البنك المسحوب عليه: </span>
                                      <span className="font-bold text-slate-800">{row.chequeBank}</span>
                                    </div>
                                  )}
                                  {row.chequeDueDate && (
                                    <div>
                                      <span className="text-slate-500">تاريخ الاستحقاق: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeDueDate}</span>
                                    </div>
                                  )}
                                  {row.transferReference && (
                                    <div>
                                      <span className="text-slate-500">رقم الحوالة: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.transferReference}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* تفاصيل المقاصة */}
                              {row.type === 'clearance' && (row.counterPartyName || row.reason) && (
                                <div className="mt-1 p-1 bg-teal-50/60 border border-teal-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-2">
                                  {row.counterPartyName && (
                                    <div>
                                      <span className="text-teal-900 font-bold">الطرف المقابل: </span>
                                      <span className="font-medium text-slate-800">{row.counterPartyName}</span>
                                    </div>
                                  )}
                                  {row.reason && (
                                    <div>
                                      <span className="text-teal-900 font-bold">السبب: </span>
                                      <span className="text-slate-700">{row.reason}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* تفاصيل إضافية لسند الصرف بدون تكرار السند أو رقمه أو المبلغ */}
                              {hasPaymentExtraDetails && (
                                <div className="mt-1 p-1 bg-amber-50/60 border border-amber-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً' && (
                                    <div>
                                      <span className="text-slate-500">طريقة الصرف: </span>
                                      <span className="font-bold text-slate-800">{row.paymentMethodLabel}</span>
                                    </div>
                                  )}
                                  {row.chequeNumber && (
                                    <div>
                                      <span className="text-slate-500">رقم الشيك: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeNumber}</span>
                                    </div>
                                  )}
                                  {row.chequeBank && (
                                    <div>
                                      <span className="text-slate-500">البنك: </span>
                                      <span className="font-bold text-slate-800">{row.chequeBank}</span>
                                    </div>
                                  )}
                                  {row.chequeDueDate && (
                                    <div>
                                      <span className="text-slate-500">تاريخ الاستحقاق: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeDueDate}</span>
                                    </div>
                                  )}
                                  {row.transferReference && (
                                    <div>
                                      <span className="text-slate-500">رقم الحوالة: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.transferReference}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="text-left font-bold text-rose-700 font-mono align-middle whitespace-nowrap border-l border-slate-300">
                              {row.debit > 0 ? row.debit.toFixed(2) : '-'}
                            </td>
                            <td className="text-left font-bold text-emerald-700 font-mono align-middle whitespace-nowrap border-l border-slate-300">
                              {row.credit > 0 ? row.credit.toFixed(2) : '-'}
                            </td>
                            <td className="text-left font-black text-slate-900 bg-slate-50/70 font-mono align-middle whitespace-nowrap">
                              {row.runningBalance.toFixed(2)}
                            </td>
                          </tr>

                          {/* تفاصيل الفاتورة: جدول الأصناف ممتد بالكامل تحت أعمدة مدين ودائن ورصيد */}
                          {showItemDetails && row.items && row.items.length > 0 && (
                            <tr className="bg-slate-50/60 print:bg-transparent print-allow-break">
                              <td colSpan={6} className="p-0 border-b border-slate-300 print-allow-break report-subtable-cell">
                                <div className="w-full bg-white print:border-none print:rounded-none print:overflow-visible print:shadow-none print:block">
                                  <table className="w-full text-right report-sub-table border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                                        <th className="text-center w-8 min-w-8 border-l border-slate-200">م</th>
                                        <th className="text-center w-12 min-w-12 border-l border-slate-200">صورة</th>
                                        <th className="border-l border-slate-200">الصنف والبيان</th>
                                        <th className="text-center w-12 min-w-12 border-l border-slate-200">الطول</th>
                                        <th className="text-center w-12 min-w-12 border-l border-slate-200">العرض</th>
                                        <th className="text-center w-10 min-w-10 border-l border-slate-200">العدد</th>
                                        <th className="text-center w-12 min-w-12 border-l border-slate-200">الكمية</th>
                                        <th className="text-left w-16 min-w-16 border-l border-slate-200">السعر</th>
                                        <th className="text-left w-18 min-w-18">الإجمالي</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                      {row.items.map((it, iIdx) => (
                                        <tr key={iIdx} className="hover:bg-slate-50">
                                          <td className="text-center font-mono font-bold text-slate-700 border-l border-slate-200 py-1">{iIdx + 1}</td>
                                          <td className="text-center border-l border-slate-200 py-1">
                                            {it.imageThumbnail ? (
                                              <div className="flex items-center justify-center gap-1 flex-wrap max-w-[120px] mx-auto">
                                                {parseThumbnails(it.imageThumbnail).map((imgStr, imgIdx) => (
                                                  <img
                                                    key={imgIdx}
                                                    src={imgStr}
                                                    alt={it.itemName}
                                                    className="w-10 h-10 rounded-md object-contain bg-white border border-slate-200"
                                                  />
                                                ))}
                                              </div>
                                            ) : (
                                              <span className="text-slate-300 font-mono">-</span>
                                            )}
                                          </td>
                                          <td className="font-bold text-slate-900 border-l border-slate-200">
                                            <div>
                                              <span>{it.itemName}</span>
                                              {(it.notes || it.description) && (it.notes !== it.itemName) && (
                                                <span className="text-slate-600 font-medium"> / {it.notes || it.description}</span>
                                              )}
                                              
                                            </div>
                                          </td>
                                          <td className="text-center font-mono text-slate-800 border-l border-slate-200">{it.length != null && it.length !== 0 ? it.length : '-'}</td>
                                          <td className="text-center font-mono text-slate-800 border-l border-slate-200">{it.width != null && it.width !== 0 ? it.width : '-'}</td>
                                          <td className="text-center font-mono font-bold text-slate-800 border-l border-slate-200">{it.count || 1}</td>
                                          <td className="text-center font-mono font-bold text-slate-900 border-l border-slate-200">
                                            {it.quantity}
                                          </td>
                                          <td className="text-left font-mono text-slate-800 border-l border-slate-200">{it.unitPrice.toFixed(2)}</td>
                                          <td className="text-left font-mono font-bold text-slate-900">{it.total.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    {Boolean((row.discountTotal && row.discountTotal > 0) || (row.taxAmount && row.taxAmount > 0)) && (
                                      <tfoot className="bg-slate-50 border-t border-slate-300 font-bold">
                                        <tr>
                                          <td colSpan={9} className="py-1 px-1.5 text-left font-mono">
                                            <div className="flex items-center justify-end gap-3 text-slate-800">
                                              {row.discountTotal !== undefined && row.discountTotal > 0 && (
                                                <span className="text-rose-600 font-bold">خصم الفاتورة: -{row.discountTotal.toFixed(2)}</span>
                                              )}
                                              {row.taxAmount !== undefined && row.taxAmount > 0 && (
                                                <span className="text-slate-600">الضريبة: +{row.taxAmount.toFixed(2)}</span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      </tfoot>
                                    )}
                                  </table>

                                  {/* كشف تفصيلي بالصور: شريط المصغرات التفصيلي بالصور تحت جدول الفاتورة مباشرة */}
                                  {showImageThumbnailsInStatement && row.items && row.items.some(it => 
                                    it.imageThumbnail || (it.attachments && it.attachments.some(a => a.data || a.type?.startsWith('image/')))
                                  ) && (
                                    <div className="bg-slate-50/70 p-2.5 border-t border-slate-200">
                                      <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center justify-between select-none">
                                        <div className="flex items-center gap-1.5 text-purple-900 font-bold">
                                          <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                                          <span>مصغرات صور الأصناف المرفقة بالفاتورة:</span>
                                        </div>
                                        <span className="text-[9.5px] text-slate-400 font-normal print:hidden">
                                          (انقر على أي صورة لتكبيرها والمعاينة)
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-7 gap-2.5 w-full print:grid-cols-7">
                                        {row.items.flatMap((it, itemIdx) => {
                                           const thumbs = parseThumbnails(it.imageThumbnail);
                                           const attImgs = (it.attachments || [])
                                             .filter(a => a.data || a.type?.startsWith('image/'))
                                             .map(a => a.data || '');
                                           const allImgs = Array.from(new Set([...thumbs, ...attImgs].filter(Boolean)));
                                           return allImgs.map(imgStr => ({
                                             imgStr,
                                             itemName: it.itemName,
                                             itemCode: it.itemCode,
                                             itemSeq: itemIdx + 1
                                           }));
                                         }).map((imgObj, idx) => (
                                           <div
                                             key={idx}
                                             onClick={() => setPreviewModalImage({ url: imgObj.imgStr, name: imgObj.itemName })}
                                             className="flex flex-col items-center bg-white border border-slate-200 hover:border-purple-500 hover:shadow-md rounded-lg p-1.5 shadow-2xs w-full cursor-pointer transition-all group"
                                             title={`معاينة وتكبير صورة "${imgObj.itemName}" (بند #${imgObj.itemSeq})`}
                                           >
                                             <div className="relative w-full aspect-square rounded-md overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-0.5">
                                               <span className="absolute top-0.5 right-0.5 bg-slate-900/80 text-white text-[8px] font-mono font-black px-1 rounded-xs z-10 print:bg-slate-800">
                                                 #{imgObj.itemSeq}
                                               </span>
                                               <img
                                                 src={imgObj.imgStr}
                                                 alt={imgObj.itemName}
                                                 className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                                 onError={(e) => {
                                                   e.currentTarget.style.display = 'none';
                                                 }}
                                               />
                                               <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center print:hidden">
                                                 <Eye className="w-4 h-4 text-white" />
                                               </div>
                                             </div>
                                             <div className="text-[8px] sm:text-[8.5px] text-slate-900 font-bold text-center leading-none truncate w-full mt-1 group-hover:text-purple-700 px-0.5" title={`بند #${imgObj.itemSeq}: ${imgObj.itemName}`}>
                                               #{imgObj.itemSeq} {imgObj.itemName}
                                             </div>
                                           </div>
                                         ))}
                                       </div>
                                     </div>
                                   )}
                                 </div>
                               </td>
                             </tr>
                           )}
                         </React.Fragment>
                       );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                      <td colSpan={3} className="text-left font-sans">الإجمالي العام للحركات بالفترة:</td>
                      <td className="text-left font-mono text-rose-800 font-black whitespace-nowrap">
                        {partyStatement.totalDebit.toFixed(2)}
                      </td>
                      <td className="text-left font-mono text-emerald-800 font-black whitespace-nowrap">
                        {partyStatement.totalCredit.toFixed(2)}
                      </td>
                      <td className="text-left font-mono text-slate-900 font-black bg-slate-200/80 whitespace-nowrap">
                        {partyStatement.closingBalance.toFixed(2)} {settings.currency}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ملخص نهاية الكشف بعد الجدول بتنسيق رسمي ومضغوط سطر واحد للبنرات الأربعة */}
              <div className="mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 shadow-2xs print:border-slate-300">
                <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                  <div className="bg-white border border-slate-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs">
                    <span className="font-bold text-slate-700 text-[10px] whitespace-nowrap">رصيد سابق:</span>
                    <div className="font-black font-mono text-slate-900 text-[11px] flex items-center gap-1 whitespace-nowrap">
                      <span>{partyStatement.openingBalance.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold text-slate-500">{settings.currency}</span>
                    </div>
                  </div>
                  <div className={`bg-white border ${isCustomer ? 'border-rose-300' : 'border-emerald-300'} rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs`}>
                    <span className={`font-bold text-[10px] whitespace-nowrap ${isCustomer ? 'text-rose-900' : 'text-emerald-900'}`}>إجمالي مدين:</span>
                    <div className={`font-black font-mono text-[11px] ${isCustomer ? 'text-rose-700' : 'text-emerald-700'} flex items-center gap-1 whitespace-nowrap`}>
                      <span>{partyStatement.totalDebit.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                    </div>
                  </div>
                  <div className={`bg-white border ${isCustomer ? 'border-emerald-300' : 'border-rose-300'} rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs`}>
                    <span className={`font-bold text-[10px] whitespace-nowrap ${isCustomer ? 'text-emerald-900' : 'text-rose-900'}`}>إجمالي دائن:</span>
                    <div className={`font-black font-mono text-[11px] ${isCustomer ? 'text-emerald-700' : 'text-rose-700'} flex items-center gap-1 whitespace-nowrap`}>
                      <span>{partyStatement.totalCredit.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                    </div>
                  </div>
                  <div className={`bg-white border rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs ${partyStatement.closingBalance > 0 ? (isCustomer ? 'border-amber-400 bg-amber-50/20' : 'border-rose-400 bg-rose-50/20') : partyStatement.closingBalance < 0 ? (isCustomer ? 'border-blue-400 bg-blue-50/20' : 'border-emerald-400 bg-emerald-50/20') : 'border-slate-300'}`}>
                    <span className="font-bold text-slate-900 text-[10px] whitespace-nowrap">
                      الإجمالي:
                    </span>
                    <div className={`font-black font-mono text-[11px] flex items-center gap-1 whitespace-nowrap ${partyStatement.closingBalance > 0 ? (isCustomer ? 'text-amber-700' : 'text-rose-700') : partyStatement.closingBalance < 0 ? (isCustomer ? 'text-blue-700' : 'text-emerald-700') : 'text-slate-800'}`}>
                      <span>{Math.abs(partyStatement.closingBalance).toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                      <span className="text-[9.5px] font-sans font-bold">
                        ({isCustomer ? (partyStatement.closingBalance > 0 ? 'مدين' : partyStatement.closingBalance < 0 ? 'دائن' : 'متزن') : (partyStatement.closingBalance > 0 ? 'دائن' : partyStatement.closingBalance < 0 ? 'مدين' : 'متزن')})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tafqeet & Closing Balance */}
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <div className="flex items-center justify-between text-[10.5px] mb-0.5">
                    <span className="font-bold text-slate-700">المبلغ كتابة وتفقيطاً:</span>
                    <span className="font-bold text-slate-900 font-mono text-[11px]">
                      الرصيد الإجمالي ({isCustomer ? (partyStatement.closingBalance > 0 ? 'مدين' : partyStatement.closingBalance < 0 ? 'دائن' : 'متزن') : (partyStatement.closingBalance > 0 ? 'دائن' : partyStatement.closingBalance < 0 ? 'مدين' : 'متزن')}): {Math.abs(partyStatement.closingBalance).toFixed(2)} {settings.currency}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-semibold text-slate-800 bg-slate-50 p-1 rounded border border-slate-200 font-arabic">
                    {partyTafqeet}
                  </div>
                </div>
              </div>

              {/* Official Signatures Section */}
              <div className="pt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-[10px] mt-4">
                {/* Right Column */}
                <div className="space-y-4 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">إعداد وتدقيق المحاسب</span>
                  <div className="border-b border-dashed border-slate-400 w-28 mx-auto mt-6"></div>
                  <span className="text-[10px] text-slate-400 block font-mono">التوقيع والتاريخ</span>
                </div>

                {/* Center Column */}
                <div className="space-y-4 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">توقيع وإقرار الموظف بالمطابقة</span>
                  <div className="border-b border-dashed border-slate-400 w-28 mx-auto mt-6"></div>
                  <span className="text-[10px] text-slate-400 block font-mono">الموظف</span>
                </div>

                {/* Left Column - Official Stamp & Signature */}
                <div className="space-y-2 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">اعتماد الإدارة / التوقيع</span>
                  
                  <div className="min-h-[4.2cm] flex items-center justify-center relative">
                    {settings.stampUrl ? (
                      <div className="relative flex items-center justify-center">
                        <OfficialStamp size="3.5cm" />
                        {settings.signatureUrl && (
                          <img
                            src={settings.signatureUrl}
                            alt="Signature"
                            className="absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none"
                          />
                        )}
                      </div>
                    ) : settings.signatureUrl ? (
                      <img
                        src={settings.signatureUrl}
                        alt="Signature"
                        className="max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90"
                      />
                    ) : (
                      <div className="border-b border-dashed border-slate-400 w-36 mx-auto mt-10"></div>
                    )}
                  </div>
                  
                  <span className="text-[11px] text-slate-400 block font-mono mt-2">الختم والتوقيع المعتمد</span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SECTION 2: EMPLOYEE FINANCIAL STATEMENT                   */}
          {/* ========================================================= */}
          {statementMode === 'employee' && employeeStatement && (
            <div className="space-y-3">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-semibold block">رصيد أول المدة / سابق:</span>
                  <span className="text-xs font-black font-mono text-slate-800">
                    {formatNumber(employeeStatement.openingBalance, 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-slate-400 block mt-0.5">قبل تاريخ {fromDate || 'البدء'}</span>
                </div>

                <div className="bg-purple-50/70 p-2 rounded-lg border border-purple-200/80">
                  <span className="text-[10px] text-purple-700 font-semibold block">
                    إجمالي المستحقات (دائن له):
                  </span>
                  <span className="text-xs font-black font-mono text-purple-800">
                    {formatNumber(employeeStatement.totalEntitlements, 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-purple-600 block mt-0.5">
                    رواتب ومكافآت وتوريدات
                  </span>
                </div>

                <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-200/80">
                  <span className="text-[10px] text-amber-700 font-semibold block">
                    إجمالي السلف والمسحوبات:
                  </span>
                  <span className="text-xs font-black font-mono text-amber-800">
                    {formatNumber(employeeStatement.totalAdvances + employeeStatement.rows.filter(r => r.type === 'invoice').reduce((s, r) => s + r.disbursement, 0), 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-amber-600 block mt-0.5">
                    سلف نقدية وفواتير مسحوبات
                  </span>
                </div>

                <div className="bg-rose-50/70 p-2 rounded-lg border border-rose-200/80">
                  <span className="text-[10px] text-rose-700 font-semibold block">
                    إجمالي المنصرف والخصومات:
                  </span>
                  <span className="text-xs font-black font-mono text-rose-800">
                    {formatNumber(employeeStatement.totalDeductions + employeeStatement.rows.filter(r => r.type !== 'invoice').reduce((s, r) => s + r.disbursement, 0), 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] text-rose-600 block mt-0.5">
                    سندات صرف وجزاءات
                  </span>
                </div>

                <div className={`p-2 rounded-lg border ${
                  employeeStatement.closingBalance > 0
                    ? 'bg-purple-50 border-purple-300 text-purple-900'
                    : employeeStatement.closingBalance < 0
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  <span className="text-[10px] font-semibold block">
                    {employeeStatement.closingBalance > 0
                      ? 'صافي مستحق للموظف (دائن له):'
                      : employeeStatement.closingBalance < 0
                      ? 'صافي مستحق على الموظف (مدين عليه):'
                      : 'الحساب متطابق وخالص:'}
                  </span>
                  <span className="text-xs font-black font-mono">
                    {formatNumber(Math.abs(employeeStatement.closingBalance), 2)} {settings.currency}
                  </span>
                  <span className="text-[9.5px] font-bold block mt-0.5">
                    {employeeStatement.closingBalance > 0 ? 'مستحق له في ذمة المنشأة' : employeeStatement.closingBalance < 0 ? 'سلف ومسحوبات مطلوبة منه' : 'تمت التسوية تماماً'}
                  </span>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="border border-slate-400 rounded-md overflow-x-auto shadow-2xs min-h-[440px] print:min-h-0 flex flex-col justify-between bg-white print:block print:overflow-visible print:border-none print:shadow-none">
                <table className="w-full text-right report-table border-collapse h-full">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold border-b border-slate-900 print:bg-slate-200 print:text-slate-900">
                      <th className="w-8 min-w-8 text-center border-l border-slate-600 print:border-slate-400">م</th>
                      <th className="w-24 min-w-24 text-center border-l border-slate-600 print:border-slate-400">التاريخ</th>
                      <th className="border-l border-slate-600 print:border-slate-400">البيان والشرح والتفاصيل الكاملة</th>
                      <th className="w-28 min-w-28 text-left bg-purple-950/40 print:bg-purple-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap">
                        استحقاق (له +)
                      </th>
                      <th className="w-28 min-w-28 text-left bg-rose-950/40 print:bg-rose-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap">
                        منصرف / سلف (عليه -)
                      </th>
                      <th className="w-32 min-w-32 text-left bg-slate-700 print:bg-slate-300 whitespace-nowrap">
                        الرصيد التراكمي
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {/* Opening Balance Row */}
                    <tr className="bg-slate-100/90 font-bold border-b border-slate-300 text-slate-800">
                      <td className="text-center text-slate-400 font-sans border-l border-slate-300">-</td>
                      <td className="text-center text-slate-600 font-mono border-l border-slate-300">{fromDate || 'الرصيد السابق'}</td>
                      <td className="font-sans text-slate-700 font-semibold border-l border-slate-300">
                        رصيد سابق - رصيد الحساب الافتتاحي السابق (ما قبل تاريخ {fromDate || 'بدء الحركة'})
                      </td>
                      <td className="text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300">
                        {employeeStatement.openingBalance > 0 ? employeeStatement.openingBalance.toFixed(2) : '-'}
                      </td>
                      <td className="text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300">
                        {employeeStatement.openingBalance < 0 ? Math.abs(employeeStatement.openingBalance).toFixed(2) : '-'}
                      </td>
                      <td className="text-left font-black text-slate-950 bg-slate-100 font-mono whitespace-nowrap">
                        {employeeStatement.openingBalance.toFixed(2)}
                      </td>
                    </tr>

                    {displayedEmployeeRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 font-sans font-bold">
                          لا توجد حركات مالية مسجلة لهذا الموظف خلال هذه الفترة المحددة.
                        </td>
                      </tr>
                    ) : (
                      displayedEmployeeRows.map((row, idx) => {
                        const totalDebitAmount = row.advance + row.deduction + row.disbursement;
                        return (
                          <React.Fragment key={`${row.id || 'emp-row'}-${idx}`}>
                            <tr
                              className={`hover:bg-slate-50/90 transition-colors ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                              }`}
                            >
                              <td className="text-center text-slate-400 font-sans align-middle border-l border-slate-300">{idx + 1}</td>
                              <td className="text-slate-700 whitespace-nowrap text-center align-middle font-mono border-l border-slate-300">{formatDateDisplay(row.date)}</td>
                              <td className="font-sans text-slate-800 align-middle space-y-1 border-l border-slate-300">
                                <div className="font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                                    row.type === 'salary_accrual' || row.type === 'incentive' ? 'bg-purple-100 text-purple-800' :
                                    row.type === 'advance' ? 'bg-amber-100 text-amber-800' :
                                    row.type === 'deduction' ? 'bg-rose-100 text-rose-800' :
                                    row.type === 'invoice' ? 'bg-blue-100 text-blue-800' :
                                    row.type === 'purchase' ? 'bg-emerald-100 text-emerald-800' :
                                    row.type === 'receipt' ? 'bg-teal-100 text-teal-800' :
                                    'bg-slate-100 text-slate-800'
                                  }`}>
                                    {row.typeLabel}
                                  </span>
                                  {row.referenceNumber && (
                                    <>
                                      <span className="text-slate-400 font-normal">-</span>
                                      <span className="font-mono font-bold text-slate-800">{row.referenceNumber}</span>
                                    </>
                                  )}
                                  {row.description && (
                                    <>
                                      <span className="text-slate-400 font-normal">-</span>
                                      <span className="text-slate-700 font-normal text-xs">{row.description}</span>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="text-left font-bold text-purple-700 align-middle border-l border-slate-300 whitespace-nowrap">
                                {row.entitlement > 0 ? row.entitlement.toFixed(2) : '-'}
                              </td>
                              <td className="text-left font-bold text-rose-700 align-middle border-l border-slate-300 whitespace-nowrap">
                                {totalDebitAmount > 0 ? totalDebitAmount.toFixed(2) : '-'}
                              </td>
                              <td className="text-left font-black text-slate-900 align-middle bg-slate-50/50 whitespace-nowrap">
                                <span className={row.runningBalance > 0 ? 'text-purple-800' : row.runningBalance < 0 ? 'text-rose-800' : 'text-slate-800'}>
                                  {row.runningBalance.toFixed(2)}
                                </span>
                              </td>
                            </tr>

                            {/* تفاصيل الأصناف الممتدة بالكامل للموظف */}
                            {showItemDetails && row.items && row.items.length > 0 && (
                              <tr className="bg-slate-50/60 print:bg-transparent print-allow-break">
                                <td colSpan={6} className="p-0 border-b border-slate-300 print-allow-break report-subtable-cell">
                                  <div className="w-full bg-white print:border-none print:rounded-none print:overflow-visible print:shadow-none print:block">
                                    <table className="w-full text-right report-sub-table border-collapse">
                                      <thead>
                                        <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                                          <th className="text-center w-8 min-w-8 border-l border-slate-200">م</th>
                                          <th className="text-center w-12 min-w-12 border-l border-slate-200">صورة</th>
                                          <th className="border-l border-slate-200">الصنف والبيان</th>
                                          <th className="text-center w-12 min-w-12 border-l border-slate-200">الطول</th>
                                          <th className="text-center w-12 min-w-12 border-l border-slate-200">العرض</th>
                                          <th className="text-center w-10 min-w-10 border-l border-slate-200">العدد</th>
                                          <th className="text-center w-12 min-w-12 border-l border-slate-200">الكمية</th>
                                          <th className="text-left w-16 min-w-16 border-l border-slate-200">السعر</th>
                                          <th className="text-left w-18 min-w-18">الإجمالي</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200">
                                        {row.items.map((it, iIdx) => (
                                          <tr key={iIdx} className="hover:bg-slate-50">
                                            <td className="text-center font-mono font-bold text-slate-700 border-l border-slate-200 py-1">{iIdx + 1}</td>
                                            <td className="text-center border-l border-slate-200 py-1">
                                              {it.imageThumbnail ? (
                                                <div className="flex items-center justify-center gap-1 flex-wrap max-w-[120px] mx-auto">
                                                  {parseThumbnails(it.imageThumbnail).map((imgStr, imgIdx) => (
                                                    <img
                                                      key={imgIdx}
                                                      src={imgStr}
                                                      alt={it.itemName}
                                                      className="w-10 h-10 rounded-md object-contain bg-white border border-slate-200"
                                                    />
                                                  ))}
                                                </div>
                                              ) : (
                                                <span className="text-slate-300 font-mono">-</span>
                                              )}
                                            </td>
                                            <td className="font-bold text-slate-900 border-l border-slate-200">
                                              <div>
                                                <span>{it.itemName}</span>
                                                {(it.notes || it.description) && (it.notes !== it.itemName) && (
                                                  <span className="text-slate-600 font-medium"> / {it.notes || it.description}</span>
                                                )}
                                                
                                              </div>
                                            </td>
                                            <td className="text-center font-mono text-slate-800 border-l border-slate-200">{it.length != null && it.length !== 0 ? it.length : '-'}</td>
                                            <td className="text-center font-mono text-slate-800 border-l border-slate-200">{it.width != null && it.width !== 0 ? it.width : '-'}</td>
                                            <td className="text-center font-mono font-bold text-slate-800 border-l border-slate-200">{it.count || 1}</td>
                                            <td className="text-center font-mono font-bold text-slate-900 border-l border-slate-200">{it.quantity}</td>
                                            <td className="text-left font-mono text-slate-800 border-l border-slate-200">{it.unitPrice.toFixed(2)}</td>
                                            <td className="text-left font-mono font-bold text-slate-900">{it.total.toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>

                                    {/* مصغرات صور الأصناف 7 بالسطر */}
                                    {showImageThumbnailsInStatement && row.items && row.items.some(it => 
                                      it.imageThumbnail || (it.attachments && it.attachments.some(a => a.data || a.type?.startsWith('image/')))
                                    ) && (
                                      <div className="bg-slate-50/70 p-2.5 border-t border-slate-200">
                                        <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center justify-between select-none">
                                          <div className="flex items-center gap-1.5 text-purple-900 font-bold">
                                            <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                                            <span>مصغرات صور الأصناف المرفقة بالحركة:</span>
                                          </div>
                                          <span className="text-[9.5px] text-slate-400 font-normal print:hidden">
                                            (انقر على أي صورة لتكبيرها والمعاينة)
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-7 gap-2.5 w-full print:grid-cols-7">
                                          {row.items.flatMap((it, itemIdx) => {
                                            const thumbs = parseThumbnails(it.imageThumbnail);
                                            const attImgs = (it.attachments || [])
                                              .filter(a => a.data || a.type?.startsWith('image/'))
                                              .map(a => a.data || '');
                                            const allImgs = Array.from(new Set([...thumbs, ...attImgs].filter(Boolean)));
                                            return allImgs.map(imgStr => ({
                                              imgStr,
                                              itemName: it.itemName,
                                              itemCode: it.itemCode,
                                              itemSeq: itemIdx + 1
                                            }));
                                          }).map((imgObj, idx) => (
                                            <div
                                              key={idx}
                                              onClick={() => setPreviewModalImage({ url: imgObj.imgStr, name: imgObj.itemName })}
                                              className="flex flex-col items-center bg-white border border-slate-200 hover:border-purple-500 hover:shadow-md rounded-lg p-1.5 shadow-2xs w-full cursor-pointer transition-all group"
                                              title={`معاينة وتكبير صورة "${imgObj.itemName}" (بند #${imgObj.itemSeq})`}
                                            >
                                              <div className="relative w-full aspect-square rounded-md overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-0.5">
                                                <span className="absolute top-0.5 right-0.5 bg-slate-900/80 text-white text-[8px] font-mono font-black px-1 rounded-xs z-10 print:bg-slate-800">
                                                  #{imgObj.itemSeq}
                                                </span>
                                                <img
                                                  src={imgObj.imgStr}
                                                  alt={imgObj.itemName}
                                                  className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                                  onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                  }}
                                                />
                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center print:hidden">
                                                  <Eye className="w-4 h-4 text-white" />
                                                </div>
                                              </div>
                                              <div className="text-[8px] sm:text-[8.5px] text-slate-900 font-bold text-center leading-none truncate w-full mt-1 group-hover:text-purple-700 px-0.5" title={`بند #${imgObj.itemSeq}: ${imgObj.itemName}`}>
                                                #{imgObj.itemSeq} {imgObj.itemName}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                   </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                      <td colSpan={3} className="text-left font-sans">الإجمالي العام للحركات بالفترة:</td>
                      <td className="text-left font-mono text-purple-800 font-black whitespace-nowrap">
                        {employeeStatement.totalEntitlements.toFixed(2)}
                      </td>
                      <td className="text-left font-mono text-rose-800 font-black whitespace-nowrap">
                        {employeeStatement.totalPaid.toFixed(2)}
                      </td>
                      <td className="text-left font-mono text-slate-900 font-black bg-slate-200/80 whitespace-nowrap">
                        {employeeStatement.closingBalance.toFixed(2)} {settings.currency}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ملخص نهاية الكشف بعد الجدول */}
              <div className="mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 shadow-2xs print:border-slate-300">
                <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                  <div className="bg-white border border-slate-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs">
                    <span className="font-bold text-slate-700 text-[10px] whitespace-nowrap">رصيد سابق:</span>
                    <div className="font-black font-mono text-slate-900 text-[11px] flex items-center gap-1 whitespace-nowrap">
                      <span>{employeeStatement.openingBalance.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold text-slate-500">{settings.currency}</span>
                    </div>
                  </div>
                  <div className="bg-white border border-purple-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs">
                    <span className="font-bold text-purple-900 text-[10px] whitespace-nowrap">إجمالي المستحقات:</span>
                    <div className="font-black font-mono text-purple-700 text-[11px] flex items-center gap-1 whitespace-nowrap">
                      <span>{employeeStatement.totalEntitlements.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                    </div>
                  </div>
                  <div className="bg-white border border-rose-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs">
                    <span className="font-bold text-rose-900 text-[10px] whitespace-nowrap">إجمالي المنصرف والسلف:</span>
                    <div className="font-black font-mono text-rose-700 text-[11px] flex items-center gap-1 whitespace-nowrap">
                      <span>{employeeStatement.totalPaid.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                    </div>
                  </div>
                  <div className={`bg-white border rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs ${employeeStatement.closingBalance > 0 ? 'border-purple-400 bg-purple-50/20' : employeeStatement.closingBalance < 0 ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'}`}>
                    <span className="font-bold text-slate-900 text-[10px] whitespace-nowrap">
                      الإجمالي:
                    </span>
                    <div className={`font-black font-mono text-[11px] flex items-center gap-1 whitespace-nowrap ${employeeStatement.closingBalance > 0 ? 'text-purple-700' : employeeStatement.closingBalance < 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                      <span>{Math.abs(employeeStatement.closingBalance).toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                      <span className="text-[9.5px] font-sans font-bold">
                        ({employeeStatement.closingBalance > 0 ? 'دائن له' : employeeStatement.closingBalance < 0 ? 'مدين عليه' : 'متزن'})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tafqeet & Closing Balance */}
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <div className="flex items-center justify-between text-[10.5px] mb-0.5">
                    <span className="font-bold text-slate-700">المبلغ كتابة وتفقيطاً:</span>
                    <span className="font-bold text-slate-900 font-mono text-[11px]">
                      صافي رصيد الموظف ({employeeStatement.closingBalance > 0 ? 'دائن له' : employeeStatement.closingBalance < 0 ? 'مدين عليه' : 'متزن'}): {Math.abs(employeeStatement.closingBalance).toFixed(2)} {settings.currency}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-semibold text-slate-800 bg-slate-50 p-1 rounded border border-slate-200 font-arabic">
                    {empTafqeet}
                  </div>
                </div>
              </div>

              {/* Official Signatures Section */}
              <div className="pt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-[10px] mt-4">
                <div className="space-y-4 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">إعداد وتدقيق المحاسب</span>
                  <div className="border-b border-dashed border-slate-400 w-28 mx-auto mt-6"></div>
                  <span className="text-[10px] text-slate-400 block font-mono">التوقيع والتاريخ</span>
                </div>

                <div className="space-y-4 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">توقيع واستلام الموظف</span>
                  <div className="border-b border-dashed border-slate-400 w-28 mx-auto mt-6"></div>
                  <span className="text-[10px] text-slate-400 block font-mono">{currentEmployee?.name}</span>
                </div>

                <div className="space-y-2 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">اعتماد الإدارة / التوقيع والختم</span>
                  <div className="min-h-[4.2cm] flex items-center justify-center relative">
                    {settings.stampUrl ? (
                      <div className="relative flex items-center justify-center">
                        <OfficialStamp size="3.5cm" />
                        {settings.signatureUrl && (
                          <img
                            src={settings.signatureUrl}
                            alt="Signature"
                            className="absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none"
                          />
                        )}
                      </div>
                    ) : settings.signatureUrl ? (
                      <img
                        src={settings.signatureUrl}
                        alt="Signature"
                        className="max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90"
                      />
                    ) : (
                      <div className="border-b border-dashed border-slate-400 w-36 mx-auto mt-10"></div>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 block font-mono mt-2">الختم والتوقيع المعتمد</span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Official Notice */}
          <div className="text-center text-[10px] text-slate-400 pt-3 border-t border-slate-100">
            تم استخراج كشف الحساب المالي آلياً عبر نظام إدارة الحسابات والمطابع - يرجى مراجعة الإدارة المالية في حال وجود أي استفسار أو تدقيق.
          </div>
        </div>

        {/* Image Preview Lightbox Modal */}
        {previewModalImage && (
          <div
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 print:hidden"
            onClick={() => setPreviewModalImage(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 animate-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-sm truncate">{previewModalImage.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewModalImage(null)}
                  className="p-1 rounded-lg hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-hidden">
                <img
                  src={previewModalImage.url}
                  alt={previewModalImage.name}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              </div>
              <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">صورة مصغرة لبند الفاتورة في كشف الحساب</span>
                <button
                  type="button"
                  onClick={() => setPreviewModalImage(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg cursor-pointer transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
