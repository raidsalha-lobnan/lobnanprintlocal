import {createHash} from 'node:crypto';
import {InputError,validId} from './sync-domain.mjs';
import {buildAccountTransferPlan,TRANSFER_ACCOUNTS} from './account-transfer-plan.mjs';

const fail=(code,status=422)=>{throw new InputError(code,status);};
const money=n=>{
 if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>=1e12||
  Math.abs(n*100-Math.round(n*100))>0.00001)fail('ACCOUNT_TRANSFER_INVALID_BALANCE',409);
 return Math.round(n*100)/100;
};
const clean=(v,max)=>{if(typeof v!=='string'||v.length>max)fail('ACCOUNT_TRANSFER_INVALID_TEXT');return v.trim();};
const partyInput=p=>{
 if(!p||!Object.hasOwn(TRANSFER_ACCOUNTS,p.type)||!validId(p.id))
  fail('ACCOUNT_TRANSFER_PARTY_INVALID');
 return {type:p.type,id:p.id};
};
export function normalizeAccountTransferRequest(input){
 if(!input||!/^[-a-zA-Z0-9_]{12,100}$/.test(String(input.requestId||'')))
  fail('ACCOUNT_TRANSFER_REQUEST_ID_REQUIRED');
 const date=clean(input.date,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
  Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)
  fail('ACCOUNT_TRANSFER_INVALID_DATE');
 const requestId=String(input.requestId);
 if(input.reversesId!==undefined){
  if(!validId(input.reversesId))fail('ACCOUNT_TRANSFER_INVALID_REVERSAL');
  return {requestId,date,reversesId:input.reversesId,reason:clean(input.reason||'عكس سند مقاصة',500),notes:clean(input.notes||'',2000)};
 }
 const source=partyInput(input.source),target=partyInput(input.target);
 const amount=money(input.amount),balanceSide=input.balanceSide;
 if(amount<=0||!['debit','credit'].includes(balanceSide))fail('ACCOUNT_TRANSFER_INVALID_DIRECTION_OR_AMOUNT');
 return {requestId,date,source,target,amount,balanceSide,reason:clean(input.reason,500),notes:clean(input.notes||'',2000)};
}
const hash=r=>createHash('sha256').update(JSON.stringify(r)).digest('hex');
const rowChange=(entity,row,value)=>({entity,id:row.record_id,expectedVersion:Number(row.version),value});
const create=(entity,id,value)=>({entity,id,expectedVersion:0,value});

/** The endpoint never trusts balances, names, accounts or journal lines sent by the browser.
 * A single workspace-locked SQL transaction commits the clearing, journal, party
 * cards and general ledger. Same command ID can be retried after a lost response.
 */
export async function postAccountTransfer(service,workspace,input,actorId,access){
 if(!actorId||!access?.can('view_accounting')||!access.can('add'))fail('ACCOUNT_TRANSFER_PERMISSION_DENIED',403);
 const r=normalizeAccountTransferRequest(input),fingerprint=hash(r);
 const commandId='account-transfer-'+r.requestId,id='clr-transfer-'+r.requestId;
 return service.withTx(async client=>{
  await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[workspace]);
  await client.query('SELECT id FROM sync_workspaces WHERE id=$1 FOR UPDATE',[workspace]);
  const previous=(await client.query(
   'SELECT actor_id,receipt FROM sync_commands WHERE workspace=$1 AND command_id=$2',
   [workspace,commandId])).rows[0];
  if(previous){
   const saved=previous.receipt?.changes?.find(c=>c.entity==='debtClearings'&&c.id===id)?.value;
   if(previous.actor_id!==actorId||saved?.requestFingerprint!==fingerprint)
    fail('ACCOUNT_TRANSFER_REQUEST_REUSED',409);
   if(!access.canRead('debtClearings',saved,id))fail('ACCOUNT_TRANSFER_PERMISSION_DENIED',403);
   return {record:saved,commandId};
  }
  let source=r.source,target=r.target,amount=r.amount,balanceSide=r.balanceSide;
  if(r.reversesId){
   if(!access.can('edit'))fail('ACCOUNT_TRANSFER_PERMISSION_DENIED',403);
   const original=(await client.query(
    "SELECT value FROM sync_records WHERE workspace=$1 AND entity='debtClearings' AND record_id=$2",
    [workspace,r.reversesId])).rows[0]?.value;
   if(!original||original.transferVersion!==2||original.reversesId||
     !access.canRead('debtClearings',original,r.reversesId))
    fail('ACCOUNT_TRANSFER_REVERSAL_NOT_ALLOWED',409);
   const prior=(await client.query(
    "SELECT 1 FROM sync_records WHERE workspace=$1 AND entity='debtClearings' AND value->>'reversesId'=$2 LIMIT 1",
    [workspace,r.reversesId])).rows[0];
   if(prior)fail('ACCOUNT_TRANSFER_ALREADY_REVERSED',409);
   source={type:original.sourceType,id:original.sourceId};
   target={type:original.targetType,id:original.targetId};
   amount=money(original.amount);
   balanceSide=original.balanceSide==='debit'?'credit':'debit';
  }
  const resolve=async p=>{
   const entity=p.type==='employee'?'employees':'parties';
   const row=(await client.query(
    'SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3 FOR UPDATE',
    [workspace,entity,p.id])).rows[0];
   const value=row?.value;
   if(!value||value._deleted||!access.canRead(entity,value,p.id)||
      (entity==='parties'&&value.type!==p.type&&value.type!=='both'))
    fail('ACCOUNT_TRANSFER_PARTY_NOT_AVAILABLE',409);
   return {row,party:{...p,name:value.name,code:value.code},entity};
  };
  const a=await resolve(source),b=await resolve(target);
  const plan=buildAccountTransferPlan({source:a.party,target:b.party,amount,balanceSide});
  const now=new Date().toISOString(),year=now.slice(0,4);
  const serials=(await client.query(
   "SELECT value->>'clearingNumber' AS number FROM sync_records WHERE workspace=$1 AND entity='debtClearings' AND value IS NOT NULL",
   [workspace])).rows;
  let sequence=year==='2026'?1:0;
  for(const row of serials){
   const m=/^CLR-(\d{4})-(\d+)$/.exec(row.number||'');
   if(m&&m[1]===year)sequence=Math.max(sequence,Number(m[2]));
  }
  const clearingNumber='CLR-'+year+'-'+String(sequence+1).padStart(3,'0');
  const journalId='entry-'+id,changes=[],balances=new Map();
  for(const effect of plan.effects){
   const resolved=[a,b].find(x=>x.entity===effect.entity&&x.party.id===effect.id);
   if(effect.entity==='employees'){
    // Employee balance is derived from its approved statement, not a mutable card.
    balances.set(effect.entity+':'+effect.id,{before:null,after:null});
    continue;
   }
   const value=resolved.row.value,before=money(value.balance);
   const after=money(Math.round((before+effect.signedLedgerDelta)*100)/100);
   const next={...value,balance:after};
   if(!access.canChange('parties',next,value))fail('ACCOUNT_TRANSFER_PERMISSION_DENIED',403);
   changes.push(rowChange('parties',resolved.row,next));
   balances.set(effect.entity+':'+effect.id,{before,after});
  }
  for(const [code,delta] of Object.entries(plan.accountDeltas)){
   const rows=(await client.query(
    "SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='accounts' AND value->>'code'=$2 FOR UPDATE",
    [workspace,code])).rows;
   if(rows.length!==1)fail('ACCOUNT_TRANSFER_LEDGER_ACCOUNT_NOT_UNIQUE',409);
   const row=rows[0],value=row.value;
   if(value.type!==(code==='2101'?'liability':'asset'))fail('ACCOUNT_TRANSFER_LEDGER_ACCOUNT_TYPE_INVALID',409);
   const before=money(value.balance),after=money(Math.round((before+delta)*100)/100);
   if(delta===0)continue;
   const next={...value,balance:after};
   if(!access.canChange('accounts',next,value))fail('ACCOUNT_TRANSFER_PERMISSION_DENIED',403);
   changes.push(rowChange('accounts',row,next));
  }
  const credit=balanceSide==='debit'?a:b,debit=balanceSide==='debit'?b:a;
  const cb=balances.get(credit.entity+':'+credit.party.id),db=balances.get(debit.entity+':'+debit.party.id);
  // Legacy names represent the credit and debit legs, respectively. Explicit
  // types prevent employee IDs from being interpreted as customer/supplier IDs.
  const record={id,clearingNumber,date:r.date,amount,reason:r.reason,notes:r.notes,
   createdBy:access.profile?.fullName||actorId,createdAt:now,
   transferVersion:2,requestFingerprint:fingerprint,sourceId:a.party.id,sourceType:a.party.type,
   sourceName:a.party.name,targetId:b.party.id,targetType:b.party.type,targetName:b.party.name,
   balanceSide,creditPartyType:credit.party.type,debitPartyType:debit.party.type,
   customerId:credit.party.id,customerName:credit.party.name,
   supplierId:debit.party.id,supplierName:debit.party.name,
   customerOldBalance:cb.before,customerNewBalance:cb.after,
   supplierOldBalance:db.before,supplierNewBalance:db.after,journalEntryId:journalId,
   ...(r.reversesId?{reversesId:r.reversesId}:{})};
  const journal={id:journalId,entryNumber:'JV-'+clearingNumber,date:r.date,
   description:'مقاصة وتحويل حسابات: '+a.party.name+' / '+b.party.name+' - '+r.reason,
   referenceType:'clearance',referenceId:id,accountTransferVersion:2,lines:plan.lines,createdAt:now};
  if(!access.canChange('debtClearings',record,null)||!access.canChange('journalEntries',journal,null))
   fail('ACCOUNT_TRANSFER_PERMISSION_DENIED',403);
  changes.push(create('debtClearings',id,record),create('journalEntries',journalId,journal));
  const receipt=await service.pushInTx(workspace,{id:commandId,workspaceId:workspace,changes},
   actorId,client,null,false,id);
  const saved=receipt.changes.find(c=>c.entity==='debtClearings'&&c.id===id)?.value;
  if(!saved||!receipt.changes.some(c=>c.entity==='journalEntries'&&c.id===journalId))
   fail('ACCOUNT_TRANSFER_RECEIPT_INVALID',409);
  return {record:saved,commandId};
 });
}
