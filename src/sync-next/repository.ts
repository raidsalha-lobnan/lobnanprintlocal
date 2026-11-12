import { LocalSyncDb } from './localDb';
import {compareQueueWithAuthoritativeRecords} from './queueDiagnostics';
import { SyncCoordinator } from './coordinator';

import {
  EntityName,
  JsonObject,
  LocalView,
  ProposedChange
} from './types';

export class UnifiedRepository {
  constructor(
    private local: LocalSyncDb,
    private sync: SyncCoordinator
  ) {}

  subscribe(callback: (recordsChanged: boolean) => void): () => void {
    return this.local.subscribe(callback);
  }

  async all(entity: EntityName): Promise<LocalView[]> {
    return this.local.listVisible(entity);
  }

  async put(
    entity: EntityName,
    id: string,
    value: JsonObject
  ): Promise<string> {
    return this.commit([{ entity, id, value }]);
  }

  async tombstone(
    entity: EntityName,
    id: string
  ): Promise<string> {
    const financial = [
      'invoices',
      'purchases',
      'vouchers',
      'journalEntries',
      'stockMovements',
      'salesReturns',
      'purchaseReturns',
      'expenses'
    ];

    if (financial.includes(entity)) {
      throw new Error(
        'Financial records require reversal, not deletion'
      );
    }

    return this.commit([{
      entity,
      id,
      value: null
    }]);
  }

  async commit(
    changes: ProposedChange[],
    commandId?: string,
    atomicInvoiceId?: string
  ): Promise<string> {
    const command = await this.local.enqueue(
      changes,
      commandId,
      atomicInvoiceId
    );

    this.sync.requestSync();

    // Returns LOCAL operation ID.
    // Cloud approval must be checked separately.
    return command.id;
  }

  /**
   * A posted invoice MUST use PostgreSQL as its version baseline. Local IDB
   * can legitimately lag or be empty after a browser upgrade or a new device.
   * This only reads a server snapshot; it never modifies a financial record.
   */
  async getAuthoritativeInvoiceBaseline(invoiceId:string): Promise<LocalView> {
    if(!invoiceId)throw new Error('INVOICE_ID_REQUIRED');
    const remote=(this.sync as any).remote;
    if(!remote||typeof remote.fetchAuthoritativeBootstrap!=='function')
      throw new Error('POSTGRES_AUTHORITATIVE_SNAPSHOT_UNAVAILABLE');
    // Fetch before inspecting local outbox so no stale cache is trusted.
    const snapshot=await remote.fetchAuthoritativeBootstrap();
    if(!Array.isArray(snapshot.records))
      throw new Error('INVALID_POSTGRES_AUTHORITATIVE_SNAPSHOT');
    const matches=snapshot.records.filter((r: any)=>
      r.entity==='invoices'&&r.id===invoiceId&&r.value!==null);
    if(matches.length!==1||!Number.isSafeInteger(matches[0].version)||
       matches[0].version<1)
      throw new Error('INVOICE_NOT_VISIBLE_IN_POSTGRES_SNAPSHOT');
    const pending=await this.local.pending();
    if(pending.some(cmd=>cmd.changes.some(change=>
      change.entity==='invoices'&&change.id===invoiceId)))
      throw new Error('INVOICE_HAS_PENDING_LOCAL_CHANGES_REVIEW_FIRST');
    return {id:invoiceId,value:matches[0].value,
      version:matches[0].version,pending:false};
  }

  async getConflicts() {
    return this.local.getConflicts();
  }

  async retryCommand(commandId: string) {
    await this.local.retryCommand(commandId);
    this.sync.requestSync();
  }

  async autoResolveInvoiceConflict(commandId: string): Promise<string> {
    const newNum = await this.local.autoResolveInvoiceConflict(commandId);
    this.sync.requestSync();
    return newNum;
  }

  async clearAllConflicts(): Promise<void> {
    await (this.local as any).clearAllConflicts();
    this.sync.requestSync();
  }

  async discardCommand(commandId: string) {
    await this.local.discardCommand(commandId);
    this.sync.requestSync();
  }

  requestSync() {
    this.sync.requestSync();
  }

  /** Read-only comparison; does not retry, discard, merge, or publish data. */
  async inspectPendingAgainstServer() {
    const commands=await this.local.pending();
    const remote=(this.sync as any).remote;
    if(!remote||typeof remote.fetchAuthoritativeBootstrap!=='function')
      throw new Error('AUTHORITATIVE_POSTGRES_SNAPSHOT_UNAVAILABLE');
    const snapshot=await remote.fetchAuthoritativeBootstrap();
    return compareQueueWithAuthoritativeRecords(commands,snapshot.records);
  }

  getCoordinator() {
    return this.sync;
  }

  getLocalDb() {
    return this.local;
  }

  async getCloudSnapshot(): Promise<Record<string, any[]>> {
    const remote = (this.sync as any).remote;
    if (remote && typeof remote.fetchCloudSnapshot === 'function') {
      return remote.fetchCloudSnapshot();
    }
    return {};
  }

  async getAllVisibleGrouped(): Promise<Record<string, any[]>> {
    const supported: EntityName[] = [
      'invoices', 'parties', 'inventory', 'vouchers', 'printOrders',
      'purchases', 'purchaseReturns', 'salesReturns', 'accounts',
      'treasuries', 'treasuryTransactions', 'employees',
      'employeeAdvances', 'employeeDeductions', 'employeeIncentives',
      'payrollSheets', 'debtClearings', 'journalEntries', 'expenses',
      'stockMovements', 'warehouseOperations', 'dailyEntrySheets',
      'companies', 'branches', 'warehouses', 'roles', 'users', 'settings'
    ];
    // One consistent committed record/outbox snapshot across all screen entities.
    const grouped = await this.local.listVisibleGrouped(supported);
    return Object.fromEntries(supported.map(entity => [
      entity, (grouped[entity] ?? []).map(record => record.value).filter(Boolean)
    ]));
  }
}
