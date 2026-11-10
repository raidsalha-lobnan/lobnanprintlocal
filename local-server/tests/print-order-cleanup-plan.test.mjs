import test from 'node:test';
import assert from 'node:assert/strict';
import {planPhantomPrintOrderCleanup} from '../print-order-cleanup-plan.mjs';

const journal=(i,id,amount=10)=>({
 id:'je-'+i,entryNumber:'JE-'+i,referenceType:'print_order',referenceId:id,
 lines:[
  {accountCode:'1101',accountName:'Cash',debit:amount,credit:0},
  {accountCode:'4102',accountName:'Press revenue',debit:0,credit:amount}
 ]});
test('102 unlinked print orders are archived and their 48 journals reversed, never rewritten',()=>{
 const orders=Array.from({length:102},(_,i)=>({id:'job-'+i,orderNumber:'JOB-FAKE-'+i,
  associatedInvoiceId:i===101?'':'inv-not-in-posted-ledger'}));
 const invoices=Array.from({length:98},(_,i)=>({id:'invoice-'+i,isAccountingPosted:true,items:[],total:123.4}));
 const journals=Array.from({length:48},(_,i)=>journal(i,'job-'+i,i===0?841:10));
 const original=structuredClone({orders,invoices,journals});
 const result=planPhantomPrintOrderCleanup({orders,invoices,journals});
 assert.equal(result.eligibleOrderCount,102);
 assert.equal(result.linkedOrderCount,0);
 assert.equal(result.reversalCount,48);
 assert.equal(result.debitMinorReversed,131100);
 assert.deepEqual({orders,invoices,journals},original);
 assert.equal(result.reversalEntries[0].lines[0].credit,841);
 assert.equal(result.reversalEntries[0].lines[1].debit,841);
 assert.equal(result.reversalEntries[0].referenceType,'print_order_void_reversal');
});
test('a real print order linked from either invoice or order is never marked phantom',()=>{
 const invoices=[{id:'invoice-A',printJobId:'job-c',isAccountingPosted:true},
  {id:'invoice-B',isAccountingPosted:true}];
 const orders=[{id:'job-a',associatedInvoiceId:'invoice-A'},
  {id:'job-b',associatedInvoiceId:'not-real'},
  {id:'job-c',associatedInvoiceId:'not-real'}];
 const journals=[journal(1,'job-a'),journal(2,'job-b'),journal(3,'job-c')];
 const plan=planPhantomPrintOrderCleanup({orders,invoices,journals});
 assert.equal(plan.linkedOrderCount,2);
 assert.deepEqual(plan.orphanOrderIds,['job-b']);
 assert.equal(plan.reversalEntries.length,1);
 assert.equal(plan.reversalEntries[0].reversesJournalId,'je-2');
});
test('a journal without its print order cannot be silently removed',()=>{
 assert.throws(()=>planPhantomPrintOrderCleanup({
  orders:[],invoices:[],journals:[journal(9,'job-missing')]
 }),/JOURNAL_MISSING_PRINT_ORDER_PROVENANCE/);
});
test('a nonbalanced posting does not produce a reversing journal',()=>{
 const bad=journal(1,'job-1');bad.lines[1].credit=9;
 assert.throws(()=>planPhantomPrintOrderCleanup({
  orders:[{id:'job-1'}],invoices:[],journals:[bad]
 }),/UNBALANCED_PRINT_REVERSAL/);
});
test('notes containing a matching print order number force a conservative hold',()=>{
 const result=planPhantomPrintOrderCleanup({
  orders:[{id:'job-1',orderNumber:'JOB-111'}],
  invoices:[{id:'invoice-1',notes:'Delivery for JOB-111'}],
  journals:[]});
 assert.equal(result.linkedOrderCount,1);
 assert.equal(result.eligibleOrderCount,0);
});
