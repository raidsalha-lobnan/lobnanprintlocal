import {invoiceTelegramReceipt,splitInvoiceTelegramReceipt} from './telegram-invoice-format.mjs';
// Durable Telegram confirmations of authoritative PostgreSQL commits.
// All records and the delivery queue reside in the same lobnan_main database.
// Client-side saves are NOT proof of a central commit.
const ENTITIES=new Map([
 ['invoices','فاتورة'],['vouchers','سند'],['journalEntries','قيد يومية'],
 ['expenses','مصروف'],['purchases','مشتريات'],['purchaseReturns','مرتجع مشتريات'],
 ['salesReturns','مرتجع مبيعات'],['treasuryTransactions','حركة صندوق'],
 ['stockMovements','حركة مخزون'],['debtClearings','تسوية ذمم']
]);
// Invoice-related journals and stock movements are technical side-effects, not
// separate business actions. Confirm the invoice itself, not each ledger row.
export const telegramRelevantChanges=(changes)=>changes.filter(c=>{
 if(!ENTITIES.has(c.entity))return false;
 if(c.entity==='journalEntries' && ['pos_invoice','cogs','invoice_correction'].includes(c.value?.referenceType))return false;
 if(c.entity==='stockMovements' && c.value?.referenceType==='pos_invoice')return false;
 return true;
});
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
 constructor(pool,workspace,fetchImpl=fetch){
  this.pool=pool;this.workspace=workspace;this.fetch=fetchImpl;this.running=false;
 }
 async prepareQueue(config){
  // Existing configured chat remains an initial subscriber for compatibility.
  if(/^[-]?\d{1,20}$/.test(String(config.defaultChatId||''))){
   await this.pool.query(
    "INSERT INTO sync_telegram_subscribers(workspace,chat_id,subscribed_at) VALUES($1,$2,'1970-01-01'::timestamptz) ON CONFLICT DO NOTHING",
    [this.workspace,String(config.defaultChatId)]);
  }
  // Recipient membership is fixed as of the financial commit time. New
  // subscribers do NOT receive someone else's historical backlog.
  await this.pool.query(
   `INSERT INTO sync_telegram_recipients(workspace,command_id,chat_id,next_part)
    SELECT o.workspace,o.command_id,s.chat_id,
     CASE WHEN s.chat_id=$2 THEN o.next_part ELSE 0 END
    FROM sync_telegram_outbox o
    JOIN sync_telegram_subscribers s ON s.workspace=o.workspace
     AND s.active AND s.subscribed_at<=o.committed_at
    WHERE o.workspace=$1 AND o.delivered_at IS NULL
    ON CONFLICT DO NOTHING`,
   [this.workspace,String(config.defaultChatId||'')]);
  // If nobody was subscribed when the transaction committed, close the
  // outbox row instead of allowing a later subscriber to receive old data.
  await this.pool.query(
   `UPDATE sync_telegram_outbox o SET delivered_at=now()
    WHERE o.workspace=$1 AND o.delivered_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM sync_telegram_recipients d
      WHERE d.workspace=o.workspace AND d.command_id=o.command_id
      AND d.delivered_at IS NULL)`,
   [this.workspace]);
 }
 async drainOnce(){
  if(this.running)return 0;
  this.running=true;
  let sent=0;
  try{
   const setup=await this.pool.query(
    "SELECT value->'telegramConfig' AS config FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",
    [this.workspace]);
   const config=setup.rows[0]?.config;
   if(!config?.enabled||!config.botToken)return 0;
   await this.prepareQueue(config);
   for(let i=0;i<20;i++){
    const client=await this.pool.connect();
    try{
     await client.query('BEGIN');
     const result=await client.query(
      `SELECT d.command_id,d.chat_id,d.next_part,d.attempts,o.changes,o.committed_at
       FROM sync_telegram_recipients d
       JOIN sync_telegram_outbox o ON o.workspace=d.workspace AND o.command_id=d.command_id
       WHERE d.workspace=$1 AND d.delivered_at IS NULL AND d.next_attempt_at<=now()
        AND NOT EXISTS(
         SELECT 1 FROM sync_telegram_recipients older
         JOIN sync_telegram_outbox prior ON prior.workspace=older.workspace AND prior.command_id=older.command_id
         WHERE older.workspace=d.workspace AND older.chat_id=d.chat_id
          AND older.delivered_at IS NULL AND
           (prior.committed_at<o.committed_at OR
            (prior.committed_at=o.committed_at AND prior.command_id<o.command_id))
        )
       ORDER BY o.committed_at,d.command_id,d.chat_id
       FOR UPDATE OF d SKIP LOCKED LIMIT 1`,[this.workspace]);
     if(!result.rows.length){await client.query('COMMIT');break}
     const row=result.rows[0];
     const active=await client.query(
      'SELECT active FROM sync_telegram_subscribers WHERE workspace=$1 AND chat_id=$2',
      [this.workspace,row.chat_id]);
     if(!active.rows[0]?.active){
      await client.query(
       "UPDATE sync_telegram_recipients SET delivered_at=now(),last_error='SUBSCRIPTION_INACTIVE' WHERE workspace=$1 AND command_id=$2 AND chat_id=$3",
       [this.workspace,row.command_id,row.chat_id]);
      await client.query('COMMIT');continue;
     }
     const receipts=[];
     const invoiceChanges=row.changes.filter(x=>x.entity==='invoices' && x.value);
     if(invoiceChanges.length){
       const partyIds=[...new Set(invoiceChanges.flatMap(x=>
         [x.value.customerId,x.value.subCustomerId].filter(Boolean)))];
       const partyResult=partyIds.length?await client.query(
         "SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='parties' AND record_id = ANY($2::text[])",
         [this.workspace,partyIds]):{rows:[]};
       const parties=new Map(partyResult.rows.map(x=>[x.record_id,x.value]));
       const treasuryResult=await client.query(
         "SELECT entity,record_id,value FROM sync_records WHERE workspace=$1 AND entity IN ('treasuries','accounts')",
         [this.workspace]);
       const treasuryNames={};
       for(const x of treasuryResult.rows){
        const v=x.value||{};
        if(v.name){
         treasuryNames[x.record_id]=v.name;
         if(v.code)treasuryNames[v.code]=v.name;
         if(v.accountCode)treasuryNames[v.accountCode]=v.name;
        }
       }
       for(const change of invoiceChanges){
        receipts.push(invoiceTelegramReceipt(change.value,{
         mainCustomer:parties.get(change.value.customerId),
         subCustomer:parties.get(change.value.subCustomerId),
         treasuryNames,version:change.version,commandId:row.command_id
        }));
       }
     }else{
       receipts.push(committedTelegramText(row));
     }
     const parts=receipts.flatMap(part=>splitInvoiceTelegramReceipt(part));
     if(!parts.length)throw new Error('EMPTY_TELEGRAM_RECEIPT');
     let error=null,blocked=false;
     for(let index=Number(row.next_part||0);index<parts.length;index++){
      try{
       const response=await this.fetch(
        'https://api.telegram.org/bot'+config.botToken+'/sendMessage',{
         method:'POST',headers:{'content-type':'application/json'},
         body:JSON.stringify({
          chat_id:row.chat_id,text:parts[index],disable_web_page_preview:true
         }),
         signal:AbortSignal.timeout(12000)
        });
       const body=await response.json().catch(()=>({ok:false}));
       if(!response.ok||body.ok!==true){
        error='TELEGRAM_HTTP_'+response.status;
        blocked=response.status===403||body.error_code===403;
        break;
       }
      }catch(e){error='TELEGRAM_NETWORK_ERROR';break}
      await client.query(
       'UPDATE sync_telegram_recipients SET next_part=$4 WHERE workspace=$1 AND command_id=$2 AND chat_id=$3',
       [this.workspace,row.command_id,row.chat_id,index+1]);
     }
     if(blocked){
      // One blocked user never blocks or retries every other subscriber.
      await client.query(
       'UPDATE sync_telegram_subscribers SET active=false,updated_at=now() WHERE workspace=$1 AND chat_id=$2',
       [this.workspace,row.chat_id]);
      await client.query(
       "UPDATE sync_telegram_recipients SET delivered_at=now(),last_error='BOT_BLOCKED' WHERE workspace=$1 AND chat_id=$2 AND delivered_at IS NULL",
       [this.workspace,row.chat_id]);
     }else if(error){
      const minutes=Math.min(60,Math.max(1,2**Math.min(Number(row.attempts||0),6)));
      await client.query(
       "UPDATE sync_telegram_recipients SET attempts=attempts+1,last_error=$4,next_attempt_at=now()+($5*interval '1 minute') WHERE workspace=$1 AND command_id=$2 AND chat_id=$3",
       [this.workspace,row.command_id,row.chat_id,error,minutes]);
     }else{
      await client.query(
       'UPDATE sync_telegram_recipients SET delivered_at=now(),attempts=attempts+1,last_error=NULL WHERE workspace=$1 AND command_id=$2 AND chat_id=$3',
       [this.workspace,row.command_id,row.chat_id]);
      sent++;
     }
     await client.query('COMMIT');
    }catch(e){
     await client.query('ROLLBACK').catch(()=>{});
     console.error('telegram subscriber delivery worker',e.message);break;
    }finally{client.release()}
   }
   // A confirmed financial event is complete only after every intended
   // recipient has finished or unsubscribed.
   await this.pool.query(
    `UPDATE sync_telegram_outbox o SET delivered_at=now()
     WHERE o.workspace=$1 AND o.delivered_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sync_telegram_recipients d
        WHERE d.workspace=o.workspace AND d.command_id=o.command_id
          AND d.delivered_at IS NULL)`,[this.workspace]);
  }finally{this.running=false}
  return sent;
 }
}
