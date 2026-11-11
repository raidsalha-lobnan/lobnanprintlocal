// An official number identifies a posted invoice; it is not an immutable lock
// on notes and other non-financial descriptions. Monetary changes require
// separately audited reversal/adjustment, not an in-place record replacement.
const safeTopLevel=new Set([
  'notes','representative','customerName','customCustomerText','userName',
  'paymentNotes','statusHistory','workflowStatus','printStartedAt','printStartedBy',
  'printFinishedAt','printFinishedBy','deliveredAt','deliveredBy'
]);
const safeItemFields=new Set(['itemName','notes','description','imageThumbnail','attachments']);
const immutableServerFields=new Set(['isOfficial','tempInvoiceNumber','postedAt']);
function equal(a,b){
  if(a===b)return true;
  if(Array.isArray(a)||Array.isArray(b))
    return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>equal(x,b[i]));
  if(a && b && typeof a==='object'&&typeof b==='object'){
    const keys=new Set([...Object.keys(a),...Object.keys(b)]);
    return [...keys].every(k=>equal(a[k],b[k]));
  }
  return false;
}
function sameItemsExceptDescriptions(oldItems,newItems){
  if(!Array.isArray(oldItems)||!Array.isArray(newItems)||oldItems.length!==newItems.length)return false;
  return oldItems.every((old,i)=>{
    const next=newItems[i];
    if(!old||!next||typeof old!=='object'||typeof next!=='object')return false;
    const keys=new Set([...Object.keys(old),...Object.keys(next)]);
    return [...keys].every(k=>safeItemFields.has(k)||equal(old[k],next[k]));
  });
}
function appendOnlyHistory(oldHistory,newHistory){
  const prior=oldHistory??[];
  const next=newHistory??[];
  if(!Array.isArray(prior)||!Array.isArray(next)||next.length<prior.length)return false;
  return prior.every((row,i)=>equal(row,next[i]));
}
/** Never silently overwrite a posted amount, payment, inventory reference, tax,
 * customer identity or other accounting attributes. A posted-invoice text edit
 * can only change the allowlisted presentation/workflow fields.
 */
export function officialInvoiceAmendment(previous,proposed){
  if(!previous||(previous.isOfficial!==true&&previous.isAccountingPosted!==true))return {allowed:true};
  if(!proposed||typeof proposed!=='object'||Array.isArray(proposed))
    return {allowed:false,reason:'POSTED_INVOICE_CORRECTION_REQUIRED'};
  if(proposed.id!==previous.id||proposed.invoiceNumber!==previous.invoiceNumber)
    return {allowed:false,reason:'OFFICIAL_NUMBER_IMMUTABLE'};
  const keys=new Set([...Object.keys(previous),...Object.keys(proposed)]);
  for(const key of keys){
    if(immutableServerFields.has(key)){
      if(proposed[key]!==undefined && !equal(proposed[key],previous[key]))
        return {allowed:false,reason:'OFFICIAL_INVOICE_SYSTEM_FIELD_IMMUTABLE'};
      continue;
    }
    if(key==='items'){
      if(!sameItemsExceptDescriptions(previous.items,proposed.items))
        return {allowed:false,reason:'POSTED_INVOICE_CORRECTION_REQUIRED'};
      continue;
    }
    if(key==='statusHistory'){
      if(!appendOnlyHistory(previous.statusHistory,proposed.statusHistory))
        return {allowed:false,reason:'INVOICE_AUDIT_HISTORY_IMMUTABLE'};
      continue;
    }
    if(!safeTopLevel.has(key)&&!equal(previous[key],proposed[key]))
      return {allowed:false,reason:'POSTED_INVOICE_CORRECTION_REQUIRED'};
  }
  return {allowed:true};
}
export function preserveOfficialInvoiceFields(previous,proposed){
  if(!previous||(previous.isOfficial!==true&&previous.isAccountingPosted!==true))return proposed;
  const check=officialInvoiceAmendment(previous,proposed);
  if(!check.allowed){const err=new Error(check.reason);err.status=422;throw err;}
  return {...proposed,isOfficial:previous.isOfficial===true,
    ...(previous.tempInvoiceNumber!==undefined?{tempInvoiceNumber:previous.tempInvoiceNumber}:{}),
    ...(previous.postedAt!==undefined?{postedAt:previous.postedAt}:{})};
}
