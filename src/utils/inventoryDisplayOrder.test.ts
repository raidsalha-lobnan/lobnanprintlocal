import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryCategoryOptions, sortInventoryForDisplay} from './inventoryDisplayOrder';

const stock = [
  {id:'5',code:'B-0010',name:'Ten',category:'b'},
  {id:'3',code:'A-0003',name:'Third',category:'a'},
  {id:'1',code:'A-0001',name:'First',category:'a'},
  {id:'4',code:'B-0002',name:'Two',category:'b'},
  {id:'2',code:'A-0002',name:'Second',category:'a'},
  {id:'6',code:'X-0001',name:'Legacy',category:'legacy'},
];
const groups = [{id:'b',name:'Group B'}, {id:'a',name:'Group A'}];

test('inventory is grouped in configured order, then ordered by natural SKU',()=>{
  const ordered=sortInventoryForDisplay(stock,groups);
  assert.deepEqual(ordered.map(x=>x.id),['4','5','1','2','3','6']);
  assert.deepEqual(stock.map(x=>x.id),['5','3','1','4','2','6']);
});
test('unknown categories follow known ones without interleaving',()=>{
  assert.deepEqual(sortInventoryForDisplay(stock.filter(x=>x.category!=='a'),groups).map(x=>x.id),['4','5','6']);
});
test('filter choices include configured and legacy groups with counts',()=>{
  assert.deepEqual(inventoryCategoryOptions(stock,groups,{legacy:{name:'Legacy Items'}}),[
    {id:'b',name:'Group B',count:2},
    {id:'a',name:'Group A',count:3},
    {id:'legacy',name:'Legacy Items',count:1}
  ]);
});
test('empty inventory keeps configured groups available for filtering',()=>{
  assert.equal(inventoryCategoryOptions([],groups).length,2);
});