import type {Party, Invoice, PaymentVoucher, JournalEntry, Treasury} from '../types';

const cents=(v:unknown):number|null=>{
 const n=Number(v);
 return Number.isFinite(n)&&Math.abs(n)<1e12&&Math.abs(n*100-Math.round(n*100))<0.00001
  ?Math.round(n*100):null;
};

/** A read-only, fail-closed projection for the receipt form. The physical
 * party card must not be trusted when posted invoice and receipt documents
 * prove a different amount. Never infer payments from voucher descriptions. */
export function verifiedReceiptCustomerBalance(params:{
 party:Party;
 invoices:readonly Invoice[];
 vouchers:readonly PaymentVoucher[];
 journalEntries:readonly JournalEntry[];
 treasuries:readonly Treasury[];
 hasOtherDocuments?:boolean;
}):number|null {
 const {party,invoices,vouchers,journalEntries,treasuries,hasOtherDocuments}=params;
 if(hasOtherDocuments||party.type!=='customer'||party.isSubCustomer||
   party.code==='CUST-0001'||Number(party.openingBalance||0)!==0)return null;
 const owned=invoices.filter(i=>i.customerId===party.id);
 if(!owned.length)return null;
 let invoiceMinor=0;
 const invoiceIds=new Set<string>();
 for(const i of owned){
  if(invoiceIds.has(i.id)||i.isAccountingPosted!==true||
    i.subCustomerId||i.counterpartyType&&i.counterpartyType!=='customer'||
    (i.currency&&i.currency!=='ILS'&&i.currency!=='₪')||
    Number(i.exchangeRate||1)!==1||
    Number(i.paidAmount||0)!==0||Number(i.basePaidAmount||0)!==0)return null;
  const total=cents(i.baseTotalAmount??i.totalAmount);
  const remaining=cents(i.remainingAmount);
  if(total===null||remaining!==total||total<0)return null;
  invoiceIds.add(i.id);
  const entries=journalEntries.filter(j=>j.referenceId===i.id&&
    ['pos_invoice','invoice_correction'].includes(j.referenceType));
  if(!entries.some(j=>j.referenceType==='pos_invoice'))return null;
  let ar=0;
  for(const j of entries){
   if(String(j.referenceType)==='invoice_correction'&&
    (!(j as JournalEntry & {approvedRevision?:boolean}).approvedRevision||
     !(j as JournalEntry & {internalCorrection?:boolean}).internalCorrection))return null;
   const debits=j.lines.reduce((s,l)=>s+(cents(l.debit)||0),0);
   const credits=j.lines.reduce((s,l)=>s+(cents(l.credit)||0),0);
   if(debits!==credits)return null;
   for(const l of j.lines){
    if(l.accountCode==='1201')ar+=(cents(l.debit)||0)-(cents(l.credit)||0);
   }
  }
  if(ar!==total)return null;
  invoiceMinor+=total;
 }
 const receipts=vouchers.filter(v=>v.partyId===party.id);
 let received=0;
 const seen=new Set<string>();
 for(const v of receipts){
  if(seen.has(v.id)||v.type!=='receipt'||v.referenceInvoiceId||
     v.relatedDocId||v.subCustomerId||
     (v.currency&&v.currency!=='ILS')||Number(v.exchangeRate||1)!==1)return null;
  seen.add(v.id);
  const amount=cents(v.baseAmount??v.amount);
  if(amount===null||amount<=0)return null;
  const entries=journalEntries.filter(j=>j.referenceType==='receipt'&&j.referenceId===v.id);
  if(entries.length!==1)return null;
  const j=entries[0];
  const debit=j.lines.reduce((s,l)=>s+(cents(l.debit)||0),0);
  const credit=j.lines.reduce((s,l)=>s+(cents(l.credit)||0),0);
  const arCredit=j.lines.filter(l=>l.accountCode==='1201')
   .reduce((s,l)=>s+(cents(l.credit)||0)-(cents(l.debit)||0),0);
  if(debit!==credit||arCredit!==amount)return null;
  const matching=treasuries.flatMap(t=>(t.transactions||[])
   .filter(tx=>tx.referenceId===v.id).map(tx=>({t,tx})));
  if(matching.length!==1||matching[0].t.accountCode!==v.treasuryAccountCode||
     cents(matching[0].tx.baseAmount??matching[0].tx.amount)!==amount)return null;
  received+=amount;
 }
 return (invoiceMinor-received)/100;
}
