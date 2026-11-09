import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalogReclassificationPreview} from '../catalog-reclassification-plan.mjs';

const items=[
 {id:'inv-1',code:'PRI-0001',category:'print_raw',stockQuantity:13,purchasePrice:5},
 {id:'inv-2',code:'STA-0001',category:'stationery',stockQuantity:2,purchasePrice:6},
];
const categories=[{id:'paper'},{id:'office'}];
const assignments=[
 {id:'inv-1',code:'PAP-00001',category:'paper'},
 {id:'inv-2',code:'OFF-00001',category:'office'},
];

test('a complete classification and SKU preview changes no source inventory',()=>{
 const input=structuredClone(items);
 const preview=buildCatalogReclassificationPreview({items,categories,assignments});
 assert.equal(preview.safeToApply,true);
 assert.equal(preview.changedCodeCount,2);
 assert.equal(preview.changedCategoryCount,2);
 assert.deepEqual(items,input);
 assert.deepEqual(preview.changes.map(c=>c.id),['inv-1','inv-2']);
});

test('cannot silently omit a catalog item or invent a new ID',()=>{
 const preview=buildCatalogReclassificationPreview({
  items,categories,assignments:[{id:'inv-3',code:'PAP-00001',category:'paper'}]
 });
 assert.equal(preview.safeToApply,false);
 assert.ok(preview.errors.some(e=>e.kind==='ASSIGNMENT_UNKNOWN_ITEM_ID'));
 assert.ok(preview.errors.some(e=>e.kind==='ITEM_MISSING_FROM_PLAN'));
});

test('duplicate target codes are rejected regardless of case and spacing',()=>{
 const preview=buildCatalogReclassificationPreview({
  items,categories,assignments:[
   {id:'inv-1',code:'SAME-00001',category:'paper'},
   {id:'inv-2',code:' same-00001 ',category:'office'},
  ]
 });
 assert.equal(preview.safeToApply,false);
 assert.ok(preview.errors.some(e=>e.kind==='NEW_CODE_COLLISION'));
});

test('old codes are reserved and cannot be given to a different item',()=>{
 const preview=buildCatalogReclassificationPreview({
  items,categories,assignments:[
   {id:'inv-1',code:'PAP-00001',category:'paper'},
   {id:'inv-2',code:'PRI-0001',category:'office'},
  ]
 });
 assert.equal(preview.safeToApply,false);
 assert.ok(preview.errors.some(e=>e.kind==='REUSES_ANOTHER_ITEMS_HISTORIC_CODE'));
});

test('ambiguous original PRI-0015 is blocked for manual historic-link resolution',()=>{
 const dup=[
  {id:'old-a',code:'PRI-0015',category:'print_raw'},
  {id:'old-b',code:'PRI-0015',category:'print_raw'},
 ];
 const preview=buildCatalogReclassificationPreview({
  items:dup,categories,assignments:[
   {id:'old-a',code:'PAP-00015',category:'paper'},
   {id:'old-b',code:'PAP-00016',category:'paper'},
  ]
 });
 assert.equal(preview.safeToApply,false);
 assert.ok(preview.errors.some(e=>e.kind==='LEGACY_CODE_AMBIGUOUS'));
});
