/**
 * اعتماد الأرقام العربية (0, 1, 2, 3, 4, 5, 6, 7, 8, 9)
 * في كافة واجهات وتقارير البرنامج دون التأثر بنظام أو إعدادات الأجهزة المختلفة (iOS, Android, Windows)
 */

const EASTERN_NUMERALS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '،': ',', '٫': '.', '٬': ','
};

/**
 * تحويل أي أرقام مشرقية/هندية مدخلة إلى الأرقام العربية المعتمدة
 */
export function normalizeArabicDigits(input: string | number): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  return str.replace(/[٠-٩۰-۹،٫٬]/g, char => EASTERN_NUMERALS[char] || char);
}

/**
 * تنسيق الأرقام بطريقة موحدة معتمدة على الأرقام العربية الأصلية (0-9)
 * واستخدام الفاصلة للآلاف والنقطة للأعشار بشكل موحد ومستقر
 */
export function formatNumber(
  value: number | string | undefined | null,
  options?: number | {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    useGrouping?: boolean;
  }
): string {
  if (value === undefined || value === null || value === '') return '0';
  const rawStr = normalizeArabicDigits(value);
  const num = typeof value === 'number' ? value : parseFloat(rawStr);
  if (isNaN(num)) return '0';

  const opts = typeof options === 'number'
    ? { minimumFractionDigits: options, maximumFractionDigits: options, useGrouping: true }
    : options;

  const minFraction = opts?.minimumFractionDigits !== undefined ? opts.minimumFractionDigits : 0;
  const maxFraction = opts?.maximumFractionDigits !== undefined ? opts.maximumFractionDigits : 2;
  const useGrouping = opts?.useGrouping !== false;

  // إجبار استخدام en-US لضمان عدم قيام المتصفح أو نظام التشغيل بعرض الأرقام الهندية
  return num.toLocaleString('en-US', {
    minimumFractionDigits: minFraction,
    maximumFractionDigits: maxFraction,
    useGrouping
  });
}

/**
 * تنسيق المبالغ النقدية مع رمز العملة
 */
export function formatMoney(
  value: number | string | undefined | null,
  currencySymbol: string = '₪',
  decimals: number = 2
): string {
  const formatted = formatNumber(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return `${formatted} ${currencySymbol}`;
}

/**
 * تفعيل حظر الأرقام الهندية/المشرقية وإجبار الأرقام العربية (0-9)
 * في جميع أنحاء النظام والمتصفحات والأجهزة المختلفة
 */
export function enforceArabicNumeralsGlobally(): void {
  if (typeof window === 'undefined') return;

  // 1. حماية Number.prototype.toLocaleString من إظهار الأرقام الهندية
  const originalNumberToLocaleString = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function(
    locales?: string | string[],
    options?: Intl.NumberFormatOptions
  ): string {
    const forcedOptions: Intl.NumberFormatOptions = {
      ...(options || {}),
      numberingSystem: 'latn' // إجبار نظام الترقيم العربي 0-9
    };
    try {
      // استخدام en-US لضمان عدم قيام أي متصفح بالاستجابة لإعدادات الجهاز المحلية وعرض أرقام هندية
      const res = originalNumberToLocaleString.call(this, 'en-US', forcedOptions);
      return normalizeArabicDigits(res);
    } catch {
      return String(this);
    }
  };

  // 2. تحويل أي مدخلات بالأرقام المشرقية في الحقول تلقائياً
  window.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (target.type === 'number' || target.type === 'text') {
        const val = target.value;
        if (/[٠-٩۰-۹]/.test(val)) {
          const normalized = normalizeArabicDigits(val);
          target.value = normalized;
        }
      }
    }
  }, true);
}
