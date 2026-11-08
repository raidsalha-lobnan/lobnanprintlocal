/** Portable, JSON-only wire format. All IDs refer to immutable record identities. */
export type EntityName =
  | 'invoices' | 'parties' | 'inventory' | 'vouchers' | 'purchases'
  | 'purchaseReturns' | 'salesReturns' | 'accounts' | 'treasuries'
  | 'treasuryTransactions' | 'employees' | 'employeeAdvances' | 'employeeDeductions'
  | 'employeeIncentives' | 'payrollSheets' | 'journalEntries'
  | 'expenses' | 'stockMovements' | 'printOrders' | 'debtClearings'
  | 'companies' | 'branches' | 'warehouses' | 'warehouseOperations'
  | 'roles' | 'users' | 'dailyEntrySheets' | 'settings';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ProposedChange {
  entity: EntityName;
  id: string;             // Immutable UUID; never invoiceNumber / accountCode
  value: JsonObject | null; // null means tombstone; NEVER hard delete finalized accounting records
}
export interface VersionedChange extends ProposedChange {
  expectedVersion: number; // optimistic concurrency: 0 for new record
}
export interface AppliedChange extends ProposedChange {
  version: number;          // authoritative version from transaction
}
export interface SyncCommand {
  id: string;               // stable idempotency ID, preserved across retries
  workspaceId: string;
  /** Opt-in all-or-nothing accounting bundle. Absent for legacy queued commands. */
  atomicInvoiceId?: string;
  changes: VersionedChange[];
  /** Local authoritative baseline for safe three-way merge; absent in old queues. */
  baseRecords?: (StoredRecord | null)[];
  createdAt: number;
  attempts: number;
  retryAt: number;
  status: 'pending' | 'conflict' | 'rejected';
  error?: string;
}
export interface StoredRecord {
  key: string;
  entity: EntityName;
  id: string;
  version: number;
  value: JsonObject | null;
}
/** Sequence is a gap-free server commit order on newly migrated workspaces.
 * Legacy timestamps remain readable solely during the compatibility migration. */
export interface ServerCursor { seconds: number; nanoseconds: number; eventId: string; sequence?: number }
export interface ServerEvent {
  commandId: string;
  changes: AppliedChange[];
  cursor: ServerCursor;
}
export interface CommitReceipt { commandId: string; changes: AppliedChange[] }
export interface LocalView { id: string; value: JsonObject | null; version: number; pending: boolean }

export class VersionConflict extends Error {
  readonly name = 'VersionConflict';
  constructor(
    public entity: EntityName,
    public recordId: string,
    public expectedVersion: number,
    public actualVersion: number,
  ) { super(`VERSION_CONFLICT ${entity}/${recordId} expected=${expectedVersion} actual=${actualVersion}`); }
}
export class PermanentSyncError extends Error { readonly name = 'PermanentSyncError'; }

export const recordKey = (entity: EntityName, id: string): string => `${entity}\u001f${id}`;
export function validateChanges(changes: ProposedChange[]): void {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 80) {
    throw new Error('Operation must contain between 1 and 80 changes');
  }
  const seen = new Set<string>();
  for (const c of changes) {
    if (!c || !c.entity || !c.id || /[/\u001f]/.test(c.id)) throw new Error('Invalid entity/id');
    const key = recordKey(c.entity, c.id);
    if (seen.has(key)) throw new Error(`Duplicate change within operation: ${key}`);
    seen.add(key);
    if (c.value !== null && (typeof c.value !== 'object' || Array.isArray(c.value))) {
      throw new Error('Record must be a plain object or null tombstone');
    }
    if (c.value && c.value.id != null && c.value.id !== c.id) {
      throw new Error(`Record ID mismatch: ${key}`);
    }
  }
  // Fail before local queueing if JSON is not valid / exceeds reasonable event size.
  const raw = JSON.stringify(changes);
  if (!raw || new TextEncoder().encode(raw).length > 700_000) {
    throw new Error('Operation too large for single Firestore event; split into independent transactions');
  }
  if (/"(?:NaN|Infinity)"/.test(raw)) { /* informative only: strings may legitimately use these names */ }
}
/** Normalize optional undefined fields rather than rejecting ordinary form objects. */
export function toJsonObject(value: JsonObject): JsonObject {
  const active = new WeakSet<object>();
  const walk = (input: unknown, inArray = false): JsonValue | undefined => {
    if (input === undefined) return inArray ? null : undefined;
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input as JsonValue;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new Error('Invalid non-finite number');
      return input;
    }
    if (typeof input !== 'object') throw new Error('Unsupported value in accounting record');
    if (active.has(input)) throw new Error('Circular reference in record');
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) {
      active.add(input);
      const result = input.map(v => walk(v, true) ?? null);
      active.delete(input);
      return result;
    }
    if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
      throw new Error('Only plain JSON records may be synchronized');
    }
    active.add(input);
    const out: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(input)) {
      const normalized = walk(child);
      if (normalized !== undefined) out[key] = normalized;
    }
    active.delete(input);
    return out;
  };
  const cleaned = walk(value);
  if (!cleaned || Array.isArray(cleaned) || typeof cleaned !== 'object') {
    throw new Error('Record must be a plain object');
  }
  return cleaned as JsonObject;
}

export function sleep(ms: number) { return new Promise<void>(resolve => setTimeout(resolve, ms)); }
