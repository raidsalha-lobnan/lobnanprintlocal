import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccess,authorizeCommand} from '../access-policy.mjs';

// Regression: permissions are assigned to users/roles, not to the physical device.
const workspace='lobnan_main';
const role={code:'STAFF',permissions:{view:true,view_pos:true,add:true,edit:true}};
const makeUser=id=>({id,status:'active',roleId:'staff',companyId:'company',
  allowedBranchIds:['branch'],customPermissions:{}});
const records=new Map();
const pool={query:async(sql,params)=>{
  if(sql.includes("entity='roles'"))return {rows:[{value:role}]};
  if(sql.includes('SELECT fingerprint,actor_id FROM sync_commands'))return {rows:[]};
  if(sql.includes('SELECT value FROM sync_records')){
    const value=records.get(params[1]+':'+params[2]);
    return {rows:value==null?[]:[{value}]};
  }
  throw new Error('Unexpected SQL in permission regression: '+sql);
}};

test('two authorized users can independently create items and edit shared items',async()=>{
  const first=await resolveAccess(pool,workspace,makeUser('main-device'));
  const second=await resolveAccess(pool,workspace,makeUser('second-device'));
  const item={id:'item-1',name:'New product',branchId:'branch',companyId:'company',
    code:'PRI-0044',stockQuantity:0};
  const change={entity:'inventory',id:item.id,expectedVersion:0,value:item};
  await authorizeCommand(pool,workspace,first,{id:'create-main',changes:[change]});
  await authorizeCommand(pool,workspace,second,{id:'create-second',changes:[change]});
  records.set('inventory:item-1',item);
  await authorizeCommand(pool,workspace,second,{id:'edit-second',changes:[{
    ...change,expectedVersion:1,value:{...item,name:'Updated product'}
  }]});
});

test('an explicit per-user add denial still applies to the second device',async()=>{
  const restricted=await resolveAccess(pool,workspace,{
    ...makeUser('restricted-device'),customPermissions:{add:false}
  });
  await assert.rejects(authorizeCommand(pool,workspace,restricted,{
    id:'blocked-new-item',changes:[{entity:'inventory',id:'another-item',
      expectedVersion:0,value:{id:'another-item',branchId:'branch',companyId:'company'}}]
  }),error=>error.message==='ENTITY_PERMISSION_DENIED'&&
    error.detail.requiredPermission==='add');
});

test('device identity never bypasses branch restrictions',async()=>{
  const outOfBranch=await resolveAccess(pool,workspace,{
    ...makeUser('remote-device'),allowedBranchIds:['another-branch']
  });
  await assert.rejects(authorizeCommand(pool,workspace,outOfBranch,{
    id:'blocked-other-branch',changes:[{entity:'inventory',id:'branch-item',
      expectedVersion:0,value:{id:'branch-item',branchId:'branch',companyId:'company'}}]
  }),/ENTITY_PERMISSION_DENIED/);
});
