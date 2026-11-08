import {minor,isDelivery} from './invoice-revision-ledger.mjs';
/**
 * Verify the intended invoice arithmetically before deriving any accounting
 * delta. Monetary values are always checked at the smallest currency unit.
 */
export function validateProposedInvoice(invoice){
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
 if(invoice.basePaidAmount!==undefined&&
  Math.abs(minor(invoice.basePaidAmount)-minor(Number(invoice.paidAmount||0)*rate))>1)
  throw new Error('REVISION_BASE_PAYMENT_MISMATCH');
}
