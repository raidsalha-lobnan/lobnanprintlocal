import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveApprovedCatalogSettings,APPROVED_CATALOG_MIGRATION_ID,classifyApprovedCatalogError} from '../approved-settings-guard.mjs';
import {SyncService} from '../sync-service.mjs';

const approved=[
  {id:'print_raw',name:'مطبعة',prefix:'PRI'},
  {id:'stationery',name:'قرطاسية',prefix:'BOK'},
  {id:'office_supplies',name:'أصناف متنوعة واكسسوارات',prefix:'ACC'},
];
const legacy=[...approved,{id:'old_print',name:'تصنيف سابق',prefix:'OLD'}];
const original={id:'global',businessName:'منشأة',categories:approved,
  headerImageUrl:'data:image/png;base64,HEAD',
  currencies:[{code:'ILS',rateAgainstBase:1}],
  unitsOfMeasure:[{code:'EA',name:'حبة'}]};
const next={...original,categories:legacy,
  headerImageUrl:'data:image/png;base64,NEWHEAD',
  currencies:[{code:'ILS',rateAgainstBase:1},{code:'USD',rateAgainstBase:3.5}],
  unitsOfMeasure:[{code:'EA',name:'حبة'},{code:'BOX',name:'كرتون'}]};

test('SQL approved-category trigger is a non-retryable HTTP 409, never a generic HTTP 500',()=>{
  const original=new Error('APPROVED_CATEGORY_DEFINITIONS_IMMUTABLE');
  const classified=classifyApprovedCatalogError(original);
  assert.equal(classified.message,'APPROVED_CATEGORY_DEFINITIONS_IMMUTABLE');
  assert.equal(classified.status,409);
  assert.equal(classifyApprovedCatalogError(new Error('OTHER_ERROR')).message,'OTHER_ERROR');
});
test('approved category definitions stay identical to authoritative PostgreSQL while other settings can change',()=>{
 const result=preserveApprovedCatalogSettings(original,next,true);
 assert.equal(APPROVED_CATALOG_MIGRATION_ID,'catalog-pri-bok-acc-2026-11-10-v2-105');
 assert.deepEqual(result.value.categories,approved);
 assert.equal(result.value.headerImageUrl,next.headerImageUrl);
 assert.deepEqual(result.value.currencies,next.currencies);
 assert.deepEqual(result.value.unitsOfMeasure,next.unitsOfMeasure);
 assert.equal(result.guarded,true);
 assert.equal(next.categories.length,4);
 assert.equal(original.categories.length,3);
});
test('missing and rewritten categories in old queue are restored to the three approved groups',()=>{
 for(const value of [{...next,categories:[]},{...next,categories:undefined}]){
  const result=preserveApprovedCatalogSettings(original,value,true);
  assert.deepEqual(result.value.categories,approved);
 }
});
test('unapproved workspace still allows ordinary category configuration',()=>{
 const result=preserveApprovedCatalogSettings(original,next,false);
 assert.equal(result.value.categories.length,4);
 assert.equal(result.guarded,false);
});
test('approved catalog never invents category definitions when authoritative record is absent',()=>{
 assert.throws(()=>preserveApprovedCatalogSettings(null,next,true),/APPROVED_CATEGORY_BASELINE_MISSING/);
});
test('SQL write path accepts stale category snapshot without bypassing database protection',async()=>{
 const writes=[];
 const client={
  async query(sql,params=[]){
   if(sql.startsWith('INSERT INTO sync_workspaces'))return {rows:[]};
   if(sql.startsWith('SELECT next_sequence,next_invoice FROM sync_workspaces'))return {rows:[{next_sequence:446,next_invoice:112}]};
   if(sql.startsWith('SELECT fingerprint,receipt,actor_id FROM sync_commands'))return {rows:[]};
   if(sql.startsWith('SELECT version,value FROM sync_records'))return {rows:[{version:13,value:original}]};
   if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM sync_catalog_admin_migrations'))return {rows:[{approved:true}]};
   if(sql.startsWith('UPDATE sync_records SET version=')){
    writes.push(params[4]);
    if(params[4].categories.length!==3)throw Error('APPROVED_CATEGORY_DEFINITIONS_IMMUTABLE');
    return {rows:[]};
   }
   if(sql.startsWith('UPDATE sync_workspaces')||sql.startsWith('INSERT INTO sync_commands')||sql.startsWith('INSERT INTO sync_events'))return {rows:[]};
   throw Error('UNEXPECTED_TEST_SQL: '+sql.slice(0,95));
  }
 };
 const command={id:'safe-test-settings',workspaceId:'lobnan_main',changes:[{
  entity:'settings',id:'global',expectedVersion:13,value:next
 }]};
 const service=new SyncService(null);
 const receipt=await service.pushInTx('lobnan_main',command,'test-actor',client);
 assert.equal(writes.length,1);
 assert.deepEqual(writes[0].categories,approved);
 assert.equal(writes[0].headerImageUrl,next.headerImageUrl);
 assert.deepEqual(receipt.changes[0].value.categories,approved);
 assert.equal(receipt.changes[0].version,14);
});
