import { Party } from '../types';

/**
 * دالة توليد الرقم التسلسلي الآلي للعملاء والموردين
 * - يصدر الرقم تلقائياً من البرنامج بنظام تسلسلي يبدأ من 0001 (مثل CUST-0001 للعملاء و SUPP-0001 للموردين)
 * - غير قابل للتعديل أو التكرار نهائياً
 */
export function generateSequentialPartyCode(
  type: 'customer' | 'supplier' | 'both',
  existingParties: Array<{ code?: string; type?: string; isSubCustomer?: boolean }>,
  isSubCustomer?: boolean
): string {
  const prefix = isSubCustomer ? 'SUB' : (type === 'supplier' ? 'SUPP' : 'CUST');

  // جمع كل الأكواد القائمة وتطبيعها
  const existingSet = new Set(
    existingParties
      .map(p => (p.code || '').trim().toLowerCase())
      .filter(Boolean)
  );

  // استخراج أعلى رقم تسلسلي مسجل لهذا الرمز
  let maxNumber = 0;
  const regex = new RegExp(`^${prefix}[-_]?(\\d+)$`, 'i');

  existingParties.forEach(p => {
    const code = (p.code || '').trim();
    if (!code) return;

    const match = code.match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  });

  // البدء من الرقم التالي (أو 1)
  let nextNumber = Math.max(1, maxNumber + 1);
  let candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

  // حلقة فحص صارمة لضمان عدم التكرار نهائياً
  while (existingSet.has(candidate.toLowerCase())) {
    nextNumber++;
    candidate = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
  }

  return candidate;
}

/**
 * البحث عن العميل أو المورد بواسطة الرقم التسلسلي أو جزء منه
 * يدعم البحث بـ: CUST-0001 أو 0001 أو 1
 */
export function findPartyByCodeOrNumber(parties: Party[], query: string): Party | undefined {
  const clean = query.trim().toLowerCase();
  if (!clean) return undefined;

  // تطابق مباشر مع الكود
  const directMatch = parties.find(p => p.code && p.code.toLowerCase() === clean);
  if (directMatch) return directMatch;

  // تطابق مع الرقم المجرد (مثلا لو كتب 1 أو 2)
  const numericOnly = clean.replace(/\D/g, '');
  if (numericOnly) {
    const num = parseInt(numericOnly, 10);
    return parties.find(p => {
      if (!p.code) return false;
      const match = p.code.match(/\d+/);
      if (match) {
        return parseInt(match[0], 10) === num;
      }
      return false;
    });
  }

  return undefined;
}

/**
 * تنسيق اسم العميل والزبون الفرعي تلقائياً وفق القاعدة النظامية:
 * "زبون رئيسي / زبون فرعي"
 * تُطبّق في أي عرض لسجل مبيعات، كشف مبيعات، فواتير، تقارير، طباعة، أو في أي مكان بالبرنامج.
 */
export function formatInvoiceCustomerDisplay(
  inv?: {
    customerName?: string;
    subCustomerName?: string;
    customCustomerText?: string;
    customerId?: string;
    subCustomerId?: string;
  } | null,
  parties?: Party[]
): string {
  if (!inv) return 'زبون نقدي';

  let mainName = (inv.customerName || '').trim();
  let subName = (inv.subCustomerName || '').trim();

  // استخراج الزبون الفرعي من النص الإضافي إذا لم يكن مدخلاً في حقل مستقل
  if (!subName && inv.customCustomerText && inv.customCustomerText.trim()) {
    const rawCustom = inv.customCustomerText.trim();
    if (rawCustom !== mainName) {
      const phoneMatch = rawCustom.match(/(05\d{8}|01\d{8,9}|\+?\d{9,12})/);
      const extractedPhone = phoneMatch ? phoneMatch[0] : '';
      const cleanCustomName = rawCustom.replace(extractedPhone, '').trim() || rawCustom;
      if (cleanCustomName && cleanCustomName !== mainName) {
        subName = cleanCustomName;
      }
    }
  }

  // في حال توفر مصفوفة العملاء: فحص ربط العميل الفرعي بالرئيسي
  if (parties && parties.length > 0) {
    if (inv.subCustomerId) {
      const subParty = parties.find(p => p.id === inv.subCustomerId);
      if (subParty) {
        subName = subParty.name.trim();
        if (subParty.parentPartyId) {
          const parent = parties.find(p => p.id === subParty.parentPartyId);
          if (parent) mainName = parent.name.trim();
        }
      }
    } else if (inv.customerId) {
      const party = parties.find(p => p.id === inv.customerId);
      if (party?.isSubCustomer && party.parentPartyId) {
        const parent = parties.find(p => p.id === party.parentPartyId);
        if (parent) {
          mainName = parent.name.trim();
          subName = party.name.trim();
        }
      }
    }
  }

  if (!mainName) {
    mainName = 'زبون نقدي';
  }

  // معالجة النصوص المحفوظة سابقاً بفاصل مثل "جمعية قوافل الخير - غزة" أو "جمعية قوافل الخير / غزة"
  if (mainName.includes(' / ')) {
    const parts = mainName.split(' / ').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      mainName = parts[0];
      if (!subName) subName = parts.slice(1).join(' / ');
    }
  } else if (mainName.includes(' - ') && !mainName.startsWith('INV-')) {
    const parts = mainName.split(' - ').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      mainName = parts[0];
      if (!subName) subName = parts.slice(1).join(' - ');
    }
  }

  if (subName && subName.trim() && subName.trim() !== mainName) {
    const cleanSub = subName.trim();
    if (mainName.endsWith(` / ${cleanSub}`) || mainName === cleanSub) {
      return mainName;
    }
    return `${mainName} / ${cleanSub}`;
  }

  return mainName;
}

/**
 * فحص ما إذا كان العميل نقدي (زبون نقدي / عام)
 * الزبون النقدي يندرج تحته العديد من الزبائن ولا يجوز أن يكون له أسعار خاصة أو آخر سعر بيع
 */
export const isCashCustomerParty = (
  partyOrIdOrName?: any,
  code?: string | null,
  name?: string | null
): boolean => {
  if (!partyOrIdOrName && !code && !name) return true;

  let pId = '';
  let pCode = (code || '').trim().toLowerCase();
  let pName = (name || '').trim().toLowerCase();

  if (typeof partyOrIdOrName === 'string') {
    const trimmed = partyOrIdOrName.trim();
    pId = trimmed.toLowerCase();
    if (!name) {
      pName = trimmed.toLowerCase();
    }
  } else if (partyOrIdOrName && typeof partyOrIdOrName === 'object') {
    pId = (partyOrIdOrName.id || '').trim().toLowerCase();
    if (partyOrIdOrName.code) pCode = partyOrIdOrName.code.trim().toLowerCase();
    if (partyOrIdOrName.name) pName = partyOrIdOrName.name.trim().toLowerCase();
  }

  // المعرفات الثابتة للزبون النقدي
  if (pId === 'pt-cust-1' || pId === '1' || pId === 'cust-0001' || pId === 'c-0001') return true;
  if (pCode === '1' || pCode === 'cust-0001' || pCode === 'c-0001' || pCode === 'pt-cust-1') return true;

  // الأسماء الشائعة للزبون النقدي
  const cashNames = [
    'زبون نقدي',
    'عميل نقدي',
    'عميل كاشير نقدي',
    'زبون كاشير',
    'زبون عام',
    'عميل عام',
    'عميل نقدي عام',
    'زبون نقدي / عام',
    'زبون نقدي عام',
    'نقدي',
    'كاش'
  ];

  if (cashNames.includes(pName)) return true;
  if (pName.startsWith('زبون نقدي') || pName.startsWith('عميل نقدي')) return true;

  return false;
};
