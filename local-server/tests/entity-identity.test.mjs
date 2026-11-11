import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStableEntitySerial,allocateAutomaticEntityCode} from '../entity-identity.mjs';

const fake=(existing=[])=>({
 async query(sql,params){
  assert.match(sql,/record_id<>\$3/);
  const [,entity,id,field,serial]=params;
  return {rows:existing.filter(x=>x.entity===entity && x.id!==id &&
    String(x.value[field]).trim().toLowerCase()===String(serial).trim().toLowerCase())
   .map(x=>({record_id:x.id}))};
 }
});
test('changing the customer display name keeps code and requires no serial allocation',async()=>{
 const db={query:async()=>{throw Error('unexpected identity lookup')}};
 await assertStableEntitySerial(db,'lobnan_main','parties','p1',{code:'PT-0025',name:'Old',balance:320},
  {code:'PT-0025',name:'New',balance:320});
});
test('a customer or inventory serial may never be reassigned on an existing record',async()=>{
 for(const entity of ['parties','inventory']){
  await assert.rejects(assertStableEntitySerial(fake(),'lobnan_main',entity,'i1',
   {code:'PRI-0015',name:'Old'},{code:'PRI-0016',name:'Old'}),/ENTITY_SERIAL_IMMUTABLE/);
 }
});
test('a new item with a serial already used by another item is rejected',async()=>{
 const existing=[{entity:'inventory',id:'item-old',value:{code:'PRI-0015'}}];
 await assert.rejects(assertStableEntitySerial(fake(existing),'lobnan_main','inventory',
  'item-new',null,{code:'PRI-0015',name:'Other name'}),/ENTITY_SERIAL_ALREADY_USED/);
 await assertStableEntitySerial(fake(existing),'lobnan_main','inventory','item-new',
  null,{code:'PRI-0016',name:'New'});
});
test('treasury account-code is permanent even if treasury name changes',async()=>{
 const db=fake([{entity:'treasuries',id:'t1',value:{accountCode:'1101'}}]);
 await assertStableEntitySerial(db,'lobnan_main','treasuries','t1',
  {accountCode:'1101',name:'Cash'},{accountCode:'1101',name:'Main cash'});
 await assert.rejects(assertStableEntitySerial(db,'lobnan_main','treasuries','t1',
  {accountCode:'1101'},{accountCode:'1102'}),/ENTITY_SERIAL_IMMUTABLE/);
});

test('new customers, items and cashboxes require their own permanent visible code',async()=>{
 for(const [entity,field] of [['parties','code'],['inventory','code'],['treasuries','accountCode']]){
  await assert.rejects(assertStableEntitySerial(fake(),'lobnan_main',entity,'new',null,{name:'New'}),
   /ENTITY_SERIAL_REQUIRED/);
 }
});

test('category of an existing inventory item is immutable outside audited migration',async()=>{
 const current={id:'sku-1',code:'PRI-0001',category:'print_raw',name:'Printing item',stockQuantity:10};
 const db={query:async()=>{throw Error('no duplicate query expected for an unchanged identity')}};
 await assertStableEntitySerial(db,'lobnan_main','inventory','sku-1',current,
   {...current,name:'Renamed for display'});
 await assert.rejects(
   assertStableEntitySerial(db,'lobnan_main','inventory','sku-1',current,
     {...current,category:'stationery'}),
   /ENTITY_SERIAL_IMMUTABLE/
 );
});

test('multiple inventory products may share a category without duplicate-category rejection',async()=>{
 const existing=[
  {entity:'inventory',id:'item-old',value:{id:'item-old',code:'PRI-0001',category:'printing',name:'Paper'}},
  {entity:'inventory',id:'item-other',value:{id:'item-other',code:'PRI-0002',category:'printing',name:'Ink'}}
 ];
 const calls=[];
 const db={query:async(sql,params)=>{
  calls.push(params[3]);
  const [,entity,id,field,serial]=params;
  return {rows:existing.filter(x=>x.entity===entity&&x.id!==id&&
    String(x.value[field]??'').trim().toLowerCase()===String(serial).trim().toLowerCase())
    .map(x=>({record_id:x.id}))};
 }};
 await assertStableEntitySerial(db,'lobnan_main','inventory','item-new',null,
  {code:'PRI-0003',category:'printing',name:'More paper'});
 assert.deepEqual(calls,['code']);
 await assert.rejects(
  assertStableEntitySerial(db,'lobnan_main','inventory','item-new',null,
   {code:'PRI-0001',category:'printing',name:'Duplicate code'}),
  /ENTITY_SERIAL_ALREADY_USED/
 );
});

test('two concurrent devices proposing the same auto customer code receive distinct serials under workspace lock',async()=>{
 const rows=[{code:'CUST-0020'},{code:'CUST-0021'}];
 const db={query:async(sql,args)=>{
  assert.match(sql,/value->>'code' AS code/);
  assert.equal(args[1],'parties');
  return {rows};
 }};
 const proposed={id:'pt-new',code:'CUST-0021',name:'Customer',_serverAutoCode:true};
 const allocated=await allocateAutomaticEntityCode(db,'lobnan_main','parties','pt-new',null,proposed);
 assert.equal(allocated.code,'CUST-0022');
 assert.equal(allocated.id,'pt-new');
 assert.equal(allocated._serverAutoCode,undefined);
 rows.push({code:allocated.code});
 const next=await allocateAutomaticEntityCode(db,'lobnan_main','parties','pt-new2',null,proposed);
 assert.equal(next.code,'CUST-0023');
});

test('automatic stock SKU preserves approved five-digit prefix, and manual serial is never rewritten',async()=>{
 const rows=[{code:'PRI-00024'},{code:'PRI-00025'},{code:'PRI-00026'}];
 const db={query:async(sql,args)=>{assert.equal(args[1],'inventory');return {rows};}};
 const newItem={id:'item-next',code:'PRI-00025',category:'printing',_serverAutoCode:true};
 const result=await allocateAutomaticEntityCode(db,'lobnan_main','inventory','item-next',null,newItem);
 assert.equal(result.code,'PRI-00027');
 assert.equal(result.category,'printing');
 const manual=await allocateAutomaticEntityCode(db,'lobnan_main','inventory','item-manual',null,
  {code:'PRI-00025',category:'printing'});
 assert.equal(manual.code,'PRI-00025');
 await assert.rejects(assertStableEntitySerial({
  query:async()=>({rows:[{record_id:'item-existing'}]})
 },'lobnan_main','inventory','item-manual',null,manual),/ENTITY_SERIAL_ALREADY_USED/);
});

test('existing customer code cannot be silently renumbered by an auto marker',async()=>{
 const existing={id:'pt-123',code:'CUST-0072',name:'Earlier'};
 const proposed={...existing,code:'CUST-0073',name:'Updated',_serverAutoCode:true};
 const result=await allocateAutomaticEntityCode({query:async()=>{throw Error('unexpected query')}},
  'lobnan_main','parties','pt-123',existing,proposed);
 assert.equal(result.code,'CUST-0073');
 await assert.rejects(assertStableEntitySerial({query:async()=>{throw Error('unexpected query')}},
  'lobnan_main','parties','pt-123',existing,result),/ENTITY_SERIAL_IMMUTABLE/);
});

test('CUST-0001 is reserved for the cash customer even without cached customer records',async()=>{
 const db={query:async()=>({rows:[]})};
 const created=await allocateAutomaticEntityCode(db,'lobnan_main','parties','pt-fresh',null,
  {id:'pt-fresh',name:'Normal customer',type:'customer',code:'CUST-0001',_serverAutoCode:true});
 assert.equal(created.code,'CUST-0002');
 await assertStableEntitySerial(db,'lobnan_main','parties','pt-fresh',null,created);
 await assert.rejects(
  assertStableEntitySerial(db,'lobnan_main','parties','pt-manual',null,
    {id:'pt-manual',name:'Normal customer',code:'CUST-0001'}),
  /CASH_CUSTOMER_CODE_RESERVED/
 );
});
