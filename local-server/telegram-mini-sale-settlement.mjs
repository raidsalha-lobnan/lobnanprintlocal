// Server-generated receipt evidence for a posted Telegram Mini sale.
// Never creates another journal: existing atomic POS journal already debits
// 1101/1102 and credits revenue; vouchers are evidence, not second postings.
import {InputError} from './sync-domain.mjs';
const fail=(code)=>{throw new InputError(code,422);};
const cents=x=>{
 if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e12)
  fail('MINI_RECEIPT_INVALID_AMOUNT');
 return Math.round((x+Number.EPSILON)*100);
};
const money=n=>Number((n/100).toFixed(2));
const signFor=type=>['asset','expense'].includes(type)?1:-1;
const positiveLegs=invoice=>[
 {kind:'cash',amount:invoice.cashPaidAmount||0,code:invoice.cashTreasuryCode},
 {kind:'bank',amount:invoice.bankPaidAmount||0,code:invoice.bankTreasuryCode}
].filter(l=>l.amount>0);

export function miniSaleReceiptChanges({invoice,postings,draftId,treasuryRows,accountRows,createdAt}){
 if(!invoice?.id?.startsWith('inv-pos-')||draftId!==invoice.id.slice('inv-pos-'.length))
  fail('MINI_RECEIPT_INVOICE_ID_MISMATCH');
 const legs=positiveLegs(invoice);
 if(legs.reduce((s,l)=>s+cents(l.amount),0)!==cents(invoice.paidAmount||0))
  fail('MINI_RECEIPT_PAYMENT_SPLIT_MISMATCH');
 const treasuryByCode=new Map(treasuryRows.map(r=>[r.value?.accountCode,r]));
 const accountByCode=new Map(accountRows.map(r=>[r.value?.code,r]));
 const changes=[];
 const postedAt=createdAt||invoice.createdAt;
 for(const leg of legs){
  const row=treasuryByCode.get(leg.code);
  if(!row||row.value?.status!=='active'||!Number.isSafeInteger(Number(row.version)))
   fail('MINI_RECEIPT_SELECTED_TREASURY_MISSING');
  const t=row.value;
  const proper=leg.kind==='cash'
   ?leg.code==='CASH-1101'&&t.type==='cash_box'&&row.record_id==='treasury-cash-main'
   :/^CASH-\d{4,}$/.test(leg.code)&&leg.code!=='CASH-1101'&&t.type!=='cash_box';
  if(!proper)fail('MINI_RECEIPT_SELECTED_TREASURY_TYPE_INVALID');
  const previous=Number(t.balance??0);
  const currencyPrevious=Number(t.currencyBalances?.ILS??previous);
  if(!Number.isFinite(previous)||!Number.isFinite(currencyPrevious))
   fail('MINI_RECEIPT_TREASURY_BALANCE_INVALID');
  const amount=cents(leg.amount),next=money(cents(previous)+amount);
  const nextIls=money(cents(currencyPrevious)+amount);
  const transaction={
   id:'tx-mini-'+draftId+'-'+leg.kind,
   treasuryId:t.id||row.record_id,treasuryName:t.name,date:invoice.date,
   type:'deposit',amount:leg.amount,currency:'ILS',
   currencySymbol:invoice.currencySymbol||'₪',exchangeRate:1,
   baseCurrency:'ILS',baseAmount:leg.amount,
   balanceAfter:next,balanceAfterCurrency:nextIls,
   partyName:invoice.customerName,
   description:(invoice.invoiceNumber||'INV-')+' - '+(invoice.paymentNotes||''),
   referenceType:'sale',referenceId:invoice.id
  };
  changes.push({entity:'treasuries',id:row.record_id,expectedVersion:Number(row.version),
   value:{...t,balance:next,currencyBalances:{...(t.currencyBalances||{}),ILS:nextIls},
    transactions:[transaction,...(Array.isArray(t.transactions)?t.transactions:[])]}});
  const voucherId='vch-mini-'+draftId+'-'+leg.kind;
  changes.push({entity:'vouchers',id:voucherId,expectedVersion:0,value:{
   id:voucherId,voucherNumber:'REC-'+draftId.slice(0,8)+'-'+leg.kind.toUpperCase(),
   type:'receipt',date:invoice.date,partyId:invoice.customerId,
   counterpartyType:invoice.counterpartyType||'customer',
   partyName:invoice.customerName,
   amount:leg.amount,paymentMethod:leg.kind==='cash'?'cash':'bank_transfer',
   accountCode:'4101',treasuryAccountCode:leg.code,
   currency:'ILS',currencySymbol:invoice.currencySymbol||'₪',
   baseAmount:leg.amount,relatedDocType:'sale',relatedDocId:invoice.id,
   description:(invoice.invoiceNumber||'INV-')+' - '+(invoice.paymentNotes||'')
  }});
 }
 const netChange=new Map();
 for(const j of postings.journals){
  for(const line of j.value?.lines||[]){
   const d=cents(Number(line.debit||0)),c=cents(Number(line.credit||0));
   netChange.set(line.accountCode,(netChange.get(line.accountCode)||0)+d-c);
  }
 }
 for(const [code,net] of netChange){
  const account=accountByCode.get(code);
  if(!account||!Number.isSafeInteger(Number(account.version))||!account.value)
   fail('MINI_RECEIPT_LEDGER_ACCOUNT_MISSING_'+code);
  const prior=Number(account.value.balance||0);
  if(!Number.isFinite(prior))fail('MINI_RECEIPT_LEDGER_BALANCE_INVALID');
  changes.push({entity:'accounts',id:account.record_id,expectedVersion:Number(account.version),
   value:{...account.value,balance:money(cents(prior)+signFor(account.value.type)*net)}});
 }
 return changes;
}

export function validateMiniSaleReceiptBundle(command,invoice){
 if(command.miniSaleSettlement!==true)return false;
 const draftId=command.id,invoiceId=command.atomicInvoiceId;
 if(!invoiceId||draftId!==invoiceId.slice('inv-pos-'.length))
  fail('MINI_RECEIPT_INVOICE_ID_MISMATCH');
 const changes=command.changes||[],extras=changes.filter(c=>
  ['treasuries','vouchers','accounts'].includes(c.entity));
 const legs=positiveLegs(invoice);
 const total=cents(legs.reduce((s,l)=>s+l.amount,0));
 if(total!==cents(invoice.basePaidAmount||0)||total!==cents(invoice.paidAmount||0))
  fail('MINI_RECEIPT_PAYMENT_SPLIT_MISMATCH');
 if(extras.filter(c=>c.entity==='treasuries').length!==legs.length||
    extras.filter(c=>c.entity==='vouchers').length!==legs.length)
  fail('MINI_RECEIPT_EVIDENCE_COUNT_INVALID');
 for(const leg of legs){
  const voucher=extras.find(c=>c.entity==='vouchers'&&c.id==='vch-mini-'+draftId+'-'+leg.kind);
  if(!voucher||voucher.expectedVersion!==0||voucher.value?.type!=='receipt'||
    voucher.value?.treasuryAccountCode!==leg.code||
    voucher.value?.partyId!==invoice.customerId||
    voucher.value?.relatedDocId!==invoice.id||
    cents(voucher.value?.amount)!==cents(leg.amount))
   fail('MINI_RECEIPT_VOUCHER_LINK_INVALID');
  const expectedTxId='tx-mini-'+draftId+'-'+leg.kind;
  const treasuries=extras.filter(c=>c.entity==='treasuries'&&
    c.value?.accountCode===leg.code);
  if(treasuries.length!==1||treasuries[0].expectedVersion<1||
    !Array.isArray(treasuries[0].value?.transactions)||
    !treasuries[0].value.transactions.some(tx=>
      tx.id===expectedTxId&&tx.type==='deposit'&&
      tx.referenceType==='sale'&&tx.referenceId===invoice.id&&
      cents(tx.amount)===cents(leg.amount)&&cents(tx.baseAmount)===cents(leg.amount)))
   fail('MINI_RECEIPT_TREASURY_LINK_INVALID');
 }
 const required=new Set(changes.filter(c=>c.entity==='journalEntries')
  .flatMap(c=>c.value?.lines?.map(l=>l.accountCode)||[]));
 const accounts=extras.filter(c=>c.entity==='accounts');
 if(accounts.length!==required.size||accounts.some(c=>
   !required.has(c.value?.code)||!Number.isSafeInteger(c.expectedVersion)||c.expectedVersion<1))
  fail('MINI_RECEIPT_LEDGER_ACCOUNTS_MISMATCH');
 return true;
}

export function authoritativeMiniSaleSettlementEffect(command,change,previous){
 if(!previous||!change.value)fail('MINI_RECEIPT_PREVIOUS_REQUIRED');
 const invoice=command.changes.find(c=>c.entity==='invoices').value;
 if(change.entity==='treasuries'){
  const before=Number(previous.balance||0),after=Number(change.value.balance);
  const leg=positiveLegs(invoice).find(l=>l.code===change.value.accountCode);
  if(!leg||change.value.accountCode!==previous.accountCode||
     change.value.type!==previous.type||!Number.isFinite(before)||
     cents(after-before)!==cents(leg.amount)||
     cents(Number(change.value.currencyBalances?.ILS)-Number(previous.currencyBalances?.ILS??before))!==cents(leg.amount))
   fail('MINI_RECEIPT_TREASURY_BALANCE_MISMATCH');
  if(JSON.stringify((change.value.transactions||[]).slice(1))!==
     JSON.stringify(previous.transactions||[]))
   fail('MINI_RECEIPT_TREASURY_HISTORY_MISMATCH');
  const a={...change.value},b={...previous};
  for(const key of ['balance','currencyBalances','transactions']){delete a[key];delete b[key];}
  if(JSON.stringify(a)!==JSON.stringify(b))fail('MINI_RECEIPT_TREASURY_METADATA_CHANGED');
 }else if(change.entity==='accounts'){
  const code=previous.code;
  const lines=command.changes.filter(c=>c.entity==='journalEntries')
   .flatMap(j=>j.value?.lines||[]).filter(l=>l.accountCode===code);
  if(!lines.length||change.value.code!==code)fail('MINI_RECEIPT_LEDGER_WRONG_ACCOUNT');
  const net=lines.reduce((s,l)=>s+cents(Number(l.debit||0))-cents(Number(l.credit||0)),0);
  if(cents(Number(change.value.balance)-Number(previous.balance||0))!==
     signFor(previous.type)*net)
   fail('MINI_RECEIPT_LEDGER_BALANCE_MISMATCH');
  const a={...change.value},b={...previous};delete a.balance;delete b.balance;
  if(JSON.stringify(a)!==JSON.stringify(b))fail('MINI_RECEIPT_LEDGER_METADATA_CHANGED');
 }
 return true;
}
