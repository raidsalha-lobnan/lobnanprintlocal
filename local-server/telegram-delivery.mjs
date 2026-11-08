// Durable Telegram confirmations of authoritative PostgreSQL commits.
// All records and the delivery queue reside in the same lobnan_main database.
// Client-side saves are NOT proof of a central commit.
const ENTITIES=new Map([
 ['invoices','فاتورة'],['vouchers','سند'],['journalEntries','قيد يومية'],
 ['expenses','مصروف'],['purchases','مشتريات'],['purchaseReturns','مرتجع مشتريات'],
 ['salesReturns','مرتجع مبيعات'],['treasuryTransactions','حركة صندوق'],
 ['stockMovements','حركة مخزون'],['debtClearings','تسوية ذمم']
]);
export const telegramRelevantChanges=(changes)=>changes.filter(c=>ENTITIES.has(c.entity));
const clean=(v,max=160)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
export function committedTelegramText(row){
 const c=telegramRelevantChanges(row.changes);
 const chunks=c.slice(0,12).map(change=>{
  const v=change.value||{};
  const number=v.invoiceNumber||v.voucherNumber||v.number||v.referenceNumber||change.id;
  const total=v.totalAmount??v.amount??v.total;
  return '- '+ENTITIES.get(change.entity)+': '+clean(number,80)+
   (total!==undefined?' | القيمة: '+clean(total,40):'')+
   ' | '+(change.version>1?'تعديل معتمد':'إدخال معتمد');
 });
 const remaining=c.length>12?'\n… و'+(c.length-12)+' سجلات إضافية':'';
 return '✅ تأكيد الحفظ في قاعدة البيانات الرئيسية\n'+
   'مطبعة ومكتبة لبنان\n'+
   'رقم العملية: '+clean(row.command_id,90)+'\n'+
   'تاريخ الاعتماد: '+new Date(row.committed_at).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'})+'\n'+
   chunks.join('\n')+remaining+
   '\nتم الاعتماد في PostgreSQL (lobnan_main) قبل إرسال هذا الإشعار.';
}
export class TelegramDelivery {
 constructor(pool,workspace,fetchImpl=fetch){this.pool=pool;this.workspace=workspace;this.fetch=fetchImpl;this.running=false;}
 async drainOnce(){
  if(this.running)return 0;
  this.running=true;
  let sent=0;
  try{
   // Transactions lock outbox rows while sending, preventing concurrent workers
   // from double-sending a commit simultaneously.
   for(let i=0;i<20;i++){
    const client=await this.pool.connect();
    try{
     await client.query('BEGIN');
     const item=await client.query(
       "SELECT command_id,changes,committed_at,attempts FROM sync_telegram_outbox WHERE workspace=$1 AND delivered_at IS NULL AND next_attempt_at<=now() ORDER BY committed_at FOR UPDATE SKIP LOCKED LIMIT 1",[this.workspace]);
     if(!item.rows.length){await client.query('COMMIT');break}
     const row=item.rows[0];
     const setup=await client.query("SELECT value->'telegramConfig' AS config FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",[this.workspace]);
     const config=setup.rows[0]?.config;
     if(!config?.enabled||!config.botToken||!config.defaultChatId){
      await client.query("UPDATE sync_telegram_outbox SET last_error='TELEGRAM_CONFIGURATION_NOT_READY',next_attempt_at=now()+interval '10 minutes' WHERE workspace=$1 AND command_id=$2",[this.workspace,row.command_id]);
      await client.query('COMMIT');break;
     }
     // Telegram is best-effort delivery AFTER the accounting commit.
     // On transient errors, preserve the row and retry; never roll back invoices.
     let error=null;
     try{
      const response=await this.fetch('https://api.telegram.org/bot'+config.botToken+'/sendMessage',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({chat_id:config.defaultChatId,text:committedTelegramText(row),disable_web_page_preview:true}),
        signal:AbortSignal.timeout(12000)
      });
      const body=await response.json().catch(()=>({ok:false}));
      if(!response.ok||body.ok!==true)error='TELEGRAM_HTTP_'+response.status;
     }catch(e){error='TELEGRAM_NETWORK_ERROR'}
     if(error){
      const minutes=Math.min(60,Math.max(1,2**Math.min(Number(row.attempts||0),6)));
      await client.query("UPDATE sync_telegram_outbox SET attempts=attempts+1,last_error=$3,next_attempt_at=now()+($4 * interval '1 minute') WHERE workspace=$1 AND command_id=$2",[this.workspace,row.command_id,error,minutes]);
      await client.query('COMMIT');break;
     }
     await client.query("UPDATE sync_telegram_outbox SET delivered_at=now(),attempts=attempts+1,last_error=NULL WHERE workspace=$1 AND command_id=$2",[this.workspace,row.command_id]);
     await client.query('COMMIT');
     sent++;
    }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error('telegram delivery worker',e.message);break}
    finally{client.release()}
   }
  }finally{this.running=false}
  return sent;
 }
}
