import React, { useState, useRef, useEffect } from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import { MobileNavigationModal } from './MobileNavigationModal';
import { useAccounting } from '../context/AccountingContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Printer,
  FileText,
  FileSpreadsheet,
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
  PackageCheck,
  Layers,
  ArrowRightLeft,
  Check,
  Receipt,
  History,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  CheckCircle2,
  HardDrive,
  CalendarCheck,
  ShieldAlert,
  Menu,
  ArrowRight,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Minus,
  Square,
  Calculator,
  HelpCircle,
  Info
} from 'lucide-react';
import { CalculatorModal } from './pos/CalculatorModal';
import { AboutAppModal } from './AboutAppModal';
import { FirebaseQuotaModal } from './FirebaseQuotaModal';
import { LocalDatabaseModal } from './LocalDatabaseModal';
import { ServerOff } from 'lucide-react';

interface SubMenuItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  badge?: string | null;
  badgeColor?: string;
}

interface TopMenuSection {
  id: string;
  title: string;
  icon?: React.ElementType;
  items: SubMenuItem[];
}

export const Navbar: React.FC = () => {
  const {
    forcePushAndPullSync,
    activeTab,
    setActiveTab,
    goBack,
    canGoBack,
    currencies,
    updateCurrencyRate,
    settings,
    stats,
    exportDataJSON,
    resetAllData,
    branches,
    activeBranchId,
    setActiveBranchId,
    getActiveBranch,
    warehouses,
    warehouseOperations,
    users,
    currentUserId,
    setCurrentUserId,
    currentUser,
    getAllowedBranchesForUser,
    isOnline,
    isLocalOnlyMode,
    lastSyncTime,
    isFirebaseSyncing,
    lastFirebaseSyncTime,
    hasUnsyncedChanges,
    pendingSyncCount,
    lastLocalSaveTime,
    forceSyncNow,
    hasPermission,
    importMasterDatabaseSnapshot,
    syncCoordinatorState,
    openConflictModal
  } = useAccounting();

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isLocalDbModalOpen, setIsLocalDbModalOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; success: boolean } | null>(null);

  const isSessionAdmin = Boolean(
    localStorage.getItem('alnoor_press_accounting_v1_session_admin') === 'true' ||
    localStorage.getItem('alnoor_press_accounting_v1_logged_in_user_id') === 'usr-1' ||
    localStorage.getItem('auth_type') === 'firebase'
  );

  const isAdmin = Boolean(
    currentUser?.roleId === 'role-admin' ||
    currentUser?.id === 'usr-1' ||
    currentUser?.id === 'user-1789170883526' ||
    currentUser?.email === 'admin@example.invalid' ||
    currentUser?.email === 'press@example.invalid' ||
    currentUser?.username?.toLowerCase().includes('lobnan') ||
    currentUser?.username?.toLowerCase().includes('raid') ||
    currentUser?.roleName === 'مدير النظام' ||
    isSessionAdmin
  );

  const handleManualSync = async () => {
    const res = await forceSyncNow();
    setSyncFeedback(res);
    setTimeout(() => setSyncFeedback(null), 4500);
  };

  const handleImportMasterSnapshot = async () => {
    if (window.confirm('هل تريد استيعاب واعتماد أحدث نسخة رئيسية لقاعدة البيانات فوراً؟ (سيتم تحميل كافة الفواتير والبيانات المحدثة)')) {
      const res = await importMasterDatabaseSnapshot();
      setSyncFeedback(res);
    }
  };

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleExitApp = () => {
    if (window.confirm('هل تريد إغلاق جلسة العمل وتسجيل الخروج من البرنامج؟')) {
      import('../firebase').then(({ auth }) => auth.signOut());
      localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');
      localStorage.removeItem('active_session_id');
      window.location.reload();
    }
  };

  const navRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<any>(null);

  const activeBranch = getActiveBranch() || branches[0];
  const allowedBranches = getAllowedBranchesForUser(currentUser);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        setOpenDropdownId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        setOpenDropdownId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const todayArabic = new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date());

  // Definition of Dropdown Menus in the Top Row matching user exact specifications
  const menuSections: TopMenuSection[] = [
    {
      id: 'control_panel_menu',
      title: 'لوحة التحكم',
      icon: LayoutDashboard,
      items: [
        {
          id: 'home',
          label: '1. الشاشة الرئيسية',
          sublabel: 'اختصارات سريعة للعمليات الدائمة وكشوف الحسابات والفواتير',
          icon: Sparkles,
          badge: 'سريعة ومخصصة',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        },
        {
          id: 'dashboard',
          label: '2. لوحة المعلومات',
          sublabel: 'الأرصدة الشاملة وحركة المبيعات والصندوق والمؤشرات المالية',
          icon: LayoutDashboard,
          badge: 'الأرصدة والتحليلات',
          badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
        }
      ]
    },
    // 1. المبيعات : قائمة منسدلة
    {
      id: 'sales_menu',
      title: 'المبيعات',
      icon: ShoppingCart,
      items: [
        {
          id: 'pos',
          label: '1. الكاشير / نقطة البيع',
          sublabel: 'نقاط البيع السريعة والتحصيل الفوري والنقدي والآجل',
          icon: ShoppingCart,
          badge: 'سريع',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        },
        {
          id: 'print_orders',
          label: '2. أوامر الطباعة والورشة',
          sublabel: 'إدارة أوامر التصنيع وتذاكر العمل ومراحل الإنجاز والتسليم',
          icon: Printer,
          badge: (stats?.pendingPrintJobs ?? 0) > 0 ? `${stats.pendingPrintJobs}` : null,
          badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
        },
        {
          id: 'parties',
          label: '3. العملاء',
          sublabel: 'بيانات العملاء وأرصدة الذمم والمديونيات وكشوف الحساب',
          icon: Users
        },
        {
          id: 'invoices',
          label: '4. فواتير المبيعات',
          sublabel: 'استعراض وطباعة فواتير المبيعات المعتمدة والتحصيل',
          icon: FileText
        },
        {
          id: 'excel_drafts',
          label: '5. مسودات فواتير Excel و OneDrive',
          sublabel: 'استيراد الجداول وإضافة وتعديل البنود للزبون واعتماد الفواتير بالتتابع',
          icon: FileSpreadsheet,
          badge: 'شاشة مخصصة',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        },
        {
          id: 'daily_entry_sheet',
          label: '6. كشف إدخال يومي',
          sublabel: 'جدول حركات كل يوم عمل للزبائن والأصناف والتحصيل وترحيلها لمسودات الفواتير',
          icon: CalendarCheck,
          badge: 'جديد',
          badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
        },
        {
          id: 'sales_returns',
          label: '7. مرتجع فواتير المبيعات',
          sublabel: 'إصدار إشعارات دائنة واسترداد المبالغ وإرجاع البضائع للمخزن',
          icon: RotateCcw,
          badge: (stats?.salesReturnsCount ?? 0) > 0 ? `${stats.salesReturnsCount}` : null,
          badgeColor: 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
        },
        {
          id: 'receipt_vouchers',
          label: '6. سند قبض',
          sublabel: 'تحرير وطباعة سندات القبض وتحصيل الدفعات المالية',
          icon: Receipt
        },
        {
          id: 'special_invoice',
          label: '7. فاتورة مبيعات خاصة',
          sublabel: 'إنشاء وطباعة فاتورة مبيعات خاصة بتصميم مخصص',
          icon: FileText
        }
      ]
    },
    // 2. المشتريات والمصروفات : قائمة منسدلة
    {
      id: 'purchases_expenses_menu',
      title: 'المشتريات والمصروفات',
      icon: Truck,
      items: [
        {
          id: 'purchases_suppliers',
          label: '1. الموردين',
          sublabel: 'سجل الموردين وأرصدة الالتزامات والمستحقات الضريبية',
          icon: Truck
        },
        {
          id: 'purchases_invoices',
          label: '2. فاتورة شراء',
          sublabel: 'تسجيل فواتير شراء الخامات والمستلزمات وتحديث المخزون',
          icon: FileText
        },
        {
          id: 'purchases_returns',
          label: '3. مرتجع فاتورة شراء',
          sublabel: 'مردودات المشتريات وإصدار إشعارات مدينة وتخفيض مديونية المورد',
          icon: RotateCcw
        },
        {
          id: 'payment_vouchers',
          label: '4. سند صرف',
          sublabel: 'صرف مستحقات الموردين والعهد وتسديد الدفعات المالية',
          icon: Wallet
        },
        {
          id: 'expenses',
          label: '5. المصروفات',
          sublabel: 'تسجيل مصروفات الإيجار والكهرباء والرواتب والتشغيل اليومي',
          icon: ArrowRightLeft
        }
      ]
    },
    // 3. الأصناف : قائمة منسدلة
    {
      id: 'items_menu',
      title: 'الأصناف',
      icon: Boxes,
      items: [
        {
          id: 'inventory',
          label: '1. قائمة الأصناف وبطاقات المخزون',
          sublabel: 'بطاقات الأصناف وألواح الورق والأحبار وحدود الأمان والجرد',
          icon: Boxes,
          badge: stats.lowStockCount > 0 ? `${stats.lowStockCount} نواقص` : null,
          badgeColor: 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
        },
        {
          id: 'warehouses',
          label: '2. حركات وأذون المخازن',
          sublabel: 'أذون الصرف والتوريد والتحويلات المخزنية بين الفروع',
          icon: PackageCheck
        }
      ]
    },
    // 4. الموظفون والموارد البشرية : قائمة منسدلة
    {
      id: 'hr_menu',
      title: 'الموظفون والموارد البشرية',
      icon: UserCheck,
      items: [
        {
          id: 'employees',
          label: '1. سجل الموظفين وبيانات العمل',
          sublabel: 'سجلات العاملين والأقسام والرواتب والبيانات الشخصية',
          icon: Users,
          badge: stats.totalEmployeesCount > 0 ? `${stats.totalEmployeesCount}` : null,
          badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
        },
        {
          id: 'employees_adjustments',
          label: '2. السلف والاستقطاعات والمكافآت',
          sublabel: 'تسجيل سلف الموظفين والخصومات الشهرية والحوافز المالية',
          icon: Wallet
        },
        {
          id: 'employees_payroll',
          label: '3. مسيرات الرواتب وصرف المستحقات',
          sublabel: 'إعداد واعتماد مسير الرواتب الشهري والصرف النقدي والبنكي',
          icon: FileText
        },
        {
          id: 'report_employee_statement',
          label: '4. كشف حساب تفصيلي موظف',
          sublabel: 'تقرير شامل لاستحقاقات وسلف وخصومات الموظف وصافي المستحق',
          icon: UserCheck
        }
      ]
    },
    // 5. المالية والمحاسبة : قائمة منسدلة
    {
      id: 'finance_accounting_menu',
      title: 'المالية والمحاسبة',
      icon: Wallet,
      items: [
        {
          id: 'branches',
          label: '1. الفروع والشركات',
          sublabel: 'إدارة الفروع والمراكز المتعددة والربط المالي والصلاحيات',
          icon: Building2,
          badge: branches.length > 0 ? `${branches.length}` : null,
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
        },
        {
          id: 'warehouses',
          label: '2. المخازن والمستودعات',
          sublabel: 'المستودعات المتعددة والتحويلات وأذون الصرف والتوريد',
          icon: PackageCheck,
          badge: warehouseOperations.length > 0 ? `${warehouseOperations.length}` : null,
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
        },
        {
          id: 'treasuries',
          label: '3. الصناديق والعملات',
          sublabel: 'حركة الخزينة النقدية والحسابات البنكية وأسعار العملات',
          icon: Wallet,
          badge: stats.treasuriesCount > 0 ? `${stats.treasuriesCount}` : null,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        },
        {
          id: 'debt_clearing',
          label: '4. مقاصة بين عميل ومورد',
          sublabel: 'تسوية المديونيات المتبادلة بين طرف عميل ومورد بقيد آلي',
          icon: ArrowRightLeft
        },
        {
          id: 'accounting',
          label: '5. القيود ودفتر الأستاذ',
          sublabel: 'القيود المحاسبية المزدوجة ودليل الحسابات وميزان المراجعة',
          icon: BookOpenCheck,
          badge: 'مزدوج',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
        },
        {
          id: 'sync_statement',
          label: '6. سند وتدقيق المزامنة مع السيرفر',
          sublabel: 'كشف تفصيلي بما تم نقله للسيرفر وما تم جلبه وما لم يتم نقله وسجل الأخطاء',
          icon: Activity,
          badge: pendingSyncCount > 0 ? `${pendingSyncCount} معلق` : null,
          badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
        },
        {
          id: 'action_firebase_quota',
          label: '7. مؤشر وحاسبة استهلاك حصة فايربيس السحابية',
          sublabel: 'متابعة استهلاك العمليات اليومية (50k/20k) وميعاد التجديد 12:00 ظهراً',
          icon: Database,
          badge: 'مباشر',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        }
      ]
    },
    // 6. التقارير : قائمة منسدلة
    {
      id: 'reports_menu',
      title: 'التقارير',
      icon: BarChart3,
      items: [
        {
          id: 'report_customer_statement',
          label: '1. كشف حساب تفصيلي عميل',
          sublabel: 'كشف حركة حساب العميل الرئيسي والفرعي والأرصدة',
          icon: Users
        },
        {
          id: 'report_customer_items',
          label: '2. كشف حساب الأصناف للعميل',
          sublabel: 'تجميع أصناف العميل للفترة المحددة ومعدلات الشراء',
          icon: Boxes
        },
        {
          id: 'report_supplier_statement',
          label: '3. كشف حساب تفصيلي مورد',
          sublabel: 'كشف حركة حساب المورد الرئيسي والفرعي والدفعات',
          icon: Truck
        },
        {
          id: 'report_supplier_items',
          label: '4. كشف حساب الأصناف للمورد',
          sublabel: 'تجميع خامات وأصناف المورد للفترة المحددة',
          icon: Boxes
        },
        {
          id: 'report_receipt_vouchers',
          label: '5. كشف تفصيلي سندات القبض',
          sublabel: 'تفاصيل التحصيلات والمقبوضات النقدية والبنكية بالخزائن',
          icon: Receipt
        },
        {
          id: 'report_payment_vouchers',
          label: '6. كشف تفصيلي سندات الصرف',
          sublabel: 'تفاصيل المدفوعات والمنصرفات النقدية والبنكية والمصاريف',
          icon: Wallet
        },
        {
          id: 'report_employee_statement',
          label: '7. كشف حساب تفصيلي موظف',
          sublabel: 'استحقاقات الموظف والسلف والاستقطاعات وصافي المستحق',
          icon: UserCheck
        },
        {
          id: 'report_payroll_sheets',
          label: '8. كشف رواتب الموظفين',
          sublabel: 'مسيرات الرواتب الشهرية الشاملة والمبالغ المعتمدة',
          icon: FileText
        },
        {
          id: 'report_treasuries_movement',
          label: '9. كشف تفصيلي للصناديق',
          sublabel: 'حركة الصناديق والتدفقات النقدية والبنكية الداخلة والخارجة',
          icon: Wallet
        },
        {
          id: 'reports',
          label: '10. المركز الشامل للتقارير والتحليلات',
          sublabel: 'لوحة التقارير المركزية والضرائب وقوائم الدخل والمبيعات',
          icon: BarChart3
        }
      ]
    },
    // 7. إعدادات النظام والمنشأة : قائمة منسدلة
    {
      id: 'settings_menu',
      title: 'إعدادات النظام والمنشأة',
      icon: Settings,
      items: [
        {
          id: 'users_permissions',
          label: '1. المستخدمون والصلاحيات',
          sublabel: 'إدارة حسابات المستخدمين والأدوار والصلاحيات الأمنية',
          icon: ShieldCheck,
          badge: users.length > 0 ? `${users.length}` : null,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        },
        {
          id: 'settings_general',
          label: '2. البيانات الرسمية والضريبة',
          sublabel: 'اسم المنشأة والسجل التجاري والرقم الضريبي والعملة',
          icon: Settings
        },
        {
          id: 'settings_sql',
          label: '3. التشغيل المحلي وربط خادم SQL',
          sublabel: 'إعدادات الاتصال المباشر بقاعدة بيانات SQL المحلية',
          icon: Layers
        },
        {
          id: 'settings_backup',
          label: '4. النسخ الاحتياطي والصيانة',
          sublabel: 'تصدير واستيراد قواعد البيانات والصيانة الشاملة للسجلات',
          icon: Download
        }
      ]
    },
    // 8. المساعدة والدعم : قائمة منسدلة كلاسيكية
    {
      id: 'help_menu',
      title: 'مساعدة (H)',
      icon: HelpCircle,
      items: [
        {
          id: 'action_about',
          label: '1. حول البرنامج والترخيص',
          sublabel: 'معلومات إصدار سطح المكتب v2.5 ومواصفات النظام وقاعدة البيانات',
          icon: Info
        },
        {
          id: 'action_calculator',
          label: '2. الآلة الحاسبة القياسية',
          sublabel: 'فتح الآلة الحاسبة المدمجة لإجراء العمليات الحسابية السريعة',
          icon: Calculator
        },
        {
          id: 'settings_backup',
          label: '3. النسخ الاحتياطي للنظام',
          sublabel: 'تصدير نسخة احتياطية آمنة من كافة البيانات والفواتير',
          icon: Download
        }
      ]
    }
  ];

  const handleSelectSubItem = (itemId: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (itemId === 'action_about') {
      setIsAboutOpen(true);
      setOpenDropdownId(null);
      return;
    }
    if (itemId === 'action_calculator') {
      setIsCalculatorOpen(true);
      setOpenDropdownId(null);
      return;
    }
    if (itemId === 'action_firebase_quota') {
      setIsQuotaModalOpen(true);
      setOpenDropdownId(null);
      return;
    }
    setActiveTab(itemId);
    setOpenDropdownId(null);
  };

  const handleMouseEnter = (_sectionId: string) => {
    // Dropdowns do not open on hover; only upon explicit user click
  };

  const handleMouseLeave = () => {
    // Keep open until user clicks outside or selects an option
  };

  const toggleDropdown = (sectionId: string) => {
    setOpenDropdownId(prev => (prev === sectionId ? null : sectionId));
  };

  
  const filterMenuItems = (sections: TopMenuSection[]): TopMenuSection[] => {
    return sections.map(section => {
      const filteredItems = section.items.filter(item => {
        if (!item) return false;
        
        // Define screen permissions based on tab id
        let reqPerm: string | null = null;
        switch(item.id) {
          case 'home':
          case 'dashboard':
            reqPerm = 'view_dashboard';
            break;
          case 'pos':
            reqPerm = 'view_pos';
            break;
          case 'print_orders':
            reqPerm = 'view_print_orders';
            break;
          case 'invoices':
          case 'sales_returns':
            reqPerm = 'view_invoices';
            break;
          case 'inventory':
          case 'warehouses':
          case 'purchases':
          case 'purchases_invoices':
          case 'purchases_suppliers':
          case 'purchases_returns':
            reqPerm = 'view_inventory';
            break;
          case 'accounting':
          case 'receipt_vouchers':
          case 'payment_vouchers':
          case 'expenses':
          case 'debt_clearing':
          case 'treasuries':
            reqPerm = 'view_accounting';
            break;
          case 'reports':
          case 'report_customer_statement':
          case 'report_supplier_statement':
          case 'report_employee_statement':
          case 'report_customer_items':
          case 'report_supplier_items':
          case 'report_receipt_vouchers':
          case 'report_payment_vouchers':
          case 'report_payroll_sheets':
          case 'report_treasuries_movement':
            reqPerm = 'view_reports';
            break;
          case 'settings':
          case 'settings_general':
          case 'settings_sql':
          case 'settings_backup':
          case 'users_permissions':
          case 'branches':
          case 'parties':
          case 'employees':
          case 'employees_adjustments':
          case 'employees_payroll':
            reqPerm = 'view_settings';
            break;
        }
        
        if (reqPerm) {
           return hasPermission(reqPerm as any);
        }
        return true;
      });
      return { ...section, items: filteredItems };
    }).filter(section => section.items.length > 0);
  };

  const visibleMenuSections = filterMenuItems(menuSections);

  const isSectionActive = (section: TopMenuSection) => {
    if (section.id === 'control_panel_menu' && ['home', 'dashboard'].includes(activeTab)) return true;
    if (section.id === 'sales_menu' && ['pos', 'print_orders', 'parties', 'invoices', 'sales_returns', 'receipt_vouchers'].includes(activeTab)) return true;
    if (section.id === 'purchases_expenses_menu' && ['purchases', 'purchases_suppliers', 'purchases_invoices', 'purchases_returns', 'payment_vouchers', 'expenses'].includes(activeTab)) return true;
    if (section.id === 'items_menu' && ['inventory', 'warehouses'].includes(activeTab)) return true;
    if (section.id === 'hr_menu' && ['employees', 'employees_adjustments', 'employees_payroll', 'report_employee_statement'].includes(activeTab)) return true;
    if (section.id === 'finance_accounting_menu' && ['branches', 'warehouses', 'treasuries', 'debt_clearing', 'accounting'].includes(activeTab)) return true;
    if (section.id === 'reports_menu' && (activeTab === 'reports' || activeTab.startsWith('report_'))) return true;
    if (section.id === 'settings_menu' && (activeTab === 'settings' || activeTab.startsWith('settings_') || activeTab === 'users_permissions')) return true;
    return section.items.some(item => item.id === activeTab);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#f0f2f5] text-slate-800 shadow-sm border-b border-slate-400 shrink-0 select-none overflow-visible font-sans">
      {/* ========================================================
          Tier 1: Classic Windows Desktop Title Bar (شريط عنوان النافذة)
          ======================================================== */}
      <div className="h-7 bg-gradient-to-r from-[#0a246a] via-[#123985] to-[#2563eb] text-white px-2 flex items-center justify-between border-b border-[#0055ea] text-xs">
        {/* Right (in RTL): Application Form Icon & Window Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div 
            onClick={() => {
              if (window.innerWidth < 768) setIsMobileNavOpen(true);
              else setActiveTab('home');
            }}
            className="w-5 h-5 bg-white/20 hover:bg-white/30 border border-white/40 rounded-xs flex items-center justify-center text-white font-black text-[11px] shrink-0 cursor-pointer shadow-xs transition"
            title="القائمة الرئيسية"
          >
            P
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-white text-[11.5px] tracking-tight truncate">
              {settings.appTitle || (settings.businessName ? `برنامج الأيهم المحاسبي - ${settings.businessName} - م.رائد صالحة` : 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - م.رائد صالحة')}
            </span>
            <span className="hidden xl:inline text-blue-200 text-[10.5px] border-r border-blue-400/40 pr-2 mr-1">
              [الفرع: {activeBranch?.name}] | [المستخدم: {currentUser?.fullName} ({currentUser?.roleName})]
            </span>
          </div>
        </div>

        {/* Center: Real-time Cloud System Indicator */}
        <div 
          onClick={() => setIsQuotaModalOpen(true)}
          className="hidden lg:flex items-center gap-2 text-[10.5px] text-blue-100 bg-black/20 hover:bg-black/40 cursor-pointer px-2 py-0.5 rounded-xs border border-white/15 transition"
          title="مؤشر استهلاك حصة فايربيس السحابية وميعاد التجديد 12:00 ظهراً"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>خادم سحابي نشط</span>
          <span className="text-amber-300 font-mono font-bold bg-black/30 px-1 rounded-xs border border-amber-400/30">حصة فايربيس</span>
        </div>

        {/* Left (in RTL): Classic Windows Window Controls (─, ▢, ✕) */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Back Button */}
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            className={`h-5 px-1.5 rounded-xs flex items-center gap-0.5 text-[10px] font-bold transition shrink-0 ${
              canGoBack
                ? 'bg-white/15 hover:bg-white/30 text-white cursor-pointer'
                : 'bg-white/5 text-white/40 cursor-not-allowed'
            }`}
            title="رجوع للشاشة السابقة"
          >
            <ArrowRight className="w-3 h-3 text-blue-200" />
            <span className="hidden sm:inline">رجوع</span>
          </button>

          {/* Minimize Button */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="w-6 h-5 bg-white/10 hover:bg-white/25 active:bg-blue-900 text-white rounded-xs flex items-center justify-center transition cursor-pointer"
            title="الشاشة الرئيسية للبرنامج"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Maximize / Restore Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-6 h-5 bg-white/10 hover:bg-white/25 active:bg-blue-900 text-white rounded-xs flex items-center justify-center transition cursor-pointer"
            title={isFullscreen ? "استعادة الحجم الطبيعي" : "تكبير ملء الشاشة"}
          >
            <Square className="w-2.5 h-2.5" />
          </button>

          {/* Close Window / Logout Button */}
          <button
            type="button"
            onClick={handleExitApp}
            className="w-8 h-5 bg-rose-600/80 hover:bg-rose-600 active:bg-rose-700 text-white rounded-xs flex items-center justify-center transition cursor-pointer"
            title="إغلاق البرنامج / تسجيل الخروج"
          >
            <X className="w-3.5 h-3.5 font-bold" />
          </button>
        </div>
      </div>

      {/* ========================================================
          Tier 2: Classic Desktop MenuStrip (شريط القوائم الكلاسيكي)
          ======================================================== */}
      <nav
        ref={navRef}
        className="hidden md:flex bg-[#f0f2f5] px-1.5 items-center border-b border-slate-300 relative overflow-visible z-50 text-xs text-slate-800"
      >
        <div className="flex items-center gap-0.5 py-0.5 flex-wrap">
          {visibleMenuSections.map((section) => {
            const SectionIcon = section.icon;
            const isMenuOpen = openDropdownId === section.id;
            const isParentActive = isSectionActive(section);
            const isLeftAligned = section.id === 'settings_menu' || section.id === 'reports_menu' || section.id === 'help_menu';

            return (
              <div
                key={section.id}
                className="relative"
              >
                {/* Menu Item Button */}
                <button
                  onClick={() => toggleDropdown(section.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xs text-[11.5px] font-bold transition select-none cursor-pointer border ${
                    isMenuOpen
                      ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                      : isParentActive
                      ? 'bg-blue-100 text-blue-900 border-blue-300 shadow-2xs'
                      : 'border-transparent text-slate-800 hover:bg-slate-200 hover:border-slate-300'
                  }`}
                  aria-expanded={isMenuOpen}
                >
                  {SectionIcon && (
                    <SectionIcon className={`w-3 h-3 ${isMenuOpen ? 'text-white' : isParentActive ? 'text-blue-700' : 'text-slate-600'}`} />
                  )}
                  <span>{section.title}</span>
                  <ChevronDown
                    className={`w-2.5 h-2.5 transition-transform duration-150 ${
                      isMenuOpen ? 'rotate-180 text-white' : 'text-slate-500'
                    }`}
                  />
                </button>

                {/* Classic Windows Context Menu Dropdown */}
                {isMenuOpen && (
                  <div
                    className={`absolute top-full mt-0.5 w-[330px] sm:w-[380px] max-w-[95vw] bg-white text-slate-800 rounded-xs shadow-xl border border-[#7f9db9] py-1 z-50 animate-in fade-in duration-75 divide-y divide-slate-100 font-sans ${
                      isLeftAligned ? 'left-0 right-auto' : 'right-0 left-auto'
                    }`}
                  >
                    <div className="px-3 py-1 bg-slate-100 text-[10px] font-bold text-slate-600 flex items-center justify-between border-b border-slate-200">
                      <span>{section.title}</span>
                      <span className="text-blue-700 font-mono">Visual Basic Menu</span>
                    </div>

                    <div className="p-0.5 space-y-0.5">
                      {section.items.map((subItem) => {
                        const SubIcon = subItem.icon;
                        const isSubActive = activeTab === subItem.id;

                        return (
                          <button
                            key={subItem.id}
                            onClick={() => handleSelectSubItem(subItem.id)}
                            className={`w-full text-right flex items-center gap-2 px-2.5 py-1.5 rounded-xs text-[11.5px] transition cursor-pointer select-none ${
                              isSubActive
                                ? 'bg-[#0055ea] text-white font-bold'
                                : 'hover:bg-blue-600 hover:text-white text-slate-800 group'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-xs flex items-center justify-center shrink-0 border ${
                              isSubActive 
                                ? 'bg-white/20 text-white border-white/30' 
                                : 'bg-slate-100 text-blue-700 border-slate-300 group-hover:bg-white group-hover:text-blue-700'
                            }`}>
                              <SubIcon className="w-3.5 h-3.5" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold whitespace-nowrap">
                                  {subItem.label}
                                </span>
                                {subItem.badge && (
                                  <span className={`text-[9px] px-1 py-0.2 rounded-xs font-mono font-bold shrink-0 ${
                                    isSubActive ? 'bg-white/25 text-white' : subItem.badgeColor || 'bg-slate-200 text-slate-700 border border-slate-300'
                                  }`}>
                                    {subItem.badge}
                                  </span>
                                )}
                                {isSubActive && (
                                  <Check className="w-3 h-3 text-white shrink-0 mr-1" />
                                )}
                              </div>
                              {subItem.sublabel && (
                                <p className={`text-[9.5px] leading-tight truncate ${
                                  isSubActive ? 'text-blue-100' : 'text-slate-500 group-hover:text-blue-100'
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
                )}
              </div>
            );
          })}

          {/* Audit Log Menu Action */}
          <button
            onClick={() => {
              setActiveTab('audit_log');
              setOpenDropdownId(null);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-xs text-[11.5px] font-bold transition select-none cursor-pointer border ${
              activeTab === 'audit_log'
                ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                : 'border-transparent text-slate-800 hover:bg-slate-200 hover:border-slate-300'
            }`}
            title="سجل العمليات والأحداث الشامل"
          >
            <History className={`w-3 h-3 ${activeTab === 'audit_log' ? 'text-white' : 'text-slate-600'}`} />
            <span>سجل العمليات</span>
          </button>

          {/* Sync Statement Action */}
          <button
            onClick={() => {
              setActiveTab('sync_statement');
              setOpenDropdownId(null);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-xs text-[11.5px] font-bold transition select-none cursor-pointer border ${
              activeTab === 'sync_statement'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                : 'border-transparent text-slate-800 hover:bg-slate-200 hover:border-slate-300'
            }`}
            title="سند مطابقة وتدقيق المزامنة ونقل البيانات للسيرفر الرئيسي"
          >
            <Activity className={`w-3 h-3 ${activeTab === 'sync_statement' ? 'text-white' : 'text-indigo-600'}`} />
            <span>سند تفاصيل المزامنة</span>
            {pendingSyncCount > 0 && (
              <span className="bg-amber-500 text-white text-[9px] px-1 rounded-full font-mono">
                {pendingSyncCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ========================================================
          Tier 3: Classic Desktop ToolStrip (شريط الأدوات السريع)
          ======================================================== */}
      <div className="bg-[#f8fafc] border-b border-slate-300 px-2 py-1 flex items-center justify-between text-xs gap-2 overflow-x-auto no-scrollbar">
        {/* Right: Quick Command Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* POS Button */}
          {hasPermission('view_pos') && (
            <button
              onClick={() => setActiveTab('pos')}
              className={`px-2 py-0.5 flex items-center gap-1 rounded-xs border font-bold text-[11px] shadow-2xs active:translate-y-px transition cursor-pointer ${
                activeTab === 'pos'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-800'
                  : 'bg-gradient-to-b from-white to-slate-100 hover:from-blue-50 hover:to-blue-100 text-slate-800 border-slate-400 hover:border-blue-600'
              }`}
              title="فتح شاشة الكاشير والمبيعات السريعة"
            >
              <ShoppingCart className="w-3 h-3 text-emerald-600" />
              <span>+ فاتورة كاشير</span>
            </button>
          )}

          {/* Print Orders Button */}
          {hasPermission('view_print_orders') && (
            <button
              onClick={() => setActiveTab('print_orders')}
              className={`px-2 py-0.5 flex items-center gap-1 rounded-xs border font-bold text-[11px] shadow-2xs active:translate-y-px transition cursor-pointer ${
                activeTab === 'print_orders'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-800'
                  : 'bg-gradient-to-b from-white to-slate-100 hover:from-blue-50 hover:to-blue-100 text-slate-800 border-slate-400 hover:border-blue-600'
              }`}
              title="أوامر التشغيل بالمطبعة"
            >
              <Printer className="w-3 h-3 text-blue-600" />
              <span>+ أمر تشغيل</span>
            </button>
          )}

          {/* Receipt Voucher Button - STRICTLY requires accounting and create_receipt permission */}
          {hasPermission('view_accounting') && hasPermission('create_receipt') && (
            <button
              onClick={() => setActiveTab('receipt_vouchers')}
              className={`px-2 py-0.5 flex items-center gap-1 rounded-xs border font-bold text-[11px] shadow-2xs active:translate-y-px transition cursor-pointer ${
                activeTab === 'receipt_vouchers'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-800'
                  : 'bg-gradient-to-b from-white to-slate-100 hover:from-emerald-50 hover:to-emerald-100 text-slate-800 border-slate-400 hover:border-emerald-600'
              }`}
              title="سند قبض مالي"
            >
              <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
              <span>سند قبض</span>
            </button>
          )}

          {/* Payment Voucher Button - STRICTLY requires accounting and create_payment permission */}
          {hasPermission('view_accounting') && hasPermission('create_payment') && (
            <button
              onClick={() => setActiveTab('payment_vouchers')}
              className={`px-2 py-0.5 flex items-center gap-1 rounded-xs border font-bold text-[11px] shadow-2xs active:translate-y-px transition cursor-pointer ${
                activeTab === 'payment_vouchers'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-800'
                  : 'bg-gradient-to-b from-white to-slate-100 hover:from-rose-50 hover:to-rose-100 text-slate-800 border-slate-400 hover:border-rose-600'
              }`}
              title="سند صرف مالي"
            >
              <ArrowUpRight className="w-3 h-3 text-rose-600" />
              <span>سند صرف</span>
            </button>
          )}

          {/* Customers Directory */}
          {(hasPermission('view_settings') || hasPermission('view') || hasPermission('view_invoices')) && (
            <button
              onClick={() => setActiveTab('parties')}
              className={`px-2 py-0.5 flex items-center gap-1 rounded-xs border font-bold text-[11px] shadow-2xs active:translate-y-px transition cursor-pointer ${
                activeTab === 'parties'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-800'
                  : 'bg-gradient-to-b from-white to-slate-100 hover:from-blue-50 hover:to-blue-100 text-slate-800 border-slate-400 hover:border-blue-600'
              }`}
              title="دليل الزبائن والموردين"
            >
              <Users className="w-3 h-3 text-indigo-600" />
              <span>الزبائن</span>
            </button>
          )}

          {/* Inventory */}
          {hasPermission('view_inventory') && (
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-2 py-0.5 flex items-center gap-1 rounded-xs border font-bold text-[11px] shadow-2xs active:translate-y-px transition cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-800'
                  : 'bg-gradient-to-b from-white to-slate-100 hover:from-blue-50 hover:to-blue-100 text-slate-800 border-slate-400 hover:border-blue-600'
              }`}
              title="جرد المخزون والأصناف"
            >
              <Boxes className="w-3 h-3 text-amber-600" />
              <span>المخزون</span>
            </button>
          )}

          {/* Calculator Tool */}
          <button
            onClick={() => setIsCalculatorOpen(true)}
            className="px-2 py-0.5 flex items-center gap-1 bg-gradient-to-b from-white to-slate-100 hover:from-blue-50 hover:to-blue-100 text-slate-800 border border-slate-400 hover:border-blue-600 font-bold text-[11px] rounded-xs shadow-2xs active:translate-y-px transition cursor-pointer"
            title="الآلة الحاسبة السريعة"
          >
            <Calculator className="w-3 h-3 text-blue-700" />
            <span>حاسبة</span>
          </button>

          {/* STANDALONE LOCAL DATABASE BUTTON */}
          <button
            type="button"
            onClick={() => setIsLocalDbModalOpen(true)}
            className={`px-2 py-0.5 flex items-center gap-1 font-bold text-[11px] rounded-xs shadow-xs active:translate-y-px transition cursor-pointer border ${
              isLocalOnlyMode 
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-800 animate-pulse' 
                : 'bg-slate-700 hover:bg-slate-800 text-white border-slate-900'
            }`}
            title="إدارة وتفعيل وضع التشغيل المحلي الخالص (100% Offline Local Mode)"
          >
            <HardDrive className="w-3.5 h-3.5 text-white" />
            <span>{isLocalOnlyMode ? '🟢 قاعدة بيانات محلية (100%)' : 'قاعدة البيانات المحلية'}</span>
          </button>

          {/* PROMINENT FORCED REAL-TIME RELOAD BUTTON */}
          {syncCoordinatorState?.conflict > 0 && (
            <button
              type="button"
              onClick={openConflictModal}
              className="px-2 py-0.5 flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-xs shadow-xs active:translate-y-px transition cursor-pointer border border-rose-800 animate-pulse"
              title="يوجد تعارض في التزامن يتطلب المراجعة اليدوية"
            >
              <ShieldAlert className="w-3 h-3 text-white" />
              <span>{syncCoordinatorState.conflict} تعارض</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isFirebaseSyncing}
            className="px-2 py-0.5 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xs shadow-xs active:translate-y-px transition cursor-pointer border border-emerald-800 disabled:opacity-75"
            title="إجبار المزامنة وتحديث الشاشة فوراً بأحدث الفواتير والبيانات"
          >
            <RefreshCw className={`w-3 h-3 text-white ${isFirebaseSyncing ? 'animate-spin' : ''}`} />
            <span>{isFirebaseSyncing ? 'جاري المزامنة...' : 'تحديث حركي فورى'}</span>
          </button>

          <button
            type="button"
            onClick={handleImportMasterSnapshot}
            className="px-2 py-0.5 flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-xs shadow-xs active:translate-y-px transition cursor-pointer border border-amber-800"
            title="استيعاب واعتماد أحدث نسخة رئيسية لقاعدة البيانات (تحميل الفواتير الأخيرة فوراً)"
          >
            <Database className="w-3 h-3 text-white" />
            <span>استيعاب قاعدة البيانات</span>
          </button>

          {/* Cloud Sync Tool */}
          {(isAdmin || hasPermission('view_settings')) && (
            <button
              onClick={handleManualSync}
              disabled={isFirebaseSyncing}
              className="px-2 py-0.5 flex items-center gap-1 bg-gradient-to-b from-white to-slate-100 hover:from-emerald-50 hover:to-emerald-100 text-slate-800 border border-slate-400 hover:border-emerald-600 font-bold text-[11px] rounded-xs shadow-2xs active:translate-y-px transition cursor-pointer disabled:opacity-75"
              title="إجراء مزامنة فورية مع قاعدة البيانات السحابية"
            >
              <RefreshCw className={`w-3 h-3 text-emerald-600 ${isFirebaseSyncing ? 'animate-spin' : ''}`} />
              <span>{isFirebaseSyncing ? 'جاري المزامنة...' : 'مزامنة'}</span>
            </button>
          )}

          {/* Mobile Menu Icon for Small Screens */}
          <button
            onClick={() => setIsMobileNavOpen(true)}
            className="md:hidden px-2 py-0.5 flex items-center gap-1 bg-blue-600 text-white font-bold text-[11px] rounded-xs shadow-2xs"
          >
            <Menu className="w-3.5 h-3.5" />
            <span>القوائم</span>
          </button>
        </div>

        {/* Left: Branch selector & Liquidity Indicators (تنقل المستخدمين والفروع حصري لمدير النظام) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active Branch Selector - متاح للتنقل بين الفروع */}
          <div className="flex items-center gap-1 bg-white border border-[#7f9db9] rounded-xs px-1.5 py-0.5 text-xs shadow-inner">
            <Store className="w-3 h-3 text-blue-700 shrink-0" />
            <span className="text-[10px] text-slate-500 hidden xl:inline">الفرع:</span>
            <select
              value={activeBranchId}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="bg-transparent text-slate-900 text-[11px] font-bold focus:outline-hidden cursor-pointer max-w-[125px] truncate"
              title="الفرع النشط الحالي"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-white text-slate-900 font-sans">
                  {b.name} ({b.branchCode})
                </option>
              ))}
            </select>
          </div>

          {/* Active User Switcher - ONLY visible & switchable for System Admin */}
          {isAdmin ? (
            <div className="flex items-center gap-1 bg-white border border-[#7f9db9] rounded-xs px-1.5 py-0.5 text-xs shadow-inner">
              <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="text-[10px] text-slate-500 hidden xl:inline">المستخدم:</span>
              <select
                value={currentUserId}
                onChange={(e) => {
                  const targetUid = e.target.value;
                  setCurrentUserId(targetUid);
                  try {
                    localStorage.setItem('alnoor_press_accounting_v1_current_user_id', targetUid);
                  } catch {}
                }}
                className="bg-transparent text-slate-900 text-[11px] font-bold focus:outline-hidden cursor-pointer max-w-[140px] truncate"
                title="المستخدم الحالي والصلاحيات (صلاحية مدير النظام للتنقل بين المستخدمين)"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id} className="bg-white text-slate-900 font-sans">
                    {u.fullName || u.username} ({u.roleName || 'مستخدم'})
                  </option>
                ))}
              </select>
              {currentUserId !== 'usr-1' && isSessionAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentUserId('usr-1');
                    try {
                      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', 'usr-1');
                    } catch {}
                  }}
                  className="px-1.5 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xs text-[10px] font-bold shadow-2xs cursor-pointer ml-1"
                  title="العودة لشاشة وصلاحيات مدير النظام"
                >
                  عودة للمدير ↺
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-300 rounded-xs px-2 py-0.5 text-xs shadow-inner select-none" title={`المستخدم المسجل: ${currentUser?.fullName || currentUser?.username} (${currentUser?.roleName || 'مستخدم'})`}>
              <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="text-[10px] text-slate-500">المستخدم:</span>
              <span className="text-slate-900 text-[11px] font-bold max-w-[140px] truncate">
                {currentUser?.fullName || currentUser?.username}
              </span>
            </div>
          )}

          {/* Cash Liquidity Pill - ONLY for users with accounting permission */}
          {hasPermission('view_accounting') && (
            <div
              onClick={() => setActiveTab('treasuries')}
              className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-xs bg-white border border-slate-300 text-slate-700 shadow-inner cursor-pointer hover:bg-emerald-50 transition"
              title="الصندوق النقدي - اضغط للتفاصيل"
            >
              <Wallet className="w-3 h-3 text-emerald-600" />
              <span className="text-slate-500 text-[10px]">الصندوق:</span>
              <strong className="font-mono font-bold text-emerald-700 text-[11px]">
                {(stats?.cashBalance ?? 0).toLocaleString('ar-SA')}
              </strong>
            </div>
          )}

          {/* Workshop Alert - ONLY for users with print orders permission */}
          {hasPermission('view_print_orders') && stats.pendingPrintJobs > 0 && (
            <button
              onClick={() => setActiveTab('print_orders')}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-amber-100 border border-amber-400 text-amber-900 font-bold text-[10.5px] hover:bg-amber-200 transition cursor-pointer"
              title="أوامر تشغيل معلقة بالورشة"
            >
              <Clock className="w-3 h-3 text-amber-700 animate-pulse" />
              <span>ورشة: {stats.pendingPrintJobs}</span>
            </button>
          )}

          {/* Low Stock Alert - ONLY for users with inventory permission */}
          {hasPermission('view_inventory') && stats.lowStockCount > 0 && (
            <button
              onClick={() => setActiveTab('inventory')}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-rose-100 border border-rose-400 text-rose-900 font-bold text-[10.5px] hover:bg-rose-200 transition cursor-pointer"
              title="أصناف وصلت لحد الأمان بالمخزون"
            >
              <AlertTriangle className="w-3 h-3 text-rose-700" />
              <span>نواقص: {stats.lowStockCount}</span>
            </button>
          )}

          <PWAInstallButton />
        </div>
      </div>

      {/* Offline Awareness Strip */}
      {!isOnline && (
        <div className="bg-amber-100 text-amber-950 border-t border-amber-300 px-3 py-1 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 text-amber-700 animate-pulse shrink-0" />
            <span className="leading-tight text-[11px]">
              <strong>وضع عدم الاتصال بالإنترنت (Offline):</strong> النظام يعمل بكامل طاقته ومميزاته بلا توقف! تُحفظ كافة الفواتير والعمليات فورياً في الذاكرة المحلية.
            </span>
          </div>
          {pendingSyncCount > 0 && (
            <span className="bg-amber-200 px-1.5 py-0.5 rounded-xs text-[10px] font-mono font-bold text-amber-900 border border-amber-400">
              {pendingSyncCount} حركة بانتظار المزامنة
            </span>
          )}
        </div>
      )}

      {/* Sync Feedback Toast */}
      {syncFeedback && (
        <div className={`px-3 py-1.5 text-xs flex items-center justify-between border-t transition-all ${
          syncFeedback.success
            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
            : 'bg-rose-100 text-rose-900 border-rose-300'
        }`}>
          <div className="flex items-center gap-1.5">
            {syncFeedback.success ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
            )}
            <span className="font-bold text-[11px]">{syncFeedback.message}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-[11px] font-bold underline hover:text-black cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Calculator Modal */}
      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* About Application Modal */}
      <AboutAppModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Local Database Modal */}
      <LocalDatabaseModal
        isOpen={isLocalDbModalOpen}
        onClose={() => setIsLocalDbModalOpen(false)}
      />

      {/* Firebase Quota & Operations Monitor Modal */}
      <FirebaseQuotaModal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
      />

      {/* Mobile Navigation Hub / Modal */}
      <MobileNavigationModal
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />
    </header>
  );
};
