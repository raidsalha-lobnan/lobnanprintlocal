import * as XLSX from 'xlsx';
import { Invoice, InvoiceItem, PaymentMethod, Party, InventoryItem, TreasuryAccount, LineAttachment } from '../types';
import { isSquareMeterUnit } from '../utils/unitsOfMeasure';

export interface DraftInvoiceItem {
  id: string;
  itemName: string;
  itemCode?: string;
  unit?: string;
  length?: number;
  width?: number;
  count?: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  notes?: string;
  attachments?: LineAttachment[];
  matchedInventoryId?: string;
  matchedInventoryName?: string;
  imageThumbnail?: string; // الصورة المصغرة للبند
  hasDimensions?: boolean;
  rawCells?: (string | number)[];
}

export interface MultiItemDraftInvoice {
  id: string;
  invoiceNumber?: string;
  date: string;
  customerName: string;
  customerId?: string;
  customerPhone?: string;
  subCustomerId?: string;
  subCustomerName?: string;
  subCustomerPhone?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  paymentNotes?: string;
  items: DraftInvoiceItem[];
  totalAmount: number;
  selected: boolean;
  isApproved: boolean;
  rawRowIndices?: number[];
  sourceDailyDate?: string;
  sourceDailyRowIds?: string[];

  // Original Excel preview metadata for transparency & direct comparison
  rawHeaders?: string[];
  rawRowCells?: (string | number)[][];
  matchedPartyStatus?: 'exact' | 'sub' | 'fuzzy' | 'none';
  matchedTreasuryStatus?: 'matched' | 'default';

  // Payment Console Fields
  discount?: number;
  discountType?: 'amount' | 'percent';
  currency?: string;
  currencySymbol?: string;
  exchangeRate?: number;
  cashAmount?: string;
  cashCurrency?: string;
  cashExchangeRate?: number;
  cashTreasuryCode?: string;
  bankAmount?: string;
  bankCurrency?: string;
  bankExchangeRate?: number;
  bankTreasuryCode?: string;
}

export interface SheetInvoiceRow {
  id: string;
  date: string;
  customerName: string;
  itemName: string;
  itemCode?: string;
  length?: number;
  width?: number;
  count?: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  paymentNotes?: string;
  imageThumbnail?: string;
  attachments?: any[];
  hasDimensions?: boolean;
  isApproved: boolean;
  selected: boolean;
  rawRowIndex?: number;
  rawHeaders?: string[];
  rawCells?: (string | number)[];
}

export const DEFAULT_ONEDRIVE_SHEET_URL =
  'https://onedrive.live.com/:x:/g/personal/2C6421372CD957A5/IQA5UtDwvisnTb-S6rJ0rvplAXISiz68tZtnqdV-TrsvJGE?rtime=WwATJjzV3kg&redeem=aHR0cHM6Ly8xZHJ2Lm1zL3gvYy8yQzY0MjEzNzJDRDk1N0E1L0lRQTVVdER3dmlzblRiLVM2ckowcnZwbEFYSVNpejY4dFp0bnFkVi1UcnN2SkdFP2U9VWpqdWR0';

/**
 * دالة ذكية لتطبيع النصوص العربية لتسهيل المطابقة الدقيقة
 */
export function normalizeArabicText(text: string = ''): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل والتنوين
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[-_.,()/\\]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * دالة ذكية لمطابقة وتحديد أسماء الأعمدة في ملف الإكسل
 */
/**
 * دالة شاملة لاستخراج التاريخ بدقة من أي صيغة (رقم إكسل التسلسلي مثل 46032، نص عربي، صيغة ميلادية، ISO، كائن Date)
 */
export function parseAnyDate(val: any): string {
  if (val === null || val === undefined || val === '') {
    return new Date().toISOString().split('T')[0];
  }

  // إذا كان كائن Date
  if (val instanceof Date && !isNaN(val.getTime())) {
    // 1. إذا كان التاريخ منتصف الليل في توقيت UTC (وهو الغالب في قراءة مكتبات الإكسل)
    if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0) {
      const y = val.getUTCFullYear();
      const m = String(val.getUTCMonth() + 1).padStart(2, '0');
      const d = String(val.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // 2. غير ذلك، نقوم بالتقريب لأقرب يوم بإضافة 12 ساعة لتجنب انزياح فروق التوقيت عبر منتصف الليل
    const shifted = new Date(val.getTime() + 12 * 3600 * 1000);
    const y = shifted.getFullYear();
    const m = String(shifted.getMonth() + 1).padStart(2, '0');
    const d = String(shifted.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // تحويل الأرقام العربية إلى إنجليزية
  let str = String(val).trim()
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

  // معالجة الأرقام التسلسلية لملفات الإكسل (Excel serial number مثل 46032)
  const num = Number(str);
  if (!isNaN(num) && num >= 30000 && num <= 70000) {
    try {
      // نظام تواريخ إكسل 1900 يبدأ من 30/12/1899 بسبب خطأ السنة الكبيسة الشهير
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const targetDate = new Date(excelEpoch.getTime() + Math.round(num * 86400000));
      if (!isNaN(targetDate.getTime())) {
        const y = targetDate.getUTCFullYear();
        const m = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(targetDate.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch (e) {
      console.error('Error parsing excel serial date:', e);
    }
  }

  // ISO Format: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Date.parse fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * دالة ذكية لمطابقة وتحديد أسماء الأعمدة في ملف الإكسل
 */
export function identifyColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  // الفحص الأولي ذو الأولوية القصوى لعمود التاريخ الحقيقي الذي يحتوي صراحة على كلمة "تاريخ" أو "date"
  headers.forEach((h, idx) => {
    if (!h) return;
    const clean = String(h).trim().toLowerCase().replace(/[\s_\-\/\\]+/g, '');
    if (clean.includes('تاريخ') || clean.includes('date')) {
      if (mapping.date === undefined) mapping.date = idx;
    }
  });

  headers.forEach((h, idx) => {
    if (!h) return;
    const clean = String(h).trim().toLowerCase().replace(/[\s_\-\/\\]+/g, '');

    // Date fallback (فقط إذا لم يتم إيجاد عمود "تاريخ" صريح)
    if (mapping.date === undefined && (clean === 'dt' || clean === 'اليوم' || clean === 'يوم')) {
      mapping.date = idx;
    }
    // Customer
    else if (
      clean.includes('عميل') ||
      clean.includes('زبون') ||
      clean.includes('اسم') ||
      clean.includes('customer') ||
      clean.includes('client') ||
      clean.includes('جهة')
    ) {
      if (mapping.customer === undefined) mapping.customer = idx;
    }
    // Item Code
    else if (
      clean.includes('رقمصنف') ||
      clean.includes('كود') ||
      clean.includes('رمز') ||
      clean.includes('code') ||
      clean.includes('sku')
    ) {
      if (mapping.itemCode === undefined) mapping.itemCode = idx;
    }
    // Item Name / Description
    else if (
      clean.includes('صنف') ||
      clean.includes('بيان') ||
      clean.includes('شرح') ||
      clean.includes('مادة') ||
      clean.includes('تفصيل') ||
      clean.includes('item') ||
      clean.includes('product') ||
      clean.includes('desc')
    ) {
      if (mapping.item === undefined) mapping.item = idx;
    }
    // Length
    else if (clean.includes('طول') || clean.includes('length') || clean === 'l' || clean === 'ط') {
      if (mapping.length === undefined) mapping.length = idx;
    }
    // Width
    else if (clean.includes('عرض') || clean.includes('width') || clean === 'w' || clean === 'ع') {
      if (mapping.width === undefined) mapping.width = idx;
    }
    // Count / Repetitions
    else if (clean.includes('عدد') || clean.includes('تكرار') || clean === 'count' || clean === 'qty' || clean === 'ع') {
      if (mapping.count === undefined) mapping.count = idx;
    }
    // Quantity (مساحة / كمية إجمالية)
    else if (clean.includes('كمية') || clean.includes('مساحة') || clean.includes('مجموع') || clean.includes('quantity')) {
      if (mapping.quantity === undefined) mapping.quantity = idx;
    }
    // Price
    else if (clean.includes('سعر') || clean.includes('price') || clean.includes('مفرد') || clean.includes('unitprice')) {
      if (mapping.unitPrice === undefined) mapping.unitPrice = idx;
    }
    // Total Amount
    else if (clean.includes('إجمالي') || clean.includes('اجمالي') || clean.includes('مبلغ') || clean.includes('total') || clean.includes('صافي')) {
      if (mapping.totalAmount === undefined) mapping.totalAmount = idx;
    }
    // Notes (صندوق الدفع أو ملاحظة الدفع أو الملاحظات العامة)
    else if (
      clean.includes('ملاحظ') ||
      clean.includes('note') ||
      clean.includes('remarks') ||
      clean.includes('تعليق') ||
      clean.includes('صندوقالدفع') ||
      clean.includes('ملاحظةالدفع') ||
      clean.includes('ملاحظاتالدفع') ||
      clean.includes('ملاحظاتالتحصيل')
    ) {
      if (mapping.notes === undefined) mapping.notes = idx;
    }
    // Payment Method
    else if (clean.includes('دفع') || clean.includes('طريقة') || clean.includes('payment') || clean.includes('نوع')) {
      if (mapping.paymentMethod === undefined) mapping.paymentMethod = idx;
    }
  });

  return mapping;
}

/**
 * تحويل مصفوفة الصفوف الخام (2D Array) إلى عناصر مسودات فواتير مع حفظ البيانات الأصلية
 */
export function parseRawTableToDraftRows(rawMatrix: any[][]): SheetInvoiceRow[] {
  if (!Array.isArray(rawMatrix) || rawMatrix.length < 2) return [];

  // 1. Locate header row (first row with at least 2 non-empty cells)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
    const row = rawMatrix[i];
    if (Array.isArray(row) && row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '').length >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = (rawMatrix[headerRowIndex] || []).map(cell => String(cell || '').trim());
  const colMap = identifyColumns(headers);

  const draftRows: SheetInvoiceRow[] = [];

  for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row) || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) {
      continue;
    }

    // استخراج التاريخ بدقة باستخدام دالة المعالجة الشاملة لجميع صيغ الإكسل
    const rawDateCell = colMap.date !== undefined ? row[colMap.date] : undefined;
    const parsedDate = parseAnyDate(rawDateCell);
    const customerName = (colMap.customer !== undefined ? String(row[colMap.customer] || '') : '').trim() || 'عميل كاشير نقدي';
    
    // عند الاستيراد الملاحظات الموجودة في صندوق الدفع هي ملاحظة الدفع في الجدول المستورد وتكتب فقط هذه الملاحظة لا شيء أخر
    // وحال كانت ملاحظة الدفع في الإكسل لم يدفع لا تكتب في الملاحظات وتضل فارغة
    const rawNotesCol = (colMap.notes !== undefined ? String(row[colMap.notes] || '') : '').trim();
    const itemNotes = rawNotesCol === 'لم يدفع' ? '' : rawNotesCol;

    const itemName = ''; // ترك اسم الصنف فارغاً دائماً عند الاستيراد ليتم تحديده يدويّاً
    const itemCode = ''; // ترك كود الصنف فارغاً دائماً عند الاستيراد

    const parseNum = (val: any, fallback = 0): number => {
      if (typeof val === 'number') return isNaN(val) ? fallback : val;
      if (!val) return fallback;
      const clean = String(val).replace(/[^0-9.\-]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? fallback : num;
    };

    const length = colMap.length !== undefined ? parseNum(row[colMap.length], 0) : 0;
    const width = colMap.width !== undefined ? parseNum(row[colMap.width], 0) : 0;
    const count = colMap.count !== undefined ? parseNum(row[colMap.count], 1) : 1;

    let quantity = colMap.quantity !== undefined ? parseNum(row[colMap.quantity], 0) : 0;
    if (quantity <= 0) {
      if (length > 0 && width > 0) {
        quantity = Number((length * width * (count || 1)).toFixed(3));
      } else {
        quantity = count > 0 ? count : 1;
      }
    }

    let unitPrice = colMap.unitPrice !== undefined ? parseNum(row[colMap.unitPrice], 0) : 0;
    let totalAmount = colMap.totalAmount !== undefined ? parseNum(row[colMap.totalAmount], 0) : 0;

    if (totalAmount <= 0 && unitPrice > 0 && quantity > 0) {
      totalAmount = Number((unitPrice * quantity).toFixed(2));
    } else if (unitPrice <= 0 && totalAmount > 0 && quantity > 0) {
      unitPrice = Number((totalAmount / quantity).toFixed(2));
    }

    const rawPayment = (colMap.paymentMethod !== undefined ? String(row[colMap.paymentMethod] || '') : '').trim();
    let paymentMethod: PaymentMethod = 'cash';
    if (rawPayment.includes('آجل') || rawPayment.includes('اجل') || rawPayment.includes('ذمم') || rawPayment.toLowerCase().includes('credit')) {
      paymentMethod = 'credit';
    } else if (rawPayment.includes('بنك') || rawPayment.includes('تحويل') || rawPayment.includes('شيك') || rawPayment.toLowerCase().includes('bank')) {
      paymentMethod = 'bank_transfer';
    }

    draftRows.push({
      id: `draft-${Date.now()}-${r}-${Math.random().toString(36).slice(2, 6)}`,
      date: parsedDate,
      customerName,
      itemName,
      itemCode,
      length: length > 0 ? length : undefined,
      width: width > 0 ? width : undefined,
      count: count > 0 ? count : 1,
      quantity: quantity > 0 ? quantity : 1,
      unitPrice: unitPrice >= 0 ? unitPrice : 0,
      totalAmount: totalAmount >= 0 ? totalAmount : Number((unitPrice * quantity).toFixed(2)),
      paymentMethod,
      notes: itemNotes || undefined,
      isApproved: false,
      selected: true,
      rawRowIndex: r,
      rawHeaders: headers,
      rawCells: row.map(c => (c === null || c === undefined ? '' : String(c).trim()))
    });
  }

  return draftRows;
}

/**
 * قراءة ملف إكسل من Buffer أو ArrayBuffer
 */
export function parseExcelBuffer(buffer: ArrayBuffer | Uint8Array): SheetInvoiceRow[] {
  try {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    
    // Check if buffer is actually an HTML web page instead of binary excel
    const sample = new TextDecoder('utf-8', { fatal: false }).decode(uint8.subarray(0, 400)).toLowerCase();
    if (sample.includes('<!doctype html') || sample.includes('<html') || sample.includes('login.live.com') || sample.includes('sign in to your account')) {
      throw new Error('الرابط المعطى محمي ويتطلب تسجيل دخول حساب مايكروسوفت (تم إرجاع صفحة تسجيل الدخول بدلاً من الملف المباشر). يرجى تنزيل الملف ورفعه عبر زر [رفع ملف Excel] أو نسخ ولصق الجدول.');
    }

    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const worksheet = workbook.Sheets[firstSheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    return parseRawTableToDraftRows(rawData);
  } catch (err: any) {
    if (err?.message && (err.message.includes('Invalid HTML') || err.message.includes('could not find <table>'))) {
      throw new Error('الرابط المستلم ليس ملف إكسل مباشر أو محمي بكلمة مرور. يرجى استخدام زر [رفع ملف Excel] أو نسخ محتوى الجدول ولصقه.');
    }
    throw err;
  }
}

/**
 * قراءة نص منسوخ من الإكسل (Clipboard TSV / CSV)
 */
export function parseClipboardText(text: string): SheetInvoiceRow[] {
  const clean = text.trim();
  if (!clean) return [];

  const rows = clean.split(/\r?\n/).map(line => {
    if (line.includes('\t')) {
      return line.split('\t');
    }
    // Comma separated with quotes handling
    const parts: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    parts.push(cur.trim());
    return parts;
  });

  return parseRawTableToDraftRows(rows);
}

/**
 * نظام المطابقة الذكي: مطابقة اسم العميل، رقم/اسم الصنف، وطريقة الدفع/البنك مع قاعدة بيانات البرنامج
 */
export function autoMatchDraftEntities(
  draft: MultiItemDraftInvoice,
  parties: Party[],
  inventory: InventoryItem[],
  treasuries: TreasuryAccount[]
): MultiItemDraftInvoice {
  const updated: MultiItemDraftInvoice = { ...draft };
  const rawCustTrim = (draft.customerName || '').trim();
  const rawCustNorm = normalizeArabicText(rawCustTrim);
  
  // Check if generic "زبون" / "نقدي" / "عميل" / "كاشير" -> auto match to cash customer
  const isGenericCash = ['زبون', 'زبون عام', 'نقدي', 'عميل', 'كاشير', 'نقدا', 'زبون نقدي', 'عميل نقدي', 'زبون كاشير', 'كاش', 'مشتري'].includes(rawCustNorm);

  if (isGenericCash) {
    const defaultCashCust = parties.find(p => p.code === 'CUST-0001' || p.name.includes('نقدي') || p.name.includes('كاشير')) || {
      id: 'pt-cust-1',
      name: 'زبون نقدي'
    };
    updated.customerId = defaultCashCust.id;
    updated.customerName = defaultCashCust.name || 'زبون نقدي';
    updated.subCustomerName = '';
    updated.matchedPartyStatus = 'exact';
  } else {
    // Normal party lookup
    let matchedCustomer: Party | undefined;
    let matchedSubCustomer: Party | undefined;

    // Exact & normalized check on all parties
    for (const p of parties) {
      const pNorm = normalizeArabicText(p.name);
      if (pNorm === rawCustNorm || p.code?.toLowerCase() === rawCustTrim.toLowerCase()) {
        if (p.isSubCustomer) {
          matchedSubCustomer = p;
          if (p.parentPartyId) {
            matchedCustomer = parties.find(parent => parent.id === p.parentPartyId);
          }
        } else {
          matchedCustomer = p;
        }
        break;
      }
    }

    // If not exact match, try token substring matching
    if (!matchedCustomer && !matchedSubCustomer && rawCustNorm.length >= 3) {
      for (const p of parties) {
        const pNorm = normalizeArabicText(p.name);
        if (pNorm.includes(rawCustNorm) || rawCustNorm.includes(pNorm)) {
          if (p.isSubCustomer) {
            matchedSubCustomer = p;
            if (p.parentPartyId) {
              matchedCustomer = parties.find(parent => parent.id === p.parentPartyId);
            }
          } else {
            matchedCustomer = p;
          }
          break;
        }
      }
    }

    if (matchedCustomer) {
      updated.customerId = matchedCustomer.id;
      updated.customerName = matchedCustomer.name;
      updated.customerPhone = matchedCustomer.phone || updated.customerPhone;
      updated.matchedPartyStatus = matchedSubCustomer ? 'sub' : 'exact';
      // Any non-cash customer: make sub-customer empty unless specifically matched with a real registered sub-customer
      updated.subCustomerName = matchedSubCustomer ? matchedSubCustomer.name : '';
    } else {
      // If customer is not found / unmatched:
      // USER REQUIREMENT: في المسودة كذلك عند الاستيراد ان لم يتطابق الاسم فقط اكتبه زبون نقدي واجعل الفرعي فارغ
      const defaultCashCust = parties.find(p => p.code === 'CUST-0001' || p.name.includes('نقدي') || p.name.includes('كاشير')) || {
        id: 'pt-cust-1',
        name: 'زبون نقدي'
      };
      updated.customerId = defaultCashCust.id;
      updated.customerName = defaultCashCust.name || 'زبون نقدي';
      updated.subCustomerName = '';
      updated.matchedPartyStatus = 'exact';
    }

    if (matchedSubCustomer) {
      updated.subCustomerId = matchedSubCustomer.id;
      updated.subCustomerName = matchedSubCustomer.name;
      updated.subCustomerPhone = matchedSubCustomer.phone || updated.subCustomerPhone;
    }
  }

  // 2. مطابقة الأصناف المخزنية والتقسيم الذكي للبنود المتعددة
  const expandedItems: DraftInvoiceItem[] = [];

  (updated.items || []).forEach(item => {
    const notesText = (item.notes || '').trim();
    
    // تقسيم ذكي إذا كانت الخانة تحتوي على أسطر متعددة من الإكسل
    const subLines = notesText
      .split(/[\r\n]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (subLines.length > 1) {
      // تفكيك الأسطر المتعددة الواردة بنفس الخلية إلى بنود مستقلة بالفاتورة
      subLines.forEach((subLine, subIdx) => {
        const itemNorm = normalizeArabicText(subLine);
        const matchedInv = inventory.find(i => {
          const iNorm = normalizeArabicText(i.name);
          return itemNorm && (iNorm === itemNorm || iNorm.includes(itemNorm) || itemNorm.includes(iNorm));
        });

        const isDim = matchedInv ? isSquareMeterUnit(matchedInv.unit, matchedInv.unitCalculationType) : false;
        const qVal = item.quantity > 0 ? item.quantity : 1;

        expandedItems.push({
          ...item,
          id: `${item.id}-sub-${subIdx}`,
          itemName: matchedInv ? matchedInv.name : '',
          itemCode: matchedInv ? matchedInv.code : '',
          matchedInventoryId: matchedInv?.id,
          matchedInventoryName: matchedInv?.name,
          unit: matchedInv?.unit,
          length: isDim ? (item.length || 1) : 1,
          width: isDim ? (item.width || 1) : 1,
          count: isDim ? (item.count || 1) : qVal,
          quantity: qVal,
          notes: subLine,
          unitPrice: matchedInv ? matchedInv.sellingPrice : (subIdx === 0 ? item.unitPrice : 0),
          totalAmount: matchedInv ? Number((matchedInv.sellingPrice * qVal).toFixed(2)) : (subIdx === 0 ? item.totalAmount : 0)
        });
      });
    } else {
      // بند واحد
      const itemNorm = normalizeArabicText(notesText);
      const matchedInv = inventory.find(i => {
        const iNorm = normalizeArabicText(i.name);
        return itemNorm && (iNorm === itemNorm || iNorm.includes(itemNorm) || itemNorm.includes(iNorm));
      });

      const qVal = item.quantity > 0 ? item.quantity : 1;
      const isDim = matchedInv
        ? isSquareMeterUnit(matchedInv.unit, matchedInv.unitCalculationType)
        : (item.unit ? isSquareMeterUnit(item.unit) : false);

      if (matchedInv) {
        expandedItems.push({
          ...item,
          itemName: matchedInv.name,
          itemCode: matchedInv.code,
          matchedInventoryId: matchedInv.id,
          matchedInventoryName: matchedInv.name,
          unit: matchedInv.unit,
          length: isDim ? (item.length || 1) : 1,
          width: isDim ? (item.width || 1) : 1,
          count: isDim ? (item.count || 1) : qVal,
          quantity: qVal,
          notes: notesText,
          unitPrice: item.unitPrice > 0 ? item.unitPrice : matchedInv.sellingPrice || item.unitPrice,
          totalAmount:
            item.totalAmount > 0
              ? item.totalAmount
              : Number((qVal * (matchedInv.sellingPrice || item.unitPrice)).toFixed(2))
        });
      } else {
        expandedItems.push({
          ...item,
          itemName: item.itemName || '',
          itemCode: item.itemCode || '',
          length: isDim ? (item.length || 1) : 1,
          width: isDim ? (item.width || 1) : 1,
          count: isDim ? (item.count || 1) : qVal,
          quantity: qVal,
          notes: notesText
        });
      }
    }
  });

  updated.items = expandedItems;

  // 3. مطابقة البنك وطريقة الدفع (Payment & Bank Matching)
  const allNotes = `${draft.notes || ''} ${draft.paymentMethod || ''} ${draft.customerName || ''}`.toLowerCase();
  
  if (
    allNotes.includes('بنك') ||
    allNotes.includes('تحويل') ||
    allNotes.includes('شيك') ||
    allNotes.includes('فيزا') ||
    allNotes.includes('فلسطين') ||
    allNotes.includes('اسلامي') ||
    draft.paymentMethod === 'bank_transfer'
  ) {
    updated.paymentMethod = 'bank_transfer';
    // Match specific bank treasury
    const bankTreasury =
      treasuries.find(t => (t.type === 'bank_account' || t.type === 'bank_app' || t.type === 'pos_terminal' || t.type === 'digital_wallet') && (allNotes.includes(t.name.toLowerCase()) || allNotes.includes(t.accountCode))) ||
      treasuries.find(t => t.type === 'bank_account' || t.type === 'bank_app' || t.type === 'pos_terminal' || t.type === 'digital_wallet');

    if (bankTreasury) {
      updated.bankTreasuryCode = bankTreasury.accountCode || bankTreasury.id;
      updated.matchedTreasuryStatus = 'matched';
    }
  } else if (allNotes.includes('آجل') || allNotes.includes('اجل') || allNotes.includes('ذمم') || draft.paymentMethod === 'credit') {
    updated.paymentMethod = 'credit';
  } else {
    updated.paymentMethod = 'cash';
    const cashTreasury = treasuries.find(t => t.type === 'cash_box' || t.accountCode === '1101');
    if (cashTreasury) {
      updated.cashTreasuryCode = cashTreasury.accountCode || cashTreasury.id;
    }
  }

  return updated;
}

/**
 * تحويل صفوف الإكسل الفردية إلى فواتير متعددة البنود مع خيار التجميع ومطابقة الكيانات
 */
export function convertSingleRowsToMultiDrafts(
  rows: SheetInvoiceRow[],
  groupByCustomer = false,
  parties: Party[] = [],
  inventory: InventoryItem[] = [],
  treasuries: TreasuryAccount[] = []
): MultiItemDraftInvoice[] {
  if (!rows || rows.length === 0) return [];

  let results: MultiItemDraftInvoice[] = [];

  if (!groupByCustomer) {
    results = rows.map((r, idx) => ({
      id: r.id || `mdraft-${Date.now()}-${idx}`,
      date: r.date,
      customerName: r.customerName,
      paymentMethod: r.paymentMethod,
      notes: r.notes,
      totalAmount: r.totalAmount,
      selected: r.selected !== false,
      isApproved: false,
      rawRowIndices: r.rawRowIndex !== undefined ? [r.rawRowIndex] : [idx],
      rawHeaders: r.rawHeaders,
      rawRowCells: r.rawCells ? [r.rawCells] : undefined,
      items: [
        {
          id: `item-${r.id || idx}`,
          itemName: r.itemName,
          itemCode: r.itemCode,
          length: r.length,
          width: r.width,
          count: r.count,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          totalAmount: r.totalAmount,
          notes: r.notes,
          rawCells: r.rawCells
        }
      ]
    }));
  } else {
    // Group by customerName + date + paymentMethod
    const groups = new Map<string, MultiItemDraftInvoice>();

    rows.forEach((r, idx) => {
      const rowDate = parseAnyDate(r.date);
      const key = `${(r.customerName || '').trim().toLowerCase()}_${rowDate}_${r.paymentMethod}`;
      const item: DraftInvoiceItem = {
        id: `item-${r.id || idx}`,
        itemName: r.itemName,
        itemCode: r.itemCode,
        length: r.length,
        width: r.width,
        count: r.count,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        totalAmount: r.totalAmount,
        notes: r.notes,
        rawCells: r.rawCells
      };

      if (!groups.has(key)) {
        groups.set(key, {
          id: `mdraft-group-${Date.now()}-${idx}`,
          date: rowDate,
          customerName: r.customerName,
          paymentMethod: r.paymentMethod,
          notes: r.notes,
          totalAmount: r.totalAmount,
          selected: true,
          isApproved: false,
          rawRowIndices: r.rawRowIndex !== undefined ? [r.rawRowIndex] : [idx],
          rawHeaders: r.rawHeaders,
          rawRowCells: r.rawCells ? [r.rawCells] : [],
          items: [item]
        });
      } else {
        const existing = groups.get(key)!;
        existing.items.push(item);
        existing.totalAmount = Number((existing.totalAmount + r.totalAmount).toFixed(2));
        if (r.rawRowIndex !== undefined) {
          existing.rawRowIndices = existing.rawRowIndices || [];
          existing.rawRowIndices.push(r.rawRowIndex);
        }
        if (r.rawCells && existing.rawRowCells) {
          existing.rawRowCells.push(r.rawCells);
        }
        if (r.notes && !existing.notes?.includes(r.notes)) {
          existing.notes = existing.notes ? `${existing.notes} | ${r.notes}` : r.notes;
        }
      }
    });

    results = Array.from(groups.values());
  }

  // Apply automatic matching if context entities provided
  if (parties.length > 0 || inventory.length > 0 || treasuries.length > 0) {
    results = results.map(d => autoMatchDraftEntities(d, parties, inventory, treasuries));
  }

  return results;
}

/**
 * تحويل مسودة فاتورة مفردة إلى كائن Invoice رسمي جاهز للاعتماد
 */
export function convertDraftRowToInvoice(
  draft: SheetInvoiceRow,
  nextInvoiceNumber: string,
  parties: { id: string; name: string; phone?: string }[],
  inventory: { id: string; name: string; code: string; sellingPrice: number }[],
  currentUserId?: string,
  currentUserName?: string
): Invoice {
  // Try matching customer with existing parties
  const custName = (draft.customerName || '').trim().toLowerCase();
  const itmName = (draft.itemName || '').trim().toLowerCase();
  const matchedParty = parties.find(
    p => (p.name || '').trim().toLowerCase() === custName
  );

  // Try matching item with inventory
  const matchedItem = inventory.find(
    i => (draft.itemCode && i.code?.toLowerCase() === draft.itemCode.toLowerCase()) ||
         (i.name || '').trim().toLowerCase() === itmName ||
         (i.code || '').trim().toLowerCase() === itmName
  );

  const itemQty = draft.quantity > 0 ? draft.quantity : 1;
  const itemPrice = draft.unitPrice >= 0 ? draft.unitPrice : 0;
  const itemTotal = draft.totalAmount >= 0 ? draft.totalAmount : Number((itemQty * itemPrice).toFixed(2));

  const invoiceItem: InvoiceItem = {
    itemId: matchedItem?.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    itemCode: matchedItem?.code || draft.itemCode || 'CUSTOM',
    itemName: draft.itemName,
    quantity: itemQty,
    unitPrice: itemPrice,
    discount: 0,
    tax: 0,
    taxRate: 0,
    total: itemTotal,
    length: draft.length,
    width: draft.width,
    count: draft.count,
    notes: draft.notes
  };

  const isCredit = draft.paymentMethod === 'credit';
  const paidAmount = isCredit ? 0 : itemTotal;
  const remainingAmount = isCredit ? itemTotal : 0;

  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    invoiceNumber: nextInvoiceNumber,
    date: draft.date || new Date().toISOString().split('T')[0],
    customerId: matchedParty?.id || (draft.customerName !== 'عميل كاشير نقدي' ? `cust-${Date.now()}` : undefined),
    customerName: draft.customerName || 'عميل كاشير نقدي',
    customerPhone: matchedParty?.phone,
    type: 'pos',
    items: [invoiceItem],
    subtotal: itemTotal,
    discountTotal: 0,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: itemTotal,
    paidAmount,
    remainingAmount,
    paymentMethod: draft.paymentMethod || 'cash',
    notes: draft.notes,
    status: isCredit ? 'unpaid' : 'paid',
    paymentStatus: isCredit ? 'unpaid' : draft.paymentMethod === 'bank_transfer' ? 'paid_bank' : 'paid_cash',
    workflowStatus: 'new',
    userId: currentUserId,
    userName: currentUserName || 'مدير النظام'
  };
}

/**
 * تحويل مسودة فاتورة متعددة البنود إلى فاتورة رسمية معتمدة
 */
export function convertMultiDraftToInvoice(
  draft: MultiItemDraftInvoice,
  nextInvoiceNumber: string,
  parties: { id: string; name: string; phone?: string }[],
  inventory: { id: string; name: string; code: string; sellingPrice: number }[],
  currentUserId?: string,
  currentUserName?: string
): Invoice {
  const custName = (draft.customerName || '').trim().toLowerCase();
  const matchedParty = parties.find(
    p => (p.name || '').trim().toLowerCase() === custName
  );

  const invoiceItems: InvoiceItem[] = draft.items.map((it, idx) => {
    const curItmName = (it.itemName || '').trim().toLowerCase();
    const matchedItem = inventory.find(
      i => (it.itemCode && i.code?.toLowerCase() === it.itemCode.toLowerCase()) ||
           (i.name || '').trim().toLowerCase() === curItmName ||
           (i.code || '').trim().toLowerCase() === curItmName
    );

    const itemQty = it.quantity > 0 ? it.quantity : 1;
    const itemPrice = it.unitPrice >= 0 ? it.unitPrice : 0;
    const itemTotal = it.totalAmount >= 0 ? it.totalAmount : Number((itemQty * itemPrice).toFixed(2));

    return {
      itemId: matchedItem?.id || `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      itemCode: matchedItem?.code || it.itemCode || 'CUSTOM',
      itemName: it.itemName,
      quantity: itemQty,
      unitPrice: itemPrice,
      discount: 0,
      tax: 0,
      taxRate: 0,
      total: itemTotal,
      length: it.length,
      width: it.width,
      count: it.count,
      notes: it.notes,
      imageThumbnail: it.imageThumbnail || ''
    };
  });

  const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
  
  // Discount Calculation
  let discountVal = 0;
  if (draft.discount && draft.discount > 0) {
    if (draft.discountType === 'percent') {
      discountVal = Number(((subtotal * draft.discount) / 100).toFixed(2));
    } else {
      discountVal = Number(Math.min(subtotal, draft.discount).toFixed(2));
    }
  }

  const netTotal = Math.max(0, Number((subtotal - discountVal).toFixed(2)));

  // Cash & Bank Payments in Base Currency (ILS)
  const cRate = draft.cashExchangeRate && draft.cashExchangeRate > 0 ? draft.cashExchangeRate : 1.0;
  const bRate = draft.bankExchangeRate && draft.bankExchangeRate > 0 ? draft.bankExchangeRate : 1.0;
  const rawCashNum = parseFloat(draft.cashAmount || '') || 0;
  const rawBankNum = parseFloat(draft.bankAmount || '') || 0;
  
  let cashPaidBase = Number((rawCashNum * cRate).toFixed(2));
  let bankPaidBase = Number((rawBankNum * bRate).toFixed(2));

  // Default if user didn't enter specific payment amounts
  if (cashPaidBase === 0 && bankPaidBase === 0) {
    if (draft.paymentMethod === 'cash') {
      cashPaidBase = netTotal;
    } else if (draft.paymentMethod === 'bank_transfer') {
      bankPaidBase = netTotal;
    }
  }

  const totalPaid = Number((cashPaidBase + bankPaidBase).toFixed(2));
  const remainingAmount = Math.max(0, Number((netTotal - totalPaid).toFixed(2)));
  const isFullyPaid = remainingAmount <= 0.001;
  const isCredit = draft.paymentMethod === 'credit' || (!isFullyPaid && totalPaid === 0);

  let paymentMethod: PaymentMethod = draft.paymentMethod || 'cash';
  if (cashPaidBase > 0 && bankPaidBase > 0) {
    paymentMethod = 'cash';
  } else if (bankPaidBase > 0 && cashPaidBase === 0) {
    paymentMethod = 'bank_transfer';
  } else if (isCredit && totalPaid === 0) {
    paymentMethod = 'credit';
  }

  let paymentStatus: Invoice['paymentStatus'] = 'paid_cash';
  if (isFullyPaid) {
    paymentStatus = bankPaidBase > 0 && cashPaidBase === 0 ? 'paid_bank' : 'paid_cash';
  } else if (totalPaid > 0) {
    paymentStatus = bankPaidBase > 0 && cashPaidBase === 0 ? 'partially_paid_bank' : 'partially_paid_cash';
  } else {
    paymentStatus = 'unpaid';
  }

  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    invoiceNumber: nextInvoiceNumber,
    date: draft.date || new Date().toISOString().split('T')[0],
    customerId: matchedParty?.id || (draft.customerName !== 'عميل كاشير نقدي' ? `cust-${Date.now()}` : undefined),
    customerName: draft.customerName || 'عميل كاشير نقدي',
    customerPhone: matchedParty?.phone || draft.customerPhone,
    subCustomerId: draft.subCustomerId,
    subCustomerName: draft.subCustomerName,
    subCustomerPhone: draft.subCustomerPhone,
    type: 'pos',
    items: invoiceItems,
    subtotal,
    discountTotal: discountVal,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: netTotal,
    paidAmount: totalPaid,
    remainingAmount,
    cashPaidAmount: cashPaidBase,
    bankPaidAmount: bankPaidBase,
    cashTreasuryCode: draft.cashTreasuryCode,
    bankTreasuryCode: draft.bankTreasuryCode,
    currency: draft.currency || 'ILS',
    currencySymbol: draft.currencySymbol || '₪',
    exchangeRate: draft.exchangeRate || 1.0,
    paymentMethod,
    notes: draft.notes,
    status: isFullyPaid ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid',
    paymentStatus,
    workflowStatus: 'new',
    userId: currentUserId,
    userName: currentUserName || 'مدير النظام'
  };
}
