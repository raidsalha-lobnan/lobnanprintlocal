import {InputError} from './sync-domain.mjs';

/**
 * Retired display-number-only stock issues and obsolete opening issues are
 * archived by a DBA migration as versioned null tombstones. A browser must
 * never recreate the same ID, even after downloading the latest version.
 *
 * Every NEW physical sale must have an immutable invoice identity, not just
 * a human-readable INV-#### or TEMP-#### reference that might be recycled.
 */
export function assertNoLegacyStockResurrection({entity,oldRecord,proposed,recordId,actualVersion}){
 if(entity!=='stockMovements')return;
 if(oldRecord && (oldRecord.value===null || oldRecord.value===undefined))
  throw new InputError('RETIRED_LEGACY_STOCK_MOVEMENT_IMMUTABLE',409,{recordId});
 if(actualVersion!==0 || proposed===null || proposed===undefined)return;
 if(proposed.type==='in_opening' || proposed.referenceType==='opening')
  throw new InputError('OPENING_STOCK_MOVEMENT_NOT_ALLOWED',409,{recordId});
 if(proposed.type==='out_sale'){
  const immutableId=String(proposed.sourceInvoiceId||proposed.referenceId||'').trim();
  if(!immutableId)
   throw new InputError('STOCK_SALE_REQUIRES_IMMUTABLE_INVOICE_ID',409,
    {recordId,referenceNumber:proposed.referenceNumber||null});
 }
}
