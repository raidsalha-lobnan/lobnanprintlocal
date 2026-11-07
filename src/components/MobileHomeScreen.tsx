import React, { useState, useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  ShoppingCart, FileText, Printer, Boxes, Truck, Users, Wallet,
  BookOpenCheck, BarChart3, ArrowUpRight, ArrowDownLeft,
  ArrowLeftRight, Sparkles, Clock, Search, ChevronLeft,
  LayoutDashboard, Layers, UserCheck, Receipt, Building2,
  Download, ShieldCheck, Settings, HelpCircle, FileCheck, CheckCircle
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  sublabel?: string;
  category: 'main' | 'reports' | 'finance' | 'settings' | 'sales';
  icon: any;
  color: string;
  keywords?: string;
}

const ALL_MOBILE_MENUS: MenuItem[] = [
  // Sales & Cashier
  { id: 'pos', label: 'كاشير الهاتف السريع', sublabel: 'نقطة بيع سريعة ومختصرة للهاتف', category: 'sales', icon: ShoppingCart, color: 'bg-emerald-500', keywords: 'بيع كاشير نقطة فاتورة سريعة pos' },
  { id: 'invoices', label: 'فواتير المبيعات', sublabel: 'عرض وسجل فواتير المبيعات والبحث', category: 'sales', icon: FileText, color: 'bg-blue-600', keywords: 'فاتورة فواتير بيع مبيعات' },
  { id: 'special_invoice', label: 'فاتورة مبيعات خاصة', sublabel: 'إنشاء فاتورة خاصة بتصميم مخصص', category: 'sales', icon: FileText, color: 'bg-blue-700', keywords: 'فاتورة خاصة قالب' },
  { id: 'sales_returns', label: 'مرتجع المبيعات', sublabel: 'تسجيل مرتجعات الفواتير', category: 'sales', icon: ArrowLeftRight, color: 'bg-rose-500', keywords: 'مرتجع رد فاتورة مبيعات' },
  { id: 'print_orders', label: 'أوامر الطباعة والورشة', sublabel: 'متابعة أوامر الشغل والمطبعة', category: 'sales', icon: Printer, color: 'bg-purple-600', keywords: 'طباعة مطبعة كرت بنر بروشور أمر شغل' },
  
  // Parties & Customers
  { id: 'parties', label: 'العملاء والمديونيات', sublabel: 'دليل العملاء وأرصدة الذمم', category: 'main', icon: Users, color: 'bg-indigo-600', keywords: 'عميل زبون هاتف ذمة دين كشف' },
  { id: 'purchases_suppliers', label: 'الموردين والشركات', sublabel: 'دليل الموردين وأرصدة المشتريات', category: 'main', icon: Truck, color: 'bg-amber-600', keywords: 'مورد موردين شركة شراء خامات' },

  // Inventory & Purchases
  { id: 'inventory', label: 'المخزون والأصناف', sublabel: 'قائمة الأصناف والكميات والأسعار', category: 'main', icon: Layers, color: 'bg-cyan-600', keywords: 'مخزون صنف بضاعة كمية كرتون باركود' },
  { id: 'purchases_invoices', label: 'فواتير المشتريات', sublabel: 'سجل فواتير الشراء وتوريد الأصناف', category: 'main', icon: Boxes, color: 'bg-amber-500', keywords: 'شراء مشتريات توريد فواتير' },
  { id: 'warehouses', label: 'المخازن والمستودعات', sublabel: 'التحويلات المخزنية وأذون الصرف', category: 'main', icon: Boxes, color: 'bg-teal-600', keywords: 'مخزن مستودع تحويل بضاعة جرد' },

  // Finance & Treasury
  { id: 'treasuries', label: 'الصناديق والعملات', sublabel: 'رصيد الخزينة، البنوك وأسعار الصرف', category: 'finance', icon: Wallet, color: 'bg-emerald-600', keywords: 'صندوق خزينة كاش شيكل دولار بنك فيزا' },
  { id: 'receipt_vouchers', label: 'سندات القبض', sublabel: 'تسجيل المقبوضات والتحصيلات النقدية والبنكية', category: 'finance', icon: ArrowUpRight, color: 'bg-emerald-600', keywords: 'قبض استلام دفعة تحصيل نقد' },
  { id: 'payment_vouchers', label: 'سندات الصرف', sublabel: 'تسجيل المصروفات والمدفوعات', category: 'finance', icon: ArrowDownLeft, color: 'bg-rose-600', keywords: 'صرف دفع مصاريف إيجار فواتير' },
  { id: 'debt_clearing', label: 'مقاصة عميل ومورد', sublabel: 'تسوية المديونيات المتبادلة آلياً', category: 'finance', icon: ArrowLeftRight, color: 'bg-violet-600', keywords: 'مقاصة تسوية دين تبادل عميل مورد' },
  { id: 'accounting', label: 'القيود المحاسبية', sublabel: 'شجرة الحسابات ودفتر الأستاذ العام', category: 'finance', icon: BookOpenCheck, color: 'bg-slate-700', keywords: 'قيد محاسبة أستاذ ميزان شجرة حساب' },

  // Reports
  { id: 'report_customer_statement', label: 'كشف حساب تفصيلي عميل', sublabel: 'حركة حساب العميل والمديونيات', category: 'reports', icon: BarChart3, color: 'bg-blue-500', keywords: 'كشف حساب عميل تقرير حركة رصيد' },
  { id: 'report_supplier_statement', label: 'كشف حساب تفصيلي مورد', sublabel: 'حركة حساب المورد والدفعات', category: 'reports', icon: BarChart3, color: 'bg-amber-500', keywords: 'كشف حساب مورد تقرير حركة' },
  { id: 'report_treasuries_movement', label: 'كشف حركة الصناديق', sublabel: 'التدفقات النقدية والبنكية', category: 'reports', icon: Wallet, color: 'bg-emerald-500', keywords: 'كشف صندوق خزينة بنك حركة كاش' },
  { id: 'reports', label: 'مركز التقارير الشامل', sublabel: 'تقارير المبيعات والمشتريات والأرباح والضرائب', category: 'reports', icon: BarChart3, color: 'bg-indigo-500', keywords: 'تقرير أرباح ضريبة مبيعات شامل' },

  // HR & Settings
  { id: 'employees', label: 'شؤون الموظفين والرواتب', sublabel: 'سجل الموظفين والمسيرات والسلف', category: 'main', icon: UserCheck, color: 'bg-teal-500', keywords: 'موظف رواتب سلف خصم مسير' },
  { id: 'branches', label: 'الفروع والشركات', sublabel: 'إدارة الفروع وصلاحياتها', category: 'settings', icon: Building2, color: 'bg-slate-600', keywords: 'فرع شركة مركز' },
  { id: 'users_permissions', label: 'المستخدمون والصلاحيات', sublabel: 'إدارة المستخدمين وكلمات المرور', category: 'settings', icon: ShieldCheck, color: 'bg-slate-700', keywords: 'مستخدم صلاحية كلمة مرور أدمن' },
  { id: 'settings_general', label: 'إعدادات المنشأة والضريبة', sublabel: 'البيانات الرسمية والعملة والترويسة', category: 'settings', icon: Settings, color: 'bg-slate-800', keywords: 'إعدادات اسم المنشأة ضريبة شيكل' }
];

export const MobileHomeScreen: React.FC = () => {
  const { setActiveTab, currentUser, settings, stats, treasuries, invoices } = useAccounting();
  const [searchQuery, setSearchQuery] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Catch PWA install prompt
  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choiceResult = await installPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    }
  };

  const filteredMenus = useMemo(() => {
    if (!searchQuery.trim()) return ALL_MOBILE_MENUS;
    const q = searchQuery.toLowerCase().trim();
    return ALL_MOBILE_MENUS.filter(m =>
      m.label.toLowerCase().includes(q) ||
      (m.sublabel && m.sublabel.toLowerCase().includes(q)) ||
      (m.keywords && m.keywords.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  // Main cash treasury balance
  const mainTreasury = treasuries.find(t => t.id === 'treasury-cash-main' || t.name.includes('النقدي') || t.name.includes('كاشير')) || treasuries[0];

  return (
    <div className="flex flex-col bg-slate-100 w-full animate-in fade-in pb-20" dir="rtl">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-b-3xl shadow-lg relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          {/* Quick Search Input Directly Below */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث عن أي شاشة، فاتورة، تقرير، أو أمر..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl py-2.5 pr-10 pl-9 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PWA Offline Installation Banner (if available and not installed) */}
      {!isInstalled && installPrompt && (
        <div className="mx-3 mt-3 bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-3 rounded-2xl border border-blue-700 shadow-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-blue-500/30 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-blue-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold">تثبيت التطبيق على الهاتف</h4>
              <p className="text-[10px] text-blue-200 truncate">يعمل بدون متصفح مع دعم العمل أوفلاين</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-xl font-bold shrink-0 shadow-xs"
          >
            تثبيت الآن
          </button>
        </div>
      )}

      {/* Quick Stats Pills */}
      {!searchQuery && (
        <div className="grid grid-cols-2 gap-2 px-3 mt-3 shrink-0">
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 block">فواتير اليوم</span>
              <span className="text-xs font-black text-slate-800 font-mono">
                {invoices.length} فاتورة
              </span>
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 block">رصيد الصندوق</span>
              <span className="text-xs font-black text-emerald-600 font-mono truncate block">
                {(mainTreasury?.balance || 0).toFixed(2)} ₪
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Shortcuts (Fast Actions) */}
      {!searchQuery && (
        <div className="px-3 mt-4 shrink-0">
          <h2 className="text-xs font-bold text-slate-700 mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>الاختصارات الرئيسية السريعة</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTab('pos')}
              className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-slate-800 hover:border-emerald-500"
            >
              <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-xs">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <span className="font-bold text-[11px] text-center">كاشير سريع</span>
            </button>

            <button
              onClick={() => setActiveTab('receipt_vouchers')}
              className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-slate-800 hover:border-blue-500"
            >
              <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-xs">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <span className="font-bold text-[11px] text-center">سند قبض</span>
            </button>

            <button
              onClick={() => setActiveTab('payment_vouchers')}
              className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-slate-800 hover:border-rose-500"
            >
              <div className="w-10 h-10 bg-rose-600 text-white rounded-xl flex items-center justify-center shadow-xs">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
              <span className="font-bold text-[11px] text-center">سند صرف</span>
            </button>

            <button
              onClick={() => setActiveTab('print_orders')}
              className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-slate-800 hover:border-purple-500"
            >
              <div className="w-10 h-10 bg-purple-600 text-white rounded-xl flex items-center justify-center shadow-xs">
                <Printer className="w-5 h-5" />
              </div>
              <span className="font-bold text-[11px] text-center">أمر مطبعة</span>
            </button>

            <button
              onClick={() => setActiveTab('report_customer_statement')}
              className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-slate-800 hover:border-amber-500"
            >
              <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <span className="font-bold text-[11px] text-center">كشف عميل</span>
            </button>

            <button
              onClick={() => setActiveTab('invoices')}
              className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all text-slate-800 hover:border-indigo-500"
            >
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <span className="font-bold text-[11px] text-center">الفواتير</span>
            </button>
          </div>
        </div>
      )}

      {/* Menu / Search Results List */}
      <div className="px-3 mt-4 flex-1">
        <h2 className="text-xs font-bold text-slate-700 mb-2">
          {searchQuery ? `نتائج البحث عن (${searchQuery})` : 'كافة القوائم والشاشات'}
        </h2>
        <div className="space-y-1.5">
          {filteredMenus.map(menu => {
            const Icon = menu.icon;
            return (
              <button
                key={menu.id}
                onClick={() => setActiveTab(menu.id)}
                className="w-full bg-white p-2.5 rounded-2xl shadow-xs border border-slate-200/90 flex items-center justify-between active:scale-98 transition-all hover:border-blue-400"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={`w-8 h-8 ${menu.color} text-white rounded-xl flex items-center justify-center shrink-0 shadow-xs`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-right min-w-0 flex-1">
                    <span className="font-bold text-xs text-slate-800 truncate block">
                      {menu.label}
                    </span>
                    {menu.sublabel && (
                      <span className="text-[9px] text-slate-400 truncate block">
                        {menu.sublabel}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0 mr-1" />
              </button>
            );
          })}

          {filteredMenus.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">لم يتم العثور على أي شاشة مطابقة للبحث "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
