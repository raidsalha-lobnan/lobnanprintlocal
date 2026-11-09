import {minor,isDelivery} from './invoice-revision-ledger.mjs';
/**
 * Verify the intended invoice arithmetically before deriving any accounting
 * delta. Monetary values are always checked at the smallest currency unit.
 */
export function validateProposedInvoice(invoice,{original=null}={}){
 if(!Array.isArray(invoice.items)||invoice.items.length===0)
  throw new Error('REVISION_ITEMS_REQUIRED');
 const rate=Number(invoice.exchangeRate||1);
 if(!Number.isFinite(rate)||rate<=0)throw new Error('REVISION_INVALID_RATE');
 let gross=0,lineDiscount=0;
 for(const item of invoice.items){
  const qty=Number(item.quantity),price=Number(item.unitPrice),
   discount=minor(item.discount||0),tax=minor(item.tax||0);
  if(!item.itemId||!Number.isFinite(qty)||qty<=0||
     !Number.isFinite(price)||price<0||discount<0||tax<0)
   throw new Error('REVISION_INVALID_ITEM');
  const subtotal=minor(qty*price);
  if(discount>subtotal||minor(item.total)!==subtotal-discount+tax)
   throw new Error('REVISION_ITEM_TOTAL_MISMATCH:'+item.itemId);
  if(isDelivery(item)&&tax)throw new Error('REVISION_DELIVERY_TAXED');
  gross+=subtotal;
  lineDiscount+=discount;
 }
 const subtotal=minor(invoice.subtotal),discount=minor(invoice.discountTotal||0),
  tax=minor(invoice.taxAmount||0),additional=minor(invoice.additionalCharges||0),
  total=minor(invoice.totalAmount),paid=minor(invoice.paidAmount||0),
  remaining=minor(invoice.remainingAmount??(Number(invoice.totalAmount)-Number(invoice.paidAmount||0)));
 if(subtotal!==gross||discount<lineDiscount||discount>gross||tax<0||
    additional<0||subtotal-discount+tax+additional!==total||
    paid<0||paid>total||remaining!==total-paid)
  throw new Error('REVISION_TOTAL_OR_PAYMENT_MISMATCH');
 if(invoice.baseTotalAmount!==undefined&&
  Math.abs(minor(invoice.baseTotalAmount)-minor(Number(invoice.totalAmount)*rate))>1)
  throw new Error('REVISION_BASE_TOTAL_MISMATCH');
 if(invoice.basePaidAmount!==undefined){
  const base=minor(invoice.basePaidAmount);
  const roundedFromInvoice=minor(Number(invoice.paidAmount||0)*rate);
  const tolerance=Math.max(1,Math.ceil(rate/2));
  if(Math.abs(base-roundedFromInvoice)>tolerance){
   // Correcting the invoice FX rate never revalues cash already collected.
   // An unchanged historical receipt remains fixed in the base currency.
   const oldRate=Number(original?.exchangeRate||1);
   const rateChanged=!!original&&Math.abs(oldRate-rate)>0.0000001;
   const hasOriginalSplit=original.cashPaidAmount!==undefined||
    original.bankPaidAmount!==undefined;
   const splitMatches=hasOriginalSplit
    ?minor(original.cashPaidAmount||0)===minor(invoice.cashPaidAmount||0)&&
     minor(original.bankPaidAmount||0)===minor(invoice.bankPaidAmount||0)
    :minor(invoice.cashBaseAmount||0)+minor(invoice.bankBaseAmount||0)===base;
   const unchangedReceipt=rateChanged&&
    minor(original.basePaidAmount??Number(original.paidAmount||0)*oldRate)===base&&
    minor(original.paidAmount||0)===minor(invoice.paidAmount||0)&&
    splitMatches&&
    (original.cashTreasuryCode||'')===(invoice.cashTreasuryCode||'')&&
    (original.bankTreasuryCode||'')===(invoice.bankTreasuryCode||'');
   if(!unchangedReceipt)throw new Error('REVISION_BASE_PAYMENT_MISMATCH');
  }
  if(invoice.cashBaseAmount!==undefined||invoice.bankBaseAmount!==undefined){
   const split=minor(invoice.cashBaseAmount||0)+minor(invoice.bankBaseAmount||0);
   if(split!==base)throw new Error('REVISION_BASE_PAYMENT_SPLIT_MISMATCH');
  }
 }
}
