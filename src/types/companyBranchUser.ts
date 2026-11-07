export interface Company {
  id: string;
  code: string;
  name: string;
  tradeName?: string;
  crNumber?: string;
  taxNumber?: string;
  address: string;
  phone: string;
  email?: string;
  password?: string;
  currency: string;
  isDefault?: boolean;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  branchNumber: string;         // رقم الفرع
  branchCode: string;           // كود الفرع e.g. BR-01
  name: string;                 // الاسم
  address: string;              // العنوان
  phone: string;                // الهاتف
  manager: string;              // المدير
  status: 'active' | 'inactive';// الحالة
  warehouseIds: string[];       // المخازن التابعة
  treasuryIds: string[];        // الصناديق التابعة
  bankAccountIds: string[];     // الحسابات البنكية التابعة
  notes?: string;
  isMain?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type WarehouseType =
  | 'raw_materials'          // مواد خام وورق وأحبار
  | 'finished_goods'         // منتجات تامة الصنع
  | 'prints_packaging'       // مطبوعات وتغليف وكرتون
  | 'stationery'             // قرطاسية ولوازم مكتبية
  | 'production_in_progress' // إنتاج وتشغيل قيد التنفيذ
  | 'damaged_scrap'          // تالف ومستهلكات وخردة
  | 'general_main'           // مستودع رئيسي عام
  | 'transit';               // ترانزيت وبضاعة بالطريق

export type WarehouseStatus = 'active' | 'inactive' | 'under_audit';

export interface Warehouse {
  id: string;
  code: string;                  // الكود
  name: string;                  // الاسم
  companyId: string;             // الشركة
  branchId: string;              // الفرع (كل فرع يمكن أن يحتوي عدة مخازن)
  branchName?: string;           // اسم الفرع
  manager: string;               // المسؤول
  warehouseType: WarehouseType;  // نوع المخزن
  status: WarehouseStatus;       // الحالة (نشط / معطل / تحت الجرد)
  location?: string;             // الموقع الفعلي أو القسم
  phone?: string;                // هاتف المستودع
  capacity?: string;             // السعة التخزينية
  notes?: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type WarehouseOperationType =
  | 'receipt'       // استلام
  | 'issue'         // صرف
  | 'transfer'      // تحويل
  | 'audit'         // جرد
  | 'settlement'    // تسوية
  | 'damaged'       // إتلاف
  | 'return'        // مرتجع
  | 'stock_modify'; // تعديل مخزون

export interface WarehouseOperationItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceBefore?: number;
  balanceAfter?: number;
  targetBalanceBefore?: number;
  targetBalanceAfter?: number;
  countedQuantity?: number;     // للجرد والتسوية (الكمية الفعلية)
  discrepancy?: number;         // للجرد والتسوية (الفارق: جرد - نظام)
  notes?: string;
}

export interface WarehouseOperation {
  id: string;
  documentNumber: string;               // رقم المستند
  operationType: WarehouseOperationType;// نوع العملية
  date: string;                         // التاريخ YYYY-MM-DD
  time: string;                         // الوقت HH:mm:ss
  branchId: string;                     // الفرع
  branchName: string;                   // اسم الفرع
  warehouseId: string;                  // المخزن المصدر أو الرئيسي
  warehouseName: string;                // اسم المخزن
  targetBranchId?: string;              // الفرع المستهدف (للتحويل)
  targetBranchName?: string;
  targetWarehouseId?: string;           // المخزن المستهدف (للتحويل)
  targetWarehouseName?: string;
  userId: string;                       // معرف المستخدم
  userName: string;                     // اسم المستخدم
  userRole?: string;                    // صفة المستخدم
  items: WarehouseOperationItem[];      // الأصناف المحركة
  totalQuantity: number;
  totalValue: number;
  referenceType?: string;               // نوع المرجع
  referenceNumber?: string;             // رقم المرجع (فاتورة، أمر شغل، أمر شراء...)
  reason: string;                       // سبب العملية
  notes?: string;                       // الملاحظات
  status: 'completed' | 'cancelled';    // حالة المستند
  createdAt: string;
  updatedAt?: string;
}

export type PermissionKey =
    | 'view'                    // مشاهدة
  | 'view_dashboard'
  | 'view_pos'
  | 'view_print_orders'
  | 'view_invoices'
  | 'view_inventory'
  | 'view_accounting'
  | 'view_reports'
  | 'view_settings'
  | 'add'                     // إضافة
  | 'edit'                    // تعديل
  | 'approve'                 // اعتماد
  | 'cancel'                  // إلغاء
  | 'soft_delete'             // حذف منطقي
  | 'print'                   // طباعة
  | 'export'                  // تصدير
  | 'edit_prices'             // تعديل الأسعار
  | 'edit_cost'               // تعديل التكلفة
  | 'edit_exchange_rate'      // تعديل سعر الصرف
  | 'create_receipt'          // إنشاء قبض
  | 'approve_receipt'         // اعتماد قبض
  | 'create_payment'          // إنشاء صرف
  | 'approve_payment'         // اعتماد صرف
  | 'create_clearing'         // إنشاء مقاصة
  | 'approve_clearing'        // اعتماد مقاصة
  | 'transfer_funds'          // تحويل أموال
  | 'close_cash_drawer'       // إغلاق صندوق
  | 'reopen_closed_period';   // فتح فترة محاسبية مغلقة

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  category: 'general' | 'sales_inventory' | 'finance_treasury' | 'accounting_system' | 'screens';
  categoryLabel: string;
  description: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
    // صلاحيات الشاشات
  { key: 'view_dashboard', label: 'الرئيسية', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى الشاشة الرئيسية ولوحة القيادة' },
  { key: 'view_pos', label: 'نقطة البيع', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى شاشة الكاشير ونقاط البيع' },
  { key: 'view_print_orders', label: 'أوامر الطباعة والورشة', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى أوامر الطباعة وشاشة الورشة' },
  { key: 'view_invoices', label: 'الفواتير والمبيعات', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى سجل الفواتير والمردودات' },
  { key: 'view_inventory', label: 'المخزون والمستودعات', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى المخازن والأصناف والمشتريات' },
  { key: 'view_accounting', label: 'الحسابات والمالية', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى شجرة الحسابات، السندات، والمصروفات' },
  { key: 'view_reports', label: 'التقارير', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى التقارير الشاملة' },
  { key: 'view_settings', label: 'الإعدادات والصلاحيات', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول لإعدادات النظام، المستخدمين، والصلاحيات' },
  
  // عام وسجلات
  { key: 'view', label: 'مشاهدة عامة', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'مشاهدة السجلات في الشاشات المسموح بها' },
  { key: 'add', label: 'إضافة', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'إنشاء فواتير وسندات وسجلات جديدة' },
  { key: 'edit', label: 'تعديل', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'تعديل وتحديث السجلات والبيانات غير المقفلة' },
  { key: 'approve', label: 'اعتماد', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'اعتماد العمليات رسمياً وتمريرها محاسبياً' },
  { key: 'cancel', label: 'إلغاء', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'إلغاء الفواتير أو أوامر التشغيل والعمليات' },
  { key: 'soft_delete', label: 'حذف منطقي', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'أرشفة السجلات والحذف الآمن مع إمكانية المراجعة' },
  { key: 'print', label: 'طباعة', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'طباعة الفواتير والسندات وكشوف الحسابات' },
  { key: 'export', label: 'تصدير', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'تصدير البيانات والتقارير إلى Excel و PDF و JSON' },

  // المبيعات والمخزون والأسعار
  { key: 'edit_prices', label: 'تعديل الأسعار', category: 'sales_inventory', categoryLabel: 'المبيعات والمخزون والتسعير', description: 'تعديل أسعار البيع المباشرة في شاشة الكاشير ونقاط البيع' },
  { key: 'edit_cost', label: 'تعديل التكلفة', category: 'sales_inventory', categoryLabel: 'المبيعات والمخزون والتسعير', description: 'تعديل أسعار التكلفة للشراء والمخزون السلعي' },
  { key: 'edit_exchange_rate', label: 'تعديل سعر الصرف', category: 'sales_inventory', categoryLabel: 'المبيعات والمخزون والتسعير', description: 'تعديل أسعار صرف العملات عند إنشاء المعاملات' },

  // الخزينة والمدفوعات
  { key: 'create_receipt', label: 'إنشاء قبض', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'تحرير سندات القبض والتحصيل المالي' },
  { key: 'approve_receipt', label: 'اعتماد قبض', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'اعتماد سندات القبض وترحيلها لرصيد الخزينة' },
  { key: 'create_payment', label: 'إنشاء صرف', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'تحرير سندات الصرف وسداد الموردين والمصروفات' },
  { key: 'approve_payment', label: 'اعتماد صرف', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'اعتماد سندات الصرف والخصم الفعلي من الخزينة' },
  { key: 'create_clearing', label: 'إنشاء مقاصة', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'إنشاء تسويات ومقاصات الديون بين العملاء والموردين' },
  { key: 'approve_clearing', label: 'اعتماد مقاصة', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'اعتماد قيود المقاصة وإقفال الذمم المتبادلة' },
  { key: 'transfer_funds', label: 'تحويل أموال', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'تحويل السيولة والأرصدة بين الصناديق والبنوك' },
  { key: 'close_cash_drawer', label: 'إغلاق صندوق', category: 'finance_treasury', categoryLabel: 'المالية والخزائن والمدفوعات', description: 'إغلاق وردية الكاشير وجرد النقدية ومطابقة العجز والفائض' },

  // المحاسبة وإدارة النظام
  { key: 'reopen_closed_period', label: 'فتح فترة محاسبية مغلقة', category: 'accounting_system', categoryLabel: 'المحاسبة المتقدمة والفترات', description: 'إلغاء إقفال الفترات والسنوات المالية المقفلة وتعديل قيودها' }
];

export type PriceTierKey = 'price1' | 'price2' | 'price3';
export type AllowedPriceTierScope = 'all' | 'price1' | 'price2' | 'price3';

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  permissions: Record<PermissionKey, boolean>;
  allowedPriceTier?: AllowedPriceTierScope;
  defaultPriceTier?: PriceTierKey;
  createdAt: string;
  updatedAt?: string;
}

export interface SystemUser {
  id: string;
  companyId: string;
  username: string;
  fullName: string;
  email?: string;
  password?: string;
  phone?: string;
  roleId: string;
  roleName?: string;
  customPermissions?: Partial<Record<PermissionKey, boolean>>;
  defaultBranchId: string;
  allowedBranchIds: string[];   // يمكن تحديد الفروع التي يستطيع كل مستخدم الوصول إليها (أو ['*'] للوصول لكافة الفروع)
  status: 'active' | 'inactive';
  employeeId?: string;
  avatarColor?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt?: string;
  // إعدادات وصلاحيات أسعار البيع
  allowedPriceTier?: AllowedPriceTierScope; // 'all' (الكل) أو 'price1' (سعر 1 فقط) أو 'price2' أو 'price3'
  defaultPriceTier?: PriceTierKey;          // فئة السعر الافتراضية للكاشير والفواتير
  // مشاركة مجلد مرفقات جوجل درايف
  shareDriveAttachments?: boolean;          // تفعيل مشاركة ملفات ومرفقات Google Drive
  driveSharedAt?: string;                   // تاريخ ووقت تفعيل المشاركة
}
