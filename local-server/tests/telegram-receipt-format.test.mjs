import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedReceiptTelegramText} from '../telegram-receipt-format.mjs';

const makeRow=({
 amount=150,baseAmount=150,rate=1,currency='ILS',
 currencySymbol='₪',cash=true,sub='المشروع الفرعي',
 partyBalance=350,committedAt='2026-11-16T12:00:00.000Z'
}={})=>{
 const id='vch-immutable-1';
 const account=cash?'CASH-1101':'CASH-1102';
 const lines=[
  {accountCode:cash?'1101':'1102',debit:baseAmount,credit:0},
  {accountCode:'1201',debit:0,credit:baseAmount}
 ];
 return {
  command_id:'receipt-post-immutable-cmd',
  committed_at:new Date(committedAt),
  changes:[
   {entity:'vouchers',id,version:1,value:{
    id,voucherNumber:'RCT-2026-0007',type:'receipt',
    partyId:'customer-9',partyName:'زبون رئيسي قديم',
    subCustomerName:sub,date:'2026-11-16',
    amount,baseAmount,currency,currencySymbol,exchangeRate:rate,
    description:'تسديد جزء من حساب نوفمبر',
    paymentNotes:'إيصال مرجعي 807',
    transferReference:cash?undefined:'حوالة رقم 902',
    treasuryAccountCode:account,paymentMethod:cash?'cash':'bank_transfer'
   }},
   {entity:'journalEntries',id:'je-receipt-'+id,version:1,value:{
    referenceType:'receipt',referenceId:id,lines
   }},
   {entity:'parties',id:'customer-9',version:12,value:{
    type:'customer',name:'الزبون الرئيسي المسجل',balance:partyBalance
   }},
   {entity:'treasuries',id:'treasury-1',version:7,value:{
    name:cash?'الصندوق النقدي الرئيسي':'بنك فلسطين - حساب الشركة',
    accountCode:account,transactions:[
     {id:'tx-receipt-'+id,referenceType:'receipt',referenceId:id,
      amount,baseAmount,baseCurrency:'ILS',paymentMethod:cash?'cash':'bank_transfer'}
    ]
   }},
   {entity:'accounts',id:'account-ar',version:10,value:{code:'1201',balance:2000-baseAmount}}
  ]
 };
};

test('approved cash RCT notification shows all requested fields and committed customer balance',()=>{
 const message=approvedReceiptTelegramText(makeRow());
 for(const exact of [
  '✅ سند قيد معتمد RCT-2026-0007',
  'التاريخ: 16/11/2026',
  'الزبون الرئيسي: الزبون الرئيسي المسجل',
  'الزبون الفرعي: المشروع الفرعي',
  'ملاحظة السند: تسديد جزء من حساب نوفمبر',
  'المبلغ المقبوض: 150.00 شيكل (₪)',
  'الخصم: 0.00 شيكل (₪)',
  'رصيد الزبون بعد الاعتماد حتى 16/11/2026: 350.00 شيكل (₪)',
  'طريقة القبض: نقداً',
  'ملاحظة الإيصال: إيصال مرجعي 807'
 ])assert.ok(message.includes(exact),'Expected: '+exact+'\n'+message);
 assert.equal(message.includes('سعر الصرف:'),false,
  'Base currency receipt should not display redundant FX details');
 assert.equal(message.includes('زبون رئيسي قديم'),false,
  'Prefer the authoritative party snapshot rather than stale browser name');
});

test('approved bank foreign-currency RCT includes bank, notes, FX and base amount',()=>{
 const message=approvedReceiptTelegramText(makeRow({
  cash:false,amount:20,baseAmount:74,rate:3.7,
  currency:'USD',currencySymbol:'$',sub:'',partyBalance:-26
 }));
 for(const exact of [
  'RCT-2026-0007',
  'الزبون الفرعي: —',
  'المبلغ المقبوض: 20.00 USD ($)',
  'الخصم: 0.00 USD ($)',
  'رصيد الزبون بعد الاعتماد حتى 16/11/2026: -26.00 شيكل (₪)',
  'طريقة القبض: بنك فلسطين - حساب الشركة',
  'ملاحظة الإيصال: حوالة رقم 902',
  'العملة: USD ($)',
  'سعر الصرف: 1 USD = 3.7 ILS',
  'المبلغ بالعملة المعتمدة: 74.00 شيكل (₪)'
 ])assert.ok(message.includes(exact),'Expected: '+exact+'\n'+message);
 assert.equal((message.match(/✅ سند قيد معتمد/g)||[]).length,1);
});

test('delayed queued Telegram retries use the original committed balance, not any later party balance',()=>{
 const row=makeRow({partyBalance:500,committedAt:'2026-11-16T21:30:00Z'});
 const text1=approvedReceiptTelegramText(row);
 assert.match(text1,/حتى 16\/11\/2026: 500.00/);
 assert.equal(approvedReceiptTelegramText(row),text1);
});

test('only newly created receipt is a dedicated notification',()=>{
 const row=makeRow();
 assert.equal(approvedReceiptTelegramText({...row,changes:[]}),null);
 assert.equal(approvedReceiptTelegramText({...row,
  changes:row.changes.map(x=>x.entity==='vouchers'?{...x,version:2}:x)
 }),null);
});

test('never claim a receipt was approved without its journal, treasury movement and party snapshot',()=>{
 for(const omitted of ['journalEntries','treasuries','parties']){
  const row=makeRow();
  row.changes=row.changes.filter(x=>x.entity!==omitted);
  assert.throws(()=>approvedReceiptTelegramText(row),/TELEGRAM_RECEIPT_POSTING_PROOF_MISSING/);
 }
 const row=makeRow();
 row.changes.find(x=>x.entity==='treasuries').value.transactions[0].baseAmount=10;
 assert.throws(()=>approvedReceiptTelegramText(row),/TELEGRAM_RECEIPT_MONEY_OR_BALANCE_NOT_PROVEN/);
});

test('technical newlines and unwanted controls in names cannot change message structure',()=>{
 const row=makeRow();
 row.changes.find(x=>x.entity==='vouchers').value.description='دفعة\nموافقة إضافية';
 const result=approvedReceiptTelegramText(row);
 assert.match(result,/ملاحظة السند: دفعة موافقة إضافية/);
 assert.equal(result.includes('دفعة\nموافقة'),false);
});
