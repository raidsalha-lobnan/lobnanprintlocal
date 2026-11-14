import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramMiniPos} from '../telegram-mini-pos.mjs';

const draft='60ac571f-438f-4d56-b067-f64f6af3652f';
test('same Telegram draft confirmed twice returns only original official invoice, never reposts a journal',async()=>{
 let postCalls=0,transactionCalls=0;
 const invoice={invoiceNumber:'INV-0401',totalAmount:78,customerName:'اسم العميل'};
 const fakeService={
  async withTx(callback){
   transactionCalls++;
   return callback({async query(sql){
    if(sql.includes('FROM sync_telegram_pos_drafts'))return {rows:[{
      status:'posted',invoice_id:'inv-pos-'+draft
    }]};
    if(sql.includes('FROM sync_records'))return {rows:[{value:invoice}]};
    throw Error('UNEXPECTED_QUERY_'+sql.slice(0,100));
   }});
  },
  async pushInTx(){postCalls++;throw Error('DOUBLE_POST_ATTEMPT');}
 };
 const mini=new TelegramMiniPos({query:async()=>({rows:[]})},'lobnan_main',fakeService);
 mini.session=async()=>({telegramUserId:'151515',user:{id:'usr1'},access:{}});
 const first=await mini.commit('TEST_SIGNED',draft);
 const second=await mini.commit('TEST_SIGNED',draft);
 assert.deepEqual(first,second);
 assert.deepEqual(first,{ok:true,alreadyPosted:true,invoiceNumber:'INV-0401',
  invoiceId:'inv-pos-'+draft,totalAmount:78,customerName:'اسم العميل'});
 assert.equal(postCalls,0);
 assert.equal(transactionCalls,2);
});
test('another Telegram user cannot commit an invoice draft owned by the original user',async()=>{
 let financialPosted=false;
 const mini=new TelegramMiniPos({query:async()=>({rows:[]})},'lobnan_main',{
  withTx:async callback=>callback({
   query:async sql=>{
    assert.match(sql,/telegram_user_id=\$3 AND app_user_id=\$4/);
    return {rows:[]};
   }
  }),
  pushInTx:async()=>{financialPosted=true;}
 });
 mini.session=async()=>({telegramUserId:'malicious',user:{id:'usrX'},access:{}});
 await assert.rejects(mini.commit('FAKE_INIT',draft),/MINI_POS_DRAFT_NOT_FOUND/);
 assert.equal(financialPosted,false);
});
test('posted draft save retry does not overwrite an official invoice or financial values',async()=>{
 let updates=0;
 const mini=new TelegramMiniPos({
  query:async sql=>{
   if(sql.startsWith('INSERT INTO sync_telegram_pos_drafts')){
    updates++;return {rows:[]};
   }
   if(sql.includes('SELECT status FROM sync_telegram_pos_drafts'))
    return {rows:[{status:'posted'}]};
   throw Error('SQL_UNEXPECTED_'+sql);
  }
 },'lobnan_main',{});
 mini.session=async()=>({telegramUserId:'151515',user:{id:'usr1'},access:{}});
 const result=await mini.saveDraft('FAKE_INIT',draft,{
  customerId:'customer-1',items:[{itemId:'item-1',quantity:1,unitPrice:5}],
  paymentMethod:'cash'
 });
 assert.deepEqual(result,{ok:true,draftId:draft,status:'posted'});
 assert.equal(updates,1);
});
