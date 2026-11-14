import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeMiniSaleBody,resolveMiniCashBox,mapMiniTreasuryJournalAccounts} from '../telegram-mini-pos.mjs';
import {buildNewAtomicPosSale} from '../atomic-pos-builder.compiled.mjs';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';

const base={
 date:'2026-11-14',customerId:'customer-1',
 documentType:'sale',paymentMethod:'credit',overallDiscount:0,
 items:[{itemId:'item-1',quantity:4,unitPrice:120,
  hasDimensions:false,notes:'ملاحظة الصنف'}],
 notes:'ملاحظة الفاتورة',paymentNotes:'ملاحظة الدفع'
};
const item={id:'item-1',code:'PRI-00001',name:'Printed leather',
 category:'printing',unit:'piece',stockQuantity:100,purchasePrice:35,sellingPrice:120};
const party={id:'customer-1',code:'CUST-0002',type:'customer',name:'Customer'};
const posting=(values,uuid)=>{
 const body=normalizeMiniSaleBody({...base,...values});
 return buildNewAtomicPosSale({
  invoiceId:'inv-pos-'+uuid,commandId:uuid,createdAt:'2026-11-14T10:00:00.000Z',
  items:body.items.map(l=>({...l,item})),
  customerId:party.id,customerName:party.name,paymentMethod:body.paymentMethod,notes:body.notes,
  options:{date:body.date,warehouse:'الرئيسي',currency:'ILS',currencySymbol:'₪',
   exchangeRate:1,overallDiscount:body.overallDiscount,
   paidAmount:body.paidAmount, cashPaidAmount:body.cashPaidAmount,
   bankPaidAmount:body.bankPaidAmount,
   cashTreasuryCode:body.cashTreasuryCode,bankTreasuryCode:body.bankTreasuryCode,
   paymentNotes:body.paymentNotes},
  vatRate:0,
  inventory:[{id:item.id,value:item,version:1}],
  parties:[{id:party.id,value:party,version:1}]
 });
};
test('unentered cash and bank amounts always produce a credit invoice',()=>{
 const body=normalizeMiniSaleBody({...base,cashPaidAmount:0,bankPaidAmount:0});
 assert.equal(body.paidAmount,0);
 assert.equal(body.paymentMethod,'credit');
 const {invoice}=posting({cashPaidAmount:0,bankPaidAmount:0},
  '76b3c87c-a05c-4f25-9cab-ce82289a1224');
 assert.equal(invoice.totalAmount,480);
 assert.equal(invoice.paidAmount,0);
 assert.equal(invoice.remainingAmount,480);
});
test('cash and bank amounts post as two separate authorized treasury legs',()=>{
 const body={
  cashPaidAmount:100,bankPaidAmount:200,cashTreasuryCode:'CASH-1101',
  bankTreasuryCode:'CASH-1102'
 };
 const normalized=normalizeMiniSaleBody({...base,...body});
 assert.equal(normalized.paidAmount,300);
 assert.equal(normalized.paymentMethod,'bank_transfer');
 const uuid='76b3c87c-a05c-4f25-9cab-ce82289a1225';
 const {invoice,posting:result}=posting(body,uuid);
 assert.equal(invoice.paidAmount,300);
 assert.equal(invoice.remainingAmount,180);
 assert.equal(invoice.cashPaidAmount,100);
 assert.equal(invoice.bankPaidAmount,200);
 assert.equal(invoice.cashTreasuryCode,'CASH-1101');
 assert.equal(invoice.bankTreasuryCode,'CASH-1102');
 assert.equal(invoice.notes,base.notes);
 assert.equal(invoice.paymentNotes,base.paymentNotes);
 assert.equal(invoice.items[0].notes,base.items[0].notes);
 const versions=new Map([[item.id,1],[party.id,1]]);
 const changes=[result.invoice,...result.journals,...result.stockMovements,
  ...result.inventoryChanges,...result.partyChanges]
  .map(change=>({...change,expectedVersion:versions.get(change.id)||0}));
 assert.equal(validateAtomicInvoicePosting({
  id:uuid,workspaceId:'lobnan_main',atomicInvoiceId:'inv-pos-'+uuid,changes
 }),true);
});
test('cash requires no cash-box selection; bank requires a noncash treasury code',()=>{
 const cash=normalizeMiniSaleBody({...base,cashPaidAmount:10,bankPaidAmount:0});
 assert.equal(cash.cashTreasuryCode,'');
 assert.equal(cash.cashPaidAmount,10);
 assert.throws(()=>normalizeMiniSaleBody({...base,cashPaidAmount:0,bankPaidAmount:10}),
  /MINI_POS_PAYMENT_TREASURY_REQUIRED/);
});
test('cash resolves to authoritative default cash box, overriding stale or forged codes',()=>{
 const entries=[
  {record_id:'treasury-cash-main',value:{name:'الصندوق النقدي الرئيسي',accountCode:'CASH-1101',type:'cash_box',status:'active',isDefault:true}},
  {record_id:'other-cash',value:{name:'كاش إضافي',accountCode:'CASH-1108',type:'cash_box',status:'active'}},
  {record_id:'bank-wallet',value:{name:'محفظة',accountCode:'CASH-1106',type:'digital_wallet',status:'active'}}
 ];
 const cash=normalizeMiniSaleBody({...base,cashPaidAmount:10,bankPaidAmount:0,
  cashTreasuryCode:'CASH-1108'});
 const resolved=resolveMiniCashBox(cash,entries,{canRead:()=>true});
 assert.equal(resolved.cashTreasuryCode,'CASH-1101');
 assert.equal(resolved.treasuryCode,'CASH-1101');
 assert.equal(cash.cashTreasuryCode,'CASH-1108','input must stay immutable');
 const mixed=resolveMiniCashBox(normalizeMiniSaleBody({...base,
  cashPaidAmount:10,bankPaidAmount:5,bankTreasuryCode:'CASH-1106'}),entries,{canRead:()=>true});
 assert.equal(mixed.cashTreasuryCode,'CASH-1101');
 assert.equal(mixed.treasuryCode,'CASH-1106');
 assert.throws(()=>resolveMiniCashBox(cash,entries,{canRead:()=>false}),
  /MINI_POS_DEFAULT_CASH_BOX_NOT_AUTHORIZED/);
 assert.throws(()=>resolveMiniCashBox(cash,entries.map(e=>({
  ...e,value:{...e.value,isDefault:false}})),{canRead:()=>true}),
  /MINI_POS_DEFAULT_CASH_BOX_MISSING_OR_AMBIGUOUS/);
});
test('all four valid business document types are accepted, unsupported modes rejected',()=>{
 for(const documentType of ['sale','print','purchase','expense'])
  assert.equal(normalizeMiniSaleBody({...base,documentType}).documentType,documentType);
 for(const documentType of ['refund','unknown']){
  assert.throws(()=>normalizeMiniSaleBody({...base,documentType}),
   /MINI_POS_DOCUMENT_TYPE_NOT_IMPLEMENTED/);
 }
});
test('compact layout contains four totals in a single row and original notes at correct places',()=>{
 const html=fs.readFileSync(new URL('../../public/telegram-pos.html',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../../public/telegram-pos-v2.css',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../../public/telegram-pos.js',import.meta.url),'utf8');
 const top=html.indexOf('id="invoiceDate"'),customer=html.indexOf('id="customerSearch"');
 const notes=html.indexOf('id="notes"'),items=html.indexOf('id="items"');
 const totals=html.indexOf('class="summary-row"'),payments=html.indexOf('id="cashPaid"');
 assert.ok(top<customer&&customer<notes&&notes<items&&items<totals&&totals<payments);
 for(const id of ['grand','discount','paidSummary','remainingSummary'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 for(const id of ['cashPaid','cashTreasury','bankPaid','bankTreasury','paymentNotes'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/data-prop="notes"/);
 assert.match(js,/data-prop="hasDimensions"/);
 assert.match(js,/cashPaidAmount:cashLeg,bankPaidAmount:bankLeg/);
 assert.match(html,/id="invoiceTypeMenu"/);
});
