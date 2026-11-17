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

  // 2. Normalize digits without bypassing React's controlled-input state.
  // Previously: target.value = normalized in WINDOW CAPTURE. React installs
  // an instance value tracker on inputs. Writing through that instance setter
  // updates the tracker before React's delegated onChange runs; React may then
  // see "no change", leave its state stale, and erase the displayed cashier
  // line notes on the next render. Reproduce: paste a note containing ٩٠×١٣٠,
  // move focus to quantity, then let the repository rerender the POS.
  const normalizeInput = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
    if (target instanceof HTMLInputElement &&
        !['text', 'search', 'tel', 'number'].includes(target.type)) return;
    if ((e as InputEvent).isComposing) return;
    const before = target.value;
    if (!/[٠-٩۰-۹]/.test(before)) return;
    const normalized = normalizeArabicDigits(before);
    if (normalized === before) return;
    const proto = target.tagName === 'INPUT'
      ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) return; // Safer to leave original text than lose a controlled value.
    const hasSelection = target.tagName !== 'INPUT' ||
      (target as HTMLInputElement).type !== 'number';
    const start = hasSelection ? target.selectionStart : null;
    const end = hasSelection ? target.selectionEnd : null;
    // Invoke the native *prototype* setter: React's instance tracker stays at
    // its old value until the dispatched input event reaches React onChange.
    setter.call(target, normalized);
    if (hasSelection && start !== null && end !== null) {
      try {target.setSelectionRange(start, end);} catch {}
    }
    target.dispatchEvent(new Event('input', {bubbles: true}));
  };
  window.addEventListener('input', normalizeInput, true);
  window.addEventListener('compositionend', normalizeInput, true);
}
