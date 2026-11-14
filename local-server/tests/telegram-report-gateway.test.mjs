import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramReportGateway} from '../telegram-report-gateway.mjs';

const lease={updateId:10001,leaseToken:'eb2d40d7-6a3f-4c48-b5c0-dcc67e8d5a2c',chatId:'777777'};
function makeGateway({authorized=true,fail=false}={}){
 const calls=[];
 const pool={async query(sql,args){
  if(sql.includes('sync_telegram_inbox i JOIN sync_telegram_subscribers'))return {rows:authorized?[{one:1}]:[]};
  if(sql.includes("value->'telegramConfig'"))return {rows:[{config:{enabled:true,botToken:'DUMMY_PRIVATE_TEST_TOKEN'}}]};
  throw new Error('Unexpected SQL query');
 }};
 const api=async(url,options)=>{
  calls.push({url,options});
  return {ok:!fail,status:fail?502:200,json:async()=>({ok:!fail})};
 };
 return {hub:new TelegramReportGateway(pool,'lobnan_main',api),calls};
}
test('leased private report message is sent from central server with no browser-side bot token',async()=>{
 const {hub,calls}=makeGateway();
 assert.deepEqual(await hub.message({...lease,text:'<b>كشف حساب</b>',replyMarkup:{inline_keyboard:[[{text:'نعم',callback_data:'menu_main'}]]}}),{ok:true});
 assert.equal(calls.length,1);
 const payload=JSON.parse(calls[0].options.body);
 assert.equal(payload.chat_id,'777777');
 assert.equal(payload.parse_mode,'HTML');
 assert.match(calls[0].url,/sendMessage$/);
 assert.equal(payload.reply_markup.inline_keyboard[0][0].callback_data,'menu_main');
});
test('invalid or mismatching report lease prevents sending private accounting data',async()=>{
 const {hub,calls}=makeGateway({authorized:false});
 await assert.rejects(hub.message({...lease,text:'some financial report'}),/TELEGRAM_REPORT_LEASE_NOT_AUTHORIZED/);
 assert.equal(calls.length,0);
 await assert.rejects(hub.message({...lease,leaseToken:'bad',text:'x'}),/TELEGRAM_REPORT_INVALID_LEASE/);
 assert.equal(calls.length,0);
});
test('PDF upload uses server-side token and binary multipart, with no invalid files',async()=>{
 const {hub,calls}=makeGateway();
 const bytes=Buffer.from('%PDF-1.7\n'+ 'T'.repeat(300)+'\n%%EOF');
 await hub.document({...lease,filename:'customer-01.pdf',caption:'كشف حساب',base64:bytes.toString('base64')});
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/sendDocument$/);
 assert.ok(calls[0].options.body instanceof FormData);
 const doc=calls[0].options.body.get('document');
 assert.equal(doc.name,'customer-01.pdf');
 assert.equal(doc.type,'application/pdf');
 assert.deepEqual(Buffer.from(await doc.arrayBuffer()),bytes);
 await assert.rejects(hub.document({...lease,base64:Buffer.from('NOT_A_PDF_WITH_ENOUGH_CHARACTERS').toString('base64')}),/TELEGRAM_DOCUMENT_INVALID_PDF/);
 assert.equal(calls.length,1);
});
test('Telegram API failure is not acknowledged as successful delivery',async()=>{
 const {hub}=makeGateway({fail:true});
 await assert.rejects(hub.message({...lease,text:'test'}),/TELEGRAM_SENDMESSAGE_HTTP_502/);
});
