import crypto from 'node:crypto';
import {resolveAccess} from './access-policy.mjs';
import {generateOfficialReportPdf} from './official-report-renderer.mjs';

const CATEGORIES={
 customer_statement:{name:'كشف حساب عميل',entity:'parties',render:'customer_statement',partyType:'customer'},
 supplier_statement:{name:'كشف حساب مورد',entity:'parties',render:'supplier_statement',partyType:'supplier'},
 customer_items:{name:'كشف أصناف عميل',entity:'parties',render:'customer_items',partyType:'customer'},
 employee_statement:{name:'كشف حساب موظف',entity:'employees',render:'employee_statement'},
 sales_report:{name:'كشف فواتير المبيعات',render:'sales_report'},
 purchases_report:{name:'كشف المشتريات',render:'purchases_report'},
 treasury_report:{name:'حركات الصندوق',render:'treasuries_movement'},
 inventory_report:{name:'كشف المخزون',render:'inventory_report'},
 expenses_report:{name:'كشف المصروفات',render:'expenses_report'}
};
const PERIODS={
 today:'اليوم',this_month:'هذا الشهر',last_month:'الشهر السابق',
 last_30_days:'آخر 30 يومًا',this_year:'هذه السنة',all:'كامل الفترة'
};
const isPartyKind=(category)=>!!CATEGORIES[category]?.entity;
const safeText=v=>String(v??'').trim().slice(0,90);
export function safeReportErrorCode(error){
 const message=String(error?.message||error||'ERROR');
 if(/^[A-Z0-9_]{3,90}$/.test(message))return message;
 if(error instanceof TypeError)return 'REPORT_TEMPLATE_DATA_ERROR';
 if(error instanceof RangeError)return 'REPORT_TEMPLATE_RANGE_ERROR';
 return 'REPORT_GENERATION_FAILED';
}
const safeError=safeReportErrorCode;
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),
 String(d.getDate()).padStart(2,'0')].join('-');
export function reportPeriod(key,now=new Date()){
 const date=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const start=new Date(date);
 if(key==='all')return {fromDate:'',toDate:'',label:PERIODS[key]};
 if(key==='today')return {fromDate:iso(date),toDate:iso(date),label:PERIODS[key]};
 if(key==='this_month')start.setDate(1);
 else if(key==='last_month'){start.setMonth(start.getMonth()-1,1);date.setDate(0);}
 else if(key==='last_30_days')start.setDate(start.getDate()-29);
 else if(key==='this_year')start.setMonth(0,1);
 else throw Error('REPORT_PERIOD_UNKNOWN');
 return {fromDate:iso(start),toDate:iso(date),label:PERIODS[key]};
}
export class TelegramServerReportWorker {
 constructor(pool,workspace,gateway,adminUserId=''){
  this.pool=pool;this.workspace=workspace;this.gateway=gateway;
  this.adminUserId=adminUserId;this.busy=false;this.nextTry=0;
 }
 async pollOnce(){
  if(this.busy||Date.now()<this.nextTry)return 0;
  this.busy=true;
  try{
   const id=crypto.randomUUID();
   const q=await this.pool.query(
    `WITH next AS (SELECT update_id FROM sync_telegram_inbox
       WHERE workspace=$1 AND payload->>'processor'='server'
        AND processed_at IS NULL AND failed_at IS NULL
        AND (claimed_until IS NULL OR claimed_until<now())
       ORDER BY received_at,update_id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE sync_telegram_inbox i SET claim_token=$2,
       claimed_until=now()+interval '4 minutes',attempts=i.attempts+1
      FROM next WHERE i.workspace=$1 AND i.update_id=next.update_id
      RETURNING i.update_id,i.payload,i.attempts,i.document_delivered_at,i.progress_message_id`,
    [this.workspace,id]);
   if(!q.rows.length)return 0;
   const item=q.rows[0],payload=item.payload;
   try{
    await this.handle(payload,item);
    await this.pool.query(
     "UPDATE sync_telegram_inbox SET processed_at=now(),claim_token=NULL,claimed_until=NULL WHERE workspace=$1 AND update_id=$2 AND claim_token=$3",
     [this.workspace,item.update_id,id]);
   }catch(error){
    const code=safeError(error);
    console.error('telegram server report failed',item.update_id,code);
    const terminal=Number(item.attempts)>=2;
    await this.pool.query(
     `UPDATE sync_telegram_inbox SET failure_code=$4,
       failed_at=CASE WHEN $5 THEN now() ELSE NULL END,
       claimed_until=CASE WHEN $5 THEN NULL ELSE now()+interval '10 seconds' END,
       claim_token=NULL WHERE workspace=$1 AND update_id=$2 AND claim_token=$3`,
     [this.workspace,item.update_id,id,code,terminal]);
    // Never leave a Telegram user staring at "preparing" indefinitely.
    if(terminal){
     const config=await this.config().catch(()=>null);
     if(config){
      const message='تعذّر تجهيز الكشف بعد محاولتين. لم يُرسل ملف غير مكتمل. رمز الخطأ: '+code+
       '\nيمكنك إعادة الطلب من /menu أو مراسلة المسؤول.';
      let notified=false;
      if(item.progress_message_id){
       try{
        await this.gateway.progressStatus(payload.chatId,item.progress_message_id,message,config);
        notified=true;
       }catch{/* A failed status edit is followed by one ordinary message. */}
      }
      if(!notified)await this.send(config,payload.chatId,message,null).catch(()=>{});
     }
    }
   }
   return 1;
  }catch(error){
   console.error('telegram server report worker',safeError(error));
   this.nextTry=Date.now()+15000;return 0;
  }finally{this.busy=false;}
 }
 async config(){
  const r=await this.pool.query(
   "SELECT value->'telegramConfig' AS cfg FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",
   [this.workspace]);
  if(!r.rows[0]?.cfg?.enabled||!r.rows[0]?.cfg?.botToken)throw Error('REPORT_BOT_NOT_CONFIGURED');
  return r.rows[0].cfg.botToken;
 }
 async send(token,chatId,text,buttons=null){
  const data={chat_id:chatId,text,...(buttons?{reply_markup:{inline_keyboard:buttons}}:{})};
  return this.gateway.sendText(token,data);
 }
 async session(chatId,telegramUserId){
  if(!/^\d{1,20}$/.test(chatId)||chatId!==telegramUserId)
   throw Error('REPORT_PRIVATE_TELEGRAM_CHAT_REQUIRED');
  const r=await this.pool.query(
   `SELECT l.app_user_id,p.value AS profile FROM sync_telegram_pos_links l
    JOIN sync_auth_users a ON a.workspace=l.workspace AND a.user_id=l.app_user_id AND a.status='active'
    JOIN sync_records p ON p.workspace=l.workspace AND p.entity='users' AND p.record_id=l.app_user_id
    WHERE l.workspace=$1 AND l.telegram_user_id=$2`,[this.workspace,telegramUserId]);
  if(!r.rows.length)throw Error('REPORT_TELEGRAM_ACCOUNT_NOT_LINKED');
  const access=await resolveAccess(this.pool,this.workspace,r.rows[0].profile,this.adminUserId);
  if(!access.can('view')||!access.can('view_accounting'))throw Error('REPORT_PERMISSION_DENIED');
  return {access,user:r.rows[0].profile};
 }
 async saveSelection(chatId,telegramId,category,partyId=''){
  if(!CATEGORIES[category])throw Error('REPORT_UNKNOWN_CATEGORY');
  await this.pool.query(
   `INSERT INTO sync_telegram_report_sessions(workspace,chat_id,telegram_user_id,category,party_id)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(workspace,chat_id) DO UPDATE SET telegram_user_id=EXCLUDED.telegram_user_id,
     category=EXCLUDED.category,party_id=EXCLUDED.party_id,updated_at=now()`,
   [this.workspace,chatId,telegramId,category,partyId]);
 }
 async readSelection(chatId,telegramId){
  const r=await this.pool.query(
   "SELECT category,party_id FROM sync_telegram_report_sessions WHERE workspace=$1 AND chat_id=$2 AND telegram_user_id=$3 AND updated_at>now()-interval '24 hours'",
   [this.workspace,chatId,telegramId]);
  return r.rows[0]||null;
 }
 async showPeriod(token,chatId,category,partyId=''){
  const categoryInfo=CATEGORIES[category];
  const buttons=[
   [{text:'اليوم',callback_data:'period_today'},{text:'هذا الشهر',callback_data:'period_this_month'}],
   [{text:'الشهر السابق',callback_data:'period_last_month'},{text:'آخر 30 يومًا',callback_data:'period_last_30_days'}],
   [{text:'هذه السنة',callback_data:'period_this_year'},{text:'كامل الفترة',callback_data:'period_all'}],
   [{text:'رجوع إلى القائمة',callback_data:'menu_main'}]
  ];
  await this.send(token,chatId,'اختر فترة '+categoryInfo.name+':',buttons);
 }
 async showCategory(token,chatId,telegramId,category){
  const c=CATEGORIES[category];
  await this.saveSelection(chatId,telegramId,category);
  if(c.entity){
   await this.send(token,chatId,'أرسل اسم أو رمز '+(c.entity==='employees'?'الموظف':c.partyType==='supplier'?'المورد':'العميل')+' المطلوب لإعداد '+c.name+'.',[[{text:'القائمة الرئيسية',callback_data:'menu_main'}]]);
  }else await this.showPeriod(token,chatId,category);
 }
 async searchEntity(token,chatId,telegramId,category,query,access){
  const c=CATEGORIES[category],entity=c.entity;
  const q=safeText(query);
  if(q.length<2){
   await this.send(token,chatId,'اكتب حرفين على الأقل من الاسم أو رمز السجل.');
   return;
  }
  const rows=await this.pool.query(
   `SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity=$2
    AND (value->>'name' ILIKE $3 OR value->>'code' ILIKE $3 OR value->>'phone' ILIKE $3)
    ORDER BY CASE WHEN value->>'code' ILIKE $4 THEN 0 ELSE 1 END,record_id LIMIT 35`,
   [this.workspace,entity,'%'+q+'%',q+'%']);
  const permitted=rows.rows.filter(row=>{
   const value=row.value;
   if(!access.canRead(entity,value,row.record_id))return false;
   if(entity==='employees')return true;
   return c.partyType==='supplier'
    ?['supplier','both'].includes(value.type)
    :['customer','both'].includes(value.type);
  }).slice(0,7);
  if(!permitted.length){
   await this.send(token,chatId,'لم أجد اسمًا مطابقًا ضمن السجلات المسموح لك بعرضها. حاول بالاسم أو الرمز.');
   return;
  }
  const buttons=permitted.map(row=>[{text:String(row.value.name||row.value.code).slice(0,55),
   callback_data:'confirm_party_'+row.record_id}]);
  buttons.push([{text:'القائمة الرئيسية',callback_data:'menu_main'}]);
  await this.send(token,chatId,'اختر السجل المطلوب:',buttons);
 }
 async acknowledge(token,payload){
  if(!payload.callbackQueryId)return;
  try{
   await this.gateway.telegramRequest(token,'answerCallbackQuery',{callback_query_id:payload.callbackQueryId},8000);
  }catch(error){if(!String(error.message).includes('_HTTP_400'))console.warn('report callback acknowledge',safeError(error));}
 }
 async handle(payload,item){
  const token=await this.config();
  const chatId=String(payload.chatId||'');
  await this.acknowledge(token,payload);
  const telegramId=String(payload.telegramUserId||'');
  let auth;
  try{auth=await this.session(chatId,telegramId)}
  catch(error){
   await this.send(token,chatId,
    String(error.message).includes('NOT_LINKED')
     ?'للحصول على الكشوفات المالية، اربط تلجرام بحسابك في البرنامج مرة واحدة من إعدادات تلجرام.'
     :'لا توجد صلاحية حالية لإصدار الكشوفات عبر هذا الحساب. راجع مسؤول النظام.');
   return;
  }
  const command=safeText(payload.data||payload.text);
  const categoryMatch=command.match(/^menu_(customer_statement|supplier_statement|customer_items|employee_statement|sales_report|purchases_report|treasury_report|inventory_report|expenses_report)$/);
  if(categoryMatch){await this.showCategory(token,chatId,telegramId,categoryMatch[1]);return;}
  const selected=await this.readSelection(chatId,telegramId);
  const confirmed=command.match(/^confirm_party_(.+)$/);
  if(confirmed){
   const category=selected?.category||'customer_statement';
   if(!isPartyKind(category)){await this.send(token,chatId,'اختر نوع الكشف من /menu أولًا.');return;}
   const id=confirmed[1];
   const check=await this.pool.query(
    'SELECT value FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',
    [this.workspace,CATEGORIES[category].entity,id]);
   if(!check.rows.length||!auth.access.canRead(CATEGORIES[category].entity,check.rows[0].value,id))
    throw Error('REPORT_PARTY_NOT_AUTHORIZED');
   await this.saveSelection(chatId,telegramId,category,id);
   await this.showPeriod(token,chatId,category,id);
   return;
  }
  const legacy=command.match(/^period_(today|this_month|last_month|last_30_days|this_year|all)_(customer_statement|supplier_statement|customer_items|employee_statement|sales_report|purchases_report|treasury_report|inventory_report|expenses_report)_(.+)$/);
  const simple=command.match(/^period_(today|this_month|last_month|last_30_days|this_year|all)$/);
  if(legacy||simple){
   const period=legacy?legacy[1]:simple[1];
   const category=legacy?legacy[2]:selected?.category;
   const partyId=legacy?(legacy[3]==='all'?'':legacy[3]):selected?.party_id;
   if(!CATEGORIES[category])throw Error('REPORT_SELECTION_REQUIRED');
   if(isPartyKind(category)&&!partyId)throw Error('REPORT_PARTY_REQUIRED');
   const opts=reportPeriod(period);
   if(!item.progress_message_id&&!item.document_delivered_at){
    const progress=await this.send(token,chatId,
      'جاري إعداد '+CATEGORIES[category].name+' ('+opts.label+') من سجلات البرنامج المعتمدة...');
    if(progress.messageId){
     await this.pool.query(
      'UPDATE sync_telegram_inbox SET progress_message_id=$3 WHERE workspace=$1 AND update_id=$2',
      [this.workspace,item.update_id,progress.messageId]);
     item.progress_message_id=progress.messageId;
    }
   }
   if(item.document_delivered_at)return;
   const {pdf,filename}=await generateOfficialReportPdf({
    pool:this.pool,workspace:this.workspace,access:auth.access,
    type:CATEGORIES[category].render,partyId:CATEGORIES[category].entity==='parties'?partyId:'',
    employeeId:CATEGORIES[category].entity==='employees'?partyId:'',
    fromDate:opts.fromDate,toDate:opts.toDate
   });
   const form=new FormData();
   form.append('chat_id',chatId);
   form.append('caption',CATEGORIES[category].name+' - '+opts.label);
   form.append('document',new Blob([pdf],{type:'application/pdf'}),filename);
   const result=await this.gateway.telegramRequest(token,'sendDocument',form,75000);
   // Confirm delivery BEFORE acknowledging the bot update.
   await this.pool.query(
    'UPDATE sync_telegram_inbox SET document_delivered_at=now(),document_message_id=$3 WHERE workspace=$1 AND update_id=$2 AND document_delivered_at IS NULL',
    [this.workspace,item.update_id,result.messageId||null]);
   if(item.progress_message_id){
    await this.gateway.progressStatus(chatId,item.progress_message_id,'تم إرسال الكشف بنجاح.',token).catch(()=>{});
   }
   await this.send(token,chatId,'تم إرسال الكشف بنجاح.',[[{text:'القائمة الرئيسية',callback_data:'menu_main'}]]).catch(()=>{});
   return;
  }
  if(command==='/reports'||command==='/report'||command==='كشف'||command==='الكشوفات'){
   await this.send(token,chatId,'اختر نوع الكشف:',Object.entries(CATEGORIES).map(([key,c])=>
    [{text:c.name,callback_data:'menu_'+key}]));
   return;
  }
  if(selected&&isPartyKind(selected.category)&&payload.type==='message'){
   await this.searchEntity(token,chatId,telegramId,selected.category,command,auth.access);
   return;
  }
  await this.send(token,chatId,'اختر نوع الكشف من القائمة أو أرسل /reports.',Object.entries(CATEGORIES).map(([key,c])=>
   [{text:c.name,callback_data:'menu_'+key}]));
 }
}
