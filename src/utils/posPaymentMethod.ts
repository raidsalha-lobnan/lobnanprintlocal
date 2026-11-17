import type {PaymentMethod} from '../types';

/**
 * A cashier edit must not convert a settled bank transfer into a card sale.
 * Respect the selected method on an existing bank-only invoice; amounts still
 * determine whether the operation is cash, bank or unpaid.
 */
export function resolvePosPaymentMethod(
  cashBase:number,bankBase:number,selected:PaymentMethod
):PaymentMethod{
  if(!Number.isFinite(cashBase)||!Number.isFinite(bankBase)||
     cashBase<0||bankBase<0)throw new Error('INVALID_POS_PAYMENT_AMOUNTS');
  if(cashBase>0&&bankBase===0)return 'cash';
  if(bankBase>0&&cashBase===0)
    return selected==='bank_transfer'||selected==='card'?selected:'card';
  if(cashBase>0&&bankBase>0)return 'cash';
  return 'credit';
}
