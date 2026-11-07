import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Printer,
  FileText,
  Boxes,
  Truck,
  Users,
  UserCheck,
  Wallet,
  BookOpenCheck,
  BarChart3,
  Settings,
  Plus,
  Download,
  RotateCcw,
  Sparkles,
  Clock,
  AlertTriangle,
  Building2,
  ShieldCheck,
  Store,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Layers,
  ArrowRightLeft,
  Check,
  Receipt,
  History,
  X,
  Search,
  LogOut,
  ArrowRight,
  Calculator,
  UserPlus,
  Compass,
  FileSpreadsheet,
  Coins
} from 'lucide-react';

interface SubMenuItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  badge?: string | null;
  badgeColor?: string;
  perm?: string;
}

interface MainMenuSection {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  items: SubMenuItem[];
}

interface MobileNavigationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileNavigationModal: React.FC<MobileNavigationModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    activeTab,
    setActiveTab,
    settings,
    currentUser,
    users,
    hasPermission
  } = useAccounting();

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Reset internal states when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedSectionId(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Complete list of Sections and Sub-items
  const mainSections: MainMenuSection[] = useMemo(() => [
    {
      id: 'control_panel_menu',
      title: 'لوحة التحكم والمؤشرات',
      subtitle: 'الشاشة الرئيسية والمؤشرات الحية والتحليلات العامة',
      icon: LayoutDashboard,
      colorClass: 'text-blue-500',
      bgClass: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
      items: [
        {
          id: 'home',
          label: '1. الشاشة الرئيسية',
          sublabel: 'اختصارات سريعة للعمليات الدائمة وكشوف الحسابات والفواتير',
          icon: Sparkles,
          badge: 'رئيسية',
          badgeColor: 'bg-blue-500/20 text-blue-300',
          perm: 'view_dashboard'
        },
        {
          id: 'dashboard',
          label: '2. لوحة المعلومات والتحليلات',
          sublabel: 'إحصائيات المبيعات، الصناديق، البنوك، والأرباح التقديرية',
          icon: LayoutDashboard,
          perm: 'view_dashboard'
        }
      ]
    },
    {
      id: 'sales_menu',
      title: 'المبيعات ونقاط البيع والعملاء',
      subtitle: 'الكاشير السريع، أوامر الورشة، فواتير المبيعات، والذمم',
      icon: ShoppingCart,
      colorClass: 'text-emerald-500',
      bgClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
      items: [
        {
          id: 'pos',
          label: '1. نقطة البيع السريعة (الكاشير)',
          sublabel: 'إصدار فواتير الكاشير الفورية ودعم شاشات اللمس والباركود',
          icon: ShoppingCart,
          badge: 'سريع',
          badgeColor: 'bg-emerald-500/20 text-emerald-300',
          perm: 'view_pos'
        },
        {
          id: 'print_orders',
          label: '2. أوامر تشغيل المطبعة والورشة',
          sublabel: 'متابعة مراحل الإنتاج، المقاسات، الخامات، ومراحل التسليم',
          icon: Printer,
          perm: 'view_print_orders'
        },
        {
          id: 'parties',
          label: '3. العملاء والمدينون والجهات',
          sublabel: 'دليل العملاء، الأرصدة الافتتاحية، وسقوف الائتمان',
          icon: Users,
          perm: 'view_settings'
        },
        {
          id: 'invoices',
          label: '4. سجل فواتير المبيعات الشامل',
          sublabel: 'أرشيف كافة الفواتير النقدية والآجلة مع خيارات التعديل والطباعة',
          icon: FileText,
          perm: 'view_invoices'
        },
        {
          id: 'sales_returns',
          label: '5. مردودات وإرجاعات المبيعات',
          sublabel: 'إرجاع بضاعة من فواتير مبيعات سابقة وتسوية حساب العميل',
          icon: RotateCcw,
          perm: 'view_invoices'
        },
        {
          id: 'receipt_vouchers',
          label: '6. سندات القبض والتحصيل المالي',
          sublabel: 'قبض مبالغ نقدية أو بنكية من العملاء وإيداعها بالصندوق',
          icon: Receipt,
          perm: 'view_accounting'
        }
      ]
    },
    {
      id: 'purchases_expenses_menu',
      title: 'المشتريات والمصروفات والموردين',
      subtitle: 'فواتير المشتريات، الموردين، المصاريف التشغيلية، ومردودات المشتريات',
      icon: Truck,
      colorClass: 'text-amber-500',
      bgClass: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      items: [
        {
          id: 'purchases',
          label: '1. الموردون وإدارة الدائنين',
          sublabel: 'دليل الموردين، بيانات التواصل، والأرصدة المستحقة',
          icon: Users,
          perm: 'view_inventory'
        },
        {
          id: 'purchases_invoices',
          label: '2. فواتير المشتريات وتوريد البضاعة',
          sublabel: 'إدخال مشتريات الخامات والبضائع وتحديث كميات المخزون آلياً',
          icon: FileText,
          perm: 'view_inventory'
        },
        {
          id: 'purchases_returns',
          label: '3. مردودات وإرجاعات المشتريات',
          sublabel: 'إرجاع أصناف لمورد وتخفيض رصيده أو استرداد المبلغ',
          icon: RotateCcw,
          perm: 'view_inventory'
        },
        {
          id: 'payment_vouchers',
          label: '4. سندات الصرف وسداد الموردين',
          sublabel: 'صرف مبالغ نقدية أو شيكات للموردين أو سداد التزامات مالية',
          icon: Wallet,
          perm: 'view_accounting'
        },
        {
          id: 'expenses',
          label: '5. المصروفات التشغيلية والنثرية',
          sublabel: 'إيجارات، كهرباء، صيانة، بوفيه، ونثريات المصنع والمنشأة',
          icon: Coins,
          perm: 'view_accounting'
        }
      ]
    },
    {
      id: 'items_menu',
      title: 'الأصناف والمستودعات والمخازن',
      subtitle: 'دليل الأصناف، الأسعار، الجرد، والتحويل بين الفروع والمستودعات',
      icon: Boxes,
      colorClass: 'text-indigo-500',
      bgClass: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
      items: [
        {
          id: 'inventory',
          label: '1. دليل الأصناف والمنتجات والخدمات',
          sublabel: 'تسجيل الأصناف، الباركود، أسعار البيع والشراء، وحدود الأمان',
          icon: Boxes,
          perm: 'view_inventory'
        },
        {
          id: 'warehouses',
          label: '2. حركات المستودعات والتحويل المخزني',
          sublabel: 'التحويل بين المستودعات، التسويات الجردية، وتالف البضاعة',
          icon: Layers,
          perm: 'view_inventory'
        }
      ]
    },
    {
      id: 'hr_menu',
      title: 'الموارد البشرية وشؤون الموظفين',
      subtitle: 'سجل الموظفين، السلف والاستقطاعات، ومسيرات الرواتب الشهرية',
      icon: UserCheck,
      colorClass: 'text-purple-500',
      bgClass: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
      items: [
        {
          id: 'employees',
          label: '1. سجل وبيانات الموظفين',
          sublabel: 'إدارة ملفات الموظفين، الرواتب الأساسية، والبيانات المهنية',
          icon: UserCheck,
          perm: 'view_settings'
        },
        {
          id: 'employees_adjustments',
          label: '2. السلف والمكافآت والخصومات',
          sublabel: 'تسجيل السلف المالية، ساعات العمل الإضافي، والاستقطاعات',
          icon: Wallet,
          perm: 'view_settings'
        },
        {
          id: 'employees_payroll',
          label: '3. كشف ومسيرات الرواتب الشهرية',
          sublabel: 'احتساب وصرف الرواتب واعتماد القيود المحاسبية التلقائية',
          icon: FileText,
          perm: 'view_settings'
        },
        {
          id: 'report_employee_statement',
          label: '4. كشف حساب تفصيلي للموظف',
          sublabel: 'متابعة كافة المستحقات والمسحوبات والسلف لكل موظف',
          icon: BookOpenCheck,
          perm: 'view_reports'
        }
      ]
    },
    {
      id: 'finance_accounting_menu',
      title: 'المالية والحسابات والصناديق والبنوك',
      subtitle: 'حركة الصناديق، الحسابات البنكية، مقاصات الديون، وشجرة الحسابات',
      icon: Wallet,
      colorClass: 'text-teal-500',
      bgClass: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
      items: [
        {
          id: 'treasuries',
          label: '1. الصناديق النقدية والحسابات البنكية',
          sublabel: 'متابعة السيولة النقدية، أرصدة البنوك، والتحويل بين الخزائن',
          icon: Wallet,
          perm: 'view_accounting'
        },
        {
          id: 'debt_clearing',
          label: '2. مقاصة وتسوية الديون المتبادلة',
          sublabel: 'تسوية حسابات الجهات التي تعمل كعميل ومورد في آن واحد',
          icon: ArrowRightLeft,
          perm: 'view_accounting'
        },
        {
          id: 'branches',
          label: '3. إدارة الفروع والمراكز المالية',
          sublabel: 'تخصيص الفروع، وتعيين المخازن والصناديق التابعة لكل فرع',
          icon: Store,
          perm: 'view_settings'
        },
        {
          id: 'accounting',
          label: '4. القيود المحاسبية ودليل الحسابات',
          sublabel: 'شجرة الحسابات المالية، قيود اليومية اليدوية، وميزان المراجعة',
          icon: BookOpenCheck,
          perm: 'view_accounting'
        }
      ]
    },
    {
      id: 'reports_menu',
      title: 'التقارير المركزية وكشوف الحسابات',
      subtitle: 'كشوف حسابات العملاء والموردين، حركة الصناديق، والأرباح والضرائب',
      icon: BarChart3,
      colorClass: 'text-sky-500',
      bgClass: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
      items: [
        {
          id: 'report_customer_statement',
          label: '1. كشف حساب تفصيلي لعميل',
          sublabel: 'حركة فواتير وسندات ودفعات العميل مع الرصيد التراكمي',
          icon: BookOpenCheck,
          perm: 'view_reports'
        },
        {
          id: 'report_customer_items',
          label: '2. كشف مسحوبات أصناف لعميل',
          sublabel: 'تفاصيل مشتريات العميل حسب الصنف والكمية وتاريخ السحب',
          icon: FileSpreadsheet,
          perm: 'view_reports'
        },
        {
          id: 'report_supplier_statement',
          label: '3. كشف حساب تفصيلي لمورد',
          sublabel: 'حركة فواتير الشراء وسندات الصرف والدفعات الموردة',
          icon: BookOpenCheck,
          perm: 'view_reports'
        },
        {
          id: 'report_supplier_items',
          label: '4. كشف توريدات أصناف من مورد',
          sublabel: 'تفاصيل الأصناف الموردة من مورد محدد مع الأسعار والكميات',
          icon: FileSpreadsheet,
          perm: 'view_reports'
        },
        {
          id: 'report_receipt_vouchers',
          label: '5. كشف تفصيلي لسندات القبض',
          sublabel: 'تفاصيل التحصيلات والمقبوضات النقدية والبنكية بالخزائن',
          icon: Receipt,
          perm: 'view_reports'
        },
        {
          id: 'report_payment_vouchers',
          label: '6. كشف تفصيلي لسندات الصرف',
          sublabel: 'تفاصيل المدفوعات والمنصرفات النقدية والبنكية والمصاريف',
          icon: Wallet,
          perm: 'view_reports'
        },
        {
          id: 'report_treasuries_movement',
          label: '7. كشف تفصيلي لحركة الصناديق',
          sublabel: 'حركة الصناديق والتدفقات النقدية والبنكية الداخلة والخارجة',
          icon: Wallet,
          perm: 'view_reports'
        },
        {
          id: 'reports',
          label: '8. المركز الشامل للتقارير والتحليلات',
          sublabel: 'لوحة التقارير المركزية والضرائب وقوائم الدخل والمبيعات',
          icon: BarChart3,
          perm: 'view_reports'
        }
      ]
    },
    {
      id: 'settings_menu',
      title: 'إعدادات المنشأة والنظام والمستخدمين',
      subtitle: 'البيانات الرسمية، المستخدمين والصلاحيات، ونسخ وتصفير البيانات',
      icon: Settings,
      colorClass: 'text-rose-500',
      bgClass: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
      items: [
        {
          id: 'users_permissions',
          label: '1. المستخدمون والصلاحيات الأمنية',
          sublabel: 'إدارة حسابات المستخدمين والأدوار والصلاحيات الممنوحة',
          icon: ShieldCheck,
          badge: users.length > 0 ? `${users.length}` : null,
          badgeColor: 'bg-emerald-500/20 text-emerald-300',
          perm: 'view_settings'
        },
        {
          id: 'settings_general',
          label: '2. البيانات الرسمية والضريبية والختم',
          sublabel: 'اسم المنشأة، السجل التجاري، الرقم الضريبي، والختم الرسمي',
          icon: Settings,
          perm: 'view_settings'
        },
        {
          id: 'settings_sql',
          label: '3. الربط والتشغيل المحلي SQL',
          sublabel: 'إعدادات الاتصال المباشر بقاعدة بيانات SQL المحلية',
          icon: Layers,
          perm: 'view_settings'
        },
        {
          id: 'settings_backup',
          label: '4. النسخ الاحتياطي وتصفير البيانات',
          sublabel: 'تصدير واستيراد قواعد البيانات وإجراءات التصفير والصيانة',
          icon: Download,
          perm: 'view_settings'
        }
      ]
    }
  ], [users.length]);

  // Quick Shortcuts for top requested features ("اختصارات سريعة للأكثر طلباً")
  const quickShortcuts = useMemo(() => [
    { id: 'pos', label: 'الكاشير السريع', icon: ShoppingCart, color: 'bg-emerald-600 text-white' },
    { id: 'report_customer_statement', label: 'كشف حساب عميل', icon: BookOpenCheck, color: 'bg-blue-600 text-white' },
    { id: 'invoices', label: 'فواتير المبيعات', icon: FileText, color: 'bg-indigo-600 text-white' },
    { id: 'receipt_vouchers', label: 'سند قبض مالي', icon: Receipt, color: 'bg-teal-600 text-white' },
    { id: 'print_orders', label: 'أوامر الورشة', icon: Printer, color: 'bg-amber-600 text-white' },
    { id: 'inventory', label: 'جرد الأصناف', icon: Boxes, color: 'bg-purple-600 text-white' },
    { id: 'payment_vouchers', label: 'سند صرف مالي', icon: Wallet, color: 'bg-rose-600 text-white' },
    { id: 'report_supplier_statement', label: 'كشف حساب مورد', icon: Users, color: 'bg-slate-700 text-white' }
  ], []);

  // Filter all items when user searches
  const allSubItems = useMemo(() => {
    const list: (SubMenuItem & { sectionTitle: string })[] = [];
    mainSections.forEach(section => {
      section.items.forEach(item => {
        list.push({ ...item, sectionTitle: section.title });
      });
    });
    return list;
  }, [mainSections]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return allSubItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(q)) ||
      item.sectionTitle.toLowerCase().includes(q)
    );
  }, [allSubItems, searchQuery]);

  const activeSection = useMemo(() => {
    return mainSections.find(s => s.id === selectedSectionId) || null;
  }, [mainSections, selectedSectionId]);

  const handleSelectItem = (tabId: string) => {
    setActiveTab(tabId);
    onClose();
  };

  const handleSignOut = () => {
    if (window.confirm('هل تريد تسجيل الخروج من النظام؟')) {
      import('../firebase').then(({ auth }) => auth.signOut());
      localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');
      localStorage.removeItem('active_session_id');
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-[#0f172a] text-slate-100 w-full h-[94vh] sm:h-auto sm:max-h-[90vh] sm:max-w-xl mx-auto rounded-t-3xl sm:rounded-3xl border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250">
        {/* ========================================================================= */}
        {/* TOP HEADER: System Name, Enterprise, User Info & Logout Button            */}
        {/* برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - اسم المستخدم والوظيفة - خروج  */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3.5 border-b border-slate-700/80 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-md shrink-0 border border-blue-400/30">
                P
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[14px] font-black text-white tracking-tight truncate">
                    {settings.appTitle || 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - م.رائد صالحة'}
                  </h2>
                </div>
                <p className="text-[11px] font-bold text-blue-400 truncate mt-0.5">
                  {settings.businessName || settings.companyName || 'مطبعة ومكتبة لبنان'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 truncate">
                  <span className="text-slate-300 font-semibold">{currentUser?.fullName || 'م. رائد صالحة'}</span>
                  <span>•</span>
                  <span className="bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded border border-slate-700 font-mono">
                    {currentUser?.roleName || 'مدير النظام'}
                  </span>
                </div>
              </div>
            </div>

            {/* Logout Icon & Close Action */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSignOut}
                className="w-8 h-8 rounded-xl bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 flex items-center justify-center transition-all cursor-pointer shadow-xs"
                title="تسجيل الخروج من النظام"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition-all cursor-pointer"
                title="إغلاق القائمة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SEARCH BAR: Quick Commands Search                                         */}
        {/* شريط البحث عن الأوامر وكشوف الحسابات والفواتير                            */}
        {/* ========================================================================= */}
        <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 shrink-0 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث عن أمر أو شاشة... مثل: كشف حساب عميل، فاتورة، سند قبض..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (selectedSectionId) setSelectedSectionId(null);
              }}
              className="w-full bg-slate-800/90 border border-slate-700 focus:border-blue-500 rounded-xl pr-9 pl-8 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Shortcuts ("اختصارات سريعة للأكثر طلباً") */}
          {!searchQuery && !selectedSectionId && (
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5 px-0.5">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>الأكثر طلباً واستخداماً:</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {quickShortcuts.map((qs) => {
                  const Icon = qs.icon;
                  return (
                    <button
                      key={qs.id}
                      onClick={() => handleSelectItem(qs.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all active:scale-95 shadow-xs ${qs.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{qs.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* MAIN BODY: Search Results OR Sub-Menu View OR Main Section Buttons        */}
        {/* ========================================================================= */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {searchQuery ? (
            /* 1. Search Results List */
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-blue-400 px-1">
                نتائج البحث عن ({searchQuery}) - {searchResults.length} أمر:
              </div>
              {searchResults.length > 0 ? (
                searchResults.map((item) => {
                  const ItemIcon = item.icon;
                  const isCurActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item.id)}
                      className={`w-full text-right p-2.5 rounded-xl border flex items-start gap-3 transition-all cursor-pointer ${
                        isCurActive
                          ? 'bg-blue-600 border-blue-500 text-white font-bold'
                          : 'bg-slate-800/80 border-slate-700/70 hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isCurActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-blue-400'
                      }`}>
                        <ItemIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{item.label}</span>
                          <span className="text-[9px] text-slate-400 font-normal">{item.sectionTitle}</span>
                        </div>
                        {item.sublabel && (
                          <p className={`text-[10px] mt-0.5 line-clamp-1 ${isCurActive ? 'text-blue-100' : 'text-slate-400'}`}>
                            {item.sublabel}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">لا توجد أوامر مطابقة لكلمة البحث</p>
                </div>
              )}
            </div>
          ) : selectedSectionId && activeSection ? (
            /* 2. Sub-Menu View with Back Button ("زر صغير للعودة") */
            <div className="space-y-2 animate-in fade-in duration-150">
              {/* Return / Back Button */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <button
                  onClick={() => setSelectedSectionId(null)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white text-xs font-bold transition-colors cursor-pointer border border-slate-700"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>العودة للقوائم الرئيسية</span>
                </button>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <span>{activeSection.title}</span>
                </div>
              </div>

              {/* Sub-Buttons List */}
              <div className="space-y-1.5 pt-1">
                {activeSection.items.map((subItem) => {
                  const SubIcon = subItem.icon;
                  const isSubActive = activeTab === subItem.id;
                  return (
                    <button
                      key={subItem.id}
                      onClick={() => handleSelectItem(subItem.id)}
                      className={`w-full text-right p-2.5 rounded-xl border flex items-start gap-3 transition-all cursor-pointer active:scale-[0.99] ${
                        isSubActive
                          ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-md'
                          : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isSubActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-blue-400'
                      }`}>
                        <SubIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{subItem.label}</span>
                          {subItem.badge && (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold font-mono ${
                              isSubActive ? 'bg-white/20 text-white' : subItem.badgeColor || 'bg-slate-700 text-slate-300'
                            }`}>
                              {subItem.badge}
                            </span>
                          )}
                        </div>
                        {subItem.sublabel && (
                          <p className={`text-[10px] mt-0.5 leading-snug line-clamp-2 ${
                            isSubActive ? 'text-blue-100' : 'text-slate-400'
                          }`}>
                            {subItem.sublabel}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 3. Main 8 Category Buttons Grid/List */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {mainSections.map((section) => {
                const SecIcon = section.icon;
                const hasActiveTab = section.items.some(it => it.id === activeTab);
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSectionId(section.id)}
                    className={`w-full text-right p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all active:scale-95 cursor-pointer shadow-sm ${
                      hasActiveTab
                        ? 'bg-gradient-to-br from-slate-800 to-slate-800/90 border-blue-500/80 ring-1 ring-blue-500/50'
                        : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/70 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${section.bgClass}`}>
                        <SecIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-xs text-white truncate">
                          {section.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                          {section.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info strip */}
        <div className="p-2.5 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
          <span>نظام المحاسبة الشامل v2.4</span>
          <span>اضغط على أي قسم لعرض عملياته</span>
        </div>
      </div>
    </div>
  );
};
