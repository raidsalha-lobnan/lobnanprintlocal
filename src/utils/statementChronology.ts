/**
 * Ordering for customer/supplier financial statements.
 * The business date comes first; for same-day transactions use the immutable
 * original creation timestamp, then the officially assigned document sequence.
 * Never rely on random/UUID document IDs for chronological accounting order.
 */
export interface ChronologicalStatementTransaction {
  id: string;
  date: string;
  type: string;
  refNum: string;
  /** Original insertion time; NEVER updatedAt of an amended invoice. */
  createdAt?: string;
  /** A derived receipt generated for an invoice, not a separately posted voucher. */
  sourceInvoiceId?: string;
}

function documentSequence(value: string): {prefix:string; number:number}|null {
  const normalized=String(value||'').replace(/^(?:PAY-|DISB-)/,'');
  const match=normalized.match(/^(.+?)(\d+)$/);
  if (!match) return null;
  const parsed=Number(match[2]);
  if(!Number.isSafeInteger(parsed))return null;
  return {prefix:match[1],number:parsed};
}

function createdTime(value?:string):number|null {
  if (!value || !/\d{4}-\d\d-\d\dT/.test(value)) return null;
  const ts=Date.parse(value);
  return Number.isFinite(ts)?ts:null;
}

export function compareStatementChronology(
  a: ChronologicalStatementTransaction,
  b: ChronologicalStatementTransaction
):number {
  // A foundational opening balance is the balance *before* all customer
  // dealings. Its configured registration date is for audit display only;
  // it is never a reason to place it between invoices. Apply this rule
  // before comparing dates, so even a backdated invoice follows opening.
  if (a.type === 'opening' && b.type !== 'opening') return -1;
  if (b.type === 'opening' && a.type !== 'opening') return 1;

  const firstDate=String(a.date||'').slice(0,10);
  const secondDate=String(b.date||'').slice(0,10);
  const dated=firstDate.localeCompare(secondDate);
  if (dated) return dated;

  // A payment taken when the sale was recorded is always shown immediately
  // after its parent invoice when the two share the same business date.
  if (a.sourceInvoiceId && a.sourceInvoiceId === b.id) return 1;
  if (b.sourceInvoiceId && b.sourceInvoiceId === a.id) return -1;

  const aTime=createdTime(a.createdAt),bTime=createdTime(b.createdAt);
  if (aTime!==null && bTime!==null && aTime!==bTime) return aTime-bTime;

  const aSeq=documentSequence(a.refNum),bSeq=documentSequence(b.refNum);
  if (aSeq && bSeq && aSeq.prefix===bSeq.prefix && aSeq.number!==bSeq.number)
    return aSeq.number-bSeq.number;

  // If no original timestamps exist, a legacy invoice still has its immutable
  // official sequence. This also orders an embedded PAY-INV receipt with the
  // matching invoice rather than allowing its random ID to lead the day.
  if (aSeq && bSeq && aSeq.prefix===bSeq.prefix) {
    if (a.sourceInvoiceId===b.id) return 1;
    if (b.sourceInvoiceId===a.id) return -1;
    if (a.sourceInvoiceId && b.sourceInvoiceId===a.sourceInvoiceId)
      return a.id.localeCompare(b.id);
    if (a.sourceInvoiceId && !b.sourceInvoiceId) return 1;
    if (!a.sourceInvoiceId && b.sourceInvoiceId) return -1;
  }

  // Distinct legacy document classes may have no comparable creation order.
  // Keep the result deterministic without inventing a chronological time.
  const typeOrder=a.type.localeCompare(b.type);
  return typeOrder || a.refNum.localeCompare(b.refNum,'en',{numeric:true})
    || a.id.localeCompare(b.id);
}
