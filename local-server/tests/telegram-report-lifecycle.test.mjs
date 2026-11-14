import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TelegramReportGateway} from '../telegram-report-gateway.mjs';
import {TelegramHub} from '../telegram-hub.mjs';

const lease={updateId:110,chatId:'12345',leaseToken:'b82ac5c6-aaec-4541-8d1b-5d454d019d23'};
const make=()=>{
 const state={progress_message_id:null,document_delivered_at:null,attempts:1};
 const calls=[];
 const pool={query:async(sql,args)=>{
  if(sql.includes('sync_telegram_inbox i JOIN'))return {rows:[{ok:1}]};
  if(sql.includes("value->'telegramConfig'"))return {rows:[{config:{enabled:true,botToken:'12345:TEST_TOKEN_ONLY'}}]};
  if(sql.includes('SELECT progress_message_id FROM sync_telegram_inbox')||
     sql.includes('SELECT document_delivered_at,progress_message_id'))return {rows:[state]};
  if(sql.includes('UPDATE sync_telegram_inbox SET progress_message_id')){
   state.progress_message_id=args[3];return {rowCount:1,rows:[state]};
  }
  if(sql.includes('UPDATE sync_telegram_inbox SET document_delivered_at')){
   state.document_delivered_at=new Date().toISOString();return {rowCount:1,rows:[state]};
  }
  throw Error('Unexpected query '+sql);
 }};
 let nextId=300;
 const gateway=new TelegramReportGateway(pool,'lobnan_main',async(url,options)=>{
  const name=url.split('/').at(-1);
  calls.push(name);
  return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:nextId++}})};
 });
 return {gateway,state,calls};
};
test('progress is sent ONCE per request, then PDF receipt replaces processing text and stops duplicates',async()=>{
 const {gateway,state,calls}=make();
 await gateway.message({...lease,text:'جاري تجهيز الكشف...',progress:true});
 assert.equal(state.progress_message_id,300);
 await gateway.message({...lease,text:'جاري تجهيز الكشف...',progress:true});
 assert.deepEqual(calls,['sendMessage']);
 const pdf=Buffer.from('%PDF-1.7\n'+'x'.repeat(120)+'\n%%EOF').toString('base64');
 assert.deepEqual(await gateway.document({...lease,base64:pdf,filename:'client.pdf'}),{ok:true,documentDelivered:true});
 assert.ok(state.document_delivered_at);
 assert.deepEqual(calls,['sendMessage','sendDocument','editMessageText']);
 assert.deepEqual(await gateway.document({...lease,base64:pdf,filename:'client.pdf'}),{ok:true,alreadyDelivered:true});
 assert.deepEqual(calls,['sendMessage','sendDocument','editMessageText']);
});
test('terminal failure updates original progress message instead of leaving جارٍ forever',async()=>{
 const {gateway,calls}=make();
 await gateway.notifyTerminalFailure({terminal:true,chatId:lease.chatId,progressMessageId:156,code:'OFFICIAL_REPORT_RENDER_TIMEOUT'});
 assert.deepEqual(calls,['editMessageText']);
});
test('failed Telegram request is terminal after two tries and leaves posted PDF acknowledged',async()=>{
 const sql=[];
 const pool={query:async(query)=>{
  sql.push(query);
  if(query.includes('UPDATE sync_telegram_inbox SET'))
   return {rows:[{attempts:2,terminal:true,chat_id:'12345',progress_message_id:300}]};
  throw Error('Unexpected query');
 }};
 const hub=new TelegramHub(pool,'lobnan_main');
 const result=await hub.failInbox(lease.updateId,lease.leaseToken,'OFFICIAL_REPORT_RENDER_TIMEOUT');
 assert.equal(result.terminal,true);
 assert.equal(result.attempts,2);
 assert.equal(result.code,'OFFICIAL_REPORT_RENDER_TIMEOUT');
 assert.match(sql[0],/attempts>=2/);
 assert.match(sql[0],/document_delivered_at IS NOT NULL THEN now\(\)/);
 assert.match(sql[0],/failed_at/);
});
test('database schema retains failed job diagnostics and an idempotent document receipt',()=>{
 const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
 for(const column of ['attempts','failed_at','failure_code','progress_message_id','document_delivered_at','document_message_id'])
  assert.match(schema,new RegExp('ADD COLUMN IF NOT EXISTS '+column));
});
