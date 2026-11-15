import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedReceiptCustomerBalance} from '../src/utils/verifiedReceiptBalance';
import type {Party,Invoice,PaymentVoucher,JournalEntry,Treasury} from '../src/types';

const party={id:'pt-0064',code:'CUST-0064',name:'هيثم أبو ظهير',
 type:'customer',balance:-55,openingBalance:0} as Party;
const invoices=[{id:'inv-a',invoiceNumber:'INV-0083',customerId:party.id,
 totalAmount:60,baseTotalAmount:60,paidAmount:0,remainingAmount:60,
 isAccountingPosted:true,currency:'ILS'},
 {id:'inv-b',invoiceNumber:'INV-0190',customerId:party.id,
 totalAmount:95,baseTotalAmount:95,paidAmount:0,remainingAmount:95,
 isAccountingPosted:true,currency:'ILS'}] as Invoice[];
const vouchers=[{id:'v-150',type:'receipt',partyId:party.id,amount:150,
 baseAmount:150,currency:'ILS',exchangeRate:1,
 treasuryAccountCode:'CASH-1103'}] as PaymentVoucher[];
const journals=[...invoices.map(inv=>({
 id:'j-'+inv.id,referenceId:inv.id,referenceType:'pos_invoice',
 lines:[{accountCode:'1201',debit:inv.totalAmount,credit:0},
 {accountCode:'4101',debit:0,credit:inv.totalAmount}]
})),{id:'j-150',referenceType:'receipt',referenceId:'v-150',lines:[
 {accountCode:'1102',debit:150,credit:0},{accountCode:'1201',debit:0,credit:150}]
}] as JournalEntry[];
const treasuries=[{accountCode:'CASH-1103',type:'digital_wallet',transactions:[{
 referenceId:'v-150',baseAmount:150,amount:150
}]}] as Treasury[];

test('CUST-0064 screenshot: -55 stored, 155 invoices, 150 receipt proves 5 ₪',()=>{
 const result=verifiedReceiptCustomerBalance({party,invoices,vouchers,journalEntries:journals,treasuries});
 assert.equal(result,5);
 assert.equal(party.balance,-55,'preview never overwrites original card');
});
test('incomplete receipt journal or treasury movement never produces assumed balance',()=>{
 assert.equal(verifiedReceiptCustomerBalance({
  party,invoices,vouchers,journalEntries:journals.filter(j=>j.referenceType!=='receipt'),treasuries
 }),null);
 assert.equal(verifiedReceiptCustomerBalance({party,invoices,vouchers,journalEntries:journals,treasuries:[]}),null);
});
test('duplicate invoice posting and financial side documents fail closed',()=>{
 assert.equal(verifiedReceiptCustomerBalance({
  party,invoices,vouchers,journalEntries:[...journals,journals[0]],treasuries
 }),null);
 assert.equal(verifiedReceiptCustomerBalance({
  party,invoices,vouchers,journalEntries:journals,treasuries,hasOtherDocuments:true
 }),null);
});
