import React, { useState } from 'react';
import { MobileHomeScreen } from './MobileHomeScreen';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAccounting } from '../context/AccountingContext';
import {
  ShoppingCart,
  FileText,
  Printer,
  Boxes,
  Truck,
  Users,
  Wallet,
  Landmark,
  TrendingUp,
  BookOpenCheck,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Sparkles,
  SlidersHorizontal,
  LayoutDashboard,
  UserCheck,
  ChevronLeft,
  RotateCcw,
  X
} from 'lucide-react';

interface ShortcutDefinition {
  id: string;
  title: string;
  code: string;
  category: 'operations' | 'finance' | 'inventory' | 'reports';
  icon: React.ElementType;
  gradient: string;
  bgLight: string;
  textColor: string;
  badge?: string;
  onClick: (helpers: ShortcutHelpers) => void;
}

interface ShortcutHelpers {
  setActiveTab: (tab: string) => void;
  openCustomerStatement: () => void;
  openSupplierStatement: () => void;
}

export const HomeScreenView: React.FC = () => {
  const {
    setActiveTab,
    settings,
    updateSettings,
    stats,
    invoices,
    hasPermission
  } = useAccounting();

  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);

  const handleOpenCustomerStatement = () => {
    setActiveTab('customers');
  };

  const handleOpenSupplierStatement = () => {
    setActiveTab('suppliers');
  };

  const helpers: ShortcutHelpers = {
    setActiveTab,
    openCustomerStatement: handleOpenCustomerStatement,
    openSupplierStatement: handleOpenSupplierStatement
  };

  const allShortcuts: ShortcutDefinition[] = [
    {
      id: 'pos',
      title: 'كاشير المبيعات',
      code: 'POS',
      category: 'operations',
      icon: ShoppingCart,
      gradient: 'from-emerald-500 to-teal-700',
      bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      textColor: 'text-emerald-700',
      onClick: (h) => h.setActiveTab('pos')
    },
    {
      id: 'new_invoice',
      title: 'فواتير المبيعات',
      code: 'INV',
      category: 'operations',
      icon: FileText,
      gradient: 'from-teal-500 to-emerald-700',
      bgLight: 'bg-teal-50 text-teal-700 border-teal-200',
      textColor: 'text-teal-700',
      onClick: (h) => h.setActiveTab('invoices')
    },
    {
      id: 'new_print_order',
      title: 'أمر تشغيل ورشة طباعة',
      code: 'PRINT',
      category: 'operations',
      icon: Printer,
      gradient: 'from-sky-500 to-blue-700',
      bgLight: 'bg-sky-50 text-sky-700 border-sky-200',
      textColor: 'text-sky-700',
      badge: stats.pendingPrintJobs > 0 ? `${stats.pendingPrintJobs}` : undefined,
      onClick: (h) => h.setActiveTab('new_print_order')
    },
    {
      id: 'customer_statement',
      title: 'كشف حساب عميل',
      code: 'CUST',
      category: 'finance',
      icon: Users,
      gradient: 'from-blue-500 to-indigo-700',
      bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
      textColor: 'text-blue-700',
      onClick: (h) => h.openCustomerStatement()
    },
    {
      id: 'supplier_statement',
      title: 'كشف حساب مورد',
      code: 'SUPP',
      category: 'finance',
      icon: Truck,
      gradient: 'from-purple-500 to-indigo-800',
      bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
      textColor: 'text-purple-700',
      onClick: (h) => h.openSupplierStatement()
    },
    {
      id: 'purchases',
      title: 'فاتورة مشتريات خامات',
      code: 'BUY',
      category: 'inventory',
      icon: Truck,
      gradient: 'from-amber-500 to-orange-700',
      bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
      textColor: 'text-amber-700',
      onClick: (h) => h.setActiveTab('purchases')
    },
    {
      id: 'receipt_voucher',
      title: 'سند قبض نقدية / بنك',
      code: 'REC',
      category: 'finance',
      icon: ArrowDownLeft,
      gradient: 'from-emerald-600 to-teal-800',
      bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      textColor: 'text-emerald-700',
      onClick: (h) => h.setActiveTab('receipt_vouchers')
    },
    {
      id: 'payment_voucher',
      title: 'سند صرف مصروف / مورد',
      code: 'PAY',
      category: 'finance',
      icon: ArrowUpRight,
      gradient: 'from-rose-500 to-pink-700',
      bgLight: 'bg-rose-50 text-rose-700 border-rose-200',
      textColor: 'text-rose-700',
      onClick: (h) => h.setActiveTab('treasuries')
    },
    {
      id: 'sales_returns',
      title: 'مرتجع فواتير المبيعات',
      code: 'RET',
      category: 'operations',
      icon: RotateCcw,
      gradient: 'from-rose-500 to-red-700',
      bgLight: 'bg-red-50 text-red-700 border-red-200',
      textColor: 'text-rose-700',
      onClick: (h) => h.setActiveTab('sales_returns')
    },
    {
      id: 'treasury_transfer',
      title: 'تحويل بين الخزنات',
      code: 'XFER',
      category: 'finance',
      icon: ArrowLeftRight,
      gradient: 'from-violet-500 to-purple-700',
      bgLight: 'bg-violet-50 text-violet-700 border-violet-200',
      textColor: 'text-violet-700',
      onClick: (h) => h.setActiveTab('treasuries')
    },
    {
      id: 'inventory',
      title: 'المخزون والمستودعات',
      code: 'STOCK',
      category: 'inventory',
      icon: Boxes,
      gradient: 'from-orange-500 to-amber-700',
      bgLight: 'bg-orange-50 text-orange-700 border-orange-200',
      textColor: 'text-orange-700',
      badge: stats.lowStockCount > 0 ? `${stats.lowStockCount} نواقص` : undefined,
      onClick: (h) => h.setActiveTab('inventory')
    },
    {
      id: 'accounting',
      title: 'دفتر اليومية والقيود',
      code: 'ACC',
      category: 'finance',
      icon: BookOpenCheck,
      gradient: 'from-cyan-600 to-blue-800',
      bgLight: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      textColor: 'text-cyan-700',
      onClick: (h) => h.setActiveTab('accounting')
    },
    {
      id: 'employees',
      title: 'رواتب وسلف الموظفين',
      code: 'HR',
      category: 'finance',
      icon: UserCheck,
      gradient: 'from-blue-600 to-indigo-800',
      bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
      textColor: 'text-blue-700',
      onClick: (h) => h.setActiveTab('employees')
    },
    {
      id: 'reports',
      title: 'التقارير والأرباح والضريبة',
      code: 'REP',
      category: 'reports',
      icon: BarChart3,
      gradient: 'from-emerald-600 to-teal-800',
      bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      textColor: 'text-emerald-700',
      onClick: (h) => h.setActiveTab('reports')
    },
    {
      id: 'dashboard_info',
      title: 'لوحة المعلومات والأرصدة',
      code: 'DASH',
      category: 'reports',
      icon: LayoutDashboard,
      gradient: 'from-indigo-500 to-blue-700',
      bgLight: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      textColor: 'text-indigo-700',
      onClick: (h) => h.setActiveTab('dashboard')
    }
  ];

  // Active enabled shortcut IDs (from settings or fallback)
  const enabledShortcutIds = settings.homeShortcuts && settings.homeShortcuts.length > 0
    ? settings.homeShortcuts
    : allShortcuts.map(s => s.id);

  const checkShortcutPermission = (shortcutId: string): boolean => {
    switch (shortcutId) {
      case 'pos':
        return hasPermission('view_pos');
      case 'new_invoice':
        return hasPermission('view_invoices');
      case 'new_print_order':
        return hasPermission('view_print_orders');
      case 'customer_statement':
      case 'supplier_statement':
        return hasPermission('view_accounting') || hasPermission('view_reports');
      case 'purchases':
        return hasPermission('view_inventory');
      case 'receipt_voucher':
        return hasPermission('view_accounting') && hasPermission('create_receipt');
      case 'payment_voucher':
        return hasPermission('view_accounting') && hasPermission('create_payment');
      case 'inventory':
        return hasPermission('view_inventory');
      case 'treasury_transfer':
        return hasPermission('transfer_funds');
      case 'dashboard_info':
        return hasPermission('view_dashboard');
      case 'reports':
        return hasPermission('view_reports');
      case 'accounting':
        return hasPermission('view_accounting');
      case 'employees':
        return hasPermission('view_settings');
      default:
        return true;
    }
  };

  const displayedShortcuts = allShortcuts
    .filter(s => enabledShortcutIds.includes(s.id))
    .filter(s => checkShortcutPermission(s.id));

  const handleToggleShortcut = (id: string) => {
    const current = settings.homeShortcuts || allShortcuts.map(s => s.id);
    let updated: string[];
    if (current.includes(id)) {
      updated = current.filter(x => x !== id);
    } else {
      updated = [...current, id];
    }
    updateSettings({ homeShortcuts: updated });
  };

  const handleSelectAllShortcuts = () => {
    updateSettings({ homeShortcuts: allShortcuts.map(s => s.id) });
  };

  const handleResetShortcuts = () => {
    updateSettings({ homeShortcuts: allShortcuts.slice(0, 12).map(s => s.id) });
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const calculatedTodaySales = (invoices || [])
    .filter(inv => inv?.date && inv.date.startsWith(todayStr))
    .reduce((sum, inv) => sum + (inv.totalAmount || (inv as any).total || 0), 0);

  const todaySales = stats?.todaySales !== undefined ? stats.todaySales : calculatedTodaySales;

  const isMobile = useIsMobile(768);

  if (isMobile) {
    return <MobileHomeScreen />;
  }

  return (
    <div className="w-full px-2 sm:px-3 flex flex-col gap-3 max-h-[calc(100vh-68px)] overflow-hidden select-none" dir="rtl">
      {/* 1. Top Single-Row Banner with Controls & Financial Metrics */}
      <div className="bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white rounded-xl p-3 sm:p-3.5 shadow-md border border-slate-700/80 relative shrink-0">
        {/* Row 1: Single Line Title + Quick Action Controls */}
        <div className="flex flex-row items-center justify-between gap-2">
          {/* Right: Clean single-line text without extra badge */}
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">
              مركز الانطلاق السريع لتشغيل مهامك اليومية بكفاءة عالية
            </span>
          </div>

          {/* Left: Buttons in the exact same single row */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsCustomizeModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold border border-slate-600 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
              title="تخصيص الاختصارات المعروضة في الشاشة الرئيسية"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>تخصيص الاختصارات</span>
              <span className="text-[10px] bg-blue-900/80 text-blue-200 px-1.5 py-0.2 rounded-full border border-blue-700/50 font-mono">
                {displayedShortcuts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-95"
              title="الانتقال إلى لوحة المعلومات"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>لوحة المعلومات</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: 4 Clean Ticker Cards with Icons & Amounts in a Single Line */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {/* 1. رصيد الصندوق */}
          <div className="bg-slate-800/80 hover:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-700/60 flex items-center justify-between gap-2 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
              <span className="text-slate-300 text-[11px] font-semibold whitespace-nowrap">رصيد الصندوق اليومي:</span>
              <div className="flex items-baseline gap-1 font-mono">
                <strong className="text-emerald-400 font-black text-xs sm:text-sm">
                  {(stats?.cashBalance ?? 0).toLocaleString('ar-SA')}
                </strong>
                <span className="text-[10px] text-slate-400 font-bold">{settings.currency}</span>
              </div>
            </div>
            <div className="w-6.5 h-6.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* 2. رصيد البنك */}
          <div className="bg-slate-800/80 hover:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-700/60 flex items-center justify-between gap-2 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
              <span className="text-slate-300 text-[11px] font-semibold whitespace-nowrap">رصيد البنك:</span>
              <div className="flex items-baseline gap-1 font-mono">
                <strong className="text-blue-300 font-black text-xs sm:text-sm">
                  {(stats?.bankBalance ?? 0).toLocaleString('ar-SA')}
                </strong>
                <span className="text-[10px] text-slate-400 font-bold">{settings.currency}</span>
              </div>
            </div>
            <div className="w-6.5 h-6.5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Landmark className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* 3. مبيعات اليوم */}
          <div className="bg-slate-800/80 hover:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-700/60 flex items-center justify-between gap-2 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
              <span className="text-slate-300 text-[11px] font-semibold whitespace-nowrap">مبيعات اليوم:</span>
              <div className="flex items-baseline gap-1 font-mono">
                <strong className="text-emerald-400 font-black text-xs sm:text-sm">
                  {(todaySales ?? 0).toLocaleString('ar-SA')}
                </strong>
                <span className="text-[10px] text-slate-400 font-bold">{settings.currency}</span>
              </div>
            </div>
            <div className="w-6.5 h-6.5 rounded-md bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* 4. أوامر ورشة الطباعة */}
          <div className="bg-slate-800/80 hover:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-700/60 flex items-center justify-between gap-2 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
              <span className="text-slate-300 text-[11px] font-semibold whitespace-nowrap">أوامر ورشة الطباعة:</span>
              <div className="flex items-baseline gap-1 font-mono">
                <strong className="text-amber-300 font-black text-xs sm:text-sm">
                  {stats?.pendingPrintJobs ?? 0}
                </strong>
                <span className="text-[10px] text-slate-400 font-medium">قيد التنفيذ</span>
              </div>
            </div>
            <div className="w-6.5 h-6.5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Printer className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Grid of Action Buttons (رمز العملية + اسم العملية + اختصارها POS/INV/...) */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2.5">
          {displayedShortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <button
                key={shortcut.id}
                type="button"
                onClick={() => shortcut.onClick(helpers)}
                className="group relative bg-white hover:bg-slate-50/90 rounded-xl border border-slate-200/90 hover:border-blue-500/80 p-3 shadow-2xs hover:shadow-md transition-all duration-150 cursor-pointer flex items-center justify-between gap-2.5 active:scale-[0.98] text-right"
              >
                {/* Right: Icon + Operation Title */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${shortcut.gradient} flex items-center justify-center text-white shadow-2xs shrink-0 group-hover:scale-105 transition-transform`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs sm:text-[13px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                    {shortcut.title}
                  </span>
                </div>

                {/* Left: Code / Shortcut Tag */}
                <div className="flex items-center gap-1 shrink-0">
                  {shortcut.badge && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                      {shortcut.badge}
                    </span>
                  )}
                  <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700 border border-slate-200 group-hover:border-blue-200 transition-colors">
                    {shortcut.code}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Customize Shortcuts Modal (نافذة تخصيص الاختصارات) */}
      {isCustomizeModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="bg-[#0f172a] text-white p-3.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600/80 flex items-center justify-center text-white">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">تخصيص أزرار واختصارات الشاشة الرئيسية</h3>
                </div>
              </div>
              <button
                onClick={() => setIsCustomizeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Quick Actions */}
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAllShortcuts}
                  className="text-blue-600 hover:text-blue-700 font-bold hover:underline cursor-pointer"
                >
                  تحديد الكل ({allShortcuts.length})
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={handleResetShortcuts}
                  className="text-slate-600 hover:text-slate-800 font-bold hover:underline cursor-pointer"
                >
                  الافتراضي
                </button>
              </div>
              <span className="text-slate-500 font-mono text-[11px]">
                المفعل: {enabledShortcutIds.length} من {allShortcuts.length}
              </span>
            </div>

            {/* Modal Body / Checklist */}
            <div className="p-3 overflow-y-auto space-y-1.5 flex-1 divide-y divide-slate-100">
              {allShortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                const isChecked = enabledShortcutIds.includes(shortcut.id);

                return (
                  <label
                    key={shortcut.id}
                    className={`pt-1.5 first:pt-0 flex items-center justify-between gap-3 p-2 rounded-xl transition-all cursor-pointer ${
                      isChecked ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-slate-50 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${shortcut.gradient} flex items-center justify-center text-white shrink-0 shadow-2xs`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900">{shortcut.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {shortcut.code}
                      </span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleShortcut(shortcut.id)}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-3 border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setIsCustomizeModalOpen(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              >
                تم وتطبيق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
