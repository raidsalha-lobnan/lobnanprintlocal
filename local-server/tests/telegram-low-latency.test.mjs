import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramHub} from '../telegram-hub.mjs';
import {TelegramReportGateway} from '../telegram-report-gateway.mjs';

const lease={updateId:10001,leaseToken:'eb2d40d7-6a3f-4c48-b5c0-dcc67e8d5a2c',chatId:'777777'};
function gateway(fake){
 const events=[];
 const pool={
  query:async(sql)=>{
   if(sql.includes('sync_telegram_inbox i JOIN'))return {rows:[{ok:true}]};
   if(sql.includes("value->'telegramConfig'"))return {rows:[{config:{enabled:true,botToken:'123:DUMMY_TEST_ONLY'}}]};
   throw Error('UNEXPECTED_SQL');
  }
 };
 const hub=new TelegramReportGateway(pool,'lobnan_main',async(url,options)=>{
  const name=url.split('/').at(-1);
  const payload=options.body instanceof FormData?'multipart':JSON.parse(options.body);
  events.push({name,payload});
  return await fake(name,payload,events.length);
 });
 return {hub,events};
}
test('old expired Telegram callback 400 is nonfatal so original menu action can proceed',async()=>{
 const {hub,events}=gateway(async(name)=>({ok:false,status:400,json:async()=>({ok:false})}));
 const reply=await hub.callback({...lease,callbackQueryId:'old-callback-id'});
 assert.deepEqual(reply,{ok:true,callbackExpired:true});
 assert.equal(events.length,1);
 assert.equal(events[0].name,'answerCallbackQuery');
});
test('malformed HTML error retries once as plain text, maintaining buttons',async()=>{
 const {hub,events}=gateway(async(name,payload,index)=>({
   ok:index>1,status:index>1?200:400,json:async()=>({ok:index>1})
 }));
 assert.deepEqual(await hub.message({...lease,text:'<b>Check & details</b>',
  replyMarkup:{inline_keyboard:[[{text:'عرض',callback_data:'menu_main'}]]}}),{ok:true});
 assert.equal(events.length,2);
 assert.equal(events[0].payload.parse_mode,'HTML');
 assert.equal(events[1].payload.parse_mode,undefined);
 assert.equal(events[1].payload.text,'Check & details');
 assert.equal(events[1].payload.reply_markup.inline_keyboard[0][0].callback_data,'menu_main');
});
test('non-400 delivery failures are not hidden as successful reports',async()=>{
 const {hub,events}=gateway(async(name)=>({ok:false,status:503,json:async()=>({ok:false})}));
 await assert.rejects(hub.message({...lease,text:'x'}),/TELEGRAM_SENDMESSAGE_HTTP_503/);
 assert.equal(events.length,1);
});
test('waiting report claim returns promptly on new inbox signal without a 12s sleep',async()=>{
 let available=false,claimCount=0;
 const fake={
  query:async(sql)=>{
   if(sql.includes('SELECT 1 FROM sync_telegram_inbox'))return {rows:[]};
   throw Error('UNEXPECTED_QUERY '+sql);
  }
 };
 const hub=new TelegramHub(fake,'lobnan_main');
 hub.claimInbox=async()=>{
   claimCount++;
   return available?{updateId:99,leaseToken:'test',action:{type:'message'}}:null;
 };
 const began=Date.now();
 const pending=hub.claimInboxWait(5000);
 await new Promise(r=>setTimeout(r,30));
 available=true;
 for(const wake of hub.inboxWaiters)wake();
 const item=await pending;
 assert.equal(item.updateId,99);
 assert.ok(Date.now()-began<500,'did not wake on inbox event');
 assert.equal(claimCount,2);
 assert.equal(hub.inboxWaiters.size,0);
});
test('report wait times out cleanly and leaves no dangling server listeners',async()=>{
 const hub=new TelegramHub({query:async()=>({rows:[]})},'lobnan_main');
 hub.claimInbox=async()=>null;
 const begun=Date.now();
 const result=await hub.claimInboxWait(60);
 assert.equal(result,null);
 assert.ok(Date.now()-begun>=40);
 assert.equal(hub.inboxWaiters.size,0);
});
