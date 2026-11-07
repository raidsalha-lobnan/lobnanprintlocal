import React from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Printer,
  FileText,
  Boxes,
  Truck,
  Users,
  BookOpenCheck,
  BarChart3,
  Settings,
  AlertTriangle,
  Clock,
  UserCheck,
  Wallet
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, stats, settings } = useAccounting();

  const mainMenuItems = [
    {
      id: 'dashboard',
      label: 'لوحة التحكم',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'pos',
      label: 'كاشير المبيعات (POS)',
      icon: ShoppingCart,
      badge: 'سريع'
    },
    {
      id: 'print_orders',
      label: 'طلبات الطباعة والورشة',
      icon: Printer,
      badge: stats.pendingPrintJobs > 0 ? `${stats.pendingPrintJobs}` : null,
      badgeColor: 'bg-amber-500/20 text-amber-300'
    },
    {
      id: 'manual_invoices',
      label: 'فاتورة مبيعات يدوية',
      icon: FileText,
      badge: null
    },
    {
      id: 'invoices',
      label: 'فواتير المبيعات',
      icon: FileText,
      badge: null
    },
    {
      id: 'inventory',
      label: 'المخزون والورق',
      icon: Boxes,
      badge: stats.lowStockCount > 0 ? `${stats.lowStockCount}` : null,
      badgeColor: 'bg-rose-500/20 text-rose-300'
    },
    {
      id: 'purchases',
      label: 'مشتريات الخامات',
      icon: Truck,
      badge: null
    },
    {
      id: 'parties',
      label: 'العملاء والموردين',
      icon: Users,
      badge: null
    },
    {
      id: 'employees',
      label: 'الموظفون والرواتب',
      icon: UserCheck,
      badge: stats.totalEmployeesCount > 0 ? `${stats.totalEmployeesCount}` : null,
      badgeColor: 'bg-blue-500/20 text-blue-300'
    }
  ];

  const financialMenuItems = [
    {
      id: 'treasuries',
      label: 'الخزنات والصناديق',
      icon: Wallet,
      badge: stats.treasuriesCount > 0 ? `${stats.treasuriesCount}` : null,
      badgeColor: 'bg-emerald-500/20 text-emerald-300'
    },
    {
      id: 'accounting',
      label: 'القيود ودفتر الأستاذ',
      icon: BookOpenCheck,
      badge: 'مزدوج'
    },
    {
      id: 'reports',
      label: 'الأرباح والخسائر والضريبة',
      icon: BarChart3,
      badge: null
    },
    {
      id: 'settings',
      label: 'بيانات المنشأة والنظام',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <aside className="w-56 bg-[#1e293b] text-slate-300 flex flex-col shrink-0 border-l border-slate-700 min-h-screen select-none">
      {/* Brand Header */}
      <div className="p-3.5 border-b border-slate-700 bg-[#0f172a]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-500 rounded flex items-center justify-center text-white font-bold text-base shrink-0 shadow-xs">
            P
          </div>
          <div className="min-w-0">
            <span className="font-bold text-white tracking-tight text-sm block truncate">
              المحاسب الذكي
            </span>
            <p className="text-[10px] text-slate-400 truncate">
              {settings.businessName}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
        {/* Main Section */}
        <div>
          <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            القائمة الرئيسية
          </div>
          <div className="space-y-0.5">
            {mainMenuItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        isActive ? 'bg-blue-700 text-white' : item.badgeColor || 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Financial Section */}
        <div>
          <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            التقارير والحسابات
          </div>
          <div className="space-y-0.5">
            {financialMenuItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Production Quick Stats in Sidebar */}
      {stats.pendingPrintJobs > 0 && (
        <div className="px-2 pb-2">
          <div className="bg-slate-800/80 rounded-md p-2 border border-slate-700 text-[11px]">
            <div className="flex items-center justify-between text-amber-400 font-semibold mb-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>أوامر الورشة</span>
              </span>
              <span className="font-mono">{stats.pendingPrintJobs} طلب</span>
            </div>
            {stats.lowStockCount > 0 && (
              <div className="flex items-center justify-between text-rose-300 text-[10px] border-t border-slate-700/60 pt-1 mt-1">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                  <span>نواقص المخزون</span>
                </span>
                <span className="font-mono">{stats.lowStockCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Footer */}
      <div className="p-3 bg-[#0f172a] border-t border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            أ
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">أحمد المحاسب</p>
            <p className="text-[10px] text-slate-400 truncate">مدير النظام المالي</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
