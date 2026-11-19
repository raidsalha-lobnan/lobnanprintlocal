import {
  Party,
  Invoice,
  PurchaseInvoice,
  PurchaseReturn,
  SalesReturn,
  PaymentVoucher,
  PrintJobOrder,
  JournalEntry,
  DebtClearingRecord,
  Employee,
  EmployeeAdvance,
  EmployeeDeduction,
  EmployeeIncentive,
  LineAttachment
} from '../types';
import { isInvoiceAccountingEligible } from './invoiceStatusUtils';
import {invoiceParentCustomerId, getInvoiceSubCustomerName, normalizeSubCustomerName, subCustomerParentId} from './subCustomerIdentity';
import { isDimensionalInvoiceItem } from './invoiceDimensions';
import { isConfirmedSalesInvoice } from './invoiceConfirmation';
import {compareStatementChronology} from './statementChronology';

export interface StatementItemDetail {
  itemId?: string;
  itemCode?: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  length?: number;
  width?: number;
  count?: number;
  hasDimensions?: boolean;
  unitCalculationType?: string;
  discount?: number;
  unit?: string;
  notes?: string;
  description?: string;
  imageThumbnail?: string;
  attachments?: LineAttachment[];
}

export interface StatementRow {
  id: string;
  date: string;
  referenceNumber: string;
  type: 'opening' | 'invoice' | 'print_order' | 'purchase' | 'purchase_return' | 'sales_return' | 'receipt' | 'payment' | 'journal' | 'clearance';
  category: 'withdrawal' | 'receipt' | 'disbursement' | 'opening' | 'other';
  typeLabel: string;
  description: string;
  invoiceNotes?: string;
  voucherNotes?: string;
  subtotal?: number;
  discountTotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  currencySymbol?: string;
  paymentMethod?: string;
  paymentMethodLabel?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDueDate?: string;
  transferReference?: string;
  accountCode?: string;
  treasuryName?: string;
  counterPartyName?: string;
  reason?: string;
  subCustomerName?: string;
  items?: StatementItemDetail[];
  debit: number;   // مدين (سحوبات العميل / سداد المورد)
  credit: number;  // دائن (مقبوضات العميل / توريدات المورد)
  runningBalance: number; // الرصيد التراكمي المستمر
  notes?: string;
}

export interface StatementResult {
  party: Party;
  fromDate?: string;
  toDate?: string;
  openingBalance: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  totalWithdrawals: number;   // إجمالي السحوبات
  totalReceipts: number;      // إجمالي المقبوضات
  totalDisbursements: number; // إجمالي الصرف
  netMovement: number;
  closingBalance: number;
  creditLimit: number;
  isCreditExceeded: boolean;
  creditUsagePercentage: number;
  statementDate: string;
}

export function generateAccountStatement(params: {
  party: Party;
  fromDate?: string;
  toDate?: string;
  subCustomerId?: string;
  subCustomers?: Party[];
  invoices: Invoice[];
  purchases: PurchaseInvoice[];
  purchaseReturns?: PurchaseReturn[];
  salesReturns?: SalesReturn[];
  vouchers: PaymentVoucher[];
  printOrders?: PrintJobOrder[];
  journalEntries?: JournalEntry[];
  debtClearings?: DebtClearingRecord[];
}): StatementResult {
  const {
    party,
    fromDate,
    toDate,
    subCustomerId,
    subCustomers = [],
    invoices = [],
    purchases = [],
    purchaseReturns = [],
    salesReturns = [],
    vouchers = [],
    printOrders = [],
    journalEntries = [],
    debtClearings = []
  } = params;

  interface RawTx {
    id: string;
    date: string;
    refNum: string;
    createdAt?: string;
    sourceInvoiceId?: string;
    type: StatementRow['type'];
    category: StatementRow['category'];
    typeLabel: string;
    description: string;
    invoiceNotes?: string;
    voucherNotes?: string;
    subtotal?: number;
    discountTotal?: number;
    taxAmount?: number;
    totalAmount?: number;
    paidAmount?: number;
    remainingAmount?: number;
    currencySymbol?: string;
    paymentMethod?: string;
    paymentMethodLabel?: string;
    chequeNumber?: string;
    chequeBank?: string;
    chequeDueDate?: string;
    transferReference?: string;
    accountCode?: string;
    treasuryName?: string;
    counterPartyName?: string;
    reason?: string;
    subCustomerName?: string;
    items?: StatementItemDetail[];
    debit: number;
    credit: number;
  }

  const allTx: RawTx[] = [];

  // Resolve target sub-customer object if specific subCustomerId is requested
  const targetSubCustObj = (subCustomerId && subCustomerId !== 'all')
    ? (subCustomers.find(s => s.id === subCustomerId || s.code === subCustomerId) ||
       (party.isSubCustomer ? party : null))
    : (party.isSubCustomer ? party : null);

  const targetSubCustName = targetSubCustObj?.name?.trim().toLowerCase();

  // Helper matcher function for sub-customers
  const matchesSubCust = (invSubCustId?: string, invSubCustName?: string, customText?: string): boolean => {
    if (!subCustomerId || subCustomerId === 'all') return true;
    if (invSubCustId && (invSubCustId === subCustomerId || (targetSubCustObj && invSubCustId === targetSubCustObj.id))) return true;
    if (targetSubCustName) {
      if (invSubCustName && normalizeSubCustomerName(invSubCustName) === normalizeSubCustomerName(targetSubCustName)) return true;
      if (customText && normalizeSubCustomerName(getInvoiceSubCustomerName({subCustomerName: invSubCustName, customCustomerText: customText})) === normalizeSubCustomerName(targetSubCustName)) return true;
    }
    return false;
  };

  // 1. Single carried-forward opening balance.
  // Foundational opening is a starting position, not a dated transaction:
  // it must not become an extra invoice-like movement or be counted twice.
  // When the user filters a period, combine this starting amount with ALL
  // earlier transactions, regardless of the foundational entry's audit date.
  let initialBal = targetSubCustObj
    ? Number(targetSubCustObj.openingBalance || 0)
    : Number(party.openingBalance || 0);

  const initBalType = targetSubCustObj ? targetSubCustObj.openingBalanceType : party.openingBalanceType;
  if (initBalType === 'credit') {
    initialBal = -Math.abs(initialBal);
  }

  // 2. Sales Invoices (for Customers)
  invoices.forEach(inv => {
    // A TEMP invoice is a locally durable draft, NOT an official receivable.
    if (!isConfirmedSalesInvoice(inv)) return;
    // Only (بيع - جاهز للتسليم - تم التسليم) enter accounting and statement
    if (!isInvoiceAccountingEligible(inv.workflowStatus)) {
      return;
    }

    const isMainCustMatch = invoiceParentCustomerId(inv) === party.id;
    // Never identify a walk-in account by name across unrelated parent customers.
    // Historical invoices may contain only subCustomerName, without subCustomerId.
    const linkedParentId = subCustomerParentId(party);
    const belongsToParent = party.isSubCustomer && Boolean(linkedParentId) &&
      invoiceParentCustomerId(inv) === linkedParentId;
    const sameWalkInName = belongsToParent &&
      normalizeSubCustomerName(getInvoiceSubCustomerName(inv)) === normalizeSubCustomerName(party.name);
    const isTarget = party.isSubCustomer
      ? (belongsToParent && (inv.subCustomerId === party.id || sameWalkInName))
      : (isMainCustMatch && matchesSubCust(inv.subCustomerId, inv.subCustomerName, inv.customCustomerText));

    if (isTarget) {
      const subCustNote = !party.isSubCustomer && (inv.subCustomerName || inv.customCustomerText)
        ? ` [الزبون الفرعي: ${inv.subCustomerName || inv.customCustomerText}]`
        : '';

      const itemsDetail: StatementItemDetail[] = (inv.items || []).map(it => {
        const itAny = it as any;
        return {
          itemId: it.itemId,
          itemCode: itAny.itemCode || itAny.item?.code || '',
          itemName: it.itemName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          length: it.length,
          width: it.width,
          count: it.count || 1,
          hasDimensions: itAny.hasDimensions,
          unitCalculationType: itAny.unitCalculationType,
          discount: it.discount || 0,
          unit: it.unit,
          notes: itAny.notes || it.description,
          description: it.description,
          imageThumbnail: itAny.imageThumbnail || itAny.item?.imageUrl || '',
          attachments: it.attachments || []
        };
      });

      // Invoices count as Withdrawals (سحوبات - مدين)
      allTx.push({
        id: inv.id,
        date: inv.date,
        refNum: inv.invoiceNumber,
        createdAt: inv.createdAt,
        type: 'invoice',
        category: 'withdrawal',
        typeLabel: 'فاتورة مبيعات',
        description: inv.notes ? `${inv.notes}${subCustNote}` : (subCustNote ? subCustNote.trim() : ''),
        invoiceNotes: inv.notes || '',
        subtotal: inv.subtotal,
        discountTotal: inv.discountTotal || 0,
        taxAmount: inv.taxAmount || 0,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount || 0,
        remainingAmount: inv.remainingAmount ?? (Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)),
        currencySymbol: inv.currencySymbol,
        subCustomerName: inv.subCustomerName || inv.customCustomerText,
        items: itemsDetail,
        debit: inv.baseTotalAmount || inv.totalAmount,
        credit: 0
      });

      // Immediate payment received on invoice (سداد فوري - مقبوضات)
      // Atomic linked receipts are already displayed separately as voucher rows.
      // Remove their recorded share from the invoice's aggregate paid amount,
      // preserving any payment taken immediately at invoice issuance.
      const rawPaid=inv.basePaidAmount !== undefined ? inv.basePaidAmount : (inv.paidAmount || 0);
      const linkedAtomicPaid=Number((inv as Invoice & {receiptVoucherTotalBase?:number}).receiptVoucherTotalBase||0);
      const paidInInv=Math.max(0,Number((Number(rawPaid)-linkedAtomicPaid).toFixed(2)));
      if (paidInInv > 0) {
        const pmtMethodLabel =
          inv.paymentMethod === 'cash' ? 'نقداً (الصندوق)' :
          inv.paymentMethod === 'card' ? 'بطاقة/شبكة' :
          inv.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' :
          (inv.paymentMethod as string) === 'cheque' ? 'شيك بنكي' : 'سداد مع الفاتورة';

        allTx.push({
          id: `${inv.id}-pmt`,
          date: inv.date,
          refNum: `PAY-${inv.invoiceNumber}`,
          createdAt: inv.createdAt,
          sourceInvoiceId: inv.id,
          type: 'receipt',
          category: 'receipt',
          typeLabel: 'سند قبض',
          description: `سداد قيمة الفاتورة (${pmtMethodLabel})`,
          paymentMethod: inv.paymentMethod,
          paymentMethodLabel: pmtMethodLabel,
          voucherNotes: inv.paymentNotes || (inv as any).receiptNotes || '',
          subCustomerName: inv.subCustomerName || inv.customCustomerText,
          debit: 0,
          credit: paidInInv
        });
      }
    }
  });

  // 3. Print Orders (أوامر التشغيل)
  // RULE: "أمر التشغيل لا يسجل في الكشف إلا في حال تم اعتماده كمسلم ويظهر مرة واحدة وكفاتورة بيع"
  printOrders.forEach(job => {
    if (job.customerId === party.id) {
      // 1) ONLY include if delivered
      if (job.status !== 'delivered') {
        return;
      }

      // 2) Check if this job is already recorded as an invoice in invoices to prevent duplicate!
      const alreadyHasInvoice = invoices.some(inv =>
        inv.printJobId === job.id ||
        (Boolean(job.associatedInvoiceId) && inv.id === job.associatedInvoiceId)
      );

      if (alreadyHasInvoice) {
        // It has already been billed and recorded in the invoices section above!
        return;
      }

      // 3) Appears ONCE as a sales invoice (فاتورة بيع - أمر تشغيل مسلّم)
      allTx.push({
        id: job.id,
        date: job.deliveryDate || job.createdAt,
        refNum: job.orderNumber,
        createdAt: job.createdAt,
        type: 'invoice',
        category: 'withdrawal',
        typeLabel: 'فاتورة مبيعات',
        description: `فاتورة مبيعات - أمر تشغيل مطبعة: ${job.title} (${job.quantity} نسخة)${job.paperType ? ` - ورق: ${job.paperType}` : ''}`,
        items: [
          {
            itemName: job.title,
            quantity: job.quantity,
            unitPrice: job.quantity > 0 ? (job.totalPrice / job.quantity) : job.totalPrice,
            total: job.totalPrice,
            unit: job.dimensions || 'وحدة',
            notes: job.notes
          }
        ],
        debit: job.totalPrice,
        credit: 0
      });

      // If deposit was paid on this job and not already entered as a payment voucher
      if (job.depositPaid > 0) {
        const hasMatchingVoucher = vouchers.some(v =>
          v.partyId === party.id &&
          (v.voucherNumber === `DEP-${job.orderNumber}` || (v.description && v.description.includes(job.orderNumber)))
        );

        if (!hasMatchingVoucher) {
          allTx.push({
            id: `${job.id}-dep`,
            date: job.createdAt,
            refNum: `DEP-${job.orderNumber}`,
            createdAt: job.createdAt,
            sourceInvoiceId: job.id,
            type: 'receipt',
            category: 'receipt',
            typeLabel: 'سند قبض',
            description: `عربون مستلم لأمر التشغيل المسلّم ${job.orderNumber}`,
            debit: 0,
            credit: job.depositPaid
          });
        }
      }
    }
  });

  // 4. Purchases (for suppliers)
  purchases.forEach(pur => {
    if (pur.supplierId === party.id) {
      const purItems: StatementItemDetail[] = (pur.items || []).map(it => ({
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        count: 1,
        discount: 0,
        notes: (it as any).notes || (it as any).description,
        unit: (it as any).unit
      }));

      allTx.push({
        id: pur.id,
        date: pur.date,
        refNum: pur.invoiceNumber,
        createdAt: (pur as PurchaseInvoice & {createdAt?:string}).createdAt,
        type: 'purchase',
        category: 'withdrawal', // For supplier, supplies/purchases
        typeLabel: 'فاتورة مشتريات',
        description: pur.notes || (pur.supplierInvoiceNumber ? `فاتورة مورد #${pur.supplierInvoiceNumber}` : ''),
        invoiceNotes: pur.notes || '',
        subtotal: pur.subtotal,
        discountTotal: 0,
        taxAmount: pur.taxAmount || 0,
        totalAmount: pur.totalAmount,
        items: purItems,
        debit: 0,
        credit: pur.baseTotalAmount || pur.totalAmount
      });

      const paidInPur = pur.basePaidAmount !== undefined ? pur.basePaidAmount : (pur.paidAmount || 0);
      if (paidInPur > 0) {
        allTx.push({
          id: `${pur.id}-pmt`,
          date: pur.date,
          refNum: `DISB-${pur.invoiceNumber}`,
          createdAt: (pur as PurchaseInvoice & {createdAt?:string}).createdAt,
          sourceInvoiceId: pur.id,
          type: 'payment',
          category: 'disbursement',
          typeLabel: 'سند صرف',
          description: `سداد مسدد للمورد (${pur.paymentMethod === 'cash' ? 'نقداً' : 'تحويل بنكي'})`,
          paymentMethod: pur.paymentMethod,
          paymentMethodLabel: pur.paymentMethod === 'cash' ? 'نقداً (الصندوق)' : 'تحويل بنكي',
          voucherNotes: pur.notes,
          debit: paidInPur,
          credit: 0
        });
      }
    }
  });

  // 5. Purchase Returns (مردودات المشتريات)
  purchaseReturns.forEach(ret => {
    if (ret.supplierId === party.id) {
      allTx.push({
        id: ret.id,
        date: ret.date,
        refNum: ret.returnNumber,
        createdAt: ret.createdAt,
        type: 'purchase_return',
        category: 'receipt',
        typeLabel: 'مردودات مشتريات',
        description: `مرتجع خامات للمورد (${ret.items.map(i => `${i.itemName} × ${i.quantity}`).join('، ')})${ret.notes ? ` - ${ret.notes}` : ''}`,
        invoiceNotes: ret.notes,
        subtotal: ret.totalAmount,
        totalAmount: ret.totalAmount,
        debit: ret.totalAmount,
        credit: 0
      });
    }
  });

  // 5.1 Sales Returns (مردودات المبيعات للعميل)
  salesReturns.forEach(ret => {
    if (ret.customerId === party.id) {
      allTx.push({
        id: ret.id,
        date: ret.date,
        refNum: ret.returnNumber,
        createdAt: ret.createdAt,
        type: 'sales_return',
        category: 'receipt',
        typeLabel: 'مردودات مبيعات',
        description: `مرتجع مبيعات للعميل${ret.invoiceNumber ? ` (عن فاتورة ${ret.invoiceNumber})` : ''}: ${ret.items.map(i => `${i.itemName} × ${i.quantity}`).join('، ')}`,
        invoiceNotes: ret.notes,
        voucherNotes: ret.notes,
        subtotal: ret.subtotal,
        taxAmount: ret.taxAmount,
        totalAmount: ret.totalAmount,
        items: ret.items.map(it => ({
          itemId: it.itemId,
          itemName: it.itemName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          notes: it.reason
        })),
        debit: 0,
        credit: ret.totalAmount
      });
    }
  });

  // 6. Payment & Receipt Vouchers (سندات القبض والصرف)
  vouchers.forEach(vch => {
    // Avoid double-counting invoice-generated immediate payment receipts or purchase payments
    if (vch.id.startsWith('vch-inv-') || vch.id.startsWith('vch-pur-')) {
      return;
    }

    const matchesVchSubCust = (!subCustomerId || subCustomerId === 'all')
      ? true
      : (
          vch.partyId === subCustomerId ||
          (targetSubCustObj && vch.partyId === targetSubCustObj.id) ||
          (targetSubCustName && vch.partyName && vch.partyName.trim().toLowerCase().includes(targetSubCustName)) ||
          (targetSubCustName && vch.description && vch.description.trim().toLowerCase().includes(targetSubCustName)) ||
          (targetSubCustName && (vch as any).subCustomerName && (vch as any).subCustomerName.trim().toLowerCase().includes(targetSubCustName))
        );

    const isTarget = party.isSubCustomer
      ? (
          vch.partyId === party.id ||
          (vch.description && vch.description.includes(party.name)) ||
          (vch.partyName && vch.partyName.includes(party.name))
        )
      : (vch.partyId === party.id && matchesVchSubCust);

    if (isTarget) {
      const vchNote = (vch as any).notes || vch.description;
      const paymentMethodLabel =
        vch.paymentMethod === 'cash' ? 'نقداً (الصندوق)' :
        vch.paymentMethod === 'cheque' ? 'شيك بنكي' :
        vch.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'أخرى';

      if (vch.type === 'receipt') {
        // Customer debt is settled by BOTH actual cash and the approved
        // non-cash discount. Treasury receives only the cash component.
        const cashBase=Number(vch.baseAmount??vch.amount);
        const rebateBase=Number(vch.baseDiscountAmount??
          (Number(vch.discountAmount||0)*Number(vch.exchangeRate||1)));
        const receiptCredit=Number((cashBase+rebateBase).toFixed(2));
        const rebateNote=Number(vch.discountAmount||0)>0?
          ` [المقبوض: ${Number(vch.amount).toFixed(2)} ${vch.currencySymbol||'₪'}؛ خصم التسوية: ${Number(vch.discountAmount).toFixed(2)} ${vch.currencySymbol||'₪'}]`:'';
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          createdAt: (vch as PaymentVoucher & {createdAt?:string}).createdAt,
          type: 'receipt',
          category: 'receipt',
          typeLabel: 'سند قبض',
          description: (vch.description || 'سند قبض وتحصيل دفعة نقدية من العميل')+rebateNote,
          voucherNotes: vchNote,
          paymentMethod: vch.paymentMethod,
          paymentMethodLabel,
          chequeNumber: vch.chequeNumber,
          chequeBank: vch.chequeBank,
          chequeDueDate: vch.chequeDueDate,
          transferReference: vch.transferReference,
          accountCode: vch.treasuryAccountCode || vch.accountCode,
          subCustomerName: vch.subCustomerName,
          debit: 0,
          credit: receiptCredit
        });
      } else {
        // Payment voucher -> If party is supplier: payment to supplier (debit)
        // If party is customer: refund or payment to customer (disbursement - debit)
        const isCust = party.type === 'customer';
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          createdAt: (vch as PaymentVoucher & {createdAt?:string}).createdAt,
          type: 'payment',
          category: 'disbursement',
          typeLabel: 'سند صرف',
          description: vch.description || (isCust ? 'سند صرف واسترداد للعميل' : 'سند صرف وسداد دفعة للمورد'),
          voucherNotes: vchNote,
          paymentMethod: vch.paymentMethod,
          paymentMethodLabel,
          chequeNumber: vch.chequeNumber,
          chequeBank: vch.chequeBank,
          chequeDueDate: vch.chequeDueDate,
          transferReference: vch.transferReference,
          accountCode: vch.treasuryAccountCode || vch.accountCode,
          subCustomerName: vch.subCustomerName,
          debit: vch.amount,
          credit: 0
        });
      }
    }
  });

  // 7. Journal Entries (قيد اليومية العامة)
  // Only include manual journal entries to prevent duplicating automatic system entries
  journalEntries.filter(e => !e.referenceType || e.referenceType === 'manual').forEach(entry => {
    entry.lines.forEach((line, lIdx) => {
      const isMatch = (line.description && line.description.includes(party.name)) ||
                      (entry.description && entry.description.includes(party.name)) ||
                      (line.accountName && line.accountName.includes(party.name));

      if (isMatch) {
        allTx.push({
          id: `${entry.id}-${lIdx}`,
          date: entry.date,
          refNum: entry.entryNumber,
          createdAt: entry.createdAt,
          type: 'journal',
          category: line.debit > 0 ? 'withdrawal' : 'receipt',
          typeLabel: 'قيد يومية تسوية',
          description: `${line.description || entry.description} [حساب: ${line.accountName}]`,
          voucherNotes: (entry as any).notes || entry.description,
          accountCode: line.accountCode,
          debit: line.debit,
          credit: line.credit
        });
      }
    });
  });

  // 8. Debt Clearings (مقاصة ديون بين عميل ومورد)
  // لا تدخل ضمن الصناديق المالية وتظهر بكشف العميل (دائن/قبض) والمورد (مدين/صرف)
  debtClearings.forEach(clr => {
    // إذا كان الطرف هو العميل: مقاصة تسوية دائنة (بمثابة سداد/قبض يقلل مديونية العميل)
    if (clr.customerId === party.id) {
      allTx.push({
        id: `${clr.id}-cust`,
        date: clr.date,
        refNum: clr.clearingNumber,
        createdAt: clr.createdAt,
        type: 'clearance',
        category: 'receipt',
        typeLabel: 'مقاصة حسابات (قبض / تسوية دائنة)',
        description: `مقاصة تسوية مع المورد: ${clr.supplierName} - ${clr.reason || 'تسوية أرصدة متبادلة'}`,
        voucherNotes: clr.notes,
        counterPartyName: clr.supplierName,
        reason: clr.reason,
        debit: 0,
        credit: clr.amount
      });
    }

    // إذا كان الطرف هو المورد: مقاصة تسوية مدينة (بمثابة سداد/صرف يقلل مستحقات المورد)
    if (clr.supplierId === party.id) {
      allTx.push({
        id: `${clr.id}-supp`,
        date: clr.date,
        refNum: clr.clearingNumber,
        createdAt: clr.createdAt,
        type: 'clearance',
        category: 'disbursement',
        typeLabel: 'مقاصة حسابات (صرف / تسوية مدينة)',
        description: `مقاصة تسوية مع العميل: ${clr.customerName} - ${clr.reason || 'تسوية أرصدة متبادلة'}`,
        voucherNotes: clr.notes,
        counterPartyName: clr.customerName,
        reason: clr.reason,
        debit: clr.amount,
        credit: 0
      });
    }
  });

  // Business date first, then original insertion time/official document order.
  // UUID/lexical IDs are not evidence of which same-day invoice was entered first.
  // Sort BEFORE calculating the running balance so every row reflects this order.
  allTx.sort(compareStatementChronology);

  // The statement always has ONE opening position: original foundational
  // balance + net transactions preceding the selected statement start.
  // Opening is never in filteredTx, so it is not repeated as a second row
  // and the movement totals measure only transactions WITHIN the period.
  let periodOpeningBalance = initialBal;
  const filteredTx: RawTx[] = [];

  allTx.forEach(tx => {
    if (fromDate && tx.date < fromDate) {
      periodOpeningBalance += (tx.debit - tx.credit);
    } else if (!toDate || tx.date <= toDate) {
      filteredTx.push(tx);
    }
  });

  let running = periodOpeningBalance;
  const rows: StatementRow[] = [];

  let totalDebit = 0;
  let totalCredit = 0;
  let totalWithdrawals = 0;
  let totalReceipts = 0;
  let totalDisbursements = 0;

  filteredTx.forEach(tx => {
    running += (tx.debit - tx.credit);
    totalDebit += tx.debit;
    totalCredit += tx.credit;

    if (tx.category === 'withdrawal') {
      totalWithdrawals += tx.debit;
    } else if (tx.category === 'receipt') {
      totalReceipts += tx.credit;
    } else if (tx.category === 'disbursement') {
      totalDisbursements += tx.debit;
    }

    rows.push({
      id: tx.id,
      date: tx.date,
      referenceNumber: tx.refNum,
      type: tx.type,
      category: tx.category,
      typeLabel: tx.typeLabel,
      description: tx.description,
      invoiceNotes: tx.invoiceNotes,
      voucherNotes: tx.voucherNotes,
      subtotal: tx.subtotal,
      discountTotal: tx.discountTotal,
      discountAmount: tx.discountTotal,
      taxAmount: tx.taxAmount,
      totalAmount: tx.totalAmount,
      paidAmount: tx.paidAmount,
      remainingAmount: tx.remainingAmount,
      currencySymbol: tx.currencySymbol,
      paymentMethod: tx.paymentMethod,
      paymentMethodLabel: tx.paymentMethodLabel,
      chequeNumber: tx.chequeNumber,
      chequeBank: tx.chequeBank,
      chequeDueDate: tx.chequeDueDate,
      transferReference: tx.transferReference,
      accountCode: tx.accountCode,
      treasuryName: tx.treasuryName,
      counterPartyName: tx.counterPartyName,
      reason: tx.reason,
      subCustomerName: tx.subCustomerName,
      items: tx.items,
      debit: tx.debit,
      credit: tx.credit,
      runningBalance: running
    });
  });

  const closingBalance = running;
  const creditLimit = Number(party.creditLimit || 0);
  const isCreditExceeded = creditLimit > 0 && closingBalance > creditLimit;
  const creditUsagePercentage = creditLimit > 0 ? (closingBalance / creditLimit) * 100 : 0;

  return {
    party,
    fromDate,
    toDate,
    openingBalance: periodOpeningBalance,
    rows,
    totalDebit,
    totalCredit,
    totalWithdrawals,
    totalReceipts,
    totalDisbursements,
    netMovement: totalDebit - totalCredit,
    closingBalance,
    creditLimit,
    isCreditExceeded,
    creditUsagePercentage,
    statementDate: new Date().toISOString().split('T')[0]
  };
}

// ----------------------------------------------------------------------
// EMPLOYEE FINANCIAL STATEMENT GENERATOR (كشف مالي تفصيلي للموظف)
// ----------------------------------------------------------------------

export interface EmployeePayrollBreakdown {
  basicSalary: number;
  allowances: number;
  incentives: number;
  deductions: number;
  advancesDeducted: number;
  netSalary: number;
  period: string;
  status: 'approved';
}

export interface EmployeeStatementRow {
  id: string;
  date: string;
  referenceNumber: string;
  type: 'opening' | 'salary_accrual' | 'advance' | 'deduction' | 'incentive' | 'payment_disbursement' | 'invoice' | 'purchase' | 'receipt' | 'payment' | 'payroll_sheet' | 'debt_clearing' | 'journal_entry' | 'other';
  typeLabel: string;
  description: string;
  entitlement: number;   // استحقاق للموظف (+)
  advance: number;       // سلفة مسحوبة (-)
  deduction: number;     // استقطاع / جزاء (-)
  disbursement: number;  // صرف فعلي / مشتريات شخصية / مسحوبات (-)
  runningBalance: number;// الرصيد التراكمي المتبقي للموظف (موجب = مستحق له، سالب = سلف عليه)
  paymentMethod?: string;
  period?: string;
  notes?: string;
  invoiceNotes?: string;
  items?: StatementItemDetail[];
  subtotal?: number;
  discountTotal?: number;
  taxAmount?: number;
  additionalCharges?: number;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  invoiceCurrency?: string;
  payrollDetails?: EmployeePayrollBreakdown;
}

export interface EmployeeStatementResult {
  employee: Employee;
  fromDate?: string;
  toDate?: string;
  openingBalance: number;
  rows: EmployeeStatementRow[];
  totalEntitlements: number;   // إجمالي المستحقات (رواتب ومكافآت وتوريدات)
  totalAdvances: number;       // إجمالي السلف
  totalDeductions: number;     // إجمالي الخصومات
  totalDisbursements: number;  // إجمالي الصرف الفعلي والمسحوبات
  totalDue: number;            // إجمالي ما له
  totalPaid: number;           // إجمالي ما عليه
  closingBalance: number;      // صافي الرصيد الختامي المتبقي للموظف
  statementDate: string;
}

export function generateEmployeeStatement(params: {
  employee: Employee;
  fromDate?: string;
  toDate?: string;
  vouchers?: PaymentVoucher[];
  advances?: EmployeeAdvance[];
  deductions?: EmployeeDeduction[];
  incentives?: EmployeeIncentive[];
  invoices?: Invoice[];
  purchases?: PurchaseInvoice[];
  purchaseReturns?: PurchaseReturn[];
  salesReturns?: SalesReturn[];
  payrollSheets?: any[];
  journalEntries?: JournalEntry[];
  debtClearings?: DebtClearingRecord[];
}): EmployeeStatementResult {
  const {
    employee,
    fromDate,
    toDate,
    vouchers = [],
    advances = [],
    deductions = [],
    incentives = [],
    invoices = [],
    purchases = [],
    purchaseReturns = [],
    salesReturns = [],
    payrollSheets = [],
    journalEntries = [],
    debtClearings = []
  } = params;

  interface RawEmpTx {
    id: string;
    date: string;
    refNum: string;
    type: EmployeeStatementRow['type'];
    typeLabel: string;
    description: string;
    entitlement: number;
    advance: number;
    deduction: number;
    disbursement: number;
    paymentMethod?: string;
    period?: string;
    notes?: string;
    invoiceNotes?: string;
    items?: StatementItemDetail[];
    subtotal?: number;
    discountTotal?: number;
    taxAmount?: number;
    additionalCharges?: number;
    totalAmount?: number;
    paidAmount?: number;
    remainingAmount?: number;
    invoiceCurrency?: string;
    payrollDetails?: EmployeePayrollBreakdown;
  }

  const allTx: RawEmpTx[] = [];

  // An approved payroll is the source of its salary expense, incentives,
  // deductions and net disbursement. The employee history is a secondary
  // receipt, not another salary payment on top of that payroll.
  const approvedPayrolls = payrollSheets.filter(sheet=>sheet.status==='approved');
  const approvedPayrollIds = new Set(approvedPayrolls.map(sheet=>sheet.id));
  const approvedPayrollVoucherNumbers = new Set(
    approvedPayrolls.map(sheet=>sheet.voucherNumber).filter(Boolean)
  );

  const empId = (employee.id || '').trim();
  const empCode = (employee.code || '').trim();
  const empName = (employee.name || '').trim();
  const empPhone = (employee.phone || '').trim();

  // Helper to determine if an entity is linked to this employee
  const isMatched = (
    targetId?: string,
    targetName?: string,
    targetText?: string,
    targetEmpId?: string
  ): boolean => {
    if (targetId) {
      const tid = targetId.trim();
      if (tid === empId) return true;
      if (empCode && tid.toLowerCase() === empCode.toLowerCase()) return true;
    }
    if (targetEmpId) {
      const teid = targetEmpId.trim();
      if (teid === empId) return true;
      if (empCode && teid.toLowerCase() === empCode.toLowerCase()) return true;
    }
    if (targetName && empName) {
      const tname = targetName.trim().toLowerCase();
      const ename = empName.toLowerCase();
      if (tname === ename) return true;
      if (tname.includes(ename) || ename.includes(tname)) return true;
    }
    if (empPhone && targetText && targetText.includes(empPhone)) return true;
    if (targetText) {
      const textLower = targetText.toLowerCase();
      if (empCode && empCode.length >= 2) {
        const re = new RegExp(`(^|[^a-zA-Z0-9\u0600-\u06FF])${empCode}([^a-zA-Z0-9\u0600-\u06FF]|$)`, 'i');
        if (re.test(textLower)) return true;
      }
      if (empName && empName.length >= 3 && textLower.includes(empName.toLowerCase())) {
        return true;
      }
    }
    return false;
  };

  // 1. Employee Payment History (سجل المدفوعات في ملف الموظف)
  (employee.paymentHistory || []).forEach(record => {
    if (record.type !== 'advance' && record.voucherNumber &&
        approvedPayrollVoucherNumbers.has(record.voucherNumber)) return;
    if (record.type === 'advance') {
      allTx.push({
        id: record.id,
        date: record.date,
        refNum: record.voucherNumber || `ADV-${record.id.slice(0, 6)}`,
        type: 'advance',
        typeLabel: 'سلفة نقدية',
        description: record.notes || `سلفة نقدية مستلمة (${record.paymentMethod === 'cash' ? 'نقداً' : 'تحويل'})`,
        entitlement: 0,
        advance: record.amount,
        deduction: 0,
        disbursement: 0,
        paymentMethod: record.paymentMethod,
        period: record.period,
        notes: record.notes
      });
    } else {
      allTx.push({
        id: record.id,
        date: record.date,
        refNum: record.voucherNumber || `PAY-${record.id.slice(0, 6)}`,
        type: 'payment_disbursement',
        typeLabel: 'صرف راتب',
        description: record.notes || `صرف الراتب المستحق عن فترة ${record.period || 'الشهر'}`,
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: record.amount,
        paymentMethod: record.paymentMethod,
        period: record.period,
        notes: record.notes
      });
    }
  });

  // 2. Employee Advances from Context (سلف الموظفين)
  advances.forEach(adv => {
    if (adv.status !== 'cancelled' && adv.disbursedImmediately) {
      const matches = isMatched(adv.employeeId, adv.employeeName, adv.reason) || adv.employeeId === empId;
      if (matches) {
        const exists = allTx.some(t => t.id === adv.id || (t.date === adv.date && t.advance === adv.amount));
        if (!exists) {
          allTx.push({
            id: adv.id,
            date: adv.date,
            refNum: adv.voucherNumber || `ADV-${adv.id.slice(0, 6)}`,
            type: 'advance',
            typeLabel: 'سلفة نقدية',
            description: adv.reason || 'طلب سلفة نقدية معتمدة',
            entitlement: 0,
            advance: adv.amount,
            deduction: 0,
            disbursement: 0,
            notes: adv.reason
          });
        }
      }
    }
  });

  // 3. Employee Deductions (الخصومات والجزاءات)
  deductions.forEach(ded => {
    // A pending deduction is not an approved payroll reduction. Once used
    // in a salary sheet the approved payroll already contains its effect.
    if (ded.status === 'deducted' &&
        (!ded.payrollSheetId || !approvedPayrollIds.has(ded.payrollSheetId))) {
      const matches = isMatched(ded.employeeId, ded.employeeName, ded.reason) || ded.employeeId === empId;
      if (matches) {
        allTx.push({
          id: ded.id,
          date: ded.date,
          refNum: `DED-${ded.id.slice(0, 6)}`,
          type: 'deduction',
          typeLabel: 'خصم / استقطاع',
          description: ded.reason || 'خصم إداري أو استقطاع غياب',
          entitlement: 0,
          advance: 0,
          deduction: ded.amount,
          disbursement: 0,
          notes: ded.reason
        });
      }
    }
  });

  // 4. Employee Incentives (المكافآت والحوافز)
  incentives.forEach(inc => {
    if (inc.status !== 'paid' ||
        (inc.payrollSheetId && approvedPayrollIds.has(inc.payrollSheetId))) return;
    const matches = isMatched(inc.employeeId, inc.employeeName, inc.reason) || inc.employeeId === empId;
    if (matches) {
      allTx.push({
        id: inc.id,
        date: inc.date,
        refNum: `INC-${inc.id.slice(0, 6)}`,
        type: 'incentive',
        typeLabel: 'مكافأة وحافز',
        description: inc.reason || 'مكافأة تميز وحافز أداء',
        entitlement: inc.amount,
        advance: 0,
        deduction: 0,
        disbursement: 0,
        notes: inc.reason
      });
    }
  });

  // 5. Payment & Receipt Vouchers (سندات الصرف والقبض المرتبطة برقم الموظف)
  vouchers.forEach(vch => {
    const matches = isMatched(vch.partyId, vch.partyName, vch.description, vch.employeeId);
    if (!matches) return;

    const alreadyLogged = allTx.some(t => t.id === vch.id || (t.refNum && t.refNum === vch.voucherNumber));
    if (alreadyLogged) return;

    if (vch.type === 'payment') {
      const isAdvance = vch.description?.includes('سلفة') || vch.voucherNumber?.includes('ADV');
      if (isAdvance) {
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          type: 'advance',
          typeLabel: 'سلفة نقدية (سند صرف)',
          description: vch.description || `سند صرف سلفة للموظف ${empName}`,
          entitlement: 0,
          advance: vch.amount,
          deduction: 0,
          disbursement: 0
        });
      } else {
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          type: 'payment_disbursement',
          typeLabel: 'سند صرف',
          description: vch.description || `سند صرف للموظف ${empName}`,
          entitlement: 0,
          advance: 0,
          deduction: 0,
          disbursement: vch.amount
        });
      }
    } else if (vch.type === 'receipt') {
      // Receipt voucher: Employee repaid an advance or deposited cash
      allTx.push({
        id: vch.id,
        date: vch.date,
        refNum: vch.voucherNumber,
        type: 'receipt',
        typeLabel: 'سند قبض (تسديد/إيداع)',
        description: vch.description || `سند قبض استلام مالي من الموظف ${empName}`,
        entitlement: vch.amount,
        advance: 0,
        deduction: 0,
        disbursement: 0
      });
    }
  });

  // 6. Sales Invoices (فواتير المبيعات المرتبطة برقم أو اسم الموظف)
  invoices.forEach(inv => {
    if (!isConfirmedSalesInvoice(inv)) return;
    if (!isInvoiceAccountingEligible(inv.workflowStatus)) return;

    // A sale to an employee is identified by the permanent employee ID,
    // never by an editable name, phone, notes, or a shared display code.
    const isDirectEmployeeCust =
      (inv.counterpartyType === 'employee' && inv.counterpartyId === empId) ||
      inv.employeeId === empId ||
      (inv.customerId === empId && (!inv.counterpartyType || inv.counterpartyType === 'employee'));

    const isLinkedByRepOrNote = !isDirectEmployeeCust && (
      (inv.representative && isMatched(undefined, inv.representative, undefined)) ||
      isMatched(undefined, undefined, `${inv.notes || ''} ${inv.customCustomerText || ''}`)
    );

    if (isDirectEmployeeCust) {
      // Sale to employee (goods taken / withdrawal on employee account)
      const desc = inv.notes || '';

      const mappedItems: StatementItemDetail[] = (inv.items || []).map(it => ({
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        length: it.length,
        width: it.width,
        count: it.count,
        discount: it.discount,
        unit: it.unit,
        notes: it.notes,
        description: it.description,
        imageThumbnail: it.imageThumbnail,
        attachments: it.attachments
      }));

      allTx.push({
        id: inv.id,
        date: inv.date,
        refNum: inv.invoiceNumber,
        type: 'invoice',
        typeLabel: 'فاتورة مبيعات (مسحوبات أصناف)',
        description: desc,
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: inv.baseTotalAmount ?? inv.totalAmount,
        notes: inv.notes,
        invoiceNotes: inv.notes,
        subtotal: inv.subtotal,
        discountTotal: inv.discountTotal,
        taxAmount: inv.taxAmount,
        additionalCharges: inv.additionalCharges,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        remainingAmount: inv.remainingAmount,
        invoiceCurrency: inv.currency || 'ILS',
        items: mappedItems
      });

      // If immediate payment was made on this invoice at checkout, credit the employee
      const paidVal = inv.basePaidAmount ?? inv.paidAmount ?? 0;
      if (paidVal > 0) {
        allTx.push({
          id: `${inv.id}-pmt`,
          date: inv.date,
          refNum: `PAY-${inv.invoiceNumber}`,
          type: 'receipt',
          typeLabel: 'سداد فاتورة مبيعات',
          description: `سداد فوري على فاتورة مبيعات ${inv.invoiceNumber} (${inv.paymentMethod === 'cash' ? 'نقداً' : 'تحويل'})`,
          entitlement: paidVal,
          advance: 0,
          deduction: 0,
          disbursement: 0
        });
      }
    } else if (isLinkedByRepOrNote) {
      // Invoice executed by employee as sales rep / cashier
      const mappedItems: StatementItemDetail[] = (inv.items || []).map(it => ({
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        length: it.length,
        width: it.width,
        count: it.count,
        discount: it.discount,
        unit: it.unit,
        notes: it.notes,
        description: it.description,
        imageThumbnail: it.imageThumbnail,
        attachments: it.attachments
      }));

      allTx.push({
        id: inv.id,
        date: inv.date,
        refNum: inv.invoiceNumber,
        type: 'invoice',
        typeLabel: 'عملية مبيعات (مندوب/كاشير)',
        description: inv.notes ? inv.notes : (inv.customerName ? `العميل: ${inv.customerName}${inv.representative ? ` (المندوب: ${inv.representative})` : ''}` : ''),
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: 0,
        notes: inv.notes,
        invoiceNotes: inv.notes,
        subtotal: inv.subtotal,
        discountTotal: inv.discountTotal,
        taxAmount: inv.taxAmount,
        additionalCharges: inv.additionalCharges,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        remainingAmount: inv.remainingAmount,
        invoiceCurrency: inv.currency || 'ILS',
        items: mappedItems
      });
    }
  });

  // 7. Purchase Invoices (فواتير المشتريات والتوريدات المرتبطة برقم الموظف)
  purchases.forEach(p => {
    const isLinked = isMatched(p.supplierId, p.supplierName, p.notes, p.employeeId);
    if (!isLinked) return;

    const desc = p.notes || '';

    const mappedItems: StatementItemDetail[] = (p.items || []).map((it: any) => ({
      itemId: it.itemId || it.id || '',
      itemCode: it.itemCode || '',
      itemName: it.itemName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      total: it.total,
      unit: it.unit || '',
      notes: it.notes || '',
      imageThumbnail: it.imageThumbnail || ''
    }));

    // Employee supplied goods/materials (Credit / Entitlement to employee)
    allTx.push({
      id: p.id,
      date: p.date,
      refNum: p.invoiceNumber,
      type: 'purchase',
      typeLabel: 'فاتورة مشتريات / توريد',
      description: desc,
      entitlement: p.totalAmount,
      advance: 0,
      deduction: 0,
      disbursement: 0,
      notes: p.notes,
      invoiceNotes: p.notes,
      items: mappedItems
    });

    // Immediate payment reimbursed to employee
    if ((p.paidAmount || 0) > 0) {
      allTx.push({
        id: `${p.id}-pmt`,
        date: p.date,
        refNum: `PAY-${p.invoiceNumber}`,
        type: 'payment_disbursement',
        typeLabel: 'سداد قيمة مشتريات للموظف',
        description: `سداد وصرف قيمة مشتريات ${p.invoiceNumber}`,
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: p.paidAmount
      });
    }
  });

  // 8. Purchase Returns (مردودات المشتريات)
  purchaseReturns.forEach(pr => {
    const isLinked = isMatched(pr.supplierId, pr.supplierName, pr.notes, (pr as any).employeeId);
    if (!isLinked) return;

    allTx.push({
      id: pr.id,
      date: pr.date,
      refNum: pr.returnNumber,
      type: 'purchase',
      typeLabel: 'مردودات مشتريات',
      description: `مردودات مشتريات رقم ${pr.returnNumber} - إجمالي ${pr.totalAmount.toFixed(2)}`,
      entitlement: 0,
      advance: 0,
      deduction: pr.totalAmount,
      disbursement: 0
    });
  });

  // 9. Only approved salary sheets are financial evidence. A draft cannot
  // create a payable balance in an official employee statement.
  (payrollSheets || []).forEach(sheet => {
    if (sheet.status !== 'approved') return;
    const sheetItems = (sheet as any).items || (sheet as any).lines || [];
    const line = sheetItems.find((l: any) =>
      l.employeeId === empId || (empCode && l.employeeCode?.toLowerCase() === empCode.toLowerCase())
    );
    if (!line || line.isIncluded === false) return;

    const sheetDate = String(sheet.disbursedAt || sheet.createdAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sheetDate)) return;
    const basicSalary = Number(line.basicSalary || 0);
    const allowances = Number(line.allowances || line.allowancesTotal || 0);
    const payrollIncentives = Number(line.incentives || 0);
    const payrollDeductions = Number(line.deductions || line.deductionsTotal || 0);
    const advancesDeducted = Number(line.advancesDeducted || 0);
    const gross = basicSalary + allowances + payrollIncentives;
    const expectedNet = Math.round((gross - payrollDeductions - advancesDeducted) * 100) / 100;
    const netSalary = line.netSalary === undefined ? expectedNet : Number(line.netSalary);
    if ([basicSalary,allowances,payrollIncentives,payrollDeductions,advancesDeducted,netSalary]
        .some(value => !Number.isFinite(value) || value < 0)) return;

    // An advance was already deducted when originally disbursed in this
    // employee ledger. Keep its later salary offset informational only.
    // Subtracting it again in the pay-slip row would double-charge the employee.
    allTx.push({
      id: `payroll-${sheet.id}-${empId}`,
      date: sheetDate,
      refNum: sheet.sheetNumber || `SHT-${sheet.id.slice(0, 6)}`,
      type: 'payroll_sheet',
      typeLabel: 'مسير راتب معتمد',
      description: `راتب ${sheet.period || ''} — مستحقات وصرف معتمد`,
      entitlement: gross,
      advance: 0,
      deduction: payrollDeductions,
      disbursement: netSalary,
      period: sheet.period,
      payrollDetails: {
        basicSalary, allowances, incentives: payrollIncentives,
        deductions: payrollDeductions, advancesDeducted, netSalary,
        period: String(sheet.period || ''),
        status: 'approved'
      }
    });
  });

  // 10. Debt Clearings (تسويات الديون ومقاصة الحسابات)
  (debtClearings || []).forEach(dc => {
    if (isMatched(dc.customerId, dc.customerName, dc.reason) || isMatched(dc.supplierId, dc.supplierName, dc.reason)) {
      allTx.push({
        id: dc.id,
        date: dc.date,
        refNum: dc.clearingNumber || `DC-${dc.id.slice(0, 6)}`,
        type: 'debt_clearing',
        typeLabel: 'تسوية / مقاصة حساب',
        description: dc.reason || 'تسوية حساب مالي ومقاصة',
        entitlement: dc.amount > 0 ? dc.amount : 0,
        advance: 0,
        deduction: 0,
        disbursement: dc.amount < 0 ? Math.abs(dc.amount) : 0
      });
    }
  });

  // 11. Explicitly authorized employee advance adjustments ONLY.
  // A journal line mentioning an employee's name is NOT an employee posting.
  // Ordinary sale/COGS journals belong to the invoice and the general ledger;
  // showing them again here duplicates the invoice in the employee balance.
  (journalEntries || []).forEach(entry => {
    if(entry.referenceType !== 'manual' || entry.referenceId !== empId) return;
    // 1104: employee advances/receivables. Other account lines (sales,
    // revenue, inventory, expense) must never mutate employee subledgers.
    const employeeAdvanceLines = (entry.lines || []).filter(line =>
      line.accountCode === '1104');
    if(!employeeAdvanceLines.length) return;
    if(allTx.some(tx => tx.id === entry.id || tx.refNum === entry.entryNumber)) return;
    const advanceDebit = employeeAdvanceLines.reduce((sum,line) =>
      sum + Number(line.debit || 0),0);
    const advanceCredit = employeeAdvanceLines.reduce((sum,line) =>
      sum + Number(line.credit || 0),0);
    if(advanceDebit === 0 && advanceCredit === 0) return;
    allTx.push({
      id: entry.id,
      date: entry.date,
      refNum: entry.entryNumber,
      type: 'journal_entry',
      typeLabel: 'تسوية يدوية معتمدة لسلفة موظف',
      description: entry.description || 'تسوية سلفة مرتبطة بمعرف الموظف',
      entitlement: advanceCredit,
      advance: 0,
      deduction: 0,
      disbursement: advanceDebit
    });
  });

  // Contractual salary is a rule for creating future payroll, not a posted
  // entitlement. Never synthesize SAL-YYYY-MM movements from the employee's
  // salaryAmount: they lack an approved payroll document and would invent debt.
  // Real salary lines are included above ONLY from approved payroll sheets.

  // Sort chronologically
  allTx.sort((a, b) => a.date.localeCompare(b.date));

  // Compute opening balance before fromDate
  let periodOpeningBalance = 0;
  const filteredTx: RawEmpTx[] = [];

  allTx.forEach(tx => {
    const netChange = tx.entitlement - (tx.advance + tx.deduction + tx.disbursement);
    if (fromDate && tx.date < fromDate) {
      periodOpeningBalance += netChange;
    } else if (!toDate || tx.date <= toDate) {
      filteredTx.push(tx);
    }
  });

  let running = periodOpeningBalance;
  let totalEntitlements = 0;
  let totalAdvances = 0;
  let totalDeductions = 0;
  let totalDisbursements = 0;

  const rows: EmployeeStatementRow[] = [];

  filteredTx.forEach(tx => {
    const netChange = tx.entitlement - (tx.advance + tx.deduction + tx.disbursement);
    running += netChange;

    totalEntitlements += tx.entitlement;
    totalAdvances += tx.advance;
    totalDeductions += tx.deduction;
    totalDisbursements += tx.disbursement;

    rows.push({
      id: tx.id,
      date: tx.date,
      referenceNumber: tx.refNum,
      type: tx.type,
      typeLabel: tx.typeLabel,
      description: tx.description,
      entitlement: tx.entitlement,
      advance: tx.advance,
      deduction: tx.deduction,
      disbursement: tx.disbursement,
      runningBalance: running,
      paymentMethod: tx.paymentMethod,
      period: tx.period,
      notes: tx.notes,
      invoiceNotes: tx.invoiceNotes,
      items: tx.items,
      subtotal: tx.subtotal,
      discountTotal: tx.discountTotal,
      taxAmount: tx.taxAmount,
      additionalCharges: tx.additionalCharges,
      totalAmount: tx.totalAmount,
      paidAmount: tx.paidAmount,
      remainingAmount: tx.remainingAmount,
      invoiceCurrency: tx.invoiceCurrency,
      payrollDetails: tx.payrollDetails
    });
  });

  const totalDue = totalEntitlements;
  const totalPaid = totalAdvances + totalDeductions + totalDisbursements;

  return {
    employee,
    fromDate,
    toDate,
    openingBalance: periodOpeningBalance,
    rows,
    totalEntitlements,
    totalAdvances,
    totalDeductions,
    totalDisbursements,
    totalDue,
    totalPaid,
    closingBalance: running,
    statementDate: new Date().toISOString().split('T')[0]
  };
}

/**
 * Export Party Statement to CSV format (UTF-8 with BOM for Arabic Excel compatibility)
 */
export function exportStatementToCSV(statement: StatementResult, currencySymbol: string = '₪'): void {
  const isCust = statement.party.type === 'customer';
  const headers = [
    'م',
    'التاريخ',
    'رقم المرجع',
    'نوع الحركة',
    'البيان والتفاصيل',
    isCust ? `السحوبات (${currencySymbol})` : `التوريدات (${currencySymbol})`,
    isCust ? `المقبوضات (${currencySymbol})` : `الصرف والمسدد (${currencySymbol})`,
    `الرصيد التراكمي (${currencySymbol})`
  ];

  const rows = statement.rows.map((r, idx) => [
    idx + 1,
    r.date,
    r.referenceNumber,
    `"${r.typeLabel.replace(/"/g, '""')}"`,
    `"${(r.invoiceNotes ? `${r.description} [ملاحظة: ${r.invoiceNotes}]` : r.description).replace(/"/g, '""')}"`,
    r.debit > 0 ? r.debit.toFixed(2) : '0.00',
    r.credit > 0 ? r.credit.toFixed(2) : '0.00',
    r.runningBalance.toFixed(2)
  ]);

  // The CSV, like the printable statement, contains exactly one opening
  // line, followed by dated movements. It must NOT repeat the same opening
  // as a second financial entry in the totals.
  const carriedOpeningRow = [
    '-',
    statement.fromDate || 'بداية التعامل',
    '',
    '"رصيد افتتاحي سابق مدور"',
    '"الرصيد ما قبل تاريخ الكشف"',
    statement.openingBalance > 0 ? statement.openingBalance.toFixed(2) : '0.00',
    statement.openingBalance < 0 ? Math.abs(statement.openingBalance).toFixed(2) : '0.00',
    statement.openingBalance.toFixed(2)
  ];

  const summaryRows = [
    [],
    ['', '', '', 'إجمالي السحوبات / مدين', '', statement.totalDebit.toFixed(2), '', ''],
    ['', '', '', 'إجمالي المقبوضات / دائن', '', '', statement.totalCredit.toFixed(2), ''],
    ['', '', '', 'صافي الرصيد الختامي المستحق', '', '', '', `${statement.closingBalance.toFixed(2)} ${currencySymbol}`]
  ];

  const csvContent = '\uFEFF' + [
    [`"كشف حساب تفصيلي: ${statement.party.name}"`],
    [`"الفترة: ${statement.fromDate || 'البداية'} إلى ${statement.toDate || 'الآن'}"`],
    [`"الرقم الضريبي: ${statement.party.taxNumber || 'غير مسجل'}"`],
    [],
    headers.join(','),
    carriedOpeningRow.join(','),
    ...rows.map(row => row.join(',')),
    ...summaryRows.map(row => row.join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `كشف_حساب_${statement.party.name.replace(/\s+/g, '_')}_${statement.statementDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export Employee Statement to CSV format
 */
export function exportEmployeeStatementToCSV(statement: EmployeeStatementResult, currencySymbol: string = '₪'): void {
  const headers = [
    'م',
    'التاريخ',
    'رقم المرجع',
    'نوع الحركة',
    'البيان والتفاصيل',
    `المستحقات (${currencySymbol})`,
    `السلف المسحوبة (${currencySymbol})`,
    `الخصومات (${currencySymbol})`,
    `الصرف الفعلي (${currencySymbol})`,
    `الرصيد المتبقي (${currencySymbol})`
  ];

  const rows = statement.rows.map((r, idx) => [
    idx + 1,
    r.date,
    r.referenceNumber,
    `"${r.typeLabel.replace(/"/g, '""')}"`,
    `"${r.description.replace(/"/g, '""')}"`,
    r.entitlement > 0 ? r.entitlement.toFixed(2) : '0.00',
    r.advance > 0 ? r.advance.toFixed(2) : '0.00',
    r.deduction > 0 ? r.deduction.toFixed(2) : '0.00',
    r.disbursement > 0 ? r.disbursement.toFixed(2) : '0.00',
    r.runningBalance.toFixed(2)
  ]);

  const summaryRows = [
    [],
    ['', '', '', 'إجمالي المستحقات والرواتب', '', statement.totalEntitlements.toFixed(2), '', '', '', ''],
    ['', '', '', 'إجمالي السلف المسحوبة', '', '', statement.totalAdvances.toFixed(2), '', '', ''],
    ['', '', '', 'إجمالي الخصومات والجزاءات', '', '', '', statement.totalDeductions.toFixed(2), '', ''],
    ['', '', '', 'إجمالي الصرف الفعلي المسدد', '', '', '', '', statement.totalDisbursements.toFixed(2), ''],
    ['', '', '', 'صافي الرصيد الختامي المتبقي للموظف', '', '', '', '', '', `${statement.closingBalance.toFixed(2)} ${currencySymbol}`]
  ];

  const csvContent = '\uFEFF' + [
    [`"كشف مالي تفصيلي للموظف: ${statement.employee.name}"`],
    [`"الكود: ${statement.employee.code || 'غير محدد'}"`],
    [`"الوظيفة: ${statement.employee.jobTitle || 'موظف'}"`],
    [`"الفترة: ${statement.fromDate || 'البداية'} إلى ${statement.toDate || 'الآن'}"`],
    [],
    headers.join(','),
    ...rows.map(row => row.join(',')),
    ...summaryRows.map(row => row.join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `كشف_مالي_موظف_${statement.employee.name.replace(/\s+/g, '_')}_${statement.statementDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ----------------------------------------------------------------------
// BALANCE RECONCILIATION HELPERS (أدوات دمج ومطابقة الأرصدة)
// ----------------------------------------------------------------------

export interface PartyReconciliationResult {
  partyId: string;
  partyName: string;
  partyCode: string;
  partyType: 'customer' | 'supplier' | 'both';
  isSubCustomer?: boolean;
  openingBalance: number;
  openingBalanceType: 'debit' | 'credit';
  totalDebit: number;
  totalCredit: number;
  calculatedBalance: number;
  storedBalance: number;
  discrepancy: number; // storedBalance - calculatedBalance
  hasMismatch: boolean;
  mismatchReason: string;
  breakdown: {
    openingDebit: number;
    openingCredit: number;
    invoicesDebit: number;
    invoicesCredit: number;
    purchasesCredit: number;
    purchasesDebit: number;
    vouchersReceiptCredit: number;
    vouchersReceiptDebit: number;
    vouchersPaymentDebit: number;
    vouchersPaymentCredit: number;
    salesReturnsCredit: number;
    purchaseReturnsDebit: number;
    printOrdersDebit: number;
    printOrdersCredit: number;
    debtClearingsDebit: number;
    debtClearingsCredit: number;
    journalNet: number;
  };
}

export function calculatePartyTrueBalance(
  party: Party,
  invoices: Invoice[],
  vouchers: PaymentVoucher[],
  purchases: PurchaseInvoice[] = [],
  purchaseReturns: PurchaseReturn[] = [],
  salesReturns: SalesReturn[] = [],
  printOrders: PrintJobOrder[] = [],
  journalEntries: JournalEntry[] = [],
  debtClearings: DebtClearingRecord[] = [],
  subCustomerId?: string,
  subCustomers: Party[] = []
): number {
  const stmt = generateAccountStatement({
    party,
    subCustomerId,
    subCustomers,
    invoices,
    vouchers,
    purchases,
    purchaseReturns,
    salesReturns,
    printOrders,
    journalEntries,
    debtClearings
  });
  return Number(stmt.closingBalance.toFixed(2));
}

export function calculateEmployeeTrueBalance(
  employee: Employee,
  vouchers: PaymentVoucher[] = [],
  advances: EmployeeAdvance[] = [],
  deductions: EmployeeDeduction[] = [],
  incentives: EmployeeIncentive[] = [],
  invoices: Invoice[] = [],
  purchases: PurchaseInvoice[] = [],
  purchaseReturns: PurchaseReturn[] = [],
  salesReturns: SalesReturn[] = [],
  payrollSheets: any[] = [],
  journalEntries: JournalEntry[] = [],
  debtClearings: DebtClearingRecord[] = []
): number {
  const stmt = generateEmployeeStatement({
    employee,
    vouchers,
    advances,
    deductions,
    incentives,
    invoices,
    purchases,
    purchaseReturns,
    salesReturns,
    payrollSheets,
    journalEntries,
    debtClearings
  });
  return Number(stmt.closingBalance.toFixed(2));
}

export function getPartyBalanceReconciliation(
  party: Party,
  invoices: Invoice[],
  vouchers: PaymentVoucher[],
  purchases: PurchaseInvoice[] = [],
  purchaseReturns: PurchaseReturn[] = [],
  salesReturns: SalesReturn[] = [],
  printOrders: PrintJobOrder[] = [],
  journalEntries: JournalEntry[] = [],
  debtClearings: DebtClearingRecord[] = []
): PartyReconciliationResult {
  const stmt = generateAccountStatement({
    party,
    invoices,
    vouchers,
    purchases,
    purchaseReturns,
    salesReturns,
    printOrders,
    journalEntries,
    debtClearings
  });

  const calculatedBalance = Number(stmt.closingBalance.toFixed(2));
  const storedBalance = Number((party.balance || 0).toFixed(2));
  const diff = Number((storedBalance - calculatedBalance).toFixed(2));
  const hasMismatch = Math.abs(diff) >= 0.01;

  let mismatchReason = '';
  if (hasMismatch) {
    if (diff > 0) {
      mismatchReason = `توجد زيادة في الرصيد المسجل بقاعدة البيانات (${storedBalance.toLocaleString('ar-SA')} ر.س) مقارنة بالرصيد المحسوب الفعلي (${calculatedBalance.toLocaleString('ar-SA')} ر.س) بفارق قدره (+${Math.abs(diff).toLocaleString('ar-SA')} ر.س).`;
    } else {
      mismatchReason = `يوجد نقص في الرصيد المسجل بقاعدة البيانات (${storedBalance.toLocaleString('ar-SA')} ر.س) مقارنة بالرصيد المحسوب الفعلي (${calculatedBalance.toLocaleString('ar-SA')} ر.س) بفارق قدره (-${Math.abs(diff).toLocaleString('ar-SA')} ر.س).`;
    }
  } else {
    mismatchReason = 'الرصيد متطابق تماماً مع جميع فواتير البيع والمشتريات وسندات القبض والصرف والرصيد الافتتاحي.';
  }

  let openingDebit = 0;
  let openingCredit = 0;
  let invoicesDebit = 0;
  let invoicesCredit = 0;
  let purchasesCredit = 0;
  let purchasesDebit = 0;
  let vouchersReceiptCredit = 0;
  let vouchersReceiptDebit = 0;
  let vouchersPaymentDebit = 0;
  let vouchersPaymentCredit = 0;
  let salesReturnsCredit = 0;
  let purchaseReturnsDebit = 0;
  let printOrdersDebit = 0;
  let printOrdersCredit = 0;
  let debtClearingsDebit = 0;
  let debtClearingsCredit = 0;
  let journalNet = 0;

  stmt.rows.forEach(r => {
    if (r.type === 'opening') {
      openingDebit += r.debit;
      openingCredit += r.credit;
    } else if (r.type === 'invoice') {
      invoicesDebit += r.debit;
      invoicesCredit += r.credit;
    } else if (r.type === 'purchase') {
      purchasesDebit += r.debit;
      purchasesCredit += r.credit;
    } else if (r.type === 'receipt') {
      vouchersReceiptDebit += r.debit;
      vouchersReceiptCredit += r.credit;
    } else if (r.type === 'payment') {
      vouchersPaymentDebit += r.debit;
      vouchersPaymentCredit += r.credit;
    } else if (r.type === 'sales_return') {
      salesReturnsCredit += r.credit;
    } else if (r.type === 'purchase_return') {
      purchaseReturnsDebit += r.debit;
    } else if (r.type === 'print_order') {
      printOrdersDebit += r.debit;
      printOrdersCredit += r.credit;
    } else if (r.type === 'clearance') {
      debtClearingsDebit += r.debit;
      debtClearingsCredit += r.credit;
    } else if (r.type === 'journal') {
      journalNet += (r.debit - r.credit);
    }
  });

  return {
    partyId: party.id,
    partyName: party.name,
    partyCode: party.code || '',
    partyType: party.type,
    isSubCustomer: party.isSubCustomer,
    openingBalance: Number(party.openingBalance || 0),
    openingBalanceType: party.openingBalanceType || 'debit',
    totalDebit: stmt.totalDebit,
    totalCredit: stmt.totalCredit,
    calculatedBalance,
    storedBalance,
    discrepancy: diff,
    hasMismatch,
    mismatchReason,
    breakdown: {
      openingDebit,
      openingCredit,
      invoicesDebit,
      invoicesCredit,
      purchasesCredit,
      purchasesDebit,
      vouchersReceiptCredit,
      vouchersReceiptDebit,
      vouchersPaymentDebit,
      vouchersPaymentCredit,
      salesReturnsCredit,
      purchaseReturnsDebit,
      printOrdersDebit,
      printOrdersCredit,
      debtClearingsDebit,
      debtClearingsCredit,
      journalNet
    }
  };
}

