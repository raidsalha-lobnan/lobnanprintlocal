import { DailyEntryRow, DailyEntrySheet, Party, InventoryItem, Treasury, PaymentMethod } from '../types';
import { DraftInvoiceItem, MultiItemDraftInvoice, autoMatchDraftEntities } from './liveSheetService';
import { db, doc, setDoc } from '../firebase';

export const DAILY_ENTRY_STORAGE_KEY = 'accounting_daily_entry_sheets_v1';

/**
 * إنشاء سطر جديد فارغ لكشف الإدخال اليومي
 */
export function createEmptyDailyEntryRow(
  serialNumber: number,
  defaultTreasuryId?: string,
  defaultTreasuryName?: string,
  customerName: string = '',
  customerId?: string,
  subCustomerName: string = '',
  subCustomerId?: string,
  parentRowId?: string,
  isAdditionalItem: boolean = false,
  entryDate?: string
): DailyEntryRow {
  const todayDate = entryDate || new Date().toISOString().split('T')[0];
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serialNumber,
    entryDate: todayDate,
    customerName,
    customerId,
    subCustomerName,
    subCustomerId,
    itemName: '',
    notes: '',
    requiredAmount: 0,
    paidAmount: 0,
    paymentNotes: '',
    treasuryId: defaultTreasuryId || '',
    treasuryName: defaultTreasuryName || '',
    parentRowId,
    isAdditionalItem,
    isApproved: false
  };
}

/**
 * تحويل أسطر كشف الإدخال اليومي إلى مسودات فواتير متكاملة
 * وترحيلها لشاشة مسودات فواتير Excel و OneDrive
 * مع تجميع بنود الزبون الواحد التي تمت إضافتها بزر (+) في فاتورة واحدة
 */
export function convertDailyEntryRowsToDrafts(
  date: string,
  rows: DailyEntryRow[],
  parties: Party[],
  inventory: InventoryItem[],
  treasuries: Treasury[]
): MultiItemDraftInvoice[] {
  // تصفية الأسطر الصالحة (التي تحتوي على اسم زبون أو صنف أو مبلغ مطلوب أو مدفوع)
  const validRows = rows.filter(r =>
    (r.customerName && r.customerName.trim().length > 0) ||
    (r.itemName && r.itemName.trim().length > 0) ||
    Number(r.requiredAmount) > 0 ||
    Number(r.paidAmount) > 0
  );

  if (validRows.length === 0) return [];

  // تجميع الأسطر حسب الرقم المتسلسل (بحيث تكون كل الأصناف لنفس الزبون في نفس الإدخال بفاتورة واحدة)
  const groups: { serial: number; rows: DailyEntryRow[] }[] = [];
  validRows.forEach(r => {
    const existing = groups.find(g => g.serial === r.serialNumber);
    if (existing) {
      existing.rows.push(r);
    } else {
      groups.push({ serial: r.serialNumber, rows: [r] });
    }
  });

  return groups.map((group, groupIdx) => {
    const groupRows = group.rows;
    const firstRow = groupRows[0];
    const lastRow = groupRows[groupRows.length - 1];

    const draftId = `daily-draft-${date}-${group.serial || groupIdx + 1}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    // آلية الدفع والصندوق تعتمد من آخر بند لنفس الزبون
    const effectiveTreasuryId = lastRow.treasuryId || firstRow.treasuryId;
    const effectiveTreasuryName = lastRow.treasuryName || firstRow.treasuryName;

    const matchedTreasury = treasuries.find(t => 
      (effectiveTreasuryId && t.id === effectiveTreasuryId) || 
      (effectiveTreasuryName && (t.name === effectiveTreasuryName || t.name.includes(effectiveTreasuryName)))
    );

    const isBank = matchedTreasury?.type === 'bank_account' || 
                   matchedTreasury?.type === 'bank_app' || 
                   matchedTreasury?.name?.includes('بنك') || 
                   matchedTreasury?.name?.includes('حوالة') ||
                   matchedTreasury?.name?.includes('شيك');

    // تجميع المبالغ المطلوبة لكافة بنود نفس الزبون
    const totalRequired = groupRows.reduce((sum, r) => sum + Number(r.requiredAmount || 0), 0);
    // المدفوع يعتمد لآخر بند في الفاتورة (أو مجموع المدفوع)
    const paidAmt = Number(lastRow.paidAmount || 0);

    let paymentMethod: PaymentMethod = 'credit';
    if (paidAmt >= totalRequired && totalRequired > 0) {
      paymentMethod = isBank ? 'bank_transfer' : 'cash';
    } else if (paidAmt > 0) {
      paymentMethod = isBank ? 'bank_transfer' : 'cash';
    }

    // بناء قائمة بنود الفاتورة
    const draftItems: DraftInvoiceItem[] = groupRows.map((r, itIdx) => {
      const itReq = Number(r.requiredAmount || 0);
      return {
        id: `it-${draftId}-${itIdx + 1}`,
        itemName: r.itemName?.trim() || `صنف مبيعات ${itIdx + 1}`,
        quantity: 1,
        unitPrice: itReq,
        totalAmount: itReq,
        notes: r.notes?.trim() || '',
        count: 1
      };
    });

    const isAllApproved = groupRows.every(r => r.isApproved);
    const itemNotes = groupRows.map(r => r.notes?.trim()).filter(Boolean).join(' | ');
    const payNotes = groupRows.map(r => r.paymentNotes?.trim()).filter(Boolean).join(' | ');

    const draft: MultiItemDraftInvoice = {
      id: draftId,
      date: date,
      customerName: firstRow.customerName?.trim() || 'زبون نقدي',
      customerId: firstRow.customerId,
      subCustomerName: firstRow.subCustomerName?.trim() || undefined,
      subCustomerId: firstRow.subCustomerId,
      paymentMethod: paymentMethod,
      notes: itemNotes || undefined,
      paymentNotes: payNotes || undefined,
      items: draftItems,
      totalAmount: totalRequired,
      selected: true,
      isApproved: isAllApproved,

      // ربط المسودة بأسطر كشف الإدخال اليومي لتعليمها بلون مميز فور الاعتماد
      sourceDailyDate: date,
      sourceDailyRowIds: groupRows.map(r => r.id),
      
      // تفاصيل السداد (معتمدة من آخر بند)
      cashAmount: (!isBank && paidAmt > 0) ? String(paidAmt) : undefined,
      bankAmount: (isBank && paidAmt > 0) ? String(paidAmt) : undefined,
      cashTreasuryCode: (!isBank && matchedTreasury) ? (matchedTreasury.accountCode || matchedTreasury.id) : undefined,
      bankTreasuryCode: (isBank && matchedTreasury) ? (matchedTreasury.accountCode || matchedTreasury.id) : undefined,
      
      // بيانات للمعاينة والشفافية
      rawHeaders: ['م', 'الزبون الرئيسي', 'الزبون الفرعي', 'الصنف', 'ملاحظات', 'المطلوب', 'المدفوع', 'الصندوق'],
      rawRowCells: groupRows.map(r => [
        r.serialNumber,
        r.customerName || '',
        r.subCustomerName || '',
        r.itemName || '',
        r.notes || '',
        Number(r.requiredAmount || 0),
        Number(r.paidAmount || 0),
        r.treasuryName || matchedTreasury?.name || ''
      ])
    };

    // مطابقة ذكية مع قواعد البيانات المخزنة
    return autoMatchDraftEntities(draft, parties, inventory, treasuries as any);
  });
}

/**
 * تحديث حالة اعتماد أسطر كشف الإدخال اليومي وتخزين رقم الفاتورة المعتمدة
 */
export function markDailyEntryRowsApprovedInStorage(
  date: string,
  rowIds: string[],
  invoiceId: string,
  invoiceNumber: string
) {
  try {
    const raw = localStorage.getItem(DAILY_ENTRY_STORAGE_KEY);
    if (!raw) return;
    const sheets: Record<string, DailyEntrySheet> = JSON.parse(raw);
    const sheet = sheets[date];
    if (!sheet || !sheet.rows) return;

    sheet.rows = sheet.rows.map(r => {
      if (rowIds.includes(r.id)) {
        return {
          ...r,
          isApproved: true,
          approvedInvoiceId: invoiceId,
          approvedInvoiceNumber: invoiceNumber,
          approvedAt: new Date().toISOString()
        };
      }
      return r;
    });

    sheet.updatedAt = new Date().toISOString();
    sheets[date] = sheet;
    localStorage.setItem(DAILY_ENTRY_STORAGE_KEY, JSON.stringify(sheets));

    // مزامنة فورية مع Firestore
    try {
      if (db) {
        setDoc(doc(db, 'dailyEntrySheets', date), sheet).catch(err => {
          console.warn('Firestore dailyEntrySheets write notice:', err);
        });
      }
    } catch (e) {
      console.warn('Firestore sync error:', e);
    }
  } catch (err) {
    console.error('Error marking daily entry rows approved in storage:', err);
  }
}

/**
 * حساب إجماليات كشف الإدخال اليومي
 */
export function calculateDailyEntryTotals(rows: DailyEntryRow[]) {
  let totalRequired = 0;
  let totalPaid = 0;
  let approvedCount = 0;
  const treasuryBreakdown: Record<string, { name: string; amount: number; count: number }> = {};

  rows.forEach(r => {
    const req = Number(r.requiredAmount || 0);
    const paid = Number(r.paidAmount || 0);
    totalRequired += req;
    totalPaid += paid;

    if (r.isApproved) {
      approvedCount += 1;
    }

    if (paid > 0) {
      const tKey = r.treasuryId || r.treasuryName || 'other';
      const tName = r.treasuryName || 'الصندوق النقدي';
      if (!treasuryBreakdown[tKey]) {
        treasuryBreakdown[tKey] = { name: tName, amount: 0, count: 0 };
      }
      treasuryBreakdown[tKey].amount += paid;
      treasuryBreakdown[tKey].count += 1;
    }
  });

  const validRows = rows.filter(r => (r.customerName && r.customerName.trim()) || (r.itemName && r.itemName.trim()) || r.requiredAmount > 0 || r.paidAmount > 0);

  return {
    totalRequired,
    totalPaid,
    totalRemaining: Math.max(0, totalRequired - totalPaid),
    rowsCount: rows.length,
    validRowsCount: validRows.length,
    approvedCount,
    pendingCount: Math.max(0, validRows.length - approvedCount),
    treasuryBreakdown
  };
}
