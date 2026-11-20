import type {EntityName,SyncCommand} from './types';

/** All business entities synced by the PostgreSQL event feed and durable outbox. */
export const SYNC_ENTITY_LABELS:Record<EntityName,string>={
  invoices:'فواتير المبيعات',
  parties:'العملاء والموردون والجهات',
  inventory:'الأصناف والمخزون',
  vouchers:'سندات القبض والصرف',
  purchases:'فواتير المشتريات',
  purchaseReturns:'مردودات المشتريات',
  salesReturns:'مردودات المبيعات',
  accounts:'الدليل المحاسبي',
  treasuries:'الصناديق والحسابات البنكية',
  treasuryTransactions:'حركات الصناديق',
  employees:'الموظفون',
  employeeAdvances:'سلف الموظفين',
  employeeDeductions:'خصومات الموظفين',
  employeeIncentives:'حوافز الموظفين',
  payrollSheets:'كشوف الرواتب',
  journalEntries:'قيود اليومية',
  expenses:'المصروفات',
  stockMovements:'حركات المخزون',
  printOrders:'أوامر الطباعة',
  debtClearings:'المقاصات المالية',
  companies:'الشركات',
  branches:'الفروع',
  warehouses:'المخازن',
  warehouseOperations:'عمليات المخازن',
  roles:'الأدوار والصلاحيات',
  users:'المستخدمون',
  dailyEntrySheets:'كشوف الإدخال اليومية',
  settings:'الإعدادات'
};

export interface EntitySyncCounts {
  entity:EntityName;
  label:string;
  pending:number;
  conflict:number;
  rejected:number;
  records:number;
}

/** A multi-record atomic command counts once per affected entity but retains its
 * financial bundle identity. Never split one command to send independent parts. */
export function summarizeEntityQueue(commands:readonly SyncCommand[]):EntitySyncCounts[]{
  const byEntity=new Map<EntityName,EntitySyncCounts>();
  for(const cmd of commands){
    const counts=new Map<EntityName,number>();
    for(const change of cmd.changes){
      counts.set(change.entity,(counts.get(change.entity)||0)+1);
    }
    for(const [entity,records] of counts){
      const row=byEntity.get(entity)||{entity,label:SYNC_ENTITY_LABELS[entity]||entity,
        pending:0,conflict:0,rejected:0,records:0};
      row[cmd.status]++;
      row.records+=records;
      byEntity.set(entity,row);
    }
  }
  return [...byEntity.values()].sort((a,b)=>
    (b.pending+b.conflict+b.rejected)-(a.pending+a.conflict+a.rejected)||
    a.label.localeCompare(b.label,'ar'));
}
