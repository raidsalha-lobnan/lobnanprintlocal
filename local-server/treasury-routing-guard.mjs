import {InputError} from './sync-domain.mjs';
import {MAIN_CASH,CASH_CODE} from './treasury-code-guard.mjs';
const amount=v=>Number.isFinite(Number(v))?Number(v):0;
const bankMethods=new Set(['card','bank_transfer','bank','transfer','cheque','electronic','e_wallet','pos']);
const types=new Set(['invoices','purchases','expenses','vouchers','employeeAdvances']);

/** Server-bound receipt routing. Applies only to newly committed financial records.
 * Historical posted vouchers and corrections are preserved verbatim. */
export function financialTreasuryLegs(entity,value){
 if(!types.has(entity)||!value||value._deleted===true)return [];
 if(entity==='employeeAdvances'){
  if(value.disbursedImmediately!==true||amount(value.amount)<=0)return [];
  const code=value.treasuryAccountCode||'';
  return [{kind:code===MAIN_CASH||code==='1101'?'cash':'noncash',code,field:'treasuryAccountCode'}];
 }
 const paid=amount(value.paidAmount);
 const cash=amount(value.cashPaidAmount);
 const bank=amount(value.bankPaidAmount);
 if(cash<0||bank<0)throw new InputError('NEGATIVE_FINANCIAL_SETTLEMENT',422);
 const legs=[];
 if(cash>0)legs.push({kind:'cash',code:value.cashTreasuryCode||value.cashTreasuryAccountCode||'',field:value.cashTreasuryCode!==undefined||entity==='invoices'?'cashTreasuryCode':'cashTreasuryAccountCode'});
 if(bank>0)legs.push({kind:'noncash',code:value.bankTreasuryCode||value.bankTreasuryAccountCode||'',field:value.bankTreasuryCode!==undefined||entity==='invoices'?'bankTreasuryCode':'bankTreasuryAccountCode'});
 if(cash===0&&bank===0&&paid>0){
  const bankPayment=bankMethods.has(value.paymentMethod);
  const code=value.treasuryAccountCode||'';
  legs.push({kind:bankPayment?'noncash':'cash',code,field:'treasuryAccountCode'});
 }
 if(entity==='vouchers'&&legs.length===0&&amount(value.amount)>0){
  const bankPayment=bankMethods.has(value.paymentMethod);
  legs.push({kind:bankPayment?'noncash':'cash',code:value.treasuryAccountCode||'',field:'treasuryAccountCode'});
 }
 return legs;
}
export async function validateNewFinancialTreasuries(client,workspace,entity,value){
 const legs=financialTreasuryLegs(entity,value);
 if(!legs.length)return value;
 let adjusted=value;
 for(const leg of legs){
  const code=leg.kind==='cash'?MAIN_CASH:String(leg.code||'');
  if(leg.kind==='noncash'&&(!CASH_CODE.test(code)||code===MAIN_CASH))
   throw new InputError('NONCASH_PAYMENT_REQUIRES_SELECTED_CASH_CODE',422);
  if(leg.kind==='cash'&&leg.code&&
    ![MAIN_CASH,'1101'].includes(String(leg.code)))
   throw new InputError('CASH_PAYMENT_ONLY_CASH_1101',422);
  const r=await client.query(
   "SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='treasuries' AND value->>'accountCode'=$2",
   [workspace,code]);
  if(r.rows.length!==1||r.rows[0].value?.status!=='active')
   throw new InputError('PAYMENT_TREASURY_MISSING_OR_INACTIVE',409);
  const t=r.rows[0];
  if(leg.kind==='cash'){
   if(t.record_id!=='treasury-cash-main'||t.value.type!=='cash_box')
    throw new InputError('CASH_TREASURY_IDENTITY_MISMATCH',409);
  }else if(t.value.type==='cash_box')throw new InputError('NONCASH_TREASURY_MUST_NOT_BE_CASH_BOX',422);
  if(leg.kind==='cash'&&value[leg.field]!==code)
   adjusted={...adjusted,[leg.field]:code};
 }
 return adjusted;
}
