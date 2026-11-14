// Compact Telegram receipt derived ONLY from the committed PostgreSQL invoice.
// Formatting never changes invoices, financial postings, totals or stock.
const plain=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const present=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
const numeric=value=>Number.isFinite(Number(value))?Number(value):0;
const amount=value=>numeric(value).toLocaleString('en-US',{maximumFractionDigits:3,minimumFractionDigits:0});
const money=(value,currency)=>amount(value)+' '+currency;
const precision=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{maximumFractionDigits:4}):'-';
const validNote=value=>present(value)&&!['-','—'].includes(String(value).trim());
const goodName=(value,placeholder='')=>present(value)?plain(value,170):placeholder;
const dateLabel=value=>{
 const str=plain(value,25);
 const match=str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return match?match[3]+'/'+match[2]+'/'+match[1]:str;
};
const nearlyEqual=(a,b)=>Math.abs(Number(a)-Number(b))<0.005;
const isMeasured=item=>item.hasDimensions===true ||
 (item.hasDimensions!==false&&/(?:م²|م2|متر مربع|m²|m2|sqm|square meter)/i.test(String(item.unit||'')));
const paymentMethodLabel={cash:'نقدي',credit:'آجل',card:'بطاقة',bank_transfer:'تحويل بنكي',
 transfer:'تحويل بنكي',mixed:'نقدي وبنكي',cheque:'شيك'};
function lineNotes(item){
 const title=goodName(item.itemName||item.name||item.itemCode);
 const parts=[item.description,item.notes].filter(validNote)
  .map(value=>plain(value,400)).filter(value=>value!==title);
 const unique=[...new Set(parts)];
 return unique.length?'   📝 ملاحظة البند: '+unique.join(' — '):'';
}
function itemLines(item,index,currency){
 const name=goodName(item.itemName||item.name||item.itemCode,'صنف غير مسمى');
 const qty=numeric(item.quantity);
 const unitPrice=numeric(item.unitPrice);
 const lineTotal=item.total===null||item.total===undefined?qty*unitPrice:numeric(item.total);
 const notes=lineNotes(item);
 const out=[(index+1)+'. '+name];
 if(isMeasured(item)&&Number(item.length)>0&&Number(item.width)>0){
  const count=Number(item.count)>0?Number(item.count):1;
  const unit=goodName(item.unit);
  out.push('   📐 '+precision(item.length)+' × '+precision(item.width)+
   ' × '+precision(count)+' = '+precision(qty)+(unit?' '+unit:''));
 }
 const quantityPrice=precision(qty)+' × '+money(unitPrice,currency);
 out.push('   💵 '+quantityPrice+
  (nearlyEqual(qty*unitPrice,lineTotal)?' = ':' | الإجمالي: ')+money(lineTotal,currency));
 if(Number(item.discount)>0)out.push('   خصم البند: '+money(item.discount,currency));
 if(notes)out.push(notes);
 return out;
}
export function invoiceTelegramReceipt(invoice,{
 mainCustomer,subCustomer,treasuryNames={},version
}={}){
 if(!invoice||!invoice.invoiceNumber)throw new Error('INVOICE_RECEIPT_MISSING_OFFICIAL_NUMBER');
 const currency=plain(invoice.currencySymbol||(
  invoice.currency==='ILS'?'₪':invoice.currency||'₪'),8);
 const items=Array.isArray(invoice.items)?invoice.items:[];
 const primary=goodName(mainCustomer?.name||invoice.customerName||invoice.customerDisplayName,'غير محدد');
 const secondary=goodName(subCustomer?.name||invoice.subCustomerName||invoice.subCustomerDisplayName);
 const total=numeric(invoice.totalAmount);
 const paid=numeric(invoice.paidAmount??invoice.basePaidAmount??0);
 const remaining=numeric(invoice.remainingAmount??Math.max(0,total-paid));
 const isRevision=Number(version||1)>1;
 const lines=[
  (isRevision?'✏️ فاتورة بيع معدّلة':'✅ فاتورة بيع معتمدة')+' | '+plain(invoice.invoiceNumber,80),
  ...(present(invoice.date||invoice.invoiceDate)?['📅 '+dateLabel(invoice.date||invoice.invoiceDate)]:[]),
  '👤 العميل: '+primary,
  ...(secondary&&secondary!==primary?['👥 الفرعي: '+secondary]:[]),
  ...(validNote(invoice.notes)?['📝 ملاحظات الفاتورة: '+plain(invoice.notes,1000)]:[]),
  '',
  '📦 الأصناف ('+items.length+'):'
 ];
 items.forEach((item,index)=>{
  if(index>0)lines.push('');
  lines.push(...itemLines(item||{},index,currency));
 });
 lines.push('──────────────');
 lines.push('💰 الإجمالي: '+money(total,currency));
 const discount=numeric(invoice.discountTotal??invoice.discountAmount??0);
 if(discount>0)lines.push('🏷️ الخصم: '+money(discount,currency));
 if(paid<=0&&remaining>0)lines.push('💳 آجل | المتبقي: '+money(remaining,currency));
 else if(remaining<=0&&total>0)lines.push('✅ مسددة بالكامل');
 else lines.push('💳 المدفوع: '+money(paid,currency)+' | المتبقي: '+money(remaining,currency));
 if(paid>0){
  const method=String(invoice.paymentMethod||'');
  const cash=numeric(invoice.cashPaidAmount||0),bank=numeric(invoice.bankPaidAmount||0);
  const cashCode=invoice.cashTreasuryCode||invoice.treasuryAccountCode||'';
  const bankCode=invoice.bankTreasuryCode||invoice.treasuryAccountCode||'';
  const name=code=>goodName(treasuryNames[code]||code);
  const entries=[];
  if(cash>0)entries.push('نقدي '+(name(cashCode)||'')+' ('+money(cash,currency)+')');
  if(bank>0)entries.push('بنكي '+(name(bankCode)||'')+' ('+money(bank,currency)+')');
  if(entries.length)lines.push('🏦 السداد: '+entries.join(' + '));
  else{
   const code=['card','bank_transfer','transfer'].includes(method)?bankCode:cashCode;
   const info=[paymentMethodLabel[method]||'دفع',name(code)].filter(Boolean).join(' — ');
   if(info)lines.push('🏦 السداد: '+info);
  }
 }
 const paymentNote=invoice.paymentNotes||invoice.paymentNote||
  invoice.paymentDescription||invoice.paymentRemark;
 if(validNote(paymentNote))lines.push('📝 ملاحظات السداد: '+plain(paymentNote,1000));
 lines.push('──────────────');
 return lines.join('\n');
}
/** Telegram accepts up to 4096 UTF-16 characters. Split without losing a line. */
export function splitInvoiceTelegramReceipt(text,max=3900){
 const result=[];let current='';
 for(const line of String(text).split('\n')){
  if(line.length>max)throw new Error('INVOICE_RECEIPT_LINE_TOO_LONG');
  if(current.length+line.length+1>max){result.push(current);current='';}
  current+=(current?'\n':'')+line;
 }
 if(current)result.push(current);
 return result.map((s,i)=>result.length>1?'('+(i+1)+'/'+result.length+')\n'+s:s);
}
