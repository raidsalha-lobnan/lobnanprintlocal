import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceTelegramReceipt,splitInvoiceTelegramReceipt} from '../telegram-invoice-format.mjs';

const example={
 invoiceNumber:'INV-0344',date:'2026-11-12',customerName:'مؤسسة 4TDK',
 items:[
  {itemName:'مطبوعات جلدية',notes:'جلد',length:1,width:1,count:4,
   quantity:4,unitPrice:120,total:480,hasDimensions:true,unit:'م²'},
  {itemName:'خدمة توصيل',description:'خدمة توصيل مباشر',
   quantity:1,unitPrice:15,total:15,hasDimensions:false,unit:'خدمة'}
 ],
 totalAmount:495,discountTotal:0,paidAmount:0,remainingAmount:495,
 paymentMethod:'credit',currencySymbol:'₪'
};

test('approved invoice formats as a compact Telegram notice with a note for each relevant item',()=>{
 const result=invoiceTelegramReceipt(example,{mainCustomer:{name:'مؤسسة 4TDK'}});
 for(const expected of [
  '✅ فاتورة بيع معتمدة | INV-0344',
  '📅 12/11/2026','👤 العميل: مؤسسة 4TDK',
  '📦 الأصناف (2):','1. مطبوعات جلدية','📐 1 × 1 × 4 = 4 م²',
  '4 × 120 ₪ = 480 ₪','📝 ملاحظة البند: جلد',
  '2. خدمة توصيل','1 × 15 ₪ = 15 ₪',
  '📝 ملاحظة البند: خدمة توصيل مباشر',
  '💰 الإجمالي: 495 ₪','💳 آجل | المتبقي: 495 ₪'
 ])assert.ok(result.includes(expected),expected);
 for(const excluded of [
  'الخصم: 0','ملاحظات الفاتورة:','ملاحظات السداد:',
  'العميل الفرعي:','صندوق:','لا يوجد دفع','PostgreSQL',
  'معرّف','📐 -','الطول: -'
 ])assert.equal(result.includes(excluded),false,excluded);
});

test('all three optional note types are included exactly where useful',()=>{
 const receipt=invoiceTelegramReceipt({...example,
  notes:'يجب التسليم صباحًا',paymentNotes:'إيداع شيك لاحقًا',
  items:[{...example.items[0],description:'طلب خاص',notes:'قص الزوايا'}]
 },{subCustomer:{name:'مؤسسة 4TDK - الفرع الثاني'},version:2});
 assert.match(receipt,/✏️ فاتورة بيع معدّلة/);
 assert.match(receipt,/👥 الفرعي: مؤسسة 4TDK - الفرع الثاني/);
 assert.match(receipt,/📝 ملاحظات الفاتورة: يجب التسليم صباحًا/);
 assert.match(receipt,/📝 ملاحظة البند: طلب خاص — قص الزوايا/);
 assert.match(receipt,/📝 ملاحظات السداد: إيداع شيك لاحقًا/);
});

test('no repeated note when description and note are the same or equal to item title',()=>{
 const result=invoiceTelegramReceipt({...example,
  items:[{itemName:'خدمة توصيل',description:'خدمة توصيل',
   notes:'خدمة توصيل',quantity:1,unitPrice:15,total:15}]
 });
 assert.equal(result.includes('ملاحظة البند'),false);
});

test('partial cash and bank settlement reports values and named treasuries, plus payment notes',()=>{
 const receipt=invoiceTelegramReceipt({...example,
  totalAmount:500,remainingAmount:280,paidAmount:220,discountTotal:10,
  cashPaidAmount:100,bankPaidAmount:120,cashTreasuryCode:'CASH-1101',
  bankTreasuryCode:'BANK-1102',paymentMethod:'mixed',
  paymentNotes:'قيمة الشيك تستحق لاحقًا'
 },{treasuryNames:{'CASH-1101':'الصندوق الرئيسي','BANK-1102':'البنك الإسلامي'}});
 assert.match(receipt,/🏷️ الخصم: 10 ₪/);
 assert.match(receipt,/💳 المدفوع: 220 ₪ \| المتبقي: 280 ₪/);
 assert.match(receipt,/🏦 السداد: نقدي الصندوق الرئيسي \(100 ₪\) \+ بنكي البنك الإسلامي \(120 ₪\)/);
 assert.match(receipt,/📝 ملاحظات السداد: قيمة الشيك تستحق لاحقًا/);
});

test('fully paid invoice is compact yet retains a nonempty payment note',()=>{
 const receipt=invoiceTelegramReceipt({...example,
  paidAmount:495,remainingAmount:0,paymentMethod:'cash',
  cashPaidAmount:495,cashTreasuryCode:'CASH-1101',paymentNotes:'استلام بواسطة أحمد'
 },{treasuryNames:{'CASH-1101':'الصندوق الرئيسي'}});
 assert.match(receipt,/✅ مسددة بالكامل/);
 assert.match(receipt,/🏦 السداد: نقدي الصندوق الرئيسي \(495 ₪\)/);
 assert.match(receipt,/📝 ملاحظات السداد: استلام بواسطة أحمد/);
 assert.equal(receipt.includes('المتبقي:'),false);
});

test('non-dimensional item shows quantity and price without filler dimensions',()=>{
 const receipt=invoiceTelegramReceipt({...example,items:[{
  itemName:'أقلام',quantity:8,unitPrice:4,total:32,hasDimensions:false
 }]});
 assert.match(receipt,/8 × 4 ₪ = 32 ₪/);
 assert.equal(receipt.includes('📐'),false);
});

test('discounted line does not falsely claim multiplication equals the net amount',()=>{
 const receipt=invoiceTelegramReceipt({...example,items:[{
  itemName:'منتج مخفض',quantity:2,unitPrice:10,total:18,discount:2
 }]});
 assert.match(receipt,/2 × 10 ₪ \| الإجمالي: 18 ₪/);
 assert.match(receipt,/خصم البند: 2 ₪/);
 assert.equal(receipt.includes('2 × 10 ₪ = 18 ₪'),false);
});

test('long receipt preserves each item and all note lines in a multi-message delivery',()=>{
 const items=Array.from({length:60},(_,i)=>({
  itemName:'الصنف '+i,notes:'ملاحظة خاصة '+String(i)+' '.repeat(220),
  quantity:1,unitPrice:i+1,total:i+1
 }));
 const long=invoiceTelegramReceipt({...example,
  notes:'إجمالي الملاحظات',paymentNotes:'ملاحظة السداد الأخيرة',items
 });
 const messages=splitInvoiceTelegramReceipt(long);
 assert.ok(messages.length>1);
 assert.ok(messages.every(x=>x.length<=4096));
 assert.ok(messages.some(x=>x.includes('الصنف 0')));
 assert.ok(messages.some(x=>x.includes('الصنف 59')));
 assert.ok(messages.some(x=>x.includes('إجمالي الملاحظات')));
 assert.ok(messages.at(-1).includes('ملاحظة السداد الأخيرة'));
});

test('never render a hidden internal command id in buyer notification',()=>{
 const receipt=invoiceTelegramReceipt(example,{commandId:'secret-internal-id'});
 assert.equal(receipt.includes('secret-internal-id'),false);
});
