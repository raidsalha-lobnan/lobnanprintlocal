import {InputError} from './sync-domain.mjs';

const money=n=>Number((n/100).toFixed(2));
const minor=n=>{
 const x=Number(n);
 return Number.isFinite(x)&&Math.abs(x)<1e12&&Number.isSafeInteger(Math.round(x*100))&&
 Math.abs(Math.round(x*100)-x*100)<0.00001?Math.round(x*100):null;
};
const fail=code=>{throw new InputError(code,409)};
const bankingMethods=new Set(['bank_transfer','card','e_wallet','electronic','pos','cheque']);

/**
 * Only for ordinary, newly posted POS sales. Telegram mini-sale has its own
 * audited settlement bundle. The revenue journal already debits 1101/1102:
 * this function creates NO extra journal, only the same-transaction treasury
 * transaction(s) that make the cash/bank register match that existing entry.
 */
export async function settleAtomicPosPaymentTreasuries(client,workspace,command,applied){
 if(!command?.atomicInvoiceId||command.miniSaleSettlement===true)return 0;
 const invoice=applied.find(r=>r.entity==='invoices'&&r.id===command.atomicInvoiceId)?.value;
 if(!invoice||invoice.isAccountingPosted!==true)return 0;
 const expected=minor(invoice.basePaidAmount||0);
 if(expected===null||expected<0)fail('POS_TREASURY_PAID_AMOUNT_INVALID');
 if(expected===0)return 0;
 const revenue=applied.filter(r=>r.entity==='journalEntries'&&
  r.value?.referenceType==='pos_invoice'&&r.value?.referenceId===invoice.id);
 if(revenue.length!==1)fail('POS_TREASURY_INVOICE_JOURNAL_NOT_UNIQUE');
 const lines=revenue[0].value.lines||[];
 const legBase=code=>lines.filter(l=>l.accountCode===code).reduce((n,l)=>
  n+(minor(l.debit)||0)-(minor(l.credit)||0),0);
 const cashBase=legBase('1101'),bankBase=legBase('1102');
 if(cashBase<0||bankBase<0||cashBase+bankBase!==expected)
  fail('POS_TREASURY_JOURNAL_PAYMENT_SPLIT_MISMATCH');
 const rawCash=Number(invoice.cashPaidAmount||0),rawBank=Number(invoice.bankPaidAmount||0);
 const anyExplicit=rawCash>0||rawBank>0;
 const amount=Number(invoice.paidAmount||0),currency=String(invoice.currency||'ILS');
 if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(rawCash)||!Number.isFinite(rawBank)||
   rawCash<0||rawBank<0)fail('POS_TREASURY_PAYMENT_AMOUNT_INVALID');
 let cashAmount=rawCash,bankAmount=rawBank;
 if(!anyExplicit){
  if(cashBase>0&&bankBase>0)fail('POS_TREASURY_MISSING_SPLIT');
  if(cashBase>0&&invoice.paymentMethod==='cash')cashAmount=amount;
  else if(bankBase>0&&bankingMethods.has(invoice.paymentMethod))bankAmount=amount;
  else fail('POS_TREASURY_PAYMENT_METHOD_UNVERIFIED');
 }
 if((cashBase>0)!==(cashAmount>0)||(bankBase>0)!==(bankAmount>0))
  fail('POS_TREASURY_AMOUNT_METHOD_MISMATCH');
 const legs=[
  {kind:'cash',ledger:'1101',code:invoice.cashTreasuryCode||'CASH-1101',
   amount:cashAmount,base:cashBase},
  {kind:'bank',ledger:'1102',code:invoice.bankTreasuryCode||
   (bankBase>0?invoice.treasuryAccountCode:undefined),
   amount:bankAmount,base:bankBase}
 ].filter(x=>x.base>0);
 if(legs.some(x=>!x.code||!/^CASH-\d{4,}$/.test(x.code)||
   (x.kind==='cash'&&x.code!=='CASH-1101')||
   (x.kind==='bank'&&x.code==='CASH-1101')))
  fail('POS_TREASURY_SELECT_EXPLICIT_BANK_OR_MAIN_CASH');
 if(legs.some(x=>minor(x.amount)===null||minor(x.amount)<=0||
   !Number.isFinite(x.base/x.amount)||x.base/x.amount<=0))
  fail('POS_TREASURY_EXCHANGE_RATE_INVALID');
 const codes=legs.map(x=>x.code);
 if(new Set(codes).size!==codes.length)fail('POS_TREASURY_DUPLICATE_SELECTION');
 const rows=(await client.query(
  "SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='treasuries' AND value->>'accountCode'=ANY($2::text[]) FOR UPDATE",
  [workspace,codes])).rows;
 if(rows.length!==codes.length||new Set(rows.map(x=>x.value.accountCode)).size!==codes.length)
  fail('POS_TREASURY_ACCOUNT_NOT_UNIQUE');
 const byCode=new Map(rows.map(x=>[x.value.accountCode,x]));
 let count=0;
 for(const leg of legs){
  const row=byCode.get(leg.code),v=row.value;
  if(v.status!=='active'||
    (leg.kind==='cash'&&v.type!=='cash_box')||
    (leg.kind==='bank'&&v.type==='cash_box'))
   fail('POS_TREASURY_TYPE_OR_STATUS_INVALID');
  const previous=minor(v.balance),base=leg.base,received=minor(leg.amount);
  const held=minor(v.currencyBalances?.[currency]??
    (currency==='ILS'?v.balance:0));
  if(previous===null||held===null||received===null)
   fail('POS_TREASURY_BALANCE_INVALID');
  const transactions=Array.isArray(v.transactions)?v.transactions:[];
  const transactionId='tx-pos-'+invoice.id+'-'+leg.kind;
  if(transactions.some(tx=>tx.id===transactionId||
    (tx.referenceId===invoice.id&&tx.referenceType==='pos_sale')))
   fail('POS_TREASURY_PAYMENT_ALREADY_POSTED');
  const now=new Date().toISOString(),date=String(invoice.date||now.slice(0,10));
  const nextBase=money(previous+base),nextCurrency=money(held+received);
  const transaction={
   id:transactionId,treasuryId:row.record_id,treasuryName:v.name,
   date,type:'deposit',amount:leg.amount,actualAmount:leg.amount,
   currency,currencySymbol:invoice.currencySymbol||'₪',
   exchangeRate:money(base)/leg.amount,
   baseCurrency:'ILS',baseAmount:money(base),
   balanceAfter:nextBase,balanceAfterCurrency:nextCurrency,
   referenceType:'pos_sale',referenceId:invoice.id,
   voucherNumber:invoice.invoiceNumber,partyName:invoice.customerName,
   description:'سداد مباشر مع فاتورة المبيعات '+invoice.invoiceNumber,
   paymentMethod:invoice.paymentMethod
  };
  const value={...v,balance:nextBase,
   currencyBalances:{...(v.currencyBalances||{}),[currency]:nextCurrency},
   transactions:[transaction,...transactions]};
  const version=Number(row.version)+1;
  await client.query(
   'UPDATE sync_records SET version=$4,value=$5,updated_at=now() WHERE workspace=$1 AND entity=$2 AND record_id=$3',
   [workspace,'treasuries',row.record_id,version,value]);
  applied.push({entity:'treasuries',id:row.record_id,version,value});
  count++;
 }
 return count;
}
