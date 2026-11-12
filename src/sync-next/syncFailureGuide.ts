/**
 * User-facing handling policy for data synchronization problems.
 * No account balances, prices, party codes, invoice numbers or quantities
 * are ever inferred from an error message.
 */
export type RecoveryKind='automatic-retry'|'automatic-read-merge'|'reopen-authoritative'|'review-ledger'|'fix-input'|'fix-permissions'|'recover-local'|'inspect';
export type FailureGuide={
  kind:RecoveryKind;
  title:string;
  explanation:string;
  nextStep:string;
  safeToRetry:boolean;
};
const mk=(kind:RecoveryKind,title:string,explanation:string,nextStep:string,safeToRetry=false):FailureGuide=>({
  kind,title,explanation,nextStep,safeToRetry
});
export function explainSyncFailure(error:unknown,entity?:string):FailureGuide{
  const raw=String(error||'').toUpperCase();
  if(/INVOICE_REVISION_BASELINE_NEEDS_RECONCILIATION|REVISION_REQUIRES_RECONCILED_JOURNAL_HISTORY|REVISION_DUPLICATE_HISTORY|LEGACY_REPAIR_|FINANCIAL_RECORD_REQUIRES_REVERSAL|POSTED_INVOICE_CORRECTION_REQUIRED|INVOICE_HAS_PENDING_LOCAL_CHANGES/.test(raw))
    return mk('review-ledger','العملية محمية حتى تكتمل المطابقة المحاسبية',
      'الفاتورة أو القيد أو حركة المخزون ليس لها مرجع تاريخي مثبت، أو توجد عملية مالية معلقة على السجل.',
      'يحتفظ البرنامج بالعملية دون ترحيلها مرة ثانية. افحص القيود وحركات المخزون وأصل المستند؛ وأكمل التسوية المعتمدة فقط.');
  if(/COMMAND_OWNER_MISMATCH|INVOICE_REVISION_WRONG_OWNER|OUTBOX_WAITING_FOR_ORIGINAL_USER_SESSION/.test(raw))
    return mk('fix-permissions','العملية تخص مستخدمًا آخر على هذا الجهاز',
      'طابور المتصفح يحتفظ بأمر أنشأه حساب سابق. الخادم يمنع المستخدم الحالي من انتحال صاحب العملية، حتى إن كان لديه صلاحية مشابهة.',
      'لا تحذف العملية ولا تعِد إنشاء الفاتورة أو الصنف. افتح البرنامج بحساب منشئ الأمر الأصلي لاستكمال المزامنة، أو راجع سجل اعتمادها مع مدير النظام.');
  if(/BULK_PARTY_SNAPSHOT_REJECTED/.test(raw))
    return mk('review-ledger','رُفضت قائمة عملاء جماعية قديمة',
      'هذا أمر سابق أرسل نسخًا متعددة من أرصدة وبيانات العملاء دفعة واحدة. يمنع الخادم تطبيقه حمايةً للأرصدة.',
      'يفحص البرنامج العناصر المطابقة لـ PostgreSQL تلقائيًا ويحررها من حظر هذا الأمر فقط. تبقى أي عناصر مختلفة للمراجعة، ويمكن تصدير التقرير من لوحة التعارضات.');
  if(/DUPLICATE_INVOICE_JOURNAL_REJECTED|INVOICE_JOURNAL_REFERENCE_REQUIRED|IDEMPOTENCY_KEY_REUSED/.test(raw))
    return mk('review-ledger','منع تكرار قيد أو عملية سابقة',
      'الخادم اكتشف تسجيلًا سابقًا محتملًا أو طلبًا لا يطابق بصمة العملية الأصلية.',
      'لا تنشئ نسخة جديدة؛ طابِق معرّف العملية وقيود PostgreSQL قبل أي إعادة إرسال.');
  if(/VERSION_CONFLICT|SAME_FIELD_CHANGED_ON_TWO_DEVICES|INVOICE_CONCURRENT_MODIFICATION_REOPEN/.test(raw))
    return mk('reopen-authoritative','تغيّر السجل على جهاز آخر',
      'النسخة المفتوحة لديك أقدم من السجل المعتمد. يدمج محرك المزامنة الحقول الوصفية المنفصلة فقط إذا توفر أساس موثّق.',
      'تُحدّث النسخة المعتمدة. إذا تعارض الحقل نفسه أو مبلغ أو كمية، راجع الفرق دون إعادة كتابة بيانات الجهاز الآخر.');
  if(/RECORD_HAS_UNRESOLVED_CONFLICT|DEPENDENT_OR_MULTIRECORD_TRANSACTION/.test(raw))
    return mk('inspect','هناك عملية سابقة معلقة على السجل نفسه',
      'لا يمكن تمرير كتابة أحدث فوق عملية متعارضة أو غير محسومة.',
      'تُحفظ العمليات حسب ترتيبها؛ تحقق من نتيجة العملية الأقدم أولًا قبل تعديل السجل مجددًا.');
  if(/SERIAL|SKU|CODE_CONFLICT|DUPLICATE.*CODE|CASH_CUSTOMER_IMMUTABLE|OFFICIAL_NUMBER_IMMUTABLE|INVALID_WORKSPACE_SETTINGS_ID|INVOICE_NUMBER_CONFLICT/.test(raw))
    return mk('fix-input','المعرّف أو الكود غير صالح لهذه العملية',
      'رموز العملاء والأصناف والأرقام الرسمية لا يجوز تغيير هويتها أو إعطاؤها رقمًا مكررًا.',
      'احتفظ بمعرّف السجل الداخلي الثابت؛ افحص الكود المعتمد على PostgreSQL قبل اختيار كود جديد غير مستخدم.');
  if(/PARTY_HAS_FINANCIAL_REFERENCES|INVOICE_REVISION_SUBCUSTOMER_PARENT_MISMATCH|INVOICE_REVISION_SUBCUSTOMER_WRONG_TARGET/.test(raw))
    return mk('fix-input','هذا السجل مرتبط بحسابات أخرى',
      'الحذف أو نقل العميل الفرعي قد يفصل فواتير أو سندات عن مرجعها.',
      'احتفظ بالسجل، واستخدم التعطيل أو إجراء نقل موثّق لا يقطع المراجع المحاسبية.');
  if(/ENTITY_PERMISSION_DENIED|ADMIN_REQUIRED|ACCESS_DENIED|INVOICE_REVISION_PERMISSION_DENIED|AUTH_ADMIN_WRITE|403\b|PERMISSION_DENIED/.test(raw))
    return mk('fix-permissions','الصلاحيات لا تسمح بهذه العملية',
      'حساب المستخدم الحالي لا يملك الإذن المطلوب أو الجلسة قد تغيّرت.',
      'يُراجع مدير النظام صلاحية العملية؛ لا تُكرّرها بحساب آخر أو تتجاوز نظام الأدوار.');
  if(/SESSION_LOGIN_REQUIRED|UNAUTHORIZED|401\b|TOKEN_EXPIRED/.test(raw))
    return mk('fix-permissions','انتهت جلسة الدخول',
      'العملية لم تتلق تأكيدًا من الخادم بسبب جلسة دخول منتهية.',
      'أعِد تسجيل الدخول؛ يحتفظ الطابور بالأمر نفسه ومعرّفه قبل استئناف المزامنة.');
  if(/INVALIDSTATEERROR|DATABASE CONNECTION IS CLOSING|LOCAL_STORAGE_SESSION_CLOSED|INDEXEDDB|QUOTAEXCEEDEDERROR/.test(raw))
    return mk('recover-local','التخزين المحلي غير متاح مؤقتًا',
      'اتصال قاعدة المتصفح قد أُغلق أو امتلأت مساحة التخزين.',
      'حافظ على بيانات الموقع، وأغلق التبويبات القديمة ثم أعد فتح البرنامج. لا تكرر حفظ مستند مالي قبل فحص سجل الخادم.');
  if(/(?:HTTP_)?(?:429|500|502|503|504)\b|NETWORK|FAILED TO FETCH|TIMEOUT|ECONN|OFFLINE/.test(raw))
    return mk('automatic-retry','تعذر الوصول إلى الخادم مؤقتًا',
      'قد يكون اتصال الإنترنت أو الخادم مشغولًا. الطابور محفوظ مع معرّف العملية لمنع التكرار.',
      'سيحاول البرنامج إعادة الاتصال تلقائيًا مع تأخير متزايد، دون إنشاء مستند جديد.',true);
  if(/INVALID_|MISSING_|REQUIRES_|OPERATION TOO LARGE|INVALID MONEY|AMOUNT|VALIDATION|422\b/.test(raw))
    return mk('fix-input','بعض البيانات المدخلة لا تستوفي شروط الحفظ',
      'هناك حقل أو مرجع أو مبلغ غير صالح، ومنع الخادم إدخاله بدل إنشاء سجل ناقص.',
      'احتفظ بالمدخلات وصحح الحقل المبيّن في التفاصيل؛ لن يغيّر البرنامج المبالغ تلقائيًا.');
  if(entity==='invoices'||entity==='journalEntries'||entity==='vouchers'||entity==='stockMovements')
    return mk('review-ledger','عملية مالية لم تتلق تأكيدًا',
      'السبب يحتاج مقارنة الطلب مع السجل الرسمي لتجنّب تسجيل قيد مرتين.',
      'لا تُعد إنشاء الفاتورة أو حذف طابور الجهاز؛ افحص السجل المعتمد أولًا.');
  return mk('inspect','العملية تحتاج فحص مزامنة',
    'لم يتعرف البرنامج على السبب بشكل كافٍ ليجري تغييرًا تلقائيًا آمنًا.',
    'احتفظ بالأمر محليًا، وافحص سجل الخطأ والمستند في PostgreSQL. لا تُحذف البيانات تلقائيًا.');
}
