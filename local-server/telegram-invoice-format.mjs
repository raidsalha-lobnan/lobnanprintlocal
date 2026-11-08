// Plain-text, escaped-by-construction (no HTML parse mode) invoice receipt.
// Read ONLY from transactionally committed sync_telegram_outbox changes.
const plain=(value,max=300)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const amount=(v)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:0}):'-';
const money=(v,currency)=>amount(v)+' '+currency;
const present=(v)=>v!==null&&v!==undefined&&String(v).trim()!=='';
const number=(v,fallback='-')=>present(v)?plain(v,60):fallback;
const field=(v)=>present(v)?plain(v,500):'-';
const bool=(v)=>v===true;
export function invoiceTelegramReceipt(invoice,{mainCustomer,subCustomer,treasuryNames={},commitDate,version,commandId}={}){
 if(!invoice||!invoice.invoiceNumber)throw new Error('INVOICE_RECEIPT_MISSING_OFFICIAL_NUMBER');
 const curr=plain(invoice.currencySymbol||invoice.currency||'₪',8);
 const method=String(invoice.paymentMethod||'');
 const methodLabel={
  credit:'آجل',cash:'نقدًا',card:'بطاقة/شبكة',
  bank_transfer:'تحويل بنكي',transfer:'تحويل بنكي',
  mixed:'مختلط',cheque:'شيك'
 }[method]||field(invoice.paymentMethod);
 const primary=field(mainCustomer?.name||invoice.customerName||invoice.customerDisplayName);
 const secondary=field(subCustomer?.name||invoice.subCustomerName||invoice.subCustomerDisplayName);
 const items=Array.isArray(invoice.items)?invoice.items:[];
 const header=[
  '✅ تم الحفظ بنجاح في قاعدة البيانات المركزية',
  'مطبعة ومكتبة لبنان',
  '',
  '🧾 فاتورة مبيعات رقم: '+plain(invoice.invoiceNumber,80),
  'نوع العملية: '+((Number(version||1)>1)?'تعديل فاتورة معتمد':'فاتورة جديدة معتمدة'),
  'تاريخ الفاتورة: '+field(invoice.date||invoice.invoiceDate),
  'الزبون الرئيسي: '+primary,
  'الزبون الفرعي: '+secondary,
  ...(present(invoice.notes)?['ملاحظات الفاتورة: '+field(invoice.notes)]:[]),
  '',
  '📦 بنود الفاتورة ('+items.length+'):'
 ];
 const isDimension=(it)=>it.hasDimensions===true || (it.hasDimensions!==false && /(?:م²|م2|متر مربع|m²|m2|sqm|square meter)/i.test(String(it.unit||'')));
 const lines=items.flatMap((it,i)=>[
  '',
  'بند '+(i+1)+' | '+field(it.itemName||it.name||it.itemCode),
  '  الملاحظات: '+field(it.notes||it.description),
  '  الطول: '+(isDimension(it)?number(it.length):'-')+(isDimension(it)&&present(it.lengthUnit)?' '+plain(it.lengthUnit,15):'')+
    ' | العرض: '+(isDimension(it)?number(it.width):'-')+(isDimension(it)&&present(it.widthUnit)?' '+plain(it.widthUnit,15):''),
  '  العدد: '+(isDimension(it)?number(it.count,'1'):'-')+' | الكمية: '+number(it.quantity,'0'),
  '  السعر: '+money(it.unitPrice,curr)+' | الإجمالي: '+money(it.total??(Number(it.quantity||0)*Number(it.unitPrice||0)),curr),
  ...(Number(it.discount||0)>0?['  خصم البند: '+money(it.discount,curr)]:[])
 ]);
 const discount=Number(invoice.discountTotal??invoice.discountAmount??0);
 const hasDiscount=discount>0||items.some(it=>Number(it.discount||0)>0);
 const paid=Number(invoice.paidAmount??invoice.basePaidAmount??0);
 const cash=Number(invoice.cashPaidAmount||0),bank=Number(invoice.bankPaidAmount||0);
 const cashCode=invoice.cashTreasuryCode||invoice.treasuryAccountCode||'';
 const bankCode=invoice.bankTreasuryCode||invoice.treasuryAccountCode||'';
 const name=(code)=>treasuryNames[code]||code||'-';
 const treasury=(cash>0&&bank>0)?
  name(cashCode)+' ('+money(cash,curr)+') + '+name(bankCode)+' ('+money(bank,curr)+')':
  method==='credit'&&paid===0?'لا يوجد دفع - آجل':
  bank>0||['card','bank_transfer','transfer'].includes(method)?name(bankCode):name(cashCode);
 const footer=[
  '',
  '──────────────',
  '💰 إجمالي الفاتورة: '+money(invoice.totalAmount,curr),
  'الخصم: '+(hasDiscount?'نعم - '+money(discount,curr):'لا يوجد خصم'),
  'طريقة الدفع: '+methodLabel,
  'المبلغ المدفوع: '+money(paid,curr),
  'صندوق الدفع: '+field(treasury),
  'ملاحظات الدفع: '+field(invoice.paymentNotes||invoice.paymentNote||invoice.paymentDescription||invoice.paymentRemark),
  'المبلغ المتبقي: '+money(invoice.remainingAmount??Math.max(0,Number(invoice.totalAmount||0)-paid),curr),
  '──────────────',
  '✅ تم اعتماد البيانات في PostgreSQL قبل إرسال الإشعار.',
  ...(present(commandId)?['مرجع المزامنة: '+plain(commandId,100)]:[])
 ];
 return [...header,...lines,...footer].join('\n');
}
/** Telegram Bot API accepts a maximum of 4096 characters per message.
 * Never silently omit an item or truncate financial details. */
export function splitInvoiceTelegramReceipt(text,max=3900){
 const result=[];let current='';
 for(const line of text.split('\n')){
  if(line.length>max)throw new Error('INVOICE_RECEIPT_LINE_TOO_LONG');
  if(current.length+line.length+1>max){result.push(current);current='';}
  current+=(current?'\n':'')+line;
 }
 if(current)result.push(current);
 return result.map((s,i)=>result.length>1?'('+ (i+1) +'/'+result.length+')\n'+s:s);
}
