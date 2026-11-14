import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMiniSaleBody,validMiniInvoiceDate} from '../telegram-mini-pos.mjs';
import {buildNewAtomicPosSale} from '../atomic-pos-builder.compiled.mjs';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';

const customer={id:'cust',code:'CUST-0002',name:'Customer',type:'customer',balance:0};
const first={id:'item-a',name:'Paper',code:'PRI-00001',category:'printing',
  stockQuantity:30,purchasePrice:1,sellingPrice:5};
const second={id:'item-b',name:'Card',code:'PRI-00002',category:'printing',
  stockQuantity:10,purchasePrice:3,sellingPrice:8};

test('Telegram Mini POS accepts a selected valid date and rejects calendar-invalid dates',()=>{
 assert.equal(validMiniInvoiceDate('2026-11-14'),true);
 assert.equal(validMiniInvoiceDate('2026-02-29'),false);
 assert.equal(validMiniInvoiceDate('2024-02-29'),true);
 assert.equal(validMiniInvoiceDate('2026-13-01'),false);
 assert.equal(validMiniInvoiceDate('2026-11-1'),false);
 const body={date:'2026-11-10',customerId:'cust',paymentMethod:'credit',
  items:[{itemId:'item-a',quantity:2,unitPrice:5},{itemId:'item-b',quantity:1,unitPrice:8}]};
 assert.equal(normalizeMiniSaleBody(body).date,'2026-11-10');
 assert.equal(normalizeMiniSaleBody(body).items.length,2);
 assert.throws(()=>normalizeMiniSaleBody({...body,date:'2026-02-29'}),/MINI_POS_DATE_INVALID/);
});

test('three separate invoice rows for two different products plus a repeated product post one aggregated stock movement per product and preserve selected date',()=>{
 const id='inv-pos-f0c239e6-7fab-4967-815b-2bd226cdf305';
 const {posting,invoice}=buildNewAtomicPosSale({
  invoiceId:id,commandId:'f0c239e6-7fab-4967-815b-2bd226cdf305',
  createdAt:'2026-11-14T13:00:00.000Z',
  items:[{item:first,quantity:2,unitPrice:5},{item:second,quantity:1,unitPrice:8},
   {item:first,quantity:3,unitPrice:5,notes:'Another row'}],
  customerId:'cust',customerName:'Customer',paymentMethod:'credit',
  options:{date:'2026-11-12',warehouse:'main',currency:'ILS',currencySymbol:'ILS',exchangeRate:1},
  vatRate:0,inventory:[{id:first.id,value:first,version:1},
   {id:second.id,value:second,version:1}],
  parties:[{id:'cust',value:customer,version:1}]
 });
 assert.equal(invoice.date,'2026-11-12');
 assert.equal(invoice.warehouse,'main');
 assert.equal(invoice.items.length,3);
 assert.deepEqual(invoice.items.map(x=>x.itemId),['item-a','item-b','item-a']);
 assert.equal(invoice.totalAmount,33);
 assert.equal(posting.stockMovements.length,2);
 assert.deepEqual(posting.stockMovements.map(x=>x.value.quantity).sort((a,b)=>a-b),[1,5]);
 const versions=new Map([['item-a',1],['item-b',1],['cust',1]]);
 const changes=[posting.invoice,...posting.journals,...posting.stockMovements,
  ...posting.partyChanges,...posting.inventoryChanges].map(x=>({
  ...x,expectedVersion:versions.get(x.id)||0
 }));
 assert.equal(validateAtomicInvoicePosting({
  id:posting.commandId,workspaceId:'lobnan_main',atomicInvoiceId:id,changes
 }),true);
});
