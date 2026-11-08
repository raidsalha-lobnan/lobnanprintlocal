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
       "SELECT command_id,changes,committed_at,attempts,next_part FROM sync_telegram_outbox WHERE workspace=$1 AND delivered_at IS NULL AND next_attempt_at<=now() ORDER BY committed_at FOR UPDATE SKIP LOCKED LIMIT 1",[this.workspace]);
     if(!item.rows.length){await client.query('COMMIT');break}
     const row=item.rows[0];
     const setup=await client.query("SELECT value->'telegramConfig' AS config FROM sync_records WHERE workspace=$1 AND entity='settings' AND record_id IN ('global','workspace-settings') ORDER BY CASE WHEN record_id='global' THEN 0 ELSE 1 END LIMIT 1",[this.workspace]);
     const config=setup.rows[0]?.config;
     if(!config?.enabled||!config.botToken||!config.defaultChatId){
      await client.query("UPDATE sync_telegram_outbox SET last_error='TELEGRAM_CONFIGURATION_NOT_READY',next_attempt_at=now()+interval '10 minutes' WHERE workspace=$1 AND command_id=$2",[this.workspace,row.command_id]);
      await client.query('COMMIT');break;
     }
     // A committed invoice is rendered from the authoritative transaction,
     // never from the browser or a pre-sync form draft.
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
           treasuryNames,
           version:change.version,
           commandId:row.command_id
         }));
       }
     }else{
       receipts.push(committedTelegramText(row));
     }
     const parts=receipts.flatMap(text=>splitInvoiceTelegramReceipt(text));
     if(!parts.length)throw new Error('EMPTY_TELEGRAM_RECEIPT');
     let error=null;
     // Progress is checkpointed between Telegram messages, so a failed later
     // part cannot resend earlier confirmed parts on the next worker cycle.
     for(let index=Number(row.next_part||0);index<parts.length;index++){
       try{
         const response=await this.fetch('https://api.telegram.org/bot'+config.botToken+'/sendMessage',{
           method:'POST',headers:{'content-type':'application/json'},
           body:JSON.stringify({chat_id:config.defaultChatId,text:parts[index],disable_web_page_preview:true}),
           signal:AbortSignal.timeout(12000)
         });
         const body=await response.json().catch(()=>({ok:false}));
         if(!response.ok||body.ok!==true){error='TELEGRAM_HTTP_'+response.status;break;}
       }catch(e){error='TELEGRAM_NETWORK_ERROR';break;}
       await client.query(
         "UPDATE sync_telegram_outbox SET next_part=$3 WHERE workspace=$1 AND command_id=$2",
         [this.workspace,row.command_id,index+1]);
     }
     if(error){
       const minutes=Math.min(60,Math.max(1,2**Math.min(Number(row.attempts||0),6)));
       await client.query("UPDATE sync_telegram_outbox SET attempts=attempts+1,last_error=$3,next_attempt_at=now()+($4 * interval '1 minute') WHERE workspace=$1 AND command_id=$2",
         [this.workspace,row.command_id,error,minutes]);
       await client.query('COMMIT');break;
     }
     await client.query("UPDATE sync_telegram_outbox SET delivered_at=now(),attempts=attempts+1,last_error=NULL WHERE workspace=$1 AND command_id=$2",
       [this.workspace,row.command_id]);
     await client.query('COMMIT');
     sent++;
    }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error('telegram delivery worker',e.message);break}
    finally{client.release()}
   }
  }finally{this.running=false}
  return sent;
 }
}
