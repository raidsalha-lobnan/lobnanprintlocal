import {InputError} from './sync-domain.mjs';

const validMoney=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e12&&
 Math.abs(n*100-Math.round(n*100))<0.00001;
const cents=n=>Math.round(n*100);
const money=n=>Number((n/100).toFixed(2));
const signFor=type=>type==='asset'||type==='expense'?1:
 ['revenue','liability','equity'].includes(type)?-1:null;

/**
 * PostgreSQL is the source of truth for posted journals. Ordinary atomic POS
 * bundles intentionally carry no "accounts" changes from a client. Reproject
 * the GL cards affected by the just-inserted journals in the SAME serialised
 * sync transaction as invoice, stock, debtor and journal writes.
 *
 * Querying ALL committed journals (including the new ones inside the current
 * transaction) corrects any historical cached-card drift without producing
 * any extra sale, correction, journal or inventory movement. The operation is
 * idempotent at the journal level because SyncService enforces command IDs.
 * Telegram mini receipts manage their account cards separately.
 */
export async function synchronizeAtomicSaleAccountCards(client,workspace,command,applied){
 if(!command?.atomicInvoiceId||command.miniSaleSettlement===true)return 0;
 const sale=applied.find(x=>x.entity==='invoices'&&x.id===command.atomicInvoiceId);
 if(!sale?.value?.isAccountingPosted)return 0;
 const entries=applied.filter(x=>x.entity==='journalEntries'&&
  x.value?.referenceId===command.atomicInvoiceId&&
  ['pos_invoice','cogs'].includes(x.value?.referenceType));
 if(entries.length<1)throw new InputError('ATOMIC_POS_JOURNAL_EVIDENCE_MISSING',409);
 const codes=new Set(),newDeltas=new Map();
 for(const entry of entries){
  for(const line of entry.value.lines||[]){
   const code=String(line.accountCode||'');
   const dr=Number(line.debit||0),cr=Number(line.credit||0);
   if(!code||!validMoney(dr)||!validMoney(cr)||dr<0||cr<0)
    throw new InputError('ATOMIC_POS_UNTRUSTED_JOURNAL_LINE',409);
   codes.add(code);
   newDeltas.set(code,(newDeltas.get(code)||0)+cents(dr)-cents(cr));
  }
 }
 if(!codes.size)throw new InputError('ATOMIC_POS_LEDGER_LINES_MISSING',409);
 const affected=[...codes].sort();
 const accounts=(await client.query(
  "SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='accounts' AND value->>'code'=ANY($2::text[]) FOR UPDATE",
  [workspace,affected])).rows;
 if(accounts.length!==affected.length||
    new Set(accounts.map(a=>a.value?.code)).size!==affected.length)
  throw new InputError('ATOMIC_POS_GENERAL_LEDGER_ACCOUNT_MISSING_OR_DUPLICATED',409);
 const result=(await client.query(
  "SELECT l->>'accountCode' code, SUM(COALESCE((l->>'debit')::numeric,0)-COALESCE((l->>'credit')::numeric,0)) signed FROM sync_records j CROSS JOIN LATERAL jsonb_array_elements(COALESCE(j.value->'lines','[]'::jsonb)) l WHERE j.workspace=$1 AND j.entity='journalEntries' AND l->>'accountCode'=ANY($2::text[]) GROUP BY l->>'accountCode'",
  [workspace,affected])).rows;
 const totals=new Map(result.map(r=>[r.code,Number(r.signed)]));
 let updated=0;
 for(const row of accounts){
  const code=row.value.code,sign=signFor(row.value.type);
  const signed=totals.get(code),cached=Number(row.value.balance);
  if(sign===null||!validMoney(signed)||!validMoney(cached))
   throw new InputError('ATOMIC_POS_LEDGER_BASELINE_INVALID',409);
  const expected=money(sign*cents(signed)),difference=cents(expected)-cents(cached);
  if(difference===0)continue;
  const priorExpected=money(cents(expected)-sign*(newDeltas.get(code)||0));
  const previousDrift=money(cents(priorExpected)-cents(cached));
  const now=new Date().toISOString();
  const value={...row.value,balance:expected};
  if(Math.abs(previousDrift)>=0.01){
   value.ledgerBalanceReconciliations=[
    ...(Array.isArray(row.value.ledgerBalanceReconciliations)?
      row.value.ledgerBalanceReconciliations:[]),
    {id:'gl-reprojection-'+command.atomicInvoiceId+'-'+code,
     at:now,previousBalance:cached,provenBalanceBeforeSale:priorExpected,
     provenBalanceAfterSale:expected,historicalCacheDifference:previousDrift,
     sourceInvoiceId:command.atomicInvoiceId,
     source:'POSTED_JOURNAL_LINES_ONLY',createdExtraJournal:false}
   ];
  }
  const version=Number(row.version)+1;
  await client.query(
   'UPDATE sync_records SET version=$4,value=$5,updated_at=now() WHERE workspace=$1 AND entity=$2 AND record_id=$3',
   [workspace,'accounts',row.record_id,version,value]);
  applied.push({entity:'accounts',id:row.record_id,version,value});
  updated++;
 }
 return updated;
}
