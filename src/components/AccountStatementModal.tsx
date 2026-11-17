import React, { useState, useMemo, useEffect, useRef } from 'react';
import {accountStatementPdfFilename,downloadAccountStatementPdf} from '../utils/accountStatementPdf';
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
import { hasVisibleInvoiceDimensions, displayDimension } from '../utils/invoiceDimensions';
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
import { UnifiedPartyStatementDocument } from './UnifiedPartyStatementDocument';
import { UnifiedEmployeeStatementDocument } from './UnifiedEmployeeStatementDocument';
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
    salesReturns,
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
  const [isDownloadingPdf,setIsDownloadingPdf] = useState(false);
  const pdfInProgressRef=useRef(false);
  const statementSurfaceRef=useRef<HTMLDivElement|null>(null);

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
      salesReturns,
      vouchers,
      printOrders,
      journalEntries,
      debtClearings
    });
  }, [statementMode, currentParty, fromDate, toDate, invoices, purchases, purchaseReturns, salesReturns, vouchers, printOrders, journalEntries, debtClearings]);

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

  const handleSavePdf = async () => {
    if(pdfInProgressRef.current||!statementSurfaceRef.current) return;
    if(statementMode==='party'&&!partyStatement) return;
    if(statementMode==='employee'&&!employeeStatement) return;
    const primaryName = statementMode==='employee'
      ? (currentEmployee?.name||'موظف')
      : (parentParty?.name||currentParty?.parentCustomerName||currentParty?.name||'عميل');
    const secondaryName = statementMode==='party' &&
      (parentParty||currentParty?.parentCustomerName)
      ? currentParty?.name : undefined;
    const filename=accountStatementPdfFilename({
      primaryName,secondaryName,fromDate,toDate,
      kind:statementMode==='employee'?'employee':'party'
    });
    pdfInProgressRef.current=true;
    setIsDownloadingPdf(true);
    try{
      await downloadAccountStatementPdf(statementSurfaceRef.current,filename);
    }catch(error){
      console.error('Detailed statement PDF export failed',error);
      alert('تعذّر حفظ كشف الحساب بصيغة PDF. لم تتغير بيانات الكشف أو الفواتير. يرجى إعادة المحاولة أو استخدام زر طباعة A4.');
    }finally{
      pdfInProgressRef.current=false;
      setIsDownloadingPdf(false);
    }
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
              type="button"
              onClick={() => {void handleSavePdf();}}
              disabled={isDownloadingPdf || (!partyStatement && !employeeStatement)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
              title="تنزيل كشف الحساب مباشرة PDF مع الاسم والفترة المحددين دون فتح نافذة الطباعة"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPdf?'جاري تجهيز PDF...':'حفظ PDF'}</span>
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
        <div ref={statementSurfaceRef} className="p-4 sm:p-6 overflow-y-auto space-y-4 print:p-0 print:overflow-visible report-a4-container">
          
          {/* ========================================================= */}
          {/* SECTION 1: PARTY FINANCIAL STATEMENT (CUSTOMER / SUPPLIER)*/}
          {/* ========================================================= */}
          {statementMode === 'party' && partyStatement && (
            <UnifiedPartyStatementDocument
              partyStatement={partyStatement}
              isCustomer={isCustomer}
              settings={settings}
              clientDisplayName={clientDisplayName}
              fromDate={fromDate}
              toDate={toDate}
              showItemDetails={showItemDetails}
              showImageThumbnailsInStatement={showImageThumbnailsInStatement}
              filterType={filterType}
              setPreviewModalImage={setPreviewModalImage}
            />
          )}

          {/* ========================================================= */}
          {/* SECTION 2: EMPLOYEE FINANCIAL STATEMENT                   */}
          {/* ========================================================= */}
          {statementMode === 'employee' && employeeStatement && (
            <UnifiedEmployeeStatementDocument
              statement={employeeStatement}
              settings={settings}
              fromDate={fromDate}
              toDate={toDate}
              filterType={filterType}
              showItemDetails={showItemDetails}
            />
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
