import type {SyncCommand, EntityName, JsonObject} from './types';

type ChangeLike = {
  entity: EntityName;
  id: string;
  value: JsonObject | null;
  expectedVersion?: number;
};
export type AtomicCommandLike = {
  atomicInvoiceId?: string;
  changes: readonly ChangeLike[];
};

/**
 * New, complete POS posting. Only invoice creation qualifies; edits of a
 * committed invoice, non-atomic writes and mixed unrelated effects never do.
 */
export function isNewAtomicPosSale(command: AtomicCommandLike): boolean {
  if (!command.atomicInvoiceId || !command.changes.length) return false;
  const invoices = command.changes.filter(c => c.entity === 'invoices');
  if (invoices.length !== 1 || invoices[0].id !== command.atomicInvoiceId ||
      invoices[0].value?.isAccountingPosted !== true ||
      (invoices[0].expectedVersion !== undefined && invoices[0].expectedVersion !== 0)) return false;
  const allowed = new Set<EntityName>([
    'invoices', 'journalEntries', 'stockMovements', 'inventory', 'parties'
  ]);
  if (!command.changes.every(c => allowed.has(c.entity) && c.value !== null)) return false;
  if (!command.changes.some(c => c.entity === 'journalEntries')) return false;
  const keys = command.changes.map(c => c.entity + '\u001f' + c.id);
  return new Set(keys).size === keys.length;
}

/**
 * Two distinct NEW atomic sales can touch the same EXISTING item/customer.
 * The SQL posting engine applies each quantity/receivable delta to the
 * centrally locked current record. They may NOT share an invoice, journal,
 * movement or newly-created customer/item.
 */
export function canIndependentSaleBypassKey(
  previous: AtomicCommandLike,
  incoming: AtomicCommandLike,
  entity: EntityName,
  id: string,
  knownAuthoritativeVersion: number
): boolean {
  if (!isNewAtomicPosSale(previous) || !isNewAtomicPosSale(incoming) ||
      previous.atomicInvoiceId === incoming.atomicInvoiceId ||
      (entity !== 'inventory' && entity !== 'parties') ||
      !Number.isSafeInteger(knownAuthoritativeVersion) || knownAuthoritativeVersion < 1)
    return false;
  const older = previous.changes.find(c => c.entity === entity && c.id === id);
  const newer = incoming.changes.find(c => c.entity === entity && c.id === id);
  return !!older && !!newer && older.value !== null && newer.value !== null &&
    Number.isSafeInteger(older.expectedVersion) && (older.expectedVersion as number) >= 1 &&
    (newer.expectedVersion === undefined ||
      (Number.isSafeInteger(newer.expectedVersion) && newer.expectedVersion >= 1));
}

const REPAIRED_POS_FAILURES = new Set([
  'ATOMIC_POS_STOCK_METADATA_CHANGE_FORBIDDEN',
  'ATOMIC_POS_STOCK_DELTA_INCONSISTENT',
  'ATOMIC_POS_DEBTOR_METADATA_CHANGE_FORBIDDEN',
  'ATOMIC_POS_DEBTOR_DELTA_INCONSISTENT'
]);

/** A one-time retry of the SAME immutable command once the server explicitly
 * advertises the corrected atomic rebase feature; no guessed amounts, no
 * renumbering, no new command IDs or auto-retries for other financial failures.
 */
export function isRecoverableRejectedAtomicSale(
  command: SyncCommand,
  authoritativeInvoiceExists: boolean
): boolean {
  if (command.status !== 'rejected' || authoritativeInvoiceExists ||
      (command.autoRecoveryAttempts ?? 0) > 0 || !isNewAtomicPosSale(command))
    return false;
  const error = String(command.error || '').toUpperCase();
  return [...REPAIRED_POS_FAILURES].some(code => error.includes(code));
}
