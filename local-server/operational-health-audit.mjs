/**
 * Read-only preflight of the accounting workspace.
 * Never auto-fix financial postings, delete pending commands, or derive ownership
 * from an invoice's printable number alone.
 */
const cents=n=>Math.round(Number(n)*100);
const validMoney=n=>typeof n==='number'&&Number.isFinite(n);
const code=s=>String(s??'').trim().toUpperCase();
const record=r=>r?.value??r??{};
const id=r=>r?.record_id??r?.id??record(r).id;
export function assessWorkspaceRecords(entities){
  const get=name=>entities[name]||[];
  const issues=[];
  const add=(severity,type,entity,recordId,info={})=>
    issues.push({severity,type,entity,id:String(recordId||''),...info});
  const entityNames=['parties','inventory','employees','accounts','treasuries'];
  const uniqueCodes={parties:'code',inventory:'code',treasuries:'code',accounts:'code',employees:'code'};
  for(const entity of entityNames){
    const seen=new Map();
    for(const row of get(entity)){
      const value=record(row),k=code(value[uniqueCodes[entity]]);
      if(!k)continue;
      if(seen.has(k)&&seen.get(k)!==id(row))add('high','DUPLICATE_BUSINESS_CODE',entity,id(row),{relatedId:seen.get(k),code:k});
      else seen.set(k,id(row));
    }
  }
  const invoices=get('invoices'),journals=get('journalEntries'),movements=get('stockMovements');
  const partyIds=new Set(get('parties').map(id));
  const employeeIds=new Set(get('employees').map(id));
  const inventoryIds=new Set(get('inventory').map(id));
  const invoiceIds=new Set(invoices.map(id));
  const invoiceNumbers=new Map(),journalByInvoice=new Map();
  for(const row of invoices){
    const v=record(row),num=code(v.invoiceNumber),rec=id(row);
    if(num){
      if(invoiceNumbers.has(num)&&invoiceNumbers.get(num)!==rec)
        add('high','DUPLICATE_INVOICE_NUMBER','invoices',rec,{relatedId:invoiceNumbers.get(num),code:num});
      else invoiceNumbers.set(num,rec);
    }
    if(!validMoney(v.totalAmount)||Number(v.totalAmount)<0)
      add('high','INVALID_INVOICE_TOTAL','invoices',rec);
    if(!validMoney(v.subtotal)||Number(v.subtotal)<0)
      add('high','INVALID_INVOICE_SUBTOTAL','invoices',rec);
    if(Number.isFinite(Number(v.subtotal))&&Array.isArray(v.items)){
      const total=v.items.reduce((sum,item)=>sum+Number(item.total||0),0);
      if(Math.abs(cents(total)-cents(v.subtotal))>1)
        add('high','INVOICE_ITEM_SUM_DIFFERS_FROM_SUBTOTAL','invoices',rec,{differenceCents:cents(total)-cents(v.subtotal)});
    }
    if(v.customerId&&!partyIds.has(v.customerId)&&!employeeIds.has(v.customerId)){
      add('review','INVOICE_PARTY_REFERENCE_NOT_IN_PARTIES_OR_EMPLOYEES','invoices',rec,{relatedId:v.customerId});
    }
    for(const item of v.items||[]){
      const itemId=item.itemId||item.inventoryItemId;
      if(itemId&&String(itemId).startsWith('inv-')&&!inventoryIds.has(itemId))
        add('review','INVOICE_PRODUCT_REFERENCE_NOT_FOUND','invoices',rec,{relatedId:itemId});
    }
  }
  for(const row of journals){
    const j=record(row),rec=id(row),lines=Array.isArray(j.lines)?j.lines:[];
    const debit=lines.reduce((sum,l)=>sum+Number(l.debit||0),0);
    const credit=lines.reduce((sum,l)=>sum+Number(l.credit||0),0);
    if(!lines.length||!Number.isFinite(debit)||!Number.isFinite(credit))
      add('high','INVALID_JOURNAL_LINES','journalEntries',rec);
    else if(Math.abs(cents(debit)-cents(credit))>1)
      add('high','UNBALANCED_JOURNAL','journalEntries',rec,{differenceCents:cents(debit)-cents(credit)});
    if(['pos_invoice','cogs'].includes(j.referenceType)){
      if(!j.referenceId||!invoiceIds.has(j.referenceId))
        add('review','JOURNAL_INVOICE_ID_NOT_FOUND','journalEntries',rec,{referenceType:j.referenceType,relatedId:j.referenceId});
      else{
        const current=journalByInvoice.get(j.referenceId)||{pos_invoice:0,cogs:0};
        current[j.referenceType]++;
        journalByInvoice.set(j.referenceId,current);
      }
    }
  }
  for(const row of invoices){
    const v=record(row),rec=id(row),j=journalByInvoice.get(rec)||{pos_invoice:0,cogs:0};
    if(v.isAccountingPosted===true&&j.pos_invoice===0)
      add('review','POSTED_INVOICE_WITHOUT_LINKED_REVENUE','invoices',rec);
    if(j.pos_invoice>1)add('review','MULTIPLE_SALES_JOURNALS_NEED_NET_RECONCILIATION','invoices',rec,{count:j.pos_invoice});
    if(j.cogs>1)add('review','MULTIPLE_COGS_JOURNALS_NEED_NET_RECONCILIATION','invoices',rec,{count:j.cogs});
  }
  for(const row of movements){
    const v=record(row),rec=id(row);
    if(v.itemId&&!inventoryIds.has(v.itemId))
      add('review','STOCK_ITEM_REFERENCE_MISSING','stockMovements',rec,{relatedId:v.itemId});
    if(!Number.isFinite(Number(v.quantity))||Number(v.quantity)<0)
      add('high','INVALID_STOCK_QUANTITY','stockMovements',rec);
    if(v.sourceInvoiceId&&!invoiceIds.has(v.sourceInvoiceId))
      add('review','EXPLICIT_STOCK_INVOICE_REFERENCE_MISSING','stockMovements',rec,{relatedId:v.sourceInvoiceId});
  }
  const byType={};const bySeverity={};
  for(const issue of issues){
    byType[issue.type]=(byType[issue.type]||0)+1;
    bySeverity[issue.severity]=(bySeverity[issue.severity]||0)+1;
  }
  return {snapshotAt:new Date().toISOString(),
    counts:Object.fromEntries(Object.entries(entities).map(([name,rows])=>[name,rows.length])),
    issueCount:issues.length,bySeverity,byType,issues};
}
export async function runWorkspaceReadOnlyAudit(pool,workspace){
  const client=await pool.connect();
  try{
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const entities={};
    for(const entity of ['invoices','journalEntries','stockMovements','parties','inventory','printOrders','employees','accounts','treasuries','vouchers','users','roles','settings','warehouses']){
      entities[entity]=(await client.query('SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity=$2',[workspace,entity])).rows;
    }
    const records=assessWorkspaceRecords(entities);
    const commandStats=(await client.query("SELECT count(*)::int AS committed_commands, count(DISTINCT command_id)::int AS distinct_commands FROM sync_commands WHERE workspace=$1",[workspace])).rows[0];
    const eventStats=(await client.query("SELECT count(*)::bigint AS count, max(sequence)::bigint AS max_sequence FROM sync_events WHERE workspace=$1",[workspace])).rows[0];
    await client.query('COMMIT');
    return {...records,commandStats,eventStats};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
