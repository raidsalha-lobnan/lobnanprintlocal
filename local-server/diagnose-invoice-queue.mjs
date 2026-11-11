/**
 * Read-only PostgreSQL invoice reconciliation report.
 * Usage: DATABASE_URL=... node local-server/diagnose-invoice-queue.mjs 55 63 64
 * No queue clearing, invoice renumbering, posting, or writes.
 */
import pg from 'pg';

const normalizedNumber=value=>{
 const match=/^(?:INV[-\\s]*)?0*(\\d{1,12})$/i.exec(String(value??'').trim());
 return match?String(BigInt(match[1])):null;
};
const numbers=[...new Set(process.argv.slice(2).map(normalizedNumber).filter(Boolean))];
if(!numbers.length){
 console.error('Usage: node local-server/diagnose-invoice-queue.mjs <invoice-number> [...]');
 process.exitCode=2;
}else if(!process.env.DATABASE_URL){
 console.error('DATABASE_URL required (read-only PostgreSQL access recommended)');
 process.exitCode=2;
}else{
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const workspace=process.env.SYNC_WORKSPACE||'lobnan_main';
  const inv=(await client.query(
   "SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='invoices'",
   [workspace])).rows.filter(row=>numbers.includes(normalizedNumber(row.value?.invoiceNumber)));
  const result=[];
  for(const number of numbers){
   const matched=inv.filter(row=>normalizedNumber(row.value?.invoiceNumber)===number);
   if(!matched.length){
    result.push({number,status:'NOT_FOUND_ON_SERVER',nextStep:'Compare the original device outbox command ID with sync_commands; do not recreate invoice yet'});
    continue;
   }
   for(const row of matched){
    const invoice=row.value;
    const journals=(await client.query(
      "SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND (value->>'referenceId'=$2 OR value->>'invoiceId'=$2)",
      [workspace,row.record_id])).rows;
    const movements=(await client.query(
      "SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='stockMovements' AND (value->>'sourceInvoiceId'=$2 OR value->>'referenceNumber'=$3 OR value->>'referenceNumber'=$4)",
      [workspace,row.record_id,String(invoice.invoiceNumber||''),'TEMP-'+row.record_id])).rows;
    const changes=(await client.query(
      "SELECT sequence,command_id FROM sync_events WHERE workspace=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(changes) ch WHERE ch->>'entity'='invoices' AND ch->>'id'=$2) ORDER BY sequence DESC LIMIT 20",
      [workspace,row.record_id])).rows;
    const journalKinds={};
    for(const j of journals){
      const kind=String(j.value?.referenceType||'unknown');
      journalKinds[kind]=(journalKinds[kind]||0)+1;
    }
    const journalUnbalanced=journals.filter(j=>{
      const lines=Array.isArray(j.value?.lines)?j.value.lines:[];
      const debit=lines.reduce((s,l)=>s+Number(l.debit||0),0);
      const credit=lines.reduce((s,l)=>s+Number(l.credit||0),0);
      return !lines.length||!Number.isFinite(debit)||!Number.isFinite(credit)||Math.abs(debit-credit)>0.01;
    }).map(j=>j.record_id);
    const concerns=[];
    if(matched.length>1)concerns.push('DUPLICATE_INVOICE_NUMBER');
    if(invoice.isAccountingPosted&&!journals.some(j=>j.value?.referenceType==='pos_invoice'))
      concerns.push('POSTED_WITHOUT_LINKED_SALES_JOURNAL');
    if((journalKinds.pos_invoice||0)>1)concerns.push('MULTIPLE_SALES_JOURNALS_REVIEW_HISTORY');
    if(journalUnbalanced.length)concerns.push('UNBALANCED_OR_EMPTY_JOURNAL');
    result.push({
      number,storedInvoiceNumber:invoice.invoiceNumber,recordId:row.record_id,serverVersion:Number(row.version),
      isOfficial:invoice.isOfficial===true,isAccountingPosted:invoice.isAccountingPosted===true,
      journalKinds,stockMovementCount:movements.length,
      committedInvoiceCommands:changes.map(x=>({sequence:Number(x.sequence),commandId:x.command_id})),
      concerns,status:concerns.length?'REQUIRES_LEDGER_REVIEW':'SERVER_RECORD_PRESENT',
      nextStep:'Compare the local outbox command IDs and fingerprints with committed receipts before retrying or settling'
    });
   }
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({workspace,readOnly:true,invoiceReports:result},null,2));
 }catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Invoice diagnosis failed:',error.message);
  process.exitCode=1;
 }finally{client.release();await pool.end();}
}
