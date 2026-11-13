import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSingleWarehouseInventory} from '../single-warehouse-inventory.mjs';

test('new sales may make stock negative while preserving one actual warehouse only',()=>{
 const previous={id:'item1',stockQuantity:0,
  warehouseStocks:{'المستودع الرئيسي':233.68}};
 const next={...previous,stockQuantity:-7.4};
 const updated=normalizeSingleWarehouseInventory({
  previous,next,warehouseId:'wh-1',commandId:'sale001',
  now:'2026-11-09T12:00:00Z'
 });
 assert.equal(updated.stockQuantity,-7.4);
 assert.deepEqual(updated.warehouseStocks,{'المستودع الرئيسي':-7.4});
 assert.deepEqual(updated.warehouseStock,{'wh-1':-7.4});
 assert.equal(updated.inventoryBalanceReconciliations[0].previousLegacyCache,233.68);
 assert.equal(updated.inventoryBalanceReconciliations[0].noSyntheticOpeningStock,true);
});
test('changing selling price must not rewrite legacy inventory history',()=>{
 const previous={id:'item1',stockQuantity:0,warehouseStocks:{'المستودع الرئيسي':233.68}};
 const next={...previous,sellingPrice:20};
 const updated=normalizeSingleWarehouseInventory({
  previous,next,warehouseId:'wh-1',commandId:'price001',
  now:'2026-11-09T12:00:00Z'
 });
 assert.strictEqual(updated,next);
});
test('stock adjustments have signed values and mirrored registered warehouse balance',()=>{
 const previous={id:'item1',stockQuantity:-7.4,
  warehouseStocks:{'المستودع الرئيسي':-7.4},warehouseStock:{'wh-1':-7.4}};
 const next={...previous,stockQuantity:2.6};
 const updated=normalizeSingleWarehouseInventory({
  previous,next,warehouseId:'wh-1',commandId:'receipt001',
  now:'2026-11-09T12:00:00Z'
 });
 assert.equal(updated.stockQuantity,2.6);
 assert.deepEqual(updated.warehouseStocks,{'المستودع الرئيسي':2.6});
 assert.equal(updated.warehouseStock['wh-1'],2.6);
});
test('unverified second cache key is never silently treated as second registered warehouse',()=>{
 const prev={id:'item1',stockQuantity:0,warehouseStocks:{A:11,B:17}};
 assert.throws(()=>normalizeSingleWarehouseInventory({
  previous:prev,next:{...prev,stockQuantity:-1},
  warehouseId:'wh-1',commandId:'sale002',now:'2026-11-09'
 }),/SINGLE_WAREHOUSE_UNVERIFIED_LEGACY_KEYS/);
});
test('a verified atomic sale can post despite opaque legacy warehouse keys without altering them',()=>{
 const previous={id:'sku',stockQuantity:-1,
  warehouseStocks:{'historic-A':12,'historic-B':31},
  warehouseStock:{'old-device-cache':99}};
 const once=normalizeSingleWarehouseInventory({
  previous,next:{...previous,stockQuantity:-2},
  warehouseId:'wh-1',commandId:'atomic-existing',
  now:'2026-11-14T00:00:00Z',atomicSale:true
 });
 assert.equal(once.stockQuantity,-2);
 assert.equal(once.warehouseStock['wh-1'],-2);
 assert.equal(once.warehouseStock['old-device-cache'],99);
 assert.deepEqual(once.warehouseStocks,previous.warehouseStocks);
 assert.equal(once.warehouseCacheReconciliationRequired,true);
 assert.equal(once.inventoryBalanceReconciliations.length,1);
 assert.equal(once.inventoryBalanceReconciliations[0].noHistoricalCacheMerge,true);
 const again=normalizeSingleWarehouseInventory({
  previous:once,next:{...once,stockQuantity:-3},
  warehouseId:'wh-1',commandId:'atomic-existing-2',
  now:'2026-11-14T01:00:00Z',atomicSale:true
 });
 assert.equal(again.stockQuantity,-3);
 assert.equal(again.warehouseStock['wh-1'],-3);
 assert.deepEqual(again.warehouseStocks,previous.warehouseStocks);
 assert.equal(again.inventoryBalanceReconciliations.length,1,
  'retain one durable review marker rather than duplicating it on every sale');
});

test('new inventory with no opening stock stays at zero without creating a receipt',()=>{
 const next=normalizeSingleWarehouseInventory({
  previous:null,next:{id:'new',stockQuantity:0},warehouseId:'wh-1',
  commandId:'new-item',now:'2026-11-09'
 });
 assert.equal(next.stockQuantity,0);
 assert.deepEqual(next.warehouseStock,{'wh-1':0});
 assert.equal(next.warehouseStocks,undefined);
});
