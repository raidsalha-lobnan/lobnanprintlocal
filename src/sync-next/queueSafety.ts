import type {SyncCommand} from './types';

const FINANCIAL_OR_IDENTITY = new Set([
  'invoices','parties','vouchers','journalEntries','purchases',
  'purchaseReturns','salesReturns','stockMovements','treasuryTransactions',
  'treasuries','accounts','inventory','printOrders','payrollSheets','debtClearings',
]);

export type QueueSafetyClassification = {
  code: 'owner' | 'permission' | 'party-bulk' | 'invoice-number' | 'financial' | 'other';
  advice: string;
  allowRenumber: boolean;
  allowRetry: boolean;
  allowDiscard: boolean;
};

/** UI-only guardrails. These checks never change the IndexedDB outbox or
 * PostgreSQL. Financial decisions require verified authoritative comparison. */
export function classifyQueueSafety(cmd:SyncCommand):QueueSafetyClassification {
  const error=String(cmd.error || '');
  const protectedEntity=cmd.changes.some(change=>FINANCIAL_OR_IDENTITY.has(change.entity));
  if(/COMMAND_OWNER_MISMATCH|INVOICE_REVISION_WRONG_OWNER|OUTBOX_WAITING_FOR_ORIGINAL_USER_SESSION/i.test(error)){
    return {
      code:'owner',
      advice:'هذه الحركة أُنشئت في جلسة مستخدم آخر على الجهاز. لا تعِد إرسالها بحسابك ولا تحذفها. ادخل بحساب منشئ الحركة لاستكمال المزامنة مع PostgreSQL.',
      allowRenumber:false,allowRetry:false,allowDiscard:false,
    };
  }
  if(/ENTITY_PERMISSION_DENIED|ACCESS_DENIED|403\b/i.test(error)) {
    return {
      code:'permission',
      advice:'رفض صلاحية: لا تغيّر رقم الفاتورة ولا تعِد إرسالها. احفظ نسخة الطابور وقارن العملية بسجل PostgreSQL المعتمد؛ راجع صلاحية الحساب ونوع التعديل.',
      allowRenumber:false,allowRetry:false,allowDiscard:false,
    };
  }
  if(/BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION/i.test(error)) {
    return {
      code:'party-bulk',
      advice:'حماية الأرصدة: تم منع تحديث جماعي للعملاء أو الموردين. لا تكرر الإرسال ولا تحذف الحركة قبل مقارنة السجلات؛ التسوية يجب أن تتم من دفتر القيود.',
      allowRenumber:false,allowRetry:false,allowDiscard:false,
    };
  }
  if(cmd.status==='rejected' && protectedEntity){
    return {
      code:'financial',
      advice:'عملية مالية مرفوضة: راجع النسخة المعتمدة والصلاحيات أولًا. إعادة الترقيم أو حذف نسخة الجهاز قد يسبب فقدان اختلاف محاسبي.',
      allowRenumber:false,allowRetry:false,allowDiscard:false,
    };
  }
  // Deliberate and very narrow: never interpret a generic 409, version conflict,
  // or authorization error as an invoice-number collision.
  const numberCollision=cmd.status==='conflict'
    && cmd.changes.length===1
    && cmd.changes[0].entity==='invoices'
    && /(?:INVOICE_NUMBER_CONFLICT|DUPLICATE_INVOICE_NUMBER|INVOICE_NUMBER_ALREADY_EXISTS)/i.test(error);
  if(numberCollision) {
    return {
      code:'invoice-number',
      advice:'يوجد تعارض موثق في رقم الفاتورة. قارن العملية مع الخادم قبل اختيار إجراء إعادة الترقيم.',
      allowRenumber:false,allowRetry:false,allowDiscard:false,
    };
  }
  if(protectedEntity && cmd.status!=='pending') {
    return {
      code:'financial',
      advice:'عملية محاسبية تحتاج مراجعة أصلها في PostgreSQL. لا يجوز إعادة المحاولة أو حذف السجل اعتمادًا على رمز الخطأ وحده.',
      allowRenumber:false,allowRetry:false,allowDiscard:false,
    };
  }
  return {
    code:'other',advice:'',
    allowRenumber:false,
    allowRetry:cmd.status==='conflict',
    allowDiscard:cmd.status==='rejected' && !protectedEntity,
  };
}
