import test from 'node:test';
import assert from 'node:assert/strict';
import {APPROVED_CATEGORIES,makeApprovedCatalogPlan,relabelItemReferences} from '../catalog-approved-2026-11-10.mjs';

const makeItems=()=>{
 const a=[
  ...Array.from({length:13},(_,i)=>({id:'p'+i,code:'PRI-'+String(i+1).padStart(4,'0'),category:'print_raw'})),
  {id:'inv-1793517199296-r472u',code:'PRI-0015',category:'print_raw'},
  {id:'inv-1793642210292-e79n2',code:'PRI-0015',category:'print_raw'},
  ...Array.from({length:5},(_,i)=>({id:'t'+i,code:'TEX-'+String(i+1).padStart(4,'0'),category:'textiles'})),
  {id:'x1',code:'STA-0001',category:'x'},
  {id:'x2',code:'STAT-0001',category:'x'},
  {id:'x3',code:'PRA-0003',category:'stationery'},
  {id:'x4',code:'ITM-7354',category:'x'},
  {id:'x5',code:'ITM-9183',category:'x'},
  {id:'inv-1791550155857-d334m',code:'PRA-0001',category:'stationery'},
  {id:'inv-1791550182684-sy5s0',code:'PRA-0002',category:'stationery'},
  {id:'inv-1793524893878-q0w4b',code:'PRA-0004',category:'stationery'}
 ];
 return a;
};
test('exact 3 groups and fixed permanent IDs produce 25+2+1 distinct codes',()=>{
 const plan=makeApprovedCatalogPlan(makeItems());
 assert.equal(plan.length,28);
 assert.equal(APPROVED_CATEGORIES.length,3);
 assert.equal(plan.filter(x=>x.newCode.startsWith('PRI-')).length,25);
 assert.equal(plan.filter(x=>x.newCode.startsWith('BOK-')).length,2);
 assert.equal(plan.filter(x=>x.newCode.startsWith('ACC-')).length,1);
 assert.equal(new Set(plan.map(x=>x.newCode)).size,28);
 assert.equal(plan.find(x=>x.id==='inv-1791550155857-d334m').newCode,'BOK-00001');
 assert.equal(plan.find(x=>x.id==='inv-1791550182684-sy5s0').newCode,'BOK-00002');
 assert.equal(plan.find(x=>x.id==='inv-1793524893878-q0w4b').newCode,'ACC-00001');
});
test('reject catalog count drift and a changed historical duplicate',()=>{
 assert.throws(()=>makeApprovedCatalogPlan(makeItems().slice(1)),/28/);
 const arr=makeItems();arr.find(x=>x.id==='inv-1793517199296-r472u').code='PRI-0014';
 assert.throws(()=>makeApprovedCatalogPlan(arr),/LEGACY_DUPLICATE/);
});
test('invoice and stock code relinking keeps every financial number and itemId',()=>{
 const plan=makeApprovedCatalogPlan(makeItems());
 const map=new Map(plan.map(x=>[x.id,x]));
 const original={
  id:'invoice-a',total:123.45,items:[
   {id:'line1',itemId:'inv-1791550155857-d334m',itemCode:'PRA-0001',category:'stationery',
    quantity:6,unitPrice:12.34,total:74.04,tax:0,discount:1},
   {id:'line2',itemId:'srv-delivery',itemCode:'DELIVERY',category:'services',quantity:1,unitPrice:5,total:5}
  ],paidAmount:50,balanceDue:73.45,
 };
 const frozen=structuredClone(original);
 const changed=relabelItemReferences(original,map);
 assert.equal(changed.changed,true);
 assert.equal(changed.value.items[0].itemCode,'BOK-00001');
 assert.equal(changed.value.items[0].category,'stationery');
 assert.equal(changed.value.items[1].itemCode,'DELIVERY');
 assert.equal(changed.value.items[0].total,74.04);
 assert.equal(changed.value.paidAmount,50);
 assert.equal(changed.value.balanceDue,73.45);
 assert.deepEqual(original,frozen);
});
