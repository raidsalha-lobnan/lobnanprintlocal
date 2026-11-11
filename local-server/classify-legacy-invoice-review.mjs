import fs from 'node:fs';
import crypto from 'node:crypto';
const auditPath='D:/LobnanData/audit/remaining-invoice-evidence-20261111.json';
const registerPath='D:/LobnanData/audit/legacy-invoice-review-register.json';
const queuePath='D:/LobnanData/audit/legacy-invoice-priority-queue.json';
const audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
const register=JSON.parse(fs.readFileSync(registerPath,'utf8'));
if(!audit.readOnly||audit.workspace!=='lobnan_main'||register.accountingWritesEnabled!==false||
 audit.pending.length!==register.cases.filter(c=>!c.correctionApplied).length||
 audit.pending.length+(audit.corrected||[]).length!==register.cases.length)
 throw Error('RECONCILIATION_WORKSPACE_OR_COUNT_INVALID');
const evidenceIndex=new Map(audit.pending.map(x=>[x.recordId,x]));
const priority=[];
for(const rec of register.cases){
 if(rec.correctionApplied)continue;
 const row=evidenceIndex.get(rec.invoiceId);
 if(!row||row.invoiceNumber!==rec.invoiceNumber||row.version!==rec.serverVersion)
  throw Error('INVOICE_IDENTITY_OR_VERSION_CHANGED:'+rec.invoiceNumber);
 const flags=[];
 if(row.linkedJournalCount!==0)flags.push('EXISTING_JOURNAL_REQUIRES_DEDUP');
 if(row.partyBalanceMatchesInvoiceSum!==true)flags.push('PARTY_BALANCE_MISMATCH');
 if(!row.invoiceItemCodesValid)flags.push('ITEM_CODE_IDENTITY_MISMATCH');
 if(!row.invoiceAmountMatchesLines||!row.itemAmountsValid)flags.push('INVOICE_ARITHMETIC_MISMATCH');
 if(row.otherPartyFinancialDocs>0)flags.push('OTHER_PARTY_FINANCIAL_DOCUMENTS');
 if(!row.counterpartyExists)flags.push('COUNTERPARTY_NOT_FOUND');
 if(row.stockRecords.length===0)flags.push('STOCK_MOVEMENT_NOT_PRESENT');
 if(row.stockRecords.length && row.stockRecords.some(s=>!s.explicitOwner))
  flags.push('STOCK_OWNERSHIP_UNVERIFIED');
 if(row.stockDateMismatchCount>0)flags.push('STOCK_CANDIDATE_DATE_DIFFERENCE');
 if(row.stockItemMismatchCount>0)flags.push('STOCK_CANDIDATE_ITEM_DIFFERENCE');
 const evidence={number:row.invoiceNumber,version:row.version,total:row.amount,
  partyBalance:row.partyBalance,partyInvoiceSum:row.partyInvoiceSum,
  candidateStockIds:row.stockRecords.map(x=>x.id),flags};
 const evidenceHash=crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 rec.diagnosis={evidenceHash,readOnly:true,flags,
  financialSettlementStatus:'not-posted',
  stockSettlementStatus:'not-proven',
  proposedAction:flags.includes('PARTY_BALANCE_MISMATCH')?
   'Reconcile all related party entries before invoice posting':
   flags.includes('ITEM_CODE_IDENTITY_MISMATCH')?
    'Verify stable inventory IDs and retired SKU mapping':
    'Request approval of original invoice lines, then assess legacy revenue posting'};
 priority.push({number:row.invoiceNumber,total:row.amount,party:row.customerName,
  customerBalance:row.partyBalance,partyInvoiceSum:row.partyInvoiceSum,
  priority:flags.includes('PARTY_BALANCE_MISMATCH')?3:flags.includes('ITEM_CODE_IDENTITY_MISMATCH')?2:1,
  flags,reviewStatus:rec.reviewStatus,evidenceHash});
}
if(priority.length!==audit.pending.length)throw Error('PENDING_CASE_COUNT_MISMATCH');
priority.sort((a,b)=>a.priority-b.priority||
 Number(a.number.replace(/[^0-9]/g,''))-Number(b.number.replace(/[^0-9]/g,'')));
register.lastCaseAuditAt=new Date().toISOString();
register.accountingWritesEnabled=false;
const write=(file,x)=>{
 const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(x,null,2),'utf8');fs.renameSync(tmp,file);
};
write(queuePath,{readOnly:true,workspace:'lobnan_main',remaining:priority.length,priority});
write(registerPath,register);
console.log(JSON.stringify({registerPath,queuePath,pending:priority.length,
 firstCases:priority.slice(0,7),flags63:priority.find(x=>x.number==='INV-0063')?.flags,
 flags64:priority.find(x=>x.number==='INV-0064')?.flags},null,2));