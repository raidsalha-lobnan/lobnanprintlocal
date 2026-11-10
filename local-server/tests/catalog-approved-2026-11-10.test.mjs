import test from 'node:test';
import assert from 'node:assert/strict';
import {APPROVED_CATEGORIES,PRI_0015_MERGE,makeApprovedCatalogPlan,
 relabelItemReferences,financiallyComparable} from '../catalog-approved-2026-11-10.mjs';

const old={id:PRI_0015_MERGE.fromId,code:'PRI-0015',name:'ملصق A3 مطبوع',
 category:'print_raw',stockQuantity:0,purchasePrice:8,sellingPrice:15,unit:'حبة'};
const canonical={...old,id:PRI_0015_MERGE.intoId,
 customerSpecialPrices:[{customerId:'c1',price:10}],sellingPrice2:10};
const makeItems=()=>[
 ...Array.from({length:13},(_,i)=>({id:'p'+i,code:'PRI-'+String(i+1).padStart(4,'0'),category:'print_raw'})),
 structuredClone(old),structuredClone(canonical),
 ...Array.from({length:5},(_,i)=>({id:'t'+i,code:'TEX-'+String(i+1).padStart(4,'0'),category:'textiles'})),
 {id:'x1',code:'STA-0001',category:'printing'},
 {id:'x2',code:'STAT-0001',category:'printing'},
 {id:'x3',code:'PRA-0003',category:'stationery'},
 {id:'x4',code:'ITM-7354',category:'printing'},
 {id:'x5',code:'ITM-9183',category:'printing'},
 {id:'x6',code:'STAT-0002',category:'stationery',name:'رصيد جوال'},
 {id:'inv-1791550155857-d334m',code:'PRA-0001',category:'stationery'},
 {id:'inv-1791550182684-sy5s0',code:'PRA-0002',category:'stationery'},
 {id:'inv-1793524893878-q0w4b',code:'PRA-0004',category:'stationery'},
];
test('29 original IDs produce 28 distinct catalog products (25 PRI, 2 BOK, 1 ACC)',()=>{
 const items=makeItems(),original=structuredClone(items);
 const plan=makeApprovedCatalogPlan(items);
 assert.equal(plan.entries.length,28);
 assert.deepEqual(plan.groups,{PRI:25,BOK:2,ACC:1});
 assert.equal(APPROVED_CATEGORIES.length,3);
 assert.equal(plan.entries.find(x=>x.id===canonical.id).newCode,'PRI-00014');
 assert.equal(plan.entries.find(x=>x.id==='x6').newCode,'PRI-00025');
 assert.equal(plan.entries.find(x=>x.id==='inv-1791550155857-d334m').newCode,'BOK-00001');
 assert.equal(plan.entries.find(x=>x.id==='inv-1791550182684-sy5s0').newCode,'BOK-00002');
 assert.equal(plan.entries.find(x=>x.id==='inv-1793524893878-q0w4b').newCode,'ACC-00001');
 assert.equal(new Set(plan.entries.map(x=>x.newCode)).size,28);
 assert.equal(plan.aliases.get(old.id),canonical.id);
 assert.equal(plan.merge.originalInto.customerSpecialPrices[0].price,10);
 assert.deepEqual(items,original);
});
test('reject catalog drift and ambiguous duplicate or different prices',()=>{
 assert.throws(()=>makeApprovedCatalogPlan(makeItems().slice(1)),/29/);
 const changed=makeItems();changed.find(x=>x.id===old.id).code='PRI-0014';
 assert.throws(()=>makeApprovedCatalogPlan(changed),/LEGACY_DUPLICATE/);
 const wrong=makeItems();wrong.find(x=>x.id===old.id).sellingPrice=18;
 assert.throws(()=>makeApprovedCatalogPlan(wrong),/DUPLICATE_PRODUCT_FIELD_MISMATCH/);
});
test('catalog identity merge stops if retired record has warehouse stock or conflicting unit',()=>{
 const stock=makeItems();
 stock.find(x=>x.id===old.id).warehouseStock={MAIN:3};
 assert.throws(()=>makeApprovedCatalogPlan(stock),/DUPLICATE_SOURCE_WAREHOUSE_BALANCE/);
 const unit=makeItems();
 unit.find(x=>x.id===old.id).unitId='kg';
 unit.find(x=>x.id===canonical.id).unitId='pcs';
 assert.throws(()=>makeApprovedCatalogPlan(unit),/DUPLICATE_SOURCE_UNIT_ID_CONFLICT/);
});

test('duplicate invoice and stock pointers canonicalize without touching amounts',()=>{
 const plan=makeApprovedCatalogPlan(makeItems());
 const byId=new Map(plan.entries.map(x=>[x.id,x]));
 const invoice={id:'inv-1',total:123.45,items:[
  {itemId:old.id,itemCode:'PRI-0015',category:'print_raw',
   quantity:3,unitPrice:12.34,total:37.02,tax:0,discount:1},
  {itemId:'srv-delivery',itemCode:'DELIVERY',quantity:1,unitPrice:5,total:5}
 ],paidAmount:50,balanceDue:73.45};
 const orig=structuredClone(invoice);
 const {value:after,changed}=relabelItemReferences(invoice,byId,plan.aliases);
 assert.equal(changed,true);
 assert.equal(after.items[0].itemId,canonical.id);
 assert.equal(after.items[0].itemCode,'PRI-00014');
 assert.equal(after.items[0].unitPrice,12.34);
 assert.equal(after.items[0].total,37.02);
 assert.equal(after.items[0].quantity,3);
 assert.equal(after.items[1].itemCode,'DELIVERY');
 assert.deepEqual(financiallyComparable(orig,plan.aliases),financiallyComparable(after,plan.aliases));
 assert.deepEqual(invoice,orig);
 const stock={id:'sm-1',itemId:old.id,itemCode:'PRI-0015',
   quantity:2,unitCost:8,totalCost:16};
 const sm=relabelItemReferences(stock,byId,plan.aliases).value;
 assert.equal(sm.itemId,canonical.id);
 assert.equal(sm.totalCost,16);
});
