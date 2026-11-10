import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {BusinessSettings} from '../types';
import {
  GLOBAL_SETTINGS_ID, LEGACY_SETTINGS_ID,selectWorkspaceSettings,
  applyWorkspaceSettings, mergeWorkspaceSettingsDraft, sharedWorkspaceSettings,
} from './workspaceSettingsSync';

const local={businessName:'محلي قديم',headerImageUrl:'data:image/png;base64,AAA',
  sqlServerConfig:{enabled:true,serverUrl:'http://127.0.0.1:3000/api',dbType:'postgres',
    dbName:'local',autoSync:false,syncIntervalMinutes:30},
  currency:'₪',logoUrl:'data:image/png;base64,BBB',
} as BusinessSettings;
const row=(id:string,value:any,version=1,pending=false)=>({id,value,version,pending});
test('canonical global record wins over imported legacy settings; never merge two conflicting global sources',()=>{
  const rows=[row(LEGACY_SETTINGS_ID,{id:LEGACY_SETTINGS_ID,businessName:'old'}),
    row(GLOBAL_SETTINGS_ID,{id:GLOBAL_SETTINGS_ID,businessName:'new'},2)];
  assert.equal(selectWorkspaceSettings(rows)?.value?.businessName,'new');
  assert.equal(selectWorkspaceSettings(rows.slice(0,1))?.id,LEGACY_SETTINGS_ID);
  assert.equal(selectWorkspaceSettings([]),undefined);
});
test('settings across two devices inherit exactly one workspace brand, currency and letterhead',()=>{
  const publicSettings={id:'global',businessName:'مطبعة ومكتبة لبنان',
    headerImageUrl:'data:image/png;base64,HEADER',logoUrl:'data:image/png;base64,LOGO',
    currency:'₪',unitsOfMeasure:[{id:'ea',name:'حبة'}],
    categories:[{id:'print',name:'مطبعة',prefix:'PRI'}]};
  const a=applyWorkspaceSettings(local,publicSettings);
  const b=applyWorkspaceSettings({...local,headerImageUrl:'',logoUrl:'',businessName:'جهاز ثانٍ'},
    publicSettings);
  assert.equal(a.headerImageUrl,b.headerImageUrl);
  assert.equal(a.logoUrl,b.logoUrl);
  assert.equal(a.businessName,b.businessName);
  assert.deepEqual(a.unitsOfMeasure,b.unitsOfMeasure);
  assert.deepEqual(a.categories,b.categories);
  assert.equal(b.sqlServerConfig?.serverUrl,local.sqlServerConfig?.serverUrl);
});
test('an offline partial edit merges only changed workspace fields and has a permanent record ID',()=>{
  const outgoing=mergeWorkspaceSettingsDraft(
    {id:'workspace-settings',headerImageUrl:'data:image/jpeg;base64,HEADER',
     businessName:'مطبعة لبنان',currency:'₪',telegramConfig:{enabled:true}},
    {currency:'$'},LEGACY_SETTINGS_ID);
  assert.equal(outgoing.id,'workspace-settings');
  assert.equal(outgoing.headerImageUrl,'data:image/jpeg;base64,HEADER');
  assert.equal(outgoing.currency,'$');
  assert.equal(outgoing.businessName,'مطبعة لبنان');
  assert.deepEqual(outgoing.telegramConfig,{enabled:true});
});
test('server missing an asset clears an old device-only image, without dropping its fallback copy',()=>{
 const value=applyWorkspaceSettings(local,{id:'global',businessName:'الشركة'});
 assert.equal(value.headerImageUrl,'');
 assert.equal(value.logoUrl,'');
 assert.equal(value.stampUrl,'');
 assert.equal(value.signatureUrl,'');
 assert.equal(local.headerImageUrl,'data:image/png;base64,AAA');
});
test('device-only SQL connection is excluded from every shared settings update',()=>{
  assert.equal('sqlServerConfig' in sharedWorkspaceSettings(local),false);
  const outgoing=mergeWorkspaceSettingsDraft({id:'global',businessName:'Main'},local);
  assert.equal('sqlServerConfig' in outgoing,false);
  assert.equal(outgoing.id,GLOBAL_SETTINGS_ID);
  const incoming=applyWorkspaceSettings(local,{id:'global',sqlServerConfig:
    {enabled:false},businessName:'الشركة الموحدة'});
  assert.equal(incoming.sqlServerConfig?.enabled,true);
  assert.equal(incoming.businessName,'الشركة الموحدة');
});
test('same-device backing localStorage is never silently uploaded during hydration',()=>{
  const source=readFileSync(new URL('../context/AccountingContext.tsx',import.meta.url),'utf8');
  assert.match(source,/selectWorkspaceSettings\(await repo\.all\('settings'\)\)/);
  assert.match(source,/createWorkspaceSettingsPatch\(base,newSettings,recordId\)/);
  assert.match(source,/await repo\.commit\(\[\{entity:'settings'/);
  assert.doesNotMatch(source,/setDoc\(doc\(db, 'settings', 'global'\), cleanDocForFirestore\(merged\)/);
  assert.doesNotMatch(source,/pushDeltaToServer\('settings', 'upsert', merged\)/);
  assert.match(source,/settings_legacy_device_backup/);
});
test('admin general settings save awaits durable outbox and prevents stale full snapshots',()=>{
  const ui=readFileSync(new URL('../components/SettingsView.tsx',import.meta.url),'utf8');
  assert.match(ui,/const accepted = await updateSettings\(\{/);
  assert.match(ui,/setSettingsSaveError/);
  assert.match(ui,/onChangeCapture=\{\(\) => setGeneralDirty\(true\)\}/);
  assert.doesNotMatch(ui,/updateSettings\(\{\s*\.\.\.settings,/);
});
