/**
 * Classify a POS edit as a true no-op before touching historical ledgers.
 * Compare every field the POS draft can edit, rather than JSON equality:
 * legacy rows may omit defaulted fields and the UI regenerates line IDs.
 * An actual change always proceeds through strict financial verification.
 */
const invoiceFields=['date','type','customerId','counterpartyType','counterpartyId',
 'employeeId','customerName','subtotal','discountTotal','taxRate','taxAmount',
 'totalAmount','baseTotalAmount','paidAmount','basePaidAmount','remainingAmount',
 'paymentMethod','status','notes','currency','currencySymbol','exchangeRate',
 'additionalCharges','warehouse','branchId','subCustomerId','cashPaidAmount',
 'bankPaidAmount','cashBaseAmount','bankBaseAmount',
 'cashTreasuryCode','bankTreasuryCode',
 'representative','paymentNotes','customCustomerText','subCustomerName',
 'subCustomerPhone','branch','workflowStatus','paymentStatus','deliveryDate'];
const lineFields=['itemId','itemName','quantity','unitPrice','total','discount','tax',
 'notes','description','unit','length','width','count','hasDimensions','barcode',
 'itemCode','category','taxRate','dimensions','unitCalculationType',
 'attachments','imageThumbnail'];
const zeroDefault=new Set(['discount','tax','taxRate','discountTotal','taxAmount',
 'additionalCharges','cashPaidAmount','bankPaidAmount',
 'cashBaseAmount','bankBaseAmount','paidAmount','basePaidAmount']);
const oneDefault=new Set(['length','width','count']);
const numberFields=new Set(['subtotal','discountTotal','taxRate','taxAmount',
 'totalAmount','baseTotalAmount','paidAmount','basePaidAmount','remainingAmount',
 'exchangeRate','additionalCharges','cashPaidAmount','bankPaidAmount',
 'cashBaseAmount','bankBaseAmount',
 'quantity','unitPrice','total','discount','tax','length','width','count']);
const equivalent=(a,b,key)=>{
 if(key==='hasDimensions')return Boolean(a)===Boolean(b);
 if(key==='currencySymbol')return (a||'₪')===(b||'₪');
 if(key==='currency')return (a==='₪'?'ILS':a)===(b==='₪'?'ILS':b)||
   ((a===undefined||a===null)&&(b==='ILS'||b==='₪'));
 if(key==='counterpartyType')return (a||'customer')===(b||'customer');
 if(numberFields.has(key)){
  if(zeroDefault.has(key)){
   a=a??0;b=b??0;
  }else if(oneDefault.has(key)){
   a=a??1;b=b??1;
  }
  if((a===undefined||a===null||a==='')&&(b===undefined||b===null||b===''))return true;
  return Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&
   Math.abs(Number(a)-Number(b))<0.0000001;
 }
 if(a===b)return true;
 if(a&&b&&typeof a==='object'&&typeof b==='object')
  return JSON.stringify(a)===JSON.stringify(b);
 // New POS form controls can supply empty strings for absent legacy fields.
 return (a===undefined||a===null||a==='')&&(b===undefined||b===null||b==='');
};
export function isUnchangedPosInvoice(original,proposed){
 if(!original||!proposed||original.id!==proposed.id||
  original.invoiceNumber!==proposed.invoiceNumber)return false;
 if(!invoiceFields.every(k=>{
   if(k==='counterpartyId')return equivalent(original[k]||original.customerId,
     proposed[k]||proposed.customerId,k);
   if(k==='counterpartyType'&&original.employeeId)
     return (original[k]||'employee')===(proposed[k]||'employee');
   if(k==='baseTotalAmount')return equivalent(original[k]??(
     Number(original.totalAmount)*Number(original.exchangeRate||1)),proposed[k]??(
     Number(proposed.totalAmount)*Number(proposed.exchangeRate||1)),k);
   if(k==='basePaidAmount')return equivalent(original[k]??(
     Number(original.paidAmount||0)*Number(original.exchangeRate||1)),proposed[k]??(
     Number(proposed.paidAmount||0)*Number(proposed.exchangeRate||1)),k);
   if(k==='remainingAmount')return equivalent(original[k]??(
     Number(original.totalAmount)-Number(original.paidAmount||0)),proposed[k]??(
     Number(proposed.totalAmount)-Number(proposed.paidAmount||0)),k);
   return equivalent(original[k],proposed[k],k);
  }))return false;
 if(!Array.isArray(original.items)||!Array.isArray(proposed.items)||
  original.items.length!==proposed.items.length)return false;
 return original.items.every((item,i)=>{
  const next=proposed.items[i];
  return item&&next&&lineFields.every(k=>equivalent(item[k],next[k],k));
 });
}

/**
 * Permit a real description-only amendment even when an unrelated historical
 * ledger needs reconciliation. Build the persisted value exclusively from
 * original authoritative data and explicitly permitted text fields.
 */
export function descriptionOnlyInvoiceAmendment(original,proposed){
 if(!original||!proposed||!Array.isArray(original.items)||
  !Array.isArray(proposed.items)||original.items.length!==proposed.items.length||
  !original.items.every(x=>x&&typeof x==='object')||
  !proposed.items.every(x=>x&&typeof x==='object'))
  return null;
 const safe={...original,items:original.items.map(x=>({...x}))};
 const candidate={...proposed,items:proposed.items.map(x=>({...x}))};
 let changed=false;
 for(const field of ['notes','representative','paymentNotes','customerName',
  'customCustomerText','subCustomerName','subCustomerPhone','branch',
  'workflowStatus','deliveryDate']){
  if(!equivalent(original[field],proposed[field],field)){
   safe[field]=proposed[field]??'';
   changed=true;
  }
  candidate[field]=original[field];
 }
 for(let i=0;i<safe.items.length;i++){
  for(const field of ['itemName','notes','description','attachments','imageThumbnail']){
   if(!equivalent(original.items[i][field],proposed.items[i][field],field)){
    safe.items[i][field]=proposed.items[i][field]??'';
    changed=true;
   }
   candidate.items[i][field]=original.items[i][field];
  }
 }
 return changed&&isUnchangedPosInvoice(original,candidate)?safe:null;
}
