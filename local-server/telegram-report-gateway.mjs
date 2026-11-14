import {InputError} from './sync-domain.mjs';

const validChat=value=>/^-?\d{1,20}$/.test(String(value??''));
const safeFilename=value=>{
 const name=String(value||'report.pdf').replace(/[\\/\x00-\x1f]/g,'_').slice(0,140);
 return name.endsWith('.pdf')?name:'report.pdf';
};
const validLease=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
export class TelegramReportGateway {
 constructor(pool,workspace,fetchImpl=fetch){
  this.pool=pool;this.workspace=workspace;this.fetch=fetchImpl;
 }
 async config(){
  const r=await this.pool.query(
   "SELECT value->'telegramConfig' AS config FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",
   [this.workspace]);
  const c=r.rows[0]?.config;
  if(c?.enabled!==true||!c.botToken)throw new InputError('TELEGRAM_NOT_CONFIGURED',503);
  return c;
 }
 async verifyLease(payload){
  if(!validChat(payload?.chatId)||!Number.isSafeInteger(payload?.updateId)||
    payload.updateId<=0||!validLease(payload?.leaseToken))
    throw new InputError('TELEGRAM_REPORT_INVALID_LEASE',400);
  const r=await this.pool.query(
   "SELECT 1 FROM sync_telegram_inbox i JOIN sync_telegram_subscribers s ON s.workspace=i.workspace AND s.chat_id=i.payload->>'chatId' WHERE i.workspace=$1 AND i.update_id=$2 AND i.claim_token=$3 AND i.claimed_until>now() AND i.processed_at IS NULL AND s.active=true AND i.payload->>'chatId'=$4 LIMIT 1",
   [this.workspace,payload.updateId,payload.leaseToken,String(payload.chatId)]);
  if(!r.rows.length)throw new InputError('TELEGRAM_REPORT_LEASE_NOT_AUTHORIZED',403);
 }
 async telegramRequest(token,method,payload,timeout=45000){
  const response=await this.fetch('https://api.telegram.org/bot'+token+'/'+method,{
   method:'POST',body:payload instanceof FormData?payload:JSON.stringify(payload),
   headers:payload instanceof FormData?undefined:{'content-type':'application/json'},
   signal:AbortSignal.timeout(timeout)
  });
  if(!response.ok)throw new InputError('TELEGRAM_'+method.toUpperCase()+'_HTTP_'+response.status,502);
  const body=await response.json();
  if(body.ok!==true)throw new InputError('TELEGRAM_DELIVERY_REJECTED',502);
  return body.result?.message_id?{ok:true,messageId:body.result.message_id}:{ok:true};
 }
 async sendText(token,options){
  try{return await this.telegramRequest(token,'sendMessage',options);}
  catch(error){
   if(!(error instanceof InputError)||error.message!=='TELEGRAM_SENDMESSAGE_HTTP_400')
    throw error;
   const text=String(options.text||'');
   const plain=text.replace(/<[^>]*>/g,'').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/&amp;/g,'&');
   const {parse_mode,...safe}=options;
   return this.telegramRequest(token,'sendMessage',{...safe,text:plain});
  }
 }
 async message(payload){
  await this.verifyLease(payload);
  const txt=String(payload.text||'');
  if(!txt||txt.length>4096)throw new InputError('TELEGRAM_MESSAGE_SIZE_INVALID',400);
  const options={chat_id:String(payload.chatId),text:txt,parse_mode:'HTML'};
  if(payload.replyMarkup)options.reply_markup=payload.replyMarkup;
  const {botToken}=await this.config();
  if(payload.progress===true){
   const state=await this.pool.query(
    'SELECT progress_message_id FROM sync_telegram_inbox WHERE workspace=$1 AND update_id=$2 AND claim_token=$3 AND processed_at IS NULL AND failed_at IS NULL',
    [this.workspace,payload.updateId,payload.leaseToken]);
   if(!state.rows.length)throw new InputError('TELEGRAM_REPORT_LEASE_NOT_AUTHORIZED',403);
   if(state.rows[0].progress_message_id)return {ok:true,alreadyShown:true};
   const sent=await this.sendText(botToken,options);
   if(Number.isSafeInteger(sent.messageId))await this.pool.query(
    'UPDATE sync_telegram_inbox SET progress_message_id=$4 WHERE workspace=$1 AND update_id=$2 AND claim_token=$3',
    [this.workspace,payload.updateId,payload.leaseToken,sent.messageId]);
   return {ok:true};
  }
  return this.sendText(botToken,options);
 }
 async callback(payload){
  await this.verifyLease(payload);
  if(typeof payload.callbackQueryId!=='string'||payload.callbackQueryId.length<5||
     payload.callbackQueryId.length>200)throw new InputError('TELEGRAM_CALLBACK_INVALID',400);
  const {botToken}=await this.config();
  try {
   return await this.telegramRequest(botToken,'answerCallbackQuery',{
    callback_query_id:payload.callbackQueryId,text:String(payload.text||'').slice(0,180),
    show_alert:false
   });
  }catch(error){
   // Telegram expires callback IDs within seconds. A stale UI spinner must
   // never prevent processing the user's requested menu/report operation.
   if(error instanceof InputError && error.message==='TELEGRAM_ANSWERCALLBACKQUERY_HTTP_400')
    return {ok:true,callbackExpired:true};
   throw error;
  }
 }
 async progressStatus(chatId,messageId,text,token){
  if(Number(messageId)>0){
   try{return await this.telegramRequest(token,'editMessageText',{
    chat_id:String(chatId),message_id:Number(messageId),text
   },10000);}
   catch(error){
    if(!(error instanceof InputError)||!error.message.endsWith('_HTTP_400'))throw error;
   }
  }
  return this.telegramRequest(token,'sendMessage',{chat_id:String(chatId),text},12000);
 }
 async notifyTerminalFailure(result){
  if(!result?.terminal||!validChat(result.chatId))return;
  const {botToken}=await this.config();
  const code=String(result.code||'REPORT_GENERATION_FAILED').slice(0,90);
  await this.progressStatus(result.chatId,result.progressMessageId,
    '❌ تعذر إكمال الكشف بعد المحاولة التلقائية. أعد طلبه أو اختر فترة أقصر. رمز التشخيص: '+code,botToken);
 }
 async document(payload){
  await this.verifyLease(payload);
  if(typeof payload.base64!=='string'||payload.base64.length>28_000_000||
     payload.base64.length<16||! /^[A-Za-z0-9+/]+={0,2}$/.test(payload.base64))
   throw new InputError('TELEGRAM_DOCUMENT_ENCODING_INVALID',400);
  const existing=await this.pool.query(
   'SELECT document_delivered_at,progress_message_id FROM sync_telegram_inbox WHERE workspace=$1 AND update_id=$2 AND claim_token=$3 AND processed_at IS NULL',
   [this.workspace,payload.updateId,payload.leaseToken]);
  if(!existing.rows.length)throw new InputError('TELEGRAM_REPORT_LEASE_NOT_AUTHORIZED',403);
  if(existing.rows[0].document_delivered_at)return {ok:true,alreadyDelivered:true};
  const pdf=Buffer.from(payload.base64,'base64');
  if(pdf.length<30||pdf.length>20_000_000||pdf.toString('ascii',0,5)!=='%PDF-')
   throw new InputError('TELEGRAM_DOCUMENT_INVALID_PDF',400);
  const form=new FormData();
  form.append('chat_id',String(payload.chatId));
  form.append('document',new Blob([pdf],{type:'application/pdf'}),safeFilename(payload.filename));
  if(payload.caption)form.append('caption',String(payload.caption).slice(0,1024));
  const {botToken}=await this.config();
  const sent=await this.telegramRequest(botToken,'sendDocument',form,70000);
  const updated=await this.pool.query(
   'UPDATE sync_telegram_inbox SET document_delivered_at=now(),document_message_id=$4 WHERE workspace=$1 AND update_id=$2 AND claim_token=$3 AND processed_at IS NULL RETURNING progress_message_id',
   [this.workspace,payload.updateId,payload.leaseToken,sent.messageId||null]);
  if(updated.rowCount!==1)throw new InputError('TELEGRAM_DOCUMENT_CHECKPOINT_FAILED',503);
  try{
   const status=updated.rows[0].progress_message_id;
   if(status)await this.telegramRequest(botToken,'editMessageText',{
    chat_id:String(payload.chatId),message_id:Number(status),
    text:'✅ تم إرسال الكشف بنجاح كملف PDF.'
   },8000);
  }catch{/* Report was delivered; cosmetic Telegram status errors are nonfatal. */}
  return {ok:true,documentDelivered:true};
 }
}
