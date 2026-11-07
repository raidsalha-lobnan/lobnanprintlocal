import { LocalSyncDb } from './localDb';
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

  subscribe(callback: () => void): () => void {
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
    commandId?: string
  ): Promise<string> {
    const command = await this.local.enqueue(
      changes,
      commandId
    );

    this.sync.requestSync();

    // Returns LOCAL operation ID.
    // Cloud approval must be checked separately.
    return command.id;
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
      'treasuries', 'employees', 'journalEntries', 'expenses',
      'stockMovements', 'warehouseOperations', 'dailyEntrySheets',
      'companies', 'branches', 'warehouses', 'roles', 'users', 'settings'
    ];
    const result: Record<string, any[]> = {};
    for (const ent of supported) {
      const list = await this.local.listVisible(ent);
      result[ent] = list.map(r => r.value).filter(Boolean);
    }
    return result;
  }
}
