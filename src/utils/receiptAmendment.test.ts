import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReceiptAmendment} from './receiptAmendment';
import type {StoredRecord} from '../sync-next/types';
import type {PaymentVoucher} from '../types';

const mk=(entity:StoredRecord['entity'],id:string,version:number,value:any):StoredRecord=>
 ({key:entity+'-'+id,entity,id,version,value});
const voucher:PaymentVoucher={
 id:'vch-1',voucherNumber:'RCT-2026-0002',type:'receipt',date:'2026-11-12',
 partyId:'p1',partyName:'هيثم',amount:150,baseAmount:150,
 paymentMethod:'e_wallet',accountCode:'CASH-1103',treasuryAccountCode:'CASH-1103',
 description:'خالص الحساب',currency:'ILS',currencySymbol:'₪',exchangeRate:1
};
const treasury=(id:string,code:string,type:string,balance:number,withTx=false)=>({
 id,name:code,accountCode:code,type,status:'active',balance,
 currencyBalances:{ILS:balance},
 transactions:withTx?[{
 id:'tx-old',treasuryId:id,treasuryName:code,referenceType:'receipt',
 referenceId:'vch-1',voucherNumber:'RCT-2026-0002',type:'deposit',
 date:'2026-11-12',amount:150,baseAmount:150,currency:'ILS',
 currencySymbol:'₪',exchangeRate:1,balanceAfter:balance,partyName:'هيثم',
 description:'receipt'
 }]:[]
});
function fixture(includeJournal=false){
 return [
  mk('vouchers','vch-1',3,voucher),
  mk('treasuries','cash',2,treasury('cash','CASH-1101','cash_box',288)),
  mk('treasuries','wallet',3,treasury('wallet','CASH-1103','digital_wallet',150,true)),
  mk('treasuries','bank',2,treasury('bank','CASH-1104','bank_account',20)),
  mk('parties','p1',32,{id:'p1',name:'هيثم',type:'customer',balance:-55}),
  mk('parties','p2',19,{id:'p2',name:'عميل آخر',type:'customer',balance:120}),
  ...(includeJournal?[mk('journalEntries','entry-1',1,{
   id:'entry-1',referenceId:'vch-1',referenceType:'receipt',lines:[]
  })]:[])
 ];
}
const draft=()=>({
 date:'2026-11-12',description:'خالص الحساب',amount:150,currency:'ILS',
 exchangeRate:1,paymentMethod:'e_wallet' as const,
 partyId:'p1',treasuryAccountCode:'CASH-1103'
});
const update=(command:ReturnType<typeof buildReceiptAmendment>,entity:string,id:string)=>
 command.changes.find(change=>change.entity===entity&&change.id===id)?.value as any;
test('metadata-only amendment touches voucher and its original treasury, not balance or party',()=>{
 const command=buildReceiptAmendment(fixture(),'vch-1',voucher,
  {...draft(),description:'بيان مصحح'},'update-memo');
 assert.deepEqual(command.changes.map(x=>x.entity),['vouchers','treasuries']);
 assert.equal(update(command,'vouchers','vch-1').description,'بيان مصحح');
 assert.equal(update(command,'treasuries','wallet').balance,150);
 assert.equal(update(command,'treasuries','wallet').transactions[0].id,'tx-old');
 assert.equal(update(command,'treasuries','wallet').transactions.length,1);
});
test('financial amendment changes historical receipt amount in one atomic command',()=>{
 const command=buildReceiptAmendment(fixture(),'vch-1',voucher,
  {...draft(),amount:200},'increase-50');
 assert.equal(command.changes.length,3);
 assert.equal(update(command,'vouchers','vch-1').baseAmount,200);
 assert.equal(update(command,'treasuries','wallet').balance,200);
 assert.equal(update(command,'treasuries','wallet').currencyBalances.ILS,200);
 assert.equal(update(command,'treasuries','wallet').transactions[0].amount,200);
 assert.equal(update(command,'parties','p1').balance,-105);
 assert.equal(command.changes.some(x=>x.entity==='journalEntries'),false);
});
test('moving an existing receipt to another treasury removes its old movement exactly once',()=>{
 const command=buildReceiptAmendment(fixture(),'vch-1',voucher,
  {...draft(),paymentMethod:'bank_transfer',treasuryAccountCode:'CASH-1104'},'move-box');
 assert.equal(command.changes.length,3);
 assert.equal(update(command,'treasuries','wallet').balance,0);
 assert.equal(update(command,'treasuries','wallet').transactions.length,0);
 assert.equal(update(command,'treasuries','bank').balance,170);
 assert.equal(update(command,'treasuries','bank').transactions.length,1);
 assert.equal(update(command,'vouchers','vch-1').paymentMethod,'bank_transfer');
});
test('moving receipt to another customer reconciles both customer balances',()=>{
 const command=buildReceiptAmendment(fixture(),'vch-1',voucher,
  {...draft(),partyId:'p2'},'move-party');
 assert.equal(update(command,'parties','p1').balance,95);
 assert.equal(update(command,'parties','p2').balance,-30);
 assert.equal(update(command,'vouchers','vch-1').partyName,'عميل آخر');
});
test('linked invoice or linked journal cannot have its finances silently rewritten',()=>{
 assert.throws(()=>buildReceiptAmendment(fixture(true),'vch-1',voucher,
  {...draft(),amount:200},'posted'),/تسوية محاسبية/);
 assert.throws(()=>buildReceiptAmendment(fixture(),'vch-1',
  {...voucher,amount:170},{...draft(),amount:200},'stale'),/جهاز آخر/);
});
test('no cash document can be routed to bank by changing the caption alone',()=>{
 const command=buildReceiptAmendment(fixture(),'vch-1',voucher,
  {...draft(),paymentMethod:'cash'},'inconsistent-label');
 assert.equal(update(command,'vouchers','vch-1').paymentMethod,'e_wallet');
 assert.throws(()=>buildReceiptAmendment(fixture(),'vch-1',voucher,
  {...draft(),treasuryAccountCode:'CASH-7777'},'bad'),/الصندوق غير متاح/);
});
