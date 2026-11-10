import test from 'node:test';
import assert from 'node:assert/strict';
import {ONE_ITEM_RECLASSIFY,planMobileCreditReclassification} from '../mobile-credit-acc-plan.mjs';

const getRecords=()=>{
  const stock=[
    ...Array.from({length:24},(_,i)=>({
      entity:'inventory',record_id:'press-'+i,version:1,
      value:{id:'press-'+i,name:'Printing '+i,code:'PRI-'+String(i+1).padStart(5,'0'),
       category:'print_raw',stockQuantity:10,sellingPrice:2},
    })),
    {entity:'inventory',record_id:ONE_ITEM_RECLASSIFY.id,version:4,
      value:{id:ONE_ITEM_RECLASSIFY.id,name:ONE_ITEM_RECLASSIFY.name,
        code:ONE_ITEM_RECLASSIFY.fromCode,category:ONE_ITEM_RECLASSIFY.fromCategory,
        stockQuantity:0,sellingPrice:1,purchasePrice:1,legacyCodes:['STAT-0002'],
        warehouseBalances:{main:8,secondary:3},reorderLevel:4}},
    ...Array.from({length:2},(_,i)=>({
      entity:'inventory',record_id:'book-'+i,version:1,
      value:{id:'book-'+i,name:'Paper',code:'BOK-'+String(i+1).padStart(5,'0'),
       category:'stationery',stockQuantity:23},
    })),
    {entity:'inventory',record_id:'accessories-1',version:1,
      value:{id:'accessories-1',name:'رصيد وطنية',code:'ACC-00001',
       category:'office_supplies',stockQuantity:0,sellingPrice:1}},
  ];
  const refs=[
    {entity:'invoices',record_id:'invoice-1',version:3,value:{
       id:'invoice-1',total:60,paidAmount:25,balanceDue:35,items:[
         {itemId:ONE_ITEM_RECLASSIFY.id,itemCode:'PRI-00025',category:'print_raw',
           quantity:3,price:20,total:60,discount:0},
       ],
    }},
    {entity:'stockMovements',record_id:'move-1',version:2,value:{
      id:'move-1',code:'MOVE-001',itemId:ONE_ITEM_RECLASSIFY.id,itemCode:'PRI-00025',category:'print_raw',
      quantity:5,cost:11,
    }},
    {entity:'journalEntries',record_id:'journal-1',version:4,value:{
      lines:[{debit:10,credit:0},{debit:0,credit:10}],
      description:'Unrelated journal',
    }},
  ];
  return [...stock,...refs];
};

test('reclassifies only رصيد جوال from PRI-00025 to ACC-00002',()=>{
 const records=getRecords(),source=structuredClone(records);
 const planned=planMobileCreditReclassification(records);
 assert.deepEqual(planned.afterCounts,{PRI:24,BOK:2,ACC:2});
 assert.equal(planned.modifications.length,3);
 assert.equal(planned.linkedRecordsUpdated,2);
 assert.equal(planned.modifications[0].newValue.code,'ACC-00002');
 assert.equal(planned.modifications[0].newValue.category,'office_supplies');
 assert.deepEqual(planned.modifications[0].newValue.legacyCodes,['STAT-0002']);
 assert.equal(planned.releasedCode,'PRI-00025');
 assert.equal(planned.modifications.find(m=>m.entity==='invoices').newValue.items[0].itemCode,'ACC-00002');
 assert.equal(planned.modifications.find(m=>m.entity==='invoices').newValue.total,60);
 assert.equal(planned.modifications.find(m=>m.entity==='invoices').newValue.items[0].quantity,3);
 assert.equal(planned.modifications.find(m=>m.entity==='stockMovements').newValue.quantity,5);
 assert.equal(planned.modifications.find(m=>m.entity==='stockMovements').newValue.code,'MOVE-001');
 assert.deepEqual(planned.modifications[0].newValue.warehouseBalances,{main:8,secondary:3});
 assert.equal(planned.modifications[0].newValue.reorderLevel,4);
 assert.deepEqual(records,source);
});
test('frees PRI-00025 even if previously used as a barcode',()=>{
 const data=getRecords();
 const item=data.find(r=>r.record_id===ONE_ITEM_RECLASSIFY.id);
 item.value.barcode='PRI-00025';
 item.value.additionalBarcodes=['STAT-0002','PRI-00025'];
 item.value.barcodeEntries=[{barcode:'PRI-00025'},{barcode:'6280000000001'}];
 item.value.legacyCodes=['STAT-0002','PRI-00025'];
 const result=planMobileCreditReclassification(data);
 const after=result.modifications[0].newValue;
 assert.equal(after.barcode,'ACC-00002');
 assert.deepEqual(after.additionalBarcodes,['STAT-0002']);
 assert.deepEqual(after.barcodeEntries,[{barcode:'6280000000001'}]);
 assert.deepEqual(after.legacyCodes,['STAT-0002']);
 assert.equal(after.stockQuantity,0);
 assert.equal(after.sellingPrice,1);
});

test('refuses an unknown item, changed code or reused new code',()=>{
 const bad=getRecords();bad.find(r=>r.record_id===ONE_ITEM_RECLASSIFY.id).value.code='PRI-00026';
 assert.throws(()=>planMobileCreditReclassification(bad),/TARGET_ID_NAME_CODE_OR_GROUP_CHANGED/);
 const collision=getRecords();collision.find(r=>r.record_id==='accessories-1').value.legacyCodes=['ACC-00002'];
 assert.throws(()=>planMobileCreditReclassification(collision),/TARGET_CODE_ALREADY_RESERVED/);
 const releasedConflict=getRecords();releasedConflict.find(r=>r.record_id==='accessories-1').value.additionalBarcodes=['PRI-00025'];
 assert.throws(()=>planMobileCreditReclassification(releasedConflict),/RELEASED_PRI_CODE_ALREADY_USED_BY_ANOTHER_ITEM/);
});
test('does not change another product, price, payment, or journal value',()=>{
 const planned=planMobileCreditReclassification(getRecords());
 assert.equal(planned.modifications.some(m=>m.record_id==='accessories-1'),false);
 assert.equal(planned.modifications.some(m=>m.record_id==='journal-1'),false);
 assert.equal(planned.modifications.find(m=>m.entity==='invoices').newValue.paidAmount,25);
 assert.equal(planned.modifications.find(m=>m.entity==='stockMovements').newValue.cost,11);
});
