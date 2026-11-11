import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const cents=v=>{
 const n=Number(v);
 if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>0.000001)
  throw Error('INVALID_MONETARY_VALUE');
 return Math.round(n*100);
};
const normalize=n=>{
 const v=String(n||'').toUpperCase().replace(/^INV[- ]*/,'').replace(/^0+/,'');
 if(!new RegExp('^[0-9]+$').test(v))throw Error('INVALID_INVOICE_NUMBER');
 return 'INV-'+v.padStart(4,'0');
};
/**
 * Create a documented proposal, never a financial posting.
 * Every source ID and version is revalidated against PostgreSQL before
 * a later, independently approved correction is allowed.
 */
export function buildLegacyReviewDraft(audit,register,number){
 if(audit?.readOnly!==true||audit?.workspace!=='lobnan_main'||
    register?.accountingWritesEnabled!==false)throw Error('UNTRUSTED_REVIEW_SOURCE');
 const n=normalize(number);
 const row=(audit.pending||[]).find(x=>x.invoiceNumber===n);
 const caseRow=(register.cases||[]).find(x=>x.invoiceNumber===n);
 if(!row||!caseRow||row.recordId!==caseRow.invoiceId||Number(row.version)!==Number(caseRow.serverVersion)||
    caseRow.correctionApplied||caseRow.operatorDecision)
  throw Error('NOT_A_PENDING_UNAPPROVED_CASE');
 if(!Array.isArray(row.invoiceItems)||row.invoiceItems.length<1||
    row.invoiceItems.some(i=>!i.storedItemIdValid||!i.itemCodeIdentityValid||
      !Number.isFinite(Number(i.qty))||Number(i.qty)<=0||cents(i.total)<0))
  throw Error('INVALID_OR_UNVERIFIED_ITEM_REFERENCES');
 if(!row.itemAmountsValid||!row.invoiceAmountMatchesLines||
    row.invoiceItems.reduce((sum,i)=>sum+cents(i.total),0)!==cents(row.amount))
  throw Error('INVOICE_TOTAL_REQUIRES_MANUAL_ITEM_RECONCILIATION');
 const safeBase=row.partyBalanceMatchesInvoiceSum===true&&
  row.otherPartyFinancialDocs===0&&row.linkedJournalCount===0&&row.counterpartyExists===true;
 const evidence={
  invoiceId:row.recordId,invoiceNumber:n,sourceVersion:Number(row.version),
  invoiceDate:row.invoiceDate,customerId:row.customerId,
  currentTotal:row.amount,remainingAmount:row.remaining,paid:row.paid,
  originalLines:row.invoiceItems.map(i=>({itemId:i.id,itemCode:i.code,
   itemName:i.name,quantity:i.qty,unitPrice:i.unitPrice,total:i.total})),
  sourceCustomerBalance:row.partyBalance,sourceCustomerInvoiceSum:row.partyInvoiceSum,
  currentLinkedJournalCount:row.linkedJournalCount,
  stockMovements:row.stockRecords,
  currentStockOwnershipVerified:row.stockRecords.length>0&&
    row.stockRecords.every(s=>s.explicitOwner===row.recordId),
  noOtherDocuments:row.otherPartyFinancialDocs===0
 };
 const evidenceHash=crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 return {schemaVersion:1,readOnly:true,invoiceNumber:n,invoiceId:row.recordId,
  status:'AWAITING_OPERATOR_DECISION',suggestedDecision:safeBase?
    'Confirm original invoice amount and lines, then assess missing revenue journal':
    'Reconcile customer subledger and original invoice amount before any posting',
  evidenceHash,evidence,
  flags:{invoiceArithmeticVerified:row.itemAmountsValid&&row.invoiceAmountMatchesLines,
   itemIdsAndCodesVerified:row.invoiceItemCodesValid,
   partyBalanceMatchesOpenInvoices:row.partyBalanceMatchesInvoiceSum,
   noOtherRelatedFinancialDocuments:row.otherPartyFinancialDocs===0,
   missingLinkedRevenueJournal:row.linkedJournalCount===0,
   legacyStockOwnershipUnverified:!evidence.currentStockOwnershipVerified},
  financialChangesPerformed:false,
  approval:null,accountingWritesEnabled:false};
}
if(process.argv[1]&&process.argv[1].endsWith('legacy-invoice-case-review.mjs')){
 const number=process.argv[2]||'35';
 const auditPath=process.argv[3]||'D:/LobnanData/audit/remaining-invoice-evidence-20261111.json';
 const registerPath=process.argv[4]||'D:/LobnanData/audit/legacy-invoice-review-register.json';
 const outDir=process.argv[5]||'D:/LobnanData/audit';
 const audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
 const register=JSON.parse(fs.readFileSync(registerPath,'utf8'));
 const plan=buildLegacyReviewDraft(audit,register,number);
 fs.mkdirSync(outDir,{recursive:true});
 const file=path.join(outDir,'draft-'+plan.invoiceNumber+'-reconciliation.json');
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(plan,null,2),'utf8');
 fs.renameSync(tmp,file);
 console.log(JSON.stringify({file,invoice:plan.invoiceNumber,status:plan.status,
  amount:plan.evidence.currentTotal,party:plan.evidence.sourceCustomerBalance,
  items:plan.evidence.originalLines,
  approved:false,changesPerformed:false},null,2));
}