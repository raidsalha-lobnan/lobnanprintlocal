import { LocalSyncDb, type SyncRecordRef } from './localDb';
import {compareQueueWithAuthoritativeRecords} from './queueDiagnostics';
import {compareDeviceQueueWithPostgresV2} from './deviceQueueReviewV2';
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

  subscribe(callback: (recordsChanged: boolean, keys?: readonly SyncRecordRef[]) => void): () => void {
    return this.local.subscribe(callback);
  }

  /** Targeted local reads; never fetches PostgreSQL or scans unrelated invoices. */
  async getVisibleByIds(keys: readonly SyncRecordRef[]): Promise<Record<string, LocalView|null>> {
    return this.local.listVisibleByKeys(keys);
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
    if(!remote||typeof remote.fetchAuthoritativeInvoiceRecord!=='function')
      throw new Error('POSTGRES_AUTHORITATIVE_INVOICE_LOOKUP_UNAVAILABLE');
    // Authoritative PostgreSQL row only; no multi-megabyte bootstrap.
    const record=await remote.fetchAuthoritativeInvoiceRecord(invoiceId);
    if(!record||record.entity!=='invoices'||record.id!==invoiceId||
       !record.value||!Number.isSafeInteger(record.version)||record.version<1)
      throw new Error('INVOICE_NOT_VISIBLE_IN_POSTGRES_SNAPSHOT');
    const pending=await this.local.pending();
    if(pending.some(cmd=>cmd.changes.some(change=>
      change.entity==='invoices'&&change.id===invoiceId)))
      throw new Error('INVOICE_HAS_PENDING_LOCAL_CHANGES_REVIEW_FIRST');
    return {id:invoiceId,value:record.value,version:record.version,pending:false};
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

  /** Read-only reconciliation: compare the actual browser outbox payload to
   * an authenticated PostgreSQL snapshot, without posting or clearing anything.
   */
  async inspectDeviceQueueV2ReadOnly() {
    const queue=await this.local.pending();
    const remote=(this.sync as any).remote;
    if(!remote||typeof remote.fetchAuthoritativeBootstrap!=='function')
      throw new Error('AUTHORITATIVE_POSTGRES_SNAPSHOT_UNAVAILABLE');
    const snapshot=await remote.fetchAuthoritativeBootstrap();
    if(!Array.isArray(snapshot.records))
      throw new Error('INVALID_AUTHORITATIVE_SNAPSHOT');
    return compareDeviceQueueWithPostgresV2(queue,snapshot.records);
  }

  getCoordinator() {
    return this.sync;
  }

  getLocalDb() {
    return this.local;
  }

  /**
   * A temporarily empty IndexedDB projection must not blank previously visible
   * financial invoices. Verify the complete authenticated PostgreSQL snapshot,
   * then repair only the local confirmed cache (never the offline outbox).
   * A genuinely empty server invoice collection remains authoritative.
   */
  async verifyUnexpectedEmptyInvoiceProjection(): Promise<'recovered' | 'verified-empty'> {
    const remote = (this.sync as any).remote;
    if (!remote || typeof remote.fetchAuthoritativeBootstrap !== 'function')
      throw new Error('AUTHORITATIVE_INVOICE_VERIFICATION_UNAVAILABLE');
    const snapshot = await remote.fetchAuthoritativeBootstrap();
    if (!Array.isArray(snapshot?.records) || !snapshot?.cursor)
      throw new Error('INVALID_AUTHORITATIVE_INVOICE_VERIFICATION');
    const localCursor = await this.local.cursor();
    const localSequence = localCursor?.sequence;
    const serverSequence = snapshot.cursor.sequence;
    if (Number.isSafeInteger(localSequence) &&
        (!Number.isSafeInteger(serverSequence) || serverSequence < localSequence!))
      throw new Error('STALE_AUTHORITATIVE_INVOICE_VERIFICATION');
    const confirmedInvoices = snapshot.records.filter((row: any) =>
      row.entity === 'invoices' && row.value !== null);
    if (!confirmedInvoices.length) return 'verified-empty';
    // Uses an atomic IndexedDB transaction, retains all pending/conflicted
    // commands, and emits one repository change after a successful repair.
    await this.local.refreshAuthoritativeSnapshot(snapshot.records, snapshot.cursor, ['invoices']);
    return 'recovered';
  }

  /** On-demand, read-only PostgreSQL comparison with a guarded local repair.
   * Never synthesizes missing employees, never posts archived browser rows, and
   * never overrides any ID with an unresolved local outbox command.
   */
  async checkEmployeeDirectory() {
    const remote = (this.sync as any).remote;
    if (!remote?.fetchAuthoritativeBootstrap)
      throw new Error('تعذرت قراءة سجل الموظفين المعتمد من PostgreSQL');
    const [before, operations] = await Promise.all([
      this.local.listVisibleGrouped(['employees']),
      this.local.pending()
    ]);
    const snapshot = await remote.fetchAuthoritativeBootstrap();
    if (!Array.isArray(snapshot?.records) || !snapshot.cursor)
      throw new Error('تعذرت قراءة سجل الموظفين من المركزي');
    const employees = (snapshot.records as import('./types').StoredRecord[]).filter(row =>
      row.entity === 'employees' && row.value !== null);
    const describe=(row:{id:string;value?:JsonObject|null})=>({
      id:row.id,
      code:String(row.value?.code||''),
      name:String(row.value?.name||'')
    });
    const centralIds=new Set(employees.map(row=>row.id));
    const localBefore=before.employees||[];
    const existingIds=new Set(localBefore.map(row=>row.id));
    const onlyOnDevice=localBefore.filter(row=>!centralIds.has(row.id)).map(describe);
    const initiallyMissing=employees.filter(row=>!existingIds.has(row.id)).map(describe);
    const recovered=await this.local.restoreMissingEmployees(employees,snapshot.cursor.sequence);
    const [after,audit]=await Promise.all([
      this.local.listVisibleGrouped(['employees']),
      this.local.employeeProjectionHistory()
    ]);
    const afterIds=new Set((after.employees||[]).map(row=>row.id));
    const stillMissing=employees.filter(row=>!afterIds.has(row.id)).map(describe);
    // Historical localStorage is NOT authority. Expose unmatched identifiers
    // only for operator-led recovery, without creating financial or HR records.
    let legacyOnly:Array<{id:string;code:string;name:string}>=[];
    try{
      if(typeof localStorage!=='undefined'){
        const legacy=JSON.parse(localStorage.getItem('alnoor_press_accounting_v1_employees')||'[]');
        if(Array.isArray(legacy))legacyOnly=legacy
          .filter(row=>row && typeof row.id==='string' && row.id &&
            !centralIds.has(row.id)&&!afterIds.has(row.id))
          .map(describe);
      }
    }catch{/* Local browser legacy storage is optional. */}
    const unresolved=operations.filter(cmd=>cmd.changes.some(change=>change.entity==='employees'))
      .map(cmd=>({
        commandId:cmd.id,status:cmd.status,
        people:cmd.changes.filter(change=>change.entity==='employees')
          .map(change=>describe(change))
      }));
    return {
      // IDs only, used to distinguish a verified PostgreSQL deletion from
      // an incomplete local employee list after a browser reload.
      centralIds:employees.map(row=>row.id),
      centralCount:employees.length,localCount:after.employees.length,
      added:recovered.added,updated:recovered.updated,
      initiallyMissing,stillMissing,onlyOnDevice,legacyOnly,unresolved,
      employeeProjectionHistory:audit
    };
  }

  async getCloudSnapshot(): Promise<Record<string, any[]>> {
    const remote = (this.sync as any).remote;
    if (remote && typeof remote.fetchCloudSnapshot === 'function') {
      return remote.fetchCloudSnapshot();
    }
    return {};
  }

  async getAllVisibleGrouped(onlyEntities?: readonly EntityName[]): Promise<Record<string, any[]>> {
    const supported: EntityName[] = onlyEntities ? [...new Set(onlyEntities)] : [
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
    // Exact IDs of old demo records permanently deleted from PostgreSQL.
    // A stale offline outbox must not make them visible as real payroll entries.
    const retiredDemo: Partial<Record<EntityName,string>> = {
      employeeAdvances:'adv-1',
      employeeDeductions:'ded-1',
      employeeIncentives:'inc-1'
    };
    return Object.fromEntries(supported.map(entity => [
      entity, (grouped[entity] ?? [])
        .filter(record => record.id!==retiredDemo[entity])
        .map(record => record.value).filter(Boolean)
    ]));
  }
}
