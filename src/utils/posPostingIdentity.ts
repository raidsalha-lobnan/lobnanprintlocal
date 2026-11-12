/**
 * Stable record identities for the financial effects of a single POS sale.
 *
 * React may re-run state updater callbacks in development and a browser may
 * retry an outbox command after a lost network ACK. Side effects with fresh
 * random IDs would look like separate journals or stock movements.
 *
 * Each sale has at most one revenue and one COGS journal, and one aggregated
 * stock movement per inventory item. Entity identity derives from its immutable
 * invoice reference, not from browser time, list length or a display name.
 */
function validPart(value:string, label:string):string {
  if (typeof value !== 'string' || !value.trim() || /[\/\u001f]/.test(value)) {
    throw new Error('INVALID_POS_EFFECT_'+label);
  }
  return value;
}

function checkedId(id:string):string {
  // Mirrors the PostgreSQL sync-domain validId limit.
  if (id.length>180) throw new Error('POS_EFFECT_ID_EXCEEDS_SERVER_LIMIT');
  return id;
}

export function stablePosJournalId(
  type:'pos_invoice'|'cogs',
  invoiceId:string
):string {
  const source=validPart(invoiceId,'INVOICE_ID');
  return checkedId('je-pos-'+type+'-'+source.length+'-'+source);
}

export function stablePosStockMovementFromSale(movement: {sourceInvoiceId?:string;referenceNumber?:string;itemId:string}):string {
  // The invoice UUID survives TEMP-to-official display number changes.
  return stablePosStockMovementId(
    movement.sourceInvoiceId || movement.referenceNumber || '',movement.itemId
  );
}

export function stablePosStockMovementId(
  immutableInvoiceId:string,
  itemId:string
):string {
  const reference=validPart(immutableInvoiceId,'INVOICE_ID');
  const item=validPart(itemId,'ITEM_ID');
  return checkedId('sm-pos-'+reference.length+'-'+reference+'-'+item.length+'-'+item);
}
