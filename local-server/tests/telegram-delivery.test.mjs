import test from 'node:test';
import assert from 'node:assert/strict';
import {committedTelegramText,telegramRelevantChanges,TelegramDelivery} from '../telegram-delivery.mjs';

test('only accounting commit changes trigger notifications',()=>{
 assert.equal(telegramRelevantChanges([{entity:'settings',id:'global',value:{enabled:true}}]).length,0);
 assert.equal(telegramRelevantChanges([{entity:'invoices',id:'i1',value:{invoiceNumber:'INV-0077'}}]).length,1);
 assert.equal(telegramRelevantChanges([{entity:'journalEntries',id:'j1',value:{referenceType:'pos_invoice'}}]).length,0);
 assert.equal(telegramRelevantChanges([{entity:'journalEntries',id:'j2',value:{referenceType:'cogs'}}]).length,0);
 assert.equal(telegramRelevantChanges([{entity:'stockMovements',id:'m1',value:{referenceType:'pos_invoice'}}]).length,0);
});

test('Telegram confirmation explicitly names the committed PostgreSQL operation',()=>{
 const msg=committedTelegramText({command_id:'cmd-123',committed_at:'2026-11-08T11:30:00Z',
  changes:[{entity:'invoices',id:'i1',version:2,value:{invoiceNumber:'INV-0076',totalAmount:50}}]});
 assert.match(msg,/تأكيد الحفظ في قاعدة البيانات الرئيسية/);
 assert.match(msg,/cmd-123/);
 assert.match(msg,/INV-0076/);
 assert.match(msg,/تعديل معتمد/);
});

test('outbox worker never sends Telegram when there are no committed rows',async()=>{
 let called=false;
 const client={query:async(sql)=>{
  if(sql==='BEGIN'||sql==='COMMIT')return {rows:[]};
  if(sql.includes('sync_telegram_outbox'))return {rows:[]};
  throw Error('unexpected query');
 },release(){}};
 const worker=new TelegramDelivery({connect:async()=>client},'lobnan_main',async()=>{
  called=true;throw Error('must not call Telegram');
 });
 assert.equal(await worker.drainOnce(),0);
 assert.equal(called,false);
});

test('Telegram failure keeps committed notification for retry rather than faking success',async()=>{
 const rows=[];
 const queries=[];
 const client={query:async(sql,params)=>{
  queries.push(sql);
  if(sql==='BEGIN'||sql==='COMMIT')return {rows:[]};
  if(sql.includes('SELECT command_id'))return {rows:rows.length?[]:[{
   command_id:'cmd123',committed_at:new Date(),attempts:0,changes:[{entity:'invoices',id:'a',version:1,value:{invoiceNumber:'INV-0077'}}]
  }]};
  if(sql.includes("value->'telegramConfig'"))return {rows:[{config:{enabled:true,botToken:'placeholder',defaultChatId:'123'}}]};
  if(sql.includes('FROM sync_records')&&sql.includes("entity='parties'"))return {rows:[]};
  if(sql.includes('FROM sync_records')&&sql.includes('treasuries'))return {rows:[]};
  if(sql.includes('UPDATE sync_telegram_outbox')){rows.push(1);return {rows:[]}};
  throw Error('unexpected');
 },release(){}};
 const worker=new TelegramDelivery({connect:async()=>client},'lobnan_main',async()=>({ok:false,status:503,json:async()=>({ok:false})}));
 assert.equal(await worker.drainOnce(),0);
 assert.ok(queries.some(sql=>sql.includes('next_attempt_at=now()')));
 assert.ok(!queries.some(sql=>sql.includes('delivered_at=now()')));
});
