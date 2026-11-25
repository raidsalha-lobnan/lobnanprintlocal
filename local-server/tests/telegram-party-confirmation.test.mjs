import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePartySearch,rankApproximateParties} from '../telegram-party-matcher.mjs';
import {TelegramServerReportWorker} from '../telegram-report-worker.mjs';

const CLIENTS=[
 {record_id:'cust-21',value:{
  id:'cust-21',code:'CUST-0021',name:'مؤسسة مؤاخاة - محمد الكحلوت',type:'customer'}},
 {record_id:'cust-24',value:{
  id:'cust-24',code:'CUST-0024',name:'المكتبة الحديثة',type:'customer'}},
 {record_id:'supplier-2',value:{
  id:'supplier-2',code:'SUP-0002',name:'مؤسسة مؤاخاة مورد',type:'supplier'}},
 {record_id:'cust-private',value:{
  id:'cust-private',code:'CUST-0999',name:'مؤاخاة الكحلوط - سري',type:'customer'}}
];
function harness(){
 const sent=[],state={category:'',party_id:''};
 const pool={query:async(sql,args=[])=>{
  if(sql.includes('INSERT INTO sync_telegram_report_sessions')){
   state.category=args[3];state.party_id=args[4];return {rows:[]};
  }
  if(sql.startsWith('SELECT category,party_id FROM sync_telegram_report_sessions'))
   return {rows:state.category?[{...state}]:[]};
  if(sql.includes('WITH candidates AS'))return {rows:[]};
  if(sql.includes('ORDER BY record_id LIMIT 5000'))
   return {rows:CLIENTS};
  if(sql.startsWith('SELECT value FROM sync_records WHERE workspace='))
   return {rows:CLIENTS.filter(x=>x.record_id===args[2]).map(x=>({value:x.value}))};
  throw Error('UNEXPECTED_SQL:'+sql.slice(0,120));
 }};
 const worker=new TelegramServerReportWorker(pool,'lobnan_main',{
  sendText:async(_token,message)=>{
   sent.push(message);
   return {ok:true,messageId:sent.length+100};
  }
 });
 worker.config=async()=> 'fake-unit-test-token';
 worker.acknowledge=async()=>{};
 worker.session=async()=>({
  user:{id:'test-user'},
  access:{canRead:(_entity,_value,id)=>id!=='cust-private'}
 });
 const callback=(data)=>worker.handle({
  type:'callback',chatId:'12345',telegramUserId:'12345',data
 },{update_id:123,progress_message_id:null,document_delivered_at:null});
 const message=(text)=>worker.handle({
  type:'message',chatId:'12345',telegramUserId:'12345',text
 },{update_id:124,progress_message_id:null,document_delivered_at:null});
 return {worker,sent,state,callback,message};
}
test('Arabic search tolerates spelling differences but does not return unrelated clients',()=>{
 assert.equal(normalizePartySearch('مُؤَاخَاة'),normalizePartySearch('مواخاه'));
 const rows=rankApproximateParties(CLIENTS,'مواخاه الكحلوط',{
  canRead:(_e,_v,id)=>id!=='cust-private'
 });
 assert.equal(rows[0].record_id,'cust-21');
 assert.ok(!rows.some(x=>x.record_id==='supplier-2'));
 assert.ok(!rows.some(x=>x.record_id==='cust-private'));
});
test('Telegram fuzzy result requires a separate yes/no confirmation before periods',async()=>{
 const {sent,state,callback,message}=harness();
 await callback('menu_customer_statement');
 assert.equal(state.party_id,'');
 await message('مواخاه الكحلوط');
 let last=sent.at(-1);
 assert.match(last.text,/أقرب الأسماء/);
 const choices=last.reply_markup.inline_keyboard.flat();
 const customer=choices.find(b=>b.callback_data==='candidate_party_cust-21');
 assert.ok(customer,'Expected misspelled customer as suggestion');
 assert.ok(!choices.some(b=>b.callback_data?.includes('cust-private')));
 assert.ok(!choices.some(b=>b.callback_data?.includes('supplier-2')));
 assert.equal(state.party_id,'');
 await callback(customer.callback_data);
 last=sent.at(-1);
 assert.match(last.text,/هل هذا العميل المقصود/);
 assert.match(last.text,/مؤسسة مؤاخاة/);
 assert.match(last.text,/CUST-0021/);
 assert.equal(state.party_id,'pending:cust-21');
 assert.equal(last.reply_markup.inline_keyboard[0][0].callback_data,'confirm_party_cust-21');
 await callback('period_all');
 assert.match(sent.at(-1).text,/أكّد العميل/);
 assert.equal(state.party_id,'pending:cust-21');
 await callback('confirm_party_cust-24');
 assert.match(sent.at(-1).text,/لم يعد نشطًا/);
 assert.equal(state.party_id,'pending:cust-21');
 await callback('confirm_party_cust-21');
 assert.equal(state.party_id,'cust-21');
 assert.match(sent.at(-1).text,/اختر فترة كشف حساب عميل/);
 assert.equal(sent.at(-1).reply_markup.inline_keyboard.some(row=>row.some(x=>x.callback_data==='period_all')),true);
});
test('No means search again; old confirmation is not accepted after cancellation',async()=>{
 const {sent,state,callback,message}=harness();
 await callback('menu_customer_statement');
 await message('مواخاه الكحلوط');
 await callback('candidate_party_cust-21');
 await callback('retry_party');
 assert.equal(state.party_id,'');
 assert.match(sent.at(-1).text,/أرسل جزءًا من اسم/);
 await callback('confirm_party_cust-21');
 assert.equal(state.party_id,'');
 assert.match(sent.at(-1).text,/لم يعد نشطًا/);
});
test('Party-selection callback verifies permission/type again even when fabricated',async()=>{
 const {callback,state}=harness();
 await callback('menu_customer_statement');
 await assert.rejects(callback('candidate_party_supplier-2'),/REPORT_PARTY_NOT_AUTHORIZED/);
 await assert.rejects(callback('candidate_party_cust-private'),/REPORT_PARTY_NOT_AUTHORIZED/);
 assert.equal(state.party_id,'');
});
