import test from 'node:test';
import assert from 'node:assert/strict';
import {financialTreasuryLegs,validateNewFinancialTreasuries} from '../treasury-routing-guard.mjs';

const box=(id,code,type)=>({record_id:id,value:{
 id,accountCode:code,type,status:'active',isDefault:code==='CASH-1101'}});
const rows=[box('treasury-cash-main','CASH-1101','cash_box'),
 box('bank-1','CASH-1102','bank_account'),
 box('wallet-1','CASH-1106','digital_wallet')];
const client={query:async(sql,args)=>{
 assert.match(sql,/entity='treasuries'/);
 return {rows:rows.filter(r=>r.value.accountCode===args[1])};
}};
test('cash-only invoice gets CASH-1101, rejects any other cash destination',async()=>{
 const invoice={id:'new-sale',paymentMethod:'cash',cashPaidAmount:10,paidAmount:10};
 const r=await validateNewFinancialTreasuries(client,'lobnan_main','invoices',invoice);
 assert.equal(r.cashTreasuryCode,'CASH-1101');
 assert.equal(invoice.cashTreasuryCode,undefined);
 await assert.rejects(()=>validateNewFinancialTreasuries(client,'lobnan_main','invoices',{
  ...invoice,cashTreasuryCode:'CASH-1102'
 }),/CASH_PAYMENT_ONLY_CASH_1101/);
});
test('explicit selected bank/wallet is preserved, never substituted',async()=>{
 const v={paymentMethod:'bank_transfer',paidAmount:30,bankPaidAmount:30,
  bankTreasuryCode:'CASH-1106'};
 const r=await validateNewFinancialTreasuries(client,'lobnan_main','invoices',v);
 assert.equal(r.bankTreasuryCode,'CASH-1106');
 for(const code of ['','1102','CASH-1101','BANK-1102','CASH-9999']){
  await assert.rejects(()=>validateNewFinancialTreasuries(client,'lobnan_main','invoices',{
   ...v,bankTreasuryCode:code
  }),/NONCASH_PAYMENT_REQUIRES_SELECTED_CASH_CODE|PAYMENT_TREASURY_MISSING_OR_INACTIVE/);
 }
});
test('split purchase and expense verify each physical treasury independently',async()=>{
 for(const entity of ['purchases','expenses']){
  const record={cashPaidAmount:25,bankPaidAmount:20,
   cashTreasuryAccountCode:'CASH-1101',
   bankTreasuryAccountCode:'CASH-1102'};
  const r=await validateNewFinancialTreasuries(client,'lobnan_main',entity,record);
  assert.equal(r.cashTreasuryAccountCode,'CASH-1101');
  assert.equal(r.bankTreasuryAccountCode,'CASH-1102');
 }
});
test('payment vouchers use CASH codes, while unpaid/old documents are never mutated',async()=>{
 const v={amount:50,type:'receipt',paymentMethod:'cash'};
 const result=await validateNewFinancialTreasuries(client,'lobnan_main','vouchers',v);
 assert.equal(result.treasuryAccountCode,'CASH-1101');
 const historic={amount:300,paidAmount:0,paymentMethod:'credit',bankTreasuryCode:'1102'};
 assert.equal(await validateNewFinancialTreasuries(client,'lobnan_main','invoices',historic),historic);
 const unused={amount:99,treasuryAccountCode:'1101'};
 assert.equal(await validateNewFinancialTreasuries(client,'lobnan_main','inventory',unused),unused);
});
test('no cash posted into noncash, and no noncash into main cash box',async()=>{
 await assert.rejects(()=>validateNewFinancialTreasuries(client,'lobnan_main','vouchers',{
  amount:15,type:'receipt',paymentMethod:'bank_transfer',treasuryAccountCode:'CASH-1101'
 }),/NONCASH_PAYMENT_REQUIRES_SELECTED_CASH_CODE/);
 await assert.rejects(()=>validateNewFinancialTreasuries(client,'lobnan_main','vouchers',{
  amount:15,type:'receipt',paymentMethod:'cash',treasuryAccountCode:'CASH-1106'
 }),/CASH_PAYMENT_ONLY_CASH_1101/);
});
