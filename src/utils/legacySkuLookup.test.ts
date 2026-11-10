import test from 'node:test';
import assert from 'node:assert/strict';
import { matchItemByBarcode, getAllItemBarcodes } from './barcodeGenerator';
import type { InventoryItem } from '../types';

const product = {
 id:'inv-1793642210292-e79n2',
 name:'ملصق A3 مطبوع',
 code:'PRI-00014',
 legacyCodes:['PRI-0015'],
 barcode:'628123456789',
 additionalBarcodes:[],
 barcodeEntries:[],
} as InventoryItem;

test('both old and new codes resolve the same merged permanent product ID',()=>{
 assert.equal(matchItemByBarcode(product,'PRI-0015'),true);
 assert.equal(matchItemByBarcode(product,'pri-00014'),true);
 assert.equal(matchItemByBarcode(product,'628123456789'),true);
 assert.equal(matchItemByBarcode(product,'PRI-00015'),false);
});
test('old label remains available for barcode lookup without replacing primary code',()=>{
 const codes=getAllItemBarcodes(product);
 assert.equal(codes.some(c=>c.barcode==='PRI-0015'&&!c.isPrimary),true);
 assert.equal(product.code,'PRI-00014');
});
