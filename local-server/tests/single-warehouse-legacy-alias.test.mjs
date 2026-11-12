import test from 'node:test';
import assert from 'node:assert/strict';
import {computeInvoiceStockRevision} from '../invoice-warehouse-stock.mjs';
import {buildVerifiedInvoiceRevisionBundle} from '../invoice-revision-bundle.mjs';

const aliases={'المخزن الرئيسي':2,'المستودع الرئيسي':746};
const base={
  itemId:'inv-1790637265942',
  inventoryValue:{stockQuantity:0,warehouseStocks:aliases},
  invoiceWarehouse:'المستودع الرئيسي',
  nextWarehouse:'المستودع الرئيسي',
  originalQuantity:13,newQuantity:14,
  registeredWarehouseCount:1,
  singleWarehouseName:'المستودع الرئيسي'
};
test('single registered warehouse resolves exactly the documented two legacy aliases',()=>{
 const before=structuredClone(base);
 const result=computeInvoiceStockRevision(base);
 assert.equal(result.previousTotal,0);
 assert.equal(result.nextTotal,-1);
 assert.equal(result.aggregateDelta,-1);
 assert.deepEqual(result.warehouseStocks,{'المستودع الرئيسي':-1});
 assert.deepEqual(result.priorWarehouseCaches,aliases);
 assert.equal(result.previousWarehouseCache,746);
 assert.equal(result.normalized,true);
 assert.equal(result.legacyAliasReconciliation,true);
 assert.equal(result.transferred,false);
 // No mutation of the input or invented quantity 748:
 assert.deepEqual(base,before);
});
test('legacy cache discrepancies do not create an opening stock entry',()=>{
 const result=computeInvoiceStockRevision({
  ...base,originalQuantity:13,newQuantity:13
 });
 assert.equal(result.previousTotal,0);
 assert.equal(result.nextTotal,0);
 assert.equal(result.aggregateDelta,0);
 assert.equal(result.normalized,true);
});
test('still blocks unrelated keys, missing official name and real multiple warehouses',()=>{
 assert.throws(()=>computeInvoiceStockRevision({...base,singleWarehouseName:'Other'}),
  /REVISION_SINGLE_WAREHOUSE_HAS_AMBIGUOUS_LEGACY_KEYS/);
 assert.throws(()=>computeInvoiceStockRevision({...base,inventoryValue:{
  stockQuantity:0,warehouseStocks:{'المخزن الرئيسي':2,'مخزن فرعي':9}
 }}),/REVISION_SINGLE_WAREHOUSE_HAS_AMBIGUOUS_LEGACY_KEYS/);
 assert.throws(()=>computeInvoiceStockRevision({...base,singleWarehouseName:null}),
  /REVISION_SINGLE_WAREHOUSE_HAS_AMBIGUOUS_LEGACY_KEYS/);
 assert.throws(()=>computeInvoiceStockRevision({...base,inventoryValue:{
  stockQuantity:0,warehouseStocks:{'المخزن الرئيسي':'not-a-number','المستودع الرئيسي':746}
 }}),/REVISION_INVALID_WAREHOUSE_QUANTITY/);
 const multiple=computeInvoiceStockRevision({...base,registeredWarehouseCount:2});
 assert.equal(multiple.singleWarehouse,false);
 assert.deepEqual(multiple.warehouseStocks,{'المخزن الرئيسي':2,'المستودع الرئيسي':745});
 assert.equal(multiple.nextTotal,747);
});
const paper=(quantity,price,total)=>({
 itemId:'inv-1790637265942',quantity,unitPrice:price,total,
 category:'print_raw'
});
const invoice={
 id:'inv-pos-legacy-alias-test',invoiceNumber:'INV-0264',isOfficial:true,
 isAccountingPosted:true,date:'2026-11-13',
 warehouse:'المستودع الرئيسي',statusHistory:[],
 totalAmount:346,subtotal:346,baseTotalAmount:346,
 paidAmount:0,basePaidAmount:0,remainingAmount:346,
 customerId:'customer-main',items:[paper(13,2,26)]
};
test('invoice correction atomically normalizes legacy presentation keys with audit trail',()=>{
 const proposed={...invoice,subtotal:349,totalAmount:349,baseTotalAmount:349,
  remainingAmount:349,items:[paper(14,2,28)]};
 const command=buildVerifiedInvoiceRevisionBundle({
   invoice,proposed,invoiceVersion:2,
   plan:{totalDeltaMinor:300,currentCOGSMinor:52,expectedNextCOGSMinor:56,
    stockDeltas:[{itemId:'inv-1790637265942',inventoryChange:-1}],
    costByItem:{'inv-1790637265942':2},
    customerBalanceChanges:[{partyId:'customer-main',amountMinor:300}]},
   partyRecords:[{id:'customer-main',version:4,value:{id:'customer-main',balance:100}}],
   inventoryRecords:[{id:'inv-1790637265942',version:6,value:{
    id:'inv-1790637265942',stockQuantity:0,warehouseStocks:structuredClone(aliases),
    name:'A4',code:'PRI-00002',purchasePrice:2
   }}],
   registeredWarehouseCount:1,singleWarehouseId:'wh-1',
   singleWarehouseName:'المستودع الرئيسي',
   commandId:'fix-legacy-alias-test',now:'2026-11-13T10:00:00.000Z'
 });
 const stock=command.changes.find(c=>c.entity==='inventory');
 assert.equal(stock.value.stockQuantity,-1);
 assert.deepEqual(stock.value.warehouseStocks,{'المستودع الرئيسي':-1});
 assert.deepEqual(stock.value.warehouseStock,{'wh-1':-1});
 const audits=stock.value.inventoryBalanceReconciliations;
 assert.equal(audits.length,1);
 assert.deepEqual(audits[0].priorWarehouseCaches,aliases);
 assert.equal(audits[0].priorAggregate,0);
 assert.equal(audits[0].legacyAliasReconciliation,true);
 assert.equal(audits[0].noSyntheticOpeningStock,true);
 const movement=command.changes.find(c=>c.entity==='stockMovements');
 assert.equal(movement.value.quantity,1);
 assert.equal(movement.value.referenceNumber,invoice.invoiceNumber);
 assert.equal(command.changes[0].value.totalAmount,349);
});
