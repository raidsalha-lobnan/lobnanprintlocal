import test from 'node:test';
import assert from 'node:assert/strict';
import type {Party} from '../types';
import {
  findSubCustomerForSale,registeredSubCustomer,subCustomerParentId,
  normalizeSubCustomerName
} from './subCustomerIdentity';

const sub=(id:string,parentPartyId:string,name:string):Party => ({
  id,code:id,type:'customer',name,parentPartyId,
  isSubCustomer:true,balance:0,openingBalance:0
} as Party);

test('POS reuses sub-customer by name only under the selected parent',()=>{
  const parties=[sub('sub-a','parent-a','مؤمن الدرفيل'),sub('sub-b','parent-b','مؤمن الدرفيل')];
  assert.equal(findSubCustomerForSale(parties,'parent-a','مؤمن الدرفيل')?.id,'sub-a');
  assert.equal(findSubCustomerForSale(parties,'parent-b','مؤمن الدرفيل')?.id,'sub-b');
});
test('stale selected sub ID for another parent cannot transfer a debtor',()=>{
  const parties=[sub('sub-a','parent-a','مؤمن الدرفيل'),sub('sub-b','parent-b','مؤمن الدرفيل')];
  assert.equal(findSubCustomerForSale(parties,'parent-a','مؤمن الدرفيل','sub-b')?.id,'sub-a');
  assert.equal(findSubCustomerForSale(parties,'parent-c','مؤمن الدرفيل','sub-b'),undefined);
});
test('matching selected ID stays valid if the name was edited',()=>{
  const parties=[sub('sub-a','parent-a','اسم جديد')];
  assert.equal(findSubCustomerForSale(parties,'parent-a','اسم قديم','sub-a')?.id,'sub-a');
});
test('historical parentCustomerId alias stays supported',()=>{
  const legacy={...sub('sub-legacy','unused','مؤمن الدرفيل'),
    parentPartyId:undefined,parentCustomerId:'parent-a'} as Party;
  assert.equal(subCustomerParentId(legacy),'parent-a');
  assert.equal(registeredSubCustomer([legacy],'parent-a','مؤمن الدرفيل')?.id,'sub-legacy');
});
test('different parents and missing parent IDs never match by text alone',()=>{
  const parties=[sub('sub-a','parent-a','أبو أحمد')];
  assert.equal(findSubCustomerForSale(parties,'','أبو أحمد'),undefined);
  assert.equal(findSubCustomerForSale(parties,'parent-b','أبو أحمد'),undefined);
});
test('normalization tolerates diacritics but does not collapse distinct names',()=>{
  const parties=[sub('sub-a','parent-a','مُؤْمِن الدرفيل')];
  assert.equal(findSubCustomerForSale(parties,'parent-a','مؤمن الدرفيل')?.id,'sub-a');
  assert.notEqual(normalizeSubCustomerName('مؤمن الدرفيل'),normalizeSubCustomerName('مؤمن الخليل'));
});
