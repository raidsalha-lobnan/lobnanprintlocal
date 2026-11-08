import crypto from 'node:crypto';
import {InputError,validId} from './sync-domain.mjs';
import {verifyInvoiceRevisionBaseline} from './invoice-revision-baseline.mjs';
import {buildVerifiedInvoiceRevisionBundle} from './invoice-revision-bundle.mjs';
import {planFailedInvoiceEditRecovery} from './invoice-legacy-recovery.mjs';
import {isUnchangedPosInvoice} from './invoice-revision-noop.mjs';

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
  // These cases need a distinct posting algorithm. Do not silently alter
  // treasury, customer, tax or warehouse with only sales/COGS adjustments.
  const immutableForRevision=['customerId','employeeId','subCustomerId','warehouse','branchId',
    'currency','exchangeRate','paymentMethod','paidAmount','basePaidAmount',
    'cashPaidAmount','bankPaidAmount','cashTreasuryCode','bankTreasuryCode',
    'discountTotal','taxRate','taxAmount','additionalCharges','date'];
  for(const field of immutableForRevision){
   if(JSON.stringify(invoice[field]??null)!==JSON.stringify(proposed[field]??null))
    throw new InputError('INVOICE_REVISION_COMPLEX_FIELD_REQUIRES_APPROVED_WORKFLOW',422,{field});
  }
  // Validate arithmetic for the supported zero-discount credit-only sale.
  if(Number(invoice.paidAmount||0)!==0||
     Number(proposed.paidAmount||0)!==0||
     invoice.paymentMethod!=='credit'||
     Number(invoice.discountTotal||0)!==0||
     Number(proposed.discountTotal||0)!==0||
     Number(invoice.taxAmount||0)!==0||
     Number(proposed.taxAmount||0)!==0||
     Number(invoice.additionalCharges||0)!==0||
     Number(proposed.additionalCharges||0)!==0)
   throw new InputError('INVOICE_REVISION_COMPLEX_PAYMENT_OR_TAX',422);
  const minor=value=>{
   const num=Number(value);
   if(!Number.isFinite(num)||Math.abs(num*100-Math.round(num*100))>0.00001)
    throw new InputError('INVOICE_REVISION_INVALID_AMOUNT',422);
   return Math.round(num*100);
  };
  let itemSum=0;
  for(const it of proposed.items||[]){
   const qty=Number(it.quantity),price=Number(it.unitPrice);
   if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0||
      minor(it.total)!==minor(qty*price)||
      Number(it.tax||0)!==0||Number(it.discount||0)!==0)
    throw new InputError('INVOICE_REVISION_INVALID_LINE_TOTAL',422);
   itemSum+=minor(it.total);
  }
  if(!Array.isArray(proposed.items)||!proposed.items.length||
     itemSum!==minor(proposed.subtotal)||itemSum!==minor(proposed.totalAmount))
   throw new InputError('INVOICE_REVISION_TOTAL_INCONSISTENT',422);
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
   }catch(recoveryError){
    throw new InputError('INVOICE_REVISION_BASELINE_NEEDS_RECONCILIATION',409,
     {reason:String(error.message),legacyReason:String(recoveryError.message)});
   }
  }
  // Employee receivables are projected by the employee statement from invoice
  // IDs, not stored in the customer/supplier 'parties' balance table.
  // A posted invoice to an employee must never create a fictitious party row.
  const employeeSale=invoice.counterpartyType==='employee' ||
    (invoice.employeeId && invoice.employeeId===invoice.customerId) ||
    (!invoice.counterpartyType && /^emp-/.test(invoice.customerId||''));
  if(employeeSale){
   const target=(await client.query(
    "SELECT record_id FROM sync_records WHERE workspace=$1 AND entity='employees' AND record_id=$2",
    [workspace,invoice.customerId])).rows[0];
   if(!target)throw new InputError('INVOICE_REVISION_EMPLOYEE_NOT_FOUND',409);
   if(proposed.counterpartyType && proposed.counterpartyType!=='employee')
    throw new InputError('INVOICE_REVISION_TARGET_TYPE_IMMUTABLE',422);
   // Both sales and revisions continue to post to the main A/R control
   // account; the employee subledger is derived from the invoice itself.
   plan.customerBalanceChanges=[];
  } else if(invoice.counterpartyType && proposed.counterpartyType!==invoice.counterpartyType){
   throw new InputError('INVOICE_REVISION_TARGET_TYPE_IMMUTABLE',422);
  }
  const partyIds=[...new Set(plan.customerBalanceChanges.map(x=>x.partyId))];
  const itemIds=[...new Set(plan.stockDeltas.map(x=>x.itemId))];
  const partyRecords=partyIds.length?(await client.query(
   "SELECT record_id AS id,version,value FROM sync_records WHERE workspace=$1 AND entity='parties' AND record_id=ANY($2::text[])",
   [workspace,partyIds])).rows:[];
  const inventoryRecords=itemIds.length?(await client.query(
   "SELECT record_id AS id,version,value FROM sync_records WHERE workspace=$1 AND entity='inventory' AND record_id=ANY($2::text[])",
   [workspace,itemIds])).rows:[];
  let command;
  try{
   command=buildVerifiedInvoiceRevisionBundle({
    invoice,proposed,invoiceVersion:actual,plan,
    partyRecords:partyRecords.map(r=>({...r,version:Number(r.version)})),
    inventoryRecords:inventoryRecords.map(r=>({...r,version:Number(r.version)})),
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
