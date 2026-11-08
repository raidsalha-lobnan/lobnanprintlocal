/**
 * Business-facing stock ledger projection for invoice revisions.
 *
 * Corrective stock postings remain immutable in the accounting audit trail.
 * A correction is hidden from regular statements ONLY if the server explicitly
 * tags it as internal and connects it to an approved invoice revision.
 * Never infer correction identity from item name, timestamp or invoice number:
 * older production duplicates must remain visible until audited.
 */
export interface MovementProjectionRow {
  id:string;
  itemId:string;
  type:string;
  quantity:number;
  referenceNumber?:string;
  sourceInvoiceId?:string;
  internalCorrection?:boolean;
  correctionGroupId?:string;
  approvedRevision?:boolean;
}

export function projectBusinessStockMovements<T extends MovementProjectionRow>(
  rows:readonly T[]
):T[] {
  const validGroups = new Set<string>();
  for(const row of rows){
    if(row.internalCorrection && row.approvedRevision && row.correctionGroupId &&
      row.sourceInvoiceId) {
      validGroups.add(row.correctionGroupId);
    }
  }
  return rows.filter(row=>!(
    row.internalCorrection && row.approvedRevision && row.correctionGroupId &&
    validGroups.has(row.correctionGroupId)
  ));
}

/**
 * The displayed balance comes from the committed central inventory record,
 * never by replaying hidden correction steps (which are not a business event).
 */
export function committedStockBalance(stockQuantity:number):number{
  if(!Number.isFinite(stockQuantity))throw new Error('INVALID_COMMITTED_STOCK_BALANCE');
  return stockQuantity;
}
