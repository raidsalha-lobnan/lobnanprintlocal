import type {PaymentVoucher,Treasury} from '../types';
import {canonicalTreasuryCode,MAIN_CASH_TREASURY_CODE} from './treasuryCodes';

export type ReceiptRoute='cash'|'bank_transfer'|'wallet'|'cheque'|'unknown';

/** The actual destination treasury, not the stale voucher paymentMethod,
 * establishes whether a posted collection is cash or noncash. */
export function resolveReceiptRoute(v:Pick<PaymentVoucher,'accountCode'|'treasuryAccountCode'|'paymentMethod'>,
 treasuries:readonly Pick<Treasury,'accountCode'|'type'|'status'>[]):ReceiptRoute {
 const code=canonicalTreasuryCode(v.treasuryAccountCode||v.accountCode);
 const treasury=treasuries.find(t=>t.accountCode===code);
 if(treasury){
  if(code===MAIN_CASH_TREASURY_CODE && treasury.type==='cash_box')return 'cash';
  if(treasury.type==='cash_box')return 'unknown';
  if(v.paymentMethod==='cheque')return 'cheque';
  if(treasury.type==='digital_wallet')return 'wallet';
  return 'bank_transfer';
 }
 // Unknown destinations must NOT be reported as cash because of an obsolete flag.
 if(code && code!==MAIN_CASH_TREASURY_CODE)return 'unknown';
 if(v.paymentMethod==='bank_transfer')return 'bank_transfer';
 if(v.paymentMethod==='cheque')return 'cheque';
 if(v.paymentMethod==='e_wallet'||v.paymentMethod==='electronic')return 'wallet';
 return code===MAIN_CASH_TREASURY_CODE?'cash':'unknown';
}
export function sumReceiptRoutes(
 vouchers:readonly PaymentVoucher[],
 treasuries:readonly Pick<Treasury,'accountCode'|'type'|'status'>[]
){
 return vouchers.reduce((sum,v)=>{
  const category=resolveReceiptRoute(v,treasuries);
  const value=Number(v.baseAmount??v.amount)||0;
  sum.total+=value;
  if(category==='cash')sum.cash+=value;
  else if(category==='unknown')sum.unknown+=value;
  else sum.noncash+=value;
  return sum;
 },{total:0,cash:0,noncash:0,unknown:0});
}
