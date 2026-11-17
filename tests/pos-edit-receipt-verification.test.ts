import test from 'node:test';
import assert from 'node:assert/strict';
import type {Invoice} from '../src/types';
import {verifyPosEditReceipt} from '../src/utils/posEditReceiptVerification';

const saved=()=>({
 id:'inv-101',invoiceNumber:'INV-0101',date:'2026-11-17',
 customerId:'c-1',notes:'بند توضيحي',paymentNotes:'سداد جزئي',
 items:[{id:'item-1',itemId:'itm-1',itemName:'طباعة',
  notes:'طباعة على الوجهين',description:'وصف',
  quantity:3,unitPrice:5,total:15,discount:0,unit:'حبة'}]
}) as unknown as Invoice;
const lines=()=>[{inventoryItemId:'itm-1',itemName:'طباعة',
 notes:'طباعة على الوجهين',description:'وصف',
 quantity:3,unitPrice:5,discount:0,unit:'حبة'}];

test('successful PostgreSQL receipt preserves cashier notes, line details and amounts',()=>{
 assert.equal(verifyPosEditReceipt(saved(),'inv-101',lines(),
  'بند توضيحي','سداد جزئي','2026-11-17'),null);
});
test('server acknowledgement cannot clear cashier editor if edited line note was discarded',()=>{
 const row=saved();row.items[0].notes='الملاحظة القديمة';
 assert.equal(verifyPosEditReceipt(row,'inv-101',lines(),
  'بند توضيحي','سداد جزئي','2026-11-17'),'INVOICE_ITEM_NOTE_NOT_SAVED');
});
test('a stale success response cannot drop invoice notes, payment notes, or changes to quantity',()=>{
 const l=lines();
 assert.equal(verifyPosEditReceipt({...saved(),notes:''},'inv-101',l,
  'بند توضيحي','سداد جزئي','2026-11-17'),'INVOICE_NOTE_NOT_SAVED');
 assert.equal(verifyPosEditReceipt({...saved(),paymentNotes:''},'inv-101',l,
  'بند توضيحي','سداد جزئي','2026-11-17'),'INVOICE_PAYMENT_NOTE_NOT_SAVED');
 assert.equal(verifyPosEditReceipt(saved(),'inv-101',
  [{...l[0],quantity:4}],'بند توضيحي','سداد جزئي','2026-11-17'),
  'INVOICE_ITEM_QUANTITY_NOT_SAVED');
});
test('invoice identity, row order and amount mismatches block editor reset',()=>{
 assert.equal(verifyPosEditReceipt(saved(),'different',lines(),
  'بند توضيحي','سداد جزئي','2026-11-17'),'INVOICE_ID_MISMATCH');
 assert.equal(verifyPosEditReceipt(saved(),'inv-101',[],
  'بند توضيحي','سداد جزئي','2026-11-17'),'INVOICE_ITEM_COUNT_MISMATCH');
 assert.equal(verifyPosEditReceipt(saved(),'inv-101',
  [{...lines()[0],unitPrice:100}],'بند توضيحي','سداد جزئي','2026-11-17'),
  'INVOICE_ITEM_PRICE_NOT_SAVED');
});

test('changed VAT, dimensions and attachment references require an exact approved receipt',()=>{
 const withTax=saved();withTax.items[0].tax=2;
 assert.equal(verifyPosEditReceipt(withTax,'inv-101',
  [{...lines()[0],tax:0}],'بند توضيحي','سداد جزئي','2026-11-17'),
  'INVOICE_ITEM_TAX_NOT_SAVED');
 const withWidth=saved();withWidth.items[0].width=2;
 assert.equal(verifyPosEditReceipt(withWidth,'inv-101',
  [{...lines()[0],width:3}],'بند توضيحي','سداد جزئي','2026-11-17'),
  'INVOICE_ITEM_WIDTH_NOT_SAVED');
 const withAttachments=saved();
 withAttachments.items[0].attachments=[{id:'old-attachment'} as any];
 assert.equal(verifyPosEditReceipt(withAttachments,'inv-101',
  [{...lines()[0],attachments:[{id:'new-attachment'}]}],
  'بند توضيحي','سداد جزئي','2026-11-17'),
  'INVOICE_ITEM_ATTACHMENTS_NOT_SAVED');
});
