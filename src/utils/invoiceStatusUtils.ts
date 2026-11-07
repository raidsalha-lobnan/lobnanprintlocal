import { InvoicePaymentStatus, PosInvoiceWorkflowStatus, PaymentMethod, Invoice, Treasury } from '../types';

/**
 * التحقق مما إذا كانت الفاتورة مؤهلة للدخول في القيود المحاسبية وحركات المخزون وكشف حساب الزبون.
 * القاعدة الصارمة للمستخدم:
 * "أي فاتورة ليست حالة ( بيع/جديد – جاهز للتسليم – تم التسليم ) لا تدخل ضمن القيود المحاسبية ولا تظهر في الكشف
 * وفي حال تغير أي حالة إلى هذه الحالات تدخل بكشف الزبون وتظهر بالكشف التفصيلي للزبون"
 */
export function isInvoiceAccountingEligible(status?: PosInvoiceWorkflowStatus): boolean {
  if (!status) return true; // الافتراضي بيع جديد
  return status === 'new' || status === 'ready' || status === 'delivered';
}

/**
 * التحقق مما إذا كانت الفاتورة تعد أمر طباعة / تشغيل ورشة
 * القاعدة: (تصميم - بانتظار الاعتماد - طباعة خارجي - طباعة داخلي - جاهز للتسليم)
 */
export function isInvoicePrintOrderCandidate(status?: PosInvoiceWorkflowStatus): boolean {
  if (!status) return false;
  return (
    status === 'design' ||
    status === 'designing' ||
    status === 'pending_approval' ||
    status === 'print_external' ||
    status === 'in_progress_external' ||
    status === 'print_internal' ||
    status === 'in_progress_internal' ||
    status === 'in_progress' ||
    status === 'ready'
  );
}

/**
 * احتساب حالة الدفع بدقة بناءً على المبالغ المدفوعة نقداً أو بنكياً أو الآجل
 * الحالات:
 * 1. غير مدفوع
 * 2. مدفوع نقدا جزئيا
 * 3. مدفوع نقدا بالكامل
 * 4. مدفوع بنكي جزئيا
 * 5. مدفوع بنكي بالكامل
 * 6. مدفوع نقدي وبنكي
 * 7. آجل
 */
export function computeInvoicePaymentStatus(params: {
  paymentMethod?: PaymentMethod;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  cashPaidAmount?: number;
  bankPaidAmount?: number;
  explicitPaymentStatus?: InvoicePaymentStatus;
}): InvoicePaymentStatus {
  const method = params.paymentMethod || 'cash';
  const cashPaid = Number(params.cashPaidAmount || 0);
  const bankPaid = Number(params.bankPaidAmount || 0);

  if (params.explicitPaymentStatus) {
    // التصحيح الذكي في حال وجود تعارض بين حالة الدفع المخزنة وطريقة الدفع الفعلية
    if (params.explicitPaymentStatus === 'paid_cash' && (method === 'card' || method === 'bank_transfer' || bankPaid > 0)) {
      return 'paid_bank';
    }
    if (params.explicitPaymentStatus === 'paid_bank' && (method === 'cash' || (cashPaid > 0 && bankPaid <= 0))) {
      return 'paid_cash';
    }
    return params.explicitPaymentStatus;
  }

  const total = Number(params.totalAmount || 0);
  const paid = Number(params.paidAmount || 0);
  const remaining = params.remainingAmount !== undefined ? Number(params.remainingAmount) : Math.max(0, total - paid);

  // إذا كانت طريقة الدفع آجل صريحة والمبلغ المدفوع صفر
  if (method === 'credit' && paid <= 0) {
    return 'credit';
  }

  // إذا لم يُدفع أي شيء
  if (paid <= 0) {
    return method === 'credit' ? 'credit' : 'unpaid';
  }

  // دفع مشترك: نقدي وبنكي معاً
  if (cashPaid > 0 && bankPaid > 0) {
    return 'paid_cash_bank';
  }

  // دفع بنكي فقط
  if (bankPaid > 0 || (cashPaid <= 0 && (method === 'card' || method === 'bank_transfer'))) {
    if (remaining <= 0 || paid >= total) {
      return 'paid_bank';
    }
    return 'partially_paid_bank';
  }

  // دفع نقدي فقط
  if (cashPaid > 0 || method === 'cash') {
    if (remaining <= 0 || paid >= total) {
      return 'paid_cash';
    }
    return 'partially_paid_cash';
  }

  if (remaining <= 0 && total > 0) {
    return 'paid_cash';
  }

  return 'unpaid';
}

export interface InvoiceTreasuryDisplay {
  label: string;
  badgeClass: string;
  iconType: 'cash' | 'bank' | 'wallet' | 'credit';
  accountCode: string;
}

/**
 * دالة موحدة لعرض الصندوق / الخزينة المرتبطة بالفاتورة بشكل متطابق في كافة الشاشات والتقارير
 */
export function getInvoiceTreasuryDisplay(inv: Invoice, treasuries: Treasury[] = []): InvoiceTreasuryDisplay {
  const isCredit = inv.paymentMethod === 'credit' || (!inv.paidAmount && (inv.remainingAmount ?? inv.totalAmount) === inv.totalAmount);

  if (isCredit) {
    return {
      label: '- آجل (ذمم مدينة)',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      iconType: 'credit',
      accountCode: 'credit'
    };
  }

  const hasCash = (inv.cashPaidAmount && inv.cashPaidAmount > 0) || inv.paymentMethod === 'cash';
  const hasBank = (inv.bankPaidAmount && inv.bankPaidAmount > 0) || inv.paymentMethod === 'card' || (inv.paymentMethod as string) === 'bank_transfer';

  // Split payment (مختلط: نقد + شبكة)
  if (hasCash && hasBank && (inv.cashPaidAmount || 0) > 0 && (inv.bankPaidAmount || 0) > 0) {
    const cashCode = inv.cashTreasuryCode || '1101';
    let bankCode = inv.bankTreasuryCode || '1103';
    if (bankCode === '1102' && !treasuries.some(t => t.accountCode === '1102' || t.id === '1102')) {
      bankCode = '1103';
    }
    const cashMatch = treasuries.find(t => t.accountCode === cashCode || t.id === cashCode);
    let bankMatch = treasuries.find(t => t.accountCode === bankCode || t.id === bankCode);
    if (!bankMatch) {
      bankMatch = treasuries.find(t => t.type === 'bank_app' || t.type === 'bank_account' || t.type === 'pos_terminal');
    }
    const cashName = cashMatch ? cashMatch.name : 'الصندوق النقدي (الخزينة الرئيسية)';
    const bankName = bankMatch ? bankMatch.name : 'رائد صالحة - ال باي - جوال باي - مال شات';
    return {
      label: `نقد (${inv.cashPaidAmount}₪) + شبكة (${inv.bankPaidAmount}₪)`,
      badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
      iconType: 'bank',
      accountCode: bankCode
    };
  }

  // Pure Cash
  if (inv.paymentMethod === 'cash' || (hasCash && !hasBank)) {
    const cashCode = inv.cashTreasuryCode || (inv as any).treasuryAccountCode || '1101';
    const match = treasuries.find(t => t.accountCode === cashCode || t.id === cashCode);
    const name = match ? match.name : 'الصندوق النقدي (الخزينة الرئيسية)';
    return {
      label: name,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      iconType: 'cash',
      accountCode: cashCode
    };
  }

  // Pure Card / Bank / Electronic / Digital Wallet
  if (inv.paymentMethod === 'card' || (inv.paymentMethod as string) === 'bank_transfer' || hasBank) {
    let bankCode = inv.bankTreasuryCode || (inv as any).treasuryAccountCode || '1103';
    let match = treasuries.find(t => t.accountCode === bankCode || t.id === bankCode);
    if (!match && bankCode === '1102') {
      match = treasuries.find(t => t.accountCode === '1103') || treasuries.find(t => t.accountCode === '1105');
    }
    if (!match) {
      match = treasuries.find(t => t.type === 'bank_app' || t.type === 'bank_account' || t.type === 'pos_terminal');
    }
    const name = match ? match.name : 'رائد صالحة - ال باي - جوال باي - مال شات';
    const code = match ? match.accountCode : (bankCode || '1103');
    const isWallet = code === '1103' || code === '1104' || name.includes('باي') || name.includes('محفظة');
    return {
      label: name,
      badgeClass: isWallet ? 'bg-cyan-50 text-cyan-800 border-cyan-200' : 'bg-blue-50 text-blue-800 border-blue-200',
      iconType: isWallet ? 'wallet' : 'bank',
      accountCode: code
    };
  }

  return {
    label: '- آجل (ذمم مدينة)',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    iconType: 'credit',
    accountCode: 'credit'
  };
}

export interface InvoicePaymentStatusMeta {
  id: InvoicePaymentStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  bgColor: string;
  color: string;
  borderColor: string;
  description: string;
}

/**
 * بيانات واجهة حالة الدفع (تسمية، ألوان البادج، والأيقونة المناسبة)
 */
export function getInvoicePaymentStatusMeta(status?: InvoicePaymentStatus): InvoicePaymentStatusMeta {
  switch (status) {
    case 'paid_cash':
      return {
        id: 'paid_cash',
        label: 'مدفوع نقداً بالكامل',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-900',
        badgeBorder: 'border-emerald-300',
        bgColor: 'bg-emerald-100',
        color: 'text-emerald-900',
        borderColor: 'border-emerald-300',
        description: 'تم تسديد كامل قيمة الفاتورة نقداً'
      };
    case 'partially_paid_cash':
      return {
        id: 'partially_paid_cash',
        label: 'مدفوع نقداً جزئياً',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-900',
        badgeBorder: 'border-amber-300',
        bgColor: 'bg-amber-100',
        color: 'text-amber-900',
        borderColor: 'border-amber-300',
        description: 'تم استلام دفعة نقدية ومتبقي جزء'
      };
    case 'paid_bank':
      return {
        id: 'paid_bank',
        label: 'مدفوع بنكياً بالكامل',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-900',
        badgeBorder: 'border-blue-300',
        bgColor: 'bg-blue-100',
        color: 'text-blue-900',
        borderColor: 'border-blue-300',
        description: 'تم تسديد كامل القيمة عبر البنك أو الشبكة'
      };
    case 'partially_paid_bank':
      return {
        id: 'partially_paid_bank',
        label: 'مدفوع بنكياً جزئياً',
        badgeBg: 'bg-cyan-100',
        badgeText: 'text-cyan-900',
        badgeBorder: 'border-cyan-300',
        bgColor: 'bg-cyan-100',
        color: 'text-cyan-900',
        borderColor: 'border-cyan-300',
        description: 'تم استلام دفعة عبر البنك ومتبقي جزء'
      };
    case 'paid_cash_bank':
      return {
        id: 'paid_cash_bank',
        label: 'مدفوع نقدي وبنكي',
        badgeBg: 'bg-indigo-100',
        badgeText: 'text-indigo-900',
        badgeBorder: 'border-indigo-300',
        bgColor: 'bg-indigo-100',
        color: 'text-indigo-900',
        borderColor: 'border-indigo-300',
        description: 'تم سداد دفعة نقدية ودفعة بنكية معاً'
      };
    case 'credit':
      return {
        id: 'credit',
        label: 'آجل',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-900',
        badgeBorder: 'border-purple-300',
        bgColor: 'bg-purple-100',
        color: 'text-purple-900',
        borderColor: 'border-purple-300',
        description: 'فاتورة مؤجلة السداد على حساب العميل'
      };
    case 'unpaid':
    default:
      return {
        id: 'unpaid',
        label: 'غير مدفوع',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-900',
        badgeBorder: 'border-rose-300',
        bgColor: 'bg-rose-100',
        color: 'text-rose-900',
        borderColor: 'border-rose-300',
        description: 'لم يتم استلام أي مبالغ سداد'
      };
  }
}

export interface InvoiceWorkflowStatusMeta {
  id: PosInvoiceWorkflowStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  bgColor: string;
  color: string;
  borderColor: string;
  isAccounting: boolean;
  description: string;
}

/**
 * بيانات واجهة حالة الفاتورة التشغيلية
 */
export function getInvoiceWorkflowStatusMeta(status?: PosInvoiceWorkflowStatus): InvoiceWorkflowStatusMeta {
  const getRaw = () => {
    switch (status as any) {
      case 'draft':
        return {
          id: 'draft' as PosInvoiceWorkflowStatus,
          label: 'مسودة محفوظة 📝',
          badgeBg: 'bg-amber-100',
          badgeText: 'text-amber-900',
          badgeBorder: 'border-amber-400',
          isAccounting: false,
          description: 'مسودة فاتورة محفوظة للمراجعة والاعتماد'
        };
      case 'new':
        return {
          id: 'new' as PosInvoiceWorkflowStatus,
          label: 'جديد (فاتورة بيع مباشرة)',
          badgeBg: 'bg-blue-100',
          badgeText: 'text-blue-900',
          badgeBorder: 'border-blue-300',
          isAccounting: true,
          description: 'فاتورة مباشرة تدخل مباشرة ضمن القيود المحاسبية'
        };
      case 'quotation':
        return {
          id: 'quotation' as PosInvoiceWorkflowStatus,
          label: 'عرض سعر',
          badgeBg: 'bg-teal-100',
          badgeText: 'text-teal-900',
          badgeBorder: 'border-teal-300',
          isAccounting: false,
          description: 'لا يظهر إلا بالكاشير ولا يتم اعتماده داخل أي حسابات أو صرف مخزون'
        };
      case 'design':
      case 'designing':
        return {
          id: 'design' as PosInvoiceWorkflowStatus,
          label: 'تصميم',
          badgeBg: 'bg-purple-100',
          badgeText: 'text-purple-900',
          badgeBorder: 'border-purple-300',
          isAccounting: false,
          description: 'تذهب للمصمم دون أن تدخل الحسابات حتى تحويلها لجاهزة للتسليم'
        };
      case 'pending_approval':
        return {
          id: 'pending_approval' as PosInvoiceWorkflowStatus,
          label: 'بانتظار الاعتماد',
          badgeBg: 'bg-amber-100',
          badgeText: 'text-amber-900',
          badgeBorder: 'border-amber-300',
          isAccounting: false,
          description: 'تنتظر موافقة الزبون دون دخول القيود المحاسبية'
        };
      case 'print_external':
      case 'in_progress_external':
        return {
          id: 'print_external' as PosInvoiceWorkflowStatus,
          label: 'طباعة خارجي',
          badgeBg: 'bg-sky-100',
          badgeText: 'text-sky-900',
          badgeBorder: 'border-sky-300',
          isAccounting: false,
          description: 'قيد التنفيذ خارج المطبعة (أمر توريد خارجي)'
        };
      case 'print_internal':
      case 'in_progress_internal':
      case 'in_progress':
        return {
          id: 'print_internal' as PosInvoiceWorkflowStatus,
          label: 'طباعة داخلي',
          badgeBg: 'bg-indigo-100',
          badgeText: 'text-indigo-900',
          badgeBorder: 'border-indigo-300',
          isAccounting: false,
          description: 'قيد التنفيذ داخل ورشة المطبعة دون حسابات حتى تجهز'
        };
      case 'ready':
        return {
          id: 'ready' as PosInvoiceWorkflowStatus,
          label: 'جاهز للتسليم',
          badgeBg: 'bg-emerald-100',
          badgeText: 'text-emerald-900',
          badgeBorder: 'border-emerald-300',
          isAccounting: true,
          description: 'تدخل القيود المحاسبية حتى لو لم تكن مدفوعة وضمن اسم الزبون'
        };
      case 'delivered':
        return {
          id: 'delivered' as PosInvoiceWorkflowStatus,
          label: 'تم التسليم',
          badgeBg: 'bg-slate-200',
          badgeText: 'text-slate-900',
          badgeBorder: 'border-slate-400',
          isAccounting: true,
          description: 'تخرج من أوامر الطباعة وتدخل القيود المحاسبية'
        };
      case 'deferred':
        return {
          id: 'deferred' as PosInvoiceWorkflowStatus,
          label: 'مؤجل',
          badgeBg: 'bg-orange-100',
          badgeText: 'text-orange-900',
          badgeBorder: 'border-orange-300',
          isAccounting: false,
          description: 'لا تدخل القيود وتظهر فقط في كشف الحالات'
        };
      case 'paused':
        return {
          id: 'paused' as PosInvoiceWorkflowStatus,
          label: 'متوقف',
          badgeBg: 'bg-rose-100',
          badgeText: 'text-rose-900',
          badgeBorder: 'border-rose-300',
          isAccounting: false,
          description: 'توقف العمل بها'
        };
      case 'editing':
        return {
          id: 'editing' as PosInvoiceWorkflowStatus,
          label: 'تعديل',
          badgeBg: 'bg-yellow-100',
          badgeText: 'text-yellow-900',
          badgeBorder: 'border-yellow-300',
          isAccounting: false,
          description: 'متوقفة للتعديل'
        };
      case 'cancelled':
        return {
          id: 'cancelled' as PosInvoiceWorkflowStatus,
          label: 'إلغاء',
          badgeBg: 'bg-gray-200',
          badgeText: 'text-gray-800',
          badgeBorder: 'border-gray-400',
          isAccounting: false,
          description: 'ملغاة'
        };
      default:
        return {
          id: 'new' as PosInvoiceWorkflowStatus,
          label: 'جديد (فاتورة بيع مباشرة)',
          badgeBg: 'bg-blue-100',
          badgeText: 'text-blue-900',
          badgeBorder: 'border-blue-300',
          isAccounting: true,
          description: 'فاتورة مباشرة تدخل القيود المحاسبية'
        };
    }
  };

  const raw = getRaw();
  return {
    ...raw,
    bgColor: raw.badgeBg,
    color: raw.badgeText,
    borderColor: raw.badgeBorder
  };
}

/**
 * قائمة خيارات حالة الدفع المعيارية
 */
export const PAYMENT_STATUS_OPTIONS: Array<{
  id: InvoicePaymentStatus;
  label: string;
  description: string;
}> = [
  { id: 'unpaid', label: 'غير مدفوع', description: 'لم يتم استلام أي مبلغ' },
  { id: 'partially_paid_cash', label: 'مدفوع نقداً جزئياً', description: 'تم استلام دفعة نقدية ومتبقي جزء' },
  { id: 'paid_cash', label: 'مدفوع نقداً بالكامل', description: 'تم تسديد كامل قيمة الفاتورة نقداً' },
  { id: 'partially_paid_bank', label: 'مدفوع بنكياً جزئياً', description: 'تم استلام دفعة عبر البنك/الشبكة ومتبقي جزء' },
  { id: 'paid_bank', label: 'مدفوع بنكياً بالكامل', description: 'تم تسديد كامل القيمة عبر البنك أو الشبكة' },
  { id: 'paid_cash_bank', label: 'مدفوع نقدي وبنكي', description: 'تم سداد دفعة نقدية ودفعة بنكية معاً' },
  { id: 'credit', label: 'آجل', description: 'فاتورة مؤجلة السداد على حساب العميل' }
];

/**
 * قائمة خيارات حالة الفاتورة التشغيلية المعيارية
 */
export const WORKFLOW_STATUS_OPTIONS: Array<{
  id: PosInvoiceWorkflowStatus;
  label: string;
  description: string;
  isAccounting: boolean;
}> = [
  { id: 'new', label: 'جديد', description: 'فاتورة مباشرة تدخل مباشرة ضمن القيود المحاسبية', isAccounting: true },
  { id: 'quotation', label: 'عرض سعر', description: 'لا يظهر إلا بالكاشير ولا يتم اعتماده بالحسابات أو المخزون', isAccounting: false },
  { id: 'design', label: 'تصميم', description: 'تذهب للمصمم دون حسابات أو مخزون إلا حين تجهز للتسليم', isAccounting: false },
  { id: 'pending_approval', label: 'بانتظار الاعتماد', description: 'تنتظر موافقة الزبون دون حسابات أو مخزون', isAccounting: false },
  { id: 'print_external', label: 'طباعة خارجي', description: 'قيد التنفيذ خارج المطبعة (أمر توريد خارجي)', isAccounting: false },
  { id: 'print_internal', label: 'طباعة داخلي', description: 'قيد التنفيذ داخل ورشة المطبعة دون حسابات حتى تجهز', isAccounting: false },
  { id: 'ready', label: 'جاهز للتسليم', description: 'تدخل القيود المحاسبية وكشف الزبون حتى لو لم تدفع', isAccounting: true },
  { id: 'delivered', label: 'تم التسليم', description: 'تخرج من أوامر الطباعة وتدخل القيود المحاسبية', isAccounting: true },
  { id: 'deferred', label: 'مؤجل', description: 'لا تدخل القيود وتظهر فقط في كشف الحالات', isAccounting: false },
  { id: 'paused', label: 'متوقف', description: 'توقف العمل بها', isAccounting: false },
  { id: 'editing', label: 'تعديل', description: 'توقف العمل بها للتعديل', isAccounting: false },
  { id: 'cancelled', label: 'إلغاء', description: 'ملغاة نهائياً', isAccounting: false }
];
