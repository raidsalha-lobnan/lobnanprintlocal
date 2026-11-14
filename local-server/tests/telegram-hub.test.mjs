import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramHub} from '../telegram-hub.mjs';

function makeMockHub() {
 const queries=[],replies=[];
 let lastUpdateId=0;
 const client={
  async query(sql,args=[]){
   queries.push({sql,args});
   if(sql.includes('SELECT last_update_id')&&sql.includes('FOR UPDATE'))
    return {rows:[{last_update_id:lastUpdateId}]};
   if(sql.includes('UPDATE sync_telegram_bot_offsets SET last_update_id'))
    lastUpdateId=args[2];
   if(sql.includes('SELECT update_id,payload,attempts,document_delivered_at FROM sync_telegram_inbox'))
    return {rows:[{update_id:42,payload:{
      type:'message',text:'/start',chatId:'123',fromName:'Test'
    }}]};
   return {rows:[],rowCount:1};
  },
  release(){}
 };
 const pool={
  connect:async()=>client,
  query:async(sql,args=[])=>{
   queries.push({sql,args});
   return {rows:[],rowCount:1};
  }
 };
 const hub=new TelegramHub(pool,'lobnan_main',async(url,options)=>{
  replies.push(JSON.parse(options.body));
  return {ok:true,json:async()=>({ok:true})};
 });
 return {hub,queries,replies,getOffset:()=>lastUpdateId};
}
const message=(id,text,chatType='private')=>({
 update_id:id,message:{
  text,chat:{id:123,type:chatType},from:{first_name:'User'},message_id:id
 }
});

test('private /start sends persistent reply button and inline reports menu immediately without browser',async()=>{
 const f=makeMockHub();
 await f.hub.ingest(message(1,'/start'),'100','100:dummy');
 assert.ok(f.queries.some(x=>x.sql.includes('INSERT INTO sync_telegram_subscribers')&&x.args[1]==='123'));
 assert.equal(f.queries.some(x=>x.sql.includes('INSERT INTO sync_telegram_inbox')),false);
 assert.equal(f.getOffset(),1);
 assert.equal(f.replies.length,2);
 assert.equal(f.replies[0].chat_id,'123');
 assert.equal(f.replies[0].reply_markup.keyboard[0][0].text,'📋 القائمة الرئيسية');
 assert.equal(f.replies[0].reply_markup.is_persistent,true);
 assert.equal(f.replies[1].parse_mode,'HTML');
 assert.match(f.replies[1].text,/القائمة الرئيسية/);
 assert.equal(f.replies[1].reply_markup.inline_keyboard.length,6);
 assert.equal(f.replies[1].reply_markup.inline_keyboard[1][0].callback_data,'menu_customer_statement');
});

test('bot /menu and one-tap Arabic reply button reopen menu without adding to accounting queue',async()=>{
 const f=makeMockHub();
 await f.hub.ingest(message(5,'/menu'),'100','100:dummy');
 await f.hub.ingest(message(6,'📋 القائمة الرئيسية'),'100','100:dummy');
 assert.equal(f.replies.length,2);
 assert.equal(f.replies.every(r=>r.reply_markup.inline_keyboard.length===6),true);
 assert.equal(f.queries.some(x=>x.sql.includes('INSERT INTO sync_telegram_inbox')),false);
});

test('callback menu_main is answered and served on server even when report browser is closed',async()=>{
 const f=makeMockHub();
 await f.hub.ingest({update_id:7,callback_query:{
  id:'callback-7',data:'menu_main',
  message:{message_id:13,chat:{id:123,type:'private'}},from:{first_name:'User'}
 }},'100','100:dummy');
 assert.equal(f.queries.some(x=>x.sql.includes('INSERT INTO sync_telegram_inbox')),false);
 assert.equal(f.replies.length,2);
 assert.equal(f.replies[0].callback_query_id,'callback-7');
 assert.equal(f.replies[1].reply_markup.inline_keyboard.length,6);
});

test('bot report commands and Telegram menu button are set once per token',async()=>{
 const f=makeMockHub();
 await f.hub.configureTelegramMenu('100:dummy');
 await f.hub.configureTelegramMenu('100:dummy');
 assert.equal(f.replies.length,2);
 // The same mocked fetch is used for all Bot API methods.
 const commands=f.replies[0].commands;
 assert.ok(commands.some(x=>x.command==='menu'));
 assert.ok(commands.some(x=>x.command==='reports'));
 assert.deepEqual(f.replies[1].menu_button,{type:'commands'});
});

test('stopping disables only the requesting chat and cancels its pending broadcasts',async()=>{
 const f=makeMockHub();
 await f.hub.ingest(message(2,'/stop'),'100','100:dummy');
 assert.ok(f.queries.some(x=>x.sql.includes('active=false')&&
  x.args[1]==='123'));
 assert.ok(f.queries.some(x=>x.sql.includes('USER_UNSUBSCRIBED')));
 assert.equal(f.queries.some(x=>x.sql.includes('INSERT INTO sync_telegram_inbox')),false);
 assert.equal(f.replies[0].chat_id,'123');
 assert.match(f.replies[0].text,/تم إيقاف الاشتراك/);
});
test('bots added to groups do not silently subscribe a group to financial data',async()=>{
 const f=makeMockHub();
 await f.hub.ingest(message(3,'/start','supergroup'),'100','100:dummy');
 assert.equal(f.queries.some(x=>x.sql.includes('INSERT INTO sync_telegram_subscribers')),false);
 assert.equal(f.queries.some(x=>x.sql.includes('INSERT INTO sync_telegram_inbox')),false);
 assert.equal(f.replies.length,0);
 assert.equal(f.getOffset(),3);
});
test('duplicate Telegram update ID is ignored without producing a second subscription',async()=>{
 const f=makeMockHub();
 await f.hub.ingest(message(4,'/start'),'100','100:dummy');
 const n=f.queries.length;
 await f.hub.ingest(message(4,'/start'),'100','100:dummy');
 const recent=f.queries.slice(n);
 assert.equal(recent.some(x=>x.sql.includes('INSERT INTO sync_telegram_subscribers')),false);
 assert.equal(f.replies.length,2);
});
test('report inbox claims and acknowledges with a stable lease',async()=>{
 const f=makeMockHub();
 const item=await f.hub.claimInbox();
 assert.equal(item.updateId,42);
 assert.equal(item.action.chatId,'123');
 assert.equal(item.leaseToken.length,36);
 assert.equal(await f.hub.ackInbox(item.updateId,item.leaseToken),true);
 assert.ok(f.queries.some(x=>x.sql.includes('processed_at=now()')));
});
