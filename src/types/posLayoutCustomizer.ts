export interface PosTableColumnConfig {
  showIndex: boolean;
  showItemCode: boolean;   // رقم / كود الصنف
  showBarcode: boolean;
  showNotes: boolean;
  showDimensions: boolean; // Length, Width
  showCount: boolean;      // العدد
  showQuantity: boolean;
  showUnit: boolean;
  showUnitPrice: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showAttachments: boolean;
  showImageThumbnail: boolean; // الصورة المصغرة للبند
  showDeleteButton: boolean;
}

export interface PosLayoutConfig {
  // Screen Sections Visibility (إظهار وإخفاء أقسام الشاشة)
  showTopToolbar: boolean;
  showCustomerHeader: boolean;
  showExtraHeaderOptions: boolean; // مندوب، شحن، فئة السعر
  showFavoritesSidebar: boolean;   // شريط مفضلة الكاشير الأيمن الممتد
  showQuickShortcutsBar: boolean;  // شريط الاختصارات السريعة المخصص
  showTableStatsFooter: boolean;   // شريط إحصائيات الجدول (عدد الأصناف، القطع)
  showTotalsBreakdown: boolean;    // تفاصيل الإجمالي والخصم والضريبة
  showPaymentConsole: boolean;     // لوحة الدفع والصندوق والعملة الشاملة

  // Table Columns Visibility (إظهار وإخفاء أعمدة الجدول)
  tableColumns: PosTableColumnConfig;

  // Visual Comfort & Sizing (الكثافة وحجم الخط)
  uiDensity: 'compact' | 'normal' | 'spacious';
  fontSize: 'small' | 'medium' | 'large';

  // Bottom Area Arrangement (ترتيب قسم الدفع في الأسفل)
  bottomLayoutOrder: 'payment_first' | 'standard' | 'totals_first';

  // Date Lock Option (تثبيت التاريخ في كل العمليات على تاريخ محدد)
  isDateLocked?: boolean;
  lockedDate?: string;
}

export const DEFAULT_POS_LAYOUT_CONFIG: PosLayoutConfig = {
  showTopToolbar: true,
  showCustomerHeader: true,
  showExtraHeaderOptions: true,
  showFavoritesSidebar: true,
  showQuickShortcutsBar: true,
  showTableStatsFooter: true,
  showTotalsBreakdown: true,
  showPaymentConsole: true,

  tableColumns: {
    showIndex: true,
    showItemCode: false,
    showBarcode: false,
    showNotes: true,
    showDimensions: true,
    showCount: true,
    showQuantity: true,
    showUnit: true,
    showUnitPrice: true,
    showDiscount: true,
    showTax: true,
    showAttachments: true,
    showImageThumbnail: true,
    showDeleteButton: true
  },

  uiDensity: 'normal',
  fontSize: 'medium',
  bottomLayoutOrder: 'payment_first',
  isDateLocked: false,
  lockedDate: ''
};

const STORAGE_KEY = 'pos_layout_config_v3';

export function getPosLayoutStorageKey(userId?: string): string {
  return STORAGE_KEY;
}

export function loadPosLayoutConfig(userId?: string, adminFallback?: PosLayoutConfig): PosLayoutConfig {
  try {
    // 1. Try shared system configuration first
    const raw = localStorage.getItem(STORAGE_KEY) ||
      (userId ? localStorage.getItem(`${STORAGE_KEY}_user_${userId.trim()}`) : null) ||
      localStorage.getItem(`${STORAGE_KEY}_user_usr-1`) ||
      localStorage.getItem(`${STORAGE_KEY}_user_user-1789170883526`);
    
    // If explicit saved customization exists, use it
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const baseAdmin = (adminFallback && typeof adminFallback === 'object') ? adminFallback : DEFAULT_POS_LAYOUT_CONFIG;
        return {
          ...DEFAULT_POS_LAYOUT_CONFIG,
          ...baseAdmin,
          ...parsed,
          showFavoritesSidebar: parsed.showFavoritesSidebar !== undefined ? Boolean(parsed.showFavoritesSidebar) : (baseAdmin.showFavoritesSidebar !== undefined ? Boolean(baseAdmin.showFavoritesSidebar) : true),
          tableColumns: {
            ...DEFAULT_POS_LAYOUT_CONFIG.tableColumns,
            ...(baseAdmin.tableColumns || {}),
            ...(parsed.tableColumns && typeof parsed.tableColumns === 'object' ? parsed.tableColumns : {}),
            showItemCode: parsed.tableColumns?.showItemCode !== undefined ? Boolean(parsed.tableColumns.showItemCode) : (baseAdmin.tableColumns?.showItemCode !== undefined ? Boolean(baseAdmin.tableColumns.showItemCode) : false),
            showCount: parsed.tableColumns?.showCount !== undefined ? Boolean(parsed.tableColumns.showCount) : (baseAdmin.tableColumns?.showCount !== undefined ? Boolean(baseAdmin.tableColumns.showCount) : true),
            showImageThumbnail: parsed.tableColumns?.showImageThumbnail !== undefined ? Boolean(parsed.tableColumns.showImageThumbnail) : (baseAdmin.tableColumns?.showImageThumbnail !== undefined ? Boolean(baseAdmin.tableColumns.showImageThumbnail) : true)
          }
        };
      }
    }

    // 2. Inherit admin baseline if provided
    if (adminFallback && typeof adminFallback === 'object') {
      return {
        ...DEFAULT_POS_LAYOUT_CONFIG,
        ...adminFallback,
        showFavoritesSidebar: adminFallback.showFavoritesSidebar !== undefined ? Boolean(adminFallback.showFavoritesSidebar) : true,
        tableColumns: {
          ...DEFAULT_POS_LAYOUT_CONFIG.tableColumns,
          ...(adminFallback.tableColumns || {}),
          showItemCode: adminFallback.tableColumns?.showItemCode !== undefined ? Boolean(adminFallback.tableColumns.showItemCode) : false,
          showCount: adminFallback.tableColumns?.showCount !== undefined ? Boolean(adminFallback.tableColumns.showCount) : true,
          showImageThumbnail: adminFallback.tableColumns?.showImageThumbnail !== undefined ? Boolean(adminFallback.tableColumns.showImageThumbnail) : true
        }
      };
    }

    return DEFAULT_POS_LAYOUT_CONFIG;
  } catch (err) {
    console.error('Failed to load pos layout config', err);
    return adminFallback || DEFAULT_POS_LAYOUT_CONFIG;
  }
}

export function savePosLayoutConfig(config: PosLayoutConfig, userId?: string): void {
  try {
    if (!config || typeof config !== 'object') return;
    const jsonStr = JSON.stringify(config);
    localStorage.setItem(STORAGE_KEY, jsonStr);
    localStorage.setItem(`${STORAGE_KEY}_user_usr-1`, jsonStr);
    localStorage.setItem(`${STORAGE_KEY}_user_user-1789170883526`, jsonStr);
    if (userId && userId.trim() !== '') {
      localStorage.setItem(`${STORAGE_KEY}_user_${userId.trim()}`, jsonStr);
    }
  } catch (err) {
    console.error('Failed to save pos layout config', err);
  }
}

export function resetPosLayoutConfigToDefault(userId?: string, adminFallback?: PosLayoutConfig): PosLayoutConfig {
  const targetConfig = (adminFallback && typeof adminFallback === 'object') ? adminFallback : DEFAULT_POS_LAYOUT_CONFIG;
  savePosLayoutConfig(targetConfig, userId);
  return targetConfig;
}

// ==========================================
// Excel-like Column Widths Customization
// ==========================================
export type PosColumnKey =
  | 'index'
  | 'itemCode'
  | 'itemName'
  | 'notes'
  | 'length'
  | 'width'
  | 'count'
  | 'quantity'
  | 'unit'
  | 'unitPrice'
  | 'discount'
  | 'tax'
  | 'total'
  | 'attachments'
  | 'imageThumbnail'
  | 'delete';

export const DEFAULT_POS_COLUMN_WIDTHS: Record<PosColumnKey, number> = {
  index: 38,
  itemCode: 100,
  itemName: 260,
  notes: 240,
  length: 64,
  width: 64,
  count: 64,
  quantity: 80,
  unit: 72,
  unitPrice: 88,
  discount: 72,
  tax: 72,
  total: 96,
  attachments: 76,
  imageThumbnail: 70,
  delete: 48,
};

export const MIN_POS_COLUMN_WIDTHS: Record<PosColumnKey, number> = {
  index: 28,
  itemCode: 65,
  itemName: 120,
  notes: 80,
  length: 45,
  width: 45,
  count: 45,
  quantity: 50,
  unit: 45,
  unitPrice: 55,
  discount: 50,
  tax: 50,
  total: 65,
  attachments: 50,
  imageThumbnail: 50,
  delete: 36,
};

const POS_COLUMN_WIDTHS_STORAGE_KEY = 'pos_column_widths_v2';

export function getPosColumnWidthsStorageKey(userId?: string): string {
  return POS_COLUMN_WIDTHS_STORAGE_KEY;
}

export function loadPosColumnWidths(userId?: string, adminFallback?: Record<PosColumnKey, number>): Record<PosColumnKey, number> {
  try {
    const raw = localStorage.getItem(POS_COLUMN_WIDTHS_STORAGE_KEY) ||
      (userId ? localStorage.getItem(`${POS_COLUMN_WIDTHS_STORAGE_KEY}_user_${userId.trim()}`) : null) ||
      localStorage.getItem(`${POS_COLUMN_WIDTHS_STORAGE_KEY}_user_usr-1`) ||
      localStorage.getItem(`${POS_COLUMN_WIDTHS_STORAGE_KEY}_user_user-1789170883526`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_POS_COLUMN_WIDTHS,
          ...(adminFallback || {}),
          ...parsed,
        };
      }
    }

    if (adminFallback && typeof adminFallback === 'object') {
      return {
        ...DEFAULT_POS_COLUMN_WIDTHS,
        ...adminFallback
      };
    }

    return { ...DEFAULT_POS_COLUMN_WIDTHS };
  } catch (err) {
    console.error('Failed to load column widths', err);
    return adminFallback || { ...DEFAULT_POS_COLUMN_WIDTHS };
  }
}

export function savePosColumnWidths(widths: Record<PosColumnKey, number>, userId?: string): void {
  try {
    if (!widths || typeof widths !== 'object') return;
    const jsonStr = JSON.stringify(widths);
    localStorage.setItem(POS_COLUMN_WIDTHS_STORAGE_KEY, jsonStr);
    localStorage.setItem(`${POS_COLUMN_WIDTHS_STORAGE_KEY}_user_usr-1`, jsonStr);
    localStorage.setItem(`${POS_COLUMN_WIDTHS_STORAGE_KEY}_user_user-1789170883526`, jsonStr);
    if (userId && userId.trim() !== '') {
      localStorage.setItem(`${POS_COLUMN_WIDTHS_STORAGE_KEY}_user_${userId.trim()}`, jsonStr);
    }
  } catch (err) {
    console.error('Failed to save column widths', err);
  }
}

export function resetPosColumnWidthsToDefault(userId?: string, adminFallback?: Record<PosColumnKey, number>): Record<PosColumnKey, number> {
  const target = adminFallback || DEFAULT_POS_COLUMN_WIDTHS;
  savePosColumnWidths(target, userId);
  return { ...target };
}

