import crypto from 'node:crypto';
import {TELEGRAM_REPORT_COMMANDS,telegramReportsInlineMenu,telegramPersistentMainMenuKeyboard,telegramMenuText,isTelegramMenuMessage,isTelegramStartMessage,isTelegramMainMenuCallback,isTelegramQuickInvoiceMessage,telegramQuickInvoiceUrl} from './telegram-bot-menu.mjs';

// A single server-side poller handles public Telegram /start and /stop even
// when no sales dashboard is open. Interactive report commands are queued for
// processing by an authenticated, connected accounting application.
const validChat=id=>/^-?\d{1,20}$/.test(String(id||''));
const updateText=x=>String(x||'').trim();
export class TelegramHub {
 constructor(pool,workspace,fetchImpl=fetch){
  this.pool=pool;this.workspace=workspace;this.fetch=fetchImpl;
  this.polling=false;this.nextPoll=0;
  this.inboxWaiters=new Set();
  this.botMenuConfiguredToken=null;
  this.botMenuAttemptedToken=null;
  this.botMenuNextCheck=0;
 }
 async configuration(){
  const r=await this.pool.query(
   "SELECT value->'telegramConfig' AS config FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",
   [this.workspace]);
  return r.rows[0]?.config||null;
 }
 async seedDefaultChat(config){
  if(!config?.enabled||!validChat(config.defaultChatId))return;
  // The existing configured chat retains its subscription, including for
  // queued old confirmations. /stop always wins over this default seeding.
  await this.pool.query(
   "INSERT INTO sync_telegram_subscribers(workspace,chat_id,subscribed_at) VALUES($1,$2,'1970-01-01'::timestamptz) ON CONFLICT DO NOTHING",
   [this.workspace,String(config.defaultChatId)]);
 }
 async callBotApi(token,method,payload){
  const response=await this.fetch('https://api.telegram.org/bot'+token+'/'+method,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error('TELEGRAM_BOT_'+method+'_HTTP_'+response.status);
  const result=await response.json();
  if(result.ok!==true)throw new Error('TELEGRAM_BOT_'+method+'_REJECTED');
  return result.result;
 }
 async sendReply(token,chatId,text,replyMarkup,html=false){
  return this.callBotApi(token,'sendMessage',{
   chat_id:chatId,text,...(html?{parse_mode:'HTML'}:{}),
   ...(replyMarkup?{reply_markup:replyMarkup}:{})
  });
 }
 async sendMainMenu(token,chatId,{persistent=false}={}){
  if(persistent){
   // Always-visible one-tap reply keyboard inside the Telegram chat.
   try{
    await this.sendReply(token,chatId,
     'يمكنك فتح الكشوفات في أي وقت بزر 📋 القائمة الرئيسية أسفل المحادثة.',
     telegramPersistentMainMenuKeyboard());
   }catch(error){
    // A keyboard-setup problem must not prevent sending the actual report menu.
    console.warn('telegram persistent menu keyboard setup failed',error.message);
   }
  }
  // The entire report selection is shown directly by the server, without
  // waiting for an open accounting dashboard or a browser worker.
  return this.sendReply(token,chatId,telegramMenuText,telegramReportsInlineMenu(),true);
 }
 async configureTelegramMenu(token){
  if(this.botMenuAttemptedToken===token&&Date.now()<this.botMenuNextCheck)return;
  this.botMenuAttemptedToken=token;
  try{
   await this.callBotApi(token,'setMyCommands',{
    commands:TELEGRAM_REPORT_COMMANDS,scope:{type:'default'}
   });
   await this.callBotApi(token,'setChatMenuButton',{menu_button:{type:'commands'}});
   this.botMenuConfiguredToken=token;
   this.botMenuNextCheck=Date.now()+6*60*60*1000;
  }catch(error){
   this.botMenuNextCheck=Date.now()+60000;
   throw error;
  }
 }
 async ingest(update,botId,token){
  if(!Number.isSafeInteger(Number(update?.update_id)))return;
  const id=Number(update.update_id);
  const message=update.message;
  const callback=update.callback_query;
  const chat=message?.chat||callback?.message?.chat;
  const chatId=String(chat?.id??callback?.from?.id??'');
  const chatType=chat?.type||'private';
  const text=updateText(message?.text);
  const isStop=/^\/(?:stop|unsubscribe)(?:@\w+)?$/i.test(text)||
   text==='إلغاء الاشتراك';
  const isStart=isTelegramStartMessage(text)||text==='اشتراك'||text==='مرحبا';
  const showMenu=(isTelegramMenuMessage(text)||isStart||
    isTelegramMainMenuCallback(callback?.data));
  const showInvoice=!showMenu&&isTelegramQuickInvoiceMessage(text);
  const sender=message?.from||callback?.from;
  const payload={
   type:callback?'callback':'message',
   chatId,text:callback?String(callback.data||''):text,
   data:callback?String(callback.data||''):undefined,
   callbackQueryId:callback?String(callback.id||''):undefined,
   messageId:callback?.message?.message_id??message?.message_id,
   fromName:[sender?.first_name,sender?.last_name].filter(Boolean).join(' ').slice(0,100)
  };
  let action=null;
  let queued=false;
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   await client.query(
    'INSERT INTO sync_telegram_bot_offsets(workspace,bot_id,last_update_id) VALUES($1,$2,0) ON CONFLICT DO NOTHING',
    [this.workspace,botId]);
   const offset=await client.query(
    'SELECT last_update_id FROM sync_telegram_bot_offsets WHERE workspace=$1 AND bot_id=$2 FOR UPDATE',
    [this.workspace,botId]);
   if(id<=Number(offset.rows[0].last_update_id)){
    await client.query('COMMIT');return;
   }
   // Private chat only: adding the bot to an unrelated group cannot silently
   // subscribe everyone in that group to confidential financial reports.
   if(validChat(chatId)&&chatType==='private'&&(message?.text||callback)){
    if(isStop){
     await client.query(
      "INSERT INTO sync_telegram_subscribers(workspace,chat_id,active) VALUES($1,$2,false) ON CONFLICT(workspace,chat_id) DO UPDATE SET active=false,updated_at=now()",
      [this.workspace,chatId]);
     await client.query(
      "UPDATE sync_telegram_recipients SET delivered_at=now(),last_error='USER_UNSUBSCRIBED' WHERE workspace=$1 AND chat_id=$2 AND delivered_at IS NULL",
      [this.workspace,chatId]);
     action='stop';
    }else{
     await client.query(
      "INSERT INTO sync_telegram_subscribers(workspace,chat_id,active) VALUES($1,$2,true) ON CONFLICT(workspace,chat_id) DO UPDATE SET active=true,subscribed_at=CASE WHEN sync_telegram_subscribers.active THEN sync_telegram_subscribers.subscribed_at ELSE now() END,updated_at=now()",
      [this.workspace,chatId]);
     if(showMenu){
      // The public navigation menu must work even when the accounting browser
      // is closed. Do NOT enqueue another copy for the browser to repeat.
      action='menu';
     }else if(showInvoice){
      action='invoice';
     }else{
      // Report rendering remains isolated in the authorized accounting app.
      await client.query(
       'INSERT INTO sync_telegram_inbox(workspace,update_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
       [this.workspace,id,JSON.stringify(payload)]);
      queued=true;
     }
    }
   }
   await client.query(
    'UPDATE sync_telegram_bot_offsets SET last_update_id=$3 WHERE workspace=$1 AND bot_id=$2',
    [this.workspace,botId,id]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
  finally{client.release()}
  // Notify a connected report operator immediately after the PostgreSQL commit.
  if(queued)for(const wake of this.inboxWaiters)wake();
  if(action==='menu'){
   if(callback?.id){
    try{
     await this.callBotApi(token,'answerCallbackQuery',{callback_query_id:String(callback.id)});
    }catch(error){
     // Expired button acknowledgements must never block menu navigation.
     if(!String(error.message).includes('HTTP_400'))console.warn('telegram menu callback acknowledgement',error.message);
    }
   }
   await this.sendMainMenu(token,chatId,{persistent:isStart});
  }else if(action==='invoice'){
   await this.sendReply(token,chatId,
    '➕ افتح الكاشير من الزر التالي. بعد ربط حسابك مرة واحدة يمكنك إنشاء الفاتورة واعتمادها مباشرة.',
    {inline_keyboard:[[{text:'🧾 فتح كاشير الفواتير',web_app:{
      url:telegramQuickInvoiceUrl(text)
    }}],[{text:'📋 القائمة الرئيسية',callback_data:'menu_main'}]]});
  }else if(action==='stop'){
   await this.sendReply(token,chatId,
    'تم إيقاف الاشتراك. لإعادة تفعيل إشعارات الإدخالات أرسل /start.');
  }
 }
 async pollOnce(){
  if(this.polling||Date.now()<this.nextPoll)return 0;
  this.polling=true;
  try{
   const config=await this.configuration();
   if(!config?.enabled||!config.botToken)return 0;
   await this.seedDefaultChat(config);
   const token=String(config.botToken);
   const botId=token.split(':')[0];
   if(!/^\d+$/.test(botId))return 0;
   // Set Telegram's actual bottom-left Menu button and slash-command list.
   // Registration is cached and menu rendering never waits on an open browser.
   try{await this.configureTelegramMenu(token);}
   catch(error){console.warn('telegram bot menu setup retry scheduled',error.message);}
   const saved=await this.pool.query(
    'SELECT last_update_id FROM sync_telegram_bot_offsets WHERE workspace=$1 AND bot_id=$2',
    [this.workspace,botId]);
   const offset=Number(saved.rows[0]?.last_update_id||0);
   const url='https://api.telegram.org/bot'+token+'/getUpdates?'+new URLSearchParams({
    // Telegram long-poll returns as soon as an update exists, avoiding
    // a request/response gap for every button press.
    offset:String(offset+1),timeout:'10',limit:'80',
    allowed_updates:JSON.stringify(['message','callback_query'])
   });
   const response=await this.fetch(url,{signal:AbortSignal.timeout(16000)});
   if(!response.ok){
    if(response.status===409)
     console.warn('telegram getUpdates blocked by another poller/webhook; browser Telegram polling must be disabled');
    this.nextPoll=Date.now()+30000;return 0;
   }
   const body=await response.json();
   if(body.ok!==true||!Array.isArray(body.result))return 0;
   for(const update of body.result)await this.ingest(update,botId,token);
   return body.result.length;
  }catch(e){console.warn('telegram central polling',e.message);this.nextPoll=Date.now()+15000;return 0}
  finally{this.polling=false}
 }
 /** Suspend a client claim while the server receives Telegram updates.
  * Listeners are installed before the second database check, preventing a
  * missed message in the gap between SELECT and subscribe.
  * No DB connection is held while the HTTP request is waiting.
  */
 async claimInboxWait(waitMs=12000){
  const first=await this.claimInbox();
  if(first)return first;
  await new Promise((resolve,reject)=>{
   let closed=false,timer=null;
   const wake=error=>{
    if(closed)return;
    closed=true;
    clearTimeout(timer);
    this.inboxWaiters.delete(wake);
    if(error)reject(error);else resolve();
   };
   this.inboxWaiters.add(wake);
   timer=setTimeout(wake,Math.max(0,Math.min(12000,waitMs)));
   // Seal race: an inbox row might have committed just before registration.
   this.pool.query(
    "SELECT 1 FROM sync_telegram_inbox WHERE workspace=$1 AND processed_at IS NULL AND failed_at IS NULL AND (claimed_until IS NULL OR claimed_until<now()) LIMIT 1",
    [this.workspace]
   ).then(result=>{if(result.rows.length)wake();}).catch(wake);
  });
  return this.claimInbox();
 }
 async claimInbox(){
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const q=await client.query(
    "SELECT update_id,payload,attempts,document_delivered_at FROM sync_telegram_inbox WHERE workspace=$1 AND processed_at IS NULL AND failed_at IS NULL AND (claimed_until IS NULL OR claimed_until<now()) ORDER BY attempts,received_at,update_id FOR UPDATE SKIP LOCKED LIMIT 1",
    [this.workspace]);
   if(!q.rows.length){await client.query('COMMIT');return null}
   const row=q.rows[0],lease=crypto.randomUUID();
   await client.query(
    "UPDATE sync_telegram_inbox SET claim_token=$3,claimed_until=now()+interval '3 minutes',attempts=attempts+1 WHERE workspace=$1 AND update_id=$2",
    [this.workspace,row.update_id,lease]);
   await client.query('COMMIT');
   return {updateId:Number(row.update_id),leaseToken:lease,action:row.payload,
    attempts:Number(row.attempts||0)+1,documentDelivered:!!row.document_delivered_at};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
  finally{client.release()}
 }
 async releaseInbox(updateId,leaseToken){
  if(!Number.isSafeInteger(updateId)||updateId<=0||
    typeof leaseToken!=='string'||leaseToken.length!==36)return false;
  const r=await this.pool.query(
   "UPDATE sync_telegram_inbox SET claimed_until=now()+interval '20 seconds',claim_token=NULL WHERE workspace=$1 AND update_id=$2 AND claim_token=$3 AND processed_at IS NULL",
   [this.workspace,updateId,leaseToken]);
  return r.rowCount===1;
 }
 /** A report is retried once. Never leave a failed PDF job in an infinite loop. */
 async failInbox(updateId,leaseToken,code){
  if(!Number.isSafeInteger(updateId)||updateId<=0||
    typeof leaseToken!=='string'||leaseToken.length!==36)return null;
  const safeCode=/^[A-Z0-9_]{3,100}$/.test(String(code))?code:'REPORT_GENERATION_FAILED';
  const r=await this.pool.query(
   `UPDATE sync_telegram_inbox SET
       failure_code=$4,
       failed_at=CASE WHEN document_delivered_at IS NULL AND attempts>=2 THEN now() ELSE failed_at END,
       processed_at=CASE WHEN document_delivered_at IS NOT NULL THEN now() ELSE processed_at END,
       claimed_until=CASE WHEN attempts>=2 OR document_delivered_at IS NOT NULL THEN NULL ELSE now()+interval '3 seconds' END,
       claim_token=NULL
     WHERE workspace=$1 AND update_id=$2 AND claim_token=$3
       AND processed_at IS NULL AND failed_at IS NULL
     RETURNING attempts,failed_at IS NOT NULL AS terminal,
       payload->>'chatId' AS chat_id,progress_message_id`,
   [this.workspace,updateId,leaseToken,safeCode]);
  if(!r.rows.length)return null;
  return {terminal:r.rows[0].terminal,attempts:Number(r.rows[0].attempts),
   chatId:r.rows[0].chat_id,progressMessageId:r.rows[0].progress_message_id,
   code:safeCode};
 }
 async ackInbox(updateId,leaseToken){
  if(!Number.isSafeInteger(updateId)||updateId<=0||
     typeof leaseToken!=='string'||leaseToken.length!==36)return false;
  const r=await this.pool.query(
   "UPDATE sync_telegram_inbox SET processed_at=now(),claimed_until=NULL,claim_token=NULL WHERE workspace=$1 AND update_id=$2 AND claim_token=$3 AND processed_at IS NULL",
   [this.workspace,updateId,leaseToken]);
  return r.rowCount===1;
 }
}
