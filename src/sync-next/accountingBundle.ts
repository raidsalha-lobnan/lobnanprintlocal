import type { ProposedChange } from './types';

export interface AtomicInvoicePosting {
  invoiceId: string;
  commandId: string;
  invoice: ProposedChange;
  journals: ProposedChange[];
  stockMovements: ProposedChange[];
  partyChanges: ProposedChange[];
  inventoryChanges: ProposedChange[];
}

/** A business posting must enter the durable outbox as ONE command.
 * Enqueue success only means local persistence; PostgreSQL ACK is separate.
 * This helper is deliberately opt-in until the POS create-sale flow is
 * refactored to build all effects BEFORE updating any React state.
 */
export function buildAtomicInvoicePosting(posting:AtomicInvoicePosting): ProposedChange[] {
  const {invoiceId, commandId, invoice,journals,stockMovements,partyChanges,inventoryChanges}=posting;
  if(!invoiceId || !commandId || invoice?.entity!=='invoices' || invoice.id!==invoiceId
    || !invoice.value || invoice.value.id!==invoiceId) {
    throw new Error('ATOMIC_INVOICE_IDENTITY_REQUIRED');
  }
  if(!Array.isArray(journals)||!Array.isArray(stockMovements)
    || !Array.isArray(partyChanges)||!Array.isArray(inventoryChanges))
    throw new Error('ATOMIC_INVOICE_BUNDLE_MISSING_EFFECTS');
  const changes=[invoice,...journals,...stockMovements,...partyChanges,...inventoryChanges];
  if(changes.length>80)throw new Error('ATOMIC_INVOICE_TOO_MANY_RECORDS');
  const seen=new Set<string>();
  for(const change of changes){
    if(!change.id || change.value===null || !change.value || typeof change.value!=='object')
      throw new Error('ATOMIC_INVOICE_RECORD_INVALID');
    const key=change.entity+'\x1f'+change.id;
    if(seen.has(key))throw new Error('ATOMIC_INVOICE_DUPLICATE_RECORD');
    seen.add(key);
    if(change.entity==='journalEntries' && change.value.referenceId!==invoiceId)
      throw new Error('ATOMIC_INVOICE_JOURNAL_REFERENCE_MISMATCH');
    if(change.entity==='stockMovements' && change.value.invoiceId &&
       change.value.invoiceId!==invoiceId)
      throw new Error('ATOMIC_INVOICE_STOCK_REFERENCE_MISMATCH');
  }
  const accountingEligible=(invoice.value as Record<string,unknown>).isAccountingPosted===true;
  if(accountingEligible && !journals.some(change=>change.entity==='journalEntries' &&
       change.value?.referenceType==='pos_invoice')) {
    throw new Error('ATOMIC_INVOICE_REVENUE_JOURNAL_REQUIRED');
  }
  if(journals.some(c=>c.entity!=='journalEntries') ||
     stockMovements.some(c=>c.entity!=='stockMovements') ||
     partyChanges.some(c=>c.entity!=='parties') ||
     inventoryChanges.some(c=>c.entity!=='inventory')) {
    throw new Error('ATOMIC_INVOICE_WRONG_EFFECT_ENTITY');
  }
  return changes;
}

export async function enqueueAtomicInvoicePosting(
  repo:{commit(changes:ProposedChange[],commandId?:string):Promise<string>},
  posting:AtomicInvoicePosting
):Promise<string>{
  const changes=buildAtomicInvoicePosting(posting);
  return repo.commit(changes,posting.commandId);
}
