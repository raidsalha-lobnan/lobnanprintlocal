import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPeriod,TelegramServerReportWorker} from '../telegram-report-worker.mjs';

test('Report periods use calendar boundaries and no stale user setting',()=>{
 const date=new Date(2026,10,14,16);
 assert.deepEqual(reportPeriod('this_month',date),{
  fromDate:'2026-11-01',toDate:'2026-11-14',label:'هذا الشهر'});
 assert.deepEqual(reportPeriod('last_month',date),{
  fromDate:'2026-10-01',toDate:'2026-10-31',label:'الشهر السابق'});
 assert.equal(reportPeriod('all',date).fromDate,'');
});
test('Unlinked Telegram sender cannot receive protected financial PDF',async()=>{
 const sent=[],gateway={sendText:async(_t,opts)=>{
  sent.push(opts);return {ok:true,messageId:4000};
 },telegramRequest:async()=>{throw Error('UNEXPECTED_DOCUMENT_SEND')}};
 const pool={query:async(sql)=>{
  if(sql.includes("value->'telegramConfig'"))return {rows:[{cfg:{enabled:true,botToken:'token'}}]};
  if(sql.includes('FROM sync_telegram_pos_links'))return {rows:[]};
  throw Error('UNEXPECTED_SQL_'+sql);
 }};
 const bot=new TelegramServerReportWorker(pool,'lobnan_main',gateway,'admin-id');
 await bot.handle({type:'callback',chatId:'1234',telegramUserId:'1234',data:'menu_customer_statement'},
  {update_id:1});
 assert.equal(sent.length,1);
 assert.match(sent[0].text,/اربط تلجرام/);
});
test('Mismatch between private chat and signed sender is rejected',async()=>{
 const sent=[],gateway={sendText:async(_t,opts)=>{sent.push(opts);return {ok:true,messageId:1}}};
 const pool={query:async sql=>{
  if(sql.includes("value->'telegramConfig'"))return {rows:[{cfg:{enabled:true,botToken:'token'}}]};
  throw Error('UNEXPECTED_SQL');
 }};
 const bot=new TelegramServerReportWorker(pool,'lobnan_main',gateway);
 await bot.handle({type:'message',chatId:'1234',telegramUserId:'9999',text:'menu_sales_report'},
  {update_id:1});
 assert.equal(sent.length,1);
 assert.match(sent[0].text,/صلاحية/);
});
