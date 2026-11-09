import crypto from 'node:crypto';

// A single server-side poller handles public Telegram /start and /stop even
// when no sales dashboard is open. Interactive report commands are queued for
// processing by an authenticated, connected accounting application.
const validChat=id=>/^-?\d{1,20}$/.test(String(id||''));
const updateText=x=>String(x||'').trim();
export class TelegramHub {
 constructor(pool,workspace,fetchImpl=fetch){
  this.pool=pool;this.workspace=workspace;this.fetch=fetchImpl;
  this.polling=false;this.nextPoll=0;
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
 async sendReply(token,chatId,text){
  try{
   await this.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text}),signal:AbortSignal.timeout(10000)
   });
  }catch(e){console.warn('telegram bot welcome reply deferred',e.message)}
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
  const isStart=/^\/(?:start|subscribe)(?:@\w+)?(?:\s.*)?$/i.test(text)||
   text==='اشتراك' || text==='مرحبا';
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
     if(isStart)action='start';
     // All commands and buttons, including /start, can be answered by the
     // existing full accounting report generator when a user is signed in.
     await client.query(
      'INSERT INTO sync_telegram_inbox(workspace,update_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [this.workspace,id,JSON.stringify(payload)]);
    }
   }
   await client.query(
    'UPDATE sync_telegram_bot_offsets SET last_update_id=$3 WHERE workspace=$1 AND bot_id=$2',
    [this.workspace,botId,id]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
  finally{client.release()}
  if(action==='start'){
   await this.sendReply(token,chatId,
    '✅ تم تفعيل اشتراكك في إشعارات مطبعة ومكتبة لبنان. ستصلك الإدخالات الجديدة بعد اعتمادها. يمكنك طلب الكشوفات من البوت، واستخدام /stop لإيقاف الإشعارات.');
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
   const saved=await this.pool.query(
    'SELECT last_update_id FROM sync_telegram_bot_offsets WHERE workspace=$1 AND bot_id=$2',
    [this.workspace,botId]);
   const offset=Number(saved.rows[0]?.last_update_id||0);
   const url='https://api.telegram.org/bot'+token+'/getUpdates?'+new URLSearchParams({
    offset:String(offset+1),timeout:'0',limit:'80',
    allowed_updates:JSON.stringify(['message','callback_query'])
   });
   const response=await this.fetch(url,{signal:AbortSignal.timeout(12000)});
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
 async claimInbox(){
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const q=await client.query(
    "SELECT update_id,payload FROM sync_telegram_inbox WHERE workspace=$1 AND processed_at IS NULL AND (claimed_until IS NULL OR claimed_until<now()) ORDER BY received_at,update_id FOR UPDATE SKIP LOCKED LIMIT 1",
    [this.workspace]);
   if(!q.rows.length){await client.query('COMMIT');return null}
   const row=q.rows[0],lease=crypto.randomUUID();
   await client.query(
    "UPDATE sync_telegram_inbox SET claim_token=$3,claimed_until=now()+interval '15 minutes' WHERE workspace=$1 AND update_id=$2",
    [this.workspace,row.update_id,lease]);
   await client.query('COMMIT');
   return {updateId:Number(row.update_id),leaseToken:lease,action:row.payload};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
  finally{client.release()}
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
