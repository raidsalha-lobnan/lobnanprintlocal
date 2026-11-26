import type {Invoice} from '../types';

/**
 * Prepare a description-only POS revision using the authenticated server
 * invoice as its sole financial baseline. The cashier form is reconstructed
 * from mutable catalog defaults; recomputing money for a notes edit can
 * silently change legacy tax, discount, payment or stock values.
 *
 * Return null if *any* financial, identity, settlement, date or location
 * field may have changed. Such edits must use the normal server-verified
 * financial revision transaction, never this text-only shortcut.
 */
type LineInput = {
  item: {id:string;sellingPrice?:number;unit?:string};
  itemName?:string;
  notes?:string;
  description?:string;
  attachments?:Invoice['items'][number]['attachments'];
  imageThumbnail?:string;
  quantity:number;
  unitPrice?:number;
  discount?:number;
  tax?:number;
  taxRate?:number;
  hasDimensions?:boolean;
  length?:number;
  width?:number;
  count?:number;
  unit?:string;
};
type PosEditOptions = {
  date?:string;
  editingInvoiceId?:string;
  invoiceNumber?:string;
  additionalCharges?:number;
  overallDiscount?:number;
  taxRate?:number;
  paidAmount?:number;
  customerId?:string;
  counterpartyType?:string;
  counterpartyId?:string;
  subCustomerId?:string;
  branchId?:string;
  branch?:string;
  warehouse?:string;
  currency?:string;
  exchangeRate?:number;
  cashPaidAmount?:number;
  bankPaidAmount?:number;
  cashCurrency?:string;bankCurrency?:string;
  cashExchangeRate?:number;bankExchangeRate?:number;
  cashTreasuryCode?:string;
  bankTreasuryCode?:string;
  treasuryAccountCode?:string;
  paymentNotes?:string;
  representative?:string;
  customCustomerText?:string;
  subCustomerName?:string;
  subCustomerPhone?:string;
  workflowStatus?:string;
};
const numberEquals=(a:unknown,b:unknown,fallback=0)=>
  Number.isFinite(Number(a??fallback))&&Number.isFinite(Number(b??fallback))&&
  Math.abs(Number(a??fallback)-Number(b??fallback))<0.000001;
const textEquals=(a:unknown,b:unknown)=>String(a??'')===String(b??'');
const currency=(value:unknown)=>value==='₪'||!value?'ILS':String(value);
const treasury=(value:unknown)=>value==='1101'?'CASH-1101':String(value??'');
const originalPayment=(original:Invoice,side:'cash'|'bank')=>{
  const stored=side==='cash'?original.cashPaidAmount:original.bankPaidAmount;
  if(stored!==undefined&&stored!==null)return Number(stored);
  if(side==='cash'&&original.paymentMethod==='cash')return Number(original.paidAmount||0);
  if(side==='bank'&&['card','bank_transfer'].includes(original.paymentMethod))
    return Number(original.paidAmount||0);
  return 0;
};

export function preparePosDescriptionOnlyEdit(
  original:Invoice,
  lines:readonly LineInput[],
  customerName:string,
  paymentMethod:string,
  customerId:string|undefined,
  invoiceNotes:string|undefined,
  options:PosEditOptions
):Invoice|null{
  if(!original?.id||!Array.isArray(original.items)||!options||
    options.editingInvoiceId!==original.id||
    (options.invoiceNumber&&options.invoiceNumber!==original.invoiceNumber)||
    lines.length!==original.items.length||
    !textEquals(options.date,original.date)||
    !textEquals(customerId,original.customerId)||
    !textEquals(paymentMethod,original.paymentMethod)||
    !textEquals(options.counterpartyType||'customer',original.counterpartyType||'customer')||
    !textEquals(options.counterpartyId||customerId,original.counterpartyId||original.customerId)||
    !textEquals(options.subCustomerId,original.subCustomerId)||
    !textEquals(options.warehouse,original.warehouse)||
    // A legacy invoice may have no branchId: the UI derives its current ID
    // from the unchanged branch name when opening the document.
    ((!textEquals(options.branchId,original.branchId)) &&
      (!!original.branchId || !textEquals(options.branch,original.branch)))||
    currency(options.currency)!==currency(original.currency)||
    !numberEquals(options.exchangeRate,original.exchangeRate,1)||
    !numberEquals(options.additionalCharges,original.additionalCharges)||
    !numberEquals(options.overallDiscount,original.discountTotal)||
    !numberEquals(options.taxRate,original.taxRate)||
    !numberEquals(options.paidAmount,original.paidAmount)||
    !numberEquals(options.cashPaidAmount,originalPayment(original,'cash'))||
    !numberEquals(options.bankPaidAmount,originalPayment(original,'bank')))
    return null;

  // Bank routing and actual cash movements are account-affecting. Ignore a
  // default UI treasury selector only when that payment leg is precisely zero.
  const cash=originalPayment(original,'cash');
  const bank=originalPayment(original,'bank');
  if((cash>0&&original.cashCurrency&&(!textEquals(options.cashCurrency,original.cashCurrency)||!numberEquals(options.cashExchangeRate,original.cashExchangeRate,1)))||
     (bank>0&&original.bankCurrency&&(!textEquals(options.bankCurrency,original.bankCurrency)||!numberEquals(options.bankExchangeRate,original.bankExchangeRate,1))))return null;
  if((cash>0&&treasury(options.cashTreasuryCode||'CASH-1101')!==
       treasury(original.cashTreasuryCode||original.treasuryAccountCode||'CASH-1101'))||
     (bank>0&&treasury(options.bankTreasuryCode)!==
       treasury(original.bankTreasuryCode||original.treasuryAccountCode))||
     ((cash>0||bank>0)&&treasury(options.treasuryAccountCode)!==
       treasury(original.treasuryAccountCode)))return null;

  const newItems:Invoice['items']=[];
  for(let i=0;i<original.items.length;i++){
    const old=original.items[i];
    const line=lines[i];
    if(!line||line.item?.id!==old.itemId||
      !numberEquals(line.quantity,old.quantity)||
      !numberEquals(line.unitPrice??line.item.sellingPrice,old.unitPrice)||
      !numberEquals(line.discount,old.discount)||
      !numberEquals(line.tax,old.tax)||
      !numberEquals(line.taxRate,old.taxRate)||
      !numberEquals(line.length,old.length)||
      !numberEquals(line.width,old.width)||
      !numberEquals(line.count,old.count,1)||
      Boolean(line.hasDimensions)!==Boolean(old.hasDimensions)||
      !textEquals(line.unit,old.unit||line.item?.unit))return null;
    newItems.push({
      ...old,
      itemName:line.itemName??old.itemName,
      notes:line.notes??old.notes,
      description:line.description??old.description,
      attachments:line.attachments??old.attachments,
      imageThumbnail:line.imageThumbnail??old.imageThumbnail
    });
  }
  // Preserve every authoritative monetary/ledger/stock field byte-for-byte.
  return {
    ...original,
    items:newItems,
    notes:invoiceNotes??original.notes,
    paymentNotes:options.paymentNotes??original.paymentNotes,
    representative:options.representative??original.representative,
    branch:options.branch??original.branch,
    customerName,
    customCustomerText:options.customCustomerText??original.customCustomerText,
    subCustomerName:options.subCustomerName??original.subCustomerName,
    subCustomerPhone:options.subCustomerPhone??original.subCustomerPhone,
    workflowStatus:(options.workflowStatus??original.workflowStatus) as Invoice['workflowStatus']
  };
}
