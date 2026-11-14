export const TELEGRAM_MINI_POS_URL='https://lobnanprintlocal.vercel.app/telegram-pos';
export const TELEGRAM_MAIN_MENU_LABEL = '📋 القائمة الرئيسية';

export const TELEGRAM_REPORT_COMMANDS = Object.freeze([
  {command:'invoice',description:'فتح الكاشير وإنشاء فاتورة بيع'},
  {command:'menu',description:'عرض القائمة الرئيسية للتقارير'},
  {command:'reports',description:'عرض الكشوفات والتقارير'},
  {command:'start',description:'فتح البوت وإظهار قائمة التقارير'},
  {command:'help',description:'مساعدة وقائمة الأوامر'}
]);

/** The public list is navigation only. Financial data remains protected by the
 * authenticated, permission-checked reporting service.
 */
export function telegramReportsInlineMenu(){
  return {
    inline_keyboard: [
      [{text:'➕ إنشاء فاتورة بيع',web_app:{url:TELEGRAM_MINI_POS_URL}}],
      [
        {text:'📑 كشف حساب عميل',callback_data:'menu_customer_statement'},
        {text:'📑 كشف حساب مورد',callback_data:'menu_supplier_statement'}
      ],
      [
        {text:'📦 أصناف العميل',callback_data:'menu_customer_items'},
        {text:'💰 حركة الخزينة',callback_data:'menu_treasury_report'}
      ],
      [
        {text:'🧾 كشف المبيعات',callback_data:'menu_sales_report'},
        {text:'🛒 كشف المشتريات',callback_data:'menu_purchases_report'}
      ],
      [
        {text:'📊 نواقص المخزون',callback_data:'menu_inventory_report'},
        {text:'💳 كشف المصروفات',callback_data:'menu_expenses_report'}
      ],
      [
        {text:'👤 كشف حساب موظف',callback_data:'menu_employee_statement'},
        {text:'🏠 القائمة الرئيسية',callback_data:'menu_main'}
      ]
    ]
  };
}

export function telegramPersistentMainMenuKeyboard(){
  return {
    keyboard:[[{text:TELEGRAM_MAIN_MENU_LABEL}],[{text:'➕ فاتورة جديدة'}]],
    resize_keyboard:true,
    is_persistent:true,
    one_time_keyboard:false,
    input_field_placeholder:'اضغط القائمة الرئيسية لعرض الكشوفات'
  };
}

export const telegramMenuText = [
  '📋 <b>القائمة الرئيسية — الكشوفات والتقارير</b>',
  '',
  'اختر نوع الكشف من الأزرار التالية.',
  'بعد اختيار كشف عميل أو مورد سيطلب البوت الاسم والفترة.',
  '',
  '🔒 لا يتم إرسال بيانات مالية إلا عبر جلسة برنامج مخوّلة.'
].join('\n');

export function isTelegramMenuMessage(text){
  const normalized=String(text||'').trim().replace(/\s+/g,' ');
  return /^\/(?:start|menu|reports|help)(?:@\w+)?(?:\s.*)?$/i.test(normalized)||
    ['📋 القائمة الرئيسية','القائمة الرئيسية','القائمة','تقارير','التقارير','الكشوفات','قائمة الكشوفات','ابدأ','بدء'].includes(normalized);
}

export function isTelegramStartMessage(text){
  const normalized=String(text||'').trim();
  return /^\/(?:start|subscribe)(?:@\w+)?(?:\s.*)?$/i.test(normalized)||
    ['ابدأ','بدء'].includes(normalized);
}

export function isTelegramQuickInvoiceMessage(value){
 const text=String(value||'').trim();
 return /^\/(?:invoice|sale)(?:@\w+)?(?:\s.*)?$/i.test(text)||
   /^(?:➕\s*)?فاتورة جديدة$/u.test(text)||/^(?:بيع\s+|فاتورة\s+)/u.test(text);
}
export function telegramQuickInvoiceUrl(value){
 const text=String(value||'').trim();
 const normalized=/^(?:بيع|فاتورة)\s+/u.test(text)?text:'';
 return TELEGRAM_MINI_POS_URL+(normalized?'?quick='+encodeURIComponent(normalized.slice(0,180)):'');
}
export function isTelegramMainMenuCallback(callback){
  return String(callback||'')==='menu_main';
}
