import crypto from 'node:crypto';
import {InputError,validId} from './sync-domain.mjs';
import {verifyInvoiceRevisionBaseline} from './invoice-revision-baseline.mjs';
import {buildVerifiedInvoiceRevisionBundle} from './invoice-revision-bundle.mjs';
import {planFailedInvoiceEditRecovery} from './invoice-legacy-recovery.mjs';
import {isUnchangedPosInvoice,descriptionOnlyInvoiceAmendment} from './invoice-revision-noop.mjs';
import {isPhysical,isDelivery,minor,invoiceAmounts} from './invoice-revision-ledger.mjs';
import {validateProposedInvoice} from './invoice-revision-arithmetic.mjs';
import {proveInvoiceOnlyPartyBalance} from './invoice-party-balance.mjs';

/**
 * Authenticated server-side invoice correction. There are no client-provided
 * journals or stock movements. The source document, ledger and versions are
 * loaded and locked in one PostgreSQL transaction.
 */
export async function revisePostedInvoice(service,workspace,request,actorId,access){
 if(!request||!validId(request.commandId)||!validId(request.invoiceId)||
   !Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<1||
   !request.proposed||typeof request.proposed!=='object'||Array.isArray(request.proposed))
  throw new InputError('INVALID_INVOICE_REVISION_REQUEST',422);
 const hash=crypto.createHash('sha256').update(JSON.stringify({
  invoiceId:request.invoiceId,expectedVersion:request.expectedVersion,proposed:request.proposed
 })).digest('hex');
 return service.withTx(async client=>{
  await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[workspace]);
  await client.query('SELECT next_sequence,next_invoice FROM sync_workspaces WHERE id=$1 FOR UPDATE',[workspace]);
  const duplicate=await client.query(
   'SELECT request_fingerprint,actor_id,receipt FROM sync_invoice_revision_requests WHERE workspace=$1 AND request_id=$2',
   [workspace,request.commandId]);
  if(duplicate.rows.length){
   const d=duplicate.rows[0];
   if(d.request_fingerprint!==hash)throw new InputError('INVOICE_REVISION_ID_REUSED',409);
   if(d.actor_id!==actorId)throw new InputError('INVOICE_REVISION_WRONG_OWNER',403);
   return d.receipt;
  }
  const result=await client.query(
   "SELECT version,value FROM sync_records WHERE workspace=$1 AND entity='invoices' AND record_id=$2",
   [workspace,request.invoiceId]);
  const stored=result.rows[0];
  if(!stored)throw new InputError('INVOICE_REVISION_NOT_FOUND',404);
  const actual=Number(stored.version);
  if(actual!==request.expectedVersion)
   throw new InputError('VERSION_CONFLICT',409,
    {entity:'invoices',id:request.invoiceId,expectedVersion:request.expectedVersion,actualVersion:actual});
  const invoice=stored.value,proposed=request.proposed;
  if(!access?.canReviseInvoice?.(invoice,proposed))
   throw new InputError('INVOICE_REVISION_PERMISSION_DENIED',403);
  if(invoice.id!==request.invoiceId||proposed.id!==invoice.id||
     proposed.invoiceNumber!==invoice.invoiceNumber)
   throw new InputError('INVOICE_REVISION_IDENTITY_IMMUTABLE',422);
  // A review/save without business changes must never re-post or repair accounting.
  // Confirm the authoritative invoice version and permissions first; return its
  // existing row as an acknowledgement without touching journals, balances or stock.
  if(isUnchangedPosInvoice(invoice,proposed)){
   const receipt={commandId:request.commandId,changes:[{
    entity:'invoices',id:invoice.id,version:actual,value:invoice
   }]};
   await client.query(
    'INSERT INTO sync_invoice_revision_requests(workspace,request_id,invoice_id,request_fingerprint,actor_id,receipt) VALUES($1,$2,$3,$4,$5,$6)',
    [workspace,request.commandId,invoice.id,hash,actorId,JSON.stringify(receipt)]);
   return receipt;
  }
  const descriptionAmendment=descriptionOnlyInvoiceAmendment(invoice,proposed);
  if(descriptionAmendment){
   if(invoice.isAccountingPosted!==true &&
      proposed.workflowStatus!==invoice.workflowStatus)
    throw new InputError('INVOICE_REQUIRES_INITIAL_POSTING_WORKFLOW',422);
   const now=new Date().toISOString();
   const amended={...descriptionAmendment,updatedAt:now,
    statusHistory:[...(invoice.statusHistory||[]),{
     id:'revision-'+request.commandId,userName:'معالجة مركزية',
     date:now.slice(0,10),createdAt:now,
     previousStatus:invoice.workflowStatus||'new',
     newStatus:proposed.workflowStatus||invoice.workflowStatus||'new',
     notes:'تعديل بيانات وصفية دون أثر محاسبي'
    }]};
   const command={id:request.commandId,workspaceId:workspace,changes:[{
    entity:'invoices',id:invoice.id,expectedVersion:actual,value:amended
   }]};
   const receipt=await service.pushInTx(workspace,command,actorId,client,invoice.id);
   await client.query(
    'INSERT INTO sync_invoice_revision_requests(workspace,request_id,invoice_id,request_fingerprint,actor_id,receipt) VALUES($1,$2,$3,$4,$5,$6)',
    [workspace,request.commandId,invoice.id,hash,actorId,JSON.stringify(receipt)]);
   return receipt;
  }
  // Corrective changes keep the immutable original journal and stock audit.
  // Ordinary invoice reports read the latest stored date and warehouse.
  const currency=v=>(v==='₪'||!v)?'ILS':String(v);
  if(currency(invoice.currency)!==currency(proposed.currency))
   throw new InputError('INVOICE_REVISION_CURRENCY_DENOMINATION_WORKFLOW_REQUIRED',422);
  if(typeof proposed.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(proposed.date)||
     !Number.isFinite(Date.parse(proposed.date+'T00:00:00Z'))||
     new Date(proposed.date+'T00:00:00Z').toISOString().slice(0,10)!==proposed.date)
   throw new InputError('INVOICE_REVISION_DATE_INVALID',422);
  if(typeof proposed.warehouse!=='string'||!proposed.warehouse.trim())
   throw new InputError('INVOICE_REVISION_WAREHOUSE_REQUIRED',422);
  const rate=Number(proposed.exchangeRate||1);
  if(!Number.isFinite(rate)||rate<=0)
   throw new InputError('INVOICE_REVISION_RATE_INVALID',422);
  // The ILS base currency is always valued at 1 ILS per ILS.
  if(currency(proposed.currency)==='ILS'&&Math.abs(rate-1)>0.000001)
   throw new InputError('INVOICE_REVISION_BASE_CURRENCY_RATE_MUST_BE_ONE',422);
  // A settled foreign-currency payment needs its actual settlement currency,
  // holding account and FX variance account. Never invent a new receivable or
  // revalue an already-collected amount without these documents.
  if(Math.abs(Number(invoice.exchangeRate||1)-rate)>0.0000001&&
    Number(invoice.basePaidAmount??invoice.paidAmount??0)>0)
   throw new InputError('INVOICE_REVISION_PAID_FX_SETTLEMENT_NEEDS_REVIEW',409,{
    invoiceNumber:invoice.invoiceNumber,oldRate:invoice.exchangeRate||1,
    proposedRate:rate,manualReviewRequired:true,
    reason:'Foreign currency rate change for a settled payment requires verified FX settlement and gain/loss accounting'
   });
  try{validateProposedInvoice(proposed,{original:invoice});}
  catch(error){throw new InputError('INVOICE_REVISION_INVALID_ARITHMETIC',422,
   {reason:String(error.message)});}
  const journalRows=(await client.query(
   "SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND value->>'referenceId'=$2",
   [workspace,invoice.id])).rows;
  const movementRows=(await client.query(
   "SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='stockMovements' AND (value->>'referenceNumber'=$2 OR value->>'referenceNumber'=$3)",
   [workspace,invoice.invoiceNumber,'TEMP-'+invoice.id])).rows;
  let plan,legacyRecovery=null;
  try{
   plan=verifyInvoiceRevisionBaseline({invoice,proposed,journals:journalRows,movements:movementRows});
  }catch(error){
   // Recover only fully evidenced failed historical edits. A recent customer
   // balance event must prove that the old-to-new debit was ALREADY applied.
   // Otherwise the legacy duplicate remains quarantined for accounting review.
   try{
    const partyRow=(await client.query(
     "SELECT record_id AS id,version,value FROM sync_records WHERE workspace=$1 AND entity='parties' AND record_id=$2",
     [workspace,invoice.customerId])).rows[0];
    if(!partyRow)throw new Error('LEGACY_REPAIR_PARTY_MISSING');
    const eventRows=(await client.query(
     "SELECT e.sequence,c->'value' AS value FROM sync_events e CROSS JOIN LATERAL jsonb_array_elements(e.changes) c WHERE e.workspace=$1 AND c->>'entity'='parties' AND c->>'id'=$2 ORDER BY e.sequence",
     [workspace,invoice.customerId])).rows;
    legacyRecovery=planFailedInvoiceEditRecovery({
     invoice,proposed,journals:journalRows,movements:movementRows,
     party:{...partyRow.value,id:partyRow.id},partyEvents:eventRows
    });
    plan=legacyRecovery.plan;
    // Evidence-based legacy recovery only. Never repeat the already-applied
    // customer delta or silently alter cash/bank receipts.
    plan.accountDeltas={'1201':plan.totalDeltaMinor,'4101':-plan.totalDeltaMinor};
    plan.paymentDeltas={};
   }catch(recoveryError){
    const types=journalRows.reduce((counts,row)=>{
     const type=String(row.value?.referenceType||'unknown');
     counts[type]=(counts[type]||0)+1;
     return counts;
    },{});
    const questionableMovements=movementRows.filter(row=>{
     const m=row.value||{};
     const owned=m.sourceInvoiceId||m.referenceId;
     // Stock movements identified only by a display invoice number are not
     // proof if the dates differ from the posted source invoice.
     return (owned&&owned!==invoice.id)||
       (!owned&&m.date&&invoice.date&&m.date!==invoice.date);
    });
    throw new InputError('INVOICE_REVISION_BASELINE_NEEDS_RECONCILIATION',409,{
     invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,
     reason:String(error.message),legacyReason:String(recoveryError.message),
     manualReviewRequired:true,
     linkedJournalIds:journalRows.map(r=>r.record_id).slice(0,50),
     linkedStockMovementIds:movementRows.map(r=>r.record_id).slice(0,50),
     diagnosis:{
      salesJournalCount:types.pos_invoice||0,
      cogsJournalCount:types.cogs||0,
      correctionJournalCount:types.invoice_correction||0,
      stockMovementCandidateCount:movementRows.length,
      stockMovementsWithUnverifiedDateOrOwner:questionableMovements.length,
      invoiceDate:invoice.date,
      baselineRequiresAccountantReview:true
     }
    });
   }
  }
  const counterpartyType=inv=>inv.counterpartyType||
   ((inv.employeeId&&inv.employeeId===inv.customerId)||
    /^emp-/.test(inv.customerId||'')?'employee':'customer');
  const originalType=counterpartyType(invoice),nextType=counterpartyType(proposed);
  // Employee receivables are computed by the employee subledger. Never
  // create fictitious employee rows inside 'parties'.
  if(!legacyRecovery){
   const oldParty=invoice.subCustomerId||invoice.customerId;
   const newParty=proposed.subCustomerId||proposed.customerId;
   const contributions=new Map();
   const apply=(id,delta)=>{
    if(!id||!delta)return;
    contributions.set(id,(contributions.get(id)||0)+delta);
   };
   if(originalType!=='employee')apply(oldParty,-invoiceAmounts(invoice).outstanding);
   if(nextType!=='employee')apply(newParty,invoiceAmounts(proposed).outstanding);
   plan.customerBalanceChanges=[...contributions]
    .filter(([,amountMinor])=>amountMinor!==0)
    .map(([partyId,amountMinor])=>({partyId,amountMinor}));
  }
  // Never attach a receivable to a sub-customer from another parent account.
  if(proposed.subCustomerId){
   if(nextType!=='customer')
    throw new InputError('INVOICE_REVISION_SUBCUSTOMER_WRONG_TARGET',422);
   const sub=(await client.query(
    "SELECT value FROM sync_records WHERE workspace=$1 AND entity='parties' AND record_id=$2",
    [workspace,proposed.subCustomerId])).rows[0]?.value;
   if(!sub||!sub.isSubCustomer||
      (sub.parentPartyId&&sub.parentPartyId!==proposed.customerId))
    throw new InputError('INVOICE_REVISION_SUBCUSTOMER_PARENT_MISMATCH',409);
  }
  const partyIds=[...new Set(plan.customerBalanceChanges.map(x=>x.partyId))];
  const itemIds=[...new Set([
   ...plan.stockDeltas.map(x=>x.itemId),
   ...[...(proposed.items||[]),...(invoice.items||[])].filter(x=>!isDelivery(x))
    .map(x=>x.itemId).filter(Boolean)
  ])];
  const partyRecords=partyIds.length?(await client.query(
   "SELECT record_id AS id,version,value FROM sync_records WHERE workspace=$1 AND entity='parties' AND record_id=ANY($2::text[])",
   [workspace,partyIds])).rows:[];
  const inventoryRecords=itemIds.length?(await client.query(
   "SELECT record_id AS id,version,value FROM sync_records WHERE workspace=$1 AND entity='inventory' AND record_id=ANY($2::text[])",
   [workspace,itemIds])).rows:[];
  // Many imported parties had a zero cached balance while their verified
  // unpaid invoices already represented the real receivable in the statement.
  // Normalize only when there are NO other document types and every source
  // invoice matches a posted account-1201 journal, avoiding double posting.
  if(originalType==='customer'&&nextType==='customer'&&
     !invoice.subCustomerId&&!proposed.subCustomerId&&
     invoice.customerId===proposed.customerId&&
     plan.customerBalanceChanges.length===1&&partyRecords.length===1){
   const partyId=invoice.customerId;
   const party=partyRecords[0]?.value;
   if(partyRecords[0]?.id===partyId&&party?.type==='customer'){
    const invoicesForParty=(await client.query(
     "SELECT value FROM sync_records WHERE workspace=$1 AND entity='invoices' AND value->>'customerId'=$2",
     [workspace,partyId])).rows.map(row=>row.value);
    const sourceIds=invoicesForParty.map(v=>v.id).filter(Boolean);
    const journalsForParty=sourceIds.length?(await client.query(
     "SELECT value FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND value->>'referenceId'=ANY($2::text[])",
     [workspace,sourceIds])).rows.map(row=>row.value):[];
    const others=(await client.query(
     `SELECT count(*)::integer AS count FROM sync_records
      WHERE workspace=$1 AND entity=ANY($3::text[]) AND (
       value->>'partyId'=$2 OR value->>'customerId'=$2 OR
       value->>'supplierId'=$2 OR value->>'counterpartyId'=$2)`,
     [workspace,partyId,[
      'vouchers','purchases','purchaseReturns','salesReturns','printOrders',
      'debtClearings','treasuryTransactions'
     ]])).rows[0]?.count||0;
    const proven=proveInvoiceOnlyPartyBalance({
     partyId,party,invoices:invoicesForParty,journals:journalsForParty,
     hasOtherPartyDocuments:Number(others)>0
    });
    if(proven)plan.verifiedPartyBalances={[partyId]:proven};
   }
  }
  const registeredWarehouses=(await client.query(
   "SELECT record_id AS id,value FROM sync_records WHERE workspace=$1 AND entity='warehouses' FOR SHARE",
   [workspace])).rows;
  const registeredWarehouseCount=registeredWarehouses.length;
  const singleWarehouseId=registeredWarehouseCount===1?registeredWarehouses[0].id:null;
  const inventoryById=new Map(inventoryRecords.map(row=>[row.id,row]));
  for(const item of proposed.items){
   if(isDelivery(item))continue;
   const inventory=inventoryById.get(item.itemId);
   if(!inventory&&isPhysical(item))
    throw new InputError('INVOICE_REVISION_INVENTORY_ITEM_NOT_FOUND',409,{itemId:item.itemId});
   if(inventory&&isPhysical(item)!==isPhysical(inventory.value))
    throw new InputError('INVOICE_REVISION_ITEM_STOCK_CLASSIFICATION_MISMATCH',422,
     {itemId:item.itemId});
  }
  if(!legacyRecovery){
   for(const id of plan.unpricedPhysicalIds||[]){
    const stock=inventoryById.get(id)?.value;
    const price=Number(stock?.purchasePrice);
    if(!stock||!Number.isFinite(price)||price<0)
     throw new InputError('INVOICE_REVISION_NEW_ITEM_COST_NOT_VERIFIED',409,{itemId:id});
    plan.costByItem[id]=price;
   }
   plan.expectedNextCOGSMinor=proposed.items.filter(isPhysical).reduce(
    (sum,item)=>sum+minor(Number(item.quantity)*plan.costByItem[item.itemId]),0);
  }
  const treasuryCodes=Object.keys(plan.paymentDeltas||{}).filter(
   code=>plan.paymentDeltas[code]!==0);
  const treasuryRecords=treasuryCodes.length?(await client.query(
   "SELECT record_id AS id,version,value FROM sync_records WHERE workspace=$1 AND entity='treasuries' AND value->>'accountCode'=ANY($2::text[])",
   [workspace,treasuryCodes])).rows:[];
  let command;
  try{
   command=buildVerifiedInvoiceRevisionBundle({
    invoice,proposed,invoiceVersion:actual,plan,
    partyRecords:partyRecords.map(r=>({...r,version:Number(r.version)})),
    inventoryRecords:inventoryRecords.map(r=>({...r,version:Number(r.version)})),
    treasuryRecords:treasuryRecords.map(r=>({...r,version:Number(r.version)})),
    registeredWarehouseCount,singleWarehouseId,
    commandId:request.commandId,now:new Date().toISOString()
   });
  }catch(error){throw new InputError('INVOICE_REVISION_UNVERIFIED_ACCOUNTING_STATE',409,{reason:String(error.message)})}
  if(legacyRecovery){
   command.changes[0].value.legacyRepair={
    ...legacyRecovery.repairAudit,approvedAt:new Date().toISOString()
   };
  }
  command.workspaceId=workspace;
  // The server is the only caller allowed to approve this revision bypass.
  const receipt=await service.pushInTx(workspace,command,actorId,client,invoice.id);
  await client.query(
   'INSERT INTO sync_invoice_revision_requests(workspace,request_id,invoice_id,request_fingerprint,actor_id,receipt) VALUES($1,$2,$3,$4,$5,$6)',
   [workspace,request.commandId,invoice.id,hash,actorId,JSON.stringify(receipt)]);
  return receipt;
 });
}
