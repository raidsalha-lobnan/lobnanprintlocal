import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccess,filterSnapshot,filterEvents,authorizeCommand}
  from '../access-policy.mjs';

const user={id:'u1',status:'active',roleId:'cashier',companyId:'c1',username:'worker',
  allowedBranchIds:['b1'],customPermissions:{}};
function makePool(role, records={}){
  return {query:async (sql,params)=>{
    if(sql.includes("entity='roles'"))
      return {rows:role?[{value:role}]:[]};
    if(sql.includes('SELECT fingerprint,actor_id FROM sync_commands'))return {rows:[]};
    if(sql.includes('SELECT value FROM sync_records'))
      return {rows:records[params[1]+':'+params[2]]?[{value:records[params[1]+':'+params[2]]}]:[]};
    throw Error('UNEXPECTED_QUERY '+sql);
  }};
}
const cashier={code:'CASHIER',permissions:{view:true,view_pos:true,add:true,edit:false}};

test('deny unimported roles and missing permissions by default',async()=>{
  await assert.rejects(resolveAccess(makePool(null),'lobnan_main',user),/ROLE_NOT_IMPORTED/);
  const access=await resolveAccess(makePool({code:'EMPTY',permissions:{}}),'lobnan_main',user);
  assert.equal(access.canRead('invoices',{branchId:'b1',companyId:'c1'},'i1'),false);
  assert.equal(access.canChange('invoices',{branchId:'b1'},null),false);
});

test('cashier can read and add on assigned branch, not a different branch',async()=>{
  const access=await resolveAccess(makePool(cashier),'lobnan_main',user);
  assert.equal(access.canRead('invoices',{branchId:'b1',companyId:'c1'},'i1'),true);
  assert.equal(access.canRead('inventory',{branchId:'b1',companyId:'c1'},'p1'),true);
  assert.equal(access.canRead('invoices',{branchId:'b2',companyId:'c1'},'i2'),false);
  assert.equal(access.canRead('invoices',{branchId:'b1',companyId:'c2'},'i3'),false);
  assert.equal(access.canChange('invoices',{branchId:'b1',companyId:'c1'},null),true);
  assert.equal(access.canChange('invoices',{branchId:'b2'},null),false);
  assert.equal(access.canChange('invoices',{branchId:'b1'}, {branchId:'b1'}),false);
  assert.equal(access.canChange('users',{id:'u1'},null),false);
  assert.equal(access.canChange('invoices',null,{branchId:'b1'}),false);
  assert.equal(access.canRead('users',{id:'u1'},'u1'),true);
  assert.equal(access.canRead('users',{id:'u2'},'u2'),false);
});

test('server filters branch-scoped bootstrap and event data',async()=>{
  const access=await resolveAccess(makePool(cashier),'lobnan_main',user);
  const records=[
    {entity:'invoices',id:'i1',value:{branchId:'b1'}},
    {entity:'invoices',id:'i2',value:{branchId:'b2'}},
    {entity:'users',id:'u1',value:{id:'u1'}},
    {entity:'users',id:'u2',value:{id:'u2'}},
  ];
  assert.deepEqual(filterSnapshot({records,cursor:3},access).records.map(r=>r.id),['i1','u1']);
  const events=filterEvents([{cursor:4,changes:[
    {entity:'invoices',id:'i1',value:{branchId:'b1'}},
    {entity:'invoices',id:'i2',value:{branchId:'b2'}},
    {entity:'invoices',id:'old',value:null}
  ]}],access);
  assert.deepEqual(events[0].changes.map(c=>c.id),['i1']);
  assert.equal(events[0].cursor,4);
});

test('bulk command authorization rejects mixed-branch writes atomically before SQL commit',async()=>{
  const pool=makePool(cashier);
  const access=await resolveAccess(pool,'lobnan_main',user);
  await assert.rejects(authorizeCommand(pool,'lobnan_main',access,{changes:[
    {entity:'invoices',id:'new1',value:{branchId:'b1'}},
    {entity:'invoices',id:'new2',value:{branchId:'b2'}}
  ]}),/ENTITY_PERMISSION_DENIED/);
});

test('financial tombstones and finalized invoice modifications are prohibited',async()=>{
  const pool=makePool({...cashier,permissions:{...cashier.permissions,edit:true}},{
    'invoices:i1':{id:'i1',branchId:'b1',isOfficial:true}});
  const access=await resolveAccess(pool,'lobnan_main',user);
  await assert.rejects(authorizeCommand(pool,'lobnan_main',access,{changes:[
    {entity:'invoices',id:'i1',value:{id:'i1',branchId:'b1',isOfficial:true,total:25}}
  ]}),/ENTITY_PERMISSION_DENIED/);
  await assert.rejects(authorizeCommand(pool,'lobnan_main',access,{changes:[
    {entity:'invoices',id:'i1',value:null}
  ]}),/ENTITY_PERMISSION_DENIED/);
});

test('admin requires imported system role or explicit configuration, not account name',async()=>{
  const adminLike={...user,id:'admin',username:'admin',roleId:'role-admin'};
  await assert.rejects(resolveAccess(makePool(null),'lobnan_main',adminLike),/ROLE_NOT_IMPORTED/);
  const explicit=await resolveAccess(makePool(null),'lobnan_main',adminLike,'admin');
  assert.equal(explicit.admin,true);
});
