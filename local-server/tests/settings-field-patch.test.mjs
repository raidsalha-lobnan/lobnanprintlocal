import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {SyncService} from '../sync-service.mjs';
import {
  applySettingsFieldPatch,findVerifiedSettingsReceipts,stableJson,
} from '../settings-field-patch.mjs';

const digest = value=>crypto.createHash('sha256').update(stableJson(value)).digest('hex');
const baseline={id:'global',businessName:'Old',headerImageUrl:'data:image/png;base64,GOOD',currency:'ILS',
  unitsOfMeasure:[{code:'ea',name:'حبة'}]};
const patch=(key,base,next)=>({id:'global',_settingsPatchV1:true,
  changes:{[key]:next},before:{[key]:digest(base)}});

test('authorized logo change preserves currency, units and unrelated phone changed by another device',()=>{
  const server={...baseline,phone:'02-333333'};
  const candidate=applySettingsFieldPatch(server,
    patch('headerImageUrl',baseline.headerImageUrl,'data:image/png;base64,NEW'),5,3);
  assert.equal(candidate.headerImageUrl,'data:image/png;base64,NEW');
  assert.equal(candidate.currency,'ILS');
  assert.equal(candidate.phone,'02-333333');
  assert.deepEqual(candidate.unitsOfMeasure,baseline.unitsOfMeasure);
  assert.equal(candidate._settingsPatchV1,undefined);
});
test('same-field change on another device blocks overwrite, except identical already-applied value',()=>{
  const request=patch('businessName','Old','Device A');
  assert.throws(()=>applySettingsFieldPatch({...baseline,businessName:'Device B'},request,9,6),
    e=>e.message==='SETTINGS_FIELD_CONFLICT'&&e.status===409);
  assert.equal(applySettingsFieldPatch({...baseline,businessName:'Device A'},request,10,6).businessName,'Device A');
});
test('currency and VAT edits on separate fields do not conflict; changing same field does',()=>{
  const server={...baseline,vatRate:0.16};
  assert.equal(applySettingsFieldPatch(server,patch('currency','ILS','USD'),6,5).vatRate,0.16);
  assert.throws(()=>applySettingsFieldPatch({...baseline,currency:'EUR'},
    patch('currency','ILS','USD'),6,5),/SETTINGS_FIELD_CONFLICT/);
});
test('only approved fields and hashes accepted; future server version cannot be invented',()=>{
  assert.throws(()=>applySettingsFieldPatch(baseline,patch('sqlServerConfig',undefined,{password:'secret'}),1,1),
    /SETTINGS_FIELD_NOT_ALLOWED/);
  assert.throws(()=>applySettingsFieldPatch(baseline,patch('phone',undefined,'02'),0,1),
    /SETTINGS_VERSION_IN_FUTURE/);
  const p=patch('phone',undefined,'02');p.before.phone='untrusted';
  assert.throws(()=>applySettingsFieldPatch(baseline,p,1,1),/SETTINGS_BASE_HASH_REQUIRED/);
});
test('SQL sync commit merges a stale-version letterhead patch atomically without changing registered currency or units',async()=>{
  const approved=[
    {id:'print_raw',name:'مطبعة',prefix:'PRI'},
    {id:'stationery',name:'مكتبة',prefix:'BOK'},
    {id:'office_supplies',name:'اكسسوارات',prefix:'ACC'},
  ];
  const original={...baseline,categories:approved};
  const writes=[];
  const client={
    async query(sql,args=[]){
      if(sql.startsWith('INSERT INTO sync_workspaces'))return {rows:[]};
      if(sql.startsWith('SELECT next_sequence,next_invoice FROM sync_workspaces'))
        return {rows:[{next_sequence:150,next_invoice:112}]};
      if(sql.startsWith('SELECT fingerprint,receipt,actor_id FROM sync_commands'))return {rows:[]};
      if(sql.startsWith('SELECT version,value FROM sync_records'))return {rows:[{version:20,value:original}]};
      if(sql.startsWith('SELECT EXISTS(SELECT 1 FROM sync_catalog_admin_migrations'))
        return {rows:[{approved:true}]};
      if(sql.startsWith('UPDATE sync_records SET version=')){
        writes.push(args[4]);
        return {rows:[]};
      }
      if(sql.startsWith('UPDATE sync_workspaces')||
        sql.startsWith('INSERT INTO sync_commands')||
        sql.startsWith('INSERT INTO sync_events')||
        sql.startsWith('INSERT INTO sync_telegram_outbox'))return {rows:[]};
      throw Error('UNEXPECTED_SQL: '+sql.slice(0,100));
    },
  };
  const value=patch('headerImageUrl',original.headerImageUrl,'data:image/png;base64,NEXT');
  const command={id:'safe-field-patch',workspaceId:'lobnan_main',
    changes:[{entity:'settings',id:'global',expectedVersion:16,value}]};
  const result=await new SyncService(null).pushInTx('lobnan_main',command,'usr-1',client);
  assert.equal(result.changes.length,1);
  assert.equal(result.changes[0].version,21);
  assert.equal(writes.length,1);
  assert.equal(writes[0].headerImageUrl,'data:image/png;base64,NEXT');
  assert.equal(writes[0].currency,'ILS');
  assert.deepEqual(writes[0].unitsOfMeasure,baseline.unitsOfMeasure);
  assert.deepEqual(writes[0].categories,approved);
  assert.equal(writes[0]._settingsPatchV1,undefined);
});
test('authenticated receipt verification requires exact fingerprint and matching actor',async()=>{
  const cases=[
    {command_id:'a1b2c3d4-1111',fingerprint:'a'.repeat(64),receipt:{changes:[
      {entity:'settings',id:'global',version:13,value:{private:'no'}}]}},
    {command_id:'e5f6a7b8-2222',fingerprint:'b'.repeat(64),receipt:{changes:[
      {entity:'invoices',id:'inv-1',version:8,value:{total:99}}]}},
  ];
  let params;
  const pool={query:async(_sql,args)=>{
    params=args;
    return {rows:cases};
  }};
  const results=await findVerifiedSettingsReceipts(pool,'lobnan_main','admin-user',[
    {id:'a1b2c3d4-1111',fingerprint:'a'.repeat(64)},
    {id:'e5f6a7b8-2222',fingerprint:'b'.repeat(64)},
  ]);
  assert.equal(params[0],'lobnan_main');
  assert.equal(params[1],'admin-user');
  assert.equal(results.length,1);
  assert.deepEqual(results[0],{id:'a1b2c3d4-1111',
    changes:[{entity:'settings',id:'global',version:13}]});
  assert.doesNotMatch(JSON.stringify(results),/private|total/);
  assert.deepEqual(await findVerifiedSettingsReceipts(pool,'lobnan_main','admin-user',[
    {id:'a1b2c3d4-1111',fingerprint:'c'.repeat(64)},
  ]),[]);
});
