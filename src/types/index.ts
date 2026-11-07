export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  code: string;
  name: string;
  nameEn?: string;
  type: AccountType;
  balance: number;
  parentCode?: string;
  isSystem?: boolean;
  description?: string;
}

export interface JournalEntryLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  referenceType: 'pos_invoice' | 'print_order' | 'purchase' | 'purchase_return' | 'sales_return' | 'manual' | 'expense' | 'receipt' | 'payment' | 'transfer' | 'cogs' | 'clearance';
  referenceId?: string;
  lines: JournalEntryLine[];
  createdAt: string;
}

export type ItemCategory = string; // دروع تكريم وهدايا دعائية ومطبوعات جلدية

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'QR';

export interface AdditionalBarcode {
  barcode: string;
  label?: string; // e.g. "باركود كرتونة", "باركود حبة", "باركود مورد", "باركود بديل", "باركود عبوة"
  type?: BarcodeFormat;
  createdAt?: string;
}

export type UnitCalculationType = 
  | 'area'    // متر مربع: طول × عرض × كمية × سعر
  | 'linear'  // متر طولي: طول × كمية × سعر
  | 'unit'    // بالوحدة / حبة: كمية × سعر
  | 'custom'; // مخصص

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  nameEn?: string;
  calculationType: UnitCalculationType;
  symbol: string;
  isDefault?: boolean;
  description?: string;
}

export type InvoicePaymentStatus =
  | 'unpaid'                // غير مدفوع
  | 'partially_paid_cash'   // مدفوع نقدا جزئيا
  | 'paid_cash'             // مدفوع نقدا بالكامل
  | 'partially_paid_bank'   // مدفوع بنكي جزئيا
  | 'paid_bank'             // مدفوع بنكي بالكامل
  | 'paid_cash_bank'        // مدفوع نقدي وبنكي
  | 'credit';               // آجل

export type PosInvoiceWorkflowStatus = 
  | 'new'                   // جديد (فاتورة مباشرة تدخل مباشرة ضمن القيود المحاسبية)
  | 'quotation'             // عرض سعر (لا يظهر إلا بالكاشير ولا يعتمد بالحسابات أو المخزون)
  | 'design'                // تصميم (تذهب للمصمم دون حسابات أو مخزون إلا حين تصبح جاهزة للتسليم)
  | 'pending_approval'      // بانتظار الاعتماد (تنتظر موافقة الزبون)
  | 'print_external'        // طباعة خارجي (قيد التنفيذ خارج المطبعة - أمر توريد)
  | 'print_internal'        // طباعة داخلي (قيد التنفيذ داخل ورشة المطبعة)
  | 'ready'                 // جاهز للتسليم (تدخل القيود المحاسبية وكشف الزبون حتى لو لم تدفع)
  | 'delivered'             // تم التسليم (تخرج من أوامر الطباعة وتدخل القيود المحاسبية)
  | 'deferred'              // مؤجل (لا تدخل القيود وتظهر فقط في كشف الحالات)
  | 'paused'                // متوقف (توقف العمل بها)
  | 'editing'               // تعديل (توقف العمل بها للتعديل)
  | 'cancelled'             // إلغاء (ملغاة)
  // توافق عكسي:
  | 'designing'
  | 'in_progress_external'
  | 'in_progress_internal'
  | 'in_progress';

export interface CategoryDefinition {
  id: ItemCategory;
  name: string;
  nameEn: string;
  prefix: string;
  description: string;
  defaultUnit: string;
  color: string;
}

export interface CustomerSpecialPrice {
  customerId: string;
  customerName?: string;
  customerCode?: string;
  price: number;
  notes?: string;
  updatedAt?: string;
}

export interface InventoryItem {
  id: string;
  code: string;
  barcode: string;
  barcodeType?: BarcodeFormat;
  additionalBarcodes?: string[]; // قائمة الباركودات الإضافية / البديلة
  barcodeEntries?: AdditionalBarcode[]; // بيانات تفصيلية للباركودات المتعددة (كرتونة، حبة، مورد...)
  name: string;
  category: ItemCategory;
  unit: string;
  unitId?: string;
  unitCalculationType?: UnitCalculationType;
  purchasePrice: number;
  sellingPrice: number; // سعر بيع 1 (الأساسي / الافتراضي)
  sellingPrice2?: number; // سعر بيع 2 (جملة)
  sellingPrice3?: number; // سعر بيع 3 (نصف جملة / موزع)
  customerSpecialPrices?: CustomerSpecialPrice[]; // أسعار خاصة لعملاء محددين
  stockQuantity: number;
  warehouseStock?: Record<string, number>; // توزيع الرصيد حسب المخزن { [warehouseId]: quantity }
  minAlertQuantity: number;
  description?: string;
  isRawMaterial?: boolean; // للمطبعة
  imageUrl?: string; // رابط أو صورة الصنف المرفوعة (تظهر في شاشة الكاشير والمفضلة)
  isFavorite?: boolean; // صنف مفضل في الكاشير للوصول السريع
  lastMovementDate?: string;
}

export type StockMovementType =
  | 'in_purchase'    // وارد مشتريات وتوريد
  | 'in_receipt'     // إذن استلام مخزني
  | 'in_return'      // وارد مرتجع مبيعات من عميل
  | 'in_adjustment'  // تسوية مخزنية (زيادة وفائض)
  | 'in_opening'     // رصيد افتتاحي
  | 'transfer_in'    // وارد تحويل بين المستودعات والفروع
  | 'out_sale'       // منصرف مبيعات كاشير
  | 'out_issue'      // إذن صرف مخزني
  | 'out_print_job'  // منصرف تشغيل أمر شغل مطبعة
  | 'out_return'     // منصرف مردودات مشتريات إلى مورد
  | 'out_adjustment' // تسوية مخزنية (عجز ونقص)
  | 'out_damaged'    // إتلاف وهالك تشغيل
  | 'transfer_out'   // منصرف تحويل بين المستودعات والفروع
  | 'inventory_audit'// محضر جرد دوري
  | 'stock_modify';  // تعديل مخزون مباشر

export interface StockMovement {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  category: ItemCategory;
  date: string;
  time?: string;
  type: StockMovementType;
  quantity: number; // كمية الحركة الموجبة
  balanceBefore: number;
  balanceAfter: number;
  unitPrice?: number;
  totalValue?: number;
  referenceType: 'purchase' | 'pos_invoice' | 'print_order' | 'adjustment' | 'return' | 'opening' | 'manual' | 'receipt' | 'issue' | 'transfer' | 'audit' | 'settlement' | 'damaged' | 'stock_modify';
  referenceNumber?: string;
  documentNumber?: string; // رقم المستند الرسمي (REC-..., ISS-..., TRF-..., AUD-..., ADJ-..., DMG-..., RET-..., MOD-...)
  userId?: string;        // المستخدم منفذ الحركة
  userName?: string;      // اسم المستخدم
  branchId?: string;      // الفرع
  branchName?: string;    // اسم الفرع
  warehouseId?: string;   // المستودع المعني
  warehouseName?: string; // اسم المستودع
  targetWarehouseId?: string;
  targetWarehouseName?: string;
  targetBranchId?: string;
  targetBranchName?: string;
  reason?: string;
  notes?: string;
  performedBy?: string;
}

export interface StockAdjustmentEntry {
  itemId: string;
  currentQuantity: number;
  countedQuantity: number;
  difference: number; // counted - current
  type: 'surplus' | 'deficit' | 'matched';
  unitCost: number;
  totalDiffValue: number;
  reason: string;
  notes?: string;
}

export type PrintServiceType = 
  | 'business_cards'     // كروت شخصية
  | 'flyer_brochure'     // بروشورات وفلايرات
  | 'books_booklets'     // كتب وملازم دراسية
  | 'banner_flex'        // بانرات وفليكس ويفط
  | 'stickers_labels'    // ستيكرات ولافتات
  | 'stamps'             // أختام كريستال وخشب
  | 'binding_finishing'  // تجليد حراري وسلك وسلوفان
  | 'custom_print';      // مطبوعات خاصة

export type PrintOrderStatus = 
  | 'new'                   // بيع جديد / أمر جديد
  | 'design'                // قيد التصميم
  | 'pending_approval'      // بإنتظار الاعتماد
  | 'in_progress_external'  // قيد التنفيذ خارج
  | 'in_progress_internal'  // قيد التنفيذ داخل
  | 'printing'              // قيد الطباعة (تنفيذ داخل)
  | 'finishing'             // تشطيب وتجليد وقص
  | 'ready'                 // جاهز للتسليم
  | 'delivered'             // تم التسليم
  | 'cancelled';            // ملغي

export interface PrintJobOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  title: string;
  serviceType: PrintServiceType;
  paperType: string;         // كوشيه 300g، كوشيه 150g، ورق عادي 80g، إلخ
  dimensions: string;        // A4, A3, 9x5.5cm, 100x200cm
  quantity: number;
  colorType: string;         // ألوان كاملة 4/4، لون واحد، إلخ
  finishingOptions: string[]; // سلوفان مط، بصمة ذهبية، تكسير، خياطة...
  unitCost: number;
  totalPrice: number;
  depositPaid: number;
  remainingBalance: number;
  status: PrintOrderStatus;
  notes?: string;
  createdAt: string;
  createdAtTime?: string;
  deliveryDate: string;
  associatedInvoiceId?: string;
  items?: InvoiceItem[];
  subCustomerName?: string;
  attachments?: LineAttachment[];
  isExternalPrint?: boolean;
}

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'credit';

export interface LineAttachment {

  id: string;
  name: string;
  size?: number;
  type?: string;
  data?: string;
  localBlobId?: string;       // معرف الملف المخزن محلياً بجودة أصلية كاملة
  driveFileId?: string;       // معرف الملف في Google Drive
  driveWebViewLink?: string;  // رابط المعاينة المباشر في Google Drive
  driveDownloadLink?: string; // رابط التحميل المباشر من Google Drive
  storageType?: 'drive' | 'local' | 'embedded' | 'link';
  uploadedAt?: string;
  isOriginal?: boolean;
  isModified?: boolean;
  modifiedAt?: string;
  uploadedByUserId?: string;
  uploadedByUserName?: string;       // هل هو مرفق أصلي محمي من الحذف
  uploadedBy?: string;        // اسم المستخدم الذي أرفقه
}

export interface InvoiceTechnicalNote {
  id: string;
  userName: string;
  userId?: string;
  text: string;
  createdAt: string;
}

export interface InvoiceItem {
  itemId: string;
  itemCode?: string; // رقم الصنف / كود الصنف
  itemName: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  taxRate?: number;
  total: number;
  description?: string;
  notes?: string;
  hasDimensions?: boolean;
  dimensions?: string;
  length?: number;
  width?: number;
  count?: number;
  attachments?: LineAttachment[];
  barcode?: string;
  unit?: string;
  unitCalculationType?: UnitCalculationType;
  imageThumbnail?: string; // الصورة المصغرة للبند
}

export interface InvoiceStatusLog {
  id: string;
  userName: string;          // المستخدم
  userId?: string;           // معرف المستخدم
  date: string;              // التاريخ
  time: string;              // الوقت
  previousStatus: PosInvoiceWorkflowStatus; // الحالة السابقة
  newStatus: PosInvoiceWorkflowStatus;      // الحالة الجديدة
  notes?: string;            // الملاحظة
  createdAt: string;         // تاريخ التوثيق الفعلي ISO
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerTaxNumber?: string;
  type: 'pos' | 'print_order' | 'standard';
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  status: 'paid' | 'partial' | 'unpaid' | 'delivered';
  paymentStatus?: InvoicePaymentStatus; // حالة الدفع المنفصلة
  workflowStatus?: PosInvoiceWorkflowStatus; // حالة الفاتورة التشغيلية
  statusHistory?: InvoiceStatusLog[]; // سجل تتبع وتغييرات حالات الفاتورة
  createdAt?: string;
  updatedAt?: string;
  printJobId?: string;
  additionalCharges?: number;
  representative?: string;
  employeeId?: string; // معرف الموظف المرتبط بالفاتورة
  branch?: string;
  branchId?: string;
  userId?: string;
  userName?: string;
  warehouse?: string;
  customCustomerText?: string;
  subCustomerId?: string;     // معرف الزبون الفرعي
  subCustomerName?: string;   // اسم الزبون الفرعي / الدين غير الدائم
  subCustomerPhone?: string;  // هاتف الزبون الفرعي
  deliveryDate?: string;      // موعد/تاريخ التسليم للعميل
  technicalNotes?: InvoiceTechnicalNote[]; // ملاحظات فنية من قسم الطباعة والورشة
  printStartedAt?: string;    // وقت وتاريخ بدء الطباعة
  printStartedBy?: string;    // المستخدم الذي بدأ الطباعة
  printFinishedAt?: string;   // وقت وتاريخ إنهاء الطباعة
  printFinishedBy?: string;   // المستخدم الذي أنهى الطباعة
  deliveredAt?: string;       // وقت وتاريخ تسليم الفاتورة للعميل
  deliveredBy?: string;       // المستخدم الذي اعتمد تسليم الفاتورة
  currency?: string;          // e.g. 'ILS', 'USD', 'JOD', 'EUR'
  currencySymbol?: string;    // e.g. '₪', '$', 'د.أ', '€'
  exchangeRate?: number;      // rate against base currency (ILS), e.g. 3.70 for USD, 1 for ILS
  baseTotalAmount?: number;   // Total converted to Palestinian Shekels (₪ ILS)
  basePaidAmount?: number;    // Paid amount converted to Palestinian Shekels (₪ ILS)
  paymentNotes?: string;      // ملاحظة إيصال السداد / الدفعة (منفصلة تماماً عن ملاحظات الفاتورة)
  cashPaidAmount?: number;
  bankPaidAmount?: number;
  cashTreasuryCode?: string;
  bankTreasuryCode?: string;
  treasuryAccountCode?: string;
  taxTotal?: number;
  isAccountingPosted?: boolean; // هل تم ترحيل القيود وحركات المخزون؟
  postedAt?: string;
  deletedAt?: string;          // وقت وتاريخ الحذف (في سلة المحذوفات)
  deletedBy?: string;          // اسم المستخدم الذي حذف الفاتورة
  deletedByUserId?: string;    // معرف المستخدم الذي حذف الفاتورة
  deletionReason?: string;     // سبب الحذف
}

export interface AuditLogEntry {
  id: string;
  action: 'delete' | 'update' | 'create' | string;
  entityType: 'invoice' | 'party' | 'inventory' | 'voucher' | string;
  invoiceId: string;
  invoiceNumber?: string;
  user: string;
  userId?: string;
  timestamp: string;
  reason: string;
  details?: any;
  createdAt?: string;
}

export interface PurchaseItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber?: string; // رقم فاتورة المورد اليدوية/الخارجية
  date: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  status?: 'paid' | 'partial' | 'unpaid';
  paymentDueDate?: string;
  warehouse?: string;
  notes?: string;
  employeeId?: string; // معرف الموظف المرتبط بعملية الشراء
  currency?: string;
  currencySymbol?: string;
  exchangeRate?: number;
  baseTotalAmount?: number;
  basePaidAmount?: number;
}

export interface PurchaseReturnItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason?: string;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  date: string;
  purchaseInvoiceId?: string;
  purchaseInvoiceNumber?: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseReturnItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  settlementType: 'credit_balance' | 'cash_refund' | 'bank_refund';
  treasuryAccountCode?: string;
  notes?: string;
  createdAt: string;
  currency?: string;
  currencySymbol?: string;
  exchangeRate?: number;
}

export interface SalesReturnItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason?: string;
}

export interface SalesReturn {
  id: string;
  returnNumber: string; // مثل SR-2026-0001
  date: string;
  invoiceId?: string;
  invoiceNumber?: string;
  customerId: string;
  customerName: string;
  items: SalesReturnItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  settlementType: 'credit_balance' | 'cash_refund' | 'bank_refund';
  treasuryAccountCode?: string;
  notes?: string;
  createdAt: string;
  currency?: string;
  currencySymbol?: string;
  exchangeRate?: number;
  branchId?: string;
}

export interface Party {
  id: string;
  code: string; // الرقم التسلسلي الآلي الصادر من النظام (مثل CUST-0001 أو SUPP-0001) غير قابل للتعديل أو التكرار
  type: 'customer' | 'supplier' | 'both';
  name: string;
  phone: string;
  email?: string;
  taxNumber?: string;
  commercialRegister?: string; // السجل التجاري
  contactPerson?: string;       // الشخص المسؤول
  city?: string;                // المدينة
  address?: string;
  balance: number; // موجب = لنا عليه (مدين)، سالب = له علينا (دائن)
  openingBalance?: number;      // الدين السابق / الرصيد الافتتاحي
  openingBalanceDate?: string;  // تاريخ الدين السابق
  openingBalanceType?: 'debit' | 'credit'; // نوع الرصيد الافتتاحي (مدين عليه / دائن له)
  creditLimit?: number;         // الحد الائتماني
  notes?: string;
  parentPartyId?: string;       // معرف العميل الرئيسي إذا كان هذا زبون فرعي
  isSubCustomer?: boolean;      // هل هذا الحساب لزبون فرعي / دين مؤقت تابع لعميل رئيسي
  specialPrices?: Record<string, number>; // تسعير خاص للعميل: itemId -> specialPrice
}

export interface PaymentVoucher {
  id: string;
  voucherNumber: string;
  type: 'receipt' | 'payment'; // receipt = سند قبض (استلام نقدية)، payment = سند صرف (دفع نقدية)
  date: string;
  partyId: string;
  partyName: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'cheque' | 'card' | 'electronic' | 'e_wallet' | 'pos';
  accountCode: string; // الحساب المقابل (الصندوق / البنك)
  description: string;
  referenceInvoiceId?: string;
  relatedDocType?: string;
  relatedDocId?: string;
  employeeId?: string; // معرف الموظف المرتبط بالسند
  currency?: string;          // e.g. 'ILS', 'USD', 'JOD', 'EUR'
  currencySymbol?: string;    // e.g. '₪', '$', 'د.أ', '€'
  exchangeRate?: number;      // e.g. 3.70 for USD, 1.0 for ILS
  baseAmount?: number;        // المبلغ المعادل بالشيكل
  subCustomerId?: string;     // معرف الزبون الفرعي إن وجد
  subCustomerName?: string;   // اسم الزبون الفرعي
  treasuryAccountCode?: string; // كود الصندوق / الحساب البنكي المستخدم
  chequeNumber?: string;      // رقم الشيك في حال الدفع بشيك
  chequeBank?: string;        // البنك المسحوب عليه الشيك
  chequeDueDate?: string;     // تاريخ استحقاق وصرف الشيك
  transferReference?: string; // رقم الحوالة أو المرجع البنكي
}

export interface CurrencyInfo {
  code: string;           // 'ILS', 'USD', 'JOD', 'EUR', 'SAR', 'EGP'
  name: string;           // 'شيكل', 'دولار أمريكي', 'دينار أردني', etc.
  symbol: string;         // '₪', '$', 'د.أ', '€', 'ر.س', 'ج.م'
  rateAgainstBase: number;// 1 unit of currency = X Base (ILS) (e.g. 1 USD = 3.70 ILS, 1 JOD = 5.20 ILS, 1 ILS = 1.0)
  isBase: boolean;        // true for ILS
  isActive?: boolean;     // هل العملة مفعلة في شاشات الكاشير والمخزون
  updatedAt?: string;
}

export interface SqlServerConfig {
  enabled: boolean;
  serverUrl: string;
  dbType: 'postgres' | 'mysql' | 'sqlite';
  dbName: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
  lastSyncTime?: string;
  apiKey?: string;
}

export interface BusinessSettings {
  appTitle?: string; // مسمى وترويسة شريط العنوان في أعلى البرنامج
  businessName: string;
  businessNameEn: string;
  activityType: string;
  taxNumber?: string;
  crNumber?: string;
  showTaxNumberInPrints?: boolean;
  showCrNumberInPrints?: boolean;
  phone: string;
  email: string;
  address: string;
  // إمكانية رفع لوقو المنشأة وهيدر الطباعة والعناوين والهواتف المتعددة
    logoUrl?: string;           // صورة لوقو المنشأة (Base64 أو رابط)
  headerImageUrl?: string;    // صورة هيدر كامل لكافة الكشوفات والأوراق المطبوعة
  stampUrl?: string;          // ختم المنشأة (Base64 أو رابط)
  signatureUrl?: string;      // توقيع المدير/المخول (Base64 أو رابط)
  addresses?: string[];       // قائمة عناوين وفروع المنشأة المتعددة
  phones?: string[];          // قائمة أرقام الهواتف والجوالات المتعددة
  name?: string;              // الاسم البديل المتوافق
  description?: string;       // وصف النشاط البديل المتوافق
  invoiceFooter?: string;     // تذييل الفاتورة
  currency: string;           // Default display symbol: '₪'
  baseCurrencyCode?: string;  // Default base code: 'ILS'
  vatRate: number;
  invoiceFooterNote: string;
  logoText: string;
  currencies?: CurrencyInfo[];
  unitsOfMeasure?: UnitOfMeasure[]; // وحدات القياس المعتمدة وخصائصها
  sqlServerConfig?: SqlServerConfig;
  defaultPosLayout?: any; // تخطيط وتنسيق شاشة الكاشير الافتراضي للنظام
  defaultPosButtons?: any[]; // أزرار شاشة الكاشير الافتراضية للنظام
  defaultPosColumnWidths?: Record<string, number>; // عروض أعمدة الكاشير الافتراضية للنظام
  userScreenConfigs?: Record<string, {
    posLayout?: any;
    posButtons?: any[];
    posColumnWidths?: Record<string, number>;
    homeShortcuts?: string[];
  }>; // إعدادات وتخصيصات الشاشات المحفوظة لكل مستخدم سحابياً
  telegramConfig?: { botToken: string; defaultChatId: string; enabled: boolean };
  homeShortcuts?: string[];
  categories?: CategoryDefinition[]; // قائمة معرفات الاختصارات المفعلة في الشاشة الرئيسية
}

export type TreasuryType = 
  | 'cash_box'       // الصندوق النقدي (الكاشير / الخزينة الرئيسية)
  | 'bank_app'       // تطبيق بنكي / حوالات مصرفية
  | 'digital_wallet' // محفظة إلكترونية
  | 'pos_terminal'   // جهاز نقاط بيع (فيزا / POS)
  | 'bank_account';  // حساب بنكي جاري

export interface TreasuryTransaction {
  id: string;
  treasuryId: string;
  treasuryName: string;
  date: string;
  type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out';
  amount: number; // المبلغ الفعلي بالعملة الفعلية
  currency?: string; // العملة الفعلية e.g. 'USD', 'ILS', 'JOD'
  currencySymbol?: string; // رمز العملة e.g. '$', '₪', 'د.أ'
  exchangeRate?: number; // سعر الصرف وقت العملية (e.g. 3.70)
  baseCurrency?: string; // العملة الأساسية e.g. 'ILS'
  baseAmount?: number; // القيمة المكافئة بالعملة الأساسية وقت العملية (e.g. 3700)
  balanceAfter: number; // الرصيد التقديري الإجمالي بالعملة الأساسية بعدها
  balanceAfterCurrency?: number; // الرصيد الفعلي لتلك العملة في الصندوق بعد الحركة
  voucherNumber?: string; // رقم السند مثل RC-1 أو PV-1 أو INV-...
  partyName?: string; // اسم العميل أو المورد أو المستفيد
  description: string;
  referenceType?: 'pos_sale' | 'invoice' | 'print_order' | 'advance' | 'payroll' | 'expense' | 'purchase' | 'purchase_return' | 'sales_return' | 'transfer' | 'manual' | 'opening' | 'receipt' | 'payment';
  referenceId?: string;
  targetTreasuryId?: string;
  targetTreasuryName?: string;
  contraAccountCode?: string;
  contraAccountName?: string;
  actualCurrency?: string;
  actualAmount?: number;
  paymentMethod?: string;
  notes?: string;
}

export interface Treasury {
  id: string;
  name: string;
  type: TreasuryType;
  accountCode: string; // Linked account code in Chart of Accounts (e.g., '1101', '1102', '1103', etc.)
  balance: number; // الرصيد التقديري الإجمالي بالعملة الأساسية (الشيكل)
  currencyBalances?: Record<string, number>; // الأرصدة الحقيقية الفعلية لكل عملة منفصلة: { 'ILS': 1000, 'USD': 800, 'JOD': 500 }
  isDefault?: boolean; // الصندوق النقدي الرئيسي
  accountNumber?: string; // رقم الحساب أو الآيبان أو المعرف
  bankName?: string; // اسم البنك أو مشغل التطبيق
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
  currency?: string;       // e.g. 'ILS', 'USD', 'JOD'
  currencySymbol?: string; // e.g. '₪', '$', 'د.أ'
  transactions?: TreasuryTransaction[];
}

export type SalaryType = 'daily' | 'weekly' | 'monthly';

export type EmployeeDepartment =
  | 'management'
  | 'printing'
  | 'design'
  | 'sales_pos'
  | 'accounting'
  | 'delivery'
  | 'finishing'
  | 'other';

export interface SalaryPaymentRecord {
  id: string;
  date: string;
  amount: number;
  type: 'salary' | 'advance' | 'bonus' | 'deduction';
  period: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  voucherNumber?: string;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  jobTitle: string;
  department: EmployeeDepartment;
  nationalId?: string;
  phone: string;
  email?: string;
  salaryType: SalaryType;
  salaryAmount: number;
  allowances?: number;
  hireDate: string;
  status: 'active' | 'on_leave' | 'terminated';
  paymentMethod: PaymentMethod;
  bankName?: string;
  iban?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyRelation?: string;
  notes?: string;
  paymentHistory?: SalaryPaymentRecord[];
}

export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  amount: number;
  treasuryAccountCode: string; // '1101' | '1102'
  treasuryName: string;
  reason: string;
  status: 'pending' | 'deducted' | 'cancelled';
  disbursedImmediately: boolean;
  isCarryOver?: boolean;
  voucherNumber?: string;
  payrollSheetId?: string;
  payrollSheetTitle?: string;
  deductedAt?: string;
}

export interface EmployeeDeduction {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  amount: number;
  reason: string;
  status: 'pending' | 'deducted' | 'cancelled';
  payrollSheetId?: string;
  payrollSheetTitle?: string;
  deductedAt?: string;
}

export interface EmployeeIncentive {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  amount: number;
  reason: string;
  status: 'pending' | 'paid' | 'cancelled';
  payrollSheetId?: string;
  payrollSheetTitle?: string;
  paidAt?: string;
}

export interface PayrollSheetItem {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  jobTitle: string;
  department: EmployeeDepartment;
  salaryType: SalaryType;
  basicSalary: number;
  allowances: number;
  incentives: number; // حوافز ومكافآت
  deductions: number; // خصومات
  advancesDeducted: number; // سلف مقتطعة
  netSalary: number; // صافي الراتب المستحق = الأساسي + البدلات + الحوافز - الخصومات - السلف
  daysWorked?: number;
  isIncluded: boolean;
  notes?: string;
}

export interface PayrollSheet {
  id: string;
  sheetNumber: string; // e.g. PR-2026-0001
  title: string; // e.g. مسير رواتب شهر سبتمبر 2026
  salaryType: SalaryType; // 'monthly' | 'weekly' | 'daily'
  period: string; // e.g. "سبتمبر 2026"
  startDate?: string;
  endDate?: string;
  createdAt: string;
  status: 'draft' | 'approved'; // 'draft' مسودة | 'approved' معتمد ومصروف
  disbursedAt?: string;
  treasuryAccountCode: string; // '1101' | '1102'
  treasuryName: string;
  items: PayrollSheetItem[];
  totalBasic: number;
  totalAllowances: number;
  totalIncentives: number;
  totalDeductions: number;
  totalAdvances: number;
  totalNet: number;
  employeesCount: number;
  voucherNumber?: string;
  notes?: string;
}

export interface ExpenseItem {
  id: string;
  date: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  category: 'maintenance' | 'rent' | 'utilities' | 'marketing' | 'hospitality' | 'supplies' | 'other';
  categoryName: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | PaymentMethod;
  treasuryAccountCode: string;
  treasuryName: string;
  beneficiary: string;
  taxInvoiceNumber?: string;
  notes: string;
  createdAt: string;
  currency?: string;
  currencySymbol?: string;
  exchangeRate?: number;
  voucherNumber?: string;
  journalEntryId?: string;
}

// Convenient aliases for POS & Financial components
export type Currency = CurrencyInfo;
export type TreasuryAccount = Treasury;

export interface DebtClearingRecord {
  id: string;
  clearingNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  currency?: string;
  reason: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  customerOldBalance: number;
  customerNewBalance: number;
  supplierOldBalance: number;
  supplierNewBalance: number;
  journalEntryId?: string;
}

// Multi-Company, Multi-Branch, Users & Granular Permissions System
export * from './companyBranchUser';

// Database Zeroing & Clean Start (تصفير قاعدة البيانات لبدء التشغيل الفعلي)
export interface DatabaseZeroingOptions {
  cutoffDate: string; // YYYY-MM-DD
  fromDate?: string; // YYYY-MM-DD
  scope: 'up_to_date' | 'from_date' | 'date_range' | 'all'; // تصفير حتى هذا التاريخ فقط، من تاريخ معين، بين تاريخين، أو تصفير شامل

  // 1. العمليات والحركات المالية والتجارية
  resetInvoices: boolean;           // فواتير المبيعات ونقاط البيع
  resetPurchases: boolean;          // فواتير المشتريات ومشتريات الخامات
  resetSalesReturns: boolean;       // مردودات المبيعات
  resetPurchaseReturns: boolean;    // مردودات المشتريات
  resetVouchers: boolean;           // سندات القبض والصرف
  resetJournalEntries: boolean;     // قيود اليومية وحركات الحسابات
  resetPrintOrders: boolean;        // أوامر تشغيل المطبعة والورشة
  resetDebtClearings?: boolean;     // عمليات المقاصة وتسوية الديون
  resetExpenses?: boolean;          // المصروفات والمصاريف التشغيلية

  // 2. المخازن والأصناف والكرتات المخزنية وكل ما يتعلق بالصنف
  zeroInventoryStock: boolean;      // تصفير كميات وأرصدة المخزون لجميع الأصناف (0.00 لبدء جرد فعلي)
  resetManualInventoryItems: boolean;// حذف كرتات الأصناف والمنتجات والخامات المضافة
  resetStockMovements: boolean;      // حركات المخزون بالكامل (صرف، قبض/توريد، جرد، بيع، شراء، تبديل وتغيير ومناقلات)
  resetWarehouseOperations: boolean;// عمليات المستودعات وأذونات الصرف والتوريد
  resetManualWarehouses: boolean;   // حذف المستودعات الإضافية المضافة يدوياً

  // 3. الموظفون والرواتب ومستحقاتهم بالكامل
  resetEmployees: boolean;          // حذف أسماء وسجلات الموظفين
  resetPayroll: boolean;            // كشوف ومسيرات الرواتب
  resetEmployeeAdvances?: boolean;  // سلف الموظفين
  resetEmployeeDeductions?: boolean;// خصومات وجزاءات الموظفين
  resetEmployeeIncentives?: boolean;// مكافآت وحوافز الموظفين

  // 4. العملاء والموردين والأطراف
  resetManualParties: boolean;      // حذف العملاء والموردين المضافين يدوياً
  zeroPartyBalances: boolean;       // تصفير أرصدة الذمم والمديونيات لجميع العملاء والموردين (0.00 ₪)

  // 5. الصناديق والخزنات والحسابات البنكية
  zeroTreasuryBalances: boolean;    // تصفير أرصدة وحركات الصناديق والخزنات لتصبح 0.00 ₪
  resetManualTreasuries: boolean;   // حذف الصناديق والحسابات البنكية المضافة يدوياً

  // 6. شجرة الحسابات والدليل المحاسبي
  zeroAccountBalances: boolean;     // تصفير أرصدة حسابات الدليل المحاسبي لتبدأ من 0.00 ₪
}

export interface ZeroingExecutionResult {
  success: boolean;
  message: string;
  summary: {
    deletedInvoices: number;
    deletedPurchases: number;
    deletedSalesReturns: number;
    deletedPurchaseReturns: number;
    deletedVouchers: number;
    deletedJournalEntries: number;
    deletedPrintOrders: number;
    deletedStockMovements: number;
    deletedWarehouseOperations: number;
    deletedDebtClearings: number;
    deletedExpenses: number;
    deletedEmployees: number;
    deletedPayrollSheets: number;
    deletedEmployeeAdvances: number;
    deletedEmployeeDeductions: number;
    deletedEmployeeIncentives: number;
    deletedPayrollRecords: number;
    deletedManualParties: number;
    zeroedPartyBalances: number;
    zeroedInventoryStocks: number;
    deletedManualItems: number;
    deletedManualWarehouses: number;
    zeroedTreasuries: number;
    deletedManualTreasuries: number;
    zeroedAccounts: number;
  };
  executedAt: string;
  executedBy: string;
}

// Bulk deletion options and result for sales invoices and associated inventory/vouchers
export interface DeleteAllSalesInvoicesOptions {
  restoreStock?: boolean;
  deleteLinkedVouchers?: boolean;
  deleteLinkedStockMovements?: boolean;
  deleteLinkedJournalEntries?: boolean;
  revertCustomerBalances?: boolean;
  revertTreasuryBalances?: boolean;
  clearDeletedInvoicesTrash?: boolean;
}

export interface DeleteAllSalesInvoicesResult {
  success: boolean;
  message: string;
  deletedInvoicesCount: number;
  deletedVouchersCount: number;
  deletedMovementsCount: number;
  restoredItemsCount: number;
  restoredTotalUnits: number;
  adjustedPartiesCount: number;
  adjustedTreasuriesCount: number;
  executedAt: string;
}

// ==========================================
// Daily Entry Sheet Types (كشف إدخال يومي)
// ==========================================

export interface DailyEntryRow {
  id: string;
  serialNumber: number; // رقم مسلسل
  entryDate?: string; // تاريخ اليوم (YYYY-MM-DD) للحركة المتتابعة
  isSaved?: boolean; // هل تم حفظ وتثبيت هذا البند رسمياً والمزامنة عليه
  customerId?: string;
  customerName: string; // اسم الزبون الرئيسي
  subCustomerId?: string;
  subCustomerName?: string; // الزبون الفرعي
  itemId?: string;
  itemName: string; // الصنف
  notes?: string; // ملاحظات
  requiredAmount: number; // المبلغ المطلوب
  paidAmount: number; // المدفوع
  paymentNotes?: string; // ملاحظة السداد (الملاحظة المرفقة مع السداد)
  treasuryId?: string; // الصندوق
  treasuryName?: string; // اسم الصندوق
  parentRowId?: string; // معرف السطر الأب إذا كان صنف إضافي لنفس الزبون
  isAdditionalItem?: boolean; // هل هو صنف إضافي لنفس الزبون
  isApproved?: boolean; // هل تم اعتماد السطر كفاتورة
  approvedInvoiceId?: string; // معرف الفاتورة المعتمدة
  approvedInvoiceNumber?: string; // رقم الفاتورة المعتمدة
  approvedAt?: string; // تاريخ ووقت الاعتماد
}

export interface RowLockInfo {
  rowId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  field?: string;
  lockedAt: number; // timestamp
}

export interface DailyEntrySheet {
  date: string; // YYYY-MM-DD
  rows: DailyEntryRow[];
  notes?: string;
  updatedAt?: string;
  activeLocks?: Record<string, RowLockInfo>; // rowId -> lock info
}
