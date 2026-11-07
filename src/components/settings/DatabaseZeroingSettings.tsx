import React, { useState, useMemo } from 'react';
import { DateInput } from '../../components/common/DateInput';
import { useAccounting } from '../../context/AccountingContext';
import { DatabaseZeroingOptions, ZeroingExecutionResult } from '../../types';
import { initialParties, initialInventory, initialTreasuries } from '../../data/initialData';
import { DEFAULT_WAREHOUSES } from '../../data/defaultCompanyBranchUserData';
import {
  ShieldAlert,
  ShieldCheck,
  Download,
  Trash2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Boxes,
  Users,
  Wallet,
  Receipt,
  RotateCcw,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Printer,
  Sparkles,
  Package,
  UserCheck,
  BadgeDollarSign,
  ArrowUpDown,
  FileText,
  Warehouse as WarehouseIcon,
  RefreshCw
} from 'lucide-react';
import { DeleteAllSalesInvoicesModal } from '../modals/DeleteAllSalesInvoicesModal';

export const DatabaseZeroingSettings: React.FC = () => {
  const {
    currentUser,
    lastBackupInfo,
    exportDataJSON,
    performDatabaseZeroing,
    forceSyncNow,
    invoices,
    purchases,
    salesReturns,
    purchaseReturns,
    vouchers,
    journalEntries,
    printOrders,
    stockMovements,
    warehouseOperations,
    debtClearings,
    expenses,
    employees,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    payrollSheets,
    parties,
    inventory,
    warehouses,
    treasuries,
    accounts
  } = useAccounting();

  // 1. فحص الصلاحية: هل المستخدم مدير نظام؟
  const isSystemAdmin =
    currentUser?.roleId === 'role-admin' ||
    currentUser?.roleName === 'مدير النظام' ||
    currentUser?.username === 'admin';

  // 2. إعدادات التاريخ والنطاق
  const todayStr = new Date().toISOString().split('T')[0];
  const [cutoffDate, setCutoffDate] = useState<string>(todayStr);
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [scope, setScope] = useState<'up_to_date' | 'from_date' | 'date_range' | 'all'>('up_to_date');

  // 3. خيارات التصفير
  const [options, setOptions] = useState<DatabaseZeroingOptions>({
    cutoffDate: todayStr,
    fromDate: todayStr,
    scope: 'up_to_date',
    // 1. الموظفون والرواتب بالكامل
    resetEmployees: true,
    resetPayroll: true,
    resetEmployeeAdvances: true,
    resetEmployeeDeductions: true,
    resetEmployeeIncentives: true,
    // 2. الأصناف والمخزون وحركات الصنف
    zeroInventoryStock: true,
    resetManualInventoryItems: true,
    resetStockMovements: true,
    resetWarehouseOperations: true,
    resetManualWarehouses: false,
    // 3. العمليات والفواتير
    resetInvoices: true,
    resetPurchases: true,
    resetSalesReturns: true,
    resetPurchaseReturns: true,
    resetVouchers: true,
    resetJournalEntries: true,
    resetPrintOrders: true,
    resetDebtClearings: true,
    resetExpenses: true,
    // 4. الأطراف والعملاء والموردين
    resetManualParties: true,
    zeroPartyBalances: true,
    // 5. الصناديق والخزنات
    zeroTreasuryBalances: true,
    resetManualTreasuries: false,
    // 6. الحسابات
    zeroAccountBalances: true
  });

  // مزامنة التاريخ والنطاق في الخيارات
  React.useEffect(() => {
    setOptions(prev => ({
      ...prev,
      cutoffDate,
      fromDate,
      scope
    }));
  }, [cutoffDate, fromDate, scope]);

  // كلمة التأكيد
  const [confirmInput, setConfirmInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ZeroingExecutionResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isDeleteAllSalesModalOpen, setIsDeleteAllSalesModalOpen] = useState(false);

  // حالة النسخ الاحتياطي المحققة محلياً في هذه الجلسة
  const [sessionBackupCompleted, setSessionBackupCompleted] = useState<boolean>(() => !!lastBackupInfo);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleRunBackup = async () => {
    setIsExporting(true);
    try {
      await exportDataJSON();
      setSessionBackupCompleted(true);
    } finally {
      setIsExporting(false);
    }
  };

  // دوال الحساب الحية للسجلات المتأثرة
  const isBeforeCutoff = (dateStr?: string) => {
    if (scope === 'all') return true;
    if (!dateStr) return true;
    const clean = dateStr.split('T')[0];
    if (scope === 'from_date') {
      return clean >= fromDate;
    }
    if (scope === 'date_range') {
      return clean >= fromDate && clean <= cutoffDate;
    }
    return clean <= cutoffDate;
  };

  const initialPartiesSet = useMemo(() => new Set(initialParties.map(p => p.id)), []);
  const initialInvSet = useMemo(() => new Set(initialInventory.map(i => i.id)), []);
  const defaultWhSet = useMemo(() => new Set(DEFAULT_WAREHOUSES.map(w => w.id)), []);
  const initialTreasurySet = useMemo(() => new Set(initialTreasuries.map(t => t.id)), []);

  const counts = useMemo(() => {
    const invCount = invoices.filter(i => isBeforeCutoff(i.date)).length;
    const purCount = purchases.filter(p => isBeforeCutoff(p.date)).length;
    const srCount = salesReturns.filter(r => isBeforeCutoff(r.date)).length;
    const prCount = purchaseReturns.filter(r => isBeforeCutoff(r.date)).length;
    const vchCount = vouchers.filter(v => isBeforeCutoff(v.date)).length;
    const jeCount = journalEntries.filter(j => isBeforeCutoff(j.date)).length;
    const poCount = printOrders.filter(o => isBeforeCutoff(o.createdAt || o.deliveryDate)).length;
    const dcCount = (debtClearings || []).filter(d => isBeforeCutoff(d.date || d.createdAt)).length;
    const expCount = (expenses || []).filter(e => isBeforeCutoff(e.date || e.createdAt)).length;

    // الأصناف وحركات المخزون والعمليات
    const smCount = stockMovements.filter(m => isBeforeCutoff(m.date)).length;
    const woCount = warehouseOperations.filter(w => isBeforeCutoff(w.date)).length;
    const totalItems = inventory.length;
    const manualItems = inventory.filter(i => isBeforeCutoff(i.lastMovementDate || (i as any).createdAt)).length;
    const itemsWithStock = inventory.filter(i => i.stockQuantity !== 0).length;
    const manualWhs = warehouses.filter(w => !defaultWhSet.has(w.id) && isBeforeCutoff(w.createdAt)).length;

    // الموظفون والرواتب والسلف
    const empCount = employees.filter(e => isBeforeCutoff(e.joinDate || e.createdAt)).length;
    const psCount = payrollSheets.filter(p => isBeforeCutoff(p.createdAt)).length;
    const advCount = employeeAdvances.filter(a => isBeforeCutoff(a.date)).length;
    const dedCount = employeeDeductions.filter(d => isBeforeCutoff(d.date)).length;
    const incCount = employeeIncentives.filter(i => isBeforeCutoff(i.date)).length;

    // العملاء والصناديق والحسابات
    const manualParties = parties.filter(p => !initialPartiesSet.has(p.id) && isBeforeCutoff(p.openingBalanceDate || (p as any).createdAt)).length;
    const partiesWithBalance = parties.filter(p => p.balance !== 0).length;
    const manualTreas = treasuries.filter(t => !initialTreasurySet.has(t.id) && isBeforeCutoff(t.createdAt)).length;
    const treasWithBal = treasuries.filter(t => t.balance !== 0).length;

    return {
      invCount,
      purCount,
      srCount,
      prCount,
      vchCount,
      jeCount,
      poCount,
      dcCount,
      expCount,
      smCount,
      woCount,
      totalItems,
      manualItems,
      itemsWithStock,
      manualWhs,
      empCount,
      psCount,
      advCount,
      dedCount,
      incCount,
      totalPayrollOperations: psCount + advCount + dedCount + incCount,
      manualParties,
      partiesWithBalance,
      manualTreas,
      treasWithBal,
      totalAccounts: accounts.length
    };
  }, [
    invoices, purchases, salesReturns, purchaseReturns, vouchers, journalEntries,
    printOrders, debtClearings, expenses, stockMovements, warehouseOperations, inventory,
    warehouses, employees, payrollSheets, employeeAdvances, employeeDeductions,
    employeeIncentives, parties, treasuries, accounts, cutoffDate, fromDate, scope,
    initialPartiesSet, defaultWhSet, initialTreasurySet
  ]);

  // إجمالي السجلات التي سيتم حذفها أو تصفيرها
  const totalSelectedItemsToZero = useMemo(() => {
    let count = 0;
    if (options.resetInvoices) count += counts.invCount;
    if (options.resetPurchases) count += counts.purCount;
    if (options.resetSalesReturns) count += counts.srCount;
    if (options.resetPurchaseReturns) count += counts.prCount;
    if (options.resetVouchers) count += counts.vchCount;
    if (options.resetJournalEntries) count += counts.jeCount;
    if (options.resetPrintOrders) count += counts.poCount;
    if (options.resetDebtClearings !== false) count += counts.dcCount;
    if (options.resetExpenses !== false) count += counts.expCount;
    // مخزون وأصناف
    if (options.resetStockMovements) count += counts.smCount;
    if (options.resetWarehouseOperations) count += counts.woCount;
    if (options.resetManualInventoryItems) count += counts.manualItems;
    if (options.resetManualWarehouses) count += counts.manualWhs;
    // موظفون ورواتب
    if (options.resetEmployees) count += counts.empCount;
    if (options.resetPayroll) count += counts.totalPayrollOperations;
    // عملاء وخزائن
    if (options.resetManualParties) count += counts.manualParties;
    if (options.resetManualTreasuries) count += counts.manualTreas;
    return count;
  }, [options, counts]);

  // أزرار الاختيار السريع
  const handleSelectAll = () => {
    setOptions(prev => ({
      ...prev,
      // موظفون
      resetEmployees: true,
      resetPayroll: true,
      resetEmployeeAdvances: true,
      resetEmployeeDeductions: true,
      resetEmployeeIncentives: true,
      // أصناف ومخزون
      zeroInventoryStock: true,
      resetManualInventoryItems: true,
      resetStockMovements: true,
      resetWarehouseOperations: true,
      resetManualWarehouses: true,
      // عمليات
      resetInvoices: true,
      resetPurchases: true,
      resetSalesReturns: true,
      resetPurchaseReturns: true,
      resetVouchers: true,
      resetJournalEntries: true,
      resetPrintOrders: true,
      resetDebtClearings: true,
      resetExpenses: true,
      // أطراف
      resetManualParties: true,
      zeroPartyBalances: true,
      // خزنات وحسابات
      zeroTreasuryBalances: true,
      resetManualTreasuries: true,
      zeroAccountBalances: true
    }));
  };

  const handleSelectRecommendedLive = () => {
    // التوصية المثالية للاعتماد والبدء الفعلي:
    // تصفير كل الحركات والعمليات + تصفير كميات المخزون + تصفير أرصدة الذمم والديون والصناديق
    // مع الإبقاء على الدليل والأصناف الأساسية وأسماء الموظفين للعمل الفوري
    setOptions(prev => ({
      ...prev,
      resetEmployees: false, // الإبقاء على أسماء الموظفين
      resetPayroll: true,    // تصفير مسيرات وسلف الرواتب السابقة
      resetEmployeeAdvances: true,
      resetEmployeeDeductions: true,
      resetEmployeeIncentives: true,
      resetInvoices: true,
      resetPurchases: true,
      resetSalesReturns: true,
      resetPurchaseReturns: true,
      resetVouchers: true,
      resetJournalEntries: true,
      resetPrintOrders: true,
      resetDebtClearings: true,
      resetExpenses: true,
      resetStockMovements: true,      // تصفير كافة حركات الصرف والقبض والجرد
      resetWarehouseOperations: true,// تصفير أذونات المستودعات
      resetManualParties: false,     // الإبقاء على العملاء
      zeroPartyBalances: true,       // تصفير أرصدة العملاء
      zeroInventoryStock: true,      // تصفير كميات المخزون لبدء جرد فعلي (0)
      resetManualInventoryItems: false, // الإبقاء على كرتات الأصناف
      resetManualWarehouses: false,
      zeroTreasuryBalances: true,    // تصفير رصيد الصندوق
      resetManualTreasuries: false,
      zeroAccountBalances: true
    }));
  };

  const handleDeselectAll = () => {
    setOptions(prev => ({
      ...prev,
      resetEmployees: false,
      resetPayroll: false,
      resetEmployeeAdvances: false,
      resetEmployeeDeductions: false,
      resetEmployeeIncentives: false,
      resetInvoices: false,
      resetPurchases: false,
      resetSalesReturns: false,
      resetPurchaseReturns: false,
      resetVouchers: false,
      resetJournalEntries: false,
      resetPrintOrders: false,
      resetDebtClearings: false,
      resetExpenses: false,
      resetStockMovements: false,
      resetWarehouseOperations: false,
      resetManualParties: false,
      zeroPartyBalances: false,
      zeroInventoryStock: false,
      resetManualInventoryItems: false,
      resetManualWarehouses: false,
      zeroTreasuryBalances: false,
      resetManualTreasuries: false,
      zeroAccountBalances: false
    }));
  };

  const handleSelectOnlySalesInvoices = () => {
    setOptions(prev => ({
      ...prev,
      resetEmployees: false,
      resetPayroll: false,
      resetEmployeeAdvances: false,
      resetEmployeeDeductions: false,
      resetEmployeeIncentives: false,
      resetInvoices: true,
      resetPurchases: false,
      resetSalesReturns: false,
      resetPurchaseReturns: false,
      resetVouchers: true,
      resetJournalEntries: true,
      resetPrintOrders: false,
      resetDebtClearings: false,
      resetExpenses: false,
      resetStockMovements: true,
      resetWarehouseOperations: false,
      resetManualParties: false,
      zeroPartyBalances: false,
      zeroInventoryStock: false,
      resetManualInventoryItems: false,
      resetManualWarehouses: false,
      zeroTreasuryBalances: false,
      resetManualTreasuries: false,
      zeroAccountBalances: false
    }));
  };

  // شروط السماح بالتصفير
  const isConfirmInputValid = confirmInput.trim() === 'تصفير' || confirmInput.trim().toUpperCase() === 'RESET';
  const hasSelectedAny =
    options.resetEmployees || options.resetPayroll || options.resetInvoices || options.resetPurchases ||
    options.resetSalesReturns || options.resetPurchaseReturns || options.resetVouchers || options.resetJournalEntries ||
    options.resetPrintOrders || options.resetStockMovements || options.resetWarehouseOperations ||
    options.resetDebtClearings || options.resetExpenses ||
    options.resetManualParties || options.zeroPartyBalances || options.zeroInventoryStock ||
    options.resetManualInventoryItems || options.resetManualWarehouses || options.zeroTreasuryBalances ||
    options.resetManualTreasuries || options.zeroAccountBalances;

  const canExecute = isSystemAdmin && sessionBackupCompleted && isConfirmInputValid && hasSelectedAny && !isExecuting;

  const handleExecuteZeroing = async () => {
    if (!canExecute) return;

    const confirmMsg =
      `تحذير نهائي!\nهل أنت متأكد تماماً من تصفير قاعدة البيانات ` +
      (scope === 'all' ? 'لكافة التواريخ' : scope === 'up_to_date' ? `حتى تاريخ (${cutoffDate})` : scope === 'from_date' ? `بدءاً من تاريخ (${fromDate})` : `بين تاريخي (${fromDate} و ${cutoffDate})`) +
      `؟\nسيتم حذف ${totalSelectedItemsToZero} حركة وسجل وتصفير الأرصدة المحددة بشكل نهائي لا رجعة فيه.\n` +
      `هل ترغب بالاستمرار؟`;

    if (!window.confirm(confirmMsg)) return;

    setIsExecuting(true);
    try {
      const res = performDatabaseZeroing(options);
      await new Promise(resolve => setTimeout(resolve, 800)); // wait for react state to settle
      await forceSyncNow(); // ensure the deletions are committed to firebase before showing success
      setExecutionResult(res);
      setShowResultModal(true);
      setConfirmInput('');
    } catch (err: any) {
      alert('حدث خطأ أثناء تنفيذ عملية التصفير: ' + (err.message || 'خطأ غير متوقع'));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-4 text-xs max-w-5xl mx-auto">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border border-rose-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center shrink-0 shadow-inner">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                تصفير قاعدة البيانات وبدء التشغيل الفعلي
              </h2>
              <span className="px-2.5 py-0.5 bg-rose-500/30 border border-rose-400/50 text-rose-200 text-[11px] font-bold rounded-full">
                خاص بمدير النظام فقط
              </span>
            </div>
            <p className="text-slate-300 text-xs mt-1 leading-relaxed">
              خاصية معتمدة وشاملة لتصفير كافة العمليات التجريبية، فواتير المبيعات، كرتات وحركات الأصناف والمخزون، وبيانات ومستحقات الموظفين لبدء التشغيل الإنتاجي النظيف.
            </p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="shrink-0 w-full md:w-auto">
          {isSystemAdmin ? (
            <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/50 px-3.5 py-2 rounded-xl text-emerald-300 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[11px]">مصرّح: مدير النظام</div>
                <div className="text-[10px] text-emerald-400/80 font-mono">{currentUser?.fullName || currentUser?.username}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-950/90 border border-rose-500/60 px-3.5 py-2 rounded-xl text-rose-300 font-bold">
              <Lock className="w-4 h-4 text-rose-400" />
              <div>
                <div className="text-[11px]">محظور: ليس مدير نظام</div>
                <div className="text-[10px] text-rose-400/80">مقيد بمدير النظام العام فقط</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Non-admin blocking message */}
      {!isSystemAdmin && (
        <div className="bg-rose-50 border-2 border-rose-300 p-4 rounded-xl text-rose-900 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-sm">تم تقييد الوصول لهذه الشاشة الحساسة</h3>
            <p className="text-xs text-rose-800 leading-relaxed">
              عملية تصفير قاعدة البيانات مقيدة بصلاحية <strong>مدير النظام (Admin)</strong> حصراً، نظراً لأنها تقوم بحذف السجلات المالية والمخزنية وتصفير الأرصدة. يرجى تسجيل الدخول بحساب مدير النظام لتتمكن من استخدام هذه الميزة.
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Mandatory Backup */}
      <div className={`p-4 rounded-xl border transition-all ${
        sessionBackupCompleted
          ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
          : 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold shrink-0 ${
              sessionBackupCompleted ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {sessionBackupCompleted ? <CheckCircle2 className="w-5 h-5" /> : '1'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">
                  الخطوة الأولى: إجراء نسخة احتياطية كاملة (إلزامي قبل التصفير)
                </h3>
                {sessionBackupCompleted && (
                  <span className="bg-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    مكتمل وجاهز
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                وفقاً لتعليمات الأمان، يمنع النظام تصفير البيانات إلا بعد تنزيل نسخة احتياطية كاملة وحفظها على جهازك للرجوع إليها في أي وقت.
              </p>
              {lastBackupInfo && (
                <div className="text-[11px] font-mono text-emerald-700 mt-1 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>آخر نسخة تم تنزيلها: {new Date(lastBackupInfo.timestamp).toLocaleString('ar-SA')} ({lastBackupInfo.filename})</span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunBackup}
            disabled={!isSystemAdmin || isExporting}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer text-xs shrink-0 self-stretch sm:self-auto justify-center"
          >
            <Download className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
            <span>{isExporting ? 'جاري السحب المباشر 100% من فير بيس...' : 'تنزيل نسخة احتياطية كاملة الآن (JSON)'}</span>
          </button>
        </div>
      </div>

      {/* Step 2: Cutoff Date & Scope Selection */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
            2
          </div>
          <h3 className="font-bold text-xs text-slate-900">
            الخطوة الثانية: تحديد تاريخ التصفير ونطاق السجلات
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* نطاق التصفير */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-slate-700 font-bold text-[11px]">
              نطاق سريان التصفير:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <label className={`p-2.5 rounded-lg border cursor-pointer flex items-center gap-2 transition-all ${
                scope === 'up_to_date'
                  ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}>
                <input
                  type="radio"
                  name="zeroScope"
                  checked={scope === 'up_to_date'}
                  onChange={() => setScope('up_to_date')}
                  disabled={!isSystemAdmin}
                  className="text-blue-600 cursor-pointer shrink-0"
                />
                <span className="text-[11px] leading-tight">حتى التاريخ المحدد</span>
              </label>

              <label className={`p-2.5 rounded-lg border cursor-pointer flex items-center gap-2 transition-all ${
                scope === 'from_date'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}>
                <input
                  type="radio"
                  name="zeroScope"
                  checked={scope === 'from_date'}
                  onChange={() => setScope('from_date')}
                  disabled={!isSystemAdmin}
                  className="text-amber-600 cursor-pointer shrink-0"
                />
                <span className="text-[11px] leading-tight">بدءاً من التاريخ</span>
              </label>

              <label className={`p-2.5 rounded-lg border cursor-pointer flex items-center gap-2 transition-all ${
                scope === 'date_range'
                  ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}>
                <input
                  type="radio"
                  name="zeroScope"
                  checked={scope === 'date_range'}
                  onChange={() => setScope('date_range')}
                  disabled={!isSystemAdmin}
                  className="text-purple-600 cursor-pointer shrink-0"
                />
                <span className="text-[11px] leading-tight">بين تاريخين</span>
              </label>

              <label className={`p-2.5 rounded-lg border cursor-pointer flex items-center gap-2 transition-all ${
                scope === 'all'
                  ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}>
                <input
                  type="radio"
                  name="zeroScope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                  disabled={!isSystemAdmin}
                  className="text-rose-600 cursor-pointer shrink-0"
                />
                <span className="text-[11px] leading-tight">تصفير شامل لكافة التواريخ</span>
              </label>
            </div>
            <p className="text-[10px] text-slate-500 font-light pt-1">
              {scope === 'up_to_date' && 'سيتم تصفير أي عمليات تم إدخالها قبل أو في التاريخ المحدد (يُبقي على ما بعده).'}
              {scope === 'from_date' && 'سيتم تصفير أي عمليات تم إدخالها في أو بعد التاريخ المحدد (يُبقي على ما قبله).'}
              {scope === 'date_range' && 'سيتم تصفير أي عمليات تمت بين التاريخين المحددين فقط.'}
              {scope === 'all' && 'سيتم تصفير كل السجلات التجريبية والعمليات دون استثناء.'}
            </p>
          </div>

          {/* حقل اختيار التاريخ من */}
          {(scope === 'from_date' || scope === 'date_range') && (
            <div className="space-y-1.5">
              <label className="block text-slate-700 font-bold text-[11px] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>بدءاً من تاريخ:</span>
              </label>
              <DateInput value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                disabled={!isSystemAdmin}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-amber-500 focus:outline-hidden disabled:opacity-50"
              />
            </div>
          )}

          {/* حقل اختيار التاريخ إلى */}
          {(scope === 'up_to_date' || scope === 'date_range') && (
            <div className="space-y-1.5">
              <label className="block text-slate-700 font-bold text-[11px] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>حتى تاريخ (شاملاً):</span>
              </label>
              <DateInput value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)}
                disabled={!isSystemAdmin}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-hidden disabled:opacity-50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Comprehensive Zeroing Sections (Employees, Inventory & Stock Cards, Invoices, Accounts) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <h3 className="font-bold text-xs text-rose-900">
                الخطوة الثالثة: تحديد بنود التصفير الشاملة (الموظفين، الأصناف والمخزون، الفواتير، الحسابات)
              </h3>
              <p className="text-[10px] text-rose-700">تحكم دقيق في كل ما يخص الموظفين، كرتات وحركات الأصناف، وكافة العمليات المرتبطة</p>
            </div>
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold text-[11px] transition-colors cursor-pointer"
            >
              تحديد الكل
            </button>
            <button
              type="button"
              onClick={handleSelectRecommendedLive}
              className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-md font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>البدء الفعلي (الموصى به)</span>
            </button>
            <button
              type="button"
              onClick={handleSelectOnlySalesInvoices}
              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-md font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3 text-rose-600" />
              <span>فواتير المبيعات وملحقاتها فقط</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-md text-[11px] transition-colors cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>

        {/* بطاقة الحذف الفوري المباشر لفواتير المبيعات مع استرجاع المخزون */}
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-xs">
                حذف سريع لكافة فواتير المبيعات ({invoices.length} فاتورة) مع استرجاع المخزون
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                تصفير كامل لسجل المبيعات، إعادة كميات الأصناف المباعة لرصيد المخزن تلقائياً، وحذف سندات القبض الناتجة عنها.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDeleteAllSalesModalOpen(true)}
            disabled={!isSystemAdmin}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs transition shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-rose-200" />
            <span>حذف فواتير المبيعات الآن</span>
          </button>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          
          {/* SECTION 1: الموظفون والرواتب ومستحقاتهم بالكامل */}
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-blue-200/70">
              <div className="flex items-center gap-2 font-bold text-xs text-blue-950">
                <Users className="w-4 h-4 text-blue-600" />
                <span>1. الموظفون والرواتب ومستحقاتهم بالكامل</span>
              </div>
              <span className="bg-blue-200/80 text-blue-900 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {counts.empCount} موظف | {counts.totalPayrollOperations} حركة راتب وسلف
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              {/* Reset Employees */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-blue-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetEmployees}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetEmployees: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-blue-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">حذف أسماء وسجلات الموظفين بالكامل</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف بطاقات الموظفين المسجلين ({counts.empCount} موظف مسجل) للبدء بإدخال كادر عمل جديد.
                  </div>
                </div>
              </label>

              {/* Reset Payroll Sheets */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-blue-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetPayroll}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetPayroll: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-blue-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">تصفير مسيرات وكشوفات الرواتب السابقة</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف كافة مسيرات الرواتب الشهرية والأسبوعية واليومية ({counts.psCount} مسير راتب).
                  </div>
                </div>
              </label>

              {/* Advances, Deductions & Incentives */}
              <div className="pr-6 space-y-1.5 pt-0.5 border-t border-blue-200/40 text-[10px] text-slate-600">
                <div className="flex items-center justify-between">
                  <span>• سلف الموظفين والقروض المسجلة:</span>
                  <span className="font-mono font-bold text-blue-800">{counts.advCount} سلفة</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>• الخصومات والجزاءات المطبقة:</span>
                  <span className="font-mono font-bold text-blue-800">{counts.dedCount} خصم</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>• المكافآت والحوافز الممنوحة:</span>
                  <span className="font-mono font-bold text-blue-800">{counts.incCount} مكافأة</span>
                </div>
                <div className="text-slate-500 italic pt-0.5">
                  (تتصفر تلقائياً مع كشوفات حسابات الموظفين عند تفعيل تصفير الرواتب)
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: الأصناف والكرتات المخزنية وحركات الصنف */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-amber-200/70">
              <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                <Boxes className="w-4 h-4 text-amber-600" />
                <span>2. الأصناف والكرتات المخزنية وكل ما يتعلق بالصنف</span>
              </div>
              <span className="bg-amber-200/80 text-amber-900 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {counts.totalItems} صنف | {counts.smCount + counts.woCount} حركة مخزنية
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              {/* Zero Inventory Stocks */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-amber-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.zeroInventoryStock}
                  onChange={(e) => setOptions(prev => ({ ...prev, zeroInventoryStock: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-amber-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">تصفير كميات وأرصدة المخزون بالكامل (0.00)</div>
                  <div className="text-slate-500 text-[10px]">
                    تصفير كميات كافة الأصناف في جميع المستودعات لتصبح (0) لبدء جرد فعلي افتتاحي.
                  </div>
                </div>
              </label>

              {/* Reset Manual Inventory Items */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-amber-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetManualInventoryItems}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetManualInventoryItems: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-amber-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">حذف كرتات الأصناف والمنتجات بالكامل</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف بطاقات الأصناف والخامات التجريبية ({counts.manualItems} صنف) لإعادة إدخال دليل جديد.
                  </div>
                </div>
              </label>

              {/* Stock Movements (Issue, Receipt, Adjust, Sale, Exchange) */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-amber-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetStockMovements}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetStockMovements: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-amber-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">حذف كافة حركات الصنف والكرتات المخزنية</div>
                  <div className="text-slate-500 text-[10px] space-y-0.5">
                    <div>تشمل: صرف، قبض/توريد، جرد وتعديل، بيع، شراء، تبديل وتغيير، ومناقلات بين المستودعات ({counts.smCount} حركة).</div>
                  </div>
                </div>
              </label>

              {/* Warehouse operations */}
              <div className="pr-6 flex items-center justify-between text-[10px] text-slate-600 pt-0.5 border-t border-amber-200/40">
                <span>• أذونات وعمليات المستودعات المرتبطة:</span>
                <span className="font-mono font-bold text-amber-800">{counts.woCount} إذن وسجل</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: الفواتير والمبيعات والمشتريات والعمليات */}
          <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-rose-200/70">
              <div className="flex items-center gap-2 font-bold text-xs text-rose-950">
                <FileSpreadsheet className="w-4 h-4 text-rose-600" />
                <span>3. الفواتير والعمليات التجارية والمالية</span>
              </div>
              <span className="bg-rose-200/80 text-rose-900 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {counts.invCount + counts.purCount + counts.vchCount + counts.jeCount + counts.expCount + counts.dcCount} سجل مالي
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              {/* Sales Invoices */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-rose-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetInvoices}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetInvoices: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-rose-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">فواتير المبيعات ونقاط البيع POS ومردوداتها</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف {counts.invCount} فاتورة مبيعات و {counts.srCount} مردود مبيعات.
                  </div>
                </div>
              </label>

              {/* Purchases */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-rose-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetPurchases}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetPurchases: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-rose-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">فواتير المشتريات ومشتريات الخامات ومردوداتها</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف {counts.purCount} فاتورة مشتريات و {counts.prCount} مردود مشتريات.
                  </div>
                </div>
              </label>

              {/* Vouchers & Journal Entries */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-rose-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetVouchers && options.resetJournalEntries}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetVouchers: e.target.checked, resetJournalEntries: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-rose-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">سندات القبض والصرف والقيود اليومية</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف {counts.vchCount} سند قبض/صرف و {counts.jeCount} قيد محاسبي و {counts.poCount} أمر تشغيل مطبعة.
                  </div>
                </div>
              </label>

              {/* Operating Expenses */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-rose-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetExpenses !== false}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetExpenses: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-rose-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">المصروفات والمصاريف التشغيلية بالكامل</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف {counts.expCount} سجل مصروفات تشغيلية وصيانة ونثرية وإلغاء قيودها وسنداتها المرتبطة.
                  </div>
                </div>
              </label>

              {/* Debt Clearings */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-rose-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetDebtClearings !== false}
                  onChange={(e) => setOptions(prev => ({ ...prev, resetDebtClearings: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-rose-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">سجلات المقاصات وتسوية الديون المتبادلة</div>
                  <div className="text-slate-500 text-[10px]">
                    حذف {counts.dcCount} حركة تسوية ومقاصة مسجلة بين العملاء والموردين.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* SECTION 4: العملاء والموردين والصناديق وشجرة الحسابات */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/70">
              <div className="flex items-center gap-2 font-bold text-xs text-emerald-950">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span>4. العملاء والموردين والصناديق وشجرة الحسابات</span>
              </div>
              <span className="bg-emerald-200/80 text-emerald-900 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {counts.partiesWithBalance} عميل به رصيد | {counts.treasWithBal} خزينة بها رصيد
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              {/* Zero Party Balances */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-emerald-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.zeroPartyBalances}
                  onChange={(e) => setOptions(prev => ({ ...prev, zeroPartyBalances: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-emerald-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">تصفير أرصدة الذمم والمديونيات للعملاء والموردين (0.00 ₪)</div>
                  <div className="text-slate-500 text-[10px]">
                    تصفير كشوف الحسابات والذمم المدينة والدائنة مع بقاء أسماء العملاء.
                  </div>
                </div>
              </label>

              {/* Zero Treasury Balances */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-emerald-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.zeroTreasuryBalances}
                  onChange={(e) => setOptions(prev => ({ ...prev, zeroTreasuryBalances: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-emerald-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">تصفير أرصدة الصناديق والخزنات والبنوك (0.00 ₪)</div>
                  <div className="text-slate-500 text-[10px]">
                    تصفير أرصدة كافة الخزائن النقدية والتطبيقات البنكية لتكون 0.00 ₪.
                  </div>
                </div>
              </label>

              {/* Zero Accounts */}
              <label className="flex items-start gap-2 cursor-pointer hover:bg-emerald-100/50 p-1.5 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={options.zeroAccountBalances}
                  onChange={(e) => setOptions(prev => ({ ...prev, zeroAccountBalances: e.target.checked }))}
                  disabled={!isSystemAdmin}
                  className="rounded text-emerald-600 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-800">تصفير أرصدة الدليل وشجرة الحسابات (0.00 ₪)</div>
                  <div className="text-slate-500 text-[10px]">
                    تهيئة ميزان المراجعة والميزانية العمومية للبدء الفعلي النظيف.
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Protection Assurance Box */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>العناصر الأساسية المحمية التي تبقى دائماً في النظام:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px] text-slate-700">
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
              <strong className="text-emerald-700 block mb-0.5">العميل النقدي العام:</strong>
              يبقى مسجلاً مع رصيد 0.00 ₪.
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
              <strong className="text-emerald-700 block mb-0.5">الصندوق النقدي الرئيسي:</strong>
              يبقى مسجلاً مع رصيد 0.00 ₪.
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
              <strong className="text-emerald-700 block mb-0.5">المستودع الرئيسي:</strong>
              يبقى مسجلاً مع كميات (0).
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
              <strong className="text-emerald-700 block mb-0.5">الدليل المحاسبي:</strong>
              تبقى الهيكلية كاملة مع رصيد 0.00 ₪.
            </div>
          </div>
        </div>
      </div>

      {/* Step 4: Final Confirmation Lock & Execution */}
      <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl border-2 border-rose-600/60 shadow-lg space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold text-xs">
            4
          </div>
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <span>الخطوة الرابعة: التأكيد الأمني المزدوج والتنفيذ النهائي</span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">
                إجراء حساس لا رجعة فيه
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              يرجى مراجعة ملخص السجلات المتأثرة ثم كتابة كلمة التأكيد للبدء الفعلي:
            </p>
          </div>
        </div>

        {/* Dynamic Summary Box */}
        <div className="bg-slate-800/90 border border-slate-700 p-3.5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
            <span>
              ملخص السجلات المستهدفة بالتصفير 
              ({scope === 'all' ? 'لكافة التواريخ' : scope === 'up_to_date' ? `حتى ${cutoffDate}` : scope === 'from_date' ? `بدءاً من ${fromDate}` : `بين ${fromDate} و ${cutoffDate}`}):
            </span>
            <span className="text-amber-400 font-mono text-sm">
              إجمالي السجلات والحركات المستهدفة: {totalSelectedItemsToZero} سجل
            </span>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="bg-slate-700/80 px-2 py-1 rounded border border-slate-600">
              سيتم مسح كافة البيانات المسجلة ضمن النطاق الزمني المحدد باستثناء أساسيات النظام المحمية.
            </span>
          </div>
        </div>

        {/* Confirmation Input & Action Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex-1 space-y-1">
            <label className="block text-slate-300 font-bold text-xs">
              للتأكيد، اكتب كلمة <span className="text-rose-400 font-mono font-black text-sm select-all">تصفير</span> في المربع:
            </label>
            <input
              type="text"
              placeholder="اكتب كلمة تصفير للمتابعة..."
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              disabled={!isSystemAdmin || !sessionBackupCompleted}
              className="w-full sm:max-w-md bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-bold focus:border-rose-500 focus:outline-hidden disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={handleExecuteZeroing}
            disabled={!canExecute}
            className={`px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer ${
              canExecute
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/50 scale-100 hover:scale-[1.02]'
                : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isExecuting ? 'جاري تنفيذ التصفير...' : 'تأكيد تصفير قاعدة البيانات والبدء الفعلي'}
            </span>
          </button>
        </div>

        {/* Guidance messages */}
        {!sessionBackupCompleted && (
          <p className="text-[11px] text-amber-400 flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>يجب تنزيل نسخة احتياطية أولاً في الخطوة 1 لتفعيل زر التصفير وحماية بيانات المنشأة.</span>
          </p>
        )}
      </div>

      {/* Result Modal */}
      {showResultModal && executionResult && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  تم تصفير قاعدة البيانات بنجاح!
                </h3>
                <p className="text-[10px] text-slate-400 font-light">
                  النظام مهيأ الآن للبدء الفعلي والتشغيل الإنتاجي النظيف.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2">
              <div className="font-bold text-slate-800 text-[11px] border-b border-slate-200 pb-1">
                تقرير تنفيذ عملية التصفير:
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-700">
                <div>سجلات موظفين محذوفة: <strong>{executionResult.summary.deletedEmployees}</strong></div>
                <div>مسيرات رواتب محذوفة: <strong>{executionResult.summary.deletedPayrollSheets}</strong></div>
                <div>سلف وخصومات محذوفة: <strong>{executionResult.summary.deletedEmployeeAdvances + executionResult.summary.deletedEmployeeDeductions}</strong></div>
                <div>حركات مخزون محذوفة: <strong>{executionResult.summary.deletedStockMovements}</strong></div>
                <div>أذونات مستودعات محذوفة: <strong>{executionResult.summary.deletedWarehouseOperations}</strong></div>
                <div>أصناف تم تصفير كمياتها: <strong>{executionResult.summary.zeroedInventoryStocks}</strong></div>
                <div>أصناف تم حذفها: <strong>{executionResult.summary.deletedManualItems}</strong></div>
                <div>فواتير مبيعات محذوفة: <strong>{executionResult.summary.deletedInvoices}</strong></div>
                <div>فواتير مشتريات محذوفة: <strong>{executionResult.summary.deletedPurchases}</strong></div>
                <div>سندات مالية محذوفة: <strong>{executionResult.summary.deletedVouchers}</strong></div>
                <div>قيود محاسبية محذوفة: <strong>{executionResult.summary.deletedJournalEntries}</strong></div>
                <div>مصروفات تشغيلية محذوفة: <strong>{executionResult.summary.deletedExpenses || 0}</strong></div>
                <div>مقاصات ديون محذوفة: <strong>{executionResult.summary.deletedDebtClearings || 0}</strong></div>
                <div>أرصدة أطراف تم تصفيرها: <strong>{executionResult.summary.zeroedPartyBalances}</strong></div>
                <div>خزنات تم تصفير رصيدها: <strong>{executionResult.summary.zeroedTreasuries}</strong></div>
              </div>
              <div className="text-[9px] text-slate-400 font-light pt-1 border-t border-slate-200 flex justify-between">
                <span>المنفذ: {executionResult.executedBy}</span>
                <span>التاريخ: {new Date(executionResult.executedAt).toLocaleString('ar-SA')}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResultModal(false);
                  window.location.reload();
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                إغلاق وتحديث النظام
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Sales Invoices Modal */}
      <DeleteAllSalesInvoicesModal
        isOpen={isDeleteAllSalesModalOpen}
        onClose={() => setIsDeleteAllSalesModalOpen(false)}
      />
    </div>
  );
};
