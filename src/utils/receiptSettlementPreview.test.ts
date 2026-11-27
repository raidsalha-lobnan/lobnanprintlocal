import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptSettlementPreview} from './receiptSettlementPreview';

const saved={
 type:'receipt' as const,partyId:'customer-a',amount:150,baseAmount:150,
 exchangeRate:1
};
const calc=(overrides:Partial<Parameters<typeof receiptSettlementPreview>[0]>={})=>
 receiptSettlementPreview({
  currentBalance:350,selectedPartyId:'customer-a',amount:150,
  exchangeRate:1,existingReceipt:saved,...overrides
 });

test('new receipt subtracts its draft once from current receivable',()=>{
 const res=calc({existingReceipt:null});
 assert.deepEqual(res,{
  currentBalance:350,before:350,after:200,priorReceiptBase:0,
  draftReceiptBase:150,deltaFromCurrent:-150
 });
});

test('opening an already posted receipt does NOT subtract that receipt twice',()=>{
 const res=calc();
 assert.deepEqual(res,{
  currentBalance:350,before:500,after:350,priorReceiptBase:150,
  draftReceiptBase:150,deltaFromCurrent:0
 });
});

test('editing saved receipt uses replacement delta, not new standalone deduction',()=>{
 const bigger=calc({amount:200});
 assert.equal(bigger?.before,500);
 assert.equal(bigger?.after,300);
 assert.equal(bigger?.deltaFromCurrent,-50);
 const smaller=calc({amount:100});
 assert.equal(smaller?.before,500);
 assert.equal(smaller?.after,400);
 assert.equal(smaller?.deltaFromCurrent,50);
});

test('a receipt moved to another customer never adds its old payment to that other customer',()=>{
 const target=calc({selectedPartyId:'customer-b',currentBalance:120,amount:30});
 assert.equal(target?.before,120);
 assert.equal(target?.after,90);
 assert.equal(target?.priorReceiptBase,0);
});

test('negative credits are preserved, not reset or made absolute',()=>{
 const credit=calc({currentBalance:-55,amount:150});
 assert.equal(credit?.before,95);
 assert.equal(credit?.after,-55);
});

test('historical baseAmount is used when FX rate changes after original posting',()=>{
 const result=calc({
  currentBalance:100,existingReceipt:{
   type:'receipt',partyId:'customer-a',
   amount:50,exchangeRate:3.6,baseAmount:180
  },amount:50,exchangeRate:3.7
 });
 assert.equal(result?.before,280);
 assert.equal(result?.after,95);
 assert.equal(result?.deltaFromCurrent,-5);
});

test('historical receipts without baseAmount use their ORIGINAL rate',()=>{
 const result=calc({
  currentBalance:100,existingReceipt:{
   type:'receipt',partyId:'customer-a',
   amount:50,exchangeRate:3.6
  },amount:50,exchangeRate:3.6
 });
 assert.equal(result?.before,280);
 assert.equal(result?.after,100);
});

test('receipt discounts reduce the preview once, without changing posted balance',()=>{
 const result=calc({discount:10});
 assert.equal(result?.currentBalance,350);
 assert.equal(result?.before,500);
 assert.equal(result?.after,340);
 assert.equal(result?.draftReceiptBase,160);
 assert.equal(result?.deltaFromCurrent,-10);
});

test('invalid inputs cannot create a misleading settlement',()=>{
 assert.equal(calc({discount:-10}),null);
 assert.equal(calc({amount:12.345}),null);
 assert.equal(calc({exchangeRate:0}),null);
 assert.equal(calc({exchangeRate:Infinity}),null);
 assert.equal(calc({selectedPartyId:''}),null);
 assert.equal(calc({currentBalance:null}),null);
 assert.equal(calc({existingReceipt:{...saved,baseAmount:NaN}}),null);
});

test('empty amount in draft previews unchanged balance before submission',()=>{
 const result=calc({amount:0});
 assert.equal(result?.after,500);
 assert.equal(result?.draftReceiptBase,0);
});
