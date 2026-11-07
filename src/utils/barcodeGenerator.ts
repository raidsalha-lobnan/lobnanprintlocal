import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { ItemCategory, CategoryDefinition, BarcodeFormat, InventoryItem, AdditionalBarcode } from '../types';

/**
 * دليل تعريف المجموعات والتصنيفات المخزنية مع بادئة الكود التسلسلي
 */
export const CATEGORY_DEFINITIONS: Record<ItemCategory, CategoryDefinition> = {
  print_raw: {
    id: 'print_raw',
    name: 'خامات ومواد مطبعة',
    nameEn: 'Printing Raw Materials',
    prefix: 'RAW',
    description: 'رولات ورق، كوشيه، أوراق فواتير، أحبار، زنكات، وسلوفان',
    defaultUnit: 'باندة (500 فرخ)',
    color: 'indigo'
  },
  stationery: {
    id: 'stationery',
    name: 'قرطاسية ومكتبية ومدرسية',
    nameEn: 'Stationery & Office',
    prefix: 'STAT',
    description: 'أقلام، دفاتر، ملفات، أدوات هندسية، وحاسبات',
    defaultUnit: 'حبة',
    color: 'sky'
  },
  books: {
    id: 'books',
    name: 'كتب وروايات ومناهج',
    nameEn: 'Books & Curricula',
    prefix: 'BOOK',
    description: 'كتب أدبية، روايات، مراجع جامعية ومدرسية، وقواميس',
    defaultUnit: 'كتاب',
    color: 'emerald'
  },
  print_service: {
    id: 'print_service',
    name: 'خدمات طباعة وتصميم',
    nameEn: 'Printing Services',
    prefix: 'SRV',
    description: 'كروت، بروشورات، لوحات بانر، أختام، وتصميم جرافيك',
    defaultUnit: 'خدمة',
    color: 'amber'
  },
  copy_scan: {
    id: 'copy_scan',
    name: 'تصوير مستندات وتجليد',
    nameEn: 'Copy & Scanning',
    prefix: 'CPY',
    description: 'تصوير A4/A3، سكانر ملون، تغليف حراري، وتجليد سلك',
    defaultUnit: 'صفحة',
    color: 'purple'
  },
  shields_gifts: {
    id: 'shields_gifts',
    name: 'دروع وهدايا دعائية',
    nameEn: 'Trophies & Promotional',
    prefix: 'GFT',
    description: 'دروع كريستال، هدايا تذكارية، أوشحة، وميداليات',
    defaultUnit: 'قطعة',
    color: 'rose'
  },
  textiles: {
    id: 'textiles',
    name: 'مطبوعات قماش',
    nameEn: 'Fabric & Textile Prints',
    prefix: 'TEX',
    description: 'جاليهات، قمصان، هوديز، أوشحة قماش، مريول، كابات وأعلام',
    defaultUnit: 'حبة',
    color: 'teal'
  }
};

/**
 * حساب الرقم التدقيقي لمعيار EAN-13 الدولي
 */
export function calculateEan13Checksum(digits12: string): string {
  const clean = digits12.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(clean[i], 10);
    // Even index (1st, 3rd, 5th digit - 1-based odd) weight 1, odd index (2nd, 4th - 1-based even) weight 3
    sum += i % 2 === 0 ? n : n * 3;
  }
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return checkDigit.toString();
}

/**
 * توليد كود EAN-13 صالح ومطابق للمواصفات الدولية
 */
export function generateValidEan13(customPrefix: string = '628'): string {
  const prefix = customPrefix.replace(/\D/g, '').slice(0, 3) || '628';
  // Generate random 9 digits
  const randomPart = Math.floor(100000000 + Math.random() * 900000000).toString();
  const digits12 = (prefix + randomPart).slice(0, 12);
  const checksum = calculateEan13Checksum(digits12);
  return digits12 + checksum;
}

/**
 * توليد كود تسلسلي تلقائي للأصناف حسب التصنيف (SKU Auto-generation)
 * - يبدأ كل تصنيف بترميز مخصص (Prefix) مثل STAT, RAW, BOOK, SRV, CPY, GFT
 * - يأخذ الصنف رقماً تسلسلياً رباعياً يبدأ من 0001 فصاعداً (مثل STAT-0001)
 * - فحص صارم ومضمون لعدم تكرار الكود مع أي صنف آخر في النظام نهائياً
 */
export function generateSequentialSku(
  category: ItemCategory | string,
  existingCodes: string[],
  customCategories?: CategoryDefinition[]
): string {
  // 1. Look up prefix in customCategories first (settings.categories)
  const customDef = customCategories?.find(c => c.id === category || c.name === category);
  let def = customDef || (CATEGORY_DEFINITIONS as any)[category];
  if (!def && (category === 'مطبوعات قماش' || category === 'قماش' || category === 'ملابس' || category === 'textiles')) {
    def = CATEGORY_DEFINITIONS.textiles;
  }
  const prefix = (customDef?.prefix || def?.prefix || (typeof category === 'string' && category.length <= 8 ? category : 'ITEM')).trim().toUpperCase();

  // Normalized set of all existing codes (lowercase trimmed)
  const existingSet = new Set(
    existingCodes
      .filter(c => typeof c === 'string')
      .map(c => c.trim().toLowerCase())
  );

  // Extract all numbers for items that start with this prefix (e.g. PRI-0001, PRI0001, PRI-001)
  let maxNumber = 0;
  const regex = new RegExp(`^${prefix}[-_]?(\\d+)$`, 'i');

  existingCodes.forEach(code => {
    if (!code) return;
    const match = code.trim().match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  });

  // Start with maxNumber + 1 (at least 1 for 0001)
  let nextNumber = Math.max(1, maxNumber + 1);
  let candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

  // Guaranteed uniqueness loop: if candidate exists for any reason, keep incrementing
  while (existingSet.has(candidate.toLowerCase())) {
    nextNumber++;
    candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
  }

  return candidate;
}

/**
 * التحقق من توفر كود الصنف وعدم تكراره في النظام
 */
export function validateSkuUniqueness(
  skuToCheck: string,
  existingItems: { id: string; code?: string; name?: string; category?: ItemCategory }[],
  currentItemId?: string,
  customCategories?: CategoryDefinition[]
): {
  isUnique: boolean;
  conflictingItem?: { id: string; code?: string; name?: string };
  suggestedSku?: string;
} {
  const cleanSku = (skuToCheck || '').trim().toLowerCase();
  if (!cleanSku) {
    return { isUnique: true };
  }

  const safeItems = Array.isArray(existingItems) ? existingItems.filter(Boolean) : [];

  const conflictingItem = safeItems.find(
    item => item && item.id !== currentItemId && item.code && typeof item.code === 'string' && item.code.trim().toLowerCase() === cleanSku
  );

  if (conflictingItem) {
    // Generate next available SKU for this category or generic
    const allCodes = safeItems.map(i => i?.code || '').filter(Boolean);
    const category = (conflictingItem as any).category || 'stationery';
    const suggestedSku = generateSequentialSku(category, allCodes, customCategories);

    return {
      isUnique: false,
      conflictingItem,
      suggestedSku
    };
  }

  return { isUnique: true };
}

/**
 * توليد باركود للمنتج بنوع محدد (EAN-13, CODE-128, QR)
 */
export function generateSmartBarcode(
  category: ItemCategory,
  format: BarcodeFormat,
  itemCode?: string
): string {
  if (format === 'EAN13') {
    return generateValidEan13('628');
  }
  if (format === 'QR') {
    // QR codes can embed structured JSON or rich text
    const cleanCode = itemCode || `ITEM-${Date.now().toString().slice(-5)}`;
    return cleanCode;
  }
  // Default CODE-128 (can accept alphanumeric)
  if (itemCode) {
    return itemCode.replace(/\s+/g, '-').toUpperCase();
  }
  const prefix = CATEGORY_DEFINITIONS[category]?.prefix || 'ITM';
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

/**
 * رسم الباركود على عنصر SVG باستخدام JsBarcode
 */
export function renderBarcodeToSvg(
  svgElement: SVGSVGElement,
  text: string,
  format: 'CODE128' | 'EAN13',
  options: {
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
    margin?: number;
  } = {}
): boolean {
  try {
    const cleanText = text.trim();
    if (!cleanText) return false;

    if (format === 'EAN13') {
      let eanText = cleanText.replace(/\D/g, '');
      if (eanText.length === 12) {
        eanText = eanText + calculateEan13Checksum(eanText);
      } else if (eanText.length !== 13) {
        // Fallback to CODE128 if not 13 digits
        JsBarcode(svgElement, cleanText, {
          format: 'CODE128',
          width: options.width || 1.8,
          height: options.height || 45,
          displayValue: options.displayValue !== false,
          fontSize: options.fontSize || 12,
          margin: options.margin !== undefined ? options.margin : 5,
          textMargin: 2
        });
        return true;
      }

      JsBarcode(svgElement, eanText, {
        format: 'EAN13',
        width: options.width || 1.8,
        height: options.height || 45,
        displayValue: options.displayValue !== false,
        fontSize: options.fontSize || 12,
        margin: options.margin !== undefined ? options.margin : 5,
        textMargin: 2
      });
      return true;
    }

    // Standard CODE128
    JsBarcode(svgElement, cleanText, {
      format: 'CODE128',
      width: options.width || 1.8,
      height: options.height || 45,
      displayValue: options.displayValue !== false,
      fontSize: options.fontSize || 12,
      margin: options.margin !== undefined ? options.margin : 5,
      textMargin: 2
    });
    return true;
  } catch (err) {
    console.warn('JsBarcode render error, falling back to CODE128:', err);
    try {
      JsBarcode(svgElement, text, {
        format: 'CODE128',
        width: 1.5,
        height: 40,
        displayValue: true
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * توليد صورة QR كـ DataURL
 */
export async function generateQrDataUrl(
  text: string,
  options: {
    width?: number;
    margin?: number;
    colorDark?: string;
    colorLight?: string;
  } = {}
): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: options.width || 200,
      margin: options.margin !== undefined ? options.margin : 1,
      color: {
        dark: options.colorDark || '#000000',
        light: options.colorLight || '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (err) {
    console.error('Failed to generate QR Code:', err);
    return '';
  }
}

/**
 * قوالب مقاسات ملصقات الباركود والستيكرات الشائعة
 */
export interface LabelPreset {
  id: string;
  name: string;
  nameEn: string;
  widthMm: number;
  heightMm: number;
  isRoll: boolean; // رول حراري مستقل أو صفحة A4
  labelsPerPage?: number;
  columns?: number;
  rows?: number;
}

export const LABEL_PRESETS: LabelPreset[] = [
  {
    id: 'thermal_50x30',
    name: 'رول حراري قياسي (50mm × 30mm)',
    nameEn: 'Thermal Roll 50x30mm',
    widthMm: 50,
    heightMm: 30,
    isRoll: true
  },
  {
    id: 'thermal_40x25',
    name: 'ستيكر باركود صغير (40mm × 25mm)',
    nameEn: 'Thermal Mini 40x25mm',
    widthMm: 40,
    heightMm: 25,
    isRoll: true
  },
  {
    id: 'thermal_60x40',
    name: 'ستيكر شحن وكرتون (60mm × 40mm)',
    nameEn: 'Thermal Box 60x40mm',
    widthMm: 60,
    heightMm: 40,
    isRoll: true
  },
  {
    id: 'a4_24_labels',
    name: 'ورق A4 مقسم 24 ملصق (3 أعمدة × 8 صفوف)',
    nameEn: 'A4 Sheet 24 Labels (70x37mm)',
    widthMm: 70,
    heightMm: 37,
    isRoll: false,
    labelsPerPage: 24,
    columns: 3,
    rows: 8
  },
  {
    id: 'a4_40_labels',
    name: 'ورق A4 مقسم 40 ملصق مصغر (4 أعمدة × 10 صفوف)',
    nameEn: 'A4 Sheet 40 Labels (48x25mm)',
    widthMm: 48,
    heightMm: 25,
    isRoll: false,
    labelsPerPage: 40,
    columns: 4,
    rows: 10
  }
];

/**
 * مطابقة أي رمز باركود ممسوح أو مدخل مع بيانات الصنف:
 * يفحص الباركود الرئيسي، كود الصنف (SKU)، وقائمة الباركودات المتعددة والبديلة.
 */
export function matchItemByBarcode(item: InventoryItem, scannedCode: string): boolean {
  if (!scannedCode || !item) return false;
  const clean = scannedCode.trim().toLowerCase();

  // 1. Primary barcode match
  if (item.barcode && item.barcode.trim().toLowerCase() === clean) {
    return true;
  }

  // 2. Item SKU / Code match
  if (item.code && item.code.trim().toLowerCase() === clean) {
    return true;
  }

  // 3. Multi-barcode structured entries (e.g. carton, piece, supplier barcodes)
  if (item.barcodeEntries && item.barcodeEntries.length > 0) {
    if (item.barcodeEntries.some(b => b.barcode && b.barcode.trim().toLowerCase() === clean)) {
      return true;
    }
  }

  // 4. Simple additional barcodes list
  if (item.additionalBarcodes && item.additionalBarcodes.length > 0) {
    if (item.additionalBarcodes.some(b => b && b.trim().toLowerCase() === clean)) {
      return true;
    }
  }

  return false;
}

export interface ItemBarcodeOption {
  barcode: string;
  label: string;
  isPrimary: boolean;
  type?: BarcodeFormat;
}

/**
 * استخراج كافة الباركودات المسجلة للصنف (الرئيسي + الإضافية والبديلة) دون تكرار
 */
export function getAllItemBarcodes(item: InventoryItem): ItemBarcodeOption[] {
  if (!item) return [];
  const result: ItemBarcodeOption[] = [];
  const seen = new Set<string>();

  // 1. Primary barcode
  if (item.barcode && item.barcode.trim()) {
    const code = item.barcode.trim();
    seen.add(code.toLowerCase());
    result.push({
      barcode: code,
      label: 'الباركود الرئيسي',
      isPrimary: true,
      type: item.barcodeType
    });
  }

  // 2. Structured entries
  if (item.barcodeEntries && Array.isArray(item.barcodeEntries)) {
    for (const entry of item.barcodeEntries) {
      if (!entry || !entry.barcode) continue;
      const code = entry.barcode.trim();
      if (code && !seen.has(code.toLowerCase())) {
        seen.add(code.toLowerCase());
        result.push({
          barcode: code,
          label: entry.label || 'باركود بديل',
          isPrimary: false,
          type: entry.type
        });
      }
    }
  }

  // 3. Backward compatibility additionalBarcodes array
  if (item.additionalBarcodes && Array.isArray(item.additionalBarcodes)) {
    for (const b of item.additionalBarcodes) {
      if (!b) continue;
      const code = b.trim();
      if (code && !seen.has(code.toLowerCase())) {
        seen.add(code.toLowerCase());
        result.push({
          barcode: code,
          label: 'باركود إضافي',
          isPrimary: false
        });
      }
    }
  }

  return result;
}

