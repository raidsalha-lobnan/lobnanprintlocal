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
  return {ok:true};
 }
 async message(payload){
  await this.verifyLease(payload);
  const txt=String(payload.text||'');
  if(!txt||txt.length>4096)throw new InputError('TELEGRAM_MESSAGE_SIZE_INVALID',400);
  const options={chat_id:String(payload.chatId),text:txt,parse_mode:'HTML'};
  if(payload.replyMarkup)options.reply_markup=payload.replyMarkup;
  const {botToken}=await this.config();
  try{return await this.telegramRequest(botToken,'sendMessage',options);}
  catch(error){
   if(!(error instanceof InputError)||error.message!=='TELEGRAM_SENDMESSAGE_HTTP_400')
    throw error;
   // Invalid HTML entities should not block the next chat command forever.
   // Retry once as plain text; true delivery failures still remain unacknowledged.
   const plain=txt.replace(/<[^>]*>/g,'').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/&amp;/g,'&');
   return this.telegramRequest(botToken,'sendMessage',{...options,text:plain,parse_mode:undefined});
  }
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
 async document(payload){
  await this.verifyLease(payload);
  if(typeof payload.base64!=='string'||payload.base64.length>28_000_000||
     payload.base64.length<16||! /^[A-Za-z0-9+/]+={0,2}$/.test(payload.base64))
   throw new InputError('TELEGRAM_DOCUMENT_ENCODING_INVALID',400);
  const pdf=Buffer.from(payload.base64,'base64');
  if(pdf.length<30||pdf.length>20_000_000||pdf.toString('ascii',0,5)!=='%PDF-')
   throw new InputError('TELEGRAM_DOCUMENT_INVALID_PDF',400);
  const form=new FormData();
  form.append('chat_id',String(payload.chatId));
  form.append('document',new Blob([pdf],{type:'application/pdf'}),safeFilename(payload.filename));
  if(payload.caption)form.append('caption',String(payload.caption).slice(0,1024));
  const {botToken}=await this.config();
  return this.telegramRequest(botToken,'sendDocument',form,70000);
 }
}
