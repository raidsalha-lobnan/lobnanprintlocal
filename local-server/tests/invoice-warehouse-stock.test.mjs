import test from 'node:test';
import assert from 'node:assert/strict';
import {computeInvoiceStockRevision} from '../invoice-warehouse-stock.mjs';

test('one registered warehouse uses aggregate zero as base, allows negative and repairs an old divergent cache',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'inv-1790461128067',
  inventoryValue:{stockQuantity:0,warehouseStocks:{'المستودع الرئيسي':233.68}},
  invoiceWarehouse:'المستودع الرئيسي - الكتب والمطبوعات الجاهزة',
  nextWarehouse:'المستودع الرئيسي - الكتب والمطبوعات الجاهزة',
  originalQuantity:0,newQuantity:7.4,registeredWarehouseCount:1
 });
 assert.equal(result.previousTotal,0);
 assert.equal(result.nextTotal,-7.4);
 assert.equal(result.warehouseStocks['المستودع الرئيسي'],-7.4);
 assert.equal(result.aggregateDelta,-7.4);
 assert.equal(result.normalized,true);
 assert.equal(result.previousWarehouseCache,233.68);
 assert.equal(result.originalAggregate,0);
 assert.equal(result.transferred,false);
});

test('sales may exceed stock for the sole registered warehouse',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'id',inventoryValue:{stockQuantity:0,warehouseStocks:{A:3}},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:0,
  newQuantity:7.4,registeredWarehouseCount:1
 });
 assert.equal(result.nextTotal,-7.4);
 assert.deepEqual(result.warehouseStocks,{A:-7.4});
});

test('no opening stock is fabricated when a sale makes the stock negative',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'new',inventoryValue:{stockQuantity:0},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:0,
  newQuantity:10,registeredWarehouseCount:1
 });
 assert.equal(result.previousTotal,0);
 assert.equal(result.nextTotal,-10);
 assert.equal(result.normalized,false);
 assert.equal(result.warehouseStocks,undefined);
});

test('reduced historic invoice returns only its actual quantity',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'old',inventoryValue:{stockQuantity:-200},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:6.29,
  newQuantity:0,registeredWarehouseCount:1
 });
 assert.equal(result.nextTotal,-193.71);
});

test('warehouse transfer handles real multiple warehouses independently',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'i',inventoryValue:{stockQuantity:12,warehouseStocks:{A:8,B:4}},
  invoiceWarehouse:'A',nextWarehouse:'B',originalQuantity:3,
  newQuantity:2,registeredWarehouseCount:2
 });
 assert.deepEqual(result.warehouseStocks,{A:11,B:2});
 assert.equal(result.nextTotal,13);
 assert.equal(result.transferred,true);
});

test('multiple warehouses also allow deliberately negative sales stock',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'i',inventoryValue:{stockQuantity:0,warehouseStocks:{A:0,B:0}},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:0,
  newQuantity:5,registeredWarehouseCount:2
 });
 assert.equal(result.warehouseStocks.A,-5);
 assert.equal(result.nextTotal,-5);
});

test('single registered warehouse never treats two unverified legacy cache keys as two real warehouses',()=>{
 assert.throws(()=>computeInvoiceStockRevision({
  itemId:'i',inventoryValue:{stockQuantity:0,warehouseStocks:{A:12,B:21}},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:0,
  newQuantity:1,registeredWarehouseCount:1
 }),/REVISION_SINGLE_WAREHOUSE_HAS_AMBIGUOUS_LEGACY_KEYS/);
});

test('warehouse with unknown name fails for true multiple warehouses',()=>{
 assert.throws(()=>computeInvoiceStockRevision({
  itemId:'i',inventoryValue:{stockQuantity:0,warehouseStocks:{A:10,B:20}},
  invoiceWarehouse:'C',nextWarehouse:'C',originalQuantity:0,
  newQuantity:1,registeredWarehouseCount:2
 }),/REVISION_WAREHOUSE_MISSING_OR_AMBIGUOUS/);
});
