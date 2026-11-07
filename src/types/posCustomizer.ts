import { LucideIcon } from 'lucide-react';

export type PosButtonActionType =
  | 'new_invoice'            // Ctrl+N فاتورة جديدة
  | 'save_invoice'           // F5 حفظ الفاتورة
  | 'save_and_print'         // Alt+C حفظ وطباعة حراري
  | 'save_and_print_a4_custom'// حفظ وطباعة A4 تصميم 2
  | 'quick_pay_cash'         // دفع نقدي
  | 'pay_cash_and_print'     // دفع نقدي وطباعة
  | 'pay_cash_and_print_a4_custom'// دفع نقدي وطباعة A4 تصميم 2
  | 'quick_pay_card'         // دفع فيزا / بطاقة
  | 'hold_invoice'           // F9 تعليق الفاتورة
  | 'clear_invoice'          // إلغاء الفاتورة والبدء بجديدة
  | 'nav_first'              // أول فاتورة
  | 'nav_prev'               // الفاتورة السابقة
  | 'nav_next'               // الفاتورة التالية
  | 'nav_last'               // آخر فاتورة
  | 'delete_invoice'         // حذف الفاتورة
  | 'refresh_data'           // تحديث البيانات
  | 'search_invoices'        // بحث في الفواتير
  | 'open_customer_ledger'   // كشف حساب العميل
  | 'open_favorite_drawer'   // نافذة المفضلة واللمس
  | 'open_item_search'       // بحث الأصناف المتقدم
  | 'open_calculator'        // آلة حاسبة
  | 'open_cash_drawer'       // فتح درج النقدية
  | 'quick_discount_percent' // خصم نسبة مئوية (مثل 5% أو 10%)
  | 'quick_discount_amount'  // خصم مبلغ ثابت (مثل 10 شيكل)
  | 'insert_item'            // إدراج صنف مخصص بنقرة واحدة (تصوير، ورق، درع...)
  | 'sound_test'             // اختبار رنة الكاشير
  | 'open_camera_scanner'    // تشغيل كاميرا الباركود
  | 'held_invoices_list'     // قائمة الفواتير المعلقة
  | 'open_invoice_details'   // تفاصيل الفاتورة
  | 'open_daily_invoices'    // سجل فواتير اليوم
  | 'open_deleted_invoices'   // سلة الفواتير المحذوفة
  | 'add_delivery_service';  // خدمة توصيل

export type PosButtonLocation = 'bottom_bar' | 'top_toolbar' | 'quick_grid';

export type PosButtonColorScheme =
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'purple'
  | 'slate'
  | 'cyan'
  | 'indigo'
  | 'orange';

export interface PosCustomButton {
  id: string;
  label: string;
  subLabel?: string;
  iconName: string;
  actionType: PosButtonActionType;
  actionPayload?: any; // e.g. itemId, discount value
  colorScheme: PosButtonColorScheme;
  shortcut?: string;
  location: PosButtonLocation;
  order: number;
  isVisible: boolean;
  isCustom?: boolean;
}

export const DEFAULT_POS_BUTTONS: PosCustomButton[] = [
  // --- BOTTOM MAIN ACTION BAR ---
  {
    id: 'btn_f5_save',
    label: 'حفظ',
    subLabel: 'حفظ الفاتورة',
    iconName: 'Save',
    actionType: 'save_invoice',
    colorScheme: 'blue',
    shortcut: 'Ctrl+S',
    location: 'bottom_bar',
    order: 1,
    isVisible: true
  },
  {
    id: 'btn_f10_print',
    label: 'حراري',
    subLabel: 'حفظ وطباعة حراري',
    iconName: 'Printer',
    actionType: 'save_and_print',
    colorScheme: 'blue',
    shortcut: 'Alt+C',
    location: 'bottom_bar',
    order: 2,
    isVisible: true
  },
  {
    id: 'btn_pay_cash',
    label: 'دفع',
    subLabel: 'سداد نقدي',
    iconName: 'Banknote',
    actionType: 'quick_pay_cash',
    colorScheme: 'blue',
    shortcut: 'F5',
    location: 'bottom_bar',
    order: 3,
    isVisible: true
  },
  {
    id: 'btn_pay_print',
    label: 'دفع وطباعة',
    subLabel: 'سداد وإيصال',
    iconName: 'Printer',
    actionType: 'pay_cash_and_print',
    colorScheme: 'blue',
    shortcut: 'Ctrl+↵',
    location: 'bottom_bar',
    order: 4,
    isVisible: true
  },
  {
    id: 'btn_pay_card',
    label: 'فيزا',
    subLabel: 'بطاقة ائتمان',
    iconName: 'CreditCard',
    actionType: 'quick_pay_card',
    colorScheme: 'blue',
    location: 'bottom_bar',
    order: 5,
    isVisible: true
  },
  {
    id: 'btn_f9_hold',
    label: 'تعليق',
    subLabel: 'تعليق الفاتورة',
    iconName: 'PauseCircle',
    actionType: 'hold_invoice',
    colorScheme: 'indigo',
    shortcut: 'F9',
    location: 'bottom_bar',
    order: 6,
    isVisible: true
  },
  {
    id: 'btn_held_list',
    label: 'المعلقة',
    subLabel: 'الفواتير المعلقة',
    iconName: 'Clock',
    actionType: 'held_invoices_list',
    colorScheme: 'amber',
    location: 'bottom_bar',
    order: 7,
    isVisible: true
  },
  // --- TOP TOOLBAR ---
  {
    id: 'btn_top_new',
    label: 'جديد',
    subLabel: 'فاتورة جديدة',
    shortcut: 'Ctrl+N',
    iconName: 'Plus',
    actionType: 'new_invoice',
    colorScheme: 'emerald',
    location: 'top_toolbar',
    order: 0,
    isVisible: true
  },
  {
    id: 'btn_top_cancel',
    label: 'إلغاء',
    iconName: 'Ban',
    actionType: 'clear_invoice',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 1,
    isVisible: true
  },
  {
    id: 'btn_top_nav_first',
    label: 'الأول',
    iconName: 'SkipBack',
    actionType: 'nav_first',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 2,
    isVisible: true
  },
  {
    id: 'btn_top_nav_prev',
    label: 'السابق',
    iconName: 'ChevronRight',
    actionType: 'nav_prev',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 3,
    isVisible: true
  },
  {
    id: 'btn_top_nav_next',
    label: 'التالي',
    iconName: 'ChevronLeft',
    actionType: 'nav_next',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 4,
    isVisible: true
  },
  {
    id: 'btn_top_nav_last',
    label: 'الأخير',
    iconName: 'SkipForward',
    actionType: 'nav_last',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 5,
    isVisible: true
  },
  {
    id: 'btn_top_delete',
    label: 'حذف',
    iconName: 'Trash2',
    actionType: 'delete_invoice',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 8,
    isVisible: true
  },
  {
    id: 'btn_top_refresh',
    label: 'تحديث البيانات',
    iconName: 'RotateCcw',
    actionType: 'refresh_data',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 9,
    isVisible: true
  },
  {
    id: 'btn_top_search',
    label: 'بحث',
    iconName: 'Search',
    actionType: 'search_invoices',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 10,
    isVisible: true
  },
  {
    id: 'btn_top_customer_ledger',
    label: 'كشف حساب',
    iconName: 'FileText',
    actionType: 'open_customer_ledger',
    colorScheme: 'slate',
    location: 'top_toolbar',
    order: 11,
    isVisible: true
  },

  // --- QUICK SHORTCUTS GRID / BAR ---
  {
    id: 'btn_quick_discount_5',
    label: 'خصم 5%',
    iconName: 'Percent',
    actionType: 'quick_discount_percent',
    actionPayload: 5,
    colorScheme: 'amber',
    location: 'quick_grid',
    order: 1,
    isVisible: true
  },
  {
    id: 'btn_quick_discount_10',
    label: 'خصم 10%',
    iconName: 'Percent',
    actionType: 'quick_discount_percent',
    actionPayload: 10,
    colorScheme: 'amber',
    location: 'quick_grid',
    order: 2,
    isVisible: true
  },
  {
    id: 'btn_quick_calculator',
    label: 'حاسبة',
    iconName: 'Calculator',
    actionType: 'open_calculator',
    colorScheme: 'indigo',
    location: 'quick_grid',
    order: 4,
    isVisible: true
  },
  {
    id: 'btn_quick_drawer',
    label: 'فتح الدرج',
    iconName: 'Layers',
    actionType: 'open_cash_drawer',
    colorScheme: 'emerald',
    location: 'quick_grid',
    order: 5,
    isVisible: true
  }
];

const POS_BUTTONS_STORAGE_KEY = 'pos_custom_buttons_config_v2';

export function getPosButtonsStorageKey(userId?: string): string {
  return POS_BUTTONS_STORAGE_KEY;
}

export function loadPosCustomButtons(userId?: string, adminFallback?: PosCustomButton[]): PosCustomButton[] {
  try {
    const raw = localStorage.getItem(POS_BUTTONS_STORAGE_KEY) ||
      (userId ? localStorage.getItem(`${POS_BUTTONS_STORAGE_KEY}_user_${userId.trim()}`) : null) ||
      localStorage.getItem(`${POS_BUTTONS_STORAGE_KEY}_user_usr-1`) ||
      localStorage.getItem(`${POS_BUTTONS_STORAGE_KEY}_user_user-1789170883526`);

    let buttons: PosCustomButton[] = [];

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        buttons = parsed.map(btn => {
          const baseList = (adminFallback && adminFallback.length > 0) ? adminFallback : DEFAULT_POS_BUTTONS;
          const defaultBtn = baseList.find(d => d.id === btn.id);
          if (defaultBtn && !btn.isCustom) {
            return {
              ...btn,
              shortcut: defaultBtn.shortcut,
              label: defaultBtn.label,
              subLabel: defaultBtn.subLabel || btn.subLabel,
            };
          }
          return btn;
        });
      }
    } else if (adminFallback && Array.isArray(adminFallback) && adminFallback.length > 0) {
      buttons = adminFallback;
    } else {
      buttons = DEFAULT_POS_BUTTONS;
    }

    // Always enforce Alt+C for thermal print button (حراري)
    let modified = false;
    let migrated = buttons.map(btn => {
      if (btn.id === 'btn_f10_print' || btn.label === 'حراري' || btn.actionType === 'save_and_print') {
        if (btn.shortcut !== 'Alt+C' || btn.label !== 'حراري' || btn.subLabel !== 'حفظ وطباعة حراري') {
          modified = true;
        }
        return {
          ...btn,
          label: 'حراري',
          subLabel: 'حفظ وطباعة حراري',
          shortcut: 'Alt+C',
        };
      }
      return btn;
    });

    // Ensure 'btn_top_new' (جديد Ctrl+N) is present before 'btn_top_cancel'
    if (!migrated.some(b => b.id === 'btn_top_new' || b.actionType === 'new_invoice')) {
      const cancelIdx = migrated.findIndex(b => b.id === 'btn_top_cancel' || b.actionType === 'clear_invoice');
      const newBtn: PosCustomButton = {
        id: 'btn_top_new',
        label: 'جديد',
        subLabel: 'فاتورة جديدة',
        shortcut: 'Ctrl+N',
        iconName: 'Plus',
        actionType: 'new_invoice',
        colorScheme: 'emerald',
        location: 'top_toolbar',
        order: 0,
        isVisible: true
      };
      if (cancelIdx >= 0) {
        migrated.splice(cancelIdx, 0, newBtn);
      } else {
        migrated.unshift(newBtn);
      }
      modified = true;
    }

    if (modified) {
      savePosCustomButtons(migrated, userId);
    }

    return migrated;
  } catch (err) {
    console.warn('Failed to load POS custom buttons:', err);
    return (adminFallback || DEFAULT_POS_BUTTONS).map(btn => {
      if (btn.id === 'btn_f10_print' || btn.label === 'حراري' || btn.actionType === 'save_and_print') {
        return {
          ...btn,
          label: 'حراري',
          subLabel: 'حفظ وطباعة حراري',
          shortcut: 'Alt+C',
        };
      }
      return btn;
    });
  }
}

export function savePosCustomButtons(buttons: PosCustomButton[], userId?: string): void {
  try {
    const jsonStr = JSON.stringify(buttons);
    localStorage.setItem(POS_BUTTONS_STORAGE_KEY, jsonStr);
    localStorage.setItem(`${POS_BUTTONS_STORAGE_KEY}_user_usr-1`, jsonStr);
    localStorage.setItem(`${POS_BUTTONS_STORAGE_KEY}_user_user-1789170883526`, jsonStr);
    if (userId && userId.trim() !== '') {
      localStorage.setItem(`${POS_BUTTONS_STORAGE_KEY}_user_${userId.trim()}`, jsonStr);
    }
  } catch (err) {
    console.error('Failed to save POS custom buttons:', err);
  }
}

export function resetPosCustomButtonsToDefault(userId?: string, adminFallback?: PosCustomButton[]): PosCustomButton[] {
  try {
    const target = adminFallback || DEFAULT_POS_BUTTONS;
    savePosCustomButtons(target, userId);
    return target;
  } catch {
    return adminFallback || DEFAULT_POS_BUTTONS;
  }
}

