import type {PaymentVoucher,Party,Treasury,TreasuryTransaction} from '../types';
import type {StoredRecord,SyncCommand,JsonObject} from '../sync-next/types';
import {MAIN_CASH_TREASURY_CODE} from './treasuryCodes';

const c=(value:unknown)=>{
 const amount=Number(value);
 if(!Number.isFinite(amount)||!Number.isSafeInteger(Math.round(amount*100))||
  Math.abs(Math.round(amount*100)-amount*100)>0.00001)
 throw Error('المبلغ يجب أن يكون رقماً صحيحاً حتى منزلتين عشريتين.');
 return Math.round(amount*100);
};
const m=(value:number)=>Number((value/100).toFixed(2));
const getRow=<T>(records:StoredRecord[],entity:string,id:string)=>{
 const match=records.find(r=>r.entity===entity&&r.id===id&&r.value);
 if(!match)throw Error('السجل غير موجود في قاعدة البيانات، يرجى المزامنة.');
 return {row:match,value:match.value as unknown as T};
};
const event=(entity:StoredRecord['entity'],row:StoredRecord,value:unknown)=>({
 entity,id:row.id,expectedVersion:row.version,value:value as JsonObject
});
const treasuryCode=(v:PaymentVoucher)=>v.treasuryAccountCode||
 (String(v.accountCode).startsWith('CASH-')?v.accountCode:'');
export type EditableReceipt={
 partyId:string;date:string;description:string;amount:number;currency:string;
 exchangeRate:number;paymentMethod:PaymentVoucher['paymentMethod'];
 treasuryAccountCode:string;subCustomerName?:string;transferReference?:string;
 chequeNumber?:string;chequeBank?:string;chequeDueDate?:string;
};
const methodFor=(treasury:Treasury,selected:EditableReceipt['paymentMethod']):PaymentVoucher['paymentMethod']=>{
 if(treasury.accountCode===MAIN_CASH_TREASURY_CODE)return 'cash';
 if(selected==='cheque'&&treasury.type!=='digital_wallet')return 'cheque';
 if(treasury.type==='digital_wallet')return 'e_wallet';
 return 'bank_transfer';
};
const roundDates=(date:string)=>{
 const match=/^\d{4}-\d{2}-\d{2}$/.test(date);
 if(!match||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||
 new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
 throw Error('تاريخ سند القبض غير صحيح.');
 return date;
};

/** Builds ONE optimistic-locked atomic PostgreSQL push for receipt, treasury,
 * and party balances. Never modifies an accounting journal from the browser.
 * Posted-journal financial changes are rejected pending central revision. */
export function buildReceiptAmendment(records:StoredRecord[],
 voucherId:string,localBaseline:PaymentVoucher,draft:EditableReceipt,
 commandId:string):SyncCommand {
 const {row:vr,value:old}=getRow<PaymentVoucher>(records,'vouchers',voucherId);
 if(old.type!=='receipt'||old.voucherNumber!==localBaseline.voucherNumber||
    old.amount!==localBaseline.amount||
    old.partyId!==localBaseline.partyId||
    treasuryCode(old)!==treasuryCode(localBaseline)||
    old.paymentMethod!==localBaseline.paymentMethod)
  throw Error('تم تعديل السند على جهاز آخر؛ حدث البيانات وأعد فتح السند.');
 const amount=c(draft.amount);if(amount<=0)throw Error('مبلغ القبض يجب أن يكون أكبر من صفر.');
 const date=roundDates(draft.date);
 if(!draft.description||draft.description.length>1000)throw Error('اكتب بيان سند قبض صحيحاً.');
 if(draft.currency!==(old.currency||'ILS'))throw Error('تغيير عملة السند يتطلب إجراء تسوية مالية مستقلاً.');
 const rate=Number(draft.exchangeRate||1);
 if(!Number.isFinite(rate)||rate<=0)throw Error('سعر الصرف غير صحيح.');
 const oldBase=c(old.baseAmount??(old.amount*(old.exchangeRate||1)));
 const newBase=c(m(amount)*rate);
 const oldCode=treasuryCode(old),newCode=draft.treasuryAccountCode;
 if(!/^CASH-\d{4,}$/.test(oldCode)||!/^CASH-\d{4,}$/.test(newCode))
  throw Error('رمز الصندوق المحدد غير معتمد.');
 const allTreasuries=records.filter(r=>r.entity==='treasuries'&&r.value)
   .map(row=>({row,value:row.value as unknown as Treasury}));
 const oldTarget=allTreasuries.find(t=>t.value.accountCode===oldCode);
 const newTarget=allTreasuries.find(t=>t.value.accountCode===newCode);
 if(!oldTarget||!newTarget||newTarget.value.status==='inactive'||
    (newCode===MAIN_CASH_TREASURY_CODE)!==(newTarget.value.type==='cash_box')||
    (oldCode===MAIN_CASH_TREASURY_CODE)!==(oldTarget.value.type==='cash_box'))
  throw Error('الصندوق غير متاح أو نوعه غير صحيح.');
 const partyRows=records.filter(r=>r.entity==='parties'&&r.value)
  .map(row=>({row,value:row.value as unknown as Party}));
 const oldParty=partyRows.find(p=>p.row.id===old.partyId);
 const newParty=partyRows.find(p=>p.row.id===draft.partyId);
 if(!oldParty||!newParty)throw Error('العميل المرتبط بالسند غير موجود.');
 const method=methodFor(newTarget.value,draft.paymentMethod);
 const revised:PaymentVoucher={
  ...old,partyId:draft.partyId,partyName:newParty.value.name,
  date,description:draft.description.trim(),amount:m(amount),baseAmount:m(newBase),
  exchangeRate:rate,paymentMethod:method,
  treasuryAccountCode:newCode,accountCode:'1201',
  subCustomerName:draft.subCustomerName?.trim()||undefined,
  transferReference:method==='bank_transfer'?draft.transferReference?.trim()||undefined:undefined,
  chequeNumber:method==='cheque'?draft.chequeNumber?.trim()||undefined:undefined,
  chequeBank:method==='cheque'?draft.chequeBank?.trim()||undefined:undefined,
  chequeDueDate:method==='cheque'?roundDates(draft.chequeDueDate||date):undefined
 };
 const financial=amount!==c(old.amount)||newBase!==oldBase||
  oldCode!==newCode||old.partyId!==draft.partyId;
 if(financial&&(old.relatedDocId||old.relatedDocType||old.referenceInvoiceId))
  throw Error('هذا السند مرتبط بفاتورة؛ يجب تعديل سداد الفاتورة من مصدرها الأصلي.');
 const linkedJournal=records.some(r=>r.entity==='journalEntries'&&r.value?.referenceId===voucherId);
 if(financial&&linkedJournal)
  throw Error('السند مرتبط بقيود أستاذ؛ تعديل المبلغ أو الصندوق يحتاج تسوية محاسبية معتمدة على الخادم.');
 const changes=[event('vouchers',vr,revised)];
 const txChanges=financial||old.date!==date||old.partyName!==revised.partyName||
 old.paymentMethod!==method||old.description!==revised.description;
 if(txChanges){
  for(const target of [oldTarget,...(oldCode!==newCode?[newTarget]:[])]){
   const treasury=target.value,was=treasury.accountCode===oldCode,
      will=treasury.accountCode===newCode;
   const all=Array.isArray(treasury.transactions)?treasury.transactions:[];
   const hits=was?all.filter(tx=>tx.referenceId===voucherId&&tx.referenceType==='receipt'):[];
   if(was&&(hits.length!==1||c(hits[0].amount)!==c(old.amount)))
    throw Error('حركة سند القبض في الصندوق لا تطابق مستندها؛ لا يجوز تعديلها آلياً.');
   const updatedTx=(was?hits[0]:null) as TreasuryTransaction|null;
   const newTx:TreasuryTransaction={
    ...(updatedTx||{} as TreasuryTransaction),
    id:updatedTx?.id||'tx-vch-'+voucherId+'-'+newCode,
    treasuryId:target.row.id,treasuryName:treasury.name,
    referenceType:'receipt',referenceId:voucherId,
    voucherNumber:old.voucherNumber,partyName:revised.partyName,
    type:'deposit',date,
    amount:m(amount),baseAmount:m(newBase),currency:revised.currency||'ILS',
    currencySymbol:revised.currencySymbol||'₪',exchangeRate:rate,
    description:'سند قبض '+old.voucherNumber+' من '+revised.partyName,
    paymentMethod:method,balanceAfter:0
   };
   const nextTx=all.filter(tx=>!was||tx.referenceId!==voucherId||
      tx.referenceType!=='receipt');
   if(will)nextTx.push(newTx);
   const delta=(will?newBase:0)-(was?oldBase:0);
   const nextBalance=c(treasury.balance)+delta;
   const held={...(treasury.currencyBalances||{})};
   const currency=old.currency||'ILS';
   const oldCurrencyAmount=c(held[currency]??(currency==='ILS'?treasury.balance:0));
   held[currency]=m(oldCurrencyAmount+(will?amount:0)-(was?c(old.amount):0));
   // Compute the whole displayed running balance from the original balance
   // implied by the currently recorded transactions.
   const net=nextTx.reduce((total,tx)=>total+(tx.type==='withdrawal'?-1:1)*
     c(tx.baseAmount??(tx.amount*(tx.exchangeRate||1))),0);
   const indexed=nextTx.map((tx,index)=>({tx,index})).sort((a,b)=>
     a.tx.date.localeCompare(b.tx.date)||a.index-b.index);
   let running=nextBalance-net;
   const runningAfter=new Map<number,number>();
   for(const {tx,index} of indexed){
    running+=(tx.type==='withdrawal'?-1:1)*c(tx.baseAmount??(tx.amount*(tx.exchangeRate||1)));
    runningAfter.set(index,m(running));
   }
   const nextTreasury:Treasury={...treasury,balance:m(nextBalance),
    currencyBalances:held,transactions:nextTx.map((tx,index)=>({
     ...tx,balanceAfter:runningAfter.get(index)??tx.balanceAfter
    }))};
   changes.push(event('treasuries',target.row,nextTreasury));
  }
 }
 if(old.partyId===draft.partyId){
  if(oldBase!==newBase){
   changes.push(event('parties',oldParty.row,{
    ...oldParty.value,balance:m(c(oldParty.value.balance)+oldBase-newBase)
   }));
  }
 }else{
  changes.push(event('parties',oldParty.row,{
   ...oldParty.value,balance:m(c(oldParty.value.balance)+oldBase)
  }));
  changes.push(event('parties',newParty.row,{
   ...newParty.value,balance:m(c(newParty.value.balance)-newBase)
  }));
 }
 return {id:commandId,workspaceId:'lobnan_main',changes,
  createdAt:Date.now(),attempts:0,retryAt:0,status:'pending'};
}
