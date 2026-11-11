// Read-only historical invoice diagnostics. Never fabricate missing postings,
// take ownership of number-only stock records, or rewrite original journals.
const money=v=>Math.round(Number(v||0)*100);
const rowValue=row=>row?.value||row||{};
const originalNumber=i=>String(i.invoiceNumber||'').trim();
const approvedNetRepair=(invoice,linked,allStock)=>{
 const repairId=invoice.legacyRepair?.repairId;
 if(!repairId||Number(invoice.paidAmount||0)!==0||
    Number(invoice.taxAmount||0)!==0||
    Number(invoice.additionalCharges||0)!==0||
    Number(invoice.exchangeRate||1)!==1)return false;
 const corrections=linked.map(rowValue).filter(j=>
   j.referenceType==='invoice_correction'&&
   j.approvedRevision===true&&j.internalCorrection===true);
 const group='revision-'+repairId;
 if(!corrections.some(j=>j.correctionKind==='financial')||
    !corrections.some(j=>j.correctionKind==='cogs')||
    !corrections.every(j=>j.correctionGroupId===group))return false;
 const accountNet=account=>linked.map(rowValue).reduce((sum,j)=>
   sum+(j.lines||[]).filter(l=>l.accountCode===account).reduce(
     (a,l)=>a+money(l.debit||0)-money(l.credit||0),0),0);
 const total=money(invoice.baseTotalAmount??invoice.totalAmount);
 const cost=accountNet('5101');
 if(accountNet('1201')!==total||accountNet('4101')!==-total||cost<0)return false;
 const movements=allStock.map(rowValue).filter(m=>m.sourceInvoiceId===invoice.id);
 if(!movements.length)return false;
 const qty=new Map();let value=0;
 for(const m of movements){
  const q=Number(m.quantity),price=Number(m.unitPrice),v=Number(m.totalValue);
  if(!m.itemId||!Number.isFinite(q)||q<0||!Number.isFinite(price)||price<0||
     !Number.isFinite(v)||money(q*price)!==money(v))return false;
  const sign=m.type==='in_adjustment'?-1:
   (m.type==='out_sale'||m.type==='out_adjustment')?1:null;
  if(sign===null)return false;
  qty.set(m.itemId,(qty.get(m.itemId)||0)+sign*q);
  value+=sign*money(v);
 }
 const expected=new Map();
 for(const item of invoice.items||[]){
  if(['services','copy_scan','print_service'].includes(item.category)||
    ['srv-delivery','srv-delivery-mobile'].includes(item.itemId))continue;
  expected.set(item.itemId,(expected.get(item.itemId)||0)+Number(item.quantity||0));
 }
 if(value!==cost||qty.size!==expected.size)return false;
 return [...expected].every(([id,q])=>Math.abs((qty.get(id)||0)-q)<0.000001);
};
export function diagnoseLegacyInvoices({invoices=[],journals=[],movements=[]}){
 const byRef=new Map(),byNumber=new Map(),byOwner=new Map();
 for(const j of journals){
  const ref=rowValue(j).referenceId;
  if(ref){if(!byRef.has(ref))byRef.set(ref,[]);byRef.get(ref).push(j);}
 }
 for(const m of movements){
  const v=rowValue(m),num=String(v.referenceNumber||'');
  if(num){if(!byNumber.has(num))byNumber.set(num,[]);byNumber.get(num).push(m);}
  const owner=v.sourceInvoiceId||v.referenceId;
  if(owner){if(!byOwner.has(owner))byOwner.set(owner,[]);byOwner.get(owner).push(m);}
 }
 const seen=new Map(),findings=[];
 const totals={invoices:invoices.length,needsReview:0,missingRevenue:0,
   duplicatedSales:0,duplicatedCosts:0,amountMismatch:0,missingStockReferences:0,
   reusedInvoiceNumbers:0,accepted:0};
 for(const record of invoices){
  const i=rowValue(record),number=originalNumber(i),id=i.id||record.record_id;
  const linked=byRef.get(id)||[];
  const sales=linked.filter(j=>rowValue(j).referenceType==='pos_invoice');
  const cogs=linked.filter(j=>rowValue(j).referenceType==='cogs');
  const corrections=linked.filter(j=>rowValue(j).referenceType==='invoice_correction');
  const reasons=[];
  if(seen.has(number)){
   reasons.push('INVOICE_NUMBER_REUSED');
   totals.reusedInvoiceNumbers++;
  }else seen.set(number,id);
  const isPosted=i.isAccountingPosted===true;
  if(isPosted&&!sales.length){
   reasons.push('MISSING_LINKED_REVENUE');
   totals.missingRevenue++;
  }
  const reconciledHistory=(sales.length>1||cogs.length>1)&&
    approvedNetRepair(i,linked,movements);
  if(!reconciledHistory&&sales.length>1){
   reasons.push('DUPLICATE_SALES_POSTINGS');totals.duplicatedSales++;
  }
  if(!reconciledHistory&&cogs.length>1){
   reasons.push('DUPLICATE_COST_POSTINGS');totals.duplicatedCosts++;
  }
  const invoiceBase=money(i.baseTotalAmount??i.totalAmount);
  const journalDebit=j=>money((rowValue(j).lines||[])
    .reduce((sum,line)=>sum+Number(line.debit||0),0));
  if(sales.length===1&&journalDebit(sales[0])!==invoiceBase){
   reasons.push('REVENUE_TOTAL_MISMATCH');totals.amountMismatch++;
  }
  const displayCandidates=[
   ...(byNumber.get(number)||[]),
   ...(byNumber.get('TEMP-'+id)||[])
  ].filter((m,index,all)=>all.indexOf(m)===index);
  const proven=(byOwner.get(id)||[]);
  // A display number and even matching date are not enough to assign stock:
  // only an explicit permanent source invoice ID is authoritative.
  const stockEvidence=proven.filter(m=>{
   const v=rowValue(m);
   return v.sourceInvoiceId===id||v.referenceId===id;
  });
  const physical=(i.items||[]).some(item=>
   !['services','copy_scan','print_service'].includes(String(item.category||''))&&
   !['srv-delivery','srv-delivery-mobile'].includes(String(item.itemId||'')));
  if(isPosted&&physical&&!stockEvidence.length&&!displayCandidates.length){
   reasons.push('STOCK_RECORD_NOT_FOUND');totals.missingStockReferences++;
  }else if(isPosted&&physical&&!stockEvidence.length&&displayCandidates.length){
   reasons.push('STOCK_REFERENCE_ONLY_UNVERIFIED');
  }
  const unrelatedCandidates=displayCandidates.filter(m=>{
   const v=rowValue(m);
   const owner=v.sourceInvoiceId||v.referenceId;
   return (owner&&owner!==id)||(!owner&&v.date&&i.date&&v.date!==i.date);
  });
  if(unrelatedCandidates.length)reasons.push('STOCK_NUMBER_REUSED_OR_DATE_MISMATCH');
  const requiresReview=reasons.length>0;
  if(requiresReview)totals.needsReview++;else totals.accepted++;
  findings.push({
   invoiceId:id,invoiceNumber:number,version:Number(record.version||0),
   date:i.date||'',totalAmount:Number(i.totalAmount||0),
   accountingPosted:isPosted,
   status:requiresReview?'manual-review':'no-obvious-issue',
   reasons,
   evidence:{
    salesJournalCount:sales.length,costJournalCount:cogs.length,
    correctionCount:corrections.length,
    explicitStockOwnership:stockEvidence.length,
    unverifiedStockCandidates:displayCandidates.length,
    stockCandidatesWithOtherOwnerOrDate:unrelatedCandidates.length
   },
   // This endpoint never claims that a blocked financial edit can be applied.
   action:requiresReview
     ?'RECONCILE_ORIGINAL_ACCOUNTING_DOCUMENTS'
     :'CONTINUE_NORMAL_VALIDATED_WORKFLOW',
   automaticFinancialRepair:false
  });
 }
 return {generatedAt:new Date().toISOString(),totals,
   findings:findings.sort((a,b)=>a.invoiceNumber.localeCompare(b.invoiceNumber,'en'))};
}
export async function auditLegacyInvoicesReadOnly(pool,workspace){
 const client=await pool.connect();
 try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const get=async entity=>(await client.query(
   'SELECT record_id,version,value FROM sync_records WHERE workspace=$1 AND entity=$2',
   [workspace,entity]
  )).rows;
  const invoices=await get('invoices');
  const journals=await get('journalEntries');
  const movements=await get('stockMovements');
  const report=diagnoseLegacyInvoices({invoices,journals,movements});
  await client.query('COMMIT');
  return report;
 }catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release();}
}
