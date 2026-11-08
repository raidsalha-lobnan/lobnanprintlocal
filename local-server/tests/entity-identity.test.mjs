import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStableEntitySerial} from '../entity-identity.mjs';

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
