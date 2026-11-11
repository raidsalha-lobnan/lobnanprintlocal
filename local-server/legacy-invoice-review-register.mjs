import fs from 'node:fs';
import path from 'node:path';

// Creates an auditable, non-posting case list for historical invoices.
// No database connection, financial mutation, or automatic approval.
const auditPath=process.argv[2]||'D:/LobnanData/audit/invoice-reconciliation-review.json';
const registerPath=process.argv[3]||'D:/LobnanData/audit/legacy-invoice-review-register.json';
const audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
if(audit.summary?.readOnly!==true||!Array.isArray(audit.rows)||!audit.rows.length)
  throw new Error('INVALID_READ_ONLY_AUDIT');
let prior=null;
if(fs.existsSync(registerPath))prior=JSON.parse(fs.readFileSync(registerPath,'utf8'));
const existing=new Map((prior?.cases||[]).map(x=>[x.invoiceId,x]));
const cases=audit.rows.map(row=>{
  const old=existing.get(row.invoiceId);
  if(old&&old.invoiceNumber!==row.invoiceNumber)
    throw new Error('INVOICE_IDENTITY_CHANGED_REVIEW:'+row.invoiceId);
  const unchanged=old&&old.serverVersion===row.version&&old.originalTotal===row.total;
  return {
    invoiceId:row.invoiceId,invoiceNumber:row.invoiceNumber,
    serverVersion:row.version,originalTotal:row.total,
    journalEvidenceCount:row.journalExactCount+row.journalNumberCandidateCount,
    stockEvidence:'unverified',
    counterpartyAvailable:!row.caveats.includes('NO_COUNTERPARTY_RECORD'),
    reviewStatus:!old?'awaiting-decision':unchanged?old.reviewStatus:'source-changed-review-required',
    proposedCorrectTotal:unchanged?(old.proposedCorrectTotal??null):null,
    operatorDecision:unchanged?(old.operatorDecision??null):null,
    reviewedAt:unchanged?(old.reviewedAt??null):null,
    correctionApplied:false
  };
});
const file={schemaVersion:1,workspace:audit.summary.workspace,
  accountingWritesEnabled:false,reviewCount:cases.length,
  createdAt:prior?.createdAt||new Date().toISOString(),
  refreshedAt:new Date().toISOString(),cases};
const temp=registerPath+'.tmp';
fs.mkdirSync(path.dirname(registerPath),{recursive:true});
fs.writeFileSync(temp,JSON.stringify(file,null,2),'utf8');
fs.renameSync(temp,registerPath);
console.log(JSON.stringify({registerPath,count:cases.length,
  open:cases.filter(x=>x.reviewStatus!=='resolved').length,
  accountingWritesEnabled:false},null,2));
