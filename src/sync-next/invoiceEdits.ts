// The POS form is also used for editing an existing invoice. On the secure
// PostgreSQL path an edit MUST NOT run the new-sale posting routine again.
// This module permits presentation/description changes and refuses any
// accounting, payment, inventory, identity, numbering or branch changes.
const safeTop=new Set([
  'notes','representative','customerName','customCustomerText','userName',
  'paymentNotes','workflowStatus'
]);
const safeItem=new Set(['itemName','notes','description','imageThumbnail','attachments']);
function equal(a:unknown,b:unknown):boolean{
  if(a===b)return true;
  if(Array.isArray(a)||Array.isArray(b))
    return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>equal(x,b[i]));
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const ao=a as Record<string,unknown>,bo=b as Record<string,unknown>;
    return [...new Set([...Object.keys(ao),...Object.keys(bo)])].every(k=>equal(ao[k],bo[k]));
  }
  return false;
}
const normalizeItem=(item:Record<string,any>)=>{
  const result={...item};
  for(const field of safeItem)delete result[field];
  return result;
};
function correctionRequired(detail:string):never{
  throw new Error('POSTED_INVOICE_CORRECTION_REQUIRED: '+detail+
    '. يلزم إنشاء تسوية محاسبية موثقة لتغيير المبالغ أو الأصناف أو الدفعات؛ لم تُحفظ تعديلات مالية جديدة.');
}
export function prepareSecureInvoiceDescriptionEdit<T extends Record<string,any>>(
  oldInvoice:T,computed:T
):T{
  if(!oldInvoice?.id||!oldInvoice?.invoiceNumber)correctionRequired('الفاتورة الأصلية غير موجودة');
  if(oldInvoice.id!==computed.id||oldInvoice.invoiceNumber!==computed.invoiceNumber)
    correctionRequired('رقم الفاتورة ومعرّفها ثابتان');
  const itemsOld=oldInvoice.items,itemsNew=computed.items;
  if(!Array.isArray(itemsOld)||!Array.isArray(itemsNew)||itemsOld.length!==itemsNew.length)
    correctionRequired('عدد أصناف الفاتورة تغير');
  for(let i=0;i<itemsOld.length;i++){
    if(!equal(normalizeItem(itemsOld[i]),normalizeItem(itemsNew[i])))
      correctionRequired('معلومات كمية أو سعر أو ضريبة لأحد الأصناف تغيرت');
  }
  for(const [key,value] of Object.entries(computed)){
    if(key==='items'||safeTop.has(key)||key==='statusHistory'||key==='postedAt')continue;
    if(!equal(oldInvoice[key],value))
      correctionRequired('تغير الحقل المحاسبي '+key);
  }
  const updatedItems=itemsOld.map((previous,i)=>{
    const proposed=itemsNew[i];
    const next={...previous};
    for(const field of safeItem){
      if(Object.prototype.hasOwnProperty.call(proposed,field))
        next[field]=proposed[field];
    }
    return next;
  });
  const next:Record<string,any>={...oldInvoice,items:updatedItems};
  for(const field of safeTop){
    if(Object.prototype.hasOwnProperty.call(computed,field))
      next[field]=computed[field];
  }
  // Keep original accounting journal metadata and append-only history intact.
  // A new-sale initial audit log must not replace the official creation log.
  return next as T;
}
const transientTop=new Set(['isOfficial','tempInvoiceNumber','postedAt']);
const transientHistory=new Set(['id','createdAt','time']);
function normalizeHistory(history:unknown):unknown {
  if(!Array.isArray(history))return history;
  return history.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))return row;
    return Object.fromEntries(Object.entries(row).filter(([k])=>!transientHistory.has(k)));
  });
}
function normalizedComparable(record:Record<string,any>){
  return Object.fromEntries(Object.entries(record)
    .filter(([k])=>!transientTop.has(k))
    .map(([k,v])=>[k,k==='statusHistory'?normalizeHistory(v):v]));
}
/** Exact invoice re-submission that differs only in server-issued fields and
 * regenerated initial history timestamps, NOT a genuine business amendment.
 */
export function isRedundantRejectedInvoiceResubmit(server:Record<string,any>,local:Record<string,any>):boolean{
  if(!server||!local||server.isOfficial!==true)return false;
  if(server.id!==local.id||server.invoiceNumber!==local.invoiceNumber)return false;
  const sh=server.statusHistory,lh=local.statusHistory;
  if(!Array.isArray(sh)||!Array.isArray(lh)||sh.length!==lh.length)return false;
  return equal(normalizedComparable(server),normalizedComparable(local));
}
