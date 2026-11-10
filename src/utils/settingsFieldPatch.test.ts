import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {BusinessSettings} from '../types';
import type {SyncCommand} from '../sync-next/types';
import {
  createWorkspaceSettingsPatch,
  canonicalJson,sha256Hex,fingerprintSyncCommand,
  composeLocalSettingsDraft,
} from '../sync-next/settingsPatch';

test('only changed business settings fields are sent, not every setting or branding image',async()=>{
  const before={id:'global',headerImageUrl:'data:image/png;base64,HEADER',
    businessName:'Main',currency:'ILS',categories:[{id:'print',name:'Print'}]};
  const patch=await createWorkspaceSettingsPatch(before,
    {businessName:'New',currency:'ILS'} as BusinessSettings,'global');
  assert.ok(patch);
  assert.deepEqual(Object.keys(patch.changes),['businessName']);
  assert.equal(patch.changes.businessName,'New');
  assert.equal(patch.changes.headerImageUrl,undefined);
  assert.equal(patch.changes.categories,undefined);
  assert.equal(Object.keys(patch.before).length,1);
  assert.deepEqual(composeLocalSettingsDraft(before,patch).categories,before.categories);
  assert.equal((await createWorkspaceSettingsPatch(before,
    {businessName:'Main',currency:'ILS'} as BusinessSettings,'global')),null);
});
test('device local connection credentials never enter shared settings patch',async()=>{
  const patch=await createWorkspaceSettingsPatch(
    {id:'global',businessName:'Main'},
    {businessName:'Shared',sqlServerConfig:{enabled:true,serverUrl:'http://localhost/private'}} as BusinessSettings,
    'global');
  assert.ok(patch);
  assert.deepEqual(Object.keys(patch.changes),['businessName']);
  assert.doesNotMatch(JSON.stringify(patch),/localhost|sqlServerConfig/);
});
test('canonical hashing of nested settings is stable across object key order',async()=>{
  const x={a:1,nested:{x:9,y:8},units:[{a:1,b:2}]};
  const y={units:[{b:2,a:1}],nested:{y:8,x:9},a:1};
  assert.equal(canonicalJson(x),canonicalJson(y));
  assert.equal(await sha256Hex(canonicalJson(x)),await sha256Hex(canonicalJson(y)));
});
test('receipt fingerprint matches exact server idempotency payload, not a loose invoice number',async()=>{
  const command={id:'settings-operation',workspaceId:'lobnan_main',
    changes:[{entity:'settings',id:'global',expectedVersion:9,value:{id:'global',hello:'x'}}],
    createdAt:0,attempts:0,retryAt:0,status:'pending'} as SyncCommand;
  const expected=crypto.createHash('sha256').update(JSON.stringify({
    workspaceId:command.workspaceId,changes:command.changes,
  })).digest('hex');
  assert.equal(await fingerprintSyncCommand(command),expected);
  const changed={...command,changes:[{...command.changes[0],
    value:{id:'global',hello:'WRONG'}}]} as SyncCommand;
  assert.notEqual(await fingerprintSyncCommand(changed),expected);
});
test('settings updates still use the durable repository with no old duplicate cloud writes',()=>{
  const src=readFileSync(
    new URL('../context/AccountingContext.tsx',import.meta.url),'utf8');
  assert.match(src,/createWorkspaceSettingsPatch\(base,newSettings,recordId\)/);
  assert.match(src,/await repo\.commit\(\[\{entity:'settings',id:recordId,value:fieldPatch/);
  assert.doesNotMatch(src,/pushDeltaToServer\('settings', 'upsert', merged\)/);
});
