import { UnitOfMeasure, UnitCalculationType } from '../types';

export const defaultUnitsOfMeasure: UnitOfMeasure[] = [
  {
    id: 'unit-m2',
    code: 'm2',
    name: 'متر مربع (م²)',
    nameEn: 'Square Meter',
    calculationType: 'area',
    symbol: 'م²',
    isDefault: false,
    description: 'احتساب المساحة: الطول × العرض × الكمية × سعر المتر'
  },
  {
    id: 'unit-linear',
    code: 'linear_m',
    name: 'متر طولي (م.ط)',
    nameEn: 'Linear Meter',
    calculationType: 'linear',
    symbol: 'م.ط',
    isDefault: false,
    description: 'احتساب الأطوال والرولات: الطول × الكمية × السعر'
  },
  {
    id: 'unit-piece',
    code: 'piece',
    name: 'حبة / قطعة',
    nameEn: 'Piece / Unit',
    calculationType: 'unit',
    symbol: 'حبة',
    isDefault: true,
    description: 'احتساب بالعدد الفردي: الكمية × سعر الحبة'
  },
  {
    id: 'unit-box',
    code: 'box',
    name: 'كرتونة / باكت',
    nameEn: 'Box / Carton',
    calculationType: 'unit',
    symbol: 'كرتونة',
    isDefault: false,
    description: 'احتساب بالعبوة أو الكرتونة: الكمية × سعر العبوة'
  },
  {
    id: 'unit-roll',
    code: 'roll',
    name: 'رول خام',
    nameEn: 'Raw Roll',
    calculationType: 'linear',
    symbol: 'رول',
    isDefault: false,
    description: 'رولات الفليكس والبانر والورق'
  },
  {
    id: 'unit-kg',
    code: 'kg',
    name: 'كيلوغرام (كغم)',
    nameEn: 'Kilogram',
    calculationType: 'unit',
    symbol: 'كغم',
    isDefault: false,
    description: 'احتساب بالوزن: الكمية/الوزن × سعر الكيلو'
  }
];

export function calculateItemLineTotal(
  calculationType: UnitCalculationType | undefined,
  length: number,
  width: number,
  quantity: number,
  unitPrice: number
): number {
  const l = length > 0 ? length : 1;
  const w = width > 0 ? width : 1;
  const q = quantity > 0 ? quantity : 1;
  const p = unitPrice >= 0 ? unitPrice : 0;

  let total = 0;

  switch (calculationType) {
    case 'area':
      total = l * w * q * p;
      break;
    case 'linear':
      total = l * q * p;
      break;
    case 'unit':
      total = q * p;
      break;
    case 'custom':
    default:
      if (length > 1 || width > 1) {
        total = l * w * q * p;
      } else {
        total = q * p;
    }
  }

  return Number(total.toFixed(2));
}

/**
 * التحقق مما إذا كانت وحدة الصنف هي متر مربع (م² أو متر مربع أو m2 أو sqm أو فئة احتساب المساحة)
 */
export function isSquareMeterUnit(unit?: string, calculationType?: UnitCalculationType | string): boolean {
  if (calculationType === 'area') return true;
  if (!unit) return false;
  const clean = unit.trim().toLowerCase();
  return (
    clean === 'م²' ||
    clean === 'م2' ||
    clean === 'متر مربع' ||
    clean === 'متر مربع (م²)' ||
    clean === 'متر²' ||
    clean === 'متر2' ||
    clean === 'م.م' ||
    clean === 'sqm' ||
    clean === 'm2' ||
    clean === 'square meter' ||
    clean.includes('متر مربع') ||
    clean.includes('م²')
  );
}

export function getUnitCalculationLabel(calcType: UnitCalculationType | undefined): string {
  switch (calcType) {
    case 'area':
      return 'طول × عرض × كمية × سعر (متر مربع)';
    case 'linear':
      return 'طول × كمية × سعر (متر طولي)';
    case 'unit':
      return 'كمية × سعر (بالقطعة / العدد)';
    default:
      return 'احتساب تلقائي';
  }
}

export interface ProgramUnitInfo {
  unit: string;
  count: number;
  isFromInventory: boolean;
  sourceLabel?: string;
}

/**
 * اعتماد واستخراج جميع وحدات الأصناف المدخلة في البرنامج
 * يجمع الوحدات من الأصناف المدخلة مع عدد استخدامها، ووحدات الإعدادات، والوحدات القياسية
 */
export function getProgramUnitsWithCounts(
  inventory: Array<{ unit?: string }>,
  customUnits?: UnitOfMeasure[]
): ProgramUnitInfo[] {
  const inventoryCounts = new Map<string, number>();

  // 1. حساب تكرار الوحدات المدخلة فعلياً في أصناف البرنامج
  if (Array.isArray(inventory)) {
    inventory.forEach(item => {
      if (item.unit && typeof item.unit === 'string') {
        const trimmed = item.unit.trim();
        if (trimmed) {
          inventoryCounts.set(trimmed, (inventoryCounts.get(trimmed) || 0) + 1);
        }
      }
    });
  }

  const result: ProgramUnitInfo[] = [];
  const processedUnits = new Set<string>();

  // 2. أولاً: إضافة الوحدات المستخدمة في أصناف البرنامج مرتبة حسب الأكثر استخداماً
  const sortedInventoryUnits = Array.from(inventoryCounts.entries()).sort((a, b) => b[1] - a[1]);
  sortedInventoryUnits.forEach(([unit, count]) => {
    processedUnits.add(unit);
    result.push({
      unit,
      count,
      isFromInventory: true,
      sourceLabel: `مستخدمة في ${count} صنف`
    });
  });

  // 3. ثانياً: إضافة الوحدات المعرفة في إعدادات النظام
  if (customUnits && customUnits.length > 0) {
    customUnits.forEach(u => {
      const candidates = [u.symbol?.trim(), u.name?.trim()].filter(Boolean) as string[];
      candidates.forEach(cand => {
        if (cand && !processedUnits.has(cand)) {
          processedUnits.add(cand);
          result.push({
            unit: cand,
            count: 0,
            isFromInventory: false,
            sourceLabel: 'معرفة في الإعدادات'
          });
        }
      });
    });
  }

  // 4. ثالثاً: إضافة الوحدات الافتراضية والأساسية
  defaultUnitsOfMeasure.forEach(u => {
    const candidates = [u.symbol?.trim(), u.name?.trim()].filter(Boolean) as string[];
    candidates.forEach(cand => {
      if (cand && !processedUnits.has(cand)) {
        processedUnits.add(cand);
        result.push({
          unit: cand,
          count: 0,
          isFromInventory: false,
          sourceLabel: 'وحدة قياسية'
        });
      }
    });
  });

  // 5. وحدات شائعة إضافية للمطابع والمكتبات
  const standardFallbacks = [
    'حبة',
    'قطعة',
    'متر مربع (م²)',
    'م²',
    'متر طولي (م.ط)',
    'م.ط',
    'كرتونة',
    'باكت',
    'رول',
    'كيلوغرام (كغم)',
    'كغم',
    'طقم',
    'دستة',
    'ورقة',
    'صفحة',
    'خدمة',
    'لتر',
    'سم'
  ];

  standardFallbacks.forEach(cand => {
    if (!processedUnits.has(cand)) {
      processedUnits.add(cand);
      result.push({
        unit: cand,
        count: 0,
        isFromInventory: false,
        sourceLabel: 'وحدة شائعة'
      });
    }
  });

  return result;
}

/**
 * الحصول على مصفوفة نصوص الوحدات المعتمدة في البرنامج
 */
export function getAvailableUnitsOfMeasure(
  inventory: Array<{ unit?: string }>,
  customUnits?: UnitOfMeasure[]
): string[] {
  return getProgramUnitsWithCounts(inventory, customUnits).map(item => item.unit);
}
