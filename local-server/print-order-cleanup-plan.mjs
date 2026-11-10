/* Auditable, non-mutating plan for phantom print orders.
   Never touches accepted invoices. Financial corrections must be reversed by
   equal-and-opposite journals; original journals remain as audit evidence. */
const s=x=>String(x??'').trim();
const money=n=>Math.round(Number(n||0)*100);
const opposite=(line)=>{
  const debit=Number(line.debit||0);
  const credit=Number(line.credit||0);
  if(!Number.isFinite(debit)||!Number.isFinite(credit)||debit<0||credit<0||
     (debit===0 && credit===0) || (debit>0 && credit>0))
    throw Error('INVALID_PRINT_JOURNAL_LINE');
  return {...line,debit:credit,credit:debit,
    description:'إلغاء قيد أمر طباعة غير حقيقي: '+s(line.description)};
};
export function planPhantomPrintOrderCleanup({orders,invoices,journals,correctionDate='2026-11-10'}){
  if(!Array.isArray(orders)||!Array.isArray(invoices)||!Array.isArray(journals))
    throw Error('INVALID_PRINT_ORDER_CLEANUP_INPUT');
  const invoiceIds=new Set(invoices.map(i=>s(i.id)));
  const invoiceNumbers=new Set(invoices.map(i=>s(i.invoiceNumber)).filter(Boolean));
  const seen=new Set();
  for(const o of orders){
    if(!o?.id||seen.has(o.id))throw Error('INVALID_OR_DUPLICATE_ORDER_ID');
    seen.add(o.id);
  }
  const accepted=new Set();
  for(const o of orders){
    if(invoiceIds.has(s(o.associatedInvoiceId)) ||
       invoiceNumbers.has(s(o.associatedInvoiceId)))accepted.add(o.id);
  }
  const orderIds=new Set(orders.map(x=>x.id));
  for(const i of invoices){
    for(const k of ['printJobId','printOrderId','associatedPrintOrderId']){
      const id=s(i[k]);if(orderIds.has(id))accepted.add(id);
    }
    // Historical links embedded in note text: ambiguous links stop the deletion.
    const note=[i.notes,i.description].filter(x=>typeof x==='string').join(' ');
    for(const o of orders){
      if(o.orderNumber && note.includes(o.orderNumber))accepted.add(o.id);
    }
  }
  const orphan=orders.filter(o=>!accepted.has(o.id));
  const orphanIds=new Set(orphan.map(o=>o.id));
  const relevant=journals.filter(j=>s(j.referenceType)==='print_order');
  const unwanted=relevant.filter(j=>orphanIds.has(s(j.referenceId)));
  const invalidRefs=relevant.filter(j=>!orderIds.has(s(j.referenceId)));
  if(invalidRefs.length)throw Error('JOURNAL_MISSING_PRINT_ORDER_PROVENANCE');
  const reversalEntries=[];
  const entries=new Set(journals.map(j=>s(j.id)));
  for(const j of unwanted.sort((a,b)=>s(a.id).localeCompare(s(b.id),'en'))){
    if(!j.id||!Array.isArray(j.lines)||j.lines.length<2)throw Error('INVALID_ORIGINAL_PRINT_JOURNAL');
    const lines=j.lines.map(opposite);
    const d=lines.reduce((n,l)=>n+money(l.debit),0);
    const c=lines.reduce((n,l)=>n+money(l.credit),0);
    if(d!==c||d<=0)throw Error('UNBALANCED_PRINT_REVERSAL');
    const id='je-void-print-'+s(j.id).replace(/[^a-zA-Z0-9_-]/g,'_');
    if(entries.has(id))throw Error('PRINT_REVERSAL_ALREADY_EXISTS');
    entries.add(id);
    reversalEntries.push({
      id,date:correctionDate,createdAt:correctionDate+'T00:00:00.000Z',
      updatedAt:correctionDate+'T00:00:00.000Z',
      entryNumber:'VOID-PO-'+String(reversalEntries.length+1).padStart(4,'0'),
      description:'قيد عكسي لإلغاء عربون أمر طباعة غير حقيقي؛ مرجع القيد الأصلي '+s(j.entryNumber),
      referenceType:'print_order_void_reversal',
      referenceId:s(j.referenceId),
      reversesJournalId:s(j.id),
      items:[],payments:[],lines,
    });
  }
  const cents=unwanted.flatMap(j=>j.lines||[]).reduce((total,line)=>
    total+money(line.debit),0);
  const reverseCents=reversalEntries.flatMap(j=>j.lines).reduce((total,line)=>
    total+money(line.credit),0);
  if(cents!==reverseCents)throw Error('TOTAL_PRINT_REVERSALS_NOT_BALANCED');
  return {
    authorizedInvoiceCount:invoices.length,
    eligibleOrderCount:orphan.length,
    linkedOrderCount:accepted.size,
    orphanOrderIds:orphan.map(o=>o.id),
    reversalEntries,
    reversalCount:reversalEntries.length,
    debitMinorReversed:cents,
  };
}