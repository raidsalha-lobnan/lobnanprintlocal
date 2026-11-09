import test from 'node:test';
import assert from 'node:assert/strict';
import {proveInvoiceOnlyPartyBalance} from '../invoice-party-balance.mjs';

const party={id:'party1',type:'customer',balance:0,openingBalance:0};
const invoice=(id,amount)=>({
 id,customerId:'party1',isAccountingPosted:true,workflowStatus:'new',
 currency:'ILS',exchangeRate:1,totalAmount:amount,
 remainingAmount:amount,baseTotalAmount:amount,baseRemainingAmount:amount,
 paidAmount:0,basePaidAmount:0
});
const journal=(id,amount)=>({
 referenceId:id,referenceType:'pos_invoice',
 lines:[{accountCode:'1201',debit:amount,credit:0},
        {accountCode:'4101',debit:0,credit:amount}]
});
test('reconcile zero cache from nine unpaid invoices and matching A/R journals',()=>{
 const amounts=[915,180,535.4,497,700,304,54,2493,754.8];
 const invoices=amounts.map((n,i)=>invoice('bill'+i,n));
 const journals=amounts.map((n,i)=>journal('bill'+i,n));
 const r=proveInvoiceOnlyPartyBalance({
  partyId:'party1',party,invoices,journals,hasOtherPartyDocuments:false
 });
 assert.equal(r.balanceMinor,643320);
 assert.equal(r.sourceInvoiceCount,9);
});
test('cannot reconcile when invoice and journal disagree',()=>{
 const r=proveInvoiceOnlyPartyBalance({
  partyId:'party1',party,
  invoices:[invoice('bill',100)],journals:[journal('bill',50)]
 });
 assert.equal(r,null);
});
test('does not erase receivables when separate receipts or returns exist',()=>{
 const r=proveInvoiceOnlyPartyBalance({
  partyId:'party1',party,
  invoices:[invoice('bill',100)],journals:[journal('bill',100)],
  hasOtherPartyDocuments:true
 });
 assert.equal(r,null);
});
test('does not treat a paid or foreign currency invoice as an unpaid ILS invoice',()=>{
 const paid={...invoice('bill',100),paidAmount:20,remainingAmount:80};
 const fx={...invoice('bill',100),currency:'USD',exchangeRate:3.5};
 for(const v of [paid,fx]){
  assert.equal(proveInvoiceOnlyPartyBalance({
   partyId:'party1',party,invoices:[v],journals:[journal('bill',100)]
  }),null);
 }
});
