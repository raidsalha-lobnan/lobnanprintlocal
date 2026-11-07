import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { ApiRequestLogsModal } from './ApiRequestLogsModal';
import {
  History,
  Search,
  Filter,
  Calendar,
  User,
  Store,
  Printer,
  Download,
  ShieldCheck,
  ShoppingCart,
  Truck,
  RotateCcw,
  Wallet,
  Receipt,
  Boxes,
  FileText,
  UserCheck,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Layers,
  Scale,
  Activity
} from 'lucide-react';
import { SyncAuditStatementView } from './SyncAuditStatementView';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  category: 'sales' | 'purchases' | 'inventory' | 'finance' | 'payroll' | 'settings';
  categoryLabel: string;
  actionType: string;
  documentNumber: string;
  userName: string;
  userRole: string;
  branchName: string;
  details: string;
  amount?: number;
}

export const AuditLogView: React.FC = () => {
  const {
    invoices,
    salesReturns,
    purchases,
    purchaseReturns,
    vouchers,
    journalEntries,
    warehouseOperations,
    payrollSheets,
    settings,
    branches,
    users
  } = useAccounting();

  const [activeViewTab, setActiveViewTab] = useState<'audit_logs' | 'sync_statement'>('audit_logs');
  const [showApiLogsModal, setShowApiLogsModal] = useState(false);

  // Aggregate operations into chronological audit log entries
  const allLogs = useMemo(() => {
    const list: AuditLogEntry[] = [];

    // 1. Invoices
    (invoices || []).forEach(inv => {
      const itemsCount = inv.items?.length || 0;
      list.push({
        id: `inv-${inv.id}`,
        timestamp: inv.createdAt || `${inv.date || '2026-09-01'}T10:00:00Z`,
        date: inv.date || '2026-09-01',
        time: inv.time || '10:00',
        category: 'sales',
        categoryLabel: 'المبيعات والكاشير',
        actionType: 'إصدار فاتورة بيع',
        documentNumber: inv.invoiceNumber || 'INV',
        userName: inv.cashierName || 'كاشير المبيعات',
        userRole: 'كاشير',
        branchName: inv.branch || 'الفرع الرئيسي',
        details: `فاتورة بيع للعميل: ${inv.customerName || 'عميل'} - عدد الأصناف: ${itemsCount}`,
        amount: inv.totalAmount ?? (inv as any).total ?? 0
      });
    });

    // 2. Sales Returns
    (salesReturns || []).forEach(ret => {
      list.push({
        id: `sret-${ret.id}`,
        timestamp: ret.createdAt || `${ret.date || '2026-09-01'}T12:00:00Z`,
        date: ret.date || '2026-09-01',
        time: ret.time || '12:00',
        category: 'sales',
        categoryLabel: 'المبيعات والكاشير',
        actionType: 'إشعار دائن (مرتجع مبيعات)',
        documentNumber: ret.returnNumber || 'SR',
        userName: ret.approvedBy || 'مسؤول المبيعات',
        userRole: 'محاسب مبيعات',
        branchName: ret.branchName || 'الفرع الرئيسي',
        details: `مرتجع مبيعات للعميل: ${ret.customerName || 'عميل'} - السبب: ${ret.reason || 'إرجاع أصناف'}`,
        amount: ret.totalAmount ?? (ret as any).total ?? 0
      });
    });

    // 3. Purchases
    (purchases || []).forEach(pur => {
      list.push({
        id: `pur-${pur.id}`,
        timestamp: pur.createdAt || `${pur.date || '2026-09-01'}T09:00:00Z`,
        date: pur.date || '2026-09-01',
        time: '09:00',
        category: 'purchases',
        categoryLabel: 'المشتريات والمصروفات',
        actionType: 'تسجيل فاتورة شراء',
        documentNumber: pur.invoiceNumber || 'PUR',
        userName: pur.createdBy || 'أمين المشتريات',
        userRole: 'مسؤول المشتريات',
        branchName: pur.branchId || 'الفرع الرئيسي',
        details: `فاتورة توريد خامات من المورد: ${pur.supplierName || 'مورد'}`,
        amount: (pur as any).totalAmount ?? pur.total ?? 0
      });
    });

    // 4. Purchase Returns
    (purchaseReturns || []).forEach(pret => {
      list.push({
        id: `pret-${pret.id}`,
        timestamp: pret.createdAt || `${pret.date || '2026-09-01'}T11:00:00Z`,
        date: pret.date || '2026-09-01',
        time: '11:00',
        category: 'purchases',
        categoryLabel: 'المشتريات والمصروفات',
        actionType: 'مرتجع مشتريات لمورد',
        documentNumber: pret.returnNumber || 'PR',
        userName: pret.createdBy || 'أمين المشتريات',
        userRole: 'مسؤول المشتريات',
        branchName: 'الفرع الرئيسي',
        details: `إرجاع خامات للمورد: ${pret.supplierName || 'مورد'} - السبب: ${pret.reason || 'مرتجع خامات'}`,
        amount: (pret as any).totalAmount ?? pret.total ?? 0
      });
    });

    // 5. Vouchers (Receipt & Payment)
    (vouchers || []).forEach(v => {
      const isReceipt = v.type === 'receipt';
      list.push({
        id: `vouch-${v.id}`,
        timestamp: `${v.date || '2026-09-01'}T14:00:00Z`,
        date: v.date || '2026-09-01',
        time: '14:00',
        category: 'finance',
        categoryLabel: 'المالية والخزائن',
        actionType: isReceipt ? 'تحرير سند قبض' : 'تحرير سند صرف',
        documentNumber: v.voucherNumber || 'VOUCH',
        userName: 'المدير المالي',
        userRole: 'محاسب عام',
        branchName: 'الفرع الرئيسي',
        details: `${isReceipt ? 'قبض من:' : 'صرف إلى:'} ${v.partyName || ''} (${v.description || ''})`,
        amount: v.amount || 0
      });
    });

    // 6. Warehouse Operations
    (warehouseOperations || []).forEach(op => {
      list.push({
        id: `whop-${op.id}`,
        timestamp: op.createdAt || `${op.date || '2026-09-01'}T15:00:00Z`,
        date: op.date || '2026-09-01',
        time: op.time || '15:00',
        category: 'inventory',
        categoryLabel: 'المخازن والأصناف',
        actionType: `عملية مخزنية (${op.operationType || 'حركة'})`,
        documentNumber: op.documentNumber || 'WH',
        userName: op.createdBy || 'أمين المستودع',
        userRole: 'أمين مستودع',
        branchName: op.branchId ? (branches?.find(b => b.id === op.branchId)?.name || op.branchId) : 'الفرع الرئيسي',
        details: `${op.sourceWarehouseName || 'المستودع'} - ${op.reason || 'حركة صنف'}`,
        amount: op.totalValue || 0
      });
    });

    // 7. Payroll
    (payrollSheets || []).forEach(sheet => {
      const sheetItems = (sheet as any).items || (sheet as any).lines || [];
      const employeesNum = sheetItems.length || sheet.employeesCount || 0;
      list.push({
        id: `pay-${sheet.id}`,
        timestamp: sheet.createdAt ? `${sheet.createdAt}T16:00:00Z` : `${sheet.disbursedAt || '2026-09-01'}T16:00:00Z`,
        date: sheet.createdAt || sheet.disbursedAt || (sheet as any).periodMonth || '2026-09-01',
        time: '16:00',
        category: 'payroll',
        categoryLabel: 'الموارد البشرية',
        actionType: sheet.status === 'approved' ? 'اعتماد مسير رواتب' : 'مسودة مسير رواتب',
        documentNumber: sheet.sheetNumber || 'PR',
        userName: 'مدير الموارد البشرية',
        userRole: 'مدير شؤون الموظفين',
        branchName: 'الفرع الرئيسي',
        details: `مسير رواتب (${sheet.title || sheet.period || ''}) - لعدد ${employeesNum} موظف`,
        amount: sheet.totalNet || 0
      });
    });

    // 8. Journal Entries
    (journalEntries || []).forEach(je => {
      list.push({
        id: `je-${je.id}`,
        timestamp: je.createdAt || `${je.date || '2026-09-01'}T13:00:00Z`,
        date: je.date || '2026-09-01',
        time: '13:00',
        category: 'finance',
        categoryLabel: 'المالية والخزائن',
        actionType: je.referenceType === 'debt_clearing' ? 'مقاصة عميل ومورد' : 'قيد يومية محاسبي',
        documentNumber: je.entryNumber || 'JE',
        userName: je.createdByName || 'المحاسب المالي',
        userRole: 'مدقق حسابات',
        branchName: 'الفرع الرئيسي',
        details: je.description || 'تسجيل قيد محاسبي',
        amount: je.totalDebit || 0
      });
    });

    return list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [invoices, salesReturns, purchases, purchaseReturns, vouchers, warehouseOperations, payrollSheets, journalEntries, branches]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'sales' | 'purchases' | 'inventory' | 'finance' | 'payroll'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
      if (fromDate && log.date < fromDate) return false;
      if (toDate && log.date > toDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          log.documentNumber.toLowerCase().includes(q) ||
          log.actionType.toLowerCase().includes(q) ||
          log.userName.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q) ||
          log.branchName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allLogs, categoryFilter, fromDate, toDate, searchQuery]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['التاريخ', 'الوقت', 'التصنيف', 'نوع العملية', 'رقم المستند', 'المستخدم', 'الدور', 'الفرع', 'التفاصيل', 'المبلغ'];
    const rows = filteredLogs.map(l => [
      l.date,
      l.time,
      l.categoryLabel,
      l.actionType,
      l.documentNumber,
      l.userName,
      l.userRole,
      l.branchName,
      `"${l.details.replace(/"/g, '""')}"`,
      l.amount || 0
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getCategoryBadge = (cat: AuditLogEntry['category']) => {
    switch (cat) {
      case 'sales':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">المبيعات</span>;
      case 'purchases':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">المشتريات</span>;
      case 'finance':
        return <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[11px] font-medium">المالية</span>;
      case 'inventory':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium">المخزون</span>;
      case 'payroll':
        return <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-[11px] font-medium">الرواتب</span>;
      default:
        return <span className="bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium">النظام</span>;
    }
  };

  if (activeViewTab === 'sync_statement') {
    return (
      <div className="space-y-3" dir="rtl">
        {/* Navigation Switcher Tabs */}
        <div className="bg-white p-1.5 rounded-xl border border-slate-300 shadow-xs flex items-center gap-1.5 print:hidden">
          <button
            onClick={() => setActiveViewTab('audit_logs')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>1. سجل حركات النظام والرقابة الداخلية</span>
          </button>
          <button
            onClick={() => setActiveViewTab('sync_statement')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>2. سند ومطابقة المزامنة مع السيرفر الرئيسي</span>
          </button>
        </div>
        <SyncAuditStatementView />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Navigation Switcher Tabs */}
      <div className="bg-white p-1.5 rounded-xl border border-slate-300 shadow-xs flex items-center gap-1.5 print:hidden">
        <button
          onClick={() => setActiveViewTab('audit_logs')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs cursor-pointer"
        >
          <History className="w-3.5 h-3.5" />
          <span>1. سجل حركات النظام والرقابة الداخلية</span>
        </button>
        <button
          onClick={() => setActiveViewTab('sync_statement')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>2. سند ومطابقة المزامنة مع السيرفر الرئيسي</span>
        </button>
      </div>

      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <History className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-800">سجل العمليات والرقابة الداخلية (Audit Trail)</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-light mt-1">
            توثيق لحظي وتاريخي شامل لكافة الحركات المالية والفواتير وسندات القبض والصرف وحركات المخزون والمستخدمين
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowApiLogsModal(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-3.5 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer border border-slate-700"
            title="تقرير طلبات API وخطأ 405"
          >
            <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
            <span>تقرير طلبات API (خطأ 405)</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs px-3.5 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-200"
          >
            <Download className="w-4 h-4" />
            <span>تصدير إكسل (CSV)</span>
          </button>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة السجل</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">إجمالي السجلات المؤرشفة</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-slate-900">
              {allLogs.length.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">حركة موثقة</span>
          </div>
          <span className="text-[10px] text-emerald-600 mt-1 block">تتبع دقيق مع المستخدم والفرع</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">حركات المبيعات والتحصيل</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-emerald-600">
              {allLogs.filter(l => l.category === 'sales').length.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">عملية</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">فواتير ومردودات وسندات</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">حركات المخازن والتوريد</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-indigo-600">
              {allLogs.filter(l => l.category === 'inventory' || l.category === 'purchases').length.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">عملية</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">أذون صرف وتحويل وتوريد</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">حركات المالية والخزائن</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-blue-600">
              {allLogs.filter(l => l.category === 'finance' || l.category === 'payroll').length.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">عملية</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">سندات صرف وقبض ورواتب</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث برقم المستند، نوع الحركة، المستخدم، الفرع، التفاصيل..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">كل الأقسام</option>
              <option value="sales">المبيعات والكاشير</option>
              <option value="purchases">المشتريات والمصروفات</option>
              <option value="inventory">المخازن والأصناف</option>
              <option value="finance">المالية والخزائن</option>
              <option value="payroll">الموارد البشرية والرواتب</option>
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
          {(searchQuery || categoryFilter !== 'all' || fromDate || toDate) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
                setFromDate('');
                setToDate('');
              }}
              className="text-blue-600 hover:text-blue-700 text-[11px] font-medium px-2 py-1 cursor-pointer"
            >
              إلغاء الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="p-3">التاريخ والوقت</th>
                <th className="p-3">القسم والتصنيف</th>
                <th className="p-3">نوع العملية</th>
                <th className="p-3">رقم المستند / المرجع</th>
                <th className="p-3">المستخدم المنفذ</th>
                <th className="p-3">الفرع</th>
                <th className="p-3">بيان وتفاصيل العملية</th>
                <th className="p-3">القيمة المالية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">لا توجد سجلات مطابقة لمعايير البحث</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={`${log.id || 'log'}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-mono text-slate-600">
                      <div>{log.date}</div>
                      <span className="text-[10px] text-slate-400">{log.time}</span>
                    </td>
                    <td className="p-3">{getCategoryBadge(log.category)}</td>
                    <td className="p-3 font-semibold text-slate-900">{log.actionType}</td>
                    <td className="p-3 font-mono font-bold text-blue-600">{log.documentNumber}</td>
                    <td className="p-3">
                      <div className="font-medium text-slate-800">{log.userName}</div>
                      <span className="text-[10px] text-slate-400">{log.userRole}</span>
                    </td>
                    <td className="p-3 text-slate-600">{log.branchName}</td>
                    <td className="p-3 text-slate-600 max-w-[280px] truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800 text-xs">
                      {log.amount !== undefined ? (
                        <span>{log.amount.toLocaleString('ar-SA')} {settings?.currency || 'ر.س'}</span>
                      ) : (
                        <span className="text-slate-400 font-normal">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ApiRequestLogsModal isOpen={showApiLogsModal} onClose={() => setShowApiLogsModal(false)} />
    </div>
  );
};
