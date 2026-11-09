// Evidence-based correction of an imported customer.balance cache.
// This is NOT a journal entry and must never change cash or receivables by
// itself. The financial entries for a revised invoice are posted separately.
const money=v=>{
 const n=Number(v);
 if(!Number.isFinite(n)||Math.abs(n)>1e12||
    Math.abs(n*100-Math.round(n*100))>0.00001)return null;
 return Math.round(n*100);
};
const rowValue=row=>row?.value||row;
const eligible=status=>!status||['new','ready','delivered'].includes(status);

/**
 * Prove a customer's cached balance from complete unpaid ILS invoice records
 * and matched account-1201 general-ledger postings. If any other type of
 * party transaction exists, or evidence is incomplete, do not reconcile.
 */
export function proveInvoiceOnlyPartyBalance({
 partyId,party,invoices,journals,hasOtherPartyDocuments=false
}){
 if(hasOtherPartyDocuments||!party||party.type!=='customer'||
    party.isSubCustomer||Number(party.openingBalance||0)!==0||
    !Array.isArray(invoices)||invoices.length===0)return null;
 const ids=new Set(),invoiceAmounts=new Map();
 let sum=0;
 for(const raw of invoices){
  const v=rowValue(raw);
  if(!v||!v.id||ids.has(v.id)||
     v.customerId!==partyId||v.subCustomerId||
     (v.counterpartyType&&v.counterpartyType!=='customer')||
     !eligible(v.workflowStatus)||v.isAccountingPosted!==true||
     (v.currency&&v.currency!=='ILS'&&v.currency!=='₪')||
     Number(v.exchangeRate||1)!==1||
     Number(v.paidAmount||0)!==0||Number(v.basePaidAmount||0)!==0)return null;
  const amount=money(v.baseTotalAmount??v.totalAmount);
  const remaining=money(v.baseRemainingAmount??v.remainingAmount);
  if(amount===null||remaining!==amount)return null;
  ids.add(v.id);invoiceAmounts.set(v.id,amount);sum+=amount;
 }
 if(!Number.isSafeInteger(sum))return null;
 const accounts=new Map([...ids].map(id=>[id,{receivable:0,salesCount:0}]));
 for(const raw of journals||[]){
  const v=rowValue(raw);
  if(!ids.has(v.referenceId))return null;
  if(!['pos_invoice','cogs','invoice_correction'].includes(v.referenceType))return null;
  if(v.referenceType==='invoice_correction'&&
     (v.approvedRevision!==true||v.internalCorrection!==true))return null;
  let debit=0,credit=0;
  for(const line of v.lines||[]){
   const dr=money(line.debit||0),cr=money(line.credit||0);
   if(dr===null||cr===null||dr<0||cr<0)return null;
   debit+=dr;credit+=cr;
  }
  if(debit!==credit)return null;
  if(v.referenceType==='cogs'||v.correctionKind==='cogs')continue;
  const item=accounts.get(v.referenceId);
  item.salesCount++;
  for(const line of v.lines||[]){
   if(line.accountCode==='1201')
    item.receivable+=money(line.debit||0)-money(line.credit||0);
  }
 }
 for(const [id,state] of accounts){
  if(!state.salesCount||state.receivable!==invoiceAmounts.get(id))return null;
 }
 return {balanceMinor:sum,sourceInvoiceCount:invoices.length,
  journalReconciled:true};
}
