import test from 'node:test';
import assert from 'node:assert/strict';
import {committedTelegramText,telegramRelevantChanges,TelegramDelivery} from '../telegram-delivery.mjs';

test('only business accounting commits trigger Telegram confirmations',()=>{
 assert.equal(telegramRelevantChanges([{entity:'settings',value:{enabled:true}}]).length,0);
 assert.equal(telegramRelevantChanges([{entity:'invoices',value:{invoiceNumber:'INV-0077'}}]).length,1);
 assert.equal(telegramRelevantChanges([{entity:'journalEntries',value:{referenceType:'pos_invoice'}}]).length,0);
 assert.equal(telegramRelevantChanges([{entity:'journalEntries',value:{referenceType:'cogs'}}]).length,0);
 assert.equal(telegramRelevantChanges([{entity:'stockMovements',value:{referenceType:'pos_invoice'}}]).length,0);
});
test('confirmation names the committed PostgreSQL operation',()=>{
 const msg=committedTelegramText({command_id:'cmd-123',committed_at:'2026-11-08T11:30:00Z',
  changes:[{entity:'vouchers',version:2,value:{voucherNumber:'V-0076',amount:50}}]});
 assert.match(msg,/تأكيد الحفظ في قاعدة البيانات الرئيسية/);
 assert.match(msg,/cmd-123/);
 assert.match(msg,/V-0076/);
 assert.match(msg,/تعديل معتمد/);
});

function fixture(chatIds=['123'],fetchImpl=async()=>({ok:true,status:200,json:async()=>({ok:true})})){
 const history=[],recipients=chatIds.map(chat_id=>({
  command_id:'cmd-123',chat_id,next_part:0,attempts:0,
  changes:[{entity:'vouchers',id:'v1',version:1,value:{voucherNumber:'V-100',amount:75}}],
  committed_at:new Date('2026-11-09T12:00:00Z'),delivered:false,blocked:false
 }));
 const query=async(sql,params=[])=>{
  history.push({sql,params});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes("value->'telegramConfig'"))return {rows:[{
   config:{enabled:true,botToken:'placeholder',defaultChatId:'123'}
  }]};
  if(sql.includes('FROM sync_telegram_recipients d')&&sql.includes('FOR UPDATE')){
   const next=recipients.find(row=>!row.delivered&&!row.blocked);
   return {rows:next?[next]:[]};
  }
  if(sql.includes('SELECT active FROM sync_telegram_subscribers'))
   return {rows:[{active:true}]};
  if(sql.includes('UPDATE sync_telegram_recipients SET next_part=')){
   const row=recipients.find(r=>r.chat_id===params[2]);row.next_part=params[3];
   return {rows:[],rowCount:1};
  }
  if(sql.includes('UPDATE sync_telegram_recipients SET attempts=attempts+1')){
   const row=recipients.find(r=>r.chat_id===params[2]);row.blocked=true;row.attempts++;
   return {rows:[],rowCount:1};
  }
  if(sql.includes('UPDATE sync_telegram_recipients SET delivered_at=')){
   for(const row of recipients.filter(r=>r.chat_id===params[2]))row.delivered=true;
   return {rows:[],rowCount:1};
  }
  return {rows:[],rowCount:0};
 };
 const client={query,release(){}};
 const worker=new TelegramDelivery({query,connect:async()=>client},'lobnan_main',fetchImpl);
 return {worker,history,recipients};
}

test('worker does not send to Telegram if there is no queued recipient',async()=>{
 let sent=0;
 const f=fixture([],async()=>{sent++;throw Error('must not send')});
 assert.equal(await f.worker.drainOnce(),0);
 assert.equal(sent,0);
});
test('a failed recipient is retried independently without marking delivery successful',async()=>{
 const f=fixture(['123'],async()=>({ok:false,status:503,json:async()=>({ok:false})}));
 assert.equal(await f.worker.drainOnce(),0);
 assert.equal(f.recipients[0].delivered,false);
 assert.equal(f.recipients[0].attempts,1);
 assert.ok(f.history.some(q=>q.sql.includes('next_attempt_at=now()')));
});
test('every subscribed chat receives its own delivery with no duplicates',async()=>{
 const targets=[];
 const f=fixture(['123','456'],async(url,options)=>{
  targets.push(JSON.parse(options.body).chat_id);
  return {ok:true,status:200,json:async()=>({ok:true})};
 });
 assert.equal(await f.worker.drainOnce(),2);
 assert.deepEqual(targets,['123','456']);
 assert.ok(f.recipients.every(r=>r.delivered));
 assert.equal(await f.worker.drainOnce(),0);
 assert.deepEqual(targets,['123','456']);
});
