import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  APPROVED_CATALOG_GROUPS, approvedCatalogCategories, approvedCatalogCounts,
} from './approvedCatalogOptions';

test('only the three approved SKU groups appear, in the required permanent order',()=>{
  const legacySettings=[
    {id:'cat_17942637981',name:'مطبوعات',prefix:'PRI'},
    {id:'cat_179426435016',name:'مطبوعات الأقمشة',prefix:'TEX'},
    {id:'cat_179426617146',name:'أختام',prefix:'STA'},
    {id:'cat_179426790349',name:'مستلزمات ومواد طباعة',prefix:'CAT'},
  ] as any;
  const result=approvedCatalogCategories(legacySettings);
  assert.deepEqual(result.map(c=>[c.id,c.prefix,c.name]),[
    ['print_raw','PRI','مطبعة'],
    ['stationery','BOK','قرطاسية'],
    ['office_supplies','ACC','إكسسوارات'],
  ]);
  assert.deepEqual(APPROVED_CATALOG_GROUPS.map(c=>c.prefix),['PRI','BOK','ACC']);
});

test('historical settings do not affect 24/2/2 counts after reclassification',()=>{
  const inventory=[
    ...Array.from({length:24},()=>({category:'print_raw'})),
    ...Array.from({length:2},()=>({category:'stationery'})),
    ...Array.from({length:2},()=>({category:'office_supplies'})),
  ] as any;
  const groups=approvedCatalogCategories();
  assert.deepEqual(approvedCatalogCounts(inventory,groups).map(c=>c.count),[24,2,2]);
});

test('a distinct, newly approved settings group may be appended, never replacing existing prefixes',()=>{
  const newSettings=[
    {id:'category-materials',name:'مواد أخرى',prefix:'MAT',defaultUnit:'حبة',nameEn:'Other',description:'',color:''},
    {id:'category-old',name:'Legacy textiles',prefix:'TEX',defaultUnit:'حبة',nameEn:'Old',description:'',color:''},
    {id:'category-conflict',name:'Duplicate PRI',prefix:'PRI',defaultUnit:'حبة',nameEn:'Old',description:'',color:''},
  ] as any;
  const groups=approvedCatalogCategories(newSettings);
  assert.deepEqual(groups.map(x=>x.prefix),['PRI','BOK','ACC','MAT']);
});

const file=(part:string)=>readFileSync(new URL(part,import.meta.url),'utf8');

test('category modal and list use approved registry, not retired settings rows',()=>{
  const modal=file('../components/ManageCategoriesModal.tsx');
  const list=file('../components/InventoryView.tsx');
  assert.match(modal,/approvedCatalogCategories\(settings\.categories \|\| \[\]\)/);
  assert.match(list,/approvedCatalogCounts\(inventory, allCategories\)/);
  assert.doesNotMatch(modal,/legacy\.map\(/);
  assert.doesNotMatch(list,/inventoryCategoryOptions\(/);
});

test('unit choices come exclusively from Settings; previous stock units are never extra options',()=>{
  const selector=file('../components/ItemUnitSelector.tsx');
  const unitSettings=file('../components/settings/UnitsOfMeasureSettings.tsx');
  assert.match(selector,/settings\.unitsOfMeasure \|\| \[\]/);
  assert.doesNotMatch(selector,/getProgramUnitsWithCounts/);
  assert.doesNotMatch(selector,/inventory\.map\(/);
  assert.doesNotMatch(selector,/\(غير معتمدة\)/);
  assert.doesNotMatch(unitSettings,/defaultUnitsOfMeasure/);
});

test('currency picker allows only active currencies explicitly saved in Settings',()=>{
  const list=file('../components/InventoryView.tsx');
  assert.match(list,/\(settings\.currencies \|\| \[\]\)\.filter\(c => c\.isActive !== false\)/);
  assert.match(list,/approvedCurrencies\.map\(/);
  assert.doesNotMatch(list,/\{currencies\.map\(/);
});

test('new and edited catalog items must use an approved unit and group on save',()=>{
  const list=file('../components/InventoryView.tsx');
  assert.match(list,/allCategories\.some\(category => category\.id === formCategory\)/);
  assert.match(list,/settings\.unitsOfMeasure \|\| \[\]/);
});
