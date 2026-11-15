import {InputError} from './sync-domain.mjs';

const round=(n)=>Math.round(n*100)/100;
function cents(value,field){
 const n=Number(value);
 if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n*100))||
    Math.abs(n*100-Math.round(n*100))>0.00001)
  throw new InputError('INVALID_RECEIPT_'+field,422);
 return Math.round(n*100);
}
const bankMethods=new Set(['bank_transfer','e_wallet','cheque','card','pos','electronic']);
const safeArray=value=>Array.isArray(value)?value:[];
const plus=(a,b)=>round(Number(a||0)+b);

/**
 * A receipt is an indivisible PostgreSQL transaction: voucher, balanced
 * journal, party receivable, targeted treasury movement and both GL cards.
 * This function runs after the new voucher INSERT, inside SyncService's
 * workspace-locked transaction and before its sync event is committed.
 * Old clients must not post the journal or treasury delta a second time.
 */
export async function postNewCustomerReceipt(client,workspace,voucher,applied){
 if(!voucher||voucher.type!=='receipt')return;
 const amountMinor=cents(voucher.amount,'AMOUNT');
 const baseMinor=cents(voucher.baseAmount,'BASE_AMOUNT');
 const rate=Number(voucher.exchangeRate??1);
 if(!Number.isFinite(rate)||rate<=0||Math.round(amountMinor*rate)!==baseMinor)
   throw new InputError('RECEIPT_CURRENCY_CONVERSION_MISMATCH',422);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(voucher.date||''))||
  !/^RCT-\d{4}-\d{4,}$/.test(String(voucher.voucherNumber||'')))
   throw new InputError('RECEIPT_DATE_OR_SERIAL_INVALID',422);
 if(!voucher.id||!voucher.partyId||!voucher.partyName||voucher.partyType==='supplier'||
    voucher.partyType==='employee'||voucher.accountCode!=='1201'||
    voucher.relatedDocId||voucher.relatedDocType)
   throw new InputError('RECEIPT_ONLY_CUSTOMER_ON_ACCOUNT_USE_SETTLEMENT_FOR_INVOICE',422);
 const code=String(voucher.treasuryAccountCode||'');
 const cash=code==='CASH-1101';
 if(!/^CASH-\d{4,}$/.test(code)||
   (cash&&voucher.paymentMethod!=='cash')||
   (!cash&&!bankMethods.has(voucher.paymentMethod)))
   throw new InputError('RECEIPT_TREASURY_METHOD_MISMATCH',422);
 const duplicate=await client.query(
  "SELECT record_id FROM sync_records WHERE workspace=$1 AND entity='vouchers' AND record_id<>$2 AND value->>'voucherNumber'=$3 LIMIT 1",
  [workspace,voucher.id,voucher.voucherNumber]);
 if(duplicate.rows.length)throw new InputError('DUPLICATE_RECEIPT_NUMBER',409);
 const existed=await client.query(
  "SELECT record_id FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND (value->>'referenceId'=$2 OR value->>'entryNumber'=$3) LIMIT 1",
  [workspace,voucher.id,'JE-'+voucher.voucherNumber]);
 if(existed.rows.length)throw new InputError('DUPLICATE_RECEIPT_LEDGER',409);
 const rows=await Promise.all([
  client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='parties' AND record_id=$2 FOR UPDATE",[workspace,voucher.partyId]),
  client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='treasuries' AND value->>'accountCode'=$2 FOR UPDATE",[workspace,code]),
  client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='accounts' AND value->>'code'=$2 FOR UPDATE",[workspace,cash?'1101':'1102']),
  client.query("SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='accounts' AND value->>'code'='1201' FOR UPDATE",[workspace])
 ]);
 if(rows.some(x=>x.rows.length!==1))throw new InputError('RECEIPT_LINKED_RECORD_NOT_UNIQUE',409);
 const [party,treasury,liquid,receivable]=rows.map(x=>x.rows[0]);
 let linkedInvoice=null;
 if(voucher.referenceInvoiceId){
  const linked=await client.query(
   "SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity='invoices' AND record_id=$2 FOR UPDATE",
   [workspace,voucher.referenceInvoiceId]);
  if(linked.rows.length!==1)throw new InputError('RECEIPT_LINKED_INVOICE_NOT_FOUND',409);
  linkedInvoice=linked.rows[0];
  const inv=linkedInvoice.value;
  const total=Number(inv.totalAmount),paid=Number(inv.paidAmount||0);
  const remaining=Number(inv.remainingAmount??round(total-paid));
  if(!Number.isFinite(total)||!Number.isFinite(paid)||!Number.isFinite(remaining)||
     inv.customerId!==voucher.partyId||String(inv.currency||'ILS')!==String(voucher.currency||'ILS')||
     Math.abs(round(total-paid)-remaining)>0.01||
     amountMinor/100>remaining+0.005||remaining<=0)
   throw new InputError('RECEIPT_LINKED_INVOICE_AMOUNT_OR_PARTY_MISMATCH',409);
 }
 if(!['customer','both'].includes(party.value.type)||party.value.isSubCustomer||
  party.value.code==='CUST-0001'||party.value.name!==voucher.partyName)
   throw new InputError('RECEIPT_CUSTOMER_NOT_AUTHORIZED',409);
 if(treasury.value.status!=='active'||
   (cash&&treasury.value.type!=='cash_box')||
   (!cash&&treasury.value.type==='cash_box')||
   liquid.value.type!=='asset'||receivable.value.type!=='asset')
   throw new InputError('RECEIPT_TARGET_ACCOUNT_INVALID',409);
 const oldBalance=Number(treasury.value.balance),partyBalance=Number(party.value.balance);
 if(!Number.isFinite(oldBalance)||!Number.isFinite(partyBalance))
  throw new InputError('RECEIPT_BALANCE_BASELINE_INVALID',422);
 const currency=String(voucher.currency||'ILS');
 const held={...(treasury.value.currencyBalances||{})};
 const local=Number(held[currency]??(currency==='ILS'?treasury.value.balance:0));
 if(!Number.isFinite(local))throw new InputError('RECEIPT_CURRENCY_BALANCE_INVALID',422);
 const amount=amountMinor/100,base=baseMinor/100;
 const balance=plus(oldBalance,base),currencyBalance=plus(local,amount);
 const tx={id:'tx-receipt-'+voucher.id,treasuryId:treasury.record_id,
  treasuryName:treasury.value.name,date:voucher.date,type:'deposit',amount,
  actualAmount:amount,currency,currencySymbol:voucher.currencySymbol||'₪',
  exchangeRate:rate,baseCurrency:'ILS',baseAmount:base,
  balanceAfter:balance,balanceAfterCurrency:currencyBalance,
  referenceType:'receipt',referenceId:voucher.id,
  voucherNumber:voucher.voucherNumber,partyName:voucher.partyName,
  description:'سند قبض '+voucher.voucherNumber+' من '+voucher.partyName,
  paymentMethod:voucher.paymentMethod};
 const existingTx=safeArray(treasury.value.transactions);
 if(existingTx.some(x=>x.referenceId===voucher.id||x.id===tx.id))
  throw new InputError('DUPLICATE_RECEIPT_TREASURY_TRANSACTION',409);
 const now=new Date().toISOString();
 const journalId='je-receipt-'+voucher.id;
 const ledgerCode=cash?'1101':'1102';
 const journal={id:journalId,entryNumber:'JE-'+voucher.voucherNumber,
  date:voucher.date,createdAt:now,referenceType:'receipt',
  referenceId:voucher.id,
  description:'سند قبض '+voucher.voucherNumber+' من '+voucher.partyName,
  treasuryAccountCode:code,lines:[
   {accountCode:ledgerCode,accountName:liquid.value.name,debit:base,credit:0,
    description:'إيداع في '+code+' بموجب '+voucher.voucherNumber},
   {accountCode:'1201',accountName:receivable.value.name,debit:0,credit:base,
    description:'تسديد من '+voucher.partyName+' بموجب '+voucher.voucherNumber}
  ]};
 const updates=[
  ...(linkedInvoice?[{
   entity:'invoices',row:linkedInvoice,
   value:{...linkedInvoice.value,
    paidAmount:plus(linkedInvoice.value.paidAmount||0,amount),
    basePaidAmount:plus(linkedInvoice.value.basePaidAmount||0,base),
    receiptVoucherTotalBase:plus(linkedInvoice.value.receiptVoucherTotalBase||0,base),
    remainingAmount:plus(linkedInvoice.value.remainingAmount,-amount),
    baseRemainingAmount:plus(linkedInvoice.value.baseRemainingAmount??linkedInvoice.value.baseTotalAmount??linkedInvoice.value.totalAmount,-base),
    status:plus(linkedInvoice.value.remainingAmount,-amount)<=0.005?'paid':'partial'}
  }]:[]),
  {entity:'treasuries',row:treasury,value:{...treasury.value,balance,
    currencyBalances:{...held,[currency]:currencyBalance},
    transactions:[tx,...existingTx]}},
  {entity:'parties',row:party,value:{...party.value,balance:plus(partyBalance,-base)}},
  {entity:'accounts',row:liquid,value:{...liquid.value,balance:plus(liquid.value.balance,base)}},
  {entity:'accounts',row:receivable,value:{...receivable.value,balance:plus(receivable.value.balance,-base)}}
 ];
 await client.query('INSERT INTO sync_records(workspace,entity,record_id,version,value) VALUES($1,$2,$3,1,$4)',
 [workspace,'journalEntries',journalId,journal]);
 applied.push({entity:'journalEntries',id:journalId,version:1,value:journal});
 for(const change of updates){
  const nextVersion=Number(change.row.version)+1;
  await client.query('UPDATE sync_records SET version=$4,value=$5,updated_at=now() WHERE workspace=$1 AND entity=$2 AND record_id=$3',
   [workspace,change.entity,change.row.record_id,nextVersion,change.value]);
  applied.push({entity:change.entity,id:change.row.record_id,version:nextVersion,value:change.value});
 }
}
