import type {Invoice} from '../types';

type EditedPosLine = {
  inventoryItemId?:string;
  itemName:string;
  notes?:string;
  description?:string;
  quantity:number;
  unitPrice:number;
  discount?:number;
  tax?:number;
  hasDimensions?:boolean;
  attachments?:Array<{id?:string}>;
  unit?:string;
  length?:number;
  width?:number;
  count?:number;
};
const asText=(x:unknown)=>String(x??'');
const sameNumber=(a:unknown,b:unknown,tolerance=0.000001)=>
  Number.isFinite(Number(a??0))&&Number.isFinite(Number(b??0))&&
  Math.abs(Number(a??0)-Number(b??0))<=tolerance;

/**
 * Never reset an opened cashier editor unless the server-acknowledged invoice
 * contains the entered notes and changed line values. A successful HTTP
 * response containing an old/no-op invoice is not a successful edit.
 * Check only fields actually visible in the cashier's line editor.
 */
export function verifyPosEditReceipt(
  saved:Invoice,
  expectedInvoiceId:string,
  lines:readonly EditedPosLine[],
  invoiceNotes:string,
  paymentNotes:string,
  invoiceDate:string
):string|null{
  if(!saved||saved.id!==expectedInvoiceId)
    return 'INVOICE_ID_MISMATCH';
  if(!Array.isArray(saved.items)||saved.items.length!==lines.length)
    return 'INVOICE_ITEM_COUNT_MISMATCH';
  if(asText(saved.notes)!==asText(invoiceNotes))
    return 'INVOICE_NOTE_NOT_SAVED';
  if(asText(saved.paymentNotes)!==asText(paymentNotes))
    return 'INVOICE_PAYMENT_NOTE_NOT_SAVED';
  if(asText(saved.date)!==asText(invoiceDate))
    return 'INVOICE_DATE_NOT_SAVED';
  for(let i=0;i<lines.length;i++){
    const current=lines[i],stored=saved.items[i];
    if(!stored||!current)return 'INVOICE_ITEM_MISSING';
    if(current.inventoryItemId && stored.itemId!==current.inventoryItemId)
      return 'INVOICE_ITEM_ID_NOT_SAVED';
    if(asText(stored.itemName)!==asText(current.itemName))
      return 'INVOICE_ITEM_NAME_NOT_SAVED';
    if(asText(stored.notes)!==asText(current.notes))
      return 'INVOICE_ITEM_NOTE_NOT_SAVED';
    if(asText(stored.description)!==asText(current.description))
      return 'INVOICE_ITEM_DESCRIPTION_NOT_SAVED';
    if(!sameNumber(stored.quantity,current.quantity,0.00001))
      return 'INVOICE_ITEM_QUANTITY_NOT_SAVED';
    if(!sameNumber(stored.unitPrice,current.unitPrice,0.00001))
      return 'INVOICE_ITEM_PRICE_NOT_SAVED';
    if(!sameNumber(stored.discount,current.discount,0.00001))
      return 'INVOICE_ITEM_DISCOUNT_NOT_SAVED';
    if(stored.tax!=null&&current.tax!=null&&!sameNumber(stored.tax,current.tax,0.00001))
      return 'INVOICE_ITEM_TAX_NOT_SAVED';
    if(stored.hasDimensions!=null&&current.hasDimensions!=null&&
       Boolean(stored.hasDimensions)!==Boolean(current.hasDimensions))
      return 'INVOICE_ITEM_DIMENSION_MODE_NOT_SAVED';
    if(stored.length!=null&&current.length!=null&&
       !sameNumber(stored.length,current.length,0.00001))
      return 'INVOICE_ITEM_LENGTH_NOT_SAVED';
    if(stored.width!=null&&current.width!=null&&
       !sameNumber(stored.width,current.width,0.00001))
      return 'INVOICE_ITEM_WIDTH_NOT_SAVED';
    if(stored.count!=null&&current.count!=null&&
       !sameNumber(stored.count,current.count,0.00001))
      return 'INVOICE_ITEM_COUNT_NOT_SAVED';
    if(Array.isArray(current.attachments)){
      const expected=current.attachments.map(a=>String(a.id||''));
      const actual=(Array.isArray(stored.attachments)?stored.attachments:[])
        .map(a=>String(a.id||''));
      if(JSON.stringify(expected)!==JSON.stringify(actual))
        return 'INVOICE_ITEM_ATTACHMENTS_NOT_SAVED';
    }
    // Historical invoices can omit unit entirely; the cashier shows the
    // catalog's fallback unit without writing a new inventory denomination.
    // A persisted explicit unit, however, must match the displayed edit.
    if(current.unit && stored.unit!=null &&
       asText(stored.unit)!==asText(current.unit))
      return 'INVOICE_ITEM_UNIT_NOT_SAVED';
  }
  return null;
}
