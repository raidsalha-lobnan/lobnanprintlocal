import test from 'node:test';
import assert from 'node:assert/strict';
import {computeInvoiceStockRevision} from '../invoice-warehouse-stock.mjs';

test('legacy zero aggregate does not hide 233.68 m2 in verified warehouse',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'inv-1790461128067',
  inventoryValue:{stockQuantity:0,warehouseStocks:{'المستودع الرئيسي':233.68}},
  invoiceWarehouse:'المستودع الرئيسي - الكتب والمطبوعات الجاهزة',
  nextWarehouse:'المستودع الرئيسي - الكتب والمطبوعات الجاهزة',
  originalQuantity:0,newQuantity:7.4
 });
 assert.equal(result.previousTotal,233.68);
 assert.equal(result.nextTotal,226.28);
 assert.equal(result.warehouseStocks['المستودع الرئيسي'],226.28);
 assert.equal(result.aggregateDelta,-7.4);
 assert.equal(result.normalized,true);
 assert.equal(result.originalAggregate,0);
});
test('preserve actual available warehouse stock for additional issues',()=>{
 assert.throws(()=>computeInvoiceStockRevision({
  itemId:'id',inventoryValue:{stockQuantity:0,warehouseStocks:{A:3}},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:0,newQuantity:7.4
 }),/REVISION_WOULD_NEGATE_WAREHOUSE/);
});
test('reduced historic invoice returns only verified quantity on no-warehouse legacy item',()=>{
 const result=computeInvoiceStockRevision({
  itemId:'old',inventoryValue:{stockQuantity:0},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:6.29,newQuantity:0
 });
 assert.equal(result.nextTotal,6.29);
 assert.equal(result.normalized,false);
});
test('warehouse transfer returns source stock and takes target stock atomically',()=>{
 const r=computeInvoiceStockRevision({
  itemId:'i',inventoryValue:{stockQuantity:12,warehouseStocks:{A:8,B:4}},
  invoiceWarehouse:'A',nextWarehouse:'B',originalQuantity:3,newQuantity:2
 });
 assert.deepEqual(r.warehouseStocks,{A:11,B:2});
 assert.equal(r.nextTotal,13);
 assert.equal(r.transferred,true);
});
test('warehouses define aggregate even when imported total differs, without phantom movement',()=>{
 const r=computeInvoiceStockRevision({
  itemId:'i',inventoryValue:{stockQuantity:0,warehouseStocks:{A:12,B:21}},
  invoiceWarehouse:'A',nextWarehouse:'A',originalQuantity:2,newQuantity:2
 });
 assert.equal(r.nextTotal,33);
 assert.equal(r.aggregateDelta,0);
 assert.equal(r.normalized,true);
});
test('warehouse whose name cannot be uniquely resolved cannot be guessed',()=>{
 assert.throws(()=>computeInvoiceStockRevision({
  itemId:'i',inventoryValue:{stockQuantity:0,warehouseStocks:{A:10,B:20}},
  invoiceWarehouse:'C',nextWarehouse:'C',originalQuantity:0,newQuantity:1
 }),/REVISION_WAREHOUSE_MISSING_OR_AMBIGUOUS/);
});
