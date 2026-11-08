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
 'bankPaidAmount','cashTreasuryCode','bankTreasuryCode'];
const lineFields=['itemId','itemName','quantity','unitPrice','total','discount','tax',
 'notes','description','unit','length','width','count','hasDimensions','barcode',
 'itemCode','category'];
const numberFields=new Set(['subtotal','discountTotal','taxRate','taxAmount',
 'totalAmount','baseTotalAmount','paidAmount','basePaidAmount','remainingAmount',
 'exchangeRate','additionalCharges','cashPaidAmount','bankPaidAmount',
 'quantity','unitPrice','total','discount','tax','length','width','count']);
const equivalent=(a,b,key)=>{
 if(numberFields.has(key)){
  if((a===undefined||a===null||a==='')&&(b===undefined||b===null||b===''))return true;
  return Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&
   Math.abs(Number(a)-Number(b))<0.0000001;
 }
 if(a===b)return true;
 // New POS form controls can supply empty strings for absent legacy fields.
 return (a===undefined||a===null||a==='')&&(b===undefined||b===null||b==='');
};
export function isUnchangedPosInvoice(original,proposed){
 if(!original||!proposed||original.id!==proposed.id||
  original.invoiceNumber!==proposed.invoiceNumber)return false;
 if(!invoiceFields.every(k=>equivalent(original[k],proposed[k],k)))return false;
 if(!Array.isArray(original.items)||!Array.isArray(proposed.items)||
  original.items.length!==proposed.items.length)return false;
 return original.items.every((item,i)=>{
  const next=proposed.items[i];
  return item&&next&&lineFields.every(k=>equivalent(item[k],next[k],k));
 });
}
