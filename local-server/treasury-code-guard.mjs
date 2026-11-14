import {InputError} from './sync-domain.mjs';
export const MAIN_CASH='CASH-1101';
export const CASH_CODE=/^CASH-\d{4,}$/;
export function assertTreasuryCodeIdentity(recordId,next,previous){
 if(!next||typeof next!=='object')throw new InputError('TREASURY_INVALID_RECORD',422);
 const code=String(next.accountCode||'');
 const isMain=code===MAIN_CASH;
 const isCash=next.type==='cash_box';
 if(!CASH_CODE.test(code))throw new InputError('TREASURY_CODE_MUST_BE_CASH_FOUR_DIGITS',422);
 if(isCash!==isMain||Boolean(next.isDefault)!==isMain)
  throw new InputError('ONLY_CASH_1101_MAY_BE_CASH_OR_DEFAULT',422);
 if(isMain&&recordId!=='treasury-cash-main')
  throw new InputError('MAIN_CASH_TREASURY_ID_RESERVED',422);
 if(recordId==='treasury-cash-main'&&!isMain)
  throw new InputError('MAIN_CASH_TREASURY_CANNOT_CHANGE_CODE',422);
 if(previous&&(
  previous.accountCode!==next.accountCode||
  previous.type!==next.type||
  Boolean(previous.isDefault)!==Boolean(next.isDefault)))
  throw new InputError('POSTED_TREASURY_IDENTITY_IMMUTABLE',409);
 return code;
}
export async function assertUniqueTreasuryCode(client,workspace,recordId,code){
 const found=await client.query(
  "SELECT record_id FROM sync_records WHERE workspace=$1 AND entity='treasuries' AND value->>'accountCode'=$2 AND record_id<>$3 LIMIT 1",
  [workspace,code,recordId]);
 if(found.rows.length)throw new InputError('DUPLICATE_TREASURY_CODE',409);
}
export function miniResolveCashBox(body,rows,canRead){
 if(!(Number(body.cashPaidAmount)>0))return body;
 const all=rows.filter(row=>row.value?.status==='active'&&
   row.value?.accountCode===MAIN_CASH&&row.value?.type==='cash_box');
 if(all.length!==1||all[0].record_id!=='treasury-cash-main')
  throw new InputError('MAIN_CASH_TREASURY_MISSING_OR_AMBIGUOUS',409);
 if(canRead&&!canRead(all[0].value,all[0].record_id))
  throw new InputError('MAIN_CASH_TREASURY_NOT_AUTHORIZED',403);
 return {...body,cashTreasuryCode:MAIN_CASH,
  treasuryCode:body.bankPaidAmount>0?body.bankTreasuryCode:MAIN_CASH};
}
