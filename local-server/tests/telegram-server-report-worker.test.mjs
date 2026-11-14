import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPeriod,TelegramServerReportWorker,safeReportErrorCode} from '../telegram-report-worker.mjs';

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

test('Authenticated Telegram report command renders original PDF and sends it once with a durable delivery checkpoint',
 {skip:process.platform!=='win32'},async()=>{
 const calls={messages:[],documents:[],checkpoints:0};
 const gateway={
  sendText:async(_token,params)=>{
   calls.messages.push(params.text);
   return {ok:true,messageId:1001};
  },
  progressStatus:async()=>({ok:true}),
  telegramRequest:async(_token,method,form)=>{
   assert.equal(method,'sendDocument');
   const document=form.get('document');
   const bytes=Buffer.from(await document.arrayBuffer());
   assert.equal(bytes.toString('ascii',0,5),'%PDF-');
   calls.documents.push(bytes.length);
   return {ok:true,messageId:1002};
  }
 };
 const party={id:'customer-1',code:'CUST-0002',name:'Test Customer',
  type:'customer',balance:0,openingBalance:0};
 const profile={id:'admin-1',name:'Admin',status:'active',roleId:'role-admin'};
 const pool={
  query:async(sql,args)=>{
   if(sql.includes("value->'telegramConfig'"))return {rows:[{cfg:{enabled:true,botToken:'private-test-bot-token'}}]};
   if(sql.includes('FROM sync_telegram_pos_links'))return {rows:[{app_user_id:'admin-1',profile}]};
   if(sql.includes("entity='roles'"))return {rows:[{value:{id:'role-admin',code:'SYS_ADMIN',permissions:{}}}]};
   if(sql.includes('FROM sync_telegram_report_sessions'))return {rows:[{category:'customer_statement',party_id:'customer-1'}]};
   if(sql.startsWith('UPDATE sync_telegram_inbox')){
    calls.checkpoints++;
    return {rowCount:1,rows:[]};
   }
   throw Error('UNEXPECTED_QUERY:'+sql);
  },
  connect:async()=>({
   query:async(sql)=>{
    if(sql.startsWith('BEGIN')||sql.startsWith('COMMIT')||sql.startsWith('ROLLBACK'))return {rows:[]};
    if(sql.startsWith('SELECT entity,record_id,value'))
     return {rows:[{entity:'settings',record_id:'global',
      value:{businessName:'Test Company',currency:'ILS'}},
      {entity:'parties',record_id:'customer-1',value:party}]};
    throw Error('UNEXPECTED_SNAPSHOT_QUERY:'+sql);
   },release:()=>{}
  })
 };
 const worker=new TelegramServerReportWorker(pool,'lobnan_main',gateway,'admin-1');
 await worker.handle({
  type:'callback',chatId:'1234',telegramUserId:'1234',
  data:'period_this_month_customer_statement_customer-1'
 },{update_id:121,progress_message_id:null,document_delivered_at:null});
 assert.equal(calls.documents.length,1);
 assert.ok(calls.documents[0]>2000);
 assert.ok(calls.checkpoints>=2);
 assert.ok(calls.messages.some(message=>message.includes('جاري إعداد')));
 assert.ok(calls.messages.some(message=>message.includes('تم إرسال')));
});

test('Report failures expose a useful safe code rather than unreadable underscores',()=>{
 assert.equal(safeReportErrorCode(new TypeError("Cannot read properties of null (reading 'customerId')")),
  'REPORT_TEMPLATE_DATA_ERROR');
 assert.equal(safeReportErrorCode(new Error('OFFICIAL_REPORT_PDF_INVALID')),
  'OFFICIAL_REPORT_PDF_INVALID');
 assert.equal(safeReportErrorCode(new Error('Sensitive freeform details')), 'REPORT_GENERATION_FAILED');
});
test('Terminal report failure updates existing progress only once rather than sending duplicate messages',async()=>{
 let ordinary=0,edited=0;
 const gateway={
  progressStatus:async()=>{edited++;return {ok:true}},
  sendText:async()=>{ordinary++;return {ok:true}}
 };
 const pool={query:async sql=>{
  if(sql.includes('WITH next'))return {rows:[{
   update_id:101,payload:{chatId:'1234',processor:'server'},
   attempts:2,progress_message_id:45,document_delivered_at:null
  }]};
  if(sql.includes('UPDATE sync_telegram_inbox'))return {rowCount:1,rows:[]};
  if(sql.includes("value->'telegramConfig'"))
   return {rows:[{cfg:{enabled:true,botToken:'unit-test-token'}}]};
  throw Error('UNEXPECTED_SQL');
 }};
 const worker=new TelegramServerReportWorker(pool,'lobnan_main',gateway);
 worker.handle=async()=>{throw new TypeError("Cannot read properties of null (reading 'customerId')")};
 assert.equal(await worker.pollOnce(),1);
 assert.equal(edited,1);
 assert.equal(ordinary,0);
});
