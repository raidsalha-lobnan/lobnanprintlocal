import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceTelegramReceipt,splitInvoiceTelegramReceipt} from '../telegram-invoice-format.mjs';
const invoice={
 invoiceNumber:'INV-0071',date:'2026-11-05',
 customerName:'مطبعة السراج - أبو مؤمن هاشم',
 notes:'تسليم صباحاً',
 items:[{itemName:'ورق سبلميشن - مطبوع',notes:'الطباعة على الوجهين',
  length:25,width:35,count:1,quantity:2,unitPrice:4,total:8,hasDimensions:true,unit:'م²'}],
 totalAmount:8,discountTotal:0,paidAmount:0,remainingAmount:8,
 paymentMethod:'credit',currencySymbol:'₪'
};
test('invoice Telegram confirmation has complete fields from committed invoice',()=>{
 const receipt=invoiceTelegramReceipt(invoice,{mainCustomer:{name:'مطبعة السراج - أبو مؤمن هاشم'},
   subCustomer:{name:'فرع المدينة'},version:2,commandId:'cmd-test'});
 for(const expected of ['تم الحفظ بنجاح في قاعدة البيانات المركزية','INV-0071',
  '2026-11-05','الزبون الرئيسي','مطبعة السراج','الزبون الفرعي','فرع المدينة',
  'ملاحظات الفاتورة','تسليم صباحاً','ورق سبلميشن','الطباعة على الوجهين',
  'الطول: 25','العرض: 35','العدد: 1','الكمية: 2','السعر: 4 ₪',
  'الإجمالي: 8 ₪','الخصم: لا يوجد خصم','طريقة الدفع: آجل',
  'المبلغ المدفوع: 0 ₪','صندوق الدفع','ملاحظات الدفع','المبلغ المتبقي: 8 ₪',
  'مرجع المزامنة: cmd-test'])
  assert.ok(receipt.includes(expected),'missing '+expected);
});
test('cash and bank payment shows correct name, value, note and discount',()=>{
 const receipt=invoiceTelegramReceipt({...invoice,paymentMethod:'mixed',
  paidAmount:8,cashPaidAmount:3,bankPaidAmount:5,cashTreasuryCode:'CASH-1101',
  bankTreasuryCode:'CASH-1102',discountTotal:2,paymentNotes:'دفعة شبكية ومبلغ نقدي'},
  {treasuryNames:{'CASH-1101':'الصندوق الرئيسي','CASH-1102':'البنك'}});
 for(const text of ['الخصم: نعم - 2 ₪','الصندوق الرئيسي','البنك','دفعة شبكية ومبلغ نقدي','المبلغ المدفوع: 8 ₪'])
  assert.ok(receipt.includes(text),text);
});
test('all line items retained by splitting long Telegram receipts below Telegram maximum',()=>{
 const long=invoiceTelegramReceipt({...invoice,
  items:Array.from({length:40},(_,i)=>({...invoice.items[0],itemName:'صنف '+i,notes:'توضيح '.repeat(40)}))});
 const chunks=splitInvoiceTelegramReceipt(long);
 assert.ok(chunks.length>1);
 assert.ok(chunks.every(x=>x.length<=4096));
 assert.ok(chunks.some(x=>x.includes('صنف 0')));
 assert.ok(chunks.some(x=>x.includes('صنف 39')));
 assert.ok(chunks.at(-1).includes('إجمالي الفاتورة'));
});

test('non-measured invoice line uses dash for length, width and count but keeps quantity',()=>{
 const receipt=invoiceTelegramReceipt({...invoice,items:[{
  itemName:'ورق مطبوع',notes:'بند عادي',hasDimensions:false,
  unit:'حبة',length:1,width:1,count:1,quantity:8,unitPrice:4,total:32
 }]});
 assert.match(receipt,/الطول: - | العرض: -/);
 assert.match(receipt,/العدد: - | الكمية: 8/);
 assert.match(receipt,/السعر: 4 ₪ | الإجمالي: 32 ₪/);
});
