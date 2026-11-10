import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsVisibleToUser,preserveWorkspaceSettingsCredentials} from '../workspace-settings-public.mjs';
import {stripPrivateFields} from '../legacy-snapshot.mjs';
import {resolveAccess,filterSnapshot,filterEvents} from '../access-policy.mjs';

const data={id:'global',businessName:'مطبعة ومكتبة لبنان',
 headerImageUrl:'data:image/jpeg;base64,HEADER',logoUrl:'data:image/png;base64,LOGO',
 currency:'₪',unitsOfMeasure:[{id:'unit-ea',name:'حبة'}],
 categories:[{id:'print',name:'مطبعة',prefix:'PRI'}],
 userScreenConfigs:{u1:{posLayout:{compact:true}}},
 sqlServerConfig:{serverUrl:'http://127.0.0.1:5432',apiKey:'DEVICE_SECRET'},
 telegramConfig:{enabled:true,botToken:'REAL_PRIVATE_BOT_TOKEN',defaultChatId:'12345'},
 apiKey:'SENSITIVE_API_KEY'};
const access={can:key=>key==='view',admin:false};
test('public staff get identical branding, currencies and categories without any private credentials',()=>{
 const safe=settingsVisibleToUser(data,access);
 assert.equal(safe.headerImageUrl,data.headerImageUrl);
 assert.equal(safe.logoUrl,data.logoUrl);
 assert.equal(safe.businessName,data.businessName);
 assert.deepEqual(safe.unitsOfMeasure,data.unitsOfMeasure);
 assert.deepEqual(safe.categories,data.categories);
 assert.ok(!('sqlServerConfig' in safe));
 assert.ok(!('telegramConfig' in safe));
 assert.ok(!('apiKey' in safe));
 assert.ok(JSON.stringify(safe).indexOf('SECRET')===-1);
});
test('admin read still redacts bot token, session keys and SQL credentials',()=>{
 const admin={admin:true,can:()=>true};
 const safe=settingsVisibleToUser(data,admin);
 assert.equal(safe.headerImageUrl,data.headerImageUrl);
 assert.equal(safe.telegramConfig.enabled,true);
 assert.equal(safe.telegramConfig.botToken,undefined);
 assert.equal(safe.sqlServerConfig,undefined);
 assert.equal(settingsVisibleToUser(data,admin).telegramConfig.botToken,undefined);
});
test('private server Telegram token survives unrelated public settings edits',()=>{
 const proposed={id:'global',businessName:'اسم جديد',
  telegramConfig:{enabled:true,defaultChatId:'54321'},
  sqlServerConfig:{serverUrl:'http://device-host'}};
 const merged=preserveWorkspaceSettingsCredentials(data,proposed);
 assert.equal(merged.telegramConfig.botToken,'REAL_PRIVATE_BOT_TOKEN');
 assert.equal(merged.telegramConfig.defaultChatId,'54321');
 assert.ok(!('sqlServerConfig' in merged));
 const clear=preserveWorkspaceSettingsCredentials(data,{
  id:'global',telegramConfig:{enabled:false,botToken:''}});
 assert.equal(clear.telegramConfig.botToken,'');
});
test('cashier may read public workspace settings while server blocks settings writes',async()=>{
 const role={code:'CASHIER',permissions:{view:true,view_pos:true,add:true,edit:true}};
 const user={id:'u1',status:'active',roleId:'cashier',companyId:'c1',
  allowedBranchIds:['b1'],customPermissions:{}};
 const pool={query:async()=>({rows:[{value:role}]})};
 const auth=await resolveAccess(pool,'lobnan_main',user);
 assert.equal(auth.canRead('settings',data,'global'),true);
 assert.equal(auth.canChange('settings',data,data),false);
 const r=filterSnapshot({records:[{entity:'settings',id:'global',value:data}],cursor:1},auth);
 assert.equal(r.records.length,1);
 assert.equal(settingsVisibleToUser(r.records[0].value,auth).telegramConfig,undefined);
 const events=filterEvents([{changes:[{entity:'settings',id:'global',value:data}],cursor:1}],auth);
 assert.equal(events[0].changes.length,1);
});
