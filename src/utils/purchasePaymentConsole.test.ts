import test from 'node:test';
import assert from 'node:assert/strict';
import {
 calculatePurchaseBreakdown,calculatePurchaseSettlement
} from './purchasePaymentConsole';
import type {PurchaseLineDraft} from '../components/purchases/PurchaseInvoiceLinesTable';
const item=(qty:number,price:number,discount=0):PurchaseLineDraft=>({
 key:'test-'+qty+'-'+price,itemId:'PRI-0001',itemName:'ورق',
 itemCode:'PRI-0001',barcode:'',notes:'',unit:'قطعة',
 unitCalculationType:'unit',hasDimensions:false,length:1,width:1,count:1,
 quantity:qty,unitPrice:price,discount
});
test('net supplier inventory cost equals lines plus landed charges; VAT after discounts',()=>{
 const r=calculatePurchaseBreakdown([item(2,100,10),item(1,50)],15,10,20);
 assert.equal(r.gross,250);
 assert.equal(r.lineDiscount,10);
 assert.equal(r.overallDiscount,24);
 assert.equal(r.additionalCharges,20);
 assert.equal(r.lines.reduce((x,l)=>x+l.net,0),216);
 assert.equal(r.subtotal,236);
 assert.equal(r.tax,32.4);
 assert.equal(r.total,268.4);
 assert.equal(r.subtotal+r.tax,r.total);
});
test('cash ILS plus bank USD settlement reconciles to base ILS with payable remaining',()=>{
 const s=calculatePurchaseSettlement(100,3.7,
  {amount:100,currency:'ILS',rate:1,treasuryCode:'1101'},
  {amount:50,currency:'USD',rate:3.7,treasuryCode:'1102'});
 assert.equal(s.baseTotal,370);
 assert.equal(s.cashBase,100);
 assert.equal(s.bankBase,185);
 assert.equal(s.paidBase,285);
 assert.equal(s.remainingBase,85);
 assert.equal(s.status,'partial');
 assert.equal(s.paidBase+s.remainingBase,s.baseTotal);
});
test('credit purchase never posts payment or guesses cash treasury',()=>{
 const s=calculatePurchaseSettlement(125,1,
  {amount:0,currency:'ILS',rate:1,treasuryCode:''},
  {amount:0,currency:'ILS',rate:1,treasuryCode:''});
 assert.equal(s.paidBase,0);
 assert.equal(s.remainingBase,125);
 assert.equal(s.status,'unpaid');
});
test('full paid purchase matches zero payable without FX rounding drift',()=>{
 const s=calculatePurchaseSettlement(200,1,
  {amount:80,currency:'ILS',rate:1,treasuryCode:'1101'},
  {amount:120,currency:'ILS',rate:1,treasuryCode:'1102'});
 assert.equal(s.paidBase,200);
 assert.equal(s.remainingBase,0);
 assert.equal(s.status,'paid');
});
test('reject overpayment and invalid exchange rates',()=>{
 assert.throws(()=>calculatePurchaseSettlement(100,1,
  {amount:101,currency:'ILS',rate:1,treasuryCode:'1101'},
  {amount:0,currency:'ILS',rate:1,treasuryCode:''}),/EXCEEDS_TOTAL/);
 assert.throws(()=>calculatePurchaseSettlement(100,1,
  {amount:1,currency:'ILS',rate:0,treasuryCode:'1101'},
  {amount:0,currency:'ILS',rate:1,treasuryCode:''}),/INPUT_INVALID/);
});
test('purchase wide percent discount is bounded and cannot make total negative',()=>{
 assert.throws(()=>calculatePurchaseBreakdown([item(1,5)],0,101,0),/PERCENT_INVALID/);
 const r=calculatePurchaseBreakdown([item(1,5)],0,100,0);
 assert.equal(r.subtotal,0);
 assert.equal(r.tax,0);
 assert.equal(r.total,0);
});
test('area-based material quantity uses exact length times width times count',()=>{
 const area={...item(1,12),hasDimensions:true,unit:'م²',
  unitCalculationType:'area' as const,length:3.7,width:2,count:2};
 const r=calculatePurchaseBreakdown([area],0,0,0);
 assert.equal(r.total,177.6);
});

test('default purchase item price converts from base ILS into invoice currency',async()=>{
 const {purchaseDraftForItem}=await import('./purchaseLineMath');
 const stock={id:'item-1',code:'PRI-001',name:'ورق',
  unit:'قطعة',purchasePrice:37,barcode:'',category:'خام'} as import('../types').InventoryItem;
 const line=purchaseDraftForItem(stock,undefined,3.7);
 assert.equal(line.unitPrice,10);
 assert.equal(line.itemId,'item-1');
});
