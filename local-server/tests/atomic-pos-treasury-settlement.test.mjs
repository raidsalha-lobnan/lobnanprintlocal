import test from 'node:test';
import assert from 'node:assert/strict';
import {settleAtomicPosPaymentTreasuries} from '../atomic-pos-treasury-settlement.mjs';

const invoice={
 id:'inv-pos-paid-1',invoiceNumber:'INV-9001',date:'2026-11-15',
 isAccountingPosted:true,customerId:'customer-1',customerName:'Customer',
 currency:'ILS',currencySymbol:'₪',exchangeRate:1,
 paidAmount:100,basePaidAmount:100,cashPaidAmount:40,bankPaidAmount:60,
 cashTreasuryCode:'CASH-1101',bankTreasuryCode:'CASH-1103',
 paymentMethod:'cash_bank'
};
const journal={
 referenceType:'pos_invoice',referenceId:invoice.id,
 lines:[{accountCode:'1101',debit:40,credit:0},
        {accountCode:'1102',debit:60,credit:0},
        {accountCode:'4101',debit:0,credit:100}]
};
function example({missingBank=false,alreadyPaid=false}={}){
 const rows=[
  {record_id:'treasury-cash',version:7,value:{
   id:'treasury-cash',accountCode:'CASH-1101',name:'Main cash',
   type:'cash_box',status:'active',balance:288,currencyBalances:{ILS:288},
   transactions:alreadyPaid?[{id:'tx-pos-'+invoice.id+'-cash',referenceId:invoice.id,
    referenceType:'pos_sale'}]:[]
  }},
  ...missingBank?[]:[{record_id:'treasury-wallet',version:4,value:{
   id:'treasury-wallet',accountCode:'CASH-1103',name:'Wallet',
   type:'digital_wallet',status:'active',balance:150,currencyBalances:{ILS:150},
   transactions:[]
  }}]
 ];
 const changed=[];
 const client={async query(sql,params){
  if(sql.startsWith("SELECT record_id,version,value FROM sync_records"))
   return {rows:rows.filter(r=>params[1].includes(r.value.accountCode))};
  if(sql.startsWith('UPDATE sync_records SET version=')){
   changed.push({entity:params[1],id:params[2],version:params[3],value:params[4]});
   return {rows:[]};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 const applied=[
  {entity:'invoices',id:invoice.id,value:structuredClone(invoice)},
  {entity:'journalEntries',id:'revenue',value:structuredClone(journal)}
 ];
 return {client,applied,changed};
}

test('cash + bank payment updates both treasuries once, without another journal',async()=>{
 const t=example();
 const n=await settleAtomicPosPaymentTreasuries(t.client,'lobnan_main',
  {atomicInvoiceId:invoice.id},t.applied);
 assert.equal(n,2);
 assert.equal(t.applied.filter(x=>x.entity==='journalEntries').length,1);
 assert.deepEqual(Object.fromEntries(t.changed.map(c=>[c.value.accountCode,c.value.balance])),
  {'CASH-1101':328,'CASH-1103':210});
 assert.equal(t.changed[0].value.transactions[0].referenceId,invoice.id);
 assert.equal(t.changed[0].value.transactions[0].baseAmount,40);
 assert.equal(t.changed[1].value.transactions[0].baseAmount,60);
 assert.equal(t.applied.filter(x=>x.entity==='treasuries').length,2);
});

test('missing nominated bank treasury fails closed before writing any movement',async()=>{
 const t=example({missingBank:true});
 await assert.rejects(settleAtomicPosPaymentTreasuries(t.client,'lobnan_main',
  {atomicInvoiceId:invoice.id},t.applied),/POS_TREASURY_ACCOUNT_NOT_UNIQUE/);
 assert.equal(t.changed.length,0);
});

test('previous POS payment is not deposited twice',async()=>{
 const t=example({alreadyPaid:true});
 await assert.rejects(settleAtomicPosPaymentTreasuries(t.client,'lobnan_main',
  {atomicInvoiceId:invoice.id},t.applied),/POS_TREASURY_PAYMENT_ALREADY_POSTED/);
 assert.equal(t.changed.length,0);
});

test('unpaid invoice or delegated Telegram mini settlement is not posted twice',async()=>{
 const t=example();
 assert.equal(await settleAtomicPosPaymentTreasuries(t.client,'lobnan_main',
  {atomicInvoiceId:invoice.id,miniSaleSettlement:true},t.applied),0);
 const u=example();
 u.applied[0].value.basePaidAmount=0;
 assert.equal(await settleAtomicPosPaymentTreasuries(u.client,'lobnan_main',
  {atomicInvoiceId:invoice.id},u.applied),0);
});

test('missing bank identity is refused even if the GL journal already has a 1102 debit',async()=>{
 const t=example();
 delete t.applied[0].value.bankTreasuryCode;
 await assert.rejects(settleAtomicPosPaymentTreasuries(t.client,'lobnan_main',
  {atomicInvoiceId:invoice.id},t.applied),
  /POS_TREASURY_SELECT_EXPLICIT_BANK_OR_MAIN_CASH/);
});

test('USD tender is credited to USD drawer, not invoice currency; bank leg is independent',async()=>{
 const t=example();
 Object.assign(t.applied[0].value,{currency:'ILS',exchangeRate:1,paidAmount:180.45,basePaidAmount:180.45,
  cashPaidAmount:50,cashCurrency:'USD',cashExchangeRate:3.209,
  bankPaidAmount:20,bankCurrency:'ILS',bankExchangeRate:1});
 t.applied[1].value.lines=[{accountCode:'1101',debit:160.45,credit:0},
  {accountCode:'1102',debit:20,credit:0},{accountCode:'4101',debit:0,credit:180.45}];
 assert.equal(await settleAtomicPosPaymentTreasuries(t.client,'lobnan_main',{atomicInvoiceId:invoice.id},t.applied),2);
 const cash=t.changed[0].value,bank=t.changed[1].value;
 assert.equal(cash.currencyBalances.USD,50);
 assert.equal(cash.currencyBalances.ILS,288);
 assert.equal(cash.balance,448.45);
 assert.equal(cash.transactions[0].amount,50);
 assert.equal(cash.transactions[0].currency,'USD');
 assert.equal(cash.transactions[0].exchangeRate,3.209);
 assert.equal(cash.transactions[0].baseAmount,160.45);
 assert.equal(bank.currencyBalances.ILS,170);
});
