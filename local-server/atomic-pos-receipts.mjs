import {InputError} from './sync-domain.mjs';

/**
 * Read-only receipt proof for an already COMMITTED atomic POS transaction.
 * Owner and exact canonical command SHA-256 must both match PostgreSQL.
 * Never create or replay accounting effects from this endpoint.
 */
export async function findVerifiedAtomicPosReceipts(pool,workspace,actorId,proofs){
  if(!Array.isArray(proofs)||proofs.length<1||proofs.length>16||
     proofs.some(p=>!p||typeof p.id!=='string'||! /^[a-f0-9-]{10,180}$/i.test(p.id)||
       typeof p.fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(p.fingerprint)))
    throw new InputError('INVALID_ATOMIC_RECEIPT_CHECK',422);
  const wanted=new Map(proofs.map(p=>[p.id,p.fingerprint]));
  if(wanted.size!==proofs.length)throw new InputError('DUPLICATE_ATOMIC_RECEIPT_CHECK',422);
  const rows=await pool.query(
    'SELECT command_id,fingerprint,receipt FROM sync_commands WHERE workspace=$1 AND actor_id=$2 AND command_id=ANY($3::text[])',
    [workspace,actorId,[...wanted.keys()]]
  );
  const result=[];
  for(const row of rows.rows){
    if(row.fingerprint!==wanted.get(row.command_id))continue;
    const receipt=row.receipt;
    const changes=receipt?.changes;
    if(!Array.isArray(changes)||changes.length<3||changes.length>80)continue;
    const invoices=changes.filter(c=>c.entity==='invoices');
    const journals=changes.filter(c=>c.entity==='journalEntries');
    if(invoices.length!==1||journals.length<2)continue;
    const invoice=invoices[0];
    if(!invoice?.id||!invoice.value?.isAccountingPosted||
       !/^INV-\d+$/.test(invoice.value.invoiceNumber||'')||
       !Number.isSafeInteger(invoice.version)||invoice.version<1)continue;
    if(changes.some(c=>!c||!c.entity||!c.id||
       !Number.isSafeInteger(c.version)||c.version<1))continue;
    result.push({commandId:row.command_id,changes});
  }
  return result;
}
