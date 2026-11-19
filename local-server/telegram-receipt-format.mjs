// Receipt Telegram messages are constructed strictly from the PostgreSQL
// transaction snapshot saved in sync_telegram_outbox.changes. Never read a
// party's *later* balance: a delayed/retried message must show the balance
// directly after the receipt was originally approved.
const plain=(value,max=260)=>String(value??'')
 .replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const number=(value)=>{
 const parsed=Number(value);
 return Number.isFinite(parsed)?parsed:null;
};
const money=(value)=>Number(value).toLocaleString('en-US',{
 minimumFractionDigits:2,maximumFractionDigits:2
});
const formatDate=(date)=>{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));
 return match?match[3]+'/'+match[2]+'/'+match[1]:plain(date,30);
};
const currencyLabel=(code,symbol)=>{
 const known={ILS:'₪',USD:'$',JOD:'د.أ',EUR:'€',EGP:'ج.م',SAR:'ر.س'};
 const cc=plain(code||'ILS',12);
 const sign=plain(symbol||known[cc]||cc,14);
 return cc==='ILS'?'شيكل (₪)':cc+' ('+sign+')';
};
const asOfDate=(value)=>{
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()))throw new Error('TELEGRAM_RECEIPT_MISSING_COMMITTED_DATE');
 return new Intl.DateTimeFormat('en-GB',{
  timeZone:'Africa/Cairo',day:'2-digit',month:'2-digit',year:'numeric'
 }).format(d);
};
/**
 * Returns null for unrelated sync commands; for a newly posted receipt
 * refuses to claim "approved" unless the committed journal, treasury
 * transaction and updated customer receivable are all present.
 */
/**
 * Capture a minimal, immutable accounting proof for an edited receipt from
 * the same PostgreSQL transaction as its approved revision. Put it ONLY in
 * the Telegram outbox, never in sync_events or the client-facing receipt.
 * Otherwise a delayed Telegram retry could show a later customer balance.
 */
export async function receiptTelegramOutboxChanges(client,workspace,changes){
 const revisions=changes.filter(x=>x.entity==='vouchers'&&
  x.value?.type==='receipt'&&Number(x.version)>1);
 if(!revisions.length)return changes;
 if(revisions.length!==1)throw Error('TELEGRAM_RECEIPT_MULTIPLE_DOCUMENTS');
 const {id,value:voucher}=revisions[0];
 const [parties,journals,treasuries]=await Promise.all([
  client.query(
   "SELECT value FROM sync_records WHERE workspace=$1 AND entity='parties' AND record_id=$2",
   [workspace,voucher.partyId]),
  client.query(
   "SELECT value FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND value->>'referenceType'='receipt' AND value->>'referenceId'=$2",
   [workspace,id]),
  client.query(
   "SELECT value FROM sync_records WHERE workspace=$1 AND entity='treasuries' AND value->>'accountCode'=$2",
   [workspace,voucher.treasuryAccountCode])
 ]);
 if(parties.rows.length!==1||journals.rows.length!==1||
  treasuries.rows.length!==1)
  throw Error('TELEGRAM_RECEIPT_AMENDMENT_POSTING_PROOF_MISSING');
 const party=parties.rows[0].value,journal=journals.rows[0].value;
 const treasury=treasuries.rows[0].value;
 const transactions=(Array.isArray(treasury.transactions)?treasury.transactions:[])
  .filter(tx=>tx.referenceType==='receipt'&&tx.referenceId===id);
 if(!['customer','both'].includes(party?.type)||
  transactions.length!==1||!Number.isFinite(Number(party.balance)))
  throw Error('TELEGRAM_RECEIPT_AMENDMENT_POSTING_PROOF_MISSING');
 const tx=transactions[0];
 return [...changes,{entity:'telegramReceiptSnapshot',id,version:1,value:{
  party:{type:party.type,name:party.name,balance:party.balance},
  journal:{referenceType:journal.referenceType,referenceId:journal.referenceId,
   lines:journal.lines},
  treasury:{name:treasury.name,accountCode:treasury.accountCode,
   transaction:{referenceType:tx.referenceType,referenceId:tx.referenceId,
    baseAmount:tx.baseAmount,baseCurrency:tx.baseCurrency}}
 }}];
}

export function approvedReceiptTelegramText(row){
 const changes=Array.isArray(row?.changes)?row.changes:[];
 const receipts=changes.filter(x=>
  x.entity==='vouchers'&&x.value?.type==='receipt'&&Number(x.version)>=1);
 if(!receipts.length)return null;
 if(receipts.length!==1)throw Error('TELEGRAM_RECEIPT_MULTIPLE_DOCUMENTS');
 const voucher=receipts[0].value;
 const id=receipts[0].id;
 const serial=plain(voucher.voucherNumber,50);
 if(!/^RCT-\d{4}-\d{4,}$/.test(serial)||id!==voucher.id)
  throw Error('TELEGRAM_RECEIPT_UNVERIFIED_SERIAL');
 const isAmendment=Number(receipts[0].version)>1;
 const proof=isAmendment?changes.find(x=>
  x.entity==='telegramReceiptSnapshot'&&x.id===id)?.value:null;
 const customer=isAmendment?{value:proof?.party}:changes.find(x=>
  x.entity==='parties'&&x.id===voucher.partyId&&x.value);
 const journal=isAmendment?{value:proof?.journal}:changes.find(x=>
  x.entity==='journalEntries'&&x.value?.referenceType==='receipt'&&
  x.value?.referenceId===id);
 const treasury=isAmendment?{value:proof?.treasury?{
  ...proof.treasury,transactions:[proof.treasury.transaction]
 }:null}:changes.find(x=>x.entity==='treasuries'&&
  x.value?.accountCode===voucher.treasuryAccountCode&&x.value);
 const tx=treasury?.value?.transactions?.find(x=>
  x.referenceType==='receipt'&&x.referenceId===id);
 if(!customer?.value||journal?.value?.referenceType!=='receipt'||
  journal.value.referenceId!==id||!tx||
  treasury?.value?.accountCode!==voucher.treasuryAccountCode||
  !['customer','both'].includes(customer.value?.type))
  throw Error('TELEGRAM_RECEIPT_POSTING_PROOF_MISSING');
 const amount=number(voucher.amount),baseAmount=number(voucher.baseAmount);
 const rate=number(voucher.exchangeRate??1);
 const balance=number(customer.value.balance);
 const txBase=number(tx.baseAmount);
 const discount=number(voucher.discountAmount??0);
 const baseDiscount=number(voucher.baseDiscountAmount??0);
 if(discount===null||discount<0||baseDiscount===null||baseDiscount<0)
  throw Error('TELEGRAM_RECEIPT_DISCOUNT_INVALID');
 const postedLines=journal.value.lines||[];
 const arCredit=postedLines.filter(line=>line.accountCode==='1201')
  .reduce((sum,line)=>sum+Number(line.credit||0)-Number(line.debit||0),0);
 const discountDebit=postedLines.filter(line=>line.accountCode==='5299')
  .reduce((sum,line)=>sum+Number(line.debit||0)-Number(line.credit||0),0);
 if(Math.abs(arCredit-(baseAmount+baseDiscount))>0.005||
    Math.abs(discountDebit-baseDiscount)>0.005)
  throw Error('TELEGRAM_RECEIPT_DISCOUNT_POSTING_UNPROVEN');
 if(amount===null||amount<=0||baseAmount===null||baseAmount<=0||
  rate===null||rate<=0||balance===null||txBase===null||
  Math.abs(txBase-baseAmount)>0.005)
  throw Error('TELEGRAM_RECEIPT_MONEY_OR_BALANCE_NOT_PROVEN');
 const code=plain(voucher.currency||'ILS',12);
 const baseCode=plain(tx.baseCurrency||'ILS',12);
 const currency=currencyLabel(code,voucher.currencySymbol);
 const baseCurrency=currencyLabel(baseCode);
 const cash=voucher.paymentMethod==='cash'&&
  voucher.treasuryAccountCode==='CASH-1101';
 const treasuryName=plain(treasury.value.name||voucher.treasuryAccountCode,150);
 const payment= cash?'نقداً':treasuryName;
 const notes=plain(voucher.description,400)||'—';
 const paymentNotes=plain(voucher.transferReference||voucher.paymentNotes,350)||'—';
 const primary=plain(customer.value.name||voucher.partyName,160)||'—';
 const secondary=plain(voucher.subCustomerName,160)||'—';
 // The discount is read from the committed voucher and verified journal,
 // never from an uncommitted UI draft.
 const lines=[
  '✅ '+(isAmendment?'تعديل':'إضافة')+' سند قيد معتمد '+serial,
  'التاريخ: '+formatDate(voucher.date),
  'الزبون الرئيسي: '+primary,
  'الزبون الفرعي: '+secondary,
  'ملاحظة السند: '+notes,
  'المبلغ المقبوض: '+money(amount)+' '+currency,
  'الخصم: '+money(discount)+' '+currency,
  'رصيد الزبون بعد الاعتماد حتى '+asOfDate(row.committed_at)+': '+
   money(balance)+' '+baseCurrency,
  'طريقة القبض: '+payment,
  'ملاحظة الإيصال: '+paymentNotes
 ];
 if(code!==baseCode){
  lines.push('العملة: '+currency);
  lines.push('سعر الصرف: 1 '+code+' = '+
   rate.toLocaleString('en-US',{maximumFractionDigits:8})+' '+baseCode);
  lines.push('المبلغ بالعملة المعتمدة: '+money(baseAmount)+' '+baseCurrency);
 }
 return lines.join('\n');
}
