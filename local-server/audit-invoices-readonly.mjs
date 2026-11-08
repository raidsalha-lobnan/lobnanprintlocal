import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const dir='D:/LobnanData/audit';
const fixed=n=>Math.round((Number(n)||0)*100)/100;
const sumLines=j=>fixed((j.value.lines||[]).reduce((s,l)=>s+Number(l.debit||0),0));
let client;
try{
 client=await pool.connect();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const fetchRecords=async e=>(await client.query('SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity=$2',['lobnan_main',e])).rows;
 const invoices=await fetchRecords('invoices');
 const journals=await fetchRecords('journalEntries');
 const stocks=await fetchRecords('stockMovements');
 const settings=await fetchRecords('settings');
 const byRef=new Map(),byStockRef=new Map();
 for(const j of journals){const id=j.value.referenceId;if(!id)continue;if(!byRef.has(id))byRef.set(id,[]);byRef.get(id).push(j);}
 for(const m of stocks){const id=m.value.referenceNumber;if(!id)continue;if(!byStockRef.has(id))byStockRef.set(id,[]);byStockRef.get(id).push(m);}
 const findings={critical:[],review:[]};const seen=new Map();
 for(const row of invoices){
  const i=row.value,number=String(i.invoiceNumber||'');const items=i.items||[];
  if(seen.has(number))findings.critical.push({code:'DUPLICATE_INVOICE_NUMBER',invoice:number,details:[seen.get(number),i.id]});
  else seen.set(number,i.id);
  const related=byRef.get(i.id)||[],revenue=related.filter(j=>j.value.referenceType==='pos_invoice'),cogs=related.filter(j=>j.value.referenceType==='cogs');
  const salesAmounts=revenue.map(sumLines),total=fixed(i.baseTotalAmount??i.totalAmount);
  if(revenue.length>1)findings.critical.push({code:'MULTIPLE_SALES_JOURNALS',invoice:number,recordId:i.id,version:row.version,invoiceTotal:total,postings:salesAmounts});
  else if(revenue.length===1 && Math.abs(salesAmounts[0]-total)>0.011) findings.critical.push({code:'INVOICE_JOURNAL_TOTAL_MISMATCH',invoice:number,recordId:i.id,invoiceTotal:total,journalTotal:salesAmounts[0]});
  if(cogs.length>1)findings.critical.push({code:'MULTIPLE_COST_JOURNALS',invoice:number,recordId:i.id,costs:cogs.map(sumLines)});
  if(!revenue.length&&i.isAccountingPosted)findings.review.push({code:'MISSING_LINKED_REVENUE_JOURNAL',invoice:number,recordId:i.id});
  const subtotal=fixed(items.reduce((s,x)=>s+Number(x.total||0),0));
  if(Math.abs(subtotal-fixed(i.subtotal))>0.011)findings.critical.push({code:'LINE_SUBTOTAL_MISMATCH',invoice:number,recordId:i.id,itemsSubtotal:subtotal,invoiceSubtotal:i.subtotal});
  const references=[number,'TEMP-'+i.id,i.tempInvoiceNumber].filter(Boolean);
  const movements=references.flatMap(ref=>byStockRef.get(ref)||[]);
  if(!movements.length && items.length)findings.review.push({code:'NO_LINKED_STOCK_MOVEMENT',invoice:number,recordId:i.id});
 }
 // Keep a per-invoice hash baseline. New invoices are not mistaken for edits;
 // every change to an existing record is recorded, including text-only edits.
 fs.mkdirSync(dir,{recursive:true});
 const baselinePath=path.join(dir,'invoice-content-baseline.json');
 const historyPath=path.join(dir,'invoice-change-history.jsonl');
 let baseline={};try{baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'))}catch{}
 const nextBaseline={};
 const changedInvoices=[];
 // A value restored between hourly scans would have the same hash.
 // Check the ordered PostgreSQL event stream as well to detect edits/reverts.
 const cursorFile=path.join(dir,'invoice-audit-event-cursor.json');
 let priorCursor=null;
 try{const oldCursor=JSON.parse(fs.readFileSync(cursorFile,'utf8'));if(Number.isSafeInteger(oldCursor.sequence)&&oldCursor.sequence>=0)priorCursor=oldCursor.sequence}catch{}
 const head=await client.query('SELECT next_sequence FROM sync_workspaces WHERE id=$1',['lobnan_main']);
 const endCursor=Number(head.rows[0]?.next_sequence||0);
 const invoiceEditEvents=[];
 if(priorCursor!==null){
  const events=await client.query('SELECT sequence,command_id,changes FROM sync_events WHERE workspace=$1 AND sequence>$2 AND sequence<=$3 ORDER BY sequence',['lobnan_main',priorCursor,endCursor]);
  for(const event of events.rows){
   for(const change of event.changes||[]){
    if(change.entity==='invoices' && Number(change.version)>1){
     invoiceEditEvents.push({sequence:event.sequence,commandId:event.command_id,
      invoice:change.value?.invoiceNumber,id:change.id,version:change.version});
    }
   }
  }
 }
 await client.query('COMMIT');
 for(const row of invoices){
  const hash=crypto.createHash('sha256').update(JSON.stringify(row.value)).digest('hex');
  nextBaseline[row.record_id]={number:row.value.invoiceNumber,version:Number(row.version),hash,
   total:row.value.totalAmount};
  const previous=baseline[row.record_id];
  if(previous&&previous.hash!==hash){
   changedInvoices.push({number:row.value.invoiceNumber,id:row.record_id,
    fromVersion:previous.version,toVersion:Number(row.version),
    oldTotal:previous.total,newTotal:row.value.totalAmount,
    versionUnchanged:previous.version===Number(row.version)});
  }
 }
 if(changedInvoices.length||invoiceEditEvents.length)fs.appendFileSync(historyPath,JSON.stringify({at:new Date().toISOString(),changes:changedInvoices,events:invoiceEditEvents})+'\n');
 const report={generatedAt:new Date().toISOString(),database:'lobnan_main',invoiceCount:invoices.length,
  journalCount:journals.length,stockMovementCount:stocks.length,
  criticalCount:findings.critical.length,reviewCount:findings.review.length,
  changesSincePreviousAudit:changedInvoices,
  invoiceEditEventsSincePreviousAudit:invoiceEditEvents,
  critical:findings.critical,review:findings.review};
 fs.mkdirSync(dir,{recursive:true});
 const latest=path.join(dir,'invoice-integrity-latest.json');
 fs.writeFileSync(latest,JSON.stringify(report,null,2),'utf8');
 const digest=crypto.createHash('sha256').update(JSON.stringify(findings)).digest('hex');
 const statePath=path.join(dir,'last-alert-state.json');
 let old={};try{old=JSON.parse(fs.readFileSync(statePath,'utf8'))}catch{}
 const ageHours=old.sentAt?(Date.now()-Date.parse(old.sentAt))/3600000:Infinity;
 const shouldAlert=changedInvoices.length>0 || invoiceEditEvents.length>0 || (report.criticalCount>0&&(digest!==old.digest||ageHours>=24));
 let telegram='NOT_ATTEMPTED';
 if(shouldAlert){
  const conf=settings.find(x=>x.record_id==='global')?.value?.telegramConfig;
  if(conf?.enabled&&conf.botToken&&conf.defaultChatId){
   const invoiceNos=[...new Set(findings.critical.map(x=>x.invoice))];
   const msg='⚠️ تنبيه تدقيق محاسبي - مطبعة ومكتبة لبنان\n'+
   'فحص قاعدة PostgreSQL الرئيسية (قراءة فقط)\n'+
   'الفواتير المفحوصة: '+invoices.length+'\n'+
   'مؤشرات عالية الخطورة: '+report.criticalCount+'\n'+
   'مؤشرات للمراجعة: '+report.reviewCount+'\n'+
   'تغييرات محتوى الفواتير: '+changedInvoices.length+'\n'+
   'أحداث تعديل الفواتير: '+invoiceEditEvents.length+'\n'+
   (changedInvoices.length?'الفواتير التي تغيرت: '+changedInvoices.map(x=>x.number).join('، ')+'\n':'')+
   (invoiceEditEvents.length?'تعديلات في سجل المزامنة: '+[...new Set(invoiceEditEvents.map(x=>x.invoice||x.id))].join('، ')+'\n':'')+
   'فواتير ذات مؤشرات حرجة: '+invoiceNos.join('، ')+'\n'+
   'يرجى مراجعة النتائج قبل أي تعديل. لم تُغيّر هذه المهمة أي فاتورة أو رصيد.';
   const response=await fetch('https://api.telegram.org/bot'+conf.botToken+'/sendMessage',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:conf.defaultChatId,text:msg}),signal:AbortSignal.timeout(15000)
   });
   const result=await response.json().catch(()=>({ok:false}));
   if(!response.ok||!result.ok)throw Error('AUDIT_TELEGRAM_ALERT_SEND_FAILED');
   telegram='SENT_CONFIRMED';
   fs.writeFileSync(statePath,JSON.stringify({digest,sentAt:new Date().toISOString(),criticalCount:report.criticalCount}));
  }else telegram='NOT_CONFIGURED';
 }else telegram='NO_NEW_ALERT';
 // Checkpoint only when audit completed; a failed Telegram send leaves the
 // previous baseline intact so the next run re-detects the same change.
 fs.writeFileSync(baselinePath,JSON.stringify(nextBaseline),'utf8');
 fs.writeFileSync(cursorFile,JSON.stringify({sequence:endCursor,recordedAt:new Date().toISOString()}),'utf8');
 console.log(JSON.stringify({report:latest,invoices:invoices.length,critical:report.criticalCount,
  review:report.reviewCount,criticalInvoices:[...new Set(findings.critical.map(x=>x.invoice))],
  telegram,summary:report.critical.slice(0,16)}));
}catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('AUDIT_ERROR '+e.message);process.exitCode=1}finally{client?.release();await pool.end()}
