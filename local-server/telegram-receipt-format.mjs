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
export function approvedReceiptTelegramText(row){
 const changes=Array.isArray(row?.changes)?row.changes:[];
 const receipts=changes.filter(x=>
  x.entity==='vouchers'&&x.value?.type==='receipt'&&Number(x.version)===1);
 if(!receipts.length)return null;
 if(receipts.length!==1)throw Error('TELEGRAM_RECEIPT_MULTIPLE_DOCUMENTS');
 const voucher=receipts[0].value;
 const id=receipts[0].id;
 const serial=plain(voucher.voucherNumber,50);
 if(!/^RCT-\d{4}-\d{4,}$/.test(serial)||id!==voucher.id)
  throw Error('TELEGRAM_RECEIPT_UNVERIFIED_SERIAL');
 const customer=changes.find(x=>x.entity==='parties'&&
  x.id===voucher.partyId&&x.value);
 const journal=changes.find(x=>x.entity==='journalEntries'&&
  x.value?.referenceType==='receipt'&&x.value?.referenceId===id);
 const treasury=changes.find(x=>x.entity==='treasuries'&&
  x.value?.accountCode===voucher.treasuryAccountCode&&x.value);
 const tx=treasury?.value?.transactions?.find(x=>
  x.referenceType==='receipt'&&x.referenceId===id);
 if(!customer||!journal||!tx||
  !['customer','both'].includes(customer.value?.type))
  throw Error('TELEGRAM_RECEIPT_POSTING_PROOF_MISSING');
 const amount=number(voucher.amount),baseAmount=number(voucher.baseAmount);
 const rate=number(voucher.exchangeRate??1);
 const balance=number(customer.value.balance);
 const txBase=number(tx.baseAmount);
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
 // New atomic customer receipts currently cannot post discounts. Always
 // show the actual ledger-supported zero, never a UI-only discount draft.
 const lines=[
  '✅ سند قيد معتمد '+serial,
  'التاريخ: '+formatDate(voucher.date),
  'الزبون الرئيسي: '+primary,
  'الزبون الفرعي: '+secondary,
  'ملاحظة السند: '+notes,
  'المبلغ المقبوض: '+money(amount)+' '+currency,
  'الخصم: 0.00 '+currency,
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
