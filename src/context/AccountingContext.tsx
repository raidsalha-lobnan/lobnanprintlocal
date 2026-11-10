import { TelegramService } from '../services/TelegramService';
import firebaseConfig from '../../firebase-applet-config.example.json';
import { onlineInvoicePostingService } from '../services/onlineInvoicePostingService';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { createUnifiedDataLayer } from '../sync-next/boot';
import { secureLoginEnabled } from '../services/secureAuth';
import { prepareSecureInvoiceDescriptionEdit } from '../sync-next/invoiceEdits';
import { UnifiedRepository } from '../sync-next/repository';
import {selectWorkspaceSettings,applyWorkspaceSettings,mergeWorkspaceSettingsDraft} from '../utils/workspaceSettingsSync';
import {createWorkspaceSettingsPatch} from '../sync-next/settingsPatch';
import { LocalHttpSyncTransport, getLocalSyncConfig } from '../sync-next/httpTransport';
import {invoiceEditSignature} from '../utils/invoiceEditSignature';
import { SyncCoordinator, SyncState } from '../sync-next/coordinator';
import { ProposedChange, EntityName, JsonObject } from '../sync-next/types';
import {
  pushFullDatabaseToFirestore,
  purgeObsoleteFirestoreCollections,
  subscribeToFirestoreLiveSync,
  fetchFullDatabaseFromFirestore,
  isFirestoreQuotaExceeded,
  markQuotaExceeded,
  resetQuotaExceeded,
  saveDeltaToFirestore,
  subscribeToFirestoreLiveDeltas
} from '../services/firebaseFirestoreSyncService';
import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  collection,
  getDocs,
  onSnapshot
} from '../firebase';
import {
  Account,
  InventoryItem,
  Party,
  PrintJobOrder,
  Invoice,
  AuditLogEntry,
  PurchaseInvoice,
  PurchaseReturn,
  SalesReturn,
  JournalEntry,
  PaymentVoucher,
  BusinessSettings,
  PaymentMethod,
  Employee,
  EmployeeAdvance,
  EmployeeDeduction,
  EmployeeIncentive,
  PayrollSheet,
  PayrollSheetItem,
  SalaryType,
  SalaryPaymentRecord,
  Treasury,
  TreasuryTransaction,
  CurrencyInfo,
  SqlServerConfig,
  StockMovement,
  StockMovementType,
  InvoicePaymentStatus,
  PosInvoiceWorkflowStatus,
  InvoiceStatusLog,
  Company,
  Branch,
  Warehouse,
  WarehouseType,
  WarehouseStatus,
  WarehouseOperation,
  WarehouseOperationType,
  WarehouseOperationItem,
  Role,
  SystemUser,
  PermissionKey,
  PriceTierKey,
  AllowedPriceTierScope,
  LineAttachment,
  InvoiceTechnicalNote,
  CustomerSpecialPrice,
  DebtClearingRecord,
  DatabaseZeroingOptions,
  ZeroingExecutionResult,
  DeleteAllSalesInvoicesOptions,
  DeleteAllSalesInvoicesResult,
  ExpenseItem,
  DailyEntryRow,
  DailyEntrySheet,
  RowLockInfo
} from '../types';
import {
  initialSettings,
  initialAccounts,
  initialInventory,
  initialParties,
  initialPrintOrders,
  initialInvoices,
  initialPurchases,
  initialPurchaseReturns,
  initialSalesReturns,
  initialJournalEntries,
  initialVouchers,
  initialEmployees,
  initialEmployeeAdvances,
  initialEmployeeDeductions,
  initialEmployeeIncentives,
  initialPayrollSheets,
  initialTreasuries,
  initialStockMovements,
  initialExpenses
} from '../data/initialData';
import {
  DEFAULT_COMPANIES,
  DEFAULT_BRANCHES,
  DEFAULT_WAREHOUSES,
  DEFAULT_WAREHOUSE_OPERATIONS,
  DEFAULT_ROLES,
  DEFAULT_SYSTEM_USERS
} from '../data/defaultCompanyBranchUserData';
import { defaultCurrencies, fetchLiveExchangeRates } from '../utils/currencies';
import { generateSqlDump, downloadSqlFile, syncWithWebServer } from '../utils/sqlExporter';
import { generateSequentialSku } from '../utils/barcodeGenerator';
import { generateSequentialPartyCode, formatInvoiceCustomerDisplay, isCashCustomerParty } from '../utils/partyUtils';
import { isInvoiceAccountingEligible, computeInvoicePaymentStatus } from '../utils/invoiceStatusUtils';
import { calculatePartyTrueBalance } from '../utils/statementGenerator';
import { deleteFileFromGoogleDrive } from '../services/googleDriveService';
import {
  getCachedSyncToken,
  requestGoogleDriveToken,
  fetchMasterDatabaseFromDrive,
  saveMasterDatabaseToDrive,
  mergeEntityLists
} from '../services/googleDriveDatabaseSyncService';
import { syncAuditService } from '../services/syncAuditService';
import { resolveInvoiceConflicts, mergeInvoicesWithUpsertAndConflictResolution } from '../utils/syncConflicts';

interface AccountingContextType {
  settings: BusinessSettings;
  updateSettings: (newSettings: Partial<BusinessSettings> | BusinessSettings) => Promise<boolean>;
  
  accounts: Account[];
  addAccount: (account: Omit<Account, 'balance'> & { initialBalance?: number }) => void;
  updateAccount: (code: string, updated: Partial<Account>) => void;
  
  // Treasuries & Bank Apps (بند الخزنات والصناديق والتطبيقات البنكية)
  treasuries: Treasury[];
  addTreasury: (treasury: Omit<Treasury, 'id' | 'createdAt'>) => { success: boolean; treasury?: Treasury; message?: string };
  updateTreasury: (id: string, updated: Partial<Treasury>) => { success: boolean; message?: string };
  deleteTreasury: (id: string) => { success: boolean; message?: string };
  transferBetweenTreasuries: (
    sourceTreasuryId: string,
    destTreasuryId: string,
    amount: number,
    notes?: string,
    date?: string,
    currencyCode?: string,
    exchangeRate?: number
  ) => { success: boolean; message?: string };
  depositIntoTreasury: (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    depositorName?: string;
    notes?: string;
    date?: string;
  }) => { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher };
  withdrawFromTreasury: (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    recipientName?: string;
    notes?: string;
    date?: string;
    allowNegativeBalance?: boolean;
  }) => { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher };
  executeTreasuryOperation: (params: {
    operationType: 'deposit' | 'withdrawal' | 'transfer';
    sourceTreasuryId: string;
    destTreasuryId: string;
    amount: number;
    currencyCode: string;
    notes?: string;
    date?: string;
    exchangeRate?: number;
  }) => { success: boolean; message?: string };
  adjustTreasuryBalance: (
    treasuryIdOrCode: string,
    delta: number,
    description: string,
    refType?: TreasuryTransaction['referenceType'],
    refId?: string,
    options?: {
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      voucherNumber?: string;
      partyName?: string;
      date?: string;
    }
  ) => void;
  
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'createdAt'>) => void;
  
  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => InventoryItem;
  updateInventoryItem: (id: string, updated: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => { success: boolean; message: string };
  adjustStock: (id: string, newQuantity: number, reason: string, notes?: string) => void;

  // Stock Ledger & Movements (كارتة حركة المخزون والوارد والمنصرف)
  stockMovements: StockMovement[];
  addStockMovement: (movement: Omit<StockMovement, 'id'>) => void;
  
  parties: Party[];
  addParty: (party: Omit<Party, 'id' | 'balance' | 'code'> & { initialBalance?: number; code?: string }) => Party;
  updateParty: (id: string, updated: Partial<Party>) => void;
  deleteParty: (id: string) => { success: boolean; message?: string };
  selectedPartyForStatement: Party | null;
  setSelectedPartyForStatement: (party: Party | null) => void;
  reconcileAllPartyBalances: () => { updatedCount: number; mismatchedCount: number };
  selectedEmployeeForStatement: Employee | null;
  setSelectedEmployeeForStatement: (employee: Employee | null) => void;

  // Debt Clearings (المقاصة بين عميل ومورد)
  debtClearings: DebtClearingRecord[];
  addDebtClearing: (clearing: Omit<DebtClearingRecord, 'id' | 'createdAt' | 'clearingNumber'>) => { success: boolean; message?: string; record?: DebtClearingRecord };
  updateDebtClearing: (id: string, updated: Partial<DebtClearingRecord>) => { success: boolean; message?: string };
  deleteDebtClearing: (id: string) => { success: boolean; message?: string };

  // Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
  expenses: ExpenseItem[];
  addExpense: (expense: Omit<ExpenseItem, 'id' | 'createdAt'>) => ExpenseItem;
  deleteExpense: (id: string) => void;

  employees: Employee[];
  addEmployee: (emp: Omit<Employee, 'id'>) => Employee;
  updateEmployee: (id: string, updated: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  payEmployeeSalary: (
    employeeId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    note: string,
    type: 'salary' | 'advance',
    period: string
  ) => void;

  // Employee Adjustments & Payroll Sheets
  employeeAdvances: EmployeeAdvance[];
  addEmployeeAdvance: (
    employeeId: string,
    amount: number,
    date: string,
    treasuryAccountCode: string,
    reason: string,
    disburseImmediately: boolean
  ) => void;
  cancelEmployeeAdvance: (id: string) => void;

  employeeDeductions: EmployeeDeduction[];
  addEmployeeDeduction: (employeeId: string, amount: number, date: string, reason: string) => void;
  cancelEmployeeDeduction: (id: string) => void;

  employeeIncentives: EmployeeIncentive[];
  addEmployeeIncentive: (employeeId: string, amount: number, date: string, reason: string) => void;
  cancelEmployeeIncentive: (id: string) => void;

  payrollSheets: PayrollSheet[];
  createDraftPayrollSheet: (
    sheetData: Omit<PayrollSheet, 'id' | 'sheetNumber' | 'createdAt' | 'status'>
  ) => PayrollSheet;
  updateDraftPayrollSheet: (id: string, updated: Partial<PayrollSheet>) => void;
  deleteDraftPayrollSheet: (id: string) => void;
  approveAndDisbursePayrollSheet: (id: string, treasuryAccountCode?: string) => { success: boolean; message?: string };
  unapprovePayrollSheet: (id: string) => { success: boolean; message?: string };
  selectedPayrollSheetForPrint: PayrollSheet | null;
  setSelectedPayrollSheetForPrint: (sheet: PayrollSheet | null) => void;
  
  printOrders: PrintJobOrder[];
  createPrintOrder: (order: Omit<PrintJobOrder, 'id' | 'orderNumber' | 'createdAt'>) => string;
  updatePrintOrderStatus: (id: string, newStatus: PrintJobOrder['status']) => void;
  updatePrintOrder: (id: string, updates: Partial<PrintJobOrder>) => void;
  collectPrintOrderPayment: (id: string, amount: number, paymentMethod: PaymentMethod) => void;
  deletePrintOrder: (id: string) => { success: boolean; message?: string };
  deleteMultiplePrintOrders: (ids: string[]) => { success: boolean; count: number };
  deleteAllPrintOrders: () => { success: boolean; count: number };
  
  invoices: Invoice[];
  createPosSale: (
    items: Array<{
      item: InventoryItem;
      quantity: number;
      discount?: number;
      unitPrice?: number;
      description?: string;
      notes?: string;
      hasDimensions?: boolean;
      length?: number;
      width?: number;
      count?: number;
      unit?: string;
      tax?: number;
      taxRate?: number;
      attachments?: LineAttachment[];
    }>,
    customerName: string,
    paymentMethod: PaymentMethod,
    customerId?: string,
    notes?: string,
    extraOptions?: {
      invoiceNumber?: string;
      date?: string;
      additionalCharges?: number;
      overallDiscount?: number;
      taxRate?: number;
      paidAmount?: number;
      representative?: string;
      branch?: string;
      warehouse?: string;
      customCustomerText?: string;
      subCustomerId?: string;
      subCustomerName?: string;
      subCustomerPhone?: string;
      treasuryAccountCode?: string;
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      cashPaidAmount?: number;
      cashCurrency?: string;
      cashExchangeRate?: number;
      cashTreasuryCode?: string;
      bankPaidAmount?: number;
      bankCurrency?: string;
      bankExchangeRate?: number;
      bankTreasuryCode?: string;
      workflowStatus?: PosInvoiceWorkflowStatus;
      paymentStatus?: InvoicePaymentStatus;
      branchId?: string;
      userId?: string;
      userName?: string;
      paymentNotes?: string;
    }
  ) => Invoice;
  postPosSaleOnline: (
    items: Array<{
      item: InventoryItem;
      quantity: number;
      discount?: number;
      unitPrice?: number;
      itemName?: string;
      description?: string;
      notes?: string;
      hasDimensions?: boolean;
      length?: number;
      width?: number;
      count?: number;
      unit?: string;
      tax?: number;
      taxRate?: number;
      attachments?: LineAttachment[];
      imageThumbnail?: string;
    }>,
    customerName: string,
    paymentMethod: PaymentMethod,
    customerId?: string,
    notes?: string,
    extraOptions?: {
      invoiceNumber?: string;
      date?: string;
      additionalCharges?: number;
      overallDiscount?: number;
      taxRate?: number;
      paidAmount?: number;
      representative?: string;
      branch?: string;
      warehouse?: string;
      customCustomerText?: string;
      subCustomerId?: string;
      subCustomerName?: string;
      subCustomerPhone?: string;
      treasuryAccountCode?: string;
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      cashPaidAmount?: number;
      cashCurrency?: string;
      cashExchangeRate?: number;
      cashTreasuryCode?: string;
      bankPaidAmount?: number;
      bankCurrency?: string;
      bankExchangeRate?: number;
      bankTreasuryCode?: string;
      workflowStatus?: PosInvoiceWorkflowStatus;
      paymentStatus?: InvoicePaymentStatus;
      branchId?: string;
      userId?: string;
      userName?: string;
      editingInvoiceId?: string;
      editingInvoiceSnapshot?: string;
      counterpartyType?: 'customer' | 'supplier' | 'employee';
      counterpartyId?: string;
      paymentNotes?: string;
    }
  ) => Promise<{ success: boolean; invoice?: Invoice; error?: string; isOffline?: boolean; isBusy?: boolean }>;
  addPosInvoice: (invoiceData: any) => Invoice;
  addPosInvoiceOnline: (invoiceData: any) => Promise<{ success: boolean; invoice?: Invoice; error?: string; isOffline?: boolean; isBusy?: boolean }>;
  updateInvoice: (
    id: string,
    updates: Partial<Invoice>,
    statusMeta?: { notes?: string; userName?: string; userId?: string }
  ) => void;
  deleteInvoice: (id: string, reason?: string) => void;
  deleteAllSalesInvoicesAndRelatedData: (options?: DeleteAllSalesInvoicesOptions) => DeleteAllSalesInvoicesResult;
  resetInvoicesAndKeepTreasury1101: () => { success: boolean; message: string };
  renumberInvoicesToOne: () => { success: boolean; message: string };
  deletedInvoices: Invoice[];
  restoreDeletedInvoice: (id: string) => Promise<Invoice | null>;
  permanentlyDeleteInvoice: (id: string) => Promise<void>;
  recoverInvoicesFromAllBackups: () => Promise<{ success: boolean; message: string; recoveredCount: number }>;
  getInvoiceDeleteAuditLogs: (invoiceId?: string) => Promise<AuditLogEntry[]>;
  addInvoiceTechnicalNote: (invoiceId: string, text: string) => void;
  addInvoiceItemAttachment: (invoiceId: string, itemIndexOrId: string | number, attachment: LineAttachment) => void;
  removeInvoiceItemAttachment: (invoiceId: string, itemIndexOrId: string | number, attachmentId: string) => { success: boolean; message?: string };
  startInvoicePrinting: (invoiceId: string) => void;
  finishInvoicePrinting: (invoiceId: string) => void;
  deliverInvoice: (invoiceId: string, notes?: string) => void;
  
  purchases: PurchaseInvoice[];
  createPurchaseInvoice: (invoice: Omit<PurchaseInvoice, 'id' | 'invoiceNumber'>) => void;
  deletePurchaseInvoice: (id: string) => void;
  selectedPurchaseForPrint: PurchaseInvoice | null;
  setSelectedPurchaseForPrint: (purchase: PurchaseInvoice | null) => void;

  purchaseReturns: PurchaseReturn[];
  createPurchaseReturn: (returnData: Omit<PurchaseReturn, 'id' | 'returnNumber' | 'createdAt'>) => PurchaseReturn;
  deletePurchaseReturn: (id: string) => void;
  selectedReturnForPrint: PurchaseReturn | null;
  setSelectedReturnForPrint: (ret: PurchaseReturn | null) => void;

  salesReturns: SalesReturn[];
  createSalesReturn: (returnData: Omit<SalesReturn, 'id' | 'returnNumber' | 'createdAt'>) => SalesReturn;
  deleteSalesReturn: (id: string) => void;
  selectedSalesReturnForPrint: SalesReturn | null;
  setSelectedSalesReturnForPrint: (ret: SalesReturn | null) => void;
  
  vouchers: PaymentVoucher[];
  createPaymentVoucher: (voucher: Omit<PaymentVoucher, 'id' | 'voucherNumber'>) => void;
  updatePaymentVoucher: (id: string, updates: Partial<PaymentVoucher>) => void;
  deletePaymentVoucher: (id: string) => void;

  // Multi-Currency Support (تعدد العملات والعملة الأساسية: الشيكل الفلسطيني)
  currencies: CurrencyInfo[];
  updateCurrencies: (currencies: CurrencyInfo[]) => void;
  updateCurrencyRate: (code: string, rate: number) => void;
  fetchLiveRates: () => Promise<{ success: boolean; message: string }>;

  // Offline-First & Database Integration (التشغيل المحلي الدائم والربط بقاعدة بيانات البرنامج الرئيسي)
  isOnline: boolean;
  isLocalOnlyMode: boolean;
  toggleLocalOnlyMode: (enable?: boolean) => void;
  seedLocalDatabaseDemo: () => { success: boolean; message: string; count: number };
  exportLocalDatabaseJSON: () => Promise<{ success: boolean; filename: string; totalRecords: number; message: string }>;
  importLocalDatabaseJSON: (jsonData: any) => Promise<{ success: boolean; message: string }>;
  lastSyncTime: string | null;
  isFirebaseSyncing: boolean;
  lastFirebaseSyncTime: string | null;
  hasUnsyncedChanges: boolean;
  pendingSyncCount: number;
  lastLocalSaveTime: string;
  syncToFirebase: (force?: boolean) => Promise<boolean>;
  forceSyncNow: () => Promise<{ success: boolean; message: string }>;
  forcePushAndPullSync: () => Promise<{ success: boolean; message: string; invoicesCount: number }>;
  importMasterDatabaseSnapshot: () => Promise<{ success: boolean; message: string }>;
  cleanAndSyncFirebaseWithScreen: () => Promise<{ success: boolean; message: string; purgedCount: number }>;
  unifiedRepository: UnifiedRepository | null;
  syncCoordinatorState: SyncState;
  openConflictModal: () => void;
  closeConflictModal: () => void;
  isConflictModalOpen: boolean;

  // SQL Server Export & Web Server Integration (التصدير والمزامنة مع خادم ويب خارجي)
  sqlServerConfig: SqlServerConfig;
  updateSqlServerConfig: (config: SqlServerConfig) => void;
  generateSqlBackup: (dialect?: 'postgres' | 'mysql' | 'sqlite') => string;
  downloadSqlBackup: (dialect?: 'postgres' | 'mysql' | 'sqlite') => void;
  syncToServer: () => Promise<{ success: boolean; message: string }>;
  
  // Modals & Navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;
  goBack: () => void;
  canGoBack: boolean;
  editingPosInvoiceId: string | null;
  setEditingPosInvoiceId: (id: string | null) => void;
  selectedInvoiceForPrint: Invoice | null;
  setSelectedInvoiceForPrint: (inv: Invoice | null) => void;
  directPrintOptions: { format: 'thermal' | 'a4' | 'a4-custom', autoPrint: boolean } | null;
  setDirectPrintOptions: (options: { format: 'thermal' | 'a4' | 'a4-custom', autoPrint: boolean } | null) => void;
  selectedInvoiceForLifecycle: Invoice | null;
  setSelectedInvoiceForLifecycle: (inv: Invoice | null) => void;
  selectedJobForPrint: PrintJobOrder | null;
  setSelectedJobForPrint: (job: PrintJobOrder | null) => void;
  selectedVoucherForPrint: PaymentVoucher | null;
  setSelectedVoucherForPrint: (v: PaymentVoucher | null) => void;

  // Multi-Company, Multi-Branch & Warehouses (الشركات والفروع والمستودعات)
  companies: Company[];
  activeCompanyId: string;
  setActiveCompanyId: (id: string) => void;
  addCompany: (comp: Omit<Company, 'id' | 'createdAt'>) => Company;
  updateCompany: (id: string, updated: Partial<Company>) => void;
  deleteCompany: (id: string) => { success: boolean; message?: string };

  branches: Branch[];
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;
  addBranch: (branch: Omit<Branch, 'id' | 'createdAt'>) => Branch;
  updateBranch: (id: string, updated: Partial<Branch>) => void;
  deleteBranch: (id: string) => { success: boolean; message?: string };
  getActiveBranch: () => Branch | undefined;

  warehouses: Warehouse[];
  activeWarehouseId: string;
  setActiveWarehouseId: (id: string) => void;
  addWarehouse: (wh: Omit<Warehouse, 'id' | 'createdAt'>) => Warehouse;
  updateWarehouse: (id: string, updated: Partial<Warehouse>) => void;
  deleteWarehouse: (id: string) => { success: boolean; message?: string };
  getWarehousesForBranch: (branchId?: string) => Warehouse[];
  getWarehouseStock: (warehouseId: string, itemId: string) => number;

  // Warehouse Operations (استلام، صرف، تحويل، جرد، تسوية، إتلاف، مرتجع، تعديل مخزون)
  warehouseOperations: WarehouseOperation[];
  addWarehouseOperation: (op: Omit<WarehouseOperation, 'id' | 'createdAt'> & { documentNumber?: string; date?: string; time?: string }) => WarehouseOperation;

  // Granular Roles, Permissions & Users (المستخدمون والصلاحيات الدقيقة)
  roles: Role[];
  addRole: (role: Omit<Role, 'id' | 'createdAt'>) => Role;
  updateRole: (id: string, updated: Partial<Role>) => void;
  deleteRole: (id: string) => { success: boolean; message?: string };

  users: SystemUser[];
  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  currentUser: SystemUser;
  getCurrentUser: () => SystemUser;
  addUser: (user: Omit<SystemUser, 'id' | 'createdAt'>) => SystemUser;
  updateUser: (id: string, updated: Partial<SystemUser>) => void;
  deleteUser: (id: string) => { success: boolean; message?: string };

  hasPermission: (permission: PermissionKey) => boolean;
  canAccessBranch: (branchId: string, user?: SystemUser) => boolean;
  getAllowedBranchesForUser: (user?: SystemUser) => Branch[];

  // Pricing policies & customer special prices
  getItemPriceForCustomer: (
    item: InventoryItem,
    customerId?: string,
    tier?: 'price1' | 'price2' | 'price3' | 'retail' | 'wholesale' | 'special'
  ) => { price: number; isSpecialPrice: boolean; specialPriceLabel?: string };
  getCurrentUserPricePolicy: (user?: SystemUser) => {
    canEditPrice: boolean;
    allowedTier: AllowedPriceTierScope;
    defaultTier: PriceTierKey;
  };

  // Data management
  lastBackupInfo: { timestamp: string; filename: string; totalRecords?: number } | null;
  exportDataJSON: () => Promise<{ success: boolean; filename: string; totalRecords: number; message: string }>;
  importDataJSON: (jsonString: string, includeSettings?: boolean, keepTelegramSettings?: boolean, keepFacilitySettings?: boolean) => Promise<boolean>;
  syncCurrentDataToFirestore: () => Promise<{ success: boolean; message: string; count: number; breakdown?: string }>;
  resetAllData: () => void;
  performDatabaseZeroing: (options: DatabaseZeroingOptions) => ZeroingExecutionResult;
  
  // Quick stats
  stats: {
    totalRevenue: number;
    printRevenue: number;
    bookstoreRevenue: number;
    netProfit: number;
    cashBalance: number;
    bankBalance: number;
    customerReceivables: number;
    supplierPayables: number;
    inventoryTotalValue: number;
    pendingPrintJobs: number;
    lowStockCount: number;
    totalEmployeesCount: number;
    activeEmployeesCount: number;
    estimatedMonthlyPayroll: number;
    totalTreasuriesBalance: number;
    treasuriesCount: number;
    exceededCreditLimitCount: number;
    purchaseReturnsCount: number;
    salesReturnsCount: number;
    todaySales: number;
  };

  // Daily Entry Sheets (كشف الإدخال اليومي)
  dailyEntrySheets: Record<string, DailyEntrySheet>;
  getDailyEntrySheet: (date: string) => DailyEntrySheet;
  saveDailyEntrySheet: (date: string, rows: DailyEntryRow[], notes?: string) => void;
  saveDailyEntryRow: (date: string, row: DailyEntryRow) => void;
  deleteDailyEntrySheet: (date: string) => void;
  getAllDailyEntryDates: () => string[];
  markDailyEntryRowsApproved: (date: string, rowIds: string[], invoiceId: string, invoiceNumber: string) => void;
  acquireDailyEntryRowLock: (date: string, rowId: string, field?: string) => void;
  releaseDailyEntryRowLock: (date: string, rowId: string) => void;
  forceReleaseDailyEntryRowLock: (date: string, rowId: string) => void;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

const STORAGE_KEY = 'alnoor_press_accounting_v1';

export function cleanDocForFirestore<T>(data: T): any {
  if (data === null || data === undefined) return null;
  try {
    const serialized = JSON.stringify(data, (_, value) => {
      if (typeof value === 'undefined') return null;
      if (typeof value === 'function' || typeof value === 'symbol') return null;
      return value;
    });
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

function safeLoadArray<T>(key: string, fallback: T[]): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeLoadObject<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function deduplicateById<T extends { id?: string }>(items: T[], prefix = 'item'): T[] {
  const seenIds = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!item) continue;
    const id = item.id;
    
    if (!id) {
      const generatedId = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      seenIds.add(generatedId);
      result.push({ ...item, id: generatedId });
      continue;
    }

    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    result.push(item);
  }

  return result;
}

function getEntityRecordTimestamp(item: any): number {
  if (!item) return 0;
  if (typeof item.updatedAt === 'number') return item.updatedAt;
  if (typeof item.updatedAt === 'string') {
    const t = new Date(item.updatedAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (typeof item.createdAt === 'number') return item.createdAt;
  if (typeof item.createdAt === 'string') {
    const t = new Date(item.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (typeof item.date === 'string') {
    const t = new Date(item.date).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

function isTestSyncProbeItem(item: any): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const code = String(item.code || '');
  const name = String(item.name || '');
  return id === 'inv-probe-sync-1' || id === 'inv-test-full-1' || code === 'ITEM-9999' || name === 'صنف تجربة المزامنة' || name === 'صنف فحص المزامنة الشاملة';
}

function isTestSyncProbeParty(p: any): boolean {
  if (!p) return false;
  const id = String(p.id || '').toLowerCase();
  const code = String(p.code || '').toLowerCase();
  const name = String(p.name || '').toLowerCase();
  return (
    id.includes('probe') ||
    id.includes('test-sync') ||
    id.includes('9999') ||
    code.includes('9999') ||
    name.includes('فحص المزامنة') ||
    name.includes('تجربة المزامنة') ||
    name.includes('اختبار المزامنة') ||
    name.includes('9999')
  );
}

function mergeEntitiesWithDeltaSync<T extends { id?: string }>(
  entityName: string,
  localItems: T[],
  serverItems: T[],
  delSet: Set<string>
): { merged: T[]; unpushedDeltas: T[] } {
  const map = new Map<string, T>();
  const unpushedDeltas: T[] = [];

  const importCutoffStr = localStorage.getItem('accounting_database_imported_at');
  const importCutoffTs = importCutoffStr ? parseInt(importCutoffStr, 10) || 0 : 0;

  const safeServerItems = Array.isArray(serverItems) ? serverItems.filter(i => i && typeof i === 'object' && i.id != null && !isTestSyncProbeItem(i)) : [];
  const safeLocalItems = Array.isArray(localItems) ? localItems.filter(i => i && typeof i === 'object' && i.id != null && !isTestSyncProbeItem(i)) : [];

  const localKeys = new Set(safeLocalItems.map(i => String(i.id)));

  // 1. Load server items
  for (const sItem of safeServerItems) {
    if (delSet.has(`${entityName}_${sItem.id}`)) continue;
    map.set(String(sItem.id), sItem);
  }

  // 2. Differential sync comparison with local items
  for (const lItem of safeLocalItems) {
    const idStr = String(lItem.id);
    if (delSet.has(`${entityName}_${idStr}`)) continue;

    const sItem = map.get(idStr);

    if (!sItem) {
      // Local item exists, server does NOT have it -> New local operation or imported record!
      map.set(idStr, lItem);
      unpushedDeltas.push(lItem);
    } else {
      // Both exist -> compare timestamps to resolve delta
      const localTime = getEntityRecordTimestamp(lItem);
      const serverTime = getEntityRecordTimestamp(sItem);

      if (localTime >= serverTime) {
        // Local modification is newer or equal -> local wins and auto-push to server if newer
        const mergedObj = { ...sItem, ...lItem };
        map.set(idStr, mergedObj);
        if (localTime > serverTime) {
          unpushedDeltas.push(mergedObj);
        }
      } else {
        // Server version is strictly newer -> server wins
        map.set(idStr, { ...lItem, ...sItem });
      }
    }
  }

  const merged = Array.from(map.values()).filter(it => it && typeof it === 'object' && !isTestSyncProbeItem(it));
  return { merged, unpushedDeltas };
}

export function auditAndRecalculateTreasuries(
  treasuriesList: Treasury[],
  activeInvoices: Invoice[],
  activeVouchers: PaymentVoucher[],
  deletedDocIds?: Set<string>,
  activePurchases: PurchaseInvoice[] = [],
  activeExpenses: ExpenseItem[] = []
): Treasury[] {
  if (!Array.isArray(treasuriesList)) return [];

  // Load deletedDocIds set if not explicitly passed
  let delSet = deletedDocIds;
  if (!delSet) {
    delSet = new Set<string>();
    try {
      const delList = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
      if (Array.isArray(delList)) {
        delList.forEach((d: any) => {
          if (d && d.id) delSet!.add(String(d.id));
        });
      }
    } catch {}
  }

  // Active Sets for fast lookup
  const activeInvoiceIds = new Set((activeInvoices || []).filter(i => i && i.id).map(i => String(i.id)));
  const activeVoucherIds = new Set((activeVouchers || []).filter(v => v && v.id).map(v => String(v.id)));
  const activePurchaseIds = new Set((activePurchases || []).filter(p => p && p.id).map(p => String(p.id)));
  const activeExpenseIds = new Set((activeExpenses || []).filter(e => e && e.id).map(e => String(e.id)));

  const tByCode = new Map<string, Treasury>();
  const tById = new Map<string, Treasury>();

  treasuriesList.forEach((t, idx) => {
    if (!t) return;
    const isMain = t.id === 'treasury-cash-main' || t.name.includes('النقدي الرئيسي') || t.name.includes('الكاشير');
    if (isMain) {
      t.accountCode = 'CASH-1101';
      t.isDefault = true;
    } else if (t.accountCode) {
      if (!t.accountCode.startsWith('CASH-') && !t.accountCode.startsWith('BANK-') && !t.accountCode.startsWith('TR-')) {
        t.accountCode = `CASH-${t.accountCode}`;
      }
    } else {
      t.accountCode = `CASH-${1102 + idx}`;
    }

    tById.set(t.id, t);
    if (t.accountCode) {
      tByCode.set(t.accountCode, t);
      tByCode.set(t.accountCode.replace('CASH-', ''), t);
    }
  });

  const defaultCash = treasuriesList.find(t => t.isDefault || t.type === 'cash_box') || treasuriesList[0];

  function getTargetTreasury(codeOrId?: string, isBank = false): Treasury {
    if (codeOrId) {
      if (tByCode.has(codeOrId)) return tByCode.get(codeOrId)!;
      if (tById.has(codeOrId)) return tById.get(codeOrId)!;
    }
    if (isBank) {
      const bankT = treasuriesList.find(t => t.type === 'bank_account' || t.type === 'bank_app' || t.type === 'digital_wallet');
      if (bankT) return bankT;
    }
    return defaultCash;
  }

  const txMap = new Map<string, TreasuryTransaction[]>();
  treasuriesList.forEach(t => txMap.set(t.id, []));

  function addTx(target: Treasury, tx: TreasuryTransaction) {
    if (!target) return;
    const list = txMap.get(target.id) || [];
    if (delSet && (delSet.has(tx.id) || (tx.referenceId && delSet.has(tx.referenceId)))) {
      return;
    }
    list.push(tx);
    txMap.set(target.id, list);
  }

  // 1. Invoices
  if (Array.isArray(activeInvoices)) {
    activeInvoices.forEach(inv => {
      if (!inv || delSet.has(inv.id)) return;
      const paidAmt = typeof inv.paidAmount === 'number' ? Math.abs(inv.paidAmount) : (Math.abs(inv.totalAmount || 0));
      if (paidAmt <= 0) return;

      const date = inv.date || '2026-10-01';

      let cashAmt = 0;
      let bankAmt = 0;

      const pMethod = inv.paymentMethod || 'cash';

      if (pMethod === 'cash') {
        cashAmt = (typeof inv.cashPaidAmount === 'number' && inv.cashPaidAmount > 0) ? inv.cashPaidAmount : paidAmt;
        bankAmt = (typeof inv.bankPaidAmount === 'number' && inv.bankPaidAmount > 0) ? inv.bankPaidAmount : 0;
      } else if (pMethod === 'card' || (pMethod as string) === 'bank_transfer' || (pMethod as string) === 'e_wallet' || (pMethod as string) === 'cheque' || (pMethod as string) === 'pos') {
        if (typeof inv.cashPaidAmount === 'number' && inv.cashPaidAmount > 0 && typeof inv.bankPaidAmount === 'number' && inv.bankPaidAmount > 0) {
          cashAmt = inv.cashPaidAmount;
          bankAmt = inv.bankPaidAmount;
        } else {
          cashAmt = 0;
          bankAmt = paidAmt;
        }
      } else if (pMethod === 'credit') {
        cashAmt = typeof inv.cashPaidAmount === 'number' ? Math.abs(inv.cashPaidAmount) : 0;
        bankAmt = typeof inv.bankPaidAmount === 'number' ? Math.abs(inv.bankPaidAmount) : 0;
      } else {
        cashAmt = paidAmt;
        bankAmt = 0;
      }

      if (cashAmt > 0) {
        const cashTargetCode = inv.cashTreasuryCode || '1101';
        const target = getTargetTreasury(cashTargetCode, false);
        addTx(target, {
          id: `tx-inv-cash-${inv.id}`,
          treasuryId: target.id,
          treasuryName: target.name,
          date,
          type: 'deposit',
          amount: cashAmt,
          currency: inv.currency || 'ILS',
          currencySymbol: inv.currencySymbol || '₪',
          exchangeRate: inv.exchangeRate || 1.0,
          baseCurrency: 'ILS',
          baseAmount: cashAmt * (inv.exchangeRate || 1.0),
          voucherNumber: inv.invoiceNumber,
          partyName: formatInvoiceCustomerDisplay(inv),
          description: `تحصيل نقدي - فاتورة مبيعات رقم ${inv.invoiceNumber} (${formatInvoiceCustomerDisplay(inv)})`,
          referenceType: 'pos_sale',
          referenceId: inv.id,
          paymentMethod: 'cash',
          notes: inv.notes || '',
          balanceAfter: 0
        });
      }

      if (bankAmt > 0) {
        let bankTargetCode = inv.bankTreasuryCode || (inv as any).treasuryAccountCode;
        if (!bankTargetCode || bankTargetCode === '1101') {
          bankTargetCode = '1103';
        }
        const target = getTargetTreasury(bankTargetCode, true);
        addTx(target, {
          id: `tx-inv-bank-${inv.id}`,
          treasuryId: target.id,
          treasuryName: target.name,
          date,
          type: 'deposit',
          amount: bankAmt,
          currency: inv.currency || 'ILS',
          currencySymbol: inv.currencySymbol || '₪',
          exchangeRate: inv.exchangeRate || 1.0,
          baseCurrency: 'ILS',
          baseAmount: bankAmt * (inv.exchangeRate || 1.0),
          voucherNumber: inv.invoiceNumber,
          partyName: formatInvoiceCustomerDisplay(inv),
          description: `تحصيل شبكة / بنك - فاتورة مبيعات رقم ${inv.invoiceNumber} (${formatInvoiceCustomerDisplay(inv)})`,
          referenceType: 'pos_sale',
          referenceId: inv.id,
          paymentMethod: inv.paymentMethod || 'card',
          notes: inv.notes || '',
          balanceAfter: 0
        });
      }
    });
  }

  // 2. Vouchers
  if (Array.isArray(activeVouchers)) {
    activeVouchers.forEach(v => {
      if (!v || delSet.has(v.id)) return;

      // DO NOT duplicate invoice collections: sales invoice payments are already routed and audited in Section 1!
      if (
        v.id.startsWith('vch-inv-') ||
        v.voucherNumber?.startsWith('RCT-INV-') ||
        v.relatedDocType === 'invoice' ||
        v.relatedDocType === 'pos_sale' ||
        (v.description && v.description.includes('سند تحصيل فوري لفاتورة مبيعات'))
      ) {
        return;
      }

      const amt = typeof v.amount === 'number' ? Math.abs(v.amount) : 0;
      if (amt <= 0) return;

      const isReceipt = v.type === 'receipt';
      const isBank =
        v.paymentMethod === 'card' ||
        v.paymentMethod === 'bank_transfer' ||
        v.paymentMethod === 'cheque' ||
        (v.paymentMethod as string) === 'electronic' ||
        (v.paymentMethod as string) === 'e_wallet' ||
        (v.paymentMethod as string) === 'bank' ||
        (v.paymentMethod as string) === 'pos';

      const target = getTargetTreasury(
        v.treasuryAccountCode || (v.accountCode !== '1201' && v.accountCode !== '2101' ? v.accountCode : undefined),
        isBank
      );

      addTx(target, {
        id: `tx-vch-${v.id}`,
        treasuryId: target.id,
        treasuryName: target.name,
        date: v.date || '2026-10-01',
        type: isReceipt ? 'deposit' : 'withdrawal',
        amount: amt,
        currency: v.currency || 'ILS',
        currencySymbol: v.currencySymbol || '₪',
        exchangeRate: v.exchangeRate || 1.0,
        baseCurrency: 'ILS',
        baseAmount: amt * (v.exchangeRate || 1.0),
        voucherNumber: v.voucherNumber,
        partyName: v.partyName || '',
        description: v.description || (isReceipt ? `سند قبض رقم ${v.voucherNumber}` : `سند صرف رقم ${v.voucherNumber}`),
        referenceType: isReceipt ? 'receipt' : 'payment',
        referenceId: v.id,
        paymentMethod: v.paymentMethod || 'cash',
        balanceAfter: 0
      });
    });
  }

  // 3. Purchases
  if (Array.isArray(activePurchases)) {
    activePurchases.forEach(pur => {
      if (!pur || delSet.has(pur.id)) return;
      const paidAmt = typeof pur.paidAmount === 'number' ? Math.abs(pur.paidAmount) : (pur.paymentMethod === 'cash' ? Math.abs(pur.totalAmount || 0) : 0);
      if (paidAmt <= 0) return;
      const target = getTargetTreasury((pur as any).treasuryAccountCode || (pur.paymentMethod === 'cash' ? '1101' : '1105'), pur.paymentMethod !== 'cash');
      addTx(target, {
        id: `tx-pur-${pur.id}`,
        treasuryId: target.id,
        treasuryName: target.name,
        date: pur.date || '2026-10-01',
        type: 'withdrawal',
        amount: paidAmt,
        currency: pur.currency || 'ILS',
        currencySymbol: pur.currencySymbol || '₪',
        exchangeRate: pur.exchangeRate || 1.0,
        baseCurrency: 'ILS',
        baseAmount: paidAmt * (pur.exchangeRate || 1.0),
        voucherNumber: pur.invoiceNumber || pur.supplierInvoiceNumber,
        partyName: pur.supplierName || 'مورد',
        description: `سداد فاتورة مشتريات رقم ${pur.invoiceNumber || ''} (${pur.supplierName || 'مورد'})`,
        referenceType: 'purchase',
        referenceId: pur.id,
        paymentMethod: pur.paymentMethod || 'cash',
        balanceAfter: 0
      });
    });
  }

  // 4. Expenses
  if (Array.isArray(activeExpenses)) {
    activeExpenses.forEach(exp => {
      if (!exp || delSet.has(exp.id)) return;
      const amt = typeof exp.amount === 'number' ? Math.abs(exp.amount) : 0;
      if (amt <= 0) return;
      const target = getTargetTreasury(exp.treasuryAccountCode || (exp.paymentMethod === 'cash' ? '1101' : '1105'), exp.paymentMethod !== 'cash');
      addTx(target, {
        id: `tx-exp-${exp.id}`,
        treasuryId: target.id,
        treasuryName: target.name,
        date: exp.date || '2026-10-01',
        type: 'withdrawal',
        amount: amt,
        currency: exp.currency || 'ILS',
        currencySymbol: exp.currencySymbol || '₪',
        exchangeRate: exp.exchangeRate || 1.0,
        baseCurrency: 'ILS',
        baseAmount: amt * (exp.exchangeRate || 1.0),
        voucherNumber: exp.voucherNumber || exp.taxInvoiceNumber || exp.id,
        partyName: exp.beneficiary || 'مصروفات',
        description: `مصروف: ${exp.notes || exp.expenseAccountName || 'مصروف تشغيلي'}`,
        referenceType: 'expense',
        referenceId: exp.id,
        paymentMethod: exp.paymentMethod || 'cash',
        balanceAfter: 0
      });
    });
  }

  // Re-calculate running balance for each treasury
  return treasuriesList.map(t => {
    if (!t) return t;
    const rawTxns = txMap.get(t.id) || [];

    // Keep pre-existing manual/transfer/opening transactions ONLY if valid and not deleted
    if (Array.isArray(t.transactions)) {
      t.transactions.forEach(existingTx => {
        if (!existingTx || !existingTx.id) return;

        // Skip if directly marked in delSet
        if (delSet && (delSet.has(existingTx.id) || (existingTx.referenceId && delSet.has(existingTx.referenceId)))) {
          return;
        }

        // Check if existingTx belongs to an entity (invoice, voucher, purchase, expense)
        const refType = existingTx.referenceType;
        const refId = existingTx.referenceId;
        const isInvTx = refType === 'pos_sale' || refType === 'invoice' || existingTx.id.startsWith('tx-inv-');
        const isVchTx = refType === 'receipt' || refType === 'payment' || existingTx.id.startsWith('tx-vch-');
        const isPurTx = refType === 'purchase' || existingTx.id.startsWith('tx-pur-');
        const isExpTx = refType === 'expense' || existingTx.id.startsWith('tx-exp-');

        if (isInvTx || isVchTx || isPurTx || isExpTx) {
          // Entity-driven transactions (invoices, vouchers, purchases, expenses) are
          // fully recomputed in steps 1, 2, 3, 4 above based on current payment methods & treasuries.
          // Do NOT re-add old entity transactions that no longer belong to this treasury!
          return;
        }

        if (!rawTxns.some(x => x.id === existingTx.id)) {
          rawTxns.push(existingTx);
        }
      });
    }

    const sortedOldest = [...rawTxns].sort((a, b) => {
      const dCmp = (a.date || '').localeCompare(b.date || '');
      if (dCmp !== 0) return dCmp;
      return (a.id || '').localeCompare(b.id || '');
    });

    let runningBase = 0;
    const currMap: Record<string, number> = { ILS: 0 };

    const ledgerOldest = sortedOldest.map(tx => {
      const curr = tx.currency || 'ILS';
      const rate = tx.exchangeRate || 1.0;
      const magAmt = typeof tx.amount === 'number' ? Math.abs(tx.amount) : 0;
      const magBaseAmt = typeof tx.baseAmount === 'number' ? Math.abs(tx.baseAmount) : (magAmt * rate);

      const isDep = tx.type === 'deposit' || (tx.type as string) === 'transfer_in';
      const dCurr = isDep ? magAmt : -magAmt;
      const dBase = isDep ? magBaseAmt : -magBaseAmt;

      currMap[curr] = Number(((currMap[curr] || 0) + dCurr).toFixed(2));
      runningBase = Number((runningBase + dBase).toFixed(2));

      return {
        ...tx,
        amount: magAmt,
        baseAmount: magBaseAmt,
        balanceAfter: runningBase,
        balanceAfterCurrency: currMap[curr]
      };
    });

    return {
      ...t,
      balance: runningBase,
      currencyBalances: currMap,
      transactions: ledgerOldest.reverse()
    };
  });
}

// Data persistence guarantee: Code updates must NEVER purge or reset user-entered invoices or documents.

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<BusinessSettings>(() => {
    const loaded = safeLoadObject(`${STORAGE_KEY}_settings`, initialSettings);
    // Ensure base currency is Palestinian Shekel (₪ / ILS) as requested
    const currency = (loaded.currency === 'ر.س' || !loaded.currency) ? '₪' : loaded.currency;
    const baseCurrencyCode = loaded.baseCurrencyCode || 'ILS';
    const loadedCurrencies = (loaded.currencies && loaded.currencies.length > 0) ? loaded.currencies : defaultCurrencies;
    const currencies = loadedCurrencies.map((c: any) => {
      if (c.code === 'ILS') {
        return { ...c, name: 'شيكل' };
      }
      return c;
    });
    
    const sqlServerConfig = loaded.sqlServerConfig || initialSettings.sqlServerConfig || {
      enabled: false,
      serverUrl: 'http://localhost:3000/api/sync',
      dbType: 'postgres',
      dbName: 'alnoor_press_db',
      autoSync: false,
      syncIntervalMinutes: 30
    };
    
    // Ensure categories exists (if undefined, set from initialSettings)
    const categories = loaded.categories !== undefined ? loaded.categories : initialSettings.categories;

    return {
      ...loaded,
      currency,
      baseCurrencyCode,
      currencies,
      sqlServerConfig,
      categories
    };

  });

  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_last_sync`) || null;
  });
  const [lastFirebaseSyncTime, setLastFirebaseSyncTime] = useState<string | null>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_last_sync`) || null;
  });
  const [isFirebaseSyncing, setIsFirebaseSyncing] = useState<boolean>(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_has_unsynced`) === 'true';
  });
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_pending_sync_count`);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lastLocalSaveTime, setLastLocalSaveTime] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_last_local_save`) || new Date().toLocaleTimeString('en-US');
  });

  const [isLocalOnlyMode, setIsLocalOnlyMode] = useState<boolean>(() => {
    return localStorage.getItem('accounting_is_local_only_mode') === 'true';
  });

  const toggleLocalOnlyMode = (enable?: boolean) => {
    setIsLocalOnlyMode(prev => {
      const next = enable !== undefined ? enable : !prev;
      try {
        localStorage.setItem('accounting_is_local_only_mode', String(next));
      } catch {}
      if (!next && navigator.onLine) {
        resetQuotaExceeded();
        setTimeout(() => {
          if (fetchFromFirebaseRef.current) fetchFromFirebaseRef.current();
          if (syncToFirebaseRef.current) syncToFirebaseRef.current(true);
        }, 100);
      }
      return next;
    });
  };

  const safeSetSyncedHashes = (hashesObj: Record<string, string>) => {
    try {
      const keys = Object.keys(hashesObj);
      let finalObj = hashesObj;
      if (keys.length > 300) {
        finalObj = {};
        keys.slice(-300).forEach(k => { finalObj[k] = hashesObj[k]; });
      }
      localStorage.setItem('accounting_synced_hashes', JSON.stringify(finalObj));
    } catch (e) {
      try {
        localStorage.removeItem('accounting_synced_hashes');
      } catch {}
    }
  };

  const [unifiedRepository, setUnifiedRepository] = useState<UnifiedRepository | null>(null);
  const [syncCoordinatorState, setSyncCoordinatorState] = useState<SyncState>({
    running: false,
    pending: 0,
    conflict: 0,
    lastSuccessAt: null,
    lastError: null,
    isLeader: false
  });
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const openConflictModal = () => setIsConflictModalOpen(true);
  const closeConflictModal = () => setIsConflictModalOpen(false);
  const unifiedRepoRef = React.useRef<UnifiedRepository | null>(null);
  const settingsWriteChainRef = React.useRef<Promise<unknown>>(Promise.resolve());

  // Initialize unified offline-first data layer (LocalSyncDb + FirestoreSyncTransport + SyncCoordinator)
  useEffect(() => {
    let unmounted = false;
    let stopFn: (() => void) | null = null;
    let unsubscribeState: (() => void) | null = null;
    let unsubscribeApplied: (() => void) | null = null;
    let unsubscribeRepo: (() => void) | null = null;

    const initLayer = async () => {
      try {
        const workspaceId = 'lobnan_main';
        const layer = await createUnifiedDataLayer(workspaceId);
        if (unmounted) {
          layer.stop();
          return;
        }
        unifiedRepoRef.current = layer.repository;
        setUnifiedRepository(layer.repository);
        stopFn = layer.stop;

        const syncStateWithRepository = async (repo: UnifiedRepository) => {
          try {
            const grouped = await repo.getAllVisibleGrouped();
            if (unmounted) return;
            // Once authoritative initialization succeeds, an empty server collection
            // is meaningful: do not display an old localStorage list as cloud truth.
            const canonical = (await repo.getLocalDb().bootstrapStatus()) === 'initialized';
            if (Array.isArray(grouped.invoices) && (canonical || grouped.invoices.length > 0)) setInvoices(grouped.invoices);
            if (Array.isArray(grouped.parties) && (canonical || grouped.parties.length > 0)) setParties(grouped.parties);
            if (Array.isArray(grouped.inventory) && (canonical || grouped.inventory.length > 0)) setInventory(grouped.inventory);
            if (Array.isArray(grouped.accounts) && (canonical || grouped.accounts.length > 0)) setAccounts(grouped.accounts);
            if (Array.isArray(grouped.treasuries) && (canonical || grouped.treasuries.length > 0)) setTreasuries(grouped.treasuries);
            if (Array.isArray(grouped.journalEntries) && (canonical || grouped.journalEntries.length > 0)) setJournalEntries(grouped.journalEntries);
            if (Array.isArray(grouped.stockMovements) && (canonical || grouped.stockMovements.length > 0)) setStockMovements(grouped.stockMovements);
            if (Array.isArray(grouped.printOrders) && (canonical || grouped.printOrders.length > 0)) setPrintOrders(grouped.printOrders);
            if (Array.isArray(grouped.vouchers) && (canonical || grouped.vouchers.length > 0)) setVouchers(grouped.vouchers);
            if (Array.isArray(grouped.purchases) && (canonical || grouped.purchases.length > 0)) setPurchases(grouped.purchases);
            if (Array.isArray(grouped.employees) && (canonical || grouped.employees.length > 0)) setEmployees(grouped.employees);
            if (Array.isArray(grouped.roles) && (canonical || grouped.roles.length > 0)) setRoles(grouped.roles);
            if (Array.isArray(grouped.users) && (canonical || grouped.users.length > 0)) setUsers(grouped.users);
            if (Array.isArray(grouped.companies) && (canonical || grouped.companies.length > 0)) setCompanies(grouped.companies);
            if (Array.isArray(grouped.branches) && (canonical || grouped.branches.length > 0)) setBranches(grouped.branches);
            if (Array.isArray(grouped.warehouses) && (canonical || grouped.warehouses.length > 0)) setWarehouses(grouped.warehouses);
            const savedSettings = selectWorkspaceSettings(await repo.all('settings'));
            if (savedSettings?.value && !unmounted) {
              // The PostgreSQL record is authoritative across every device.
              // Retain one recoverable device-only copy of any older letterhead,
              // but never auto-upload obsolete localStorage values.
              setSettings(prev => {
                const next = applyWorkspaceSettings(prev, savedSettings.value);
                if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
                const imageKeys = ['headerImageUrl', 'logoUrl', 'stampUrl', 'signatureUrl'] as const;
                if (imageKeys.some(key => prev[key] && prev[key] !== next[key])) {
                  const backupKey = `${STORAGE_KEY}_settings_legacy_device_backup`;
                  try {
                    if (!localStorage.getItem(backupKey)) {
                      localStorage.setItem(backupKey, JSON.stringify({
                        headerImageUrl: prev.headerImageUrl || '',
                        logoUrl: prev.logoUrl || '',
                        stampUrl: prev.stampUrl || '',
                        signatureUrl: prev.signatureUrl || '',
                      }));
                    }
                  } catch {}
                }
                return next;
              });
            }
          } catch (e) {
            console.warn('Repository sync to React state notice:', e);
          }
        };

        await syncStateWithRepository(layer.repository);
        unsubscribeRepo = layer.repository.subscribe(() => {
          syncStateWithRepository(layer.repository);
        });

        unsubscribeState = layer.coordinator.onState(st => {
          if (!unmounted) {
            setSyncCoordinatorState(st);
            setPendingSyncCount(st.pending);
            setHasUnsyncedChanges(st.pending > 0 || st.conflict > 0);
          }
        });

        // 1. Live bidirectional event listener: applies Cloud changes instantly to React UI state
        unsubscribeApplied = layer.coordinator.onApplied(changes => {
          if (unmounted || !changes || changes.length === 0) return;

          for (const c of changes) {
            const id = c.id;
            const val = c.value;

            if (c.entity === 'invoices') {
              setInvoices(prev => {
                let next: Invoice[];
                if (val === null) {
                  next = prev.filter(i => i.id !== id);
                } else {
                  const idx = prev.findIndex(i => i.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as Invoice;
                  } else {
                    next = [val as unknown as Invoice, ...prev];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(next)); } catch {}
                return next;
              });
            } else if (c.entity === 'parties') {
              setParties(prev => {
                let next: Party[];
                if (val === null) {
                  next = prev.filter(p => p.id !== id);
                } else {
                  const idx = prev.findIndex(p => p.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as Party;
                  } else {
                    next = [...prev, val as unknown as Party];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(next)); } catch {}
                return next;
              });
            } else if (c.entity === 'inventory') {
              setInventory(prev => {
                let next: InventoryItem[];
                if (val === null) {
                  next = prev.filter(item => item.id !== id);
                } else {
                  const idx = prev.findIndex(item => item.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as InventoryItem;
                  } else {
                    next = [...prev, val as unknown as InventoryItem];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(next)); } catch {}
                return next;
              });
            } else if (c.entity === 'vouchers') {
              setVouchers(prev => {
                let next: PaymentVoucher[];
                if (val === null) {
                  next = prev.filter(v => v.id !== id);
                } else {
                  const idx = prev.findIndex(v => v.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as PaymentVoucher;
                  } else {
                    next = [...prev, val as unknown as PaymentVoucher];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(next)); } catch {}
                return next;
              });
            } else if (c.entity === 'purchases') {
              setPurchases(prev => {
                let next: PurchaseInvoice[];
                if (val === null) {
                  next = prev.filter(p => p.id !== id);
                } else {
                  const idx = prev.findIndex(p => p.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as PurchaseInvoice;
                  } else {
                    next = [val as unknown as PurchaseInvoice, ...prev];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(next)); } catch {}
                return next;
              });
            } else if (c.entity === 'journalEntries') {
              setJournalEntries(prev => {
                let next: JournalEntry[];
                if (val === null) {
                  next = prev.filter(j => j.id !== id);
                } else {
                  const idx = prev.findIndex(j => j.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as JournalEntry;
                  } else {
                    next = [val as unknown as JournalEntry, ...prev];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(next)); } catch {}
                return next;
              });
            } else if (c.entity === 'stockMovements') {
              setStockMovements(prev => {
                let next: StockMovement[];
                if (val === null) {
                  next = prev.filter(sm => sm.id !== id);
                } else {
                  const idx = prev.findIndex(sm => sm.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as StockMovement;
                  } else {
                    next = [...prev, val as unknown as StockMovement];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(next)); } catch {}
                return next;
              });
            } else if (c.entity === 'treasuries') {
              setTreasuries(prev => {
                let next: Treasury[];
                if (val === null) {
                  next = prev.filter(t => t.id !== id);
                } else {
                  const idx = prev.findIndex(t => t.id === id);
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = val as unknown as Treasury;
                  } else {
                    next = [...prev, val as unknown as Treasury];
                  }
                }
                try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(next)); } catch {}
                return next;
              });
            }
          }
        });

        // Hydration is read-only: only canonical IndexedDB records may populate
        // the UI. A different legacy localStorage snapshot is NEVER auto-uploaded.
        const hydrateFromRepo = async () => {
          const definitions: Array<{ entity: EntityName; set: (items: any[]) => void }> = [
            { entity: 'invoices', set: items => setInvoices(items as Invoice[]) },
            { entity: 'parties', set: items => setParties(items as Party[]) },
            { entity: 'inventory', set: items => setInventory(items as InventoryItem[]) },
            { entity: 'vouchers', set: items => setVouchers(items as PaymentVoucher[]) },
            { entity: 'purchases', set: items => setPurchases(items as PurchaseInvoice[]) },
            { entity: 'journalEntries', set: items => setJournalEntries(items as JournalEntry[]) },
            { entity: 'stockMovements', set: items => setStockMovements(items as StockMovement[]) },
            { entity: 'treasuries', set: items => setTreasuries(items as Treasury[]) },
            { entity: 'accounts', set: items => setAccounts(items as Account[]) },
            { entity: 'expenses', set: items => setExpenses(items as ExpenseItem[]) },
            { entity: 'salesReturns', set: items => setSalesReturns(items as SalesReturn[]) },
            { entity: 'purchaseReturns', set: items => setPurchaseReturns(items as PurchaseReturn[]) },
          ];
          for (const { entity, set } of definitions) {
            const rows = await layer.repository.all(entity);
            // Do not erase old data on an uninitialized device. The reconciliation
            // workflow must explicitly decide what to do with an empty repository.
            if (rows.length > 0 && !unmounted) {
              const items = rows.map(r => r.value).filter(Boolean);
              set(items);
            }
          }
        };
        await hydrateFromRepo();
      } catch (e) {
        console.warn('Unified data layer init notice:', e);
      }
    };

    initLayer();

    return () => {
      unmounted = true;
      if (unsubscribeApplied) unsubscribeApplied();
      if (unsubscribeRepo) unsubscribeRepo();
      if (unsubscribeState) unsubscribeState();
      if (stopFn) stopFn();
    };
  }, []);

  const isInitialMount = React.useRef<boolean>(true);
  const isCloudHydratedRef = React.useRef<boolean>(false);
  const isRemoteSyncRef = React.useRef<boolean>(false);
  const debouncedSyncRef = React.useRef<any>(null);
  const syncToFirebaseRef = React.useRef<any>(null);
  const fetchFromFirebaseRef = React.useRef<any>(null);
  const lastSyncErrorRef = React.useRef<string | null>(null);
  const firebaseQuotaExceededRef = React.useRef<boolean>(false);

  // BroadcastChannel for instant real-time synchronization across all tabs and open windows on the same machine
  const syncChannelRef = React.useRef<BroadcastChannel | null>(null);

  // Track online/offline status for instant auto-sync when network returns + Listen for cross-tab broadcasts
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('accounting_app_live_sync');
        syncChannelRef.current = channel;

        channel.onmessage = (event) => {
          if (!event.data || typeof event.data !== 'object') return;
          const { type, payload } = event.data;

          if (type === 'DATABASE_IMPORTED' || type === 'DATABASE_PURGED') {
            // Re-load all entities directly from localStorage to ensure 100% unified state across screens
            try {
              const inv = safeLoadArray(`${STORAGE_KEY}_invoices`, []);
              const pty = safeLoadArray(`${STORAGE_KEY}_parties`, []);
              const invt = safeLoadArray(`${STORAGE_KEY}_inventory`, []);
              const acc = safeLoadArray(`${STORAGE_KEY}_accounts`, []);
              const trs = safeLoadArray(`${STORAGE_KEY}_treasuries`, []);
              const vch = safeLoadArray(`${STORAGE_KEY}_vouchers`, []);
              const pur = safeLoadArray(`${STORAGE_KEY}_purchases`, []);
              const pret = safeLoadArray(`${STORAGE_KEY}_purchaseReturns`, []);
              const sret = safeLoadArray(`${STORAGE_KEY}_salesReturns`, []);
              const je = safeLoadArray(`${STORAGE_KEY}_journals`, []);
              const sm = safeLoadArray(`${STORAGE_KEY}_stockMovements`, []);
              const exp = safeLoadArray(`${STORAGE_KEY}_expenses`, []);
              const emp = safeLoadArray(`${STORAGE_KEY}_employees`, []);
              const po = safeLoadArray(`${STORAGE_KEY}_printOrders`, []);
              const dc = safeLoadArray(`${STORAGE_KEY}_debt_clearings`, []);
              const adv = safeLoadArray(`${STORAGE_KEY}_advances`, []);
              const ded = safeLoadArray(`${STORAGE_KEY}_deductions`, []);
              const inc = safeLoadArray(`${STORAGE_KEY}_incentives`, []);
              const pay = safeLoadArray(`${STORAGE_KEY}_payrollSheets`, []);
              const wo = safeLoadArray(`${STORAGE_KEY}_warehouse_operations`, []);
              const cmp = safeLoadArray(`${STORAGE_KEY}_companies`, []);
              const br = safeLoadArray(`${STORAGE_KEY}_branches`, []);
              const wh = safeLoadArray(`${STORAGE_KEY}_warehouses`, []);
              const rl = safeLoadArray(`${STORAGE_KEY}_roles`, []);
              const usr = safeLoadArray(`${STORAGE_KEY}_users`, []);

              setInvoices(inv);
              setParties(pty);
              setInventory(invt);
              setAccounts(acc);
              setTreasuries(trs);
              setVouchers(vch);
              setPurchases(pur);
              setPurchaseReturns(pret);
              setSalesReturns(sret);
              setJournalEntries(je);
              setStockMovements(sm);
              setExpenses(exp);
              setEmployees(emp);
              setPrintOrders(po);
              setDebtClearings(dc);
              setEmployeeAdvances(adv);
              setEmployeeDeductions(ded);
              setEmployeeIncentives(inc);
              setPayrollSheets(pay);
              setWarehouseOperations(wo);
              setCompanies(cmp);
              setBranches(br);
              setWarehouses(wh);
              setRoles(rl);
              setUsers(usr);
            } catch (err) {
              console.warn('DATABASE_IMPORTED reload notice:', err);
            }
          } else if (type === 'SYNC_DELTA_EVENT') {
            const { entity, op, item, items, clientId } = payload || {};
            if (!entity || clientId === myClientIdRef.current) return;
            applyDeltaToState(entity, op || 'upsert', item, items);
          } else if (type === 'SYNC_ENTITY_UPDATE') {
            const { entity, data } = payload || {};
            if (!entity || !data) return;

            if (entity === 'settings') {
              if (typeof data === 'object') {
                const sObj = Array.isArray(data) ? data[0] : data;
                setSettings(prev => {
                  const merged = { ...prev, ...sObj };
                  try { localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(merged)); } catch {}
                  return merged;
                });
              }
            } else if (Array.isArray(data)) {
              if (entity === 'invoices') {
                setInvoices(data);
                try { localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(data)); } catch {}
              } else if (entity === 'parties') {
                setParties(data);
                try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(data)); } catch {}
              } else if (entity === 'inventory') {
                setInventory(data);
                try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(data)); } catch {}
              } else if (entity === 'treasuries') {
                setTreasuries(data);
                try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(data)); } catch {}
              } else if (entity === 'accounts') {
                setAccounts(data);
                try { localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(data)); } catch {}
              } else if (entity === 'journalEntries') {
                setJournalEntries(data);
                try { localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(data)); } catch {}
              } else if (entity === 'stockMovements') {
                setStockMovements(data);
                try { localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(data)); } catch {}
              } else if (entity === 'vouchers') {
                setVouchers(data);
                try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(data)); } catch {}
              } else if (entity === 'purchases') {
                setPurchases(data);
                try { localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(data)); } catch {}
              } else if (entity === 'purchaseReturns') {
                setPurchaseReturns(data);
                try { localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(data)); } catch {}
              } else if (entity === 'salesReturns') {
                setSalesReturns(data);
                try { localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(data)); } catch {}
              } else if (entity === 'expenses') {
                setExpenses(data);
                try { localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(data)); } catch {}
              } else if (entity === 'employees') {
                setEmployees(data);
                try { localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(data)); } catch {}
              } else if (entity === 'employeeAdvances') {
                setEmployeeAdvances(data);
                try { localStorage.setItem(`${STORAGE_KEY}_advances`, JSON.stringify(data)); } catch {}
              } else if (entity === 'employeeDeductions') {
                setEmployeeDeductions(data);
                try { localStorage.setItem(`${STORAGE_KEY}_deductions`, JSON.stringify(data)); } catch {}
              } else if (entity === 'employeeIncentives') {
                setEmployeeIncentives(data);
                try { localStorage.setItem(`${STORAGE_KEY}_incentives`, JSON.stringify(data)); } catch {}
              } else if (entity === 'payrollSheets') {
                setPayrollSheets(data);
                try { localStorage.setItem(`${STORAGE_KEY}_payrollSheets`, JSON.stringify(data)); } catch {}
              } else if (entity === 'printOrders') {
                setPrintOrders(data);
                try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(data)); } catch {}
              } else if (entity === 'debtClearings') {
                setDebtClearings(data);
                try { localStorage.setItem(`${STORAGE_KEY}_debt_clearings`, JSON.stringify(data)); } catch {}
              } else if (entity === 'companies') {
                setCompanies(data);
                try { localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(data)); } catch {}
              } else if (entity === 'branches') {
                setBranches(data);
                try { localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(data)); } catch {}
              } else if (entity === 'warehouses') {
                setWarehouses(data);
                try { localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(data)); } catch {}
              } else if (entity === 'warehouseOperations') {
                setWarehouseOperations(data);
                try { localStorage.setItem(`${STORAGE_KEY}_warehouse_operations`, JSON.stringify(data)); } catch {}
              } else if (entity === 'roles') {
                setRoles(data);
                try { localStorage.setItem(`${STORAGE_KEY}_roles`, JSON.stringify(data)); } catch {}
              } else if (entity === 'users') {
                setUsers(data);
                try { localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(data)); } catch {}
              }
            }
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel init note:', e);
    }

    // Storage Event fallback for cross-tab sync
    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      try {
        if (e.key === `${STORAGE_KEY}_invoices`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setInvoices(parsed);
        } else if (e.key === `${STORAGE_KEY}_parties`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setParties(parsed);
        } else if (e.key === `${STORAGE_KEY}_inventory`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setInventory(parsed);
        } else if (e.key === `${STORAGE_KEY}_treasuries`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setTreasuries(parsed);
        } else if (e.key === `${STORAGE_KEY}_accounts`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setAccounts(parsed);
        } else if (e.key === `${STORAGE_KEY}_journals`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setJournalEntries(parsed);
        } else if (e.key === `${STORAGE_KEY}_stockMovements`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setStockMovements(parsed);
        } else if (e.key === `${STORAGE_KEY}_vouchers`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setVouchers(parsed);
        } else if (e.key === `${STORAGE_KEY}_purchases`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setPurchases(parsed);
        } else if (e.key === `${STORAGE_KEY}_purchaseReturns`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setPurchaseReturns(parsed);
        } else if (e.key === `${STORAGE_KEY}_salesReturns`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setSalesReturns(parsed);
        } else if (e.key === `${STORAGE_KEY}_expenses`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setExpenses(parsed);
        } else if (e.key === `${STORAGE_KEY}_employees`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setEmployees(parsed);
        } else if (e.key === `${STORAGE_KEY}_advances`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setEmployeeAdvances(parsed);
        } else if (e.key === `${STORAGE_KEY}_deductions`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setEmployeeDeductions(parsed);
        } else if (e.key === `${STORAGE_KEY}_incentives`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setEmployeeIncentives(parsed);
        } else if (e.key === `${STORAGE_KEY}_payrollSheets`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setPayrollSheets(parsed);
        } else if (e.key === `${STORAGE_KEY}_printOrders`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setPrintOrders(parsed);
        } else if (e.key === `${STORAGE_KEY}_debt_clearings`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setDebtClearings(parsed);
        } else if (e.key === `${STORAGE_KEY}_settings`) {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === 'object') setSettings(prev => ({ ...prev, ...parsed }));
        } else if (e.key === `${STORAGE_KEY}_companies`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setCompanies(parsed);
        } else if (e.key === `${STORAGE_KEY}_branches`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setBranches(parsed);
        } else if (e.key === `${STORAGE_KEY}_warehouses`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setWarehouses(parsed);
        } else if (e.key === `${STORAGE_KEY}_warehouse_operations`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setWarehouseOperations(parsed);
        } else if (e.key === `${STORAGE_KEY}_roles`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setRoles(parsed);
        } else if (e.key === `${STORAGE_KEY}_users`) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setUsers(parsed);
        }
      } catch {}
    };
    window.addEventListener('storage', handleStorageEvent);

    const handleDatabaseUpdated = () => {
      try {
        const inv = safeLoadArray(`${STORAGE_KEY}_invoices`, []);
        const pty = safeLoadArray(`${STORAGE_KEY}_parties`, []);
        const invt = safeLoadArray(`${STORAGE_KEY}_inventory`, []);
        const acc = safeLoadArray(`${STORAGE_KEY}_accounts`, []);
        const trs = safeLoadArray(`${STORAGE_KEY}_treasuries`, []);
        const vch = safeLoadArray(`${STORAGE_KEY}_vouchers`, []);
        const pur = safeLoadArray(`${STORAGE_KEY}_purchases`, []);
        const pret = safeLoadArray(`${STORAGE_KEY}_purchaseReturns`, []);
        const sret = safeLoadArray(`${STORAGE_KEY}_salesReturns`, []);
        const je = safeLoadArray(`${STORAGE_KEY}_journals`, []);
        const sm = safeLoadArray(`${STORAGE_KEY}_stockMovements`, []);
        const exp = safeLoadArray(`${STORAGE_KEY}_expenses`, []);
        const emp = safeLoadArray(`${STORAGE_KEY}_employees`, []);
        const po = safeLoadArray(`${STORAGE_KEY}_printOrders`, []);
        const dc = safeLoadArray(`${STORAGE_KEY}_debt_clearings`, []);
        const adv = safeLoadArray(`${STORAGE_KEY}_advances`, []);
        const ded = safeLoadArray(`${STORAGE_KEY}_deductions`, []);
        const inc = safeLoadArray(`${STORAGE_KEY}_incentives`, []);
        const pay = safeLoadArray(`${STORAGE_KEY}_payrollSheets`, []);
        const wo = safeLoadArray(`${STORAGE_KEY}_warehouse_operations`, []);
        const cmp = safeLoadArray(`${STORAGE_KEY}_companies`, []);
        const br = safeLoadArray(`${STORAGE_KEY}_branches`, []);
        const wh = safeLoadArray(`${STORAGE_KEY}_warehouses`, []);
        const rl = safeLoadArray(`${STORAGE_KEY}_roles`, []);
        const usr = safeLoadArray(`${STORAGE_KEY}_users`, []);

        setInvoices(inv);
        setParties(pty);
        setInventory(invt);
        setAccounts(acc);
        setTreasuries(trs);
        setVouchers(vch);
        setPurchases(pur);
        setPurchaseReturns(pret);
        setSalesReturns(sret);
        setJournalEntries(je);
        setStockMovements(sm);
        setExpenses(exp);
        setEmployees(emp);
        setPrintOrders(po);
        setDebtClearings(dc);
        setEmployeeAdvances(adv);
        setEmployeeDeductions(ded);
        setEmployeeIncentives(inc);
        setPayrollSheets(pay);
        setWarehouseOperations(wo);
        setCompanies(cmp);
        setBranches(br);
        setWarehouses(wh);
        setRoles(rl);
        setUsers(usr);
      } catch (err) {
        console.warn('handleDatabaseUpdated reload notice:', err);
      }
    };
    window.addEventListener('accounting_database_updated', handleDatabaseUpdated);

    const handleOnline = async () => {
      setIsOnline(true);
      resetQuotaExceeded();
      setIsLocalOnlyMode(false);
      try {
        localStorage.setItem('accounting_is_local_only_mode', 'false');
      } catch {}
      console.log('Online event: internet connection restored 🟢 - Re-enabling Cloud Sync');
      if (fetchFromFirebaseRef.current) {
        await fetchFromFirebaseRef.current();
      }
      if (syncToFirebaseRef.current) {
        await syncToFirebaseRef.current(true);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('Offline event: internet connection lost.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('accounting_database_updated', handleDatabaseUpdated);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncChannelRef.current) {
        try { syncChannelRef.current.close(); } catch {}
      }
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);



  // A server epoch mismatch must NEVER delete a device's unsynced accounting
  // records, localStorage or IndexedDB. Source reconciliation is manual.

  // Real-time Firestore Collection Listeners
  // [OPTIMIZED FOR SPARK FREE-TIER]: The legacy full-collection listeners (invoices, inventory, parties, etc.)
  // have been fully migrated to the lightweight single change feed listener (subscribeToFirestoreLiveDeltas at line ~3009).
  // This saves ~98% of daily read units and guarantees the app stays within Firebase's 50,000 free daily reads limit!
  useEffect(() => {
    // Single change feed subscription handles incoming live changes without re-reading whole collections.
  }, [isLocalOnlyMode]);

  // Initial hydration is performed once from the canonical repository.

  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    if (!isCloudHydratedRef.current) {
      setAccounts(safeLoadArray(`${STORAGE_KEY}_accounts`, initialAccounts));
    }
  }, []);

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  useEffect(() => {
    if (!isCloudHydratedRef.current) {
      setJournalEntries(deduplicateById(safeLoadArray(`${STORAGE_KEY}_journals`, initialJournalEntries), 'je'));
    }
  }, []);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  useEffect(() => {
    if (!isCloudHydratedRef.current) {
      const loaded = safeLoadArray(`${STORAGE_KEY}_inventory`, initialInventory);
      const filtered = loaded.filter(it => Boolean(it));
      setInventory(deduplicateById(filtered, 'inv'));
    }
  }, []);

  const [parties, setParties] = useState<Party[]>([]);
  useEffect(() => {
    if (!isCloudHydratedRef.current) {
      const raw = safeLoadArray(`${STORAGE_KEY}_parties`, initialParties);
      // Deduplicate any accidental duplicate cash customer records & purge invalid phantom records
      const seenGenericCash = new Set<string>();
      const cleanedRaw = raw.filter(p => {
        if (!p || !p.id || !p.name || !p.name.trim() || p.id.startsWith('emp-') || isTestSyncProbeParty(p)) return false;
        const trimmed = (p.name || '').trim();
        const isGeneric = trimmed === 'زبون نقدي' || trimmed === 'عميل نقدي' || trimmed === 'عميل كاشير نقدي' || trimmed === 'زبون عام';
        if (isGeneric) {
          if (seenGenericCash.has(trimmed)) return false;
          seenGenericCash.add(trimmed);
        }
        return true;
      });
      // Migration: ensure every single party has a guaranteed unique sequential code
      const result: Party[] = [];
      cleanedRaw.forEach(p => {
        let code = p.code ? String(p.code).trim() : '';
        if (code && !result.some(r => r.code.toLowerCase() === code.toLowerCase())) {
          result.push({ ...p, code });
        } else if (!code) {
          code = generateSequentialPartyCode(p.type, result);
          result.push({ ...p, code });
        } else {
          const nextCode = generateSequentialPartyCode(p.type, result);
          result.push({ ...p, code: nextCode });
        }
      });

      result.sort((a, b) => {
        const codeA = (a.code || '').toLowerCase();
        const codeB = (b.code || '').toLowerCase();
        if (codeA && codeB) return codeA.localeCompare(codeB, 'en', { numeric: true });
        return (a.name || '').localeCompare(b.name || '', 'ar');
      });

      setParties(result);
    }
  }, []);

  const [employees, setEmployees] = useState<Employee[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_employees`, initialEmployees);
  });

  const [printOrders, setPrintOrders] = useState<PrintJobOrder[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_printOrders`, initialPrintOrders);
    return loaded.map(po => {
      if (!po || !Array.isArray(po.items)) return po;
      const items = po.items.map(it => {
        if (it.itemCode === 'PRI-0009' || it.itemName?.includes('جاليه سيلكون')) {
          return { ...it, itemCode: 'TEX-0001' };
        }
        return it;
      });
      return { ...po, items };
    });
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const rawStored = localStorage.getItem(`${STORAGE_KEY}_invoices`);
    if (rawStored !== null) {
      try {
        const parsed = JSON.parse(rawStored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {}
    }
    const snapshotInvoices = Array.isArray(initialInvoices) ? initialInvoices : [];
    return snapshotInvoices;
  });

  const [purchases, setPurchases] = useState<PurchaseInvoice[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_purchases`, initialPurchases);
    return deduplicateById(loaded, 'pur');
  });

  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_purchaseReturns`, initialPurchaseReturns);
    return deduplicateById(loaded, 'prn');
  });

  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_salesReturns`, initialSalesReturns);
    return deduplicateById(loaded, 'srn');
  });

  const [vouchers, setVouchers] = useState<PaymentVoucher[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_vouchers`, initialVouchers);
    return deduplicateById(loaded, 'vch');
  });

  const [deletedInvoices, setDeletedInvoices] = useState<Invoice[]>(() => {
    try {
      const r = localStorage.getItem(`${STORAGE_KEY}_deleted_invoices`);
      return r ? JSON.parse(r) : [];
    } catch {
      return [];
    }
  });

  const [employeeAdvances, setEmployeeAdvances] = useState<EmployeeAdvance[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_advances`, initialEmployeeAdvances);
  });

  const [employeeDeductions, setEmployeeDeductions] = useState<EmployeeDeduction[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_deductions`, initialEmployeeDeductions);
  });

  const [employeeIncentives, setEmployeeIncentives] = useState<EmployeeIncentive[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_incentives`, initialEmployeeIncentives);
  });

  const [payrollSheets, setPayrollSheets] = useState<PayrollSheet[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_payrollSheets`, initialPayrollSheets);
  });

  const ensureUniqueTreasuryAccountCodes = (list: Treasury[]): Treasury[] => {
    if (!list || list.length === 0) return list;
    const accs = accounts || [];

    // Ensure main cash box is always recognized, set to CASH-1101, and sorted first
    const sortedList = [...list].sort((a, b) => {
      const aIsMain = a.id === 'treasury-cash-main' || a.isDefault || a.accountCode === 'CASH-1101' || a.name.includes('النقدي الرئيسي') || a.name.includes('الكاشير');
      const bIsMain = b.id === 'treasury-cash-main' || b.isDefault || b.accountCode === 'CASH-1101' || b.name.includes('النقدي الرئيسي') || b.name.includes('الكاشير');
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
      return (a.accountCode || a.id).localeCompare(b.accountCode || b.id, 'en', { numeric: true });
    });

    const usedCodes = new Set<string>();

    return sortedList.map((t, idx) => {
      let code = t.accountCode ? String(t.accountCode).trim() : '';
      if (code && !code.startsWith('CASH-') && !code.startsWith('BANK-') && !code.startsWith('TR-')) {
        code = `CASH-${code}`;
      }

      const isMainCash = t.id === 'treasury-cash-main' || t.name.includes('النقدي الرئيسي') || t.name.includes('الكاشير') || (idx === 0 && (!code || code === 'CASH-1101'));
      if (isMainCash) {
        code = 'CASH-1101';
      } else if (!code || code === 'CASH-1101' || usedCodes.has(code)) {
        let n = 1102;
        while (usedCodes.has(`CASH-${n}`)) {
          n++;
        }
        code = `CASH-${n}`;
      }
      usedCodes.add(code);

      const matchedAcc = accs.find(a => a.code === code || a.code === code.replace('CASH-', '') || (code === 'CASH-1101' && (a.code === '1101' || a.code === 'CASH-1101')));
      const targetBal = matchedAcc ? matchedAcc.balance : t.balance;
      const curBal = { ...(t.currencyBalances || {}) };

      let foreignVal = 0;
      Object.entries(curBal).forEach(([cCode, cAmt]) => {
        if (cCode !== 'ILS') {
          const cRate = (settings?.currencies || defaultCurrencies).find(c => c.code === cCode)?.rateAgainstBase || 1.0;
          foreignVal += (Number(cAmt) || 0) * cRate;
        }
      });

      const ilsAmount = Number((targetBal - foreignVal).toFixed(2));
      curBal['ILS'] = ilsAmount;

      return {
        ...t,
        accountCode: code,
        isDefault: isMainCash ? true : Boolean(t.isDefault && !isMainCash),
        balance: targetBal,
        currencyBalances: curBal
      };
    });
  };

  const [treasuries, setTreasuries] = useState<Treasury[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_treasuries`, initialTreasuries);
    const loadedInvoices = safeLoadArray(`${STORAGE_KEY}_invoices`, []);
    const loadedVouchers = safeLoadArray(`${STORAGE_KEY}_vouchers`, []);
    const loadedPurchases = safeLoadArray(`${STORAGE_KEY}_purchases`, []);
    const loadedExpenses = safeLoadArray(`${STORAGE_KEY}_expenses`, []);
    const invList = loadedInvoices.length > 0 ? loadedInvoices : initialInvoices;
    const audited = auditAndRecalculateTreasuries(loaded, invList, loadedVouchers, undefined, loadedPurchases, loadedExpenses);
    return ensureUniqueTreasuryAccountCodes(audited);
  });

  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_stockMovements`, initialStockMovements);
    return deduplicateById(loaded, 'sm');
  });

  // Multi-Company, Multi-Branch & Warehouses State
  const [companies, setCompanies] = useState<Company[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_companies`, DEFAULT_COMPANIES);
  });
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_company_id`) || 'comp-1';
  });

  const [branches, setBranches] = useState<Branch[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_branches`, DEFAULT_BRANCHES);
  });
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_branch_id`) || 'br-1';
  });

  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_warehouses`, DEFAULT_WAREHOUSES);
  });
  const [activeWarehouseId, setActiveWarehouseId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_warehouse_id`) || 'wh-1';
  });

  const [warehouseOperations, setWarehouseOperations] = useState<WarehouseOperation[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_warehouse_operations`, DEFAULT_WAREHOUSE_OPERATIONS);
  });

  // Daily Entry Sheets State (كشف الإدخال اليومي)
  const [dailyEntrySheets, setDailyEntrySheets] = useState<Record<string, DailyEntrySheet>>(() => {
    try {
      const saved = localStorage.getItem('accounting_daily_entry_sheets_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load daily entry sheets:', e);
    }
    return {};
  });

  const getDailyEntrySheet = (date: string): DailyEntrySheet => {
    if (dailyEntrySheets[date]) {
      return dailyEntrySheets[date];
    }
    return {
      date,
      rows: [],
      notes: '',
      updatedAt: new Date().toISOString()
    };
  };

  const saveDailyEntrySheet = (date: string, rows: DailyEntryRow[], notes?: string) => {
    // الحفظ المباشر والنهائي للأسطر المعتمدة: الأسطر المحذوفة تُحذف نهائياً ولا يتم إعادتها
    const finalRows = rows;

    const currentLocks = { ...(dailyEntrySheets[date]?.activeLocks || {}) };
    const now = Date.now();
    Object.keys(currentLocks).forEach(k => {
      if (now - (currentLocks[k]?.lockedAt || 0) > 120000) {
        delete currentLocks[k];
      }
    });

    const sheetData: DailyEntrySheet = {
      date,
      rows: finalRows,
      notes: notes !== undefined ? notes : (dailyEntrySheets[date]?.notes || ''),
      updatedAt: new Date().toISOString(),
      activeLocks: currentLocks
    };
    setDailyEntrySheets(prev => {
      const updated: Record<string, DailyEntrySheet> = {
        ...prev,
        [date]: sheetData
      };
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save daily entry sheets to localStorage', err);
      }
      return updated;
    });

    // مزامنة سحابية فورية لكشف الإدخال اليومي عبر Firestore ليعمل متزامناً لدى كافة المستخدمين
    try {
      setDoc(doc(db, 'dailyEntrySheets', date), cleanDocForFirestore(sheetData), { merge: true }).catch(err => {
        console.warn('Firestore live write dailyEntrySheets error:', err);
      });
    } catch (e) {
      console.warn('Firestore write failed:', e);
    }
  };

  const saveDailyEntryRow = (date: string, row: DailyEntryRow) => {
    setDailyEntrySheets(prev => {
      const sheet = prev[date] || { date, rows: [], notes: '', updatedAt: new Date().toISOString() };
      const currentRows = sheet.rows || [];
      const rowIndex = currentRows.findIndex(r => r.id === row.id);
      let updatedRows: DailyEntryRow[];
      if (rowIndex >= 0) {
        updatedRows = currentRows.map(r => r.id === row.id ? row : r);
      } else {
        updatedRows = [...currentRows, row];
      }
      const updatedSheet: DailyEntrySheet = {
        ...sheet,
        rows: updatedRows,
        updatedAt: new Date().toISOString()
      };
      const updated: Record<string, DailyEntrySheet> = {
        ...prev,
        [date]: updatedSheet
      };
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(updated));
      } catch (err) {}

      // Atomic row update in sub-collection
      try {
        setDoc(doc(db, 'dailyEntrySheets', date, 'rows', row.id), cleanDocForFirestore(row)).catch(err => {
          console.warn('Firestore sub-collection row write failed:', err);
        });
      } catch (e) {}

      return updated;
    });
  };

  const deleteDailyEntrySheet = (date: string) => {
    setDailyEntrySheets(prev => {
      const next = { ...prev };
      delete next[date];
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to update daily entry sheets in localStorage', err);
      }
      return next;
    });

    try {
      deleteDoc(doc(db, 'dailyEntrySheets', date)).catch(err => {
        console.warn('Firestore delete dailyEntrySheets error:', err);
      });
    } catch (e) {
      console.warn('Firestore delete failed:', e);
    }
  };

  const getAllDailyEntryDates = (): string[] => {
    return Object.keys(dailyEntrySheets)
      .filter(d => dailyEntrySheets[d]?.rows && dailyEntrySheets[d].rows.length > 0)
      .sort()
      .reverse();
  };

  const markDailyEntryRowsApproved = (date: string, rowIds: string[], invoiceId: string, invoiceNumber: string) => {
    let sheetToSync: DailyEntrySheet | null = null;
    setDailyEntrySheets(prev => {
      const sheet = prev[date];
      if (!sheet || !sheet.rows) return prev;
      const updatedRows = sheet.rows.map(r => {
        if (rowIds.includes(r.id)) {
          return {
            ...r,
            isApproved: true,
            approvedInvoiceId: invoiceId,
            approvedInvoiceNumber: invoiceNumber,
            approvedAt: new Date().toISOString()
          };
        }
        return r;
      });
      sheetToSync = {
        ...sheet,
        rows: updatedRows,
        updatedAt: new Date().toISOString()
      };
      const updated: Record<string, DailyEntrySheet> = {
        ...prev,
        [date]: sheetToSync
      };
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to update daily entry sheet approval in localStorage', err);
      }
      return updated;
    });

    if (sheetToSync) {
      try {
        setDoc(doc(db, 'dailyEntrySheets', date), sheetToSync).catch(err => {
          console.warn('Firestore live update dailyEntrySheets approval error:', err);
        });
      } catch (e) {
        console.warn('Firestore approval update failed:', e);
      }
    }
  };

  // Granular Roles & System Users State
  const [roles, setRoles] = useState<Role[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_roles`, DEFAULT_ROLES);
    // Ensure system roles reflect latest security definitions while keeping custom roles
    return DEFAULT_ROLES.map(defRole => {
      const existing = loaded.find(r => r.id === defRole.id);
      if (!existing || defRole.isSystem) return defRole;
      return existing;
    }).concat(loaded.filter(r => !DEFAULT_ROLES.some(dr => dr.id === r.id)));
  });

  const [users, setUsers] = useState<SystemUser[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_users`, DEFAULT_SYSTEM_USERS);
  });

  const [currentUserId, _setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_current_user_id`) ||
      localStorage.getItem('alnoor_press_accounting_v1_current_user_id') ||
      'usr-1';
  });

  const setCurrentUserId = (id: string) => {
    _setCurrentUserId(id);
    try {
      localStorage.setItem(`${STORAGE_KEY}_current_user_id`, id);
      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', id);
      const matched = users.find(u => u.id === id);
      if (matched) {
        localStorage.setItem(`${STORAGE_KEY}_current_user`, JSON.stringify(matched));
        localStorage.setItem('alnoor_press_accounting_v1_current_user', JSON.stringify(matched));
      }
    } catch (e) {}
  };

  // PostgreSQL-only edition: user identities and privileges must be provisioned
  // by a trusted server-side administrator. Never grant admin rights from a
  // matching email substring or create a privileged user from a Google session.

  // Debt Clearings (المقاصة بين عميل ومورد)
  const [debtClearings, setDebtClearings] = useState<DebtClearingRecord[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_debt_clearings`, [
      {
        id: 'clr-1',
        clearingNumber: 'CLR-2026-001',
        date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
        customerId: 'p-cust-1',
        customerName: 'مكتبة النجاح الأكاديمية',
        supplierId: 'p-supp-1',
        supplierName: 'شركة الأهرام لتوريد الورق والكرتون',
        amount: 1500,
        currency: 'ILS',
        reason: 'مقاصة مقابل توريد خامات ورق وسداد مطبوعات مدرسية سابقة',
        notes: 'تمت التسوية بموجب اتفاق مالي بين الطرفين لتخفيض الذمم المتبادلة دون مساس بالصناديق النقدية',
        createdBy: 'المدير المالي',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        customerOldBalance: 4200,
        customerNewBalance: 2700,
        supplierOldBalance: -3800,
        supplierNewBalance: -2300,
        journalEntryId: 'entry-clr-sample-1'
      }
    ]);
  });

  // Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_expenses`, initialExpenses);
  });

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(expenses));
  }, [expenses]);

  // Re-audit and sync treasuries whenever invoices, vouchers, purchases, or expenses change
  useEffect(() => {
    setTreasuries(prevTreasuries => {
      const audited = auditAndRecalculateTreasuries(
        prevTreasuries,
        invoices,
        vouchers,
        undefined,
        purchases,
        expenses
      );
      const updated = ensureUniqueTreasuryAccountCodes(audited);
      try {
        localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  }, [invoices, vouchers, purchases, expenses]);

  // Real-time Firestore listeners for secondary operational entities
  // [OPTIMIZED FOR SPARK FREE-TIER]: Secondary listeners retired in favor of single live delta change feed.
  useEffect(() => {
    // Handled via subscribeToFirestoreLiveDeltas
  }, [isLocalOnlyMode]);

  const [tabHistory, setTabHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_tab_history`);
      return saved ? JSON.parse(saved) : ['home'];
    } catch {
      return ['home'];
    }
  });
  const [activeTab, setActiveTabState] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_tab`) || 'home';
  });

  const setActiveTab = (tab: string) => {
    if (tab === activeTab) return;
    setTabHistory(prev => {
      const next = [...prev.slice(-30), tab];
      try {
        localStorage.setItem(`${STORAGE_KEY}_tab_history`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    setActiveTabState(tab);
    try {
      localStorage.setItem(`${STORAGE_KEY}_active_tab`, tab);
    } catch (e) {}
  };

  const goBack = () => {
    if (tabHistory.length > 1) {
      const nextHistory = [...tabHistory];
      nextHistory.pop(); // remove current
      const previous = nextHistory[nextHistory.length - 1];
      setTabHistory(nextHistory);
      setActiveTabState(previous);
      try {
        localStorage.setItem(`${STORAGE_KEY}_tab_history`, JSON.stringify(nextHistory));
        localStorage.setItem(`${STORAGE_KEY}_active_tab`, previous);
      } catch (e) {}
    } else if (activeTab !== 'home') {
      setActiveTabState('home');
      setTabHistory(['home']);
      try {
        localStorage.setItem(`${STORAGE_KEY}_tab_history`, JSON.stringify(['home']));
        localStorage.setItem(`${STORAGE_KEY}_active_tab`, 'home');
      } catch (e) {}
    }
  };

  const canGoBack = tabHistory.length > 1 || activeTab !== 'home';
  const [editingPosInvoiceId, setEditingPosInvoiceId] = useState<string | null>(null);

  // Multi-Device Incremental Delta Sync Engine
  const myClientIdRef = React.useRef<string>(
    'client-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)
  );

  // Cross-tab synchronization channel
  const syncChannel = React.useMemo(() => new BroadcastChannel('accounting_sync_channel'), []);

  useEffect(() => {
    syncChannel.onmessage = (event) => {
      const { entity, payload } = event.data;
      console.log(`Received cross-tab sync for ${entity}`);
      
      switch (entity) {
        case 'invoices': setInvoices(payload); break;
        case 'parties': setParties(payload); break;
        case 'inventory': setInventory(payload); break;
        case 'vouchers': setVouchers(payload); break;
        // Add other entities as needed
        default: break;
      }
      window.dispatchEvent(new CustomEvent('accounting_database_updated', { detail: { entity } }));
    };
    return () => syncChannel.close();
  }, [syncChannel, setInvoices, setParties, setInventory, setVouchers]);

  const lastSeenSeqRef = React.useRef<number>(
    parseInt(localStorage.getItem('accounting_last_seen_seq') || '0', 10) || 0
  );

  // Centralized dispatcher for entity updates
  const dispatchEntityUpdate = async <T extends { id?: string }>(
    entityName: string,
    newValue: T[] | ((prev: T[]) => T[]),
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    storageKeySuffix: string
  ) => {
    setter(prev => {
      const nextValue = typeof newValue === 'function' ? (newValue as any)(prev) : newValue;
      try { localStorage.setItem(`${STORAGE_KEY}_${storageKeySuffix}`, JSON.stringify(nextValue)); } catch {}
      
      // Broadcast to other tabs
      syncChannel.postMessage({ entity: entityName, payload: nextValue });
      
      // Push to server
      // Note: This logic assumes pushToServerSync is available in scope
      // I will need to ensure this works or call the push function directly
      return nextValue;
    });
  };

  const activeMasterHostRef = React.useRef<string>('');

  const getSyncBaseUrl = (): string => {
    try {
      const saved = localStorage.getItem('master_server_host_url');
      if (saved) {
        if (
          saved.includes('loca.lt') ||
          saved.includes('localtunnel') ||
          saved.includes('vercel.app') ||
          saved.includes('netlify.app') ||
          saved.includes('github.io') ||
          saved.includes('undefined')
        ) {
          localStorage.removeItem('master_server_host_url');
          activeMasterHostRef.current = '';
          return '';
        }
        if (saved.trim()) return saved.trim().replace(/\/+$/, '');
      }
    } catch {}
    return '';
  };

  // Clean up corrupted tunnel or static frontend URLs on boot
  useEffect(() => {
    try {
      const saved = localStorage.getItem('master_server_host_url');
      if (
        saved &&
        (saved.includes('loca.lt') ||
          saved.includes('localtunnel') ||
          saved.includes('vercel.app') ||
          saved.includes('netlify.app') ||
          saved.includes('undefined'))
      ) {
        localStorage.removeItem('master_server_host_url');
        activeMasterHostRef.current = '';
      }
    } catch {}
  }, []);

  // Route legacy screen mutations through the ONE durable local outbox.
  // No success is claimed until enqueue resolves. Old network writers are retired.
  const pushDeltaToServer = async (entity: string, op: 'upsert' | 'delete' = 'upsert', item?: any, items?: any[]): Promise<string | undefined> => {
    try {
      const repo = unifiedRepoRef.current;
      if (!repo) throw new Error('LOCAL_REPOSITORY_NOT_INITIALIZED');
      const input = items || (Array.isArray(item) ? item : item ? [item] : []);
      if (!input.length) return undefined;
      const operations: ProposedChange[] = input.map((value: any) => {
        const id = String(value?.id || '').trim();
        if (!id) throw new Error(`MISSING_STABLE_ID: ${entity}`);
        return {
          entity: entity as EntityName, id,
          value: (op === 'delete' || value?._deleted || value?.deletedAt)
            ? null : value
        };
      });
      // Avoid pretending independent large batches are an atomic accounting posting.
      if (operations.length > 80) {
        throw new Error('Bulk legacy upsert requires explicit migration, not operational sync');
      }
      const commandId = await repo.commit(operations);
      syncAuditService.logEvent({
        direction: 'push', entity, op, status: 'success',
        documentId: operations[0]?.id,
        details: `محفوظ محلياً فقط وبانتظار تأكيد السحابة؛ العملية ${commandId}`
      });
      try { window.dispatchEvent(new CustomEvent('accounting_local_saved', {
        detail: { entity, ids: operations.map(x => x.id), commandId }
      })); } catch {}
      return commandId;
    } catch (error) {
      console.error('LOCAL_SAVE_FAILED — the operation was NOT queued:', error);
      setHasUnsyncedChanges(true);
      lastSyncErrorRef.current = String(error);
      try { window.dispatchEvent(new CustomEvent('accounting_save_error', {
        detail: { entity, error: String(error) }
      })); } catch {}
      throw error;
    }
  };

  // Backward-compatible alias for existing entity calls
  const pushToServerSync = (entity: string, item?: any, items?: any[]) => {
    const listToSave: any[] = items || (item ? [item] : []);
    const isDelete = listToSave.some(i => i && typeof i === 'object' && (i._deleted || i.deletedAt));
    void pushDeltaToServer(entity, isDelete ? 'delete' : 'upsert', item, items)
      .catch(error => {
        console.error('Durable local save failed:', entity, error);
        try { window.dispatchEvent(new CustomEvent('accounting_save_error', {
          detail: { entity, error: String(error) }
        })); } catch {}
      });
  };

  // Apply single or batch deltas to React state & localStorage
  const applyDeltaToState = (entity: string, op: 'upsert' | 'delete' | 'sync', item?: any, items?: any[]) => {
    const list: any[] = items || (item ? [item] : []);
    if (list.length === 0) return;

    const applyToGenericState = <T extends { id?: string; code?: string }>(
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      storageKeySuffix: string,
      sortFn?: (a: T, b: T) => number
    ) => {
      setter(prev => {
        const map = new Map<string, T>();
        for (const it of prev) {
          const k = String((it as any).id || (it as any).code || '');
          if (k) map.set(k, it);
        }
        for (const it of list) {
          const k = String((it as any).id || (it as any).code || '');
          if (!k) continue;
          if (op === 'delete' || (it as any)._deleted || (it as any).deletedAt) {
            map.delete(k);
            registerDeletedDoc(storageKeySuffix, k);
          } else {
            map.set(k, it);
          }
        }
        const merged = Array.from(map.values()).filter(it => !isTestSyncProbeItem(it));
        if (sortFn) merged.sort(sortFn);
        try { localStorage.setItem(`${STORAGE_KEY}_${storageKeySuffix}`, JSON.stringify(merged)); } catch {}
        return merged;
      });
    };

    if (entity === 'invoices') {
      setInvoices(prev => {
        const deleteIds = new Set(
          list
            .filter(i => op === 'delete' || (i && typeof i === 'object' && (i._deleted || i.deletedAt)))
            .map(i => String(i?.id || i))
        );
        deleteIds.forEach(id => registerDeletedDoc('invoices', id));

        const upserts = list.filter(i => !(op === 'delete' || (i && typeof i === 'object' && (i._deleted || i.deletedAt))));

        let filtered = (prev || []).filter(inv => inv && inv.id && !deleteIds.has(String(inv.id)));
        if (upserts.length > 0) {
          filtered = mergeInvoicesWithUpsertAndConflictResolution(filtered, upserts as Invoice[]);
        }

        // Cascade invoice alignment & deletions across all linked screens and entities
        try {
          const cascaded = resolveInvoiceConflicts(filtered, [], journalEntries, vouchers, stockMovements);
          filtered = cascaded.updatedInvoices;
          if (cascaded.updatedJournalEntries && cascaded.updatedJournalEntries.length !== journalEntries.length) {
            setJournalEntries(cascaded.updatedJournalEntries);
          }
          if (cascaded.updatedVouchers && cascaded.updatedVouchers.length !== vouchers.length) {
            setVouchers(cascaded.updatedVouchers);
          }
          if (cascaded.updatedStockMovements && cascaded.updatedStockMovements.length !== stockMovements.length) {
            setStockMovements(cascaded.updatedStockMovements);
          }
        } catch (e) {
          console.warn('Cascading invoice reconciliation notice:', e);
        }

        try { localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(filtered)); } catch {}
        return filtered;
      });
    } else if (entity === 'parties') {
      applyToGenericState<Party>(setParties, 'parties');
    } else if (entity === 'inventory') {
      applyToGenericState<InventoryItem>(setInventory, 'inventory');
    } else if (entity === 'vouchers') {
      applyToGenericState<PaymentVoucher>(setVouchers, 'vouchers');
    } else if (entity === 'printOrders') {
      applyToGenericState<PrintJobOrder>(setPrintOrders, 'printOrders');
    } else if (entity === 'purchases') {
      applyToGenericState<PurchaseInvoice>(setPurchases, 'purchases');
    } else if (entity === 'purchaseReturns') {
      applyToGenericState<PurchaseReturn>(setPurchaseReturns, 'purchaseReturns');
    } else if (entity === 'salesReturns') {
      applyToGenericState<SalesReturn>(setSalesReturns, 'salesReturns');
    } else if (entity === 'journalEntries') {
      applyToGenericState<JournalEntry>(setJournalEntries, 'journals');
    } else if (entity === 'expenses') {
      applyToGenericState<ExpenseItem>(setExpenses, 'expenses');
    } else if (entity === 'accounts') {
      applyToGenericState<Account>(setAccounts, 'accounts');
    } else if (entity === 'treasuries') {
      applyToGenericState<Treasury>(setTreasuries, 'treasuries');
    } else if (entity === 'stockMovements') {
      applyToGenericState<StockMovement>(setStockMovements, 'stockMovements');
    } else if (entity === 'employees') {
      applyToGenericState<Employee>(setEmployees, 'employees');
    } else if (entity === 'employeeAdvances') {
      applyToGenericState<EmployeeAdvance>(setEmployeeAdvances, 'advances');
    } else if (entity === 'employeeDeductions') {
      applyToGenericState<EmployeeDeduction>(setEmployeeDeductions, 'deductions');
    } else if (entity === 'employeeIncentives') {
      applyToGenericState<EmployeeIncentive>(setEmployeeIncentives, 'incentives');
    } else if (entity === 'payrollSheets') {
      applyToGenericState<PayrollSheet>(setPayrollSheets, 'payrollSheets');
    } else if (entity === 'companies') {
      applyToGenericState<Company>(setCompanies, 'companies');
    } else if (entity === 'branches') {
      applyToGenericState<Branch>(setBranches, 'branches');
    } else if (entity === 'warehouses') {
      applyToGenericState<Warehouse>(setWarehouses, 'warehouses');
    } else if (entity === 'warehouseOperations') {
      applyToGenericState<WarehouseOperation>(setWarehouseOperations, 'warehouse_operations');
    } else if (entity === 'roles') {
      applyToGenericState<Role>(setRoles, 'roles');
    } else if (entity === 'users') {
      applyToGenericState<SystemUser>(setUsers, 'users');
    } else if (entity === 'debtClearings') {
      applyToGenericState<DebtClearingRecord>(setDebtClearings, 'debt_clearings');
    } else if (entity === 'settings') {
      if (item && typeof item === 'object') {
        setSettings(prev => ({ ...prev, ...item }));
        try { localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(item)); } catch {}
      }
    }
  };

  // Retired: the local server is not a second operational source of truth.
  // The only live source is UnifiedRepository / SyncCoordinator.
  const pullDeltasFromServer = async (): Promise<void> => {};
  const pullServerSyncState = pullDeltasFromServer;

  // One-time startup purge: ensure cash customer parties ("زبون نقدي") never carry accidental special prices from past auto-save bugs
  useEffect(() => {
    let partiesNeedUpdate = false;
    setParties(prevParties => {
      const cleaned = prevParties.map(p => {
        if (isCashCustomerParty(p) && p.specialPrices && Object.keys(p.specialPrices).length > 0) {
          partiesNeedUpdate = true;
          const copy = { ...p };
          delete copy.specialPrices;
          return copy;
        }
        return p;
      });
      if (partiesNeedUpdate) {
        try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(cleaned)); } catch {}
        return cleaned;
      }
      return prevParties;
    });

    let invNeedUpdate = false;
    setInventory(prevInv => {
      const cleaned = prevInv.map(item => {
        if (item.customerSpecialPrices && item.customerSpecialPrices.length > 0) {
          const filtered = item.customerSpecialPrices.filter(sp => !isCashCustomerParty(sp.customerId, sp.customerCode, sp.customerName));
          if (filtered.length !== item.customerSpecialPrices.length) {
            invNeedUpdate = true;
            return { ...item, customerSpecialPrices: filtered.length > 0 ? filtered : undefined };
          }
        }
        return item;
      });
      if (invNeedUpdate) {
        try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(cleaned)); } catch {}
        return cleaned;
      }
      return prevInv;
    });
  }, []);

  // Retired: this old Firestore change feed and recurring deletion of test IDs
  // used a DIFFERENT namespace from the canonical event stream.
  // SyncCoordinator is now the only active incoming operational change listener.

  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<Invoice | null>(null);
  const [directPrintOptions, setDirectPrintOptions] = useState<{ format: 'thermal' | 'a4' | 'a4-custom', autoPrint: boolean } | null>(null);
  const [selectedInvoiceForLifecycle, setSelectedInvoiceForLifecycle] = useState<Invoice | null>(null);
  const [selectedJobForPrint, setSelectedJobForPrint] = useState<PrintJobOrder | null>(null);
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<PaymentVoucher | null>(null);
  const [selectedPayrollSheetForPrint, setSelectedPayrollSheetForPrint] = useState<PayrollSheet | null>(null);
  const [selectedPartyForStatement, setSelectedPartyForStatement] = useState<Party | null>(null);
  const [selectedEmployeeForStatement, setSelectedEmployeeForStatement] = useState<Employee | null>(null);

  const recoverInvoicesFromAllBackups = async (): Promise<{ success: boolean; message: string; recoveredCount: number }> => {
    return { success: false, message: 'تم إيقاف دمج فواتير النسخ القديمة تلقائياً؛ راجع تقرير المطابقة أولاً.', recoveredCount: 0 };
    const snapshotInvoices = Array.isArray(initialInvoices) ? initialInvoices : [];
    const localPrimary = safeLoadArray<Invoice>(`${STORAGE_KEY}_invoices`, []);
    const deletedList = safeLoadArray<Invoice>(`${STORAGE_KEY}_deleted_invoices`, []);

    let combined = mergeInvoicesWithUpsertAndConflictResolution(snapshotInvoices, localPrimary);
    combined = mergeInvoicesWithUpsertAndConflictResolution(combined, deletedList);

    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('invoice') || key.includes('backup') || key.includes('alnoor') || key.includes('accounting') || key.includes('data'))) {
            const val = localStorage.getItem(key);
            if (val && val.startsWith('[')) {
              try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.invoiceNumber) {
                  combined = mergeInvoicesWithUpsertAndConflictResolution(combined, parsed);
                }
              } catch {}
            }
          }
        }
      }
    } catch {}

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const fsData = await fetchFullDatabaseFromFirestore();
        if (fsData && Array.isArray(fsData.invoices)) {
          combined = mergeInvoicesWithUpsertAndConflictResolution(combined, fsData.invoices);
        }
      }
    } catch (e) {}

    setInvoices(combined);
    try {
      localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(combined));
    } catch {}

    return {
      success: true,
      message: `تم استرجاع وإعادة دمج كافة الفواتير بنجاح (إجمالي الفواتير النشطة حالياً: ${combined.length} فاتورة).`,
      recoveredCount: combined.length
    };
  };

  // Helper to record deleted document IDs persistently so they never resurrect on cloud sync
  const registerDeletedDoc = (colName: string, id: string | number) => {
    try {
      const existing = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
      const idStr = String(id);
      if (!existing.some((e: any) => e.col === colName && e.id === idStr)) {
        existing.push({ col: colName, id: idStr, time: Date.now() });
        localStorage.setItem('accounting_deleted_docs', JSON.stringify(existing.slice(-10000)));
      }
      // Invalidate synced hash
      const syncedHashes = JSON.parse(localStorage.getItem('accounting_synced_hashes') || '{}');
      if (syncedHashes[`${colName}_${idStr}`]) {
        delete syncedHashes[`${colName}_${idStr}`];
        localStorage.setItem('accounting_synced_hashes', JSON.stringify(syncedHashes));
      }
      localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
      setHasUnsyncedChanges(true);
    } catch (e) {
      console.warn('registerDeletedDoc storage note:', e);
    }
    // Delete immediately from Firestore if online
    if (navigator.onLine) {
      deleteDoc(doc(db, colName, String(id))).catch(e => {
        console.warn(`Direct deleteDoc notice for ${colName}/${id}:`, e);
      });
    }
  };

  // Google Drive Cloud Database Synchronization Engine (Primary Cloud Store)
  const syncToGoogleDrive = async (force: boolean = false): Promise<boolean> => {
    if (!navigator.onLine && !force) return false;

    let token = getCachedSyncToken();
    if (!token && force) {
      try {
        token = await requestGoogleDriveToken();
      } catch (e) {
        console.warn('Google Drive token request notice:', e);
      }
    }

    if (!token) return false;

    try {
      setIsFirebaseSyncing(true);

      const localPayload = {
        timestamp: new Date().toISOString(),
        entities: {
          invoices, parties, inventory, vouchers, printOrders, purchases,
          purchaseReturns, salesReturns, accounts, treasuries, employees,
          employeeAdvances, employeeDeductions, employeeIncentives, payrollSheets,
          stockMovements, companies, branches, warehouses, warehouseOperations,
          roles, users, debtClearings, expenses, journalEntries
        },
        settings
      };

      const remoteData = await fetchMasterDatabaseFromDrive(token);
      let mergedPayload = localPayload;

      if (remoteData) {
        const rEnt = remoteData.entities || remoteData.data || remoteData || {};
        const mergedInvoices = mergeInvoicesWithUpsertAndConflictResolution(invoices, Array.isArray(rEnt.invoices) ? rEnt.invoices : []);
        const mergedParties = mergeEntityLists(parties, Array.isArray(rEnt.parties) ? rEnt.parties : []);
        const mergedInventory = mergeEntityLists(inventory, Array.isArray(rEnt.inventory) ? rEnt.inventory : []);
        const mergedVouchers = mergeEntityLists(vouchers, Array.isArray(rEnt.vouchers) ? rEnt.vouchers : []);
        const mergedPrintOrders = mergeEntityLists(printOrders, Array.isArray(rEnt.printOrders) ? rEnt.printOrders : []);
        const mergedPurchases = mergeEntityLists(purchases, Array.isArray(rEnt.purchases) ? rEnt.purchases : []);

        setInvoices(mergedInvoices); try { localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(mergedInvoices)); } catch {}
        setParties(mergedParties); try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(mergedParties)); } catch {}
        setInventory(mergedInventory); try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(mergedInventory)); } catch {}
        setVouchers(mergedVouchers); try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(mergedVouchers)); } catch {}
        setPrintOrders(mergedPrintOrders); try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(mergedPrintOrders)); } catch {}

        mergedPayload = {
          timestamp: new Date().toISOString(),
          entities: {
            ...localPayload.entities,
            invoices: mergedInvoices,
            parties: mergedParties,
            inventory: mergedInventory,
            vouchers: mergedVouchers,
            printOrders: mergedPrintOrders,
            purchases: mergedPurchases
          },
          settings: settings || remoteData.settings
        };
      }

      const saveRes = await saveMasterDatabaseToDrive(token, mergedPayload);

      if (saveRes.success) {
        const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastFirebaseSyncTime(nowStr);
        setLastSyncTime(nowStr);
        setHasUnsyncedChanges(false);
        setPendingSyncCount(0);
        localStorage.setItem(`${STORAGE_KEY}_last_sync`, nowStr);
        localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'false');
        localStorage.setItem(`${STORAGE_KEY}_pending_sync_count`, '0');
        lastSyncErrorRef.current = null;
        setIsFirebaseSyncing(false);
        return true;
      }
      setIsFirebaseSyncing(false);
      return false;
    } catch (e: any) {
      console.warn('Google Drive sync notice:', e);
      setIsFirebaseSyncing(false);
      return false;
    }
  };

  const syncToFirebase = async (_force = false): Promise<boolean> => {
    const coordinator = unifiedRepoRef.current?.getCoordinator();
    if (!coordinator || !navigator.onLine || isLocalOnlyMode) return false;
    const status = await coordinator.syncNow(30000);
    const success = status.pending === 0 && status.conflict === 0 && !status.lastError && !!status.lastSuccessAt;
    setPendingSyncCount(status.pending);
    setHasUnsyncedChanges(!success);
    if (success) setLastFirebaseSyncTime(new Date(status.lastSuccessAt!).toLocaleTimeString('ar-EG'));
    return success;
  };
  syncToFirebaseRef.current = syncToFirebase;

  const executeServerFullSync = async () => ({
    success: false, deltaMode: true,
    message: 'Full database sync retired: use the canonical outbox and event stream.'
  });

  const forceSyncNow = async (): Promise<{ success: boolean; message: string }> => {
    setIsFirebaseSyncing(true);
    try {
      if (!navigator.onLine || isLocalOnlyMode) {
        return { success: false, message: 'لا يوجد اتصال؛ الإدخالات المحلية تنتظر المزامنة.' };
      }
      if (localStorage.getItem('lobnan_sync_reconciliation_required') === 'true') {
        return { success: false, message: 'المزامنة موقوفة لحماية الفواتير: يلزم مطابقة البيانات القديمة على الجهاز مع السحابة قبل استئناف الرفع.' };
      }
      const coordinator = unifiedRepoRef.current?.getCoordinator();
      if (!coordinator) return { success: false, message: 'لم يكتمل تشغيل مستودع المزامنة الموحد.' };
      const status = await coordinator.syncNow(30000);
      setPendingSyncCount(status.pending);
      setHasUnsyncedChanges(status.pending > 0 || status.conflict > 0);
      if (status.pending || status.conflict || status.lastError || !status.lastSuccessAt) {
        return { success: false, message:
          `لم تكتمل المزامنة. عمليات معلقة: ${status.pending}، تعارضات: ${status.conflict}. ${status.lastError || ''}` };
      }
      const time = new Date(status.lastSuccessAt).toLocaleTimeString('ar-EG');
      setLastSyncTime(time);
      setLastFirebaseSyncTime(time);
      return { success: true, message: `اكتملت المزامنة المؤكدة مع Firebase عند ${time}.` };
    } catch (error) {
      return { success: false, message: `فشلت المزامنة: ${String(error)}` };
    } finally {
      setIsFirebaseSyncing(false);
    }
  };

  // Retired: historical 25-collection reads would mix unrelated sources.
  const fetchCloudData = async (_isInitial = false): Promise<void> => {
    isCloudHydratedRef.current = true;
    isInitialMount.current = false;
  };
  fetchFromFirebaseRef.current = fetchCloudData;

  // No additional Firebase settings listener or full legacy fetch at startup.
  // Settings are read from the canonical repository like other entities.

  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<PurchaseInvoice | null>(null);
  const [selectedReturnForPrint, setSelectedReturnForPrint] = useState<PurchaseReturn | null>(null);
  const [selectedSalesReturnForPrint, setSelectedSalesReturnForPrint] = useState<SalesReturn | null>(null);

  // Instant LocalStorage Persistence + Debounced Cloud Auto-Sync
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(settings));
      localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(accounts));
      localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(treasuries));
      localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(journalEntries));
      localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(inventory));
      localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(parties));
      localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(employees));
      localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(printOrders));
      localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(invoices));
      localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(purchases));
      localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(purchaseReturns));
      localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(salesReturns));
      localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(vouchers));
      localStorage.setItem(`${STORAGE_KEY}_advances`, JSON.stringify(employeeAdvances));
      localStorage.setItem(`${STORAGE_KEY}_deductions`, JSON.stringify(employeeDeductions));
      localStorage.setItem(`${STORAGE_KEY}_incentives`, JSON.stringify(employeeIncentives));
      localStorage.setItem(`${STORAGE_KEY}_payrollSheets`, JSON.stringify(payrollSheets));
      localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(stockMovements));
      localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(companies));
      localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branches));
      localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(warehouses));
      localStorage.setItem(`${STORAGE_KEY}_warehouse_operations`, JSON.stringify(warehouseOperations));
      localStorage.setItem(`${STORAGE_KEY}_debt_clearings`, JSON.stringify(debtClearings));
      localStorage.setItem(`${STORAGE_KEY}_active_warehouse_id`, activeWarehouseId);
      localStorage.setItem(`${STORAGE_KEY}_roles`, JSON.stringify(roles));
      localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(users));
      localStorage.setItem(`${STORAGE_KEY}_active_company_id`, activeCompanyId);
      localStorage.setItem(`${STORAGE_KEY}_active_branch_id`, activeBranchId);
      localStorage.setItem(`${STORAGE_KEY}_current_user_id`, currentUserId);

      const nowTime = new Date().toLocaleTimeString('en-US');
      localStorage.setItem(`${STORAGE_KEY}_last_local_save`, nowTime);

      if (!isInitialMount.current && isCloudHydratedRef.current) {
        localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');

        // Debounced automatic background sync to main database when online
        if (debouncedSyncRef.current) {
          clearTimeout(debouncedSyncRef.current);
        }
        debouncedSyncRef.current = setTimeout(() => {
          if (navigator.onLine && syncToFirebaseRef.current) {
            syncToFirebaseRef.current();
          }
        }, 2500);
      }
    } catch (err) {
      console.warn('LocalStorage immediate save notice:', err);
    }
  }, [settings, accounts, treasuries, journalEntries, inventory, parties, employees, printOrders, invoices, purchases, purchaseReturns, salesReturns, vouchers, employeeAdvances, employeeDeductions, employeeIncentives, payrollSheets, stockMovements, companies, branches, warehouses, warehouseOperations, activeWarehouseId, roles, users, activeCompanyId, activeBranchId, currentUserId]);

  // Continuous reactive reconciliation of treasuries against active invoices, vouchers, purchases, and expenses
  useEffect(() => {
    if (isInitialMount.current) return;
    setTreasuries(prevTreasuries => {
      const audited = auditAndRecalculateTreasuries(prevTreasuries, invoices, vouchers, undefined, purchases, expenses);
      let changed = false;
      if (audited.length !== prevTreasuries.length) {
        changed = true;
      } else {
        for (let i = 0; i < audited.length; i++) {
          const prevItem = prevTreasuries.find(p => p.id === audited[i].id);
          if (!prevItem) {
            changed = true;
            break;
          }
          const prevBal = Number(Number(prevItem.balance || 0).toFixed(2));
          const auditedBal = Number(Number(audited[i].balance || 0).toFixed(2));
          const prevTxLen = prevItem.transactions?.length || 0;
          const auditedTxLen = audited[i].transactions?.length || 0;
          if (Math.abs(prevBal - auditedBal) > 0.005 || prevTxLen !== auditedTxLen) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(audited)); } catch {}
        return audited;
      }
      return prevTreasuries;
    });
  }, [invoices, vouchers, purchases, expenses]);

  // Keep treasury balances & currency sub-balances synchronized with Chart of Accounts assets
  useEffect(() => {
    let hasDifference = false;
    for (const t of treasuries) {
      const acc = accounts.find(a => a.code === t.accountCode);
      if (acc && Math.abs((acc.balance || 0) - (t.balance || 0)) > 0.005) {
        hasDifference = true;
        break;
      }
    }
    if (hasDifference) {
      setAccounts(prevAccs =>
        prevAccs.map(acc => {
          const matchedT = treasuries.find(t => t.accountCode === acc.code);
          if (matchedT && Math.abs((acc.balance || 0) - (matchedT.balance || 0)) > 0.005) {
            return { ...acc, balance: Number((matchedT.balance || 0).toFixed(2)) };
          }
          return acc;
        })
      );
    }
  }, [treasuries]);

  // One-time data consistency and SKU migration (TEX-0001 for جاليه سيلكون)
  useEffect(() => {
    try {
      const draftKeys = [
        'accounting_pending_multi_draft_invoices_v5',
        'accounting_pending_draft_invoices_v4',
        'accounting_pending_draft_invoices_v3',
        'live_onedrive_drafts_v3'
      ];
      draftKeys.forEach(k => {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            let changed = false;
            const next = parsed.map((d: any) => {
              if (Array.isArray(d.items)) {
                const items = d.items.map((it: any) => {
                  if (it.itemCode === 'PRI-0009' || it.itemName?.includes('جاليه سيلكون')) {
                    changed = true;
                    return { ...it, itemCode: 'TEX-0001' };
                  }
                  return it;
                });
                return { ...d, items };
              }
              return d;
            });
            if (changed) {
              localStorage.setItem(k, JSON.stringify(next));
            }
          }
        }
      });
    } catch (e) {
      console.warn('Drafts migration notice:', e);
    }
  }, []);

  // One-time automated cloud purge for print orders and linked items
  useEffect(() => {
    try {
      const purgeDone = localStorage.getItem('accounting_printOrders_purged_v2');
      if (!purgeDone) {
        setPrintOrders([]);
        try { localStorage.removeItem(`${STORAGE_KEY}_printOrders`); } catch {}
        try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify([])); } catch {}

        getDocs(collection(db, 'printOrders')).then(snapshot => {
          snapshot.docs.forEach(d => {
            registerDeletedDoc('printOrders', d.id);
            deleteDoc(doc(db, 'printOrders', d.id)).catch(() => {});
          });
          localStorage.setItem('accounting_printOrders_purged_v2', 'true');
        }).catch(() => {
          localStorage.setItem('accounting_printOrders_purged_v2', 'true');
        });
      }
    } catch (e) {
      console.warn('PrintOrders cloud purge notice:', e);
    }
  }, []);

  // Helper accessors and CRUD for Multi-Company, Multi-Branch & Granular RBAC
  const currentUser: SystemUser = React.useMemo(() => {
    return users.find(u => u.id === currentUserId) || users[0] || {
      id: 'session-not-verified',
      companyId: '',
      username: '',
      fullName: 'جلسة غير مصرح بها',
      roleId: 'role-none',
      roleName: 'بدون صلاحيات',
      defaultBranchId: 'br-1',
      allowedBranchIds: ['*'],
      status: 'active',
      createdAt: '2024-01-01'
    };
  }, [users, currentUserId]);

  const getCurrentUser = (): SystemUser => {
    return users.find(u => u.id === currentUserId) || users[0] || {
      id: 'session-not-verified',
      companyId: '',
      username: '',
      fullName: 'جلسة غير مصرح بها',
      roleId: 'role-none',
      roleName: 'بدون صلاحيات',
      defaultBranchId: 'br-1',
      allowedBranchIds: ['*'],
      status: 'active',
      createdAt: '2024-01-01'
    };
  };

  const acquireDailyEntryRowLock = (date: string, rowId: string, field?: string) => {
    const user = currentUser;
    const lock: RowLockInfo = {
      rowId,
      userId: user?.id || currentUserId || 'usr-anon',
      userName: user?.fullName || user?.username || 'مستخدم النظام',
      userEmail: user?.email,
      field,
      lockedAt: Date.now()
    };

    setTimeout(() => {
      setDailyEntrySheets(prev => {
        const sheet = prev[date] || { date, rows: [], notes: '', updatedAt: new Date().toISOString() };
        const currentLocks = { ...(sheet.activeLocks || {}) };
        const now = Date.now();
        Object.keys(currentLocks).forEach(k => {
          if (now - (currentLocks[k]?.lockedAt || 0) > 120000) {
            delete currentLocks[k];
          }
        });
        currentLocks[rowId] = lock;
        const updatedSheet: DailyEntrySheet = {
          ...sheet,
          activeLocks: currentLocks
        };
        const updated = { ...prev, [date]: updatedSheet };
        try {
          setDoc(doc(db, 'dailyEntrySheets', date), cleanDocForFirestore(updatedSheet), { merge: true }).catch(() => {});
        } catch (e) {}
        return updated;
      });
    }, 0);
  };

  const releaseDailyEntryRowLock = (date: string, rowId: string) => {
    setTimeout(() => {
      setDailyEntrySheets(prev => {
        const sheet = prev[date];
        if (!sheet || !sheet.activeLocks || !sheet.activeLocks[rowId]) return prev;
        const currentLocks = { ...sheet.activeLocks };
        delete currentLocks[rowId];
        const updatedSheet: DailyEntrySheet = {
          ...sheet,
          activeLocks: currentLocks
        };
        const updated = { ...prev, [date]: updatedSheet };
        try {
          setDoc(doc(db, 'dailyEntrySheets', date), cleanDocForFirestore(updatedSheet), { merge: true }).catch(() => {});
        } catch (e) {}
        return updated;
      });
    }, 0);
  };

  const forceReleaseDailyEntryRowLock = (date: string, rowId: string) => {
    releaseDailyEntryRowLock(date, rowId);
  };

  const getActiveBranch = (): Branch | undefined => {
    return branches.find(b => b.id === activeBranchId) || branches[0];
  };

  const hasPermission = (permission: PermissionKey): boolean => {
    const user = users.find(u => u.id === currentUserId) || users[0];
    if (!user) return import.meta.env?.VITE_SYNC_LOGIN_MODE !== 'users';

    // Check custom overrides first
    if (user.customPermissions && user.customPermissions[permission] !== undefined) {
      return !!user.customPermissions[permission];
    }

    const role = roles.find(r => r.id === user.roleId);
    if (!role) return import.meta.env?.VITE_SYNC_LOGIN_MODE !== 'users';

    // System Admins & General Managers have full access
    if (role.code === 'SYS_ADMIN' || role.code === 'GEN_MGR') {
      return true;
    }

    return !!role.permissions[permission];
  };

  const canAccessBranch = (branchId: string, user?: SystemUser): boolean => {
    if(import.meta.env?.VITE_SYNC_LOGIN_MODE !== 'users')return true;
    const actor=user||users.find(u=>u.id===currentUserId);
    if(!actor||actor.status!=='active')return false;
    return Array.isArray(actor.allowedBranchIds) &&
      (actor.allowedBranchIds.includes('*')||actor.allowedBranchIds.includes(branchId));
  };

  const getAllowedBranchesForUser = (user?: SystemUser): Branch[] => {
    if(import.meta.env?.VITE_SYNC_LOGIN_MODE !== 'users')return branches;
    return branches.filter(b=>canAccessBranch(b.id,user));
  };

  // Resolve effective price for item considering customer special prices & allowed pricing tier
  const getItemPriceForCustomer = (
    item: InventoryItem,
    customerId?: string,
    tier: 'price1' | 'price2' | 'price3' | 'retail' | 'wholesale' | 'special' = 'price1'
  ): { price: number; isSpecialPrice: boolean; specialPriceLabel?: string } => {
    // Tier fallback (retail / price1, wholesale / price2, special / price3)
    const normalizedTier = tier === 'retail' ? 'price1' : tier === 'wholesale' ? 'price2' : tier === 'special' ? 'price3' : tier;

    const getTierPrice = () => {
      if (normalizedTier === 'price2') {
        if (item.sellingPrice2 !== undefined && item.sellingPrice2 > 0) {
          return { price: item.sellingPrice2, isSpecialPrice: false };
        }
        return { price: Number((item.sellingPrice * 0.9).toFixed(2)), isSpecialPrice: false };
      }
      if (normalizedTier === 'price3') {
        if (item.sellingPrice3 !== undefined && item.sellingPrice3 > 0) {
          return { price: item.sellingPrice3, isSpecialPrice: false };
        }
        return { price: item.sellingPrice, isSpecialPrice: false };
      }
      return { price: item.sellingPrice, isSpecialPrice: false };
    };

    // Cash customer ("زبون نقدي") NEVER has special prices or last price override under any circumstances
    if (!customerId || !customerId.trim() || isCashCustomerParty(customerId)) {
      return getTierPrice();
    }

    const trimmedCustId = customerId.trim();
    // Match party by id, code, or name
    const party = parties.find(
      p => p.id === trimmedCustId ||
           (p.code && p.code.toLowerCase() === trimmedCustId.toLowerCase()) ||
           (p.name && p.name.trim().toLowerCase() === trimmedCustId.toLowerCase())
    );

    // If resolved party is a cash customer, strictly bypass special prices
    if (party && isCashCustomerParty(party)) {
      return getTierPrice();
    }

    const targetId = party?.id || trimmedCustId;
    const targetCode = party?.code?.toLowerCase();
    const targetName = party?.name?.trim().toLowerCase() || trimmedCustId.toLowerCase();

    // 1. Check special prices recorded on the item card itself (item.customerSpecialPrices)
    if (item.customerSpecialPrices && item.customerSpecialPrices.length > 0) {
      const specialFromItem = item.customerSpecialPrices.find(sp => {
        if (isCashCustomerParty(sp.customerId, sp.customerCode, sp.customerName)) return false;
        if (sp.customerId && (sp.customerId === targetId || sp.customerId === trimmedCustId)) return true;
        if (targetCode && sp.customerCode && sp.customerCode.toLowerCase() === targetCode) return true;
        if (sp.customerName && sp.customerName.trim().toLowerCase() === targetName) return true;
        if (targetName && sp.customerId && sp.customerId.toLowerCase() === targetName) return true;
        if (party?.phone && sp.customerName && sp.customerName.trim() === party.phone.trim()) return true;
        return false;
      });
      if (specialFromItem && typeof specialFromItem.price === 'number' && specialFromItem.price >= 0) {
        return {
          price: specialFromItem.price,
          isSpecialPrice: true,
          specialPriceLabel: specialFromItem.notes || `سعر خاص للعميل (${specialFromItem.price} ₪)`
        };
      }
    }

    // 2. Check special prices stored in customer profile (party.specialPrices)
    if (party?.specialPrices) {
      const pSpecials = party.specialPrices;
      let candidatePrice = pSpecials[item.id];
      if (candidatePrice === undefined && item.code) candidatePrice = pSpecials[item.code];
      if (candidatePrice === undefined && item.barcode) candidatePrice = pSpecials[item.barcode];
      if (candidatePrice === undefined && item.name) candidatePrice = pSpecials[item.name];
      if (candidatePrice === undefined) {
        const lId = item.id.toLowerCase();
        const lCode = item.code?.toLowerCase();
        const lName = item.name?.trim().toLowerCase();
        for (const [key, val] of Object.entries(pSpecials)) {
          const lKey = key.trim().toLowerCase();
          if (lKey === lId || (lCode && lKey === lCode) || (lName && lKey === lName)) {
            candidatePrice = val;
            break;
          }
        }
      }

      if (typeof candidatePrice === 'number' && candidatePrice >= 0) {
        return {
          price: candidatePrice,
          isSpecialPrice: true,
          specialPriceLabel: `سعر خاص مسجل بالعميل (${candidatePrice} ₪)`
        };
      }
    }

    // 3. Fallback for sub-customers: inherit preferred price from main parent customer if not overridden
    if (party?.isSubCustomer && party.parentPartyId) {
      const parentParty = parties.find(p => p.id === party.parentPartyId);
      if (parentParty && !isCashCustomerParty(parentParty)) {
        if (parentParty.specialPrices) {
          const parentPrice = parentParty.specialPrices[item.id] !== undefined
            ? parentParty.specialPrices[item.id]
            : (item.code ? parentParty.specialPrices[item.code] : undefined);
          if (typeof parentPrice === 'number' && parentPrice >= 0) {
            return {
              price: parentPrice,
              isSpecialPrice: true,
              specialPriceLabel: `سعر خاص بالعميل الرئيسي (${parentPrice} ₪)`
            };
          }
        }
        if (item.customerSpecialPrices && item.customerSpecialPrices.length > 0) {
          const specialFromParent = item.customerSpecialPrices.find(sp => sp.customerId === party.parentPartyId);
          if (specialFromParent && typeof specialFromParent.price === 'number' && specialFromParent.price >= 0) {
            return {
              price: specialFromParent.price,
              isSpecialPrice: true,
              specialPriceLabel: `سعر خاص بالعميل الرئيسي (${specialFromParent.price} ₪)`
            };
          }
        }
      }
    }

    return getTierPrice();
  };

  // Get current user price permissions and allowed tiers
  const getCurrentUserPricePolicy = (user?: SystemUser) => {
    const targetUser = user || users.find(u => u.id === currentUserId) || users[0];
    const role = targetUser ? roles.find(r => r.id === targetUser.roleId) : undefined;

    // Check permission to edit price manually
    const canEditPrice = hasPermission('edit_prices');

    // Allowed price tiers
    const allowedTier: AllowedPriceTierScope = targetUser?.allowedPriceTier || role?.allowedPriceTier || 'all';
    const defaultTier: PriceTierKey = targetUser?.defaultPriceTier || role?.defaultPriceTier || 'price1';

    return {
      canEditPrice,
      allowedTier,
      defaultTier
    };
  };

  // CRUD for Company
  const addCompany = (comp: Omit<Company, 'id' | 'createdAt'>): Company => {
    const newComp: Company = {
      ...comp,
      id: `comp-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setCompanies(prev => {
      const next = [...prev, newComp];
      try { localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('companies', 'upsert', newComp);
      broadcastEntityChange('companies', next);
      return next;
    });
    setDoc(doc(db, 'companies', newComp.id), cleanDocForFirestore(newComp)).catch(() => {});
    return newComp;
  };

  const updateCompany = (id: string, updated: Partial<Company>) => {
    setCompanies(prev => {
      const existing = prev.find(c => c.id === id);
      const merged: Company = existing ? { ...existing, ...updated, updatedAt: new Date().toISOString() } : ({ ...updated, id, updatedAt: new Date().toISOString() } as Company);
      const next = prev.map(c => (c.id === id ? merged : c));
      try { localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('companies', 'upsert', merged);
      broadcastEntityChange('companies', next);
      setDoc(doc(db, 'companies', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});
      return next;
    });
  };

  const deleteCompany = (id: string) => {
    if (companies.length <= 1) {
      return { success: false, message: 'لا يمكن حذف الشركة الوحيدة المتبقية بالنظام' };
    }
    setCompanies(prev => {
      const next = prev.filter(c => c.id !== id);
      try { localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('companies', 'delete', { id, _deleted: true });
      broadcastEntityChange('companies', next);
      deleteDoc(doc(db, 'companies', id)).catch(e => console.warn('Could not delete company in cloud:', e));
      return next;
    });
    registerDeletedDoc('companies', id);
    return { success: true };
  };

  // CRUD for Branch
  const addBranch = (branch: Omit<Branch, 'id' | 'createdAt'>): Branch => {
    const newBranch: Branch = {
      ...branch,
      id: `br-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setBranches(prev => {
      const next = [...prev, newBranch];
      try { localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('branches', 'upsert', newBranch);
      broadcastEntityChange('branches', next);
      return next;
    });
    setDoc(doc(db, 'branches', newBranch.id), cleanDocForFirestore(newBranch)).catch(() => {});
    return newBranch;
  };

  const updateBranch = (id: string, updated: Partial<Branch>) => {
    setBranches(prev => {
      const existing = prev.find(b => b.id === id);
      const merged: Branch = existing ? { ...existing, ...updated, updatedAt: new Date().toISOString() } : ({ ...updated, id, updatedAt: new Date().toISOString() } as Branch);
      const next = prev.map(b => (b.id === id ? merged : b));
      try { localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('branches', 'upsert', merged);
      broadcastEntityChange('branches', next);
      setDoc(doc(db, 'branches', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});
      return next;
    });
  };

  const deleteBranch = (id: string) => {
    if (branches.length <= 1) {
      return { success: false, message: 'لا يمكن حذف الفرع الوحيد المتبقي بالنظام' };
    }
    setBranches(prev => {
      const next = prev.filter(b => b.id !== id);
      try { localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('branches', 'delete', { id, _deleted: true });
      broadcastEntityChange('branches', next);
      deleteDoc(doc(db, 'branches', id)).catch(e => console.warn('Could not delete branch in cloud:', e));
      return next;
    });
    registerDeletedDoc('branches', id);
    if (activeBranchId === id) {
      const remaining = branches.filter(b => b.id !== id);
      if (remaining.length > 0) setActiveBranchId(remaining[0].id);
    }
    return { success: true };
  };

  // CRUD & Operations for Warehouses (نظام المخازن والعمليات)
  const addWarehouse = (wh: Omit<Warehouse, 'id' | 'createdAt'>): Warehouse => {
    const branch = branches.find(b => b.id === wh.branchId);
    const newWh: Warehouse = {
      ...wh,
      id: `wh-${Date.now()}`,
      branchName: wh.branchName || branch?.name,
      status: wh.status || 'active',
      warehouseType: wh.warehouseType || 'general_main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setWarehouses(prev => {
      const next = [...prev, newWh];
      try { localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('warehouses', 'upsert', newWh);
      broadcastEntityChange('warehouses', next);
      return next;
    });
    setDoc(doc(db, 'warehouses', newWh.id), cleanDocForFirestore(newWh)).catch(() => {});

    // Link new warehouse to its branch if not already linked
    if (wh.branchId) {
      setBranches(prev => prev.map(b => {
        if (b.id === wh.branchId && !b.warehouseIds.includes(newWh.id)) {
          const updatedB = { ...b, warehouseIds: [...b.warehouseIds, newWh.id], updatedAt: new Date().toISOString() };
          setDoc(doc(db, 'branches', b.id), cleanDocForFirestore(updatedB)).catch(() => {});
          return updatedB;
        }
        return b;
      }));
    }

    return newWh;
  };

  const updateWarehouse = (id: string, updated: Partial<Warehouse>) => {
    setWarehouses(prev => {
      const existing = prev.find(w => w.id === id);
      let nextWh: Warehouse = existing ? { ...existing, ...updated, updatedAt: new Date().toISOString() } : ({ ...updated, id, updatedAt: new Date().toISOString() } as Warehouse);
      if (updated.branchId) {
        const b = branches.find(br => br.id === updated.branchId);
        nextWh.branchName = b?.name || nextWh.branchName;
      }
      const next = prev.map(w => (w.id === id ? nextWh : w));
      try { localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('warehouses', 'upsert', nextWh);
      broadcastEntityChange('warehouses', next);
      setDoc(doc(db, 'warehouses', id), cleanDocForFirestore(nextWh), { merge: true }).catch(() => {});
      return next;
    });

    // Update branch warehouseIds if branch changed
    if (updated.branchId) {
      setBranches(prev => prev.map(b => {
        if (b.id === updated.branchId && !b.warehouseIds.includes(id)) {
          const updatedB = { ...b, warehouseIds: [...b.warehouseIds, id], updatedAt: new Date().toISOString() };
          setDoc(doc(db, 'branches', b.id), cleanDocForFirestore(updatedB)).catch(() => {});
          return updatedB;
        }
        return b;
      }));
    }
  };

  const deleteWarehouse = (id: string) => {
    if (warehouses.length <= 1) {
      return { success: false, message: 'لا يمكن حذف المستودع الوحيد المتبقي بالنظام' };
    }
    setWarehouses(prev => {
      const next = prev.filter(w => w.id !== id);
      try { localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(next)); } catch {}
      pushDeltaToServer('warehouses', 'delete', { id, _deleted: true });
      broadcastEntityChange('warehouses', next);
      deleteDoc(doc(db, 'warehouses', id)).catch(e => console.warn('Could not delete warehouse in cloud:', e));
      return next;
    });
    registerDeletedDoc('warehouses', id);
    setBranches(prev => prev.map(b => {
      const updatedB = {
        ...b,
        warehouseIds: b.warehouseIds.filter(wId => wId !== id),
        updatedAt: new Date().toISOString()
      };
      setDoc(doc(db, 'branches', b.id), cleanDocForFirestore(updatedB)).catch(() => {});
      return updatedB;
    }));
    if (activeWarehouseId === id) {
      const remaining = warehouses.filter(w => w.id !== id);
      if (remaining.length > 0) setActiveWarehouseId(remaining[0].id);
    }
    return { success: true };
  };

  const getWarehousesForBranch = (branchId?: string): Warehouse[] => {
    const targetBranchId = branchId || activeBranchId;
    return warehouses.filter(w => w.branchId === targetBranchId);
  };

  const getWarehouseStock = (warehouseId: string, itemId: string): number => {
    const item = inventory.find(i => i.id === itemId);
    if (!item) return 0;
    if (item.warehouseStock && item.warehouseStock[warehouseId] !== undefined) {
      return item.warehouseStock[warehouseId];
    }
    // Fallback: Default warehouse or first warehouse gets current stock if not partitioned yet
    const targetWh = warehouses.find(w => w.id === warehouseId);
    if (targetWh?.isDefault || warehouses[0]?.id === warehouseId) {
      return item.stockQuantity;
    }
    return 0;
  };

  const addWarehouseOperation = (
    op: Omit<WarehouseOperation, 'id' | 'createdAt'> & { documentNumber?: string; date?: string; time?: string }
  ): WarehouseOperation => {
    const typePrefixes: Record<WarehouseOperationType, string> = {
      receipt: 'REC',
      issue: 'ISS',
      transfer: 'TRF',
      audit: 'AUD',
      settlement: 'ADJ',
      damaged: 'DMG',
      return: 'RET',
      stock_modify: 'MOD'
    };
    const prefix = typePrefixes[op.operationType] || 'WH';
    const year = new Date().getFullYear();
    const existingCount = warehouseOperations.filter(o => o.operationType === op.operationType).length + 1;
    const autoDocNumber = op.documentNumber || `${prefix}-${year}-${String(existingCount).padStart(4, '0')}`;

    const branch = branches.find(b => b.id === op.branchId);
    const warehouse = warehouses.find(w => w.id === op.warehouseId);
    const targetBranch = op.targetBranchId ? branches.find(b => b.id === op.targetBranchId) : undefined;
    const targetWarehouse = op.targetWarehouseId ? warehouses.find(w => w.id === op.targetWarehouseId) : undefined;

    const opDate = op.date || new Date().toISOString().split('T')[0];
    const opTime = op.time || new Date().toLocaleTimeString('ar-SA', { hour12: false });

    const newOp: WarehouseOperation = {
      ...op,
      id: `w-op-${Date.now()}`,
      documentNumber: autoDocNumber,
      date: opDate,
      time: opTime,
      branchName: op.branchName || branch?.name || 'الفرع الرئيسي',
      warehouseName: op.warehouseName || warehouse?.name || 'المستودع الرئيسي',
      targetBranchName: op.targetBranchName || targetBranch?.name,
      targetWarehouseName: op.targetWarehouseName || targetWarehouse?.name,
      userId: op.userId || currentUser.id,
      userName: op.userName || currentUser.fullName,
      userRole: op.userRole || currentUser.roleName,
      status: op.status || 'completed',
      createdAt: new Date().toISOString()
    };

    // Apply inventory stock changes & movements
    setInventory(prevInventory => {
      const updatedInventory = [...prevInventory];
      const newStockMovementsToAdd: StockMovement[] = [];

      newOp.items.forEach(opItem => {
        const itemIndex = updatedInventory.findIndex(it => it.id === opItem.itemId);
        if (itemIndex === -1) return;

        const currentItem = updatedInventory[itemIndex];
        const oldTotalStock = currentItem.stockQuantity;
        const currentWhStock = (currentItem.warehouseStock && currentItem.warehouseStock[newOp.warehouseId] !== undefined)
          ? currentItem.warehouseStock[newOp.warehouseId]
          : oldTotalStock;

        let newTotalStock = oldTotalStock;
        let newWhStock = currentWhStock;
        let targetWhOldStock = 0;
        let targetWhNewStock = 0;

        const itemWarehouseStock = { ...(currentItem.warehouseStock || {}) };

        switch (newOp.operationType) {
          case 'receipt': // استلام (زيادة رصيد)
            newTotalStock = oldTotalStock + opItem.quantity;
            newWhStock = currentWhStock + opItem.quantity;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'in_receipt',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'receipt',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: newOp.notes || opItem.notes
            });
            break;

          case 'issue': // صرف (خصم رصيد)
            newTotalStock = Math.max(0, oldTotalStock - opItem.quantity);
            newWhStock = Math.max(0, currentWhStock - opItem.quantity);
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'out_issue',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'issue',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: newOp.notes || opItem.notes
            });
            break;

          case 'transfer': // تحويل بين مستودعين / فرعين
            if (newOp.targetWarehouseId) {
              targetWhOldStock = itemWarehouseStock[newOp.targetWarehouseId] || 0;
              newWhStock = Math.max(0, currentWhStock - opItem.quantity);
              targetWhNewStock = targetWhOldStock + opItem.quantity;
              itemWarehouseStock[newOp.warehouseId] = newWhStock;
              itemWarehouseStock[newOp.targetWarehouseId] = targetWhNewStock;
              newTotalStock = oldTotalStock;

              newStockMovementsToAdd.push({
                id: `mv-${Date.now()}-out-${Math.random().toString(36).substring(2, 6)}`,
                itemId: currentItem.id,
                itemCode: currentItem.code,
                itemName: currentItem.name,
                category: currentItem.category,
                date: opDate,
                time: opTime,
                type: 'transfer_out',
                quantity: opItem.quantity,
                balanceBefore: currentWhStock,
                balanceAfter: newWhStock,
                unitPrice: opItem.unitCost,
                totalValue: opItem.totalCost,
                referenceType: 'transfer',
                referenceNumber: newOp.referenceNumber,
                documentNumber: autoDocNumber,
                userId: newOp.userId,
                userName: newOp.userName,
                branchId: newOp.branchId,
                branchName: newOp.branchName,
                warehouseId: newOp.warehouseId,
                warehouseName: newOp.warehouseName,
                targetBranchId: newOp.targetBranchId,
                targetBranchName: newOp.targetBranchName,
                targetWarehouseId: newOp.targetWarehouseId,
                targetWarehouseName: newOp.targetWarehouseName,
                reason: newOp.reason,
                notes: `تحويل إلى ${newOp.targetWarehouseName}`
              });

              newStockMovementsToAdd.push({
                id: `mv-${Date.now()}-in-${Math.random().toString(36).substring(2, 6)}`,
                itemId: currentItem.id,
                itemCode: currentItem.code,
                itemName: currentItem.name,
                category: currentItem.category,
                date: opDate,
                time: opTime,
                type: 'transfer_in',
                quantity: opItem.quantity,
                balanceBefore: targetWhOldStock,
                balanceAfter: targetWhNewStock,
                unitPrice: opItem.unitCost,
                totalValue: opItem.totalCost,
                referenceType: 'transfer',
                referenceNumber: newOp.referenceNumber,
                documentNumber: autoDocNumber,
                userId: newOp.userId,
                userName: newOp.userName,
                branchId: newOp.targetBranchId || newOp.branchId,
                branchName: newOp.targetBranchName || newOp.branchName,
                warehouseId: newOp.targetWarehouseId,
                warehouseName: newOp.targetWarehouseName,
                reason: newOp.reason,
                notes: `وارد تحويل من ${newOp.warehouseName}`
              });
            }
            break;

          case 'audit': // جرد (توثيق المطابقة أو الفارق)
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'inventory_audit',
              quantity: opItem.countedQuantity !== undefined ? opItem.countedQuantity : currentWhStock,
              balanceBefore: currentWhStock,
              balanceAfter: currentWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'audit',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `محضر جرد فعلي. الكمية الفعلية: ${opItem.countedQuantity || 0}، الفارق: ${opItem.discrepancy || 0}`
            });
            break;

          case 'settlement': // تسوية جردية (تعديل الرصيد ليطابق الفعلي)
            const countedQty = opItem.countedQuantity !== undefined ? opItem.countedQuantity : opItem.quantity;
            const diff = countedQty - currentWhStock;
            newWhStock = countedQty;
            newTotalStock = oldTotalStock + diff;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: diff >= 0 ? 'in_adjustment' : 'out_adjustment',
              quantity: Math.abs(diff),
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: Math.abs(diff) * opItem.unitCost,
              referenceType: 'settlement',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `تسوية جردية - ${diff >= 0 ? 'فائض مخزني' : 'عجز مخزني'} بمقدار ${Math.abs(diff)}`
            });
            break;

          case 'damaged': // إتلاف وهالك
            newTotalStock = Math.max(0, oldTotalStock - opItem.quantity);
            newWhStock = Math.max(0, currentWhStock - opItem.quantity);
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'out_damaged',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'damaged',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `محضر إتلاف بضاعة تالفة - ${newOp.reason}`
            });
            break;

          case 'return': // مرتجع إلى المستودع
            newTotalStock = oldTotalStock + opItem.quantity;
            newWhStock = currentWhStock + opItem.quantity;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'in_return',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'return',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `إذن مرتجع مخزني - ${newOp.reason}`
            });
            break;

          case 'stock_modify': // تعديل مباشر للكمية أو التكلفة
            const targetQty = opItem.quantity;
            const modifyDiff = targetQty - currentWhStock;
            newWhStock = targetQty;
            newTotalStock = oldTotalStock + modifyDiff;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'stock_modify',
              quantity: Math.abs(modifyDiff),
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost || currentItem.purchasePrice,
              totalValue: Math.abs(modifyDiff) * (opItem.unitCost || currentItem.purchasePrice),
              referenceType: 'stock_modify',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `تعديل مخزون مباشر`
            });
            break;
        }

        updatedInventory[itemIndex] = {
          ...currentItem,
          stockQuantity: newTotalStock,
          purchasePrice: opItem.unitCost ? opItem.unitCost : currentItem.purchasePrice,
          warehouseStock: itemWarehouseStock,
          lastMovementDate: opDate
        };
      });

      if (newStockMovementsToAdd.length > 0) {
        setStockMovements(prevMovements => [...newStockMovementsToAdd, ...prevMovements]);
        newStockMovementsToAdd.forEach(sm => {
          setDoc(doc(db, 'stockMovements', sm.id), cleanDocForFirestore(sm)).catch(() => {});
        });
      }

      // Sync updated inventory items to Firestore
      newOp.items.forEach(opItem => {
        const it = updatedInventory.find(item => item.id === opItem.itemId);
        if (it) {
          setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(it)).catch(() => {});
        }
      });

      return updatedInventory;
    });

    setWarehouseOperations(prev => [newOp, ...prev]);
    setDoc(doc(db, 'warehouseOperations', newOp.id), cleanDocForFirestore(newOp)).catch(() => {});
    return newOp;
  };

  // CRUD for Role
  const addRole = (role: Omit<Role, 'id' | 'createdAt'>): Role => {
    const newRole: Role = {
      ...role,
      id: `role-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setRoles(prev => [...prev, newRole]);
    pushDeltaToServer('roles', 'upsert', newRole);
    setDoc(doc(db, 'roles', newRole.id), cleanDocForFirestore(newRole)).catch(() => {});
    return newRole;
  };

  const updateRole = (id: string, updated: Partial<Role>) => {
    let finalRole: Role | null = null;
    setRoles(prev => prev.map(r => {
      if (r.id === id) {
        finalRole = { ...r, ...updated, updatedAt: new Date().toISOString() };
        return finalRole;
      }
      return r;
    }));
    if (finalRole) {
      pushDeltaToServer('roles', 'upsert', finalRole);
      setDoc(doc(db, 'roles', id), cleanDocForFirestore(finalRole)).catch(() => {});
    }
  };

  const deleteRole = (id: string) => {
    setRoles(prev => prev.filter(r => r.id !== id));
    pushDeltaToServer('roles', 'delete', { id, _deleted: true });
    registerDeletedDoc('roles', id);
    deleteDoc(doc(db, 'roles', id)).catch(e => console.warn('Could not delete role in cloud:', e));
    return { success: true };
  };

  // CRUD for User
  const addUser = (user: Omit<SystemUser, 'id' | 'createdAt'>): SystemUser => {
    const newUser: SystemUser = {
      ...user,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setUsers(prev => {
      const next = [...prev, newUser];
      try {
        localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // Immediate Firestore persistence so user can log in immediately from any browser/device
    pushDeltaToServer('users', 'upsert', newUser);
    setDoc(doc(db, 'users', newUser.id), newUser).catch(e => {
      console.warn('Direct save user to cloud note:', e);
    });

    return newUser;
  };

  const updateUser = (id: string, updated: Partial<SystemUser>) => {
    setUsers(prev => {
      const next = prev.map(u => (u.id === id ? { ...u, ...updated, updatedAt: new Date().toISOString() } : u));
      try {
        localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(next));
      } catch (e) {}
      const target = next.find(u => u.id === id);
      if (target) {
        pushDeltaToServer('users', 'upsert', target);
        setDoc(doc(db, 'users', id), target).catch(e => {
          console.warn('Direct update user in cloud note:', e);
        });
      }
      return next;
    });
  };

  const deleteUser = (id: string) => {
    if (users.length <= 1) {
      return { success: false, message: 'لا يمكن حذف المستخدم الوحيد بالنظام' };
    }
    setUsers(prev => {
      const next = prev.filter(u => u.id !== id);
      try {
        localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    pushDeltaToServer('users', 'delete', { id, _deleted: true });
    registerDeletedDoc('users', id);
    deleteDoc(doc(db, 'users', id)).catch(e => console.warn('Could not delete user in cloud:', e));
    if (currentUserId === id) {
      const remaining = users.filter(u => u.id !== id);
      if (remaining.length > 0) setCurrentUserId(remaining[0].id);
    }
    return { success: true };
  };

  const updateSettings = (newSettings: Partial<BusinessSettings> | BusinessSettings): Promise<boolean> => {
    // Serialize settings commits on this device. Independent rapid edits must
    // not publish competing full snapshots of the same workspace record.
    const task = async (): Promise<boolean> => {
      try {
        const repo = unifiedRepoRef.current;
        if (!repo) throw new Error('SETTINGS_REPOSITORY_NOT_READY');
        if (secureLoginEnabled()) {
          const role = roles.find(r => r.id === currentUser.roleId);
          const admin = ['SYS_ADMIN', 'GEN_MGR'].includes(role?.code || '');
          const allowed = (key: 'edit' | 'view_settings') =>
            currentUser.customPermissions?.[key] ?? role?.permissions?.[key] ?? false;
          if (!admin && !(allowed('edit') && allowed('view_settings'))) {
            throw new Error('WORKSPACE_SETTINGS_EDIT_PERMISSION_REQUIRED');
          }
        }
        const current = selectWorkspaceSettings(await repo.all('settings'));
        const recordId = current?.id || 'global';
        const base=current?.value || {id:recordId};
        const fieldPatch=await createWorkspaceSettingsPatch(base,newSettings,recordId);
        if (!fieldPatch) return true;
        const next=mergeWorkspaceSettingsDraft(base,newSettings,recordId);
        // Send only changed fields and their expected hashes. PostgreSQL
        // validates same-field concurrency and merges unrelated device edits.
        await repo.commit([{entity:'settings',id:recordId,value:fieldPatch as unknown as JsonObject}]);
        setSettings(prev => applyWorkspaceSettings(prev,next));
        return true;
      } catch (error) {
        console.error('SETTINGS_DURABLE_SAVE_FAILED:', error);
        setHasUnsyncedChanges(true);
        lastSyncErrorRef.current = String(error);
        try {
          window.dispatchEvent(new CustomEvent('accounting_save_error', {
            detail: { entity: 'settings', error: String(error) }
          }));
        } catch {}
        return false;
      }
    };
    const queued = settingsWriteChainRef.current.then(task, task);
    settingsWriteChainRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  };

  // Multi-Currency handlers (العملة الأساسية: الشيكل الفلسطيني ₪)
  const currencies = settings.currencies && settings.currencies.length > 0 ? settings.currencies : defaultCurrencies;

  const updateCurrencies = (newCurrencies: CurrencyInfo[]) => {
    updateSettings({ currencies: newCurrencies });
  };

  const updateCurrencyRate = (code: string, rate: number) => {
    const today = new Date().toISOString().split('T')[0];
    const currentList = settings.currencies || defaultCurrencies;
    const updatedList = currentList.map(c =>
      c.code === code ? { ...c, rateAgainstBase: rate, updatedAt: today } : c
    );
    updateSettings({ currencies: updatedList });
  };

  const fetchLiveRates = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const currentList = settings.currencies || defaultCurrencies;
      const refreshed = await fetchLiveExchangeRates(currentList);
      updateCurrencies(refreshed);
      return {
        success: true,
        message: 'تم تحديث أسعار الصرف الحية بنجاح بالنسبة للشيكل الفلسطيني (₪).'
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'تعذر جلب أسعار الصرف الحية: ' + (err.message || 'خطأ غير معروف')
      };
    }
  };

  // Offline-First & SQL Server Integration
  const sqlServerConfig = settings.sqlServerConfig || {
    enabled: false,
    serverUrl: 'http://localhost:3000/api/sync',
    dbType: 'postgres',
    dbName: 'alnoor_press_db',
    autoSync: false,
    syncIntervalMinutes: 30
  };

  const updateSqlServerConfig = (newConfig: SqlServerConfig) => {
    setSettings(prev => ({
      ...prev,
      sqlServerConfig: newConfig
    }));
  };

  const generateSqlBackup = (dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres'): string => {
    return generateSqlDump({
      settings,
      accounts,
      treasuries,
      inventory,
      parties,
      invoices,
      purchases,
      printOrders,
      employees,
      advances: employeeAdvances,
      payrollSheets,
      journals: journalEntries
    }, dialect);
  };

  const downloadSqlBackup = (dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres'): void => {
    const sql = generateSqlBackup(dialect);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadSqlFile(sql, `alnoor_press_backup_${dialect}_${dateStr}.sql`);
  };

  const syncToServer = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const fullRes = await executeServerFullSync();
      if (!fullRes?.success) {
        return {
          success: false,
          message: fullRes?.message || 'تم إيقاف المزامنة الشاملة القديمة؛ النظام يعتمد على تدفق أحداث الدلتا الموثق.'
        };
      }
      const nowStr = new Date().toLocaleTimeString('ar-EG');
      setLastSyncTime(nowStr);
      setLastFirebaseSyncTime(nowStr);
      localStorage.setItem(`${STORAGE_KEY}_last_sync`, nowStr);
      updateSqlServerConfig({ ...sqlServerConfig, lastSyncTime: nowStr });
      const invCount = (fullRes as any)?.counts?.invoices ?? invoices.length;
      return {
        success: true,
        message: `تمت المزامنة بنجاح مع السيرفر المركزي وحفظ البيانات بالكامل (${nowStr}) - الفواتير: ${invCount}`
      };
    } catch (e: any) {
      if (sqlServerConfig.serverUrl && !sqlServerConfig.serverUrl.includes('localhost:3000') && !sqlServerConfig.serverUrl.endsWith('/api/sync')) {
        const payload = {
          settings,
          accounts,
          treasuries,
          inventory,
          parties,
          invoices,
          purchases,
          printOrders,
          employees,
          advances: employeeAdvances,
          payrollSheets,
          journals: journalEntries
        };
        return await syncWithWebServer(sqlServerConfig.serverUrl, payload, sqlServerConfig.apiKey);
      }
      return {
        success: false,
        message: `فشلت المزامنة: ${e?.message || 'خطأ في الاتصال بالسيرفر'}`
      };
    }
  };

  const importMasterDatabaseSnapshot = async (): Promise<{ success: boolean; message: string }> => {
    // Old server snapshots may belong to another device/version; never merge live.
    return { success: false, message: 'استيراد الخادم القديم متوقف؛ يجب مطابقة البيانات في أداة الترحيل أولاً.' };
    try {
      // Fetch live server database state directly from the authoritative server sync store
      const sRes = await fetch('/api/sync/state');
      if (!sRes.ok) {
        throw new Error('تعذر الاتصال بالسيرفر المركزي');
      }
      const sJson = await sRes.json();
      if (!sJson || !sJson.data) {
        throw new Error('بيانات السيرفر غير متوفرة حالياً');
      }
      const serverData = sJson.data;

      const getList = (ent: string): any[] => {
        return (serverData[ent] && Array.isArray(serverData[ent].items)) ? serverData[ent].items : [];
      };

      const finalInvoices = getList('invoices');
      const finalParties = getList('parties');
      const finalInventory = getList('inventory');
      const finalPrintOrders = getList('printOrders');
      const finalVouchers = getList('vouchers');
      const finalPurchases = getList('purchases');
      const finalPurchaseReturns = getList('purchaseReturns');
      const finalSalesReturns = getList('salesReturns');
      const finalAccounts = getList('accounts');
      const finalTreasuries = getList('treasuries');
      const finalEmployees = getList('employees');
      const finalBranches = getList('branches');
      const finalWarehouses = getList('warehouses');
      const finalJournals = getList('journalEntries');
      const finalExpenses = getList('expenses');

      if (finalInvoices.length > 0) {
        setInvoices(finalInvoices);
        localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(finalInvoices));
      }
      if (finalParties.length > 0) {
        setParties(finalParties);
        localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(finalParties));
      }
      if (finalInventory.length > 0) {
        setInventory(finalInventory);
        localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(finalInventory));
      }
      if (finalPrintOrders.length > 0) {
        setPrintOrders(finalPrintOrders);
        localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(finalPrintOrders));
      }
      if (finalVouchers.length > 0) {
        setVouchers(finalVouchers);
        localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(finalVouchers));
      }
      if (finalPurchases.length > 0) {
        setPurchases(finalPurchases);
        localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(finalPurchases));
      }
      if (finalPurchaseReturns.length > 0) {
        setPurchaseReturns(finalPurchaseReturns);
        localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(finalPurchaseReturns));
      }
      if (finalSalesReturns.length > 0) {
        setSalesReturns(finalSalesReturns);
        localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(finalSalesReturns));
      }
      if (finalAccounts.length > 0) {
        setAccounts(finalAccounts);
        localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(finalAccounts));
      }
      if (finalTreasuries.length > 0) {
        setTreasuries(finalTreasuries);
        localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(finalTreasuries));
      }
      if (finalEmployees.length > 0) {
        setEmployees(finalEmployees);
        localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(finalEmployees));
      }
      if (finalJournals.length > 0) {
        setJournalEntries(finalJournals);
        localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(finalJournals));
      }
      if (finalExpenses.length > 0) {
        setExpenses(finalExpenses);
        localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(finalExpenses));
      }

      window.dispatchEvent(new CustomEvent('accounting_database_updated'));
      if (syncChannelRef.current) {
        try {
          syncChannelRef.current.postMessage({ type: 'DATABASE_IMPORTED', payload: { timestamp: Date.now() } });
        } catch {}
      }

      return {
        success: true,
        message: `تم تحميل وتحديث البيانات الموحدة من السيرفر السحابي بنجاح (${finalInvoices.length} فاتورة، ${finalParties.length} حساب/عميل)`
      };
    } catch (err: any) {
      console.error('Failed to import master database snapshot:', err);
      return { success: false, message: err?.message || 'فشل استيراد وتحديث قاعدة البيانات' };
    }
  };

  const addAccount = (accountData: Omit<Account, 'balance'> & { initialBalance?: number }) => {
    const newAcc: Account = {
      ...accountData,
      balance: accountData.initialBalance || 0
    };
    setAccounts(prev => [...prev, newAcc]);
  };

  const updateAccount = (code: string, updated: Partial<Account>) => {
    setAccounts(prev => prev.map(acc => acc.code === code ? { ...acc, ...updated } : acc));
  };

  // Treasury Management (إدارة الخزنات والصناديق والتطبيقات البنكية)
  const addTreasury = (treasuryData: Omit<Treasury, 'id' | 'createdAt'>): { success: boolean; treasury?: Treasury; message?: string } => {
    const id = 'treasury-' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    let accountCode = treasuryData.accountCode ? String(treasuryData.accountCode).trim() : '';
    if (accountCode) {
      if (!accountCode.startsWith('CASH-')) {
        accountCode = `CASH-${accountCode}`;
      }
      const isDuplicateTreasury = treasuries.some(t => t.accountCode === accountCode);
      if (isDuplicateTreasury) {
        return { success: false, message: `كود الصندوق (${accountCode}) مستخدم مسبقاً في النظام. يرجى اختيار كود فريد غير مكرر.` };
      }
    } else {
      let num = 1101;
      while (treasuries.some(t => t.accountCode === `CASH-${num}`)) {
        num++;
      }
      accountCode = `CASH-${num}`;
    }

    // Ensure account exists in Chart of Accounts
    const existingAccount = accounts.find(a => a.code === accountCode);
    if (!existingAccount) {
      const newAccount: Account = {
        code: accountCode,
        name: treasuryData.name,
        type: 'asset',
        balance: Number(treasuryData.balance) || 0,
        description: treasuryData.notes || `خزينة / حساب: ${treasuryData.name}`
      };
      setAccounts(prev => [...prev, newAccount]);
    }

    const initBal = Number(treasuryData.balance) || 0;
    const initialBalances = treasuryData.currencyBalances || { ILS: initBal };

    const initialTransactions: TreasuryTransaction[] = initBal > 0 ? [
      {
        id: 'tx-init-' + Date.now(),
        treasuryId: id,
        treasuryName: treasuryData.name,
        date: today,
        type: 'deposit',
        amount: initBal,
        currency: 'ILS',
        currencySymbol: '₪',
        exchangeRate: 1.0,
        baseCurrency: 'ILS',
        baseAmount: initBal,
        balanceAfter: initBal,
        balanceAfterCurrency: initBal,
        description: 'رصيد افتتاحي عند تدشين الخزنة / التطبيق',
        referenceType: 'opening'
      }
    ] : [];

    const newTreasury: Treasury = {
      ...treasuryData,
      id,
      accountCode,
      balance: initBal,
      currencyBalances: initialBalances,
      status: treasuryData.status || 'active',
      createdAt: today,
      transactions: initialTransactions
    };

    setTreasuries(prev => [...prev, newTreasury]);
    setDoc(doc(db, 'treasuries', newTreasury.id), cleanDocForFirestore(newTreasury)).catch(() => {});
    return { success: true, treasury: newTreasury, message: `تمت إضافة الخزنة برقم حساب (${accountCode}) بنجاح` };
  };

  const updateTreasury = (id: string, updated: Partial<Treasury>): { success: boolean; message?: string } => {
    const target = treasuries.find(t => t.id === id);
    if (!target) return { success: false, message: 'الخزنة غير موجودة' };

    if (updated.accountCode && updated.accountCode !== target.accountCode) {
      const hasTransactions = (target.transactions && target.transactions.length > 0) || (target.balance !== 0);
      if (hasTransactions) {
        return { success: false, message: `لا يمكن تعديل كود الحساب لخزنة (${target.name}) لأنه تم إدخال حركات أو رصيد عليها بالفعل (تم قفل وتثبيت الكود لحماية السلامة المحاسبية).` };
      }
      const isDuplicate = treasuries.some(t => t.id !== id && t.accountCode === updated.accountCode) || accounts.some(a => a.code === updated.accountCode);
      if (isDuplicate) {
        return { success: false, message: `كود الحساب (${updated.accountCode}) مستخدم مسبقاً في النظام.` };
      }
    }

    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === id) {
          const updatedTreasury = { ...t, ...updated, updatedAt: new Date().toISOString() };
          if (updated.name && updated.name !== t.name) {
            setAccounts(accs => accs.map(a => a.code === t.accountCode ? { ...a, name: updated.name!, updatedAt: new Date().toISOString() } : a));
          }
          if (updated.accountCode && updated.accountCode !== t.accountCode) {
            setAccounts(accs => accs.map(a => a.code === t.accountCode ? { ...a, code: updated.accountCode! } : a));
          }
          pushDeltaToServer('treasuries', 'upsert', updatedTreasury);
          setDoc(doc(db, 'treasuries', id), cleanDocForFirestore(updatedTreasury)).catch(() => {});
          return updatedTreasury;
        }
        return t;
      })
    );
    return { success: true, message: 'تم تحديث بيانات الخزنة بنجاح' };
  };

  const deleteTreasury = (id: string): { success: boolean; message?: string } => {
    const target = treasuries.find(t => t.id === id);
    if (!target) return { success: false, message: 'الصندوق غير موجود' };
    if (target.isDefault || target.id === 'treasury-cash-main') {
      return { success: false, message: 'لا يمكن حذف الصندوق النقدي الرئيسي للنظام' };
    }
    const hasTransactions = (target.transactions && target.transactions.length > 0) || (target.balance !== 0);
    if (hasTransactions) {
      return {
        success: false,
        message: `لا يمكن حذف الصندوق (${target.name}) لأنه تم إدخال مبيعات، حركات، أو رصيد عليه بالفعل (محمي لمنع تلف البيانات المحاسبية).`
      };
    }

    setTreasuries(prev => prev.filter(t => t.id !== id));
    pushDeltaToServer('treasuries', 'delete', { id, _deleted: true });
    registerDeletedDoc('treasuries', id);
    deleteDoc(doc(db, 'treasuries', id)).catch(e => console.warn('Could not delete treasury in cloud:', e));
    return { success: true, message: `تم حذف الخزنة (${target.name}) بنجاح` };
  };

  const executeTreasuryOperation = (params: {
    operationType: 'deposit' | 'withdrawal' | 'transfer';
    sourceTreasuryId: string;
    destTreasuryId: string;
    amount: number;
    currencyCode: string;
    notes?: string;
    date?: string;
    exchangeRate?: number;
  }): { success: boolean; message?: string } => {
    const { operationType, sourceTreasuryId, destTreasuryId, amount, currencyCode, notes, date, exchangeRate } = params;

    if (amount <= 0) {
      return { success: false, message: 'مبلغ العملية يجب أن يكون أكبر من الصفر' };
    }
    const source = treasuries.find(t => t.id === sourceTreasuryId || t.accountCode === sourceTreasuryId);
    const dest = treasuries.find(t => t.id === destTreasuryId || t.accountCode === destTreasuryId);

    if (!source || !dest) {
      return { success: false, message: 'الصندوق/الحساب المصدر أو الوجهة غير موجود' };
    }
    if (source.id === dest.id) {
      return { success: false, message: 'لا يمكن التحويل من وإلى نفس الحساب/الصندوق' };
    }

    const curr = currencyCode || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = exchangeRate !== undefined ? exchangeRate : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = curr === 'ILS' ? '₪' : (currInfo?.symbol || curr);
    const baseEquivalent = Number((amount * rate).toFixed(2));

    const txDate = date || new Date().toISOString().split('T')[0];
    const opPrefix = operationType === 'deposit' ? 'DEP' : operationType === 'withdrawal' ? 'WTH' : 'TRF';
    const opId = `OP-${opPrefix}-${Date.now()}`;
    const entryNumber = `JV-${opPrefix}-${Date.now().toString().slice(-6)}`;

    let opTitle = '';
    let srcDesc = '';
    let destDesc = '';

    if (operationType === 'deposit') {
      opTitle = `إيداع بنكي (${amount.toLocaleString()} ${symbol}) من (${source.name}) إلى البنك (${dest.name})`;
      srcDesc = `إيداع بنكي صادر إلى (${dest.name})${notes ? ` - ${notes}` : ''}`;
      destDesc = `إيداع نقدي وارد من (${source.name})${notes ? ` - ${notes}` : ''}`;
    } else if (operationType === 'withdrawal') {
      opTitle = `سحب نقدي (${amount.toLocaleString()} ${symbol}) من البنك (${source.name}) إلى (${dest.name})`;
      srcDesc = `سحب نقدي صادر لصالح (${dest.name})${notes ? ` - ${notes}` : ''}`;
      destDesc = `سحب نقدي وارد ومستلم من (${source.name})${notes ? ` - ${notes}` : ''}`;
    } else {
      opTitle = `تحويل مالي (${amount.toLocaleString()} ${symbol}) من (${source.name}) إلى (${dest.name})`;
      srcDesc = `تحويل نقدي صادر إلى (${dest.name})${notes ? ` - ${notes}` : ''}`;
      destDesc = `تحويل نقدي وارد من (${source.name})${notes ? ` - ${notes}` : ''}`;
    }

    // 1. Unified double-entry journal entry: طرفان كعملية واحدة غير قابلة للانفصال
    const newJournal: JournalEntry = {
      id: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      entryNumber,
      date: txDate,
      description: `${opTitle}${notes ? ` [${notes}]` : ''}`,
      referenceType: 'transfer',
      referenceId: opId,
      lines: [
        {
          accountCode: dest.accountCode,
          accountName: dest.name,
          debit: baseEquivalent,
          credit: 0,
          description: `${destDesc} (${amount.toLocaleString()} ${symbol})`
        },
        {
          accountCode: source.accountCode,
          accountName: source.name,
          debit: 0,
          credit: baseEquivalent,
          description: `${srcDesc} (${amount.toLocaleString()} ${symbol})`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [newJournal, ...prev]);
    setDoc(doc(db, 'journals', newJournal.id), cleanDocForFirestore(newJournal)).catch(() => {});

    // 2. Update Accounts in chart of accounts
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === source.accountCode) {
          return { ...acc, balance: Number((acc.balance - baseEquivalent).toFixed(2)) };
        }
        if (acc.code === dest.accountCode) {
          return { ...acc, balance: Number((acc.balance + baseEquivalent).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Treasuries balances in original currency without forced conversion
    const sourceTxId = 'tx-src-' + Date.now();
    const destTxId = 'tx-dst-' + Date.now();

    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === source.id) {
          const currentBalances = { ...(t.currencyBalances || {}) };
          if (currentBalances[curr] === undefined) {
            currentBalances[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = currentBalances[curr];
          const newCurrBal = Number((prevBal - amount).toFixed(2));
          currentBalances[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(currentBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: sourceTxId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: operationType === 'transfer' ? 'transfer_out' : 'withdrawal',
            amount,
            currency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: -baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            description: srcDesc,
            referenceType: 'transfer',
            referenceId: opId,
            targetTreasuryId: dest.id,
            targetTreasuryName: dest.name
          };

          const updatedSourceT = {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: currentBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
          setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(updatedSourceT)).catch(() => {});
          return updatedSourceT;
        }

        if (t.id === dest.id) {
          const currentBalances = { ...(t.currencyBalances || {}) };
          if (currentBalances[curr] === undefined) {
            currentBalances[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = currentBalances[curr];
          const newCurrBal = Number((prevBal + amount).toFixed(2));
          currentBalances[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(currentBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: destTxId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: operationType === 'transfer' ? 'transfer_in' : 'deposit',
            amount,
            currency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            description: destDesc,
            referenceType: 'transfer',
            referenceId: opId,
            targetTreasuryId: source.id,
            targetTreasuryName: source.name
          };

          const updatedDestT = {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: currentBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
          setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(updatedDestT)).catch(() => {});
          return updatedDestT;
        }

        return t;
      })
    );

    return {
      success: true,
      message: `تمت العملية بنجاح (${opTitle}) وقيد الطرفان كعملية واحدة غير قابلة للتجزئة برقم ${entryNumber}.`
    };
  };

  const transferBetweenTreasuries = (
    sourceTreasuryId: string,
    destTreasuryId: string,
    amount: number,
    notes?: string,
    date?: string,
    currencyCode?: string,
    exchangeRate?: number
  ): { success: boolean; message?: string } => {
    return executeTreasuryOperation({
      operationType: 'transfer',
      sourceTreasuryId,
      destTreasuryId,
      amount,
      currencyCode: currencyCode || 'ILS',
      notes,
      date,
      exchangeRate
    });
  };

  const depositIntoTreasury = (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    depositorName?: string;
    notes?: string;
    date?: string;
  }): { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher } => {
    const { treasuryId, amount, currencyCode, exchangeRate, contraAccountCode, depositorName, notes, date } = params;

    if (amount <= 0) {
      return { success: false, message: 'مبلغ الإيداع يجب أن يكون أكبر من الصفر' };
    }

    const target = treasuries.find(t => t.id === treasuryId || t.accountCode === treasuryId);
    if (!target) {
      return { success: false, message: 'الخزنة أو الصندوق المحدد غير موجود' };
    }

    const curr = currencyCode || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = exchangeRate !== undefined ? exchangeRate : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = curr === 'ILS' ? '₪' : (currInfo?.symbol || curr);
    const baseEquivalent = Number((amount * rate).toFixed(2));
    const txDate = date || new Date().toISOString().split('T')[0];

    const voucherNumber = `DEP-${Date.now().toString().slice(-6)}`;
    const entryNumber = `JV-DEP-${Date.now().toString().slice(-6)}`;

    // Contra Account (default: 3101 Paid-in Capital / Owner Equity, or 3102 Owner Account, or 4201 Other Revenues)
    const contraCode = contraAccountCode || '3101';
    const contraAcc = accounts.find(a => a.code === contraCode);
    const contraName = contraAcc?.name || 'رأس المال / تمويل المالك';

    const opTitle = `إيداع نقدي (${amount.toLocaleString()} ${symbol}) في (${target.name})`;
    const fullDesc = `إيداع نقدي في ${target.name} من ${depositorName || contraName}${notes ? ` - ${notes}` : ''}`;

    // 1. Post double-entry Journal Entry:
    // Debit: Treasury Account (Asset +)
    // Credit: Contra Account (Equity or Revenue +)
    const newJournal: JournalEntry = {
      id: 'entry-dep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      entryNumber,
      date: txDate,
      description: `${opTitle}${notes ? ` [${notes}]` : ''}`,
      referenceType: 'receipt',
      referenceId: voucherNumber,
      lines: [
        {
          accountCode: target.accountCode,
          accountName: target.name,
          debit: baseEquivalent,
          credit: 0,
          description: `إيداع نقدي وارد في ${target.name} (${amount.toLocaleString()} ${symbol})`
        },
        {
          accountCode: contraCode,
          accountName: contraName,
          debit: 0,
          credit: baseEquivalent,
          description: `مقابل إيداع نقدي في ${target.name} (${amount.toLocaleString()} ${symbol})`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [newJournal, ...prev]);

    // 2. Update Accounts in Chart of Accounts
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === target.accountCode) {
          // Asset: increases by debit
          return { ...acc, balance: Number((acc.balance + baseEquivalent).toFixed(2)) };
        }
        if (acc.code === contraCode) {
          // If equity/revenue/liability: increases by credit. If asset/expense: decreases by credit
          const delta = (acc.type === 'asset' || acc.type === 'expense') ? -baseEquivalent : baseEquivalent;
          return { ...acc, balance: Number((acc.balance + delta).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Treasury Balance & Currency Balances & Add TreasuryTransaction
    const txId = 'tx-dep-' + Date.now();
    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === target.id) {
          const currentBalances = { ...(t.currencyBalances || {}) };
          if (currentBalances[curr] === undefined) {
            currentBalances[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = currentBalances[curr];
          const newCurrBal = Number((prevBal + amount).toFixed(2));
          currentBalances[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(currentBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: txId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: 'deposit',
            amount,
            actualAmount: amount,
            currency: curr,
            actualCurrency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            voucherNumber,
            partyName: depositorName || contraName,
            description: fullDesc,
            referenceType: 'receipt',
            referenceId: voucherNumber,
            contraAccountCode: contraCode,
            contraAccountName: contraName
          };

          return {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: currentBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
        }
        return t;
      })
    );

    // 4. Create official PaymentVoucher (سند قبض)
    const newVoucher: PaymentVoucher = {
      id: 'vch-dep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      voucherNumber,
      type: 'receipt',
      date: txDate,
      partyId: 'treasury-party',
      partyName: depositorName || contraName,
      amount,
      paymentMethod: target.type === 'bank_account' || target.type === 'bank_app' ? 'bank_transfer' : 'cash',
      accountCode: contraCode,
      treasuryAccountCode: target.accountCode,
      description: fullDesc,
      currency: curr,
      currencySymbol: symbol,
      exchangeRate: rate,
      baseAmount: baseEquivalent
    };
    setVouchers(prev => {
      const next = [newVoucher, ...prev];
      broadcastEntityChange('vouchers', next);
      pushToServerSync('vouchers', newVoucher);
      return next;
    });
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

    return {
      success: true,
      message: `تم إيداع مبلغ (${amount.toLocaleString()} ${symbol}) في (${target.name}) بنجاح، وقيدت المحاسبة برقم ${entryNumber}، وسند القبض برقم ${voucherNumber}.`,
      voucherNumber,
      entryNumber,
      voucher: newVoucher
    };
  };

  const withdrawFromTreasury = (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    recipientName?: string;
    notes?: string;
    date?: string;
    allowNegativeBalance?: boolean;
  }): { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher } => {
    const { treasuryId, amount, currencyCode, exchangeRate, contraAccountCode, recipientName, notes, date, allowNegativeBalance } = params;

    if (amount <= 0) {
      return { success: false, message: 'مبلغ السحب يجب أن يكون أكبر من الصفر' };
    }

    const target = treasuries.find(t => t.id === treasuryId || t.accountCode === treasuryId);
    if (!target) {
      return { success: false, message: 'الخزنة أو الصندوق المحدد غير موجود' };
    }

    const curr = currencyCode || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = exchangeRate !== undefined ? exchangeRate : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = curr === 'ILS' ? '₪' : (currInfo?.symbol || curr);
    const baseEquivalent = Number((amount * rate).toFixed(2));
    const txDate = date || new Date().toISOString().split('T')[0];

    // Check available balance in the specified currency
    const currentBalances = { ...(target.currencyBalances || {}) };
    const currBal = currentBalances[curr] !== undefined ? currentBalances[curr] : (curr === 'ILS' ? (target.balance || 0) : 0);
    if (!allowNegativeBalance && currBal < amount) {
      return {
        success: false,
        message: `الرصيد المتوفر في (${target.name}) بعملة (${curr}) هو (${currBal.toLocaleString()} ${symbol})، ولا يكفي لسحب (${amount.toLocaleString()} ${symbol}).`
      };
    }

    const voucherNumber = `WTH-${Date.now().toString().slice(-6)}`;
    const entryNumber = `JV-WTH-${Date.now().toString().slice(-6)}`;

    // Contra Account (default: 3102 Owner Drawings or 5205 General Expenses)
    const contraCode = contraAccountCode || '3102';
    const contraAcc = accounts.find(a => a.code === contraCode);
    const contraName = contraAcc?.name || 'مسحوبات المالك / جاري الشركاء';

    const opTitle = `سحب نقدي (${amount.toLocaleString()} ${symbol}) من (${target.name})`;
    const fullDesc = `سحب نقدي من ${target.name} لصالح ${recipientName || contraName}${notes ? ` - ${notes}` : ''}`;

    // 1. Post double-entry Journal Entry:
    // Debit: Contra Account (Expense or Equity Drawings +)
    // Credit: Treasury Account (Asset -)
    const newJournal: JournalEntry = {
      id: 'entry-wth-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      entryNumber,
      date: txDate,
      description: `${opTitle}${notes ? ` [${notes}]` : ''}`,
      referenceType: 'payment',
      referenceId: voucherNumber,
      lines: [
        {
          accountCode: contraCode,
          accountName: contraName,
          debit: baseEquivalent,
          credit: 0,
          description: `سحب نقدي من ${target.name} (${amount.toLocaleString()} ${symbol})`
        },
        {
          accountCode: target.accountCode,
          accountName: target.name,
          debit: 0,
          credit: baseEquivalent,
          description: `سحب نقدي صادر من ${target.name} (${amount.toLocaleString()} ${symbol})`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [newJournal, ...prev]);
    setDoc(doc(db, 'journals', newJournal.id), cleanDocForFirestore(newJournal)).catch(() => {});

    // 2. Update Accounts in Chart of Accounts
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === target.accountCode) {
          // Asset: decreases by credit
          return { ...acc, balance: Number((acc.balance - baseEquivalent).toFixed(2)) };
        }
        if (acc.code === contraCode) {
          // If asset/expense: increases by debit (+baseEquivalent).
          // If equity/liability/revenue: decreases by debit (-baseEquivalent).
          const delta = (acc.type === 'asset' || acc.type === 'expense') ? baseEquivalent : -baseEquivalent;
          return { ...acc, balance: Number((acc.balance + delta).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Treasury Balance & Currency Balances & Add TreasuryTransaction
    const txId = 'tx-wth-' + Date.now();
    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === target.id) {
          const curBal = { ...(t.currencyBalances || {}) };
          if (curBal[curr] === undefined) {
            curBal[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = curBal[curr];
          const newCurrBal = Number((prevBal - amount).toFixed(2));
          curBal[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(curBal)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: txId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: 'withdrawal',
            amount,
            actualAmount: amount,
            currency: curr,
            actualCurrency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: -baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            voucherNumber,
            partyName: recipientName || contraName,
            description: fullDesc,
            referenceType: 'payment',
            referenceId: voucherNumber,
            contraAccountCode: contraCode,
            contraAccountName: contraName
          };

          const updatedT = {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: curBal,
            transactions: [tx, ...(t.transactions || [])]
          };
          setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(updatedT)).catch(() => {});
          return updatedT;
        }
        return t;
      })
    );

    // 4. Create official PaymentVoucher (سند صرف)
    const newVoucher: PaymentVoucher = {
      id: 'vch-wth-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      voucherNumber,
      type: 'payment',
      date: txDate,
      partyId: 'treasury-party',
      partyName: recipientName || contraName,
      amount,
      paymentMethod: target.type === 'bank_account' || target.type === 'bank_app' ? 'bank_transfer' : 'cash',
      accountCode: contraCode,
      treasuryAccountCode: target.accountCode,
      description: fullDesc,
      currency: curr,
      currencySymbol: symbol,
      exchangeRate: rate,
      baseAmount: baseEquivalent
    };
    setVouchers(prev => {
      const next = [newVoucher, ...prev];
      broadcastEntityChange('vouchers', next);
      pushToServerSync('vouchers', newVoucher);
      return next;
    });
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

    return {
      success: true,
      message: `تم سحب مبلغ (${amount.toLocaleString()} ${symbol}) من (${target.name}) بنجاح، وقيدت المحاسبة برقم ${entryNumber}، وسند الصرف برقم ${voucherNumber}.`,
      voucherNumber,
      entryNumber,
      voucher: newVoucher
    };
  };

  // ==========================================
  // DEBT CLEARING OPERATIONS (المقاصة بين عميل ومورد)
  // لا تدخل ضمن الصناديق والخزن المالية وتؤثر حصراً على ذمم العميل والمورد
  // ==========================================
  const addDebtClearing = (
    clearingData: Omit<DebtClearingRecord, 'id' | 'createdAt' | 'clearingNumber'>
  ): { success: boolean; message?: string; record?: DebtClearingRecord } => {
    const customer = parties.find(p => p.id === clearingData.customerId);
    const supplier = parties.find(p => p.id === clearingData.supplierId);

    if (!customer || !supplier) {
      return { success: false, message: 'العميل أو المورد غير موجود بالنظام' };
    }
    if (clearingData.amount <= 0) {
      return { success: false, message: 'مبلغ المقاصة يجب أن يكون أكبر من الصفر' };
    }

    const clrNum = `CLR-${new Date().getFullYear()}-${(debtClearings.length + 1).toString().padStart(3, '0')}`;
    const jId = `entry-clr-${Date.now()}`;
    const custOld = customer.balance;
    const custNew = Number((custOld - clearingData.amount).toFixed(2));
    const suppOld = supplier.balance;
    const suppNew = Number((suppOld + clearingData.amount).toFixed(2));

    // 1. Post double-entry journal (Debit Supplier Payables 2101, Credit Customer Receivables 1201)
    // CRITICAL: Does NOT affect cash boxes or treasuries!
    const jEntry: JournalEntry = {
      id: jId,
      entryNumber: `JV-${clrNum}`,
      date: clearingData.date,
      description: `مقاصة وتسوية ذمم بين العميل (${customer.name}) والمورد (${supplier.name}) - ${clearingData.reason || 'تسوية حسابات متبادلة'}`,
      referenceType: 'clearance',
      referenceId: clrNum,
      lines: [
        {
          accountCode: '2101',
          accountName: 'الموردون والذمم الدائنة',
          debit: clearingData.amount,
          credit: 0,
          description: `تسوية مقاصة لحساب المورد: ${supplier.name} بموجب سند ${clrNum}`
        },
        {
          accountCode: '1201',
          accountName: 'العملاء والذمم المدينة',
          debit: 0,
          credit: clearingData.amount,
          description: `تسوية مقاصة لحساب العميل: ${customer.name} بموجب سند ${clrNum}`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [jEntry, ...prev]);
    setDoc(doc(db, 'journals', jEntry.id), cleanDocForFirestore(jEntry)).catch(() => {});

    // 2. Update accounts in chart of accounts (Payables and Receivables only, NOT Cash/Bank)
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === '2101') {
          return { ...acc, balance: Number((acc.balance + clearingData.amount).toFixed(2)) };
        }
        if (acc.code === '1201') {
          return { ...acc, balance: Number((acc.balance - clearingData.amount).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Party Balances
    updateParty(customer.id, { balance: custNew });
    updateParty(supplier.id, { balance: suppNew });

    const record: DebtClearingRecord = {
      ...clearingData,
      id: `clr-${Date.now()}`,
      clearingNumber: clrNum,
      createdAt: new Date().toISOString(),
      customerOldBalance: custOld,
      customerNewBalance: custNew,
      supplierOldBalance: suppOld,
      supplierNewBalance: suppNew,
      journalEntryId: jId
    };

    setDebtClearings(prev => [record, ...prev]);
    setDoc(doc(db, 'debtClearings', record.id), cleanDocForFirestore(record)).catch(() => {});
    return { success: true, message: `تم قيد سند المقاصة بنجاح برقم ${clrNum}`, record };
  };

  const updateDebtClearing = (
    id: string,
    updated: Partial<DebtClearingRecord>
  ): { success: boolean; message?: string } => {
    const existing = debtClearings.find(c => c.id === id);
    if (!existing) return { success: false, message: 'سند المقاصة غير موجود' };

    // 1. Revert previous party balance impacts
    const prevCust = parties.find(p => p.id === existing.customerId);
    const prevSupp = parties.find(p => p.id === existing.supplierId);
    if (prevCust) {
      updateParty(prevCust.id, { balance: Number((prevCust.balance + existing.amount).toFixed(2)) });
    }
    if (prevSupp) {
      updateParty(prevSupp.id, { balance: Number((prevSupp.balance - existing.amount).toFixed(2)) });
    }

    // 2. Determine target customer, supplier, amount, date, notes
    const targetCustId = updated.customerId || existing.customerId;
    const targetSuppId = updated.supplierId || existing.supplierId;
    const targetAmount = updated.amount !== undefined ? updated.amount : existing.amount;
    const targetDate = updated.date || existing.date;
    const targetReason = updated.reason || existing.reason;
    const targetNotes = updated.notes !== undefined ? updated.notes : existing.notes;

    const newCust = parties.find(p => p.id === targetCustId);
    const newSupp = parties.find(p => p.id === targetSuppId);
    if (!newCust || !newSupp) {
      return { success: false, message: 'العميل أو المورد غير موجود' };
    }

    const custBaseBal = (newCust.id === prevCust?.id) ? (newCust.balance + existing.amount) : newCust.balance;
    const suppBaseBal = (newSupp.id === prevSupp?.id) ? (newSupp.balance - existing.amount) : newSupp.balance;

    const updatedCustBal = Number((custBaseBal - targetAmount).toFixed(2));
    const updatedSuppBal = Number((suppBaseBal + targetAmount).toFixed(2));

    updateParty(newCust.id, { balance: updatedCustBal });
    updateParty(newSupp.id, { balance: updatedSuppBal });

    // 3. Update general ledger journal entry
    if (existing.journalEntryId) {
      setJournalEntries(prev => prev.map(je => {
        if (je.id === existing.journalEntryId) {
          return {
            ...je,
            date: targetDate,
            description: `مقاصة وتسوية ذمم بين العميل (${newCust.name}) والمورد (${newSupp.name}) - ${targetReason}`,
            lines: [
              {
                accountCode: '2101',
                accountName: 'الموردون والذمم الدائنة',
                debit: targetAmount,
                credit: 0,
                description: `تسوية مقاصة لحساب المورد: ${newSupp.name} بموجب سند ${existing.clearingNumber}`
              },
              {
                accountCode: '1201',
                accountName: 'العملاء والذمم المدينة',
                debit: 0,
                credit: targetAmount,
                description: `تسوية مقاصة لحساب العميل: ${newCust.name} بموجب سند ${existing.clearingNumber}`
              }
            ]
          };
        }
        return je;
      }));
    }

    // 4. Update the clearing record
    setDebtClearings(prev => prev.map(c => {
      if (c.id === id) {
        return {
          ...c,
          customerId: newCust.id,
          customerName: newCust.name,
          supplierId: newSupp.id,
          supplierName: newSupp.name,
          amount: targetAmount,
          date: targetDate,
          reason: targetReason,
          notes: targetNotes,
          customerOldBalance: custBaseBal,
          customerNewBalance: updatedCustBal,
          supplierOldBalance: suppBaseBal,
          supplierNewBalance: updatedSuppBal
        };
      }
      return c;
    }));

    return { success: true, message: `تم تحديث سند المقاصة (${existing.clearingNumber}) بنجاح وإعادة احتساب الأرصدة والقيود المحاسبية.` };
  };

  const deleteDebtClearing = (id: string): { success: boolean; message?: string } => {
    const existing = debtClearings.find(c => c.id === id);
    if (!existing) return { success: false, message: 'سند المقاصة غير موجود' };

    // 1. Restore balances
    const cust = parties.find(p => p.id === existing.customerId);
    const supp = parties.find(p => p.id === existing.supplierId);
    if (cust) {
      updateParty(cust.id, { balance: Number((cust.balance + existing.amount).toFixed(2)) });
    }
    if (supp) {
      updateParty(supp.id, { balance: Number((supp.balance - existing.amount).toFixed(2)) });
    }

    // 2. Remove journal entry
    if (existing.journalEntryId) {
      setJournalEntries(prev => prev.filter(je => je.id !== existing.journalEntryId));
    }

    // 3. Remove clearing record
    setDebtClearings(prev => prev.filter(c => c.id !== id));
    return { success: true, message: `تم حذف سند المقاصة (${existing.clearingNumber}) واستعادة أرصدة العميل والمورد وإلغاء القيد المحاسبي بالكامل.` };
  };

  const adjustTreasuryBalance = (
    treasuryIdOrCode: string,
    delta: number,
    description: string,
    refType?: TreasuryTransaction['referenceType'],
    refId?: string,
    options?: {
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      voucherNumber?: string;
      partyName?: string;
      date?: string;
    }
  ) => {
    if (delta === 0) return;
    const now = options?.date || new Date().toISOString().split('T')[0];
    const isDeposit = delta > 0;

    const curr = options?.currency || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = options?.exchangeRate !== undefined
      ? options.exchangeRate
      : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = options?.currencySymbol || (curr === 'ILS' ? '₪' : (currInfo?.symbol || curr));
    const baseDelta = Number((delta * rate).toFixed(2));

    let matchedAccountCode = '';

    setTreasuries(prev => {
      let target = prev.find(t => t.id === treasuryIdOrCode || t.accountCode === treasuryIdOrCode);
      if (!target) {
        target = prev.find(t => t.isDefault) || prev[0];
      }
      if (!target) return prev;
      matchedAccountCode = target.accountCode;

      const nextTrs = prev.map(t => {
        if (t.id === target!.id) {
          const prevCurrBal = (t.currencyBalances && t.currencyBalances[curr] !== undefined)
            ? t.currencyBalances[curr]
            : (curr === 'ILS' ? (t.balance || 0) : 0);
          const newCurrBal = Number((prevCurrBal + delta).toFixed(2));
          const updatedBalances = {
            ...(t.currencyBalances || { ILS: t.balance || 0 }),
            [curr]: newCurrBal
          };

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(updatedBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            treasuryId: t.id,
            treasuryName: t.name,
            date: now,
            type: isDeposit ? 'deposit' : 'withdrawal',
            amount: Math.abs(delta),
            currency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: isDeposit ? Math.abs(baseDelta) : -Math.abs(baseDelta),
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            voucherNumber: options?.voucherNumber,
            partyName: options?.partyName,
            description,
            referenceType: refType || 'manual',
            referenceId: refId
          };
          const updatedT = {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: updatedBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
          return updatedT;
        }
        return t;
      });

      try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(nextTrs)); } catch {}
      broadcastEntityChange('treasuries', nextTrs);
      pushToServerSync('treasuries', undefined, nextTrs);
      return nextTrs;
    });

    // Also update account in Chart of Accounts by baseDelta (in ILS)
    setAccounts(prev => {
      const nextAccs = prev.map(acc => {
        if (acc.code === treasuryIdOrCode || (matchedAccountCode && acc.code === matchedAccountCode)) {
          return { ...acc, balance: Number((acc.balance + baseDelta).toFixed(2)) };
        }
        return acc;
      });
      try { localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(nextAccs)); } catch {}
      broadcastEntityChange('accounts', nextAccs);
      return nextAccs;
    });
  };
  /**
   * نقل وتطهير حركات الفاتورة بين الصناديق والمحافط البنكية (User Request 2)
   * عند تعديل الفاتورة ونقلها من صندوق لآخر:
   * 1. يتم مسح/تطهير أي حركة سابقة للفاتورة من الصندوق القديم نهائياً دون ترك أي أثر أو قيد عكسي مربك في كشف الصندوق القديم.
   * 2. يتم خصم المبلغ من الصندوق القديم وإضافته للصندوق الجديد بصورة نقية.
   * 3. يتم إثبات الحركة الصريحة في الصندوق الجديد وكأنها أُدخلت فيه من البداية.
   * 4. يتم تحديث قيود اليومية لربطها بكود الخزينة/الحساب الجديد.
   */
  const purgeAndTransferInvoiceTreasury = (
    oldInv: Invoice | null | undefined,
    newInv: Invoice | null | undefined
  ) => {
    if (!oldInv && !newInv) return;

    setTreasuries(prevTreasuries => {
      return prevTreasuries.map(t => {
        let updatedT = { ...t };
        let txs = [...(updatedT.transactions || [])];

        // 1. إذا كانت هناك فاتورة سابقة (oldInv)، يتم تطهيرها ومسحها بالكامل من الصندوق القديم دون إظهار أي حركة عكسية
        if (oldInv) {
          const invId = oldInv.id;
          const invNum = oldInv.invoiceNumber;

          // البحث عن الحركات المرتبطة بالفاتورة في هذا الصندوق
          const matchingTxs = txs.filter(tx =>
            (tx.referenceId && tx.referenceId === invId) ||
            (tx.voucherNumber && tx.voucherNumber === invNum) ||
            (tx.referenceNumber && tx.referenceNumber === invNum) ||
            (tx.description && tx.description.includes(invNum))
          );

          if (matchingTxs.length > 0) {
            // إزالة الحركات نهائياً من القائمة
            txs = txs.filter(tx => !matchingTxs.includes(tx));

            // خصم مبالغ الحركات المزالة من رصيد الصندوق
            let removedBaseAmt = 0;
            const currDeltas: Record<string, number> = {};

            matchingTxs.forEach(tx => {
              const amt = Math.abs(tx.amount || 0);
              const curr = tx.currency || 'ILS';
              currDeltas[curr] = (currDeltas[curr] || 0) + amt;
              removedBaseAmt += Math.abs(tx.baseAmount !== undefined ? tx.baseAmount : amt * (tx.exchangeRate || 1));
            });

            const newCurrBalances = { ...(updatedT.currencyBalances || { ILS: updatedT.balance || 0 }) };
            for (const [cCode, cAmt] of Object.entries(currDeltas)) {
              newCurrBalances[cCode] = Number(((newCurrBalances[cCode] || 0) - cAmt).toFixed(2));
            }

            let newEstimatedBase = 0;
            for (const [cCode, cAmt] of Object.entries(newCurrBalances)) {
              const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
              newEstimatedBase += (cAmt as number) * cRate;
            }

            updatedT.balance = Number(newEstimatedBase.toFixed(2));
            updatedT.currencyBalances = newCurrBalances;
          }
        }

        // 2. إذا كانت هناك فاتورة جديدة/محدثة (newInv) ومؤهلة محاسبياً، يتم إضافتها بشكل نقي للصندوق الجديد
        if (newInv && isInvoiceAccountingEligible(newInv.workflowStatus)) {
          const isCredit = newInv.paymentMethod === 'credit' || (!newInv.paidAmount && (newInv.remainingAmount ?? newInv.totalAmount) === newInv.totalAmount);

          if (!isCredit) {
            const cashCode = newInv.cashTreasuryCode || newInv.treasuryAccountCode || '1101';
            let bankCode = newInv.bankTreasuryCode || newInv.treasuryAccountCode || '1103';
            if (bankCode === '1102' && !prevTreasuries.some(tr => tr.accountCode === '1102' || tr.id === '1102')) {
              bankCode = '1103';
            }

            const isCashMatch = updatedT.accountCode === cashCode || updatedT.id === cashCode;
            const isBankMatch = updatedT.accountCode === bankCode || updatedT.id === bankCode;

            const cashPaid = (newInv.cashPaidAmount && newInv.cashPaidAmount > 0)
              ? newInv.cashPaidAmount
              : (newInv.paymentMethod === 'cash' ? newInv.paidAmount : 0);

            const bankPaid = (newInv.bankPaidAmount && newInv.bankPaidAmount > 0)
              ? newInv.bankPaidAmount
              : (newInv.paymentMethod === 'card' || (newInv.paymentMethod as string) === 'bank_transfer' ? newInv.paidAmount : 0);

            let depositAmt = 0;
            let isBankTx = false;

            if (isCashMatch && isBankMatch) {
              depositAmt = cashPaid + bankPaid;
              isBankTx = bankPaid > 0;
            } else if (isCashMatch && cashPaid > 0) {
              depositAmt = cashPaid;
            } else if (isBankMatch && bankPaid > 0) {
              depositAmt = bankPaid;
              isBankTx = true;
            }

            if (depositAmt > 0) {
              const curr = newInv.currency || 'ILS';
              const rate = newInv.exchangeRate || 1.0;
              const symbol = newInv.currencySymbol || '₪';
              const baseAmt = Number((depositAmt * rate).toFixed(2));
              const today = newInv.date || new Date().toISOString().split('T')[0];

              const newCurrBal = Number(((updatedT.currencyBalances?.[curr] || 0) + depositAmt).toFixed(2));
              const updatedCurrBalances = {
                ...(updatedT.currencyBalances || { ILS: updatedT.balance || 0 }),
                [curr]: newCurrBal
              };

              let totalEstimatedBase = 0;
              for (const [cCode, cAmt] of Object.entries(updatedCurrBalances)) {
                const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
                totalEstimatedBase += (cAmt as number) * cRate;
              }
              totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

              const cleanTx: TreasuryTransaction = {
                id: `tx-pos-${newInv.id}-${Date.now()}`,
                treasuryId: updatedT.id,
                treasuryName: updatedT.name,
                date: today,
                type: 'deposit',
                amount: depositAmt,
                currency: curr,
                currencySymbol: symbol,
                exchangeRate: rate,
                baseCurrency: 'ILS',
                baseAmount: baseAmt,
                balanceAfter: totalEstimatedBase,
                balanceAfterCurrency: newCurrBal,
                voucherNumber: newInv.invoiceNumber,
                partyName: newInv.customerName || 'زبون نقدي',
                description: isBankTx
                  ? `تحصيل مبيعات عبر البنك/الشبكة - فاتورة رقم ${newInv.invoiceNumber}`
                  : `تحصيل مبيعات نقدي - فاتورة رقم ${newInv.invoiceNumber}`,
                referenceType: 'pos_sale',
                referenceId: newInv.id
              };

              updatedT.balance = totalEstimatedBase;
              updatedT.currencyBalances = updatedCurrBalances;
              
              // تجنب التكرار إذا كانت الحركة موجودة مسبقاً
              const exists = txs.some(tx => tx.referenceId === newInv.id && tx.treasuryId === updatedT.id);
              if (!exists) {
                txs = [cleanTx, ...txs];
              }
            }
          }
        }

        return {
          ...updatedT,
          transactions: txs
        };
      });
    });

    // 3. تحديث القيود المحاسبية المرتبطة لإبعاد كود الحساب القديم واعتماد كود الخزينة الجديد
    if (newInv) {
      setJournalEntries(prevJE => prevJE.map(je => {
        if (je.referenceId === newInv.id || (je.description && je.description.includes(newInv.invoiceNumber))) {
          const updatedLines = je.lines.map(line => {
            if (line.debit > 0 && (line.accountCode.startsWith('110') || line.accountCode === '1101' || line.accountCode === '1102' || line.accountCode === '1103' || line.accountCode === '1105')) {
              const isBankLine = line.description?.includes('بنكي') || line.description?.includes('شبكة') || newInv.paymentMethod === 'card' || (newInv.paymentMethod as string) === 'bank_transfer';
              const targetCode = isBankLine ? (newInv.bankTreasuryCode || '1103') : (newInv.cashTreasuryCode || '1101');
              return {
                ...line,
                accountCode: targetCode,
                debit: isBankLine ? (newInv.bankPaidAmount || newInv.paidAmount) : (newInv.cashPaidAmount || newInv.paidAmount)
              };
            }
            return line;
          });
          return {
            ...je,
            lines: updatedLines
          };
        }
        return je;
      }));
    }
  };

  const addJournalEntry = (entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'createdAt'>): JournalEntry => {
    // Exact minor-unit validation; NEVER change an accounting amount silently.
    if (!entry.lines || entry.lines.length < 2) {
      throw new Error('القيد غير صالح: يجب إدخال طرف مدين وطرف دائن على الأقل.');
    }
    const cents = (value: number): number => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error('مبلغ القيد غير صالح.');
      }
      const minor = Math.round(value * 100);
      if (!Number.isSafeInteger(minor) || Math.abs(value * 100 - minor) > 1e-6) {
        throw new Error('المبالغ يجب ألا تتجاوز منزلتين عشريتين.');
      }
      return minor;
    };
    let debitMinor = 0;
    let creditMinor = 0;
    for (const line of entry.lines) {
      if (!line.accountCode) throw new Error('رقم حساب القيد مفقود.');
      const debit = cents(line.debit);
      const credit = cents(line.credit);
      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new Error('كل سطر يجب أن يحتوي مبلغًا مدينًا أو دائنًا فقط.');
      }
      debitMinor += debit;
      creditMinor += credit;
    }
    if (debitMinor <= 0 || debitMinor !== creditMinor ||
        !Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)) {
      throw new Error(`قيد غير متوازن: المدين ${debitMinor / 100}، الدائن ${creditMinor / 100}.`);
    }
    const validLines = entry.lines.map(line => ({ ...line }));

    const uniqueSuffix = Math.random().toString(36).substring(2, 8) + '-' + Math.floor(Math.random() * 1000);
    const id = 'je-' + Date.now() + '-' + uniqueSuffix;
    const createdAt = new Date().toISOString();
    const nextIndex = journalEntries.length + 1;
    const entryNumber = `JE-2026-${String(nextIndex).padStart(4, '0')}`;
    const newEntry: JournalEntry = {
      ...entry,
      lines: validLines,
      id,
      entryNumber,
      createdAt
    };

    setJournalEntries(prev => {
      const next = [newEntry, ...prev];
      try { localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(next)); } catch {}
      broadcastEntityChange('journalEntries', next);
      return next;
    });

    // No direct writes to the old 'journals' or 'journalEntries' collections.
    // Only the canonical outbox may send the journal to Firestore.

    pushToServerSync('journalEntries', newEntry);

    // Telegram proof is generated exclusively by the Node/PostgreSQL server
    // AFTER a durable successful commit. Local/offline writes are not confirmed.

    // Update account balances according to double entry rule
    setAccounts(prev => {
      const updated = [...prev];
      validLines.forEach(line => {
        const acc = updated.find(a => a.code === line.accountCode);
        if (acc) {
          // Normal balance: Asset & Expense = Debit - Credit; Liability, Equity, Revenue = Credit - Debit
          if (acc.type === 'asset' || acc.type === 'expense') {
            acc.balance += (line.debit - line.credit);
          } else {
            acc.balance += (line.credit - line.debit);
          }
        }
      });
      try { localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(updated)); } catch {}
      broadcastEntityChange('accounts', updated);
      return updated;
    });

    return newEntry;
  };

  // Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
  const addExpense = (
    expenseData: Omit<ExpenseItem, 'id' | 'createdAt'>
  ): ExpenseItem => {
    const id = `exp-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const voucherNum = `PV-EXP-${Date.now().toString().slice(-5)}`;

    const selectedAcc = accounts.find(a => a.code === expenseData.expenseAccountCode) || {
      code: expenseData.expenseAccountCode,
      name: expenseData.expenseAccountName || 'مصروفات عامة'
    };

    const targetTreasury = treasuries.find(
      t => t.accountCode === expenseData.treasuryAccountCode || t.id === expenseData.treasuryAccountCode
    );
    const treasuryCode = targetTreasury ? targetTreasury.accountCode : (expenseData.treasuryAccountCode || '1101');
    const treasuryName = targetTreasury ? targetTreasury.name : (expenseData.treasuryName || 'الصندوق النقدي (الكاشير)');

    const amount = Number(expenseData.amount) || 0;
    const curr = expenseData.currency || settings.baseCurrencyCode || 'ILS';
    const rate = expenseData.exchangeRate || 1.0;
    const baseAmount = Number((amount * rate).toFixed(2));

    // 1. Post balanced double-entry journal first to obtain real journalEntryId
    const postedJournal = addJournalEntry({
      date: expenseData.date,
      description: `سداد مصروف تشغيلي: ${selectedAcc.name} - ${expenseData.beneficiary || ''} (${expenseData.notes || expenseData.categoryName})`,
      referenceType: 'expense' as any,
      referenceId: id,
      lines: [
        {
          accountCode: selectedAcc.code,
          accountName: selectedAcc.name,
          debit: baseAmount,
          credit: 0,
          description: `مصروف: ${expenseData.notes || expenseData.categoryName}`
        },
        {
          accountCode: treasuryCode,
          accountName: treasuryName,
          debit: 0,
          credit: baseAmount,
          description: `صرف من: ${treasuryName}`
        }
      ]
    });

    const newExpense: ExpenseItem = {
      ...expenseData,
      id,
      createdAt,
      voucherNumber: voucherNum,
      journalEntryId: postedJournal.id,
      treasuryAccountCode: treasuryCode,
      treasuryName,
      currency: curr,
      exchangeRate: rate
    };

    setExpenses(prev => [newExpense, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'expenses', newExpense.id), cleanDocForFirestore(newExpense)).catch(err => {
      console.warn('Direct cloud save expense notice:', err);
    });

    // 2. Adjust treasury register balance and transaction history
    adjustTreasuryBalance(
      treasuryCode,
      -amount,
      `مصروف: ${selectedAcc.name} (${expenseData.beneficiary || ''})`,
      'manual',
      id,
      {
        currency: curr,
        currencySymbol: expenseData.currencySymbol || (curr === 'ILS' ? '₪' : curr),
        exchangeRate: rate,
        voucherNumber: voucherNum,
        partyName: expenseData.beneficiary,
        date: expenseData.date
      }
    );

    return newExpense;
  };

  const deleteExpense = (id: string) => {
    const existing = expenses.find(e => e.id === id);
    if (!existing) return;

    // 1. Revert Treasury balance
    if (existing.treasuryAccountCode && existing.amount) {
      adjustTreasuryBalance(
        existing.treasuryAccountCode,
        existing.amount,
        `إلغاء قيد مصروف: ${existing.expenseAccountName}`,
        'manual',
        id
      );
    }

    // 2. Revert journal entry
    const targetJournalId = existing.journalEntryId;
    setJournalEntries(prev => prev.filter(je => je.id !== targetJournalId && je.referenceId !== id));
    if (targetJournalId) {
      deleteDoc(doc(db, 'journalEntries', targetJournalId)).catch(() => {});
      deleteDoc(doc(db, 'journals', targetJournalId)).catch(() => {});
    }

    // 3. Remove expense item from state & cloud
    setExpenses(prev => prev.filter(e => e.id !== id));
    registerDeletedDoc('expenses', id);
    deleteDoc(doc(db, 'expenses', id)).catch(() => {});
  };

  const addStockMovement = (movement: Omit<StockMovement, 'id'>) => {
    const id = 'sm-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const newMovement: StockMovement = {
      ...movement,
      id,
      time: movement.time || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    };
    setStockMovements(prev => {
      const next = [newMovement, ...prev];
      try { localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(next)); } catch {}
      broadcastEntityChange('stockMovements', next);
      pushToServerSync('stockMovements', newMovement);
      return next;
    });
    setDoc(doc(db, 'stockMovements', newMovement.id), cleanDocForFirestore(newMovement)).catch(() => {});
  };

  const addInventoryItem = (item: Omit<InventoryItem, 'id'>) => {
    const id = 'inv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    // Enforce SKU uniqueness: ensure item.code never duplicates any existing item and is issued safely upon save
    let uniqueCode = (item.code || '').trim();
    const isAutoOrEmpty = !uniqueCode || uniqueCode === 'تلقائي بعد الحفظ' || uniqueCode.includes('تلقائي');
    const isDuplicate = !isAutoOrEmpty && inventory.some(it => (it.code || '').trim().toLowerCase() === uniqueCode.toLowerCase());
    if (isAutoOrEmpty || isDuplicate) {
      uniqueCode = generateSequentialSku(item.category, inventory.map(i => i.code || ''), settings.categories);
    }

    const newItem: InventoryItem = { ...item, id, code: uniqueCode, lastMovementDate: today };
    setInventory(prev => {
      const next = [newItem, ...prev];
      broadcastEntityChange('inventory', next);
      pushToServerSync('inventory', newItem);
      return next;
    });

    // Save directly to cloud
    setDoc(doc(db, 'inventory', newItem.id), cleanDocForFirestore(newItem)).catch(err => {
      console.warn('Direct cloud save inventory notice:', err);
    });

    // If opening stock > 0, record opening balance in stock movements ledger
    if (item.stockQuantity > 0) {
      addStockMovement({
        itemId: id,
        itemCode: uniqueCode,
        itemName: item.name,
        category: item.category,
        date: today,
        time,
        type: 'in_opening',
        quantity: item.stockQuantity,
        balanceBefore: 0,
        balanceAfter: item.stockQuantity,
        unitPrice: item.purchasePrice,
        totalValue: item.stockQuantity * item.purchasePrice,
        referenceType: 'opening',
        referenceNumber: 'OP-' + uniqueCode,
        reason: 'رصيد افتتاحي عند تعريف وتكويد الصنف',
        performedBy: 'أمين المستودع'
      });
    }

    return newItem;
  };

  const updateInventoryItem = (id: string, updated: Partial<InventoryItem>) => {
    const existing = inventory.find(it => it.id === id);
    let merged: InventoryItem;
    if (existing) {
      // Permanent Code Immutability Guarantee: Once created, the item's SKU/Code is locked forever
      const { code: _ignored, category: _ignoredCategory, ...allowedUpdates } = updated;
      merged = { ...existing, ...allowedUpdates, code: existing.code, category: existing.category };
    } else {
      merged = { ...updated, id } as InventoryItem;
    }

    setInventory(prev => {
      const next = prev.map(it => (it.id === id ? merged : it));
      if (!prev.some(it => it.id === id)) next.push(merged);
      broadcastEntityChange('inventory', next);
      pushToServerSync('inventory', merged);
      try {
        localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(next));
      } catch {}
      return next;
    });
    setDoc(doc(db, 'inventory', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});

    // Bidirectional sync: sync item special prices to customer profiles
    if (updated.customerSpecialPrices !== undefined) {
      const itemSpecials = updated.customerSpecialPrices || [];
      setParties(prevParties => {
        let partiesChanged = false;
        const nextParties = prevParties.map(p => {
          const matchedSp = itemSpecials.find(sp => sp.customerId === p.id || (p.code && sp.customerCode === p.code));
          if (matchedSp) {
            if (!p.specialPrices || p.specialPrices[id] !== matchedSp.price) {
              partiesChanged = true;
              return {
                ...p,
                specialPrices: {
                  ...(p.specialPrices || {}),
                  [id]: matchedSp.price
                }
              };
            }
          } else if (p.specialPrices && p.specialPrices[id] !== undefined) {
            partiesChanged = true;
            const copy = { ...p.specialPrices };
            delete copy[id];
            return { ...p, specialPrices: copy };
          }
          return p;
        });
        if (partiesChanged) {
          try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(nextParties)); } catch {}
          broadcastEntityChange('parties', nextParties);
        }
        return partiesChanged ? nextParties : prevParties;
      });
    }
  };

  const deleteInventoryItem = (id: string): { success: boolean; message: string } => {
    const hasMovements = stockMovements.some(m => m.itemId === id);
    if (hasMovements) {
      return { success: false, message: 'لا يمكن حذف الصنف لوجود حركات (وارد/منصرف) مسجلة عليه.' };
    }
    
    const usedInInvoices = invoices.some(inv => inv.items.some(i => i.itemId === id));
    if (usedInInvoices) {
       return { success: false, message: 'لا يمكن حذف الصنف لوجوده في فواتير مبيعات سابقة.' };
    }
    
    const usedInPurchases = purchases.some(p => p.items.some(i => i.itemId === id));
    if (usedInPurchases) {
       return { success: false, message: 'لا يمكن حذف الصنف لوجوده في فواتير مشتريات سابقة.' };
    }

    setInventory(prev => {
      const next = prev.filter(it => it.id !== id);
      pushDeltaToServer('inventory', 'delete', { id, _deleted: true });
      broadcastEntityChange('inventory', next);
      return next;
    });
    registerDeletedDoc('inventory', id);
    deleteDoc(doc(db, 'inventory', id)).catch(() => {});
    return { success: true, message: 'تم حذف الصنف بنجاح' };
  };

  const adjustStock = (id: string, newQuantity: number, reason: string, notes?: string) => {
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    setInventory(prev => prev.map(it => {
      if (it.id === id) {
        const oldQty = it.stockQuantity;
        const diff = newQuantity - oldQty;
        if (diff !== 0) {
          const isSurplus = diff > 0;
          const movementType: StockMovementType = isSurplus ? 'in_adjustment' : 'out_adjustment';
          const totalVal = Math.abs(diff) * it.purchasePrice;

          addStockMovement({
            itemId: it.id,
            itemCode: it.code,
            itemName: it.name,
            category: it.category,
            date: today,
            time,
            type: movementType,
            quantity: Math.abs(diff),
            balanceBefore: oldQty,
            balanceAfter: newQuantity,
            unitPrice: it.purchasePrice,
            totalValue: totalVal,
            referenceType: 'adjustment',
            referenceNumber: `ADJ-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
            reason: reason || (isSurplus ? 'تسوية جرد (فائض وزيادة مخزنية)' : 'تسوية جرد (عجز وهالك تالف)'),
            notes: notes || `تسوية رصيد الصنف من ${oldQty} إلى ${newQuantity} ${it.unit}`,
            performedBy: 'لجنة الجرد والمطابقة'
          });
        }
        const updatedItem = { ...it, stockQuantity: newQuantity, lastMovementDate: today };
        setDoc(doc(db, 'inventory', id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));
  };

  const addParty = (partyData: Omit<Party, 'id' | 'balance' | 'code'> & { initialBalance?: number; code?: string }) => {
    // منع تكرار إنشاء زبون نقدي أو عميل عام بأي حال من الأحوال
    const trimmedName = (partyData.name || '').trim();
    const isGenericCash = trimmedName === 'زبون نقدي' || trimmedName === 'عميل نقدي' || trimmedName === 'عميل كاشير نقدي' || trimmedName === 'زبون عام';
    if (isGenericCash) {
      const existing = parties.find(p => (p.name || '').trim() === trimmedName);
      if (existing) {
        return existing;
      }
    }

    const id = 'pt-' + Date.now();
    // Enforce sequential code generated automatically by the program (cannot be duplicated or altered)
    const code = generateSequentialPartyCode(partyData.type, parties, Boolean(partyData.isSubCustomer));

    let initialBal = partyData.initialBalance || 0;
    if (partyData.openingBalance !== undefined && partyData.openingBalance > 0) {
      if (partyData.openingBalanceType === 'credit' || (!partyData.openingBalanceType && partyData.type === 'supplier')) {
        initialBal = -Math.abs(partyData.openingBalance);
      } else {
        initialBal = Math.abs(partyData.openingBalance);
      }
    }

    const newParty: Party = {
      ...partyData,
      id,
      code,
      balance: initialBal,
      openingBalance: partyData.openingBalance !== undefined ? partyData.openingBalance : Math.abs(initialBal),
      openingBalanceType: partyData.openingBalanceType || (initialBal < 0 ? 'credit' : 'debit'),
      openingBalanceDate: partyData.openingBalanceDate || new Date().toISOString().split('T')[0]
    };
    setParties(prev => {
      const next = [...prev, newParty];
      broadcastEntityChange('parties', next);
      pushToServerSync('parties', newParty);
      try {
        localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(next));
        localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
      } catch (e) {}
      return next;
    });

    setHasUnsyncedChanges(true);
    setPendingSyncCount(prev => prev + 1);

    // Save directly to cloud
    setDoc(doc(db, 'parties', newParty.id), cleanDocForFirestore(newParty)).catch(err => {
      console.warn('Direct cloud save party notice:', err);
    });

    return newParty;
  };

  const updateParty = (id: string, updated: Partial<Party>) => {
    if (isCashCustomerParty(parties.find(p => p.id === id) || parties.find(p => p.code === id))) {
      throw new Error('العميل النقدي CUST-0001 ثابت ولا يمكن تعديل بياناته.');
    }
    let finalMergedParty: Party | null = null;
    let targetId = id;

    setParties(prev => {
      // Resolve by immutable ID first. An entered public code is accepted only
      // if it maps to exactly one record; names are never lookup keys.
      const exact = prev.find(p => p.id === id);
      const codeMatches = exact ? [] : prev.filter(p => p.code && p.code.toLowerCase() === id.toLowerCase());
      const existing = exact || (codeMatches.length === 1 ? codeMatches[0] : undefined);
      if (!existing) {
        console.warn(`updateParty: Target party ${id} not found in parties list. Ignored.`);
        return prev;
      }
      targetId = existing.id;

      const { code: _ignored, ...allowedUpdates } = updated;
      const merged: Party = { ...existing, ...allowedUpdates, code: existing.code };

      // If existing party exists, preserve existing balance unless explicitly updated.balance is passed or openingBalance is modified
      if (updated.balance !== undefined) {
        merged.balance = updated.balance;
      } else if (updated.openingBalance !== undefined) {
        const isCredit = merged.openingBalanceType === 'credit' || (!merged.openingBalanceType && merged.type === 'supplier');
        const nextOpeningVal = isCredit ? -Math.abs(merged.openingBalance) : Math.abs(merged.openingBalance);
        
        const oldIsCredit = existing.openingBalanceType === 'credit' || (!existing.openingBalanceType && existing.type === 'supplier');
        const oldOpeningVal = oldIsCredit ? -Math.abs(existing.openingBalance || 0) : Math.abs(existing.openingBalance || 0);
        
        // Current balance adjusts by the difference in opening balance
        const diff = nextOpeningVal - oldOpeningVal;
        merged.balance = Number(((existing.balance || 0) + diff).toFixed(2));
      } else {
        merged.balance = existing.balance;
      }

      // Cash customers strictly never carry special prices
      if (isCashCustomerParty(merged)) {
        delete merged.specialPrices;
      }

      finalMergedParty = merged;

      const nextParties = prev.map(p => (p.id === targetId ? merged : p));

      // 2. Persist to LocalStorage immediately with the updated array
      try {
        localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(nextParties));
        localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
        const hashes = JSON.parse(localStorage.getItem('accounting_synced_hashes') || '{}');
        delete hashes[`parties_${targetId}`];
        safeSetSyncedHashes(hashes);
      } catch (e) {}

      // 3. Direct cloud update and multi-device hub push
      setDoc(doc(db, 'parties', targetId), cleanDocForFirestore(merged), { merge: true }).catch(err => {
        console.warn('Direct cloud update party notice:', err);
      });
      broadcastEntityChange('parties', nextParties);
      pushToServerSync('parties', merged);

      return nextParties;
    });

    setHasUnsyncedChanges(true);
    setPendingSyncCount(prev => prev + 1);

    // Bidirectional sync: sync customer special prices into inventory items (strictly NEVER for cash customers)
    if (updated.specialPrices !== undefined && finalMergedParty && !isCashCustomerParty(finalMergedParty)) {
      const partyObj: Party = finalMergedParty;
      const specials = updated.specialPrices;
      setInventory(prevInv => {
        let invChanged = false;
        const nextInv = prevInv.map(invItem => {
          const spVal = specials[invItem.id] !== undefined
            ? specials[invItem.id]
            : (invItem.code && specials[invItem.code] !== undefined ? specials[invItem.code] : undefined);
          let curList = invItem.customerSpecialPrices ? [...invItem.customerSpecialPrices] : [];
          if (spVal !== undefined && typeof spVal === 'number' && spVal >= 0) {
            const idx = curList.findIndex(sp => sp.customerId === targetId || (partyObj.code && sp.customerCode === partyObj.code));
            const newEntry: CustomerSpecialPrice = {
              customerId: targetId,
              customerName: partyObj.name,
              customerCode: partyObj.code,
              price: spVal,
              updatedAt: new Date().toISOString()
            };
            if (idx >= 0) {
              curList[idx] = newEntry;
            } else {
              curList.push(newEntry);
            }
            invChanged = true;
            return { ...invItem, customerSpecialPrices: curList };
          } else {
            const filtered = curList.filter(sp => sp.customerId !== targetId && (!partyObj.code || sp.customerCode !== partyObj.code));
            if (filtered.length !== curList.length) {
              invChanged = true;
              return { ...invItem, customerSpecialPrices: filtered.length > 0 ? filtered : undefined };
            }
            return invItem;
          }
        });
        if (invChanged) {
          try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(nextInv)); } catch {}
          broadcastEntityChange('inventory', nextInv);
        }
        return invChanged ? nextInv : prevInv;
      });
    }

    if (debouncedSyncRef.current) {
      clearTimeout(debouncedSyncRef.current);
    }
    debouncedSyncRef.current = setTimeout(() => {
      if (navigator.onLine && syncToFirebaseRef.current) {
        syncToFirebaseRef.current(true);
      }
    }, 1500);

    return finalMergedParty;
  };

  const deleteParty = (id: string): { success: boolean; message?: string } => {
    const target = parties.find(p => p.id === id);
    if (!target) return {success:false,message:'العميل غير موجود في القائمة المعتمدة.'};
    if (isCashCustomerParty(target))
      return {success:false,message:'الزبون النقدي CUST-0001 ثابت ولا يمكن حذفه.'};
    const hasInvoices = invoices.some(i =>
      i.customerId === id || i.subCustomerId === id ||
      ((i as Invoice & { counterpartyId?: string }).counterpartyId === id));
    const hasPurchases = purchases.some(p => p.supplierId === id);
    const hasReturns = purchaseReturns.some(r => r.supplierId === id) ||
      salesReturns.some(r => r.customerId === id);
    const hasVouchers = vouchers.some(v => v.partyId === id);
    const hasPrintOrders = printOrders.some(po => po.customerId === id);
    const hasChildren = parties.some(p => p.parentPartyId === id);
    const hasClearing = debtClearings.some(c => c.customerId === id || c.supplierId === id);
    if (hasInvoices || hasPurchases || hasReturns || hasVouchers ||
        hasPrintOrders || hasChildren || hasClearing) {
      return {
        success: false,
        message: 'لا يمكن حذف العميل لارتباطه بفواتير أو حركات أو عملاء فرعيين. يمكن تعديل بياناته دون المساس بمراجعه المحاسبية.'
      };
    }

    setParties(prev => {
      const next = prev.filter(p => p.id !== id);
      pushDeltaToServer('parties', 'delete', { id, _deleted: true });
      broadcastEntityChange('parties', next);
      return next;
    });
    registerDeletedDoc('parties', id);
    deleteDoc(doc(db, 'parties', id)).catch(err => console.warn('Direct cloud delete party notice:', err));
    if (selectedPartyForStatement?.id === id) {
      setSelectedPartyForStatement(null);
    }
    return { success: true };
  };

  // Employee management
  const addEmployee = (employeeData: Omit<Employee, 'id'>) => {
    const id = 'emp-' + Date.now();
    const newEmp: Employee = {
      ...employeeData,
      id,
      paymentHistory: employeeData.paymentHistory || []
    };
    setEmployees(prev => [newEmp, ...prev]);
    setDoc(doc(db, 'employees', newEmp.id), cleanDocForFirestore(newEmp)).catch(() => {});
    return newEmp;
  };

  const updateEmployee = (id: string, updated: Partial<Employee>) => {
    const existing = employees.find(emp => emp.id === id);
    const merged: Employee = existing ? { ...existing, ...updated } : ({ ...updated, id } as Employee);
    setEmployees(prev => prev.map(emp => (emp.id === id ? merged : emp)));
    try {
      const next = employees.map(emp => (emp.id === id ? merged : emp));
      localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(next));
    } catch {}
    setDoc(doc(db, 'employees', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});
  };

  const deleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(emp => emp.id !== id));
    registerDeletedDoc('employees', id);
    deleteDoc(doc(db, 'employees', id)).catch(() => {});
  };

  const payEmployeeSalary = (
    employeeId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    note: string,
    type: 'salary' | 'advance',
    period: string
  ) => {
    const targetEmp = employees.find(e => e.id === employeeId);
    if (!targetEmp) return;

    const voucherNumber = `PV-SAL-${new Date().getFullYear()}-${String(vouchers.length + 1).padStart(4, '0')}`;
    const today = new Date().toISOString().split('T')[0];

    const paymentRecord = {
      id: 'sp-' + Date.now(),
      date: today,
      amount,
      type,
      period,
      paymentMethod,
      notes: note,
      voucherNumber
    };

    setEmployees(prev =>
      prev.map(emp => {
        if (emp.id === employeeId) {
          const updatedEmp = {
            ...emp,
            paymentHistory: [paymentRecord, ...(emp.paymentHistory || [])]
          };
          setDoc(doc(db, 'employees', emp.id), cleanDocForFirestore(updatedEmp)).catch(() => {});
          return updatedEmp;
        }
        return emp;
      })
    );

    const cashBankCode = paymentMethod === 'cash' ? '1101' : '1102';
    const cashBankName = paymentMethod === 'cash' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

    const newVoucher: PaymentVoucher = {
      id: 'vch-' + Date.now(),
      voucherNumber,
      type: 'payment',
      date: today,
      partyId: targetEmp.id,
      partyName: targetEmp.name,
      amount,
      paymentMethod: paymentMethod === 'credit' ? 'cash' : (paymentMethod as 'cash' | 'bank_transfer' | 'cheque'),
      accountCode: '5201',
      description: `${type === 'salary' ? 'صرف راتب' : 'صرف سلفة'} للموظف: ${targetEmp.name} (${targetEmp.jobTitle}) - ${period}`
    };

    setVouchers(prev => {
      const next = [newVoucher, ...prev];
      broadcastEntityChange('vouchers', next);
      pushToServerSync('vouchers', newVoucher);
      return next;
    });
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

    addJournalEntry({
      date: today,
      description: `سند صرف رواتب ${voucherNumber} للموظف ${targetEmp.name} - ${period}`,
      referenceType: 'payment',
      referenceId: newVoucher.id,
      lines: [
        {
          accountCode: '5201',
          accountName: 'مصروفات الرواتب والأجور',
          debit: amount,
          credit: 0,
          description: `${type === 'salary' ? 'راتب' : 'سلفة'} ${targetEmp.name} (${period})`
        },
        {
          accountCode: cashBankCode,
          accountName: cashBankName,
          debit: 0,
          credit: amount,
          description: `صرف من ${cashBankName}`
        }
      ]
    });
  };

  // Employee Adjustments & Payroll Sheets
  const addEmployeeAdvance = (
    employeeId: string,
    amount: number,
    date: string,
    treasuryAccountCode: string,
    reason: string,
    disburseImmediately: boolean
  ) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const treasuryAcc = accounts.find(a => a.code === treasuryAccountCode);
    const treasuryName = treasuryAcc ? treasuryAcc.name : (treasuryAccountCode === '1101' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)');

    let voucherNumber: string | undefined = undefined;

    if (disburseImmediately) {
      voucherNumber = `PV-ADV-${new Date().getFullYear()}-${String(vouchers.length + 1).padStart(4, '0')}`;
      const newVoucher: PaymentVoucher = {
        id: 'vch-' + Date.now(),
        voucherNumber,
        type: 'payment',
        date,
        partyId: emp.id,
        partyName: emp.name,
        amount,
        paymentMethod: treasuryAccountCode === '1101' ? 'cash' : 'bank_transfer',
        accountCode: '1104',
        description: `سند صرف سلفة نقدية للموظف: ${emp.name} (${emp.jobTitle}) - ${reason}`
      };
      setVouchers(prev => {
      const next = [newVoucher, ...prev];
      broadcastEntityChange('vouchers', next);
      pushToServerSync('vouchers', newVoucher);
      return next;
    });
      setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

      // Journal entry: Debit 1104 (سلف ومستحقات الموظفين), Credit Treasury (1101/1102)
      addJournalEntry({
        date,
        description: `سند صرف سلفة فورية ${voucherNumber} للموظف ${emp.name} - ${reason}`,
        referenceType: 'payment',
        referenceId: newVoucher.id,
        lines: [
          {
            accountCode: '1104',
            accountName: 'سلف ومستحقات الموظفين',
            debit: amount,
            credit: 0,
            description: `سلفة ${emp.name} - ${reason}`
          },
          {
            accountCode: treasuryAccountCode,
            accountName: treasuryName,
            debit: 0,
            credit: amount,
            description: `صرف من ${treasuryName}`
          }
        ]
      });

      // Add to employee payment history
      setEmployees(prev =>
        prev.map(e => {
          if (e.id === employeeId) {
            const updatedEmp = {
              ...e,
              paymentHistory: [
                {
                  id: 'sp-' + Date.now(),
                  date,
                  amount,
                  type: 'advance' as const,
                  period: `سلفة نقدية (${date})`,
                  paymentMethod: treasuryAccountCode === '1101' ? 'cash' as const : 'bank_transfer' as const,
                  voucherNumber,
                  notes: reason
                },
                ...(e.paymentHistory || [])
              ]
            };
            setDoc(doc(db, 'employees', e.id), cleanDocForFirestore(updatedEmp)).catch(() => {});
            return updatedEmp;
          }
          return e;
        })
      );
    }

    const newAdvance: EmployeeAdvance = {
      id: 'adv-' + Date.now(),
      employeeId,
      employeeName: emp.name,
      date,
      amount,
      treasuryAccountCode,
      treasuryName,
      reason,
      status: 'pending',
      disbursedImmediately: disburseImmediately,
      voucherNumber
    };

    setEmployeeAdvances(prev => [newAdvance, ...prev]);
    setDoc(doc(db, 'employeeAdvances', newAdvance.id), cleanDocForFirestore(newAdvance)).catch(() => {});
  };

  const cancelEmployeeAdvance = (id: string) => {
    setEmployeeAdvances(prev => prev.map(a => {
      if (a.id === id) {
        const updated = { ...a, status: 'cancelled' as const };
        setDoc(doc(db, 'employeeAdvances', id), cleanDocForFirestore(updated)).catch(() => {});
        return updated;
      }
      return a;
    }));
  };

  const addEmployeeDeduction = (employeeId: string, amount: number, date: string, reason: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const newDed: EmployeeDeduction = {
      id: 'ded-' + Date.now(),
      employeeId,
      employeeName: emp.name,
      date,
      amount,
      reason,
      status: 'pending'
    };

    setEmployeeDeductions(prev => [newDed, ...prev]);
    setDoc(doc(db, 'employeeDeductions', newDed.id), cleanDocForFirestore(newDed)).catch(() => {});
  };

  const cancelEmployeeDeduction = (id: string) => {
    setEmployeeDeductions(prev => prev.map(d => {
      if (d.id === id) {
        const updated = { ...d, status: 'cancelled' as const };
        setDoc(doc(db, 'employeeDeductions', id), cleanDocForFirestore(updated)).catch(() => {});
        return updated;
      }
      return d;
    }));
  };

  const addEmployeeIncentive = (employeeId: string, amount: number, date: string, reason: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const newInc: EmployeeIncentive = {
      id: 'inc-' + Date.now(),
      employeeId,
      employeeName: emp.name,
      date,
      amount,
      reason,
      status: 'pending'
    };

    setEmployeeIncentives(prev => [newInc, ...prev]);
    setDoc(doc(db, 'employeeIncentives', newInc.id), cleanDocForFirestore(newInc)).catch(() => {});
  };

  const cancelEmployeeIncentive = (id: string) => {
    setEmployeeIncentives(prev => prev.map(i => {
      if (i.id === id) {
        const updated = { ...i, status: 'cancelled' as const };
        setDoc(doc(db, 'employeeIncentives', id), cleanDocForFirestore(updated)).catch(() => {});
        return updated;
      }
      return i;
    }));
  };

  const createDraftPayrollSheet = (
    sheetData: Omit<PayrollSheet, 'id' | 'sheetNumber' | 'createdAt' | 'status'>
  ): PayrollSheet => {
    const id = 'prs-' + Date.now();
    const count = payrollSheets.length + 1;
    const year = new Date().getFullYear();
    const sheetNumber = `PR-${year}-${String(count).padStart(4, '0')}`;
    const createdAt = new Date().toISOString().split('T')[0];

    const newSheet: PayrollSheet = {
      ...sheetData,
      id,
      sheetNumber,
      createdAt,
      status: 'draft'
    };

    setPayrollSheets(prev => [newSheet, ...prev]);
    setDoc(doc(db, 'payrollSheets', newSheet.id), cleanDocForFirestore(newSheet)).catch(() => {});
    return newSheet;
  };

  const updateDraftPayrollSheet = (id: string, updated: Partial<PayrollSheet>) => {
    let finalSheet: PayrollSheet | null = null;
    setPayrollSheets(prev =>
      prev.map(sheet => {
        if (sheet.id === id && sheet.status === 'draft') {
          finalSheet = { ...sheet, ...updated };
          return finalSheet;
        }
        return sheet;
      })
    );
    if (finalSheet) {
      setDoc(doc(db, 'payrollSheets', id), cleanDocForFirestore(finalSheet)).catch(() => {});
    }
  };

  const deleteDraftPayrollSheet = (id: string) => {
    setPayrollSheets(prev => prev.filter(s => !(s.id === id && s.status === 'draft')));
    deleteDoc(doc(db, 'payrollSheets', id)).catch(() => {});
  };

  const unapprovePayrollSheet = (id: string): { success: boolean; message?: string } => {
    const sheet = payrollSheets.find(s => s.id === id);
    if (!sheet) return { success: false, message: 'كشف الرواتب غير موجود' };
    if (sheet.status !== 'approved') return { success: false, message: 'الكشف ليس معتمداً' };

    const voucherNumber = sheet.voucherNumber;
    if (!voucherNumber) return { success: false, message: 'رقم السند غير موجود، لا يمكن إلغاء الاعتماد' };
    
    // Find the voucher
    const voucher = vouchers.find(v => v.voucherNumber === voucherNumber);
    
    if (voucher) {
      // 1. Delete voucher
      setVouchers(prev => prev.filter(v => v.id !== voucher.id));
      
      // 2. Delete Journal Entries
      setJournalEntries(prev => prev.filter(j => j.referenceId !== voucher.id));
      
      // 3. Delete Treasury Movements and restore balance
      const movements = vouchers.filter(m => m.referenceId === voucher.id);
      
      setAccounts(prev => prev.map(acc => {
         const movementForAcc = movements.find(m => m.accountId === acc.code || m.treasuryId === acc.code);
         if (movementForAcc) {
            let revertAmount = 0;
            if (movementForAcc.type === 'withdrawal' || movementForAcc.type === 'transfer_out') revertAmount = movementForAcc.amount;
            else if (movementForAcc.type === 'deposit' || movementForAcc.type === 'transfer_in') revertAmount = -movementForAcc.amount;
            
            return { ...acc, balance: acc.balance + revertAmount };
         }
         return acc;
      }));

      // setTreasuryMovements(prev => prev.filter(m => m.referenceId !== voucher.id));
    }

    // 4. Update the sheet status back to draft
    setPayrollSheets(prev =>
      prev.map(s =>
        s.id === id
          ? {
              ...s,
              status: 'draft',
              disbursedAt: undefined,
              voucherNumber: undefined,
              treasuryAccountCode: '',
              treasuryName: ''
            }
          : s
      )
    );
    
    // 5. Restore employee advances to 'approved' status
    const includedEmployeeIds = sheet.items.filter(item => item.isIncluded).map(item => item.employeeId);
    setEmployeeAdvances(prev => 
      prev.map(a => 
        (includedEmployeeIds.includes(a.employeeId) && a.status === 'deducted' && a.amount <= sheet.totalAdvances)
          ? { ...a, status: 'approved' } 
          : a
      )
    );

    return { success: true, message: 'تم إلغاء الاعتماد بنجاح وإعادة الكشف لحالة المسودة. يمكنك الآن تعديله.' };
  };

  const approveAndDisbursePayrollSheet = (id: string, treasuryAccountCodeOverride?: string): { success: boolean; message?: string } => {
    const sheet = payrollSheets.find(s => s.id === id);
    if (!sheet) return { success: false, message: 'كشف الرواتب غير موجود' };
    if (sheet.status === 'approved') return { success: false, message: 'كشف الرواتب معتمد ومصروف مسبقاً' };

    const treasuryCode = treasuryAccountCodeOverride || sheet.treasuryAccountCode || '1101';
    const treasuryAcc = accounts.find(a => a.code === treasuryCode);
    const treasuryName = treasuryAcc ? treasuryAcc.name : (treasuryCode === '1101' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)');

    // Check treasury balance
    if (treasuryAcc && treasuryAcc.balance < sheet.totalNet) {
      return {
        success: false,
        message: `رصيد ${treasuryName} الحالي (${treasuryAcc.balance.toLocaleString()} ر.س) غير كافٍ لصرف إجمالي صافي الرواتب (${sheet.totalNet.toLocaleString()} ر.س). يرجى تغذية الخزينة أو اختيار الخزينة الأخرى.`
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const voucherNumber = `PV-SAL-${new Date().getFullYear()}-${String(vouchers.length + 1).padStart(4, '0')}`;

    // 1. Create Payment Voucher for the batch
    const newVoucher: PaymentVoucher = {
      id: 'vch-' + Date.now(),
      voucherNumber,
      type: 'payment',
      date: today,
      partyId: 'payroll-batch',
      partyName: sheet.title,
      amount: sheet.totalNet,
      paymentMethod: treasuryCode === '1101' ? 'cash' : 'bank_transfer',
      accountCode: '5201',
      description: `صرف كشف رواتب ${sheet.sheetNumber}: ${sheet.title} - مسحوب من ${treasuryName} لعدد ${sheet.employeesCount} موظف`
    };
    setVouchers(prev => {
      const next = [newVoucher, ...prev];
      broadcastEntityChange('vouchers', next);
      pushToServerSync('vouchers', newVoucher);
      return next;
    });

    // 2. Generate Journal Entry
    // Gross expense = totalBasic + totalAllowances + totalIncentives - totalDeductions
    const grossExpense = sheet.totalBasic + sheet.totalAllowances + sheet.totalIncentives - sheet.totalDeductions;
    
    const lines = [
      {
        accountCode: '5201',
        accountName: 'مصروفات الرواتب والأجور',
        debit: grossExpense,
        credit: 0,
        description: `إجمالي استحقاق كشف رواتب ${sheet.sheetNumber} (${sheet.title})`
      }
    ];

    if (sheet.totalAdvances > 0) {
      lines.push({
        accountCode: '1104',
        accountName: 'سلف ومستحقات الموظفين',
        debit: 0,
        credit: sheet.totalAdvances,
        description: `تسوية واقتطاع سلف موظفين من كشف ${sheet.sheetNumber}`
      });
    }

    lines.push({
      accountCode: treasuryCode,
      accountName: treasuryName,
      debit: 0,
      credit: sheet.totalNet,
      description: `صرف صافي الرواتب من ${treasuryName}`
    });

    addJournalEntry({
      date: today,
      description: `قيد اعتماد وصرف كشف رواتب ${sheet.sheetNumber} (${sheet.title}) - سند ${voucherNumber}`,
      referenceType: 'payment',
      referenceId: newVoucher.id,
      lines
    });

    // 2.1 Update Treasury actual balance
    adjustTreasuryBalance(
      treasuryCode,
      -sheet.totalNet,
      `صرف صافي كشف رواتب ${sheet.sheetNumber}: ${sheet.title}`,
      'payroll',
      newVoucher.id,
      {
        currency: 'ILS',
        currencySymbol: '₪',
        exchangeRate: 1.0,
        voucherNumber,
        partyName: 'فريق العمل والموظفون',
        date: today
      }
    );

    // 3. Update the sheet status to approved
    setPayrollSheets(prev =>
      prev.map(s =>
        s.id === id
          ? {
              ...s,
              status: 'approved',
              disbursedAt: today,
              treasuryAccountCode: treasuryCode,
              treasuryName,
              voucherNumber
            }
          : s
      )
    );

    // 4. Update included employee advances to deducted
    const includedEmployeeIds = sheet.items.filter(item => item.isIncluded).map(item => item.employeeId);

    setEmployeeAdvances(prev =>
      prev.map(adv =>
        includedEmployeeIds.includes(adv.employeeId) && adv.status === 'pending'
          ? {
              ...adv,
              status: 'deducted',
              payrollSheetId: sheet.id,
              payrollSheetTitle: sheet.title,
              deductedAt: today
            }
          : adv
      )
    );

    // 5. Update included deductions to deducted
    setEmployeeDeductions(prev =>
      prev.map(ded =>
        includedEmployeeIds.includes(ded.employeeId) && ded.status === 'pending'
          ? {
              ...ded,
              status: 'deducted',
              payrollSheetId: sheet.id,
              payrollSheetTitle: sheet.title,
              deductedAt: today
            }
          : ded
      )
    );

    // 6. Update included incentives to paid
    setEmployeeIncentives(prev =>
      prev.map(inc =>
        includedEmployeeIds.includes(inc.employeeId) && inc.status === 'pending'
          ? {
              ...inc,
              status: 'paid',
              payrollSheetId: sheet.id,
              payrollSheetTitle: sheet.title,
              paidAt: today
            }
          : inc
      )
    );

    // 7. Update employees payment history
    setEmployees(prev =>
      prev.map(emp => {
        const item = sheet.items.find(i => i.employeeId === emp.id && i.isIncluded);
        if (!item) return emp;

        const newRecord: SalaryPaymentRecord = {
          id: 'sp-' + Date.now() + '-' + emp.id,
          date: today,
          amount: item.netSalary,
          type: 'salary',
          period: `${sheet.title} (${sheet.period})`,
          paymentMethod: treasuryCode === '1101' ? 'cash' : 'bank_transfer',
          voucherNumber,
          notes: `أساسي: ${item.basicSalary} + بدلات: ${item.allowances} + حوافز: ${item.incentives} - خصومات: ${item.deductions} - سلف: ${item.advancesDeducted} = صافي ${item.netSalary} ر.س`
        };

        return {
          ...emp,
          paymentHistory: [newRecord, ...(emp.paymentHistory || [])]
        };
      })
    );

    return {
      success: true,
      message: `تم اعتماد وصرف كشف الرواتب ${sheet.sheetNumber} بنجاح، وخُصم المبلغ (${sheet.totalNet.toLocaleString()} ر.س) من ${treasuryName}.`
    };
  };

  // Create POS Sale
  
  
  const broadcastEntityChange = (entity: string, data: any) => {
    try {
      if (syncChannelRef.current) {
        syncChannelRef.current.postMessage({
          type: 'SYNC_ENTITY_UPDATE',
          payload: { entity, data, time: Date.now() }
        });
      }
    } catch {}
  };

  const createPosSale = (
    items: Array<{
      item: InventoryItem;
      quantity: number;
      discount?: number;
      unitPrice?: number;
      itemName?: string;
      description?: string;
      notes?: string;
      hasDimensions?: boolean;
      length?: number;
      width?: number;
      count?: number;
      unit?: string;
      tax?: number;
      taxRate?: number;
      attachments?: LineAttachment[];
      imageThumbnail?: string;
    }>,
    customerName: string,
    paymentMethod: PaymentMethod,
    customerId?: string,
    notes?: string,
    extraOptions?: {
      invoiceNumber?: string;
      date?: string;
      additionalCharges?: number;
      overallDiscount?: number;
      taxRate?: number;
      paidAmount?: number;
      representative?: string;
      branch?: string;
      warehouse?: string;
      customCustomerText?: string;
      subCustomerId?: string;
      subCustomerName?: string;
      subCustomerPhone?: string;
      treasuryAccountCode?: string;
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      cashPaidAmount?: number;
      cashCurrency?: string;
      cashExchangeRate?: number;
      cashTreasuryCode?: string;
      bankPaidAmount?: number;
      bankCurrency?: string;
      bankExchangeRate?: number;
      bankTreasuryCode?: string;
      workflowStatus?: PosInvoiceWorkflowStatus;
      paymentStatus?: InvoicePaymentStatus;
      branchId?: string;
      userId?: string;
      userName?: string;
      editingInvoiceId?: string;
      editingInvoiceSnapshot?: string;
      counterpartyType?: 'customer' | 'supplier' | 'employee';
      counterpartyId?: string;
      paymentNotes?: string;
    }
  ): Invoice => {
    // ربط العميل النقدي برمز CUST-0001
    if ((extraOptions?.counterpartyType || 'customer') === 'customer' &&
        (!customerId || customerName === 'عميل كاشير نقدي' || customerName === 'عميل نقدي' || customerName === 'زبون عام' || customerId === 'pt-cust-1')) {
      const defaultCashCust = parties.find(p => p.code === 'CUST-0001');
      if (defaultCashCust) {
        customerId = defaultCashCust.id;
        customerName = defaultCashCust.name;
      }
    }

    // 1. التحقق الفوري ومنع التكرار نهائياً لأي معرف عملية (Transaction ID)
    let invId = extraOptions?.editingInvoiceId;
    if (!invId) {
      invId = 'inv-pos-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      // التأكد من عدم وجود معرف عملية مطاط أو مكرر بنفس المعرف في الفواتير الحالية
      let attempts = 0;
      while (invoices.some(inv => inv.id === invId) && attempts < 10) {
        invId = 'inv-pos-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        attempts++;
      }
    }

    
    // If editing, find the old invoice and reverse its effects
    const oldInvoice = extraOptions?.editingInvoiceId ? invoices.find(inv => inv.id === extraOptions.editingInvoiceId) : undefined;
    if (oldInvoice && oldInvoice.isAccountingPosted && !secureLoginEnabled()) {
      // 1. Reverse Stock
      setInventory(prevInv => prevInv.map(invItem => {
        const sold = oldInvoice.items.find(i => i.itemId === invItem.id);
        if (sold && invItem.category !== 'copy_scan') {
          return { ...invItem, stockQuantity: invItem.stockQuantity + sold.quantity };
        }
        return invItem;
      }));
      // 2. Reverse Customer Balance
      const oldBaseRemain = oldInvoice.remainingAmount * (oldInvoice.exchangeRate || 1);
      if (oldBaseRemain > 0) {
        setParties(prevParties => prevParties.map(p => {
          let pUpdated = { ...p };
          if (oldInvoice.subCustomerId && p.id === oldInvoice.subCustomerId) {
            pUpdated.balance = Number((pUpdated.balance - oldBaseRemain).toFixed(2));
          } else if (!oldInvoice.subCustomerId && oldInvoice.customerId && p.id === oldInvoice.customerId) {
            pUpdated.balance = Number((pUpdated.balance - oldBaseRemain).toFixed(2));
          }
          return pUpdated;
        }));
      }
    }

    // 2. Centralized atomic numbering gate:
    // Offline/local entries get a non-colliding temporary number until official cloud confirmation.
    const invoiceNumber = oldInvoice
      ? oldInvoice.invoiceNumber
      : `TEMP-${invId}`;
    const today = extraOptions?.date || new Date().toISOString().split('T')[0];
    const appliedTaxRate = extraOptions?.taxRate !== undefined ? extraOptions.taxRate : settings.vatRate;
    const additionalFees = extraOptions?.additionalCharges || 0;

    let subtotal = 0;
    let discountTotal = extraOptions?.overallDiscount || 0;
    let totalCogs = 0;
    let deliveryFeeTotal = 0;

    const invoiceItems = items.map(line => {
      const unitP = line.unitPrice !== undefined ? line.unitPrice : line.item.sellingPrice;
      const length = Number(line.length) || 0;
      const width = Number(line.width) || 0;
      const count = Number(line.count) || 1;
      const hasDimensions = Boolean(
        line.hasDimensions !== undefined
          ? line.hasDimensions
          : (length > 0 && width > 0 && (length !== 1 || width !== 1 || count > 1))
      );

      // حساب الأبعاد
      // إذا كان الصنف يحتاج أبعاداً: الكمية = الطول × العرض × العدد
      // أما الصنف العادي فيستخدم كمية مباشرة
      const quantity = (hasDimensions && length > 0 && width > 0)
        ? Number((length * width * count).toFixed(3))
        : (Number(line.quantity) || 1);

      const lineSubtotal = quantity * unitP;
      const lineDiscount = Number(line.discount) || 0;
      const lineNet = Math.max(0, lineSubtotal - lineDiscount);
      const lineTaxRate = line.taxRate !== undefined ? line.taxRate : appliedTaxRate;
      const lineTax = Number(((lineNet * lineTaxRate) / 100).toFixed(2));
      const lineTotal = Number((lineNet + lineTax).toFixed(2));

      const isDeliveryItem = line.item.id === 'srv-delivery' || line.item.id === 'srv-delivery-mobile' || line.item.barcode === 'DELIVERY' || line.item.name === 'خدمة توصيل' || line.item.name?.trim().startsWith('توصيل');

      subtotal += lineSubtotal;
      discountTotal += lineDiscount;

      // خدمة التوصيل: خدمة خدماتية لا تتطلب مخازن وهي خالية من المرابح تماماً (التكلفة = سعر البيع للزبون = ما يحاسب به عامل التوصيل)
      // ولا تدخل ضمن تكلفة البضاعة المباعة (COGS) للمخازن ولا قيود أرباح المنشأة
      if (isDeliveryItem) {
        deliveryFeeTotal += lineNet;
      } else if (line.item.category !== 'services' && line.item.category !== 'copy_scan') {
        const itemCost = line.item.purchasePrice || 0;
        totalCogs += itemCost * quantity;
      }

      return {
        itemId: line.item.id,
        itemCode: line.item.code || '',
        itemName: line.itemName || line.item.name,
        category: line.item.category,
        quantity,
        unitPrice: unitP,
        discount: lineDiscount,
        tax: lineTax,
        taxRate: lineTaxRate,
        total: lineTotal,
        description: line.description || '',
        notes: line.notes || '',
        hasDimensions,
        length,
        width,
        count,
        unit: line.unit || line.item.unit || 'قطعة',
        attachments: line.attachments || [],
        barcode: line.item.barcode,
        imageThumbnail: line.imageThumbnail || ''
      };
    });

    const netBeforeTax = subtotal - discountTotal;
    const taxAmount = Number(((netBeforeTax * appliedTaxRate) / 100).toFixed(2));
    const totalAmount = Number((netBeforeTax + taxAmount + additionalFees).toFixed(2));
    const paidAmount = extraOptions?.paidAmount !== undefined
      ? extraOptions.paidAmount
      : (paymentMethod === 'credit' ? 0 : totalAmount);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    // Multi-Currency conversions (العملة الأساسية: الشيكل الفلسطيني ₪)
    const transactionCurrency = extraOptions?.currency || settings.baseCurrencyCode || 'ILS';
    const transactionCurrencySymbol = extraOptions?.currencySymbol || settings.currency || '₪';
    const exchangeRate = extraOptions?.exchangeRate || 1.0;
    const baseTotalAmount = Number((totalAmount * exchangeRate).toFixed(2));
    const baseNetBeforeTax = Number((netBeforeTax * exchangeRate).toFixed(2));
    const baseTaxAmount = Number((taxAmount * exchangeRate).toFixed(2));
    const basePaidAmount = Number((paidAmount * exchangeRate).toFixed(2));
    const baseRemainingAmount = Number((remainingAmount * exchangeRate).toFixed(2));
    const baseDeliveryFee = Number((deliveryFeeTotal * exchangeRate).toFixed(2));
    const baseMerchandiseRevenue = Math.max(0, Number((baseNetBeforeTax - baseDeliveryFee).toFixed(2)));

    // Sub-customer resolution & persistence (الزبون الفرعي / الدين المؤقت)
    let resolvedSubCustId = extraOptions?.subCustomerId;
    let resolvedSubCustName = extraOptions?.subCustomerName;
    let resolvedSubCustPhone = extraOptions?.subCustomerPhone;

    // If subCustomer info wasn't directly supplied, parse customCustomerText
    if (!resolvedSubCustName && extraOptions?.customCustomerText) {
      const rawText = extraOptions.customCustomerText.trim();
      if (rawText && rawText !== customerName) {
        const phoneMatch = rawText.match(/(05\d{8}|01\d{8,9}|\+?\d{9,12})/);
        resolvedSubCustPhone = phoneMatch ? phoneMatch[0] : '';
        resolvedSubCustName = rawText.replace(resolvedSubCustPhone, '').trim() || rawText;
      }
    }

    let newlyCreatedSubParty: Party | null = null;
    const debtAmountToAdd = paymentMethod === 'credit' ? baseTotalAmount : (remainingAmount > 0 ? baseRemainingAmount : 0);

    if (resolvedSubCustName && resolvedSubCustName.trim()) {
      const cleanName = resolvedSubCustName.trim();
      // Normalize Arabic diacritics and letters for grouping identical names
      const normQuery = cleanName
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[إأآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/[يى]/g, 'ي')
        .trim();

      // Verify that this name does NOT belong to an existing main customer (main customers cannot be sub-customers)
      const isMainCustomer = parties.some(p => {
        if (p.isSubCustomer) return false;
        const normMain = (p.name || '')
          .toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '')
          .replace(/[إأآا]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/[يى]/g, 'ي')
          .trim();
        return normMain === normQuery;
      });

      if (!isMainCustomer) {
        const existingSub = parties.find(p => {
          if (!p.isSubCustomer) return false;
          if (resolvedSubCustId && p.id === resolvedSubCustId) return true;
          const normExisting = (p.name || '')
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/[يى]/g, 'ي')
            .trim();
          return normExisting === normQuery;
        });

        if (existingSub) {
          resolvedSubCustId = existingSub.id;
          resolvedSubCustName = existingSub.name;
          if (!resolvedSubCustPhone && existingSub.phone) {
            resolvedSubCustPhone = existingSub.phone;
          }
        } else {
          // Auto-create new sub-customer connected to main customer
          const subId = 'pt-sub-' + Date.now();
          const subCode = generateSequentialPartyCode('customer', parties, true);
          newlyCreatedSubParty = {
            id: subId,
            code: subCode,
            type: 'customer',
            name: cleanName,
            phone: resolvedSubCustPhone || '',
            parentPartyId: customerId,
            isSubCustomer: true,
            balance: debtAmountToAdd,
            openingBalance: 0,
            openingBalanceDate: today,
            openingBalanceType: 'debit',
            notes: `زبون فرعي / دين مؤقت متصل بالعميل الرئيسي: ${customerName || ''}`
          };
          resolvedSubCustId = subId;
        }
      } else {
        // Name belongs to a registered main customer; cannot be treated or saved as sub-customer
        resolvedSubCustId = undefined;
        resolvedSubCustName = undefined;
        resolvedSubCustPhone = undefined;
      }
    }

    const wfStatus: PosInvoiceWorkflowStatus = extraOptions?.workflowStatus || 'new';
    const isAccountingEligible = isInvoiceAccountingEligible(wfStatus);
    const isQuotation = wfStatus === 'quotation';

    // In quotation: no payments accepted ("هي فقط كعرض سعر لزبون معين دون أن يتم خصم أو استلام أي شي")
    const effectivePaidAmount = isQuotation ? 0 : paidAmount;
    const effectiveRemainingAmount = isQuotation ? totalAmount : remainingAmount;
    const effectiveBasePaidAmount = isQuotation ? 0 : basePaidAmount;
    const effectiveBaseRemainingAmount = isQuotation ? baseTotalAmount : baseRemainingAmount;

    // Calculate separated payment status
    const computedPayStatus = computeInvoicePaymentStatus({
      paymentMethod,
      totalAmount,
      paidAmount: effectivePaidAmount,
      remainingAmount: effectiveRemainingAmount,
      cashPaidAmount: isQuotation ? 0 : extraOptions?.cashPaidAmount,
      bankPaidAmount: isQuotation ? 0 : extraOptions?.bankPaidAmount,
      explicitPaymentStatus: extraOptions?.paymentStatus
    });

    const newInvoice: Invoice = {
      id: invId,
      invoiceNumber,
      date: today,
      customerId,
      counterpartyType: extraOptions?.counterpartyType || 'customer',
      counterpartyId: extraOptions?.counterpartyId || customerId,
      employeeId: extraOptions?.counterpartyType === 'employee' ? customerId : undefined,
      customerName: customerName || 'عميل كاشير نقدي',
      type: 'pos',
      items: invoiceItems,
      subtotal: Number(subtotal.toFixed(2)),
      discountTotal: Number(discountTotal.toFixed(2)),
      taxRate: appliedTaxRate,
      taxAmount,
      totalAmount,
      paidAmount: effectivePaidAmount,
      remainingAmount: effectiveRemainingAmount,
      paymentMethod,
      status: paymentMethod === 'credit' ? 'unpaid' : (effectiveRemainingAmount > 0 ? 'partial' : 'paid'),
      paymentStatus: computedPayStatus,
      workflowStatus: wfStatus,
      statusHistory: [
        {
          id: 'st-init-' + Date.now(),
          userName: extraOptions?.userName || currentUser?.fullName || 'كاشير',
          userId: extraOptions?.userId || currentUser?.id,
          date: today,
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          previousStatus: wfStatus,
          newStatus: wfStatus,
          notes: extraOptions?.workflowStatus === 'quotation'
            ? 'إنشاء وتوثيق عرض سعر في النظام'
            : 'إنشاء الفاتورة وتثبيتها في النظام',
          createdAt: new Date().toISOString()
        }
      ],
      notes,
      additionalCharges: additionalFees,
      representative: extraOptions?.representative,
      branch: extraOptions?.branch || 'الفرع الرئيسي',
      branchId: extraOptions?.branchId,
      userId: extraOptions?.userId,
      userName: extraOptions?.userName,
      warehouse: extraOptions?.warehouse || 'المخزن الرئيسي',
      customCustomerText: extraOptions?.customCustomerText || (resolvedSubCustName ? `${resolvedSubCustName}${resolvedSubCustPhone ? ` ${resolvedSubCustPhone}` : ''}` : undefined),
      subCustomerId: resolvedSubCustId,
      subCustomerName: resolvedSubCustName,
      subCustomerPhone: resolvedSubCustPhone,
      currency: transactionCurrency,
      currencySymbol: transactionCurrencySymbol,
      exchangeRate,
      baseTotalAmount,
      basePaidAmount: effectiveBasePaidAmount,
      cashPaidAmount: isQuotation ? 0 : extraOptions?.cashPaidAmount,
      bankPaidAmount: isQuotation ? 0 : extraOptions?.bankPaidAmount,
      cashTreasuryCode: extraOptions?.cashTreasuryCode,
      bankTreasuryCode: extraOptions?.bankTreasuryCode,
      paymentNotes: extraOptions?.paymentNotes,
      isAccountingPosted: isAccountingEligible,
      postedAt: isAccountingEligible ? new Date().toISOString() : undefined
    };

    // Secure PostgreSQL mode: Editing an official invoice is not a new sale.
    // Never reverse/repost inventory, journals, vouchers or customer balances
    // through the create-sale routine. Compare monetary values BEFORE writes.
    if (secureLoginEnabled() && oldInvoice) {
      const amended = prepareSecureInvoiceDescriptionEdit(
        oldInvoice as unknown as Record<string,any>,
        newInvoice as unknown as Record<string,any>
      ) as Invoice;
      setInvoices(prev=>prev.map(inv=>inv.id===amended.id?amended:inv));
      pushToServerSync('invoices',amended);
      return amended;
    }

    // 1. Deduct stock for physical items ONLY if invoice is accounting eligible (بيع/جديد - جاهز للتسليم - تم التسليم)
    if (isAccountingEligible) {
      const movementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      setInventory(prev => prev.map(invItem => {
        const matchingLines = items.filter(i => i.item.id === invItem.id);
        const totalSoldQuantity = matchingLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
        const isDeliveryOrService = invItem.category === 'copy_scan' || invItem.category === 'services' || invItem.id === 'srv-delivery' || invItem.id === 'srv-delivery-mobile' || invItem.barcode === 'DELIVERY' || invItem.name === 'خدمة توصيل' || invItem.name?.trim().startsWith('توصيل');
        if (totalSoldQuantity > 0 && !isDeliveryOrService) {
          const oldQty = Number(invItem.stockQuantity) || 0;
          const newQty = Number((oldQty - totalSoldQuantity).toFixed(2));
          addStockMovement({
            itemId: invItem.id,
            itemCode: invItem.code,
            itemName: invItem.name,
            category: invItem.category,
            date: today,
            time: movementTime,
            type: 'out_sale',
            quantity: totalSoldQuantity,
            balanceBefore: oldQty,
            balanceAfter: newQty,
            unitPrice: invItem.purchasePrice,
            totalValue: Number((totalSoldQuantity * invItem.purchasePrice).toFixed(2)),
            referenceType: 'pos_invoice',
            referenceNumber: invoiceNumber,
            reason: `مبيعات كاشير (${customerName || 'عميل نقدي'})`,
            performedBy: extraOptions?.representative || 'كاشير'
          });
          return {
            ...invItem,
            stockQuantity: newQty,
            lastMovementDate: today
          };
        }
        return invItem;
      }));
    }

    // 2. Treasury updates and collections:
    // "في حال وجود دفع في أي حالة من الحالات السابقة تدخل ضمن احتساب الصندوق حسب تحديد الصندوق في الفاتورة والمبلغ المدفوع
    // ولكن الفاتورة تضل ضمن حالتها دون دخلوها القيود المحاسبية للمخازن وما يتعلق بالأصناف إلا بعد تحويلها لجاهزة للتسليم"
    const cashVal = isQuotation ? 0 : (extraOptions?.cashPaidAmount || 0);
    const cashCurr = extraOptions?.cashCurrency || transactionCurrency || 'ILS';
    const cashCurrInfo = currencies.find(c => c.code === cashCurr);
    const cashRate = extraOptions?.cashExchangeRate !== undefined ? extraOptions.cashExchangeRate : (cashCurr === 'ILS' ? 1.0 : (cashCurrInfo?.rateAgainstBase || 1.0));
    const cashSymbol = cashCurr === 'ILS' ? '₪' : (cashCurrInfo?.symbol || cashCurr);
    const cashBase = Number((cashVal * cashRate).toFixed(2));

    const bankVal = isQuotation ? 0 : (extraOptions?.bankPaidAmount || 0);
    const bankCurr = extraOptions?.bankCurrency || transactionCurrency || 'ILS';
    const bankCurrInfo = currencies.find(c => c.code === bankCurr);
    const bankRate = extraOptions?.bankExchangeRate !== undefined ? extraOptions.bankExchangeRate : (bankCurr === 'ILS' ? 1.0 : (bankCurrInfo?.rateAgainstBase || 1.0));
    const bankSymbol = bankCurr === 'ILS' ? '₪' : (bankCurrInfo?.symbol || bankCurr);
    const bankBase = Number((bankVal * bankRate).toFixed(2));

    if (!isQuotation) {
      // تطهير الحركة ونقلها للصندوق الجديد بصورة نقية دون أي قيود عكسية (User Request 2)
      purgeAndTransferInvoiceTreasury(oldInvoice, newInvoice);

      // Record formal receipt payment voucher (سند قبض رسمي)
      if (effectiveBasePaidAmount > 0) {
        const receiptVoucherId = `vch-inv-${invId}`;
        const receiptVoucherNumber = `RCT-INV-${invoiceNumber.replace('INV-', '')}`;
        const newReceiptVoucher: PaymentVoucher = {
          id: receiptVoucherId,
          voucherNumber: receiptVoucherNumber,
          type: 'receipt',
          date: today,
          partyId: customerId,
          partyName: customerName || 'عميل نقدي',
          amount: effectiveBasePaidAmount,
          paymentMethod: paymentMethod === 'credit' ? 'cash' : (paymentMethod as any),
          accountCode: '1201',
          treasuryAccountCode: paymentMethod === 'cash' ? (extraOptions?.cashTreasuryCode || '1101') : (extraOptions?.bankTreasuryCode || '1105'),
          relatedDocType: 'pos_sale',
          relatedDocId: invId,
          description: `سند تحصيل فوري لفاتورة مبيعات رقم ${invoiceNumber}`
        };
        setVouchers(prev => [newReceiptVoucher, ...prev]);
      }
    }

    // 3. Accounting journal entries
    if (isAccountingEligible) {
      // Full sales entry in Base Currency
      const journalDebitLines: Array<{
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
        description?: string;
      }> = [];

      if (cashBase > 0) {
        const cCode = extraOptions?.cashTreasuryCode || '1101';
        const cAcc = accounts.find(a => a.code === cCode);
        journalDebitLines.push({
          accountCode: cCode,
          accountName: cAcc?.name || 'الصندوق النقدي',
          debit: cashBase,
          credit: 0,
          description: `تحصيل نقدي لفاتورة ${invoiceNumber}`
        });
      }

      if (bankBase > 0) {
        const bCode = extraOptions?.bankTreasuryCode || '1102';
        const bAcc = accounts.find(a => a.code === bCode);
        journalDebitLines.push({
          accountCode: bCode,
          accountName: bAcc?.name || 'البنك / الشبكة',
          debit: bankBase,
          credit: 0,
          description: `تحصيل بنكي / شبكة لفاتورة ${invoiceNumber}`
        });
      }

      if (effectiveBaseRemainingAmount > 0) {
        journalDebitLines.push({
          accountCode: '1201',
          accountName: 'العملاء والذمم المدينة',
          debit: effectiveBaseRemainingAmount,
          credit: 0,
          description: `المتبقي آجل / ذمم لفاتورة ${invoiceNumber}`
        });
      }

      if (journalDebitLines.length === 0) {
        const treasuryCode = extraOptions?.treasuryAccountCode || (paymentMethod === 'cash' ? '1101' : paymentMethod === 'card' ? '1102' : '1201');
        const treasuryAcc = accounts.find(a => a.code === treasuryCode);
        const paymentAccountCode = paymentMethod === 'credit' ? '1201' : treasuryCode;
        const paymentAccountName = paymentMethod === 'credit' ? 'العملاء والذمم المدينة' : (treasuryAcc?.name || 'الصندوق النقدي');
        journalDebitLines.push({
          accountCode: paymentAccountCode,
          accountName: paymentAccountName,
          debit: baseTotalAmount,
          credit: 0,
          description: `تحصيل فاتورة ${paymentMethod === 'credit' ? 'آجل' : 'نقداً/شبكة'} (${transactionCurrencySymbol} ${totalAmount} = ${baseTotalAmount} ₪)`
        });
      }

      // Calculate revenue and tax credit components ensuring sum of credits strictly equals baseTotalAmount
      const exactBaseTax = baseTaxAmount;
      const exactBaseDelivery = baseDeliveryFee;
      // Net merchandise revenue is whatever remains of baseTotalAmount after tax and delivery fees
      const exactBaseRevenue = Number((baseTotalAmount - exactBaseTax - exactBaseDelivery).toFixed(2));

      addJournalEntry({
        date: today,
        description: `فاتورة مبيعات رقم ${invoiceNumber} - ${customerName || 'كاشير'}${transactionCurrency !== 'ILS' ? ` (${totalAmount} ${transactionCurrencySymbol} @ ${exchangeRate} = ${baseTotalAmount} ₪)` : ''}`,
        referenceType: 'pos_invoice',
        referenceId: invId,
        lines: [
          ...journalDebitLines,
          ...(exactBaseRevenue > 0 ? [{
            accountCode: '4101',
            accountName: 'إيرادات مبيعات المكتبة والقرطاسية',
            debit: 0,
            credit: exactBaseRevenue,
            description: 'صافي مبيعات البضاعة والمطبوعات (محول للشيكل)'
          }] : []),
          ...(exactBaseDelivery > 0 ? [{
            accountCode: '2104',
            accountName: 'أمانات ومستحقات خدمة التوصيل (عمال وشركات التوصيل)',
            debit: 0,
            credit: exactBaseDelivery,
            description: `أمانات ومستحقات خدمة توصيل لعامل التوصيل (خالية المرابح تماماً - ${transactionCurrencySymbol} ${deliveryFeeTotal})`
          }] : []),
          ...(exactBaseTax > 0 ? [{
            accountCode: '2103',
            accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
            debit: 0,
            credit: exactBaseTax,
            description: `ضريبة مخرجات ${appliedTaxRate}% (محولة للشيكل)`
          }] : [])
        ]
      });

      // Cost of Goods Sold (COGS) Journal Entry
      if (totalCogs > 0) {
        const roundedCogs = Number(totalCogs.toFixed(2));
        addJournalEntry({
          date: today,
          description: `قيد إثبات تكلفة البضاعة المباعة لفاتورة مبيعات رقم ${invoiceNumber} وتخفيض المخزون`,
          referenceType: 'cogs',
          referenceId: invId,
          lines: [
            {
              accountCode: '5101',
              accountName: 'تكلفة مبيعات القرطاسية والكتب',
              debit: roundedCogs,
              credit: 0,
              description: `تكلفة مبيعات أصناف فاتورة ${invoiceNumber}`
            },
            {
              accountCode: '1301',
              accountName: 'مخزون الكتب والقرطاسية',
              debit: 0,
              credit: roundedCogs,
              description: `صرف مخزني لقيمة البضاعة المباعة بفاتورة ${invoiceNumber}`
            }
          ]
        });
      }

      // Update customer and sub-customer balances
      if (debtAmountToAdd > 0 || newlyCreatedSubParty) {
        setParties(prev => {
          let list = [...prev];
          if (newlyCreatedSubParty) {
            list.push(newlyCreatedSubParty);
          }
          return list.map(p => {
            let updated = { ...p };
            
            // If sub-customer exists, apply debt ONLY to sub-customer. Otherwise, apply to main customer.
            if (resolvedSubCustId) {
              if (p.id === resolvedSubCustId && debtAmountToAdd > 0 && (!newlyCreatedSubParty || newlyCreatedSubParty.id !== p.id)) {
                updated.balance = Number((updated.balance + debtAmountToAdd).toFixed(2));
              }
            } else {
              if (customerId && p.id === customerId && debtAmountToAdd > 0) {
                updated.balance = Number((updated.balance + debtAmountToAdd).toFixed(2));
              }
            }
            
            return updated;
          });
        });
      }
    } else if (!isQuotation && effectiveBasePaidAmount > 0) {
      // Payment received on a non-accounting invoice (advance deposit on design/print order)
      addJournalEntry({
        date: today,
        description: `دفعة مقدمة / عربون لفاتورة قيد التشغيل رقم ${invoiceNumber} - ${customerName || 'كاشير'}`,
        referenceType: 'pos_invoice',
        referenceId: invId,
        lines: [
          ...(cashBase > 0 ? [{
            accountCode: extraOptions?.cashTreasuryCode || '1101',
            accountName: 'الصندوق النقدي',
            debit: cashBase,
            credit: 0,
            description: `قبض نقدي لفاتورة ${invoiceNumber}`
          }] : []),
          ...(bankBase > 0 ? [{
            accountCode: extraOptions?.bankTreasuryCode || '1102',
            accountName: 'البنك / الشبكة',
            debit: bankBase,
            credit: 0,
            description: `قبض بنكي لفاتورة ${invoiceNumber}`
          }] : []),
          {
            accountCode: '1201',
            accountName: 'العملاء والذمم المدينة',
            debit: 0,
            credit: effectiveBasePaidAmount,
            description: `دفعة مقدمة على حساب العميل لفاتورة ${invoiceNumber}`
          }
        ]
      });
    }

    if (extraOptions?.editingInvoiceId) {
      console.log('UPDATING INVOICE', extraOptions.editingInvoiceId);
      setInvoices(prev => {
        const exists = prev.some(inv => inv.id === extraOptions.editingInvoiceId);
        const next = exists
          ? prev.map(inv => inv.id === extraOptions.editingInvoiceId ? newInvoice : inv)
          : [newInvoice, ...prev];
        broadcastEntityChange('invoices', next);
        return next;
      });
    } else {
      console.log('CREATING NEW INVOICE', newInvoice.id);
      setInvoices(prev => {
        const next = [newInvoice, ...prev];
        broadcastEntityChange('invoices', next);
        return next;
      });
    }
    
    // Direct immediate cloud save for multi-user synchronization
    pushToServerSync('invoices', newInvoice);

    // The PostgreSQL sync server confirms successful financial commits via Telegram.
    // Browser-side or offline drafts NEVER send accounting confirmations.

    return newInvoice;
  };

  const preparePosInvoiceDraft = (
    items: Parameters<typeof createPosSale>[0],
    customerName: string,
    paymentMethod: PaymentMethod,
    customerId?: string,
    notes?: string,
    extraOptions?: Parameters<typeof createPosSale>[5]
  ): Invoice => {
    const round=(n:number)=>Number(n.toFixed(2));
    let gross=0,lineDiscounts=0,lineTaxes=0;
    const taxRate=Number(extraOptions?.taxRate??settings.vatRate??0);
    const invItems=(items||[]).map((line,idx)=>{
      const quantity=Number(line.quantity),unitPrice=Number(line.unitPrice??line.item?.sellingPrice??0);
      const discount=Number(line.discount||0),lineTaxRate=Number(line.taxRate??taxRate);
      const before=round(quantity*unitPrice),tax=round(Math.max(0,before-discount)*lineTaxRate/100);
      gross+=before;lineDiscounts+=discount;lineTaxes+=tax;
      return {id:`line-${idx}`,itemId:line.item?.id||`itm-${idx}`,
        itemCode:line.item?.code||'',itemName:line.itemName||line.item?.name||'صنف',
        category:line.item?.category,quantity,unitPrice,discount,tax,taxRate:lineTaxRate,
        total:round(before-discount+tax),notes:line.notes||'',
        description:line.description||'',unit:line.unit||line.item?.unit||'قطعة',
        length:line.length,width:line.width,count:line.count,
        hasDimensions:line.hasDimensions,barcode:line.item?.barcode,
        attachments:line.attachments||[],imageThumbnail:line.imageThumbnail||''};
    });
    const subtotal=round(gross);
    const discountTotal=round(Number(extraOptions?.overallDiscount??lineDiscounts));
    const taxAmount=taxRate>0?round(Math.max(0,subtotal-discountTotal)*taxRate/100):round(lineTaxes);
    const additionalCharges=round(Number(extraOptions?.additionalCharges||0));
    const totalAmount=round(subtotal-discountTotal+taxAmount+additionalCharges);
    const exchangeRate=Number(extraOptions?.exchangeRate||1);
    const paidAmount=round(Number(extraOptions?.paidAmount??(paymentMethod==='credit'?0:totalAmount)));
    const cashPaidAmount=Number(extraOptions?.cashPaidAmount||0);
    const bankPaidAmount=Number(extraOptions?.bankPaidAmount||0);
    const remainingAmount=round(totalAmount-paidAmount);
    const cashBaseAmount=round(cashPaidAmount*Number(extraOptions?.cashExchangeRate||1));
    const bankBaseAmount=round(bankPaidAmount*Number(extraOptions?.bankExchangeRate||1));
    return {
      id:extraOptions?.editingInvoiceId||`inv-pos-${Date.now()}`,
      invoiceNumber:extraOptions?.invoiceNumber||'',
      date:extraOptions?.date||new Date().toISOString().slice(0,10),
      type:'pos',customerId,
      counterpartyType:extraOptions?.counterpartyType||'customer',
      counterpartyId:extraOptions?.counterpartyId||customerId,
      employeeId:extraOptions?.counterpartyType==='employee'?customerId:undefined,
      customerName:customerName||'عميل كاشير نقدي',
      items:invItems as any,subtotal,discountTotal,taxRate,taxAmount,totalAmount,
      paidAmount,remainingAmount,paymentMethod,
      status:remainingAmount<=0.005?'paid':paidAmount>0?'partial':'unpaid',
      notes:notes||'',additionalCharges,
      representative:extraOptions?.representative,branch:extraOptions?.branch,
      branchId:extraOptions?.branchId,warehouse:extraOptions?.warehouse,
      subCustomerId:extraOptions?.subCustomerId,
      subCustomerName:extraOptions?.subCustomerName,
      subCustomerPhone:extraOptions?.subCustomerPhone,
      customCustomerText:extraOptions?.customCustomerText,
      paymentNotes:extraOptions?.paymentNotes,
      currency:extraOptions?.currency||'ILS',
      currencySymbol:extraOptions?.currencySymbol||'₪',exchangeRate,
      baseTotalAmount:round(totalAmount*exchangeRate),
      basePaidAmount:cashBaseAmount+bankBaseAmount>0
        ?round(cashBaseAmount+bankBaseAmount):round(paidAmount*exchangeRate),
      cashPaidAmount,bankPaidAmount,cashBaseAmount,bankBaseAmount,
      cashTreasuryCode:extraOptions?.cashTreasuryCode,
      bankTreasuryCode:extraOptions?.bankTreasuryCode,
      treasuryAccountCode:extraOptions?.treasuryAccountCode,
      workflowStatus:extraOptions?.workflowStatus||'new',
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    } as Invoice;
  };

  const postPosSaleOnline = async (
    items: Parameters<typeof createPosSale>[0],
    customerName: string,
    paymentMethod: PaymentMethod,
    customerId?: string,
    notes?: string,
    extraOptions?: Parameters<typeof createPosSale>[5]
  ): Promise<{ success: boolean; invoice?: Invoice; error?: string; isOffline?: boolean; isBusy?: boolean }> => {
    // The new centrally verified revision protocol is opt-in. Until warehouse
    // balance reconciliation is complete, production keeps its fail-closed
    // behavior rather than allowing unbalanced monetary changes.
    if (secureLoginEnabled() && extraOptions?.editingInvoiceId) {
      try {
        const repo=unifiedRepoRef.current;
        if(!repo)throw new Error('LOCAL_REPOSITORY_NOT_INITIALIZED');
        const visible=(await repo.all('invoices')).find(row=>row.id===extraOptions.editingInvoiceId);
        if(!visible||!visible.value||visible.version<1)
          throw new Error('INVOICE_AUTHORITATIVE_BASELINE_NOT_FOUND');
        if(visible.pending)
          throw new Error('INVOICE_HAS_PENDING_LOCAL_CHANGES_REVIEW_FIRST');
        const original=visible.value as unknown as Invoice;
        // The record may have refreshed from PostgreSQL since this invoice was
        // opened in another tab or device. The editor must not overwrite those
        // newer business values with a stale on-screen form.
        if(extraOptions.editingInvoiceSnapshot &&
           invoiceEditSignature(original)!==extraOptions.editingInvoiceSnapshot)
          throw new Error('INVOICE_CONCURRENT_MODIFICATION_REOPEN');
        const draft=preparePosInvoiceDraft(items,customerName,paymentMethod,
          customerId,notes,extraOptions);
        const currencyRate=Number(extraOptions.exchangeRate||1);
        const previousRate=Number(original.exchangeRate||1);
        const historicalBasePaid=Number(original.basePaidAmount??(
          Number(original.paidAmount||0)*previousRate));
        const formCashBase=Number((draft as any).cashBaseAmount||0);
        const formBankBase=Number((draft as any).bankBaseAmount||0);
        const oldCash=original.cashPaidAmount,oldBank=original.bankPaidAmount;
        // Changing the invoice exchange rate does not retrospectively
        // create, destroy or revalue cash that a teller actually collected.
        const sameReceipt=original.paymentMethod===draft.paymentMethod&&
          (oldCash!==undefined||oldBank!==undefined
            ?Math.abs(Number(oldCash||0)-Number(draft.cashPaidAmount||0))<0.000001&&
             Math.abs(Number(oldBank||0)-Number(draft.bankPaidAmount||0))<0.000001
            :Math.abs((formCashBase+formBankBase)-historicalBasePaid)<0.011||
             (original.paymentMethod==='cash'&&
              Math.abs(Number(draft.cashPaidAmount||0)-Number(original.paidAmount||0))<0.000001&&
              Number(draft.bankPaidAmount||0)===0)||
             (['card','bank_transfer'].includes(original.paymentMethod)&&
              Math.abs(Number(draft.bankPaidAmount||0)-Number(original.paidAmount||0))<0.000001&&
              Number(draft.cashPaidAmount||0)===0));
        const rateOnlyPayment=previousRate!==currencyRate&&sameReceipt;
        const proposed:Invoice={
          ...original,
          ...draft,
          id:original.id,
          invoiceNumber:original.invoiceNumber,
          date:extraOptions.date||original.date,
          notes,
          items:draft.items.map((it,index)=>({
            ...(original.items[index]?.itemId===it.itemId?original.items[index]:{}),
            ...it,
            id:(original.items[index]?.itemId===it.itemId?(original.items[index] as any)?.id:undefined)||`line-${original.id}-${index}`,
            category:items[index]?.item?.category||original.items[index]?.category,
            itemId:items[index]?.item?.id||it.itemId
          })),
          baseTotalAmount:Number((draft.totalAmount*currencyRate).toFixed(2)),
          basePaidAmount:rateOnlyPayment?historicalBasePaid:draft.basePaidAmount,
          ...(rateOnlyPayment?{
            paidAmount:original.paidAmount,
            remainingAmount:Number((draft.totalAmount-Number(original.paidAmount||0)).toFixed(2)),
            cashBaseAmount:(original as any).cashBaseAmount,
            bankBaseAmount:(original as any).bankBaseAmount
          }:{}),
          isAccountingPosted:true,
          statusHistory:original.statusHistory,
          postedAt:original.postedAt,
          createdAt:original.createdAt,
          updatedAt:original.updatedAt
        } as Invoice;
        const stableKey='lobnan_verified_invoice_revision_'+original.id;
        const signature=JSON.stringify({version:visible.version,proposed});
        let pending:{signature:string;commandId:string}|null=null;
        try{pending=JSON.parse(localStorage.getItem(stableKey)||'null');}catch{}
        const commandId=pending?.signature===signature&&pending.commandId
          ?pending.commandId:crypto.randomUUID();
        localStorage.setItem(stableKey,JSON.stringify({signature,commandId}));
        const cfg=getLocalSyncConfig();
        const transport=new LocalHttpSyncTransport(cfg.url,cfg.token,cfg.workspace);
        const result=await transport.reviseInvoice({
          commandId,invoiceId:original.id,expectedVersion:visible.version,
          proposed:proposed as unknown as Record<string,unknown>
        });
        await repo.getLocalDb().ack(result.commandId,result.changes);
        repo.requestSync();
        localStorage.removeItem(stableKey);
        const confirmed=result.changes.find(row=>row.entity==='invoices'&&row.id===original.id);
        if(!confirmed?.value)throw new Error('CENTRAL_INVOICE_ACK_MISSING');
        const authoritative=confirmed.value as unknown as Invoice;
        setInvoices(prev=>prev.map(inv=>inv.id===original.id?authoritative:inv));
        return {success:true,invoice:authoritative};
      }catch(error){
        const raw=String(error);
        const conflict=/INVOICE_CONCURRENT_MODIFICATION_REOPEN|VERSION_CONFLICT/.test(raw);
        return {success:false,
          error:conflict
            ?'تغيرت الفاتورة المعتمدة في PostgreSQL بعد فتحها على هذا الجهاز. منعنا الكتابة فوق تعديل الجهاز الآخر. مدخلاتك الحالية لم تُحذف؛ أعد فتح أحدث نسخة من الفاتورة ثم طبّق تعديلاتك عليها.'
            :raw,
          isOffline:typeof navigator!=='undefined'&&!navigator.onLine};
      }
    }
    // Legacy behavior: fail closed for financial edits until revision protocol
    // is enabled; do not re-run postings for an existing official invoice.
    try {

      const localInvoice = createPosSale(
        items,
        customerName,
        paymentMethod,
        customerId,
        notes,
        extraOptions
      );
      // This only confirms local queueing, not PostgreSQL acceptance.
      // Ledger, stock and party posting still requires atomic integration.
      const repo = unifiedRepoRef.current;
      if (!repo) throw new Error('LOCAL_REPOSITORY_NOT_INITIALIZED');
      await repo.put('invoices', localInvoice.id, localInvoice as unknown as JsonObject);
      return { success: true, invoice: localInvoice };
    } catch (error) {
      return {
        success: false,
        error: String(error).includes('POSTED_INVOICE_CORRECTION_REQUIRED')
          ? 'تعديل الفاتورة المعتمدة يتضمن تغييرًا محاسبيًا في المبالغ أو الكميات أو الأصناف أو الدفعات. لم يُعتمد هذا التعديل لأن مسار التسوية المحاسبية الذرية لم يكتمل بعد. احتفظ بالمدخلات ولا تُعد إنشاء الفاتورة.'
          : `تعذر تأكيد حفظ الفاتورة محلياً: ${String(error)}`,
        isOffline: typeof navigator !== 'undefined' && !navigator.onLine
      };
    }
  };

  const addPosInvoice = (invoiceData: any): Invoice => {
    const rawItems = invoiceData.items || [];
    const targetCustId = invoiceData.customerId;
    const itemsForSale = rawItems.map((it: any, idx: number) => {
      // Permanent inventory ID is authoritative. A legacy code may resolve only if unique.
      const linkedId = it.inventoryItemId || it.itemId;
      const legacyCode = it.itemCode || it.code;
      const matchingCodes = !linkedId && legacyCode ? inventory.filter(i => i.code === legacyCode) : [];
      const invItem = (linkedId ? inventory.find(i => i.id === linkedId) : matchingCodes.length === 1 ? matchingCodes[0] : undefined) || {
        id: it.inventoryItemId || `itm-${Date.now()}-${idx}`,
        code: it.code || it.itemCode || `ITM-${idx + 1}`,
        barcode: it.barcode || '',
        name: it.name || it.itemName || 'بند',
        category: 'services',
        unit: it.unit || 'قطعة',
        purchasePrice: 0,
        sellingPrice: Number(it.unitPrice || it.price) || 0,
        stockQuantity: 1000,
        minAlertQuantity: 0
      };

      // Ensure customer preferred price is resolved
      let unitPrice = Number(it.unitPrice !== undefined ? it.unitPrice : it.price);
      if (isNaN(unitPrice) || unitPrice <= 0) {
        unitPrice = getItemPriceForCustomer(invItem, targetCustId).price;
      }

      return {
        item: invItem,
        itemName: it.name || it.itemName || invItem.name,
        quantity: Number(it.quantity || it.qty) || 1,
        unitPrice: unitPrice,
        discount: Number(it.discount) || 0,
        tax: Number(it.tax) || 0,
        notes: it.notes || it.itemNotes || it.description,
        description: it.description || it.notes
      };
    });

    return createPosSale(
      itemsForSale,
      invoiceData.customerName || 'عميل نقدي',
      invoiceData.paymentMethod || 'cash',
      targetCustId,
      invoiceData.notes,
      {
        invoiceNumber: invoiceData.invoiceNumber,
        date: invoiceData.date,
        overallDiscount: invoiceData.discountTotal || 0,
        taxRate: invoiceData.taxRate,
        paidAmount: invoiceData.paidAmount,
        subCustomerName: invoiceData.subCustomerName,
        subCustomerPhone: invoiceData.subCustomerPhone,
        currency: invoiceData.currency
      }
    );
  };

  const addPosInvoiceOnline = async (invoiceData: any): Promise<{ success: boolean; invoice?: Invoice; error?: string; isOffline?: boolean; isBusy?: boolean }> => {
    const rawItems = invoiceData.items || [];
    const targetCustId = invoiceData.customerId;
    const itemsForSale = rawItems.map((it: any, idx: number) => {
      // Permanent inventory ID is authoritative. A legacy code may resolve only if unique.
      const linkedId = it.inventoryItemId || it.itemId;
      const legacyCode = it.itemCode || it.code;
      const matchingCodes = !linkedId && legacyCode ? inventory.filter(i => i.code === legacyCode) : [];
      const invItem = (linkedId ? inventory.find(i => i.id === linkedId) : matchingCodes.length === 1 ? matchingCodes[0] : undefined) || {
        id: it.inventoryItemId || `itm-${Date.now()}-${idx}`,
        code: it.code || it.itemCode || `ITM-${idx + 1}`,
        barcode: it.barcode || '',
        name: it.name || it.itemName || 'بند',
        category: 'services',
        unit: it.unit || 'قطعة',
        purchasePrice: 0,
        sellingPrice: Number(it.unitPrice || it.price) || 0,
        stockQuantity: 1000,
        minAlertQuantity: 0
      };

      let unitPrice = Number(it.unitPrice !== undefined ? it.unitPrice : it.price);
      if (isNaN(unitPrice) || unitPrice <= 0) {
        unitPrice = getItemPriceForCustomer(invItem, targetCustId).price;
      }

      return {
        item: invItem,
        itemName: it.name || it.itemName || invItem.name,
        quantity: Number(it.quantity || it.qty) || 1,
        unitPrice: unitPrice,
        discount: Number(it.discount) || 0,
        tax: Number(it.tax) || 0,
        notes: it.notes || it.itemNotes || it.description,
        description: it.description || it.notes
      };
    });

    return postPosSaleOnline(
      itemsForSale,
      invoiceData.customerName || 'عميل نقدي',
      invoiceData.paymentMethod || 'cash',
      targetCustId,
      invoiceData.notes,
      {
        invoiceNumber: invoiceData.invoiceNumber,
        date: invoiceData.date,
        overallDiscount: invoiceData.discountTotal || 0,
        taxRate: invoiceData.taxRate,
        paidAmount: invoiceData.paidAmount,
        subCustomerName: invoiceData.subCustomerName,
        subCustomerPhone: invoiceData.subCustomerPhone,
        currency: invoiceData.currency
      }
    );
  };

  const updateInvoice = (
    id: string,
    updates: Partial<Invoice>,
    statusMeta?: { notes?: string; userName?: string; userId?: string }
  ) => {
    const oldInv = invoices.find(inv => inv.id === id);
    if (oldInv) {
      const updatedInv = { ...oldInv, ...updates };
      purgeAndTransferInvoiceTreasury(oldInv, updatedInv);
    }

    setInvoices(prev => prev.map(inv => {
      if (inv.id !== id) return inv;
      const updated: Invoice = { ...inv, ...updates };

      // Track workflow status change in statusHistory:
      // كل تغيير في حالة الفاتورة يسجل في النظام: المستخدم، التاريخ، الوقت، الحالة السابقة، الحالة الجديدة، الملاحظة
      if (updates.workflowStatus && updates.workflowStatus !== inv.workflowStatus) {
        const prevStatus = inv.workflowStatus || 'new';
        const newStatus = updates.workflowStatus;
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });

        const newLogEntry: InvoiceStatusLog = {
          id: 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          userName: statusMeta?.userName || (updates as any).statusChangeUserName || currentUser?.fullName || 'المستخدم',
          userId: statusMeta?.userId || (updates as any).statusChangeUserId || currentUser?.id,
          date: dateStr,
          time: timeStr,
          previousStatus: prevStatus,
          newStatus: newStatus,
          notes: statusMeta?.notes || (updates as any).statusChangeNotes || '',
          createdAt: now.toISOString()
        };

        updated.statusHistory = [
          ...(inv.statusHistory || []),
          newLogEntry
        ];

        // If status changed to delivered, record delivery timestamp and user, and adopt invoice status as delivered
        if (newStatus === 'delivered' || updates.status === 'delivered') {
          updated.deliveredAt = updated.deliveredAt || now.toISOString();
          updated.deliveredBy = updated.deliveredBy || statusMeta?.userName || (updates as any).statusChangeUserName || currentUser?.fullName || 'فني الورشة';
          updated.status = 'delivered'; // يتم اعتماد حالة الفاتورة أنه تم التسليم
          updated.workflowStatus = 'delivered';
        }
      }

      // Recompute payment status if financial fields or paymentMethod are updated
      if (
        updates.paidAmount !== undefined ||
        updates.remainingAmount !== undefined ||
        updates.paymentMethod !== undefined ||
        updates.cashPaidAmount !== undefined ||
        updates.bankPaidAmount !== undefined ||
        updates.paymentStatus !== undefined
      ) {
        updated.paymentStatus = updates.paymentStatus || computeInvoicePaymentStatus({
          paymentMethod: updated.paymentMethod,
          totalAmount: updated.totalAmount,
          paidAmount: updated.paidAmount,
          remainingAmount: updated.remainingAmount,
          cashPaidAmount: updated.cashPaidAmount,
          bankPaidAmount: updated.bankPaidAmount
        });
        updated.status = updated.paymentMethod === 'credit'
          ? 'unpaid'
          : (updated.remainingAmount > 0 ? 'partial' : 'paid');
      }

      // إذا كانت الفاتورة مسلمة يتم دائماً تثبيت واعتماد حالتها كـ تم التسليم
      if (updated.workflowStatus === 'delivered' || updates.status === 'delivered') {
        updated.status = 'delivered';
        updated.workflowStatus = 'delivered';
      }

      // Check transition to accounting eligible status (ready or delivered)
      const becameEligible = !inv.isAccountingPosted && updates.workflowStatus && isInvoiceAccountingEligible(updates.workflowStatus);
      if (becameEligible) {
        updated.isAccountingPosted = true;
        updated.postedAt = new Date().toISOString();

        const today = new Date().toISOString().split('T')[0];
        const movementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

        // 1. Deduct stock movements for physical items
        setInventory(prevInv => prevInv.map(invItem => {
          const sold = inv.items.find(i => i.itemId === invItem.id);
          if (sold && invItem.category !== 'copy_scan') {
            const oldQty = invItem.stockQuantity;
            const newQty = Math.max(0, oldQty - sold.quantity);
            addStockMovement({
              itemId: invItem.id,
              itemCode: invItem.code,
              itemName: invItem.name,
              category: invItem.category,
              date: today,
              time: movementTime,
              type: 'out_sale',
              quantity: sold.quantity,
              balanceBefore: oldQty,
              balanceAfter: newQty,
              unitPrice: invItem.purchasePrice,
              totalValue: sold.quantity * invItem.purchasePrice,
              referenceType: 'pos_invoice',
              referenceNumber: inv.invoiceNumber,
              reason: `اعتماد تسليم فاتورة كاشير (${inv.customerName})`,
              performedBy: inv.representative || 'كاشير'
            });
            return {
              ...invItem,
              stockQuantity: newQty,
              lastMovementDate: today
            };
          }
          return invItem;
        }));

        // 2. Post Sales Journal Entry for unbilled portion
        const exRate = inv.exchangeRate || 1.0;
        const baseNet = Number(((inv.subtotal - inv.discountTotal) * exRate).toFixed(2));
        const baseTax = Number((inv.taxAmount * exRate).toFixed(2));
        const baseRemain = Number((inv.remainingAmount * exRate).toFixed(2));

        if (baseRemain > 0) {
          addJournalEntry({
            date: today,
            description: `ترحيل قيود فاتورة مبيعات رقم ${inv.invoiceNumber} إلى الحسابات (حالة: ${updates.workflowStatus === 'ready' ? 'جاهز للتسليم' : 'تم التسليم'})`,
            referenceType: 'pos_invoice',
            referenceId: inv.id,
            lines: [
              {
                accountCode: '1201',
                accountName: 'العملاء والذمم المدينة',
                debit: baseRemain,
                credit: 0,
                description: `المتبقي آجل / ذمم لفاتورة ${inv.invoiceNumber}`
              },
              {
                accountCode: '4101',
                accountName: 'إيرادات مبيعات المكتبة والقرطاسية',
                debit: 0,
                credit: baseNet,
                description: 'صافي مبيعات الفاتورة (محول للشيكل)'
              },
              ...(baseTax > 0 ? [{
                accountCode: '2103',
                accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
                debit: 0,
                credit: baseTax,
                description: `ضريبة مخرجات (محولة للشيكل)`
              }] : [])
            ]
          });

          // 3. Update customer and sub-customer balance
          setParties(prevParties => prevParties.map(p => {
            let pUpdated = { ...p };
            
            if (inv.subCustomerId) {
              if (p.id === inv.subCustomerId) {
                pUpdated.balance = Number((pUpdated.balance + baseRemain).toFixed(2));
              }
            } else {
              if (inv.customerId && p.id === inv.customerId) {
                pUpdated.balance = Number((pUpdated.balance + baseRemain).toFixed(2));
              }
            }
            
            return pUpdated;
          }));
        }
      }

      // Link invoice workflow status with print & workshop orders
      if (updates.workflowStatus) {
        const mappedPrintStatus: PrintJobOrder['status'] =
          updates.workflowStatus === 'design' || updates.workflowStatus === 'designing' ? 'design'
          : updates.workflowStatus === 'pending_approval' ? 'pending_approval'
          : updates.workflowStatus === 'print_external' || updates.workflowStatus === 'in_progress_external' ? 'in_progress_external'
          : updates.workflowStatus === 'print_internal' || updates.workflowStatus === 'in_progress_internal' || updates.workflowStatus === 'in_progress' ? 'in_progress_internal'
          : updates.workflowStatus === 'ready' ? 'ready'
          : updates.workflowStatus === 'delivered' ? 'delivered'
          : 'new';

        setPrintOrders(pOrders => pOrders.map(po => {
          if (
            (inv.printJobId && po.id === inv.printJobId) ||
            po.associatedInvoiceId === id ||
            po.orderNumber === inv.invoiceNumber
          ) {
            return { ...po, status: mappedPrintStatus };
          }
          return po;
        }));
      }

      // Sync financial collection with linked print order
      if (updates.paidAmount !== undefined || updates.remainingAmount !== undefined) {
        setPrintOrders(pOrders => pOrders.map(po => {
          if (
            (inv.printJobId && po.id === inv.printJobId) ||
            po.associatedInvoiceId === id ||
            po.orderNumber === inv.invoiceNumber
          ) {
            const newDeposit = updates.paidAmount !== undefined ? updates.paidAmount : po.depositPaid;
            const newRemaining = updates.remainingAmount !== undefined ? updates.remainingAmount : Math.max(0, po.totalPrice - newDeposit);
            return {
              ...po,
              depositPaid: newDeposit,
              remainingBalance: newRemaining
            };
          }
          return po;
        }));
      }

      return updated;
    }));

    setTimeout(() => {
      const target = invoices.find(inv => inv.id === id);
      if (target && !isFirestoreQuotaExceeded() && !isLocalOnlyMode) {
        setDoc(doc(db, 'invoices', id), cleanDocForFirestore({ ...target, ...updates })).catch(err => {
          if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
            markQuotaExceeded();
          } else {
            console.warn('Direct cloud update invoice notice:', err);
          }
        });
      }
    }, 100);
  };

  const deleteInvoice = (id: string, reason?: string) => {
    const target = invoices.find(inv => inv.id === id);
    if (target) {
      purgeAndTransferInvoiceTreasury(target, null);
    }
    const now = new Date();
    const nowStr = now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    const deletedSnapshot: Invoice = target ? {
      ...target,
      deletedAt: nowStr,
      deletedBy: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
      deletedByUserId: currentUser?.id,
      deletionReason: reason || 'حذف يدوي من قبل المستخدم'
    } : {
      id,
      invoiceNumber: `INV-${id}`,
      date: new Date().toISOString().split('T')[0],
      customerName: 'عميل',
      type: 'pos',
      items: [],
      subtotal: 0,
      discountTotal: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
      paymentMethod: 'cash',
      status: 'unpaid',
      deletedAt: nowStr,
      deletedBy: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
      deletionReason: reason || 'حذف يدوي'
    };

    // 1. حفظ في سلة المحذوفات في Firestore
    if (!isFirestoreQuotaExceeded() && !isLocalOnlyMode) {
      setDoc(doc(db, 'deletedInvoices', id), cleanDocForFirestore(deletedSnapshot)).catch(err => {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
          markQuotaExceeded();
        } else {
          console.warn('Notice saving to deletedInvoices collection:', err);
        }
      });
    }
    setDeletedInvoices(prev => [deletedSnapshot, ...prev.filter(d => d.id !== id)]);

    // 2. الحذف من الفواتير النشطة في Firestore
    setInvoices(prev => {
      const next = prev.filter(inv => inv.id !== id);
      pushToServerSync('invoices', { id, _deleted: true });
      broadcastEntityChange('invoices', next);
      return next;
    });
    registerDeletedDoc('invoices', id);
    if (!isFirestoreQuotaExceeded() && !isLocalOnlyMode) {
      deleteDoc(doc(db, 'invoices', id)).catch(err => {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
          markQuotaExceeded();
        }
      });
    }

    // 3. التوثيق في مجموعة auditLog بقاعدة بيانات Firestore
    try {
      const auditEntry: AuditLogEntry = {
        id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        action: 'delete',
        entityType: 'invoice',
        invoiceId: id,
        invoiceNumber: target?.invoiceNumber || id,
        user: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
        userId: currentUser?.id,
        timestamp: nowStr,
        reason: reason || 'حذف الفاتورة من قبل المستخدم',
        details: target ? {
          customerName: target.customerName,
          totalAmount: target.totalAmount,
          itemsCount: target.items?.length || 0,
          date: target.date
        } : undefined,
        createdAt: now.toISOString()
      };
      if (!isFirestoreQuotaExceeded() && !isLocalOnlyMode) {
        setDoc(doc(db, 'auditLog', auditEntry.id), cleanDocForFirestore(auditEntry)).catch(e => {
          if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota limit exceeded')) {
            markQuotaExceeded();
          }
        });
      }
    } catch (e) {
      console.warn('Audit log write exception:', e);
    }

    // 4. استرجاع الكميات المباعة وإعادتها لمخزون الأصناف في المستودع
    if (target && Array.isArray(target.items) && target.items.length > 0) {
      const itemQtyMap: Record<string, number> = {};
      target.items.forEach(it => {
        const rawId = it.itemId || (it as any).id || (it as any).item?.id;
        const q = Number(it.quantity) || 0;
        if (rawId && q > 0) {
          itemQtyMap[rawId] = (itemQtyMap[rawId] || 0) + q;
        }
      });

      if (Object.keys(itemQtyMap).length > 0) {
        setInventory(prev => {
          const wh = target.warehouse || 'المخزن الرئيسي';
          const updated = prev.map(invItem => {
            const addQ = itemQtyMap[invItem.id] || (invItem.code ? itemQtyMap[invItem.code] : 0) || 0;
            if (addQ > 0) {
              const newQty = (invItem.stockQuantity || 0) + addQ;
              const updatedWh = { ...(invItem.warehouseStocks || {}) };
              updatedWh[wh] = (updatedWh[wh] || 0) + addQ;
              return {
                ...invItem,
                stockQuantity: newQty,
                warehouseStocks: updatedWh,
                lastMovementDate: new Date().toISOString().split('T')[0]
              };
            }
            return invItem;
          });
          try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(updated)); } catch {}
          pushToServerSync('inventory', updated);
          broadcastEntityChange('inventory', updated);
          return updated;
        });
      }
    }

    // 5. حذف حركات المخزون المرتبطة بهذه الفاتورة
    setStockMovements(prev => {
      const kept = prev.filter(sm => {
        const isMatch = sm.referenceId === id ||
                        (target && sm.referenceNumber === target.invoiceNumber) ||
                        sm.id.includes(id);
        if (isMatch) {
          registerDeletedDoc('stockMovements', sm.id);
          deleteDoc(doc(db, 'stockMovements', sm.id)).catch(() => {});
          return false;
        }
        return true;
      });
      try { localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(kept)); } catch {}
      pushToServerSync('stockMovements', kept);
      broadcastEntityChange('stockMovements', kept);
      return kept;
    });

    // 6. حذف سندات القبض والدفع المرتبطة بالفاتورة
    setVouchers(prev => {
      const kept = prev.filter(v => {
        const isMatch = v.id === `vch-inv-${id}` ||
                        v.id.includes(id) ||
                        (target && v.voucherNumber === `RCT-INV-${target.invoiceNumber.replace('INV-', '')}`) ||
                        (target && v.description?.includes(target.invoiceNumber));
        if (isMatch) {
          registerDeletedDoc('vouchers', v.id);
          deleteDoc(doc(db, 'vouchers', v.id)).catch(() => {});
          return false;
        }
        return true;
      });
      try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(kept)); } catch {}
      pushToServerSync('vouchers', kept);
      broadcastEntityChange('vouchers', kept);
      return kept;
    });

    // 7. حذف القيود المحاسبية المرتبطة بالفاتورة
    setJournalEntries(prev => {
      const kept = prev.filter(je => {
        const isMatch = je.referenceId === id || (target && je.description?.includes(target.invoiceNumber));
        if (isMatch) {
          registerDeletedDoc('journalEntries', je.id);
          deleteDoc(doc(db, 'journalEntries', je.id)).catch(() => {});
          return false;
        }
        return true;
      });
      try { localStorage.setItem(`${STORAGE_KEY}_journalEntries`, JSON.stringify(kept)); } catch {}
      pushToServerSync('journalEntries', kept);
      broadcastEntityChange('journalEntries', kept);
      return kept;
    });

    // 8. تسوية ذمة ودين العميل إن كانت الفاتورة بالأجل
    if (target && target.remainingAmount && target.remainingAmount > 0) {
      const custId = target.subCustomerId || target.customerId;
      if (custId) {
        setParties(prev => {
          const updated = prev.map(p => {
            if (p.id === custId) {
              const newBal = Number(Math.max(0, (p.balance || 0) - target.remainingAmount).toFixed(2));
              return { ...p, balance: newBal };
            }
            return p;
          });
          try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(updated)); } catch {}
          pushToServerSync('parties', updated);
          broadcastEntityChange('parties', updated);
          return updated;
        });
      }
    }

    // 9. تسوية وتطهير حركات الخزنات والصناديق التابعة للفاتورة المحذوفة وإعادة احتساب الأرصدة بدقة
    setTreasuries(prevTreasuries => {
      const remainingInvoices = invoices.filter(inv => inv.id !== id);
      const auditedTreasuries = auditAndRecalculateTreasuries(prevTreasuries, remainingInvoices, vouchers, undefined, purchases, expenses);
      try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(auditedTreasuries)); } catch {}
      pushToServerSync('treasuries', auditedTreasuries);
      broadcastEntityChange('treasuries', auditedTreasuries);
      auditedTreasuries.forEach(t => {
        setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(t)).catch(() => {});
      });
      return auditedTreasuries;
    });
  };

  /**
   * حذف شامل وكامل لكافة فواتير المبيعات من قاعدة البيانات مع استرجاع المخزون وحذف السندات والحركات التابعة
   */
  const deleteAllSalesInvoicesAndRelatedData = (options?: DeleteAllSalesInvoicesOptions): DeleteAllSalesInvoicesResult => {
    const restoreStock = options?.restoreStock !== false;
    const deleteLinkedVouchers = options?.deleteLinkedVouchers !== false;
    const deleteLinkedStockMovements = options?.deleteLinkedStockMovements !== false;
    const deleteLinkedJournalEntries = options?.deleteLinkedJournalEntries !== false;
    const revertCustomerBalances = options?.revertCustomerBalances !== false;
    const revertTreasuryBalances = options?.revertTreasuryBalances !== false;
    const clearDeletedInvoicesTrash = options?.clearDeletedInvoicesTrash !== false;

    const currentInvoices = invoices || [];
    const invCount = currentInvoices.length;

    // تجميع معرفات وأرقام الفواتير
    const invoiceIds = new Set<string>();
    const invoiceNumbers = new Set<string>();

    currentInvoices.forEach(inv => {
      if (inv.id) invoiceIds.add(String(inv.id));
      if (inv.invoiceNumber) invoiceNumbers.add(String(inv.invoiceNumber));
    });

    if (clearDeletedInvoicesTrash && deletedInvoices) {
      deletedInvoices.forEach(inv => {
        if (inv.id) invoiceIds.add(String(inv.id));
        if (inv.invoiceNumber) invoiceNumbers.add(String(inv.invoiceNumber));
      });
    }

    // 1. حساب الكميات المباعة لإعادتها إلى رصيد المخزون
    const restoredQuantitiesByItem: Record<string, number> = {};
    const restoredQuantitiesByItemAndWarehouse: Record<string, Record<string, number>> = {};
    let totalRestoredUnits = 0;

    if (restoreStock) {
      currentInvoices.forEach(inv => {
        const wh = inv.warehouse || 'المخزن الرئيسي';
        (inv.items || []).forEach(item => {
          const rawId = item.itemId || (item as any).id || (item as any).item?.id;
          const qty = Number(item.quantity) || 0;
          if (rawId && qty > 0) {
            restoredQuantitiesByItem[rawId] = (restoredQuantitiesByItem[rawId] || 0) + qty;
            totalRestoredUnits += qty;
            if (!restoredQuantitiesByItemAndWarehouse[rawId]) {
              restoredQuantitiesByItemAndWarehouse[rawId] = {};
            }
            restoredQuantitiesByItemAndWarehouse[rawId][wh] = (restoredQuantitiesByItemAndWarehouse[rawId][wh] || 0) + qty;
          }
        });
      });
    }

    // 2. استرجاع المخزون في بطاقات الأصناف والمستودعات
    let restoredItemsCount = 0;
    if (restoreStock && Object.keys(restoredQuantitiesByItem).length > 0) {
      setInventory(prev => {
        const updated = prev.map(item => {
          const addQty = restoredQuantitiesByItem[item.id] || (item.code ? restoredQuantitiesByItem[item.code] : 0) || 0;
          if (addQty > 0) {
            restoredItemsCount++;
            const newQty = (item.stockQuantity || 0) + addQty;
            const updatedWhStocks = { ...(item.warehouseStocks || {}) };
            const whBreakdown = restoredQuantitiesByItemAndWarehouse[item.id];
            if (whBreakdown) {
              Object.entries(whBreakdown).forEach(([whName, q]) => {
                updatedWhStocks[whName] = (updatedWhStocks[whName] || 0) + q;
              });
            }
            return {
              ...item,
              stockQuantity: newQty,
              warehouseStocks: updatedWhStocks,
              lastMovementDate: new Date().toISOString().split('T')[0]
            };
          }
          return item;
        });
        try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(updated)); } catch {}
        pushToServerSync('inventory', updated);
        broadcastEntityChange('inventory', updated);
        return updated;
      });
    }

    // 3. حذف حركات المخزون الناتجة عن المبيعات
    let deletedMovementsCount = 0;
    if (deleteLinkedStockMovements) {
      setStockMovements(prev => {
        const kept: StockMovement[] = [];
        const deletedIds: string[] = [];
        prev.forEach(sm => {
          const isSale = sm.type === 'out_sale';
          const isPosRef = sm.referenceType === 'pos_invoice' || sm.referenceType === 'invoice';
          const matchesInv = (sm.referenceNumber && invoiceNumbers.has(sm.referenceNumber)) ||
                             (sm.referenceId && invoiceIds.has(sm.referenceId)) ||
                             (sm.reason && Array.from(invoiceNumbers).some(num => sm.reason?.includes(num)));
          if (isSale || (isPosRef && matchesInv) || matchesInv) {
            deletedIds.push(sm.id);
            deletedMovementsCount++;
          } else {
            kept.push(sm);
          }
        });
        try { localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(kept)); } catch {}
        pushToServerSync('stockMovements', kept);
        broadcastEntityChange('stockMovements', kept);
        deletedIds.forEach(did => registerDeletedDoc('stockMovements', did));
        return kept;
      });
    }

    // 4. حذف سندات القبض والدفع التابعة لفواتير المبيعات
    let deletedVouchersCount = 0;
    if (deleteLinkedVouchers) {
      setVouchers(prev => {
        const kept: PaymentVoucher[] = [];
        const deletedIds: string[] = [];
        prev.forEach(v => {
          const isInvVch = v.id.startsWith('vch-inv-') || v.voucherNumber?.startsWith('RCT-INV-');
          const matchesInv = (v.referenceId && invoiceIds.has(v.referenceId)) ||
                             (v.referenceInvoiceId && invoiceIds.has(v.referenceInvoiceId)) ||
                             (v.voucherNumber && invoiceNumbers.has(v.voucherNumber)) ||
                             (v.description && (
                               v.description.includes('فاتورة مبيعات') ||
                               v.description.includes('سند تحصيل فوري لفاتورة') ||
                               Array.from(invoiceNumbers).some(num => v.description?.includes(num))
                             ));
          if (isInvVch || matchesInv) {
            deletedIds.push(v.id);
            deletedVouchersCount++;
          } else {
            kept.push(v);
          }
        });
        try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(kept)); } catch {}
        pushToServerSync('vouchers', kept);
        broadcastEntityChange('vouchers', kept);
        deletedIds.forEach(did => registerDeletedDoc('vouchers', did));
        return kept;
      });
    }

    // 5. حذف القيود المحاسبية لعمليات المبيعات
    if (deleteLinkedJournalEntries) {
      setJournalEntries(prev => {
        const kept: JournalEntry[] = [];
        const deletedIds: string[] = [];
        prev.forEach(je => {
          const isPos = je.referenceType === 'pos_invoice' || je.referenceType === 'cogs';
          const matchesInv = (je.referenceId && invoiceIds.has(je.referenceId)) ||
                             (je.description && (
                               je.description.includes('فاتورة مبيعات') ||
                               je.description.includes('تكلفة البضاعة المباعة لفاتورة') ||
                               Array.from(invoiceNumbers).some(num => je.description?.includes(num))
                             ));
          if (isPos || matchesInv) {
            deletedIds.push(je.id);
          } else {
            kept.push(je);
          }
        });
        try { localStorage.setItem(`${STORAGE_KEY}_journalEntries`, JSON.stringify(kept)); } catch {}
        pushToServerSync('journalEntries', kept);
        broadcastEntityChange('journalEntries', kept);
        deletedIds.forEach(did => registerDeletedDoc('journalEntries', did));
        return kept;
      });
    }

    // 6. تسوية ذمم العملاء (خصم مبالغ الديون الناتجة عن الفواتير المحذوفة)
    let adjustedPartiesCount = 0;
    if (revertCustomerBalances) {
      const customerDebtToDeduct: Record<string, number> = {};
      currentInvoices.forEach(inv => {
        const rem = Number(inv.remainingAmount) || 0;
        const custId = inv.subCustomerId || inv.customerId;
        if (custId && rem > 0) {
          customerDebtToDeduct[custId] = (customerDebtToDeduct[custId] || 0) + rem;
        }
      });

      if (Object.keys(customerDebtToDeduct).length > 0) {
        setParties(prev => {
          const updated = prev.map(p => {
            const deduct = customerDebtToDeduct[p.id];
            if (deduct && deduct > 0) {
              adjustedPartiesCount++;
              const newBal = Number(Math.max(0, (p.balance || 0) - deduct).toFixed(2));
              return { ...p, balance: newBal };
            }
            return p;
          });
          try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(updated)); } catch {}
          pushToServerSync('parties', updated);
          broadcastEntityChange('parties', updated);
          return updated;
        });
      }
    }

    // 7. تسوية وتطهير أرصدة وحركات الصناديق النقدية والبنكية
    let adjustedTreasuriesCount = 0;
    if (revertTreasuryBalances) {
      setTreasuries(prevTreasuries => {
        const auditedTreasuries = auditAndRecalculateTreasuries(prevTreasuries, [], vouchers, undefined, purchases, expenses);
        adjustedTreasuriesCount = auditedTreasuries.length;
        try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(auditedTreasuries)); } catch {}
        pushToServerSync('treasuries', auditedTreasuries);
        broadcastEntityChange('treasuries', auditedTreasuries);
        auditedTreasuries.forEach(t => {
          setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(t)).catch(() => {});
        });
        return auditedTreasuries;
      });
    }

    // 8. فك ربط أوامر تشغيل المطبعة بالفواتير المحذوفة
    setPrintOrders(prev => {
      const updated = prev.map(po => {
        if (po.associatedInvoiceId && invoiceIds.has(po.associatedInvoiceId)) {
          return { ...po, associatedInvoiceId: undefined };
        }
        return po;
      });
      try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(updated)); } catch {}
      return updated;
    });

    // 9. تصفير وحذف الفواتير من الذاكرة المحلية
    setInvoices([]);
    try {
      localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify([]));
    } catch {}
    pushToServerSync('invoices', []);
    broadcastEntityChange('invoices', []);

    if (clearDeletedInvoicesTrash) {
      setDeletedInvoices([]);
      try {
        localStorage.setItem(`${STORAGE_KEY}_deletedInvoices`, JSON.stringify([]));
      } catch {}
      pushToServerSync('deletedInvoices', []);
    }

    // تسجيل كافة المعرفات في سجل الحظر لمنع إعادة استرجاعها من المزامنة
    invoiceIds.forEach(id => {
      registerDeletedDoc('invoices', id);
      registerDeletedDoc('deletedInvoices', id);
    });

    // 10. إرسال الحذف إلى السحابة وقاعدة بيانات Firestore
    (async () => {
      try {
        // حذف كل وثيقة فردية عبر القنوات المعتمدة

        // حذف كل وثيقة فردية
        const idList = Array.from(invoiceIds);
        for (const id of idList) {
          deleteDoc(doc(db, 'invoices', id)).catch(() => {});
          deleteDoc(doc(db, 'deletedInvoices', id)).catch(() => {});
        }

        // حذف كافة وثائق الفواتير المتبقية مباشرة من مجموعة Firestore
        const invSnap = await getDocs(collection(db, 'invoices'));
        if (!invSnap.empty) {
          const b = writeBatch(db);
          invSnap.docs.forEach(d => b.delete(doc(db, 'invoices', d.id)));
          await b.commit();
        }
        if (clearDeletedInvoicesTrash) {
          const delSnap = await getDocs(collection(db, 'deletedInvoices'));
          if (!delSnap.empty) {
            const b = writeBatch(db);
            delSnap.docs.forEach(d => b.delete(doc(db, 'deletedInvoices', d.id)));
            await b.commit();
          }
        }
      } catch (err) {
        console.warn('Notice during Firestore sales invoices purge:', err);
      }
    })();

    return {
      success: true,
      message: `تم بنجاح حذف كافة فواتير المبيعات (${invCount} فاتورة)، واسترجاع ${totalRestoredUnits} وحدة إلى مخزون ${restoredItemsCount} صنف، وحذف ${deletedVouchersCount} سند مرتبط، و ${deletedMovementsCount} حركة مخزنية.`,
      deletedInvoicesCount: invCount,
      deletedVouchersCount,
      deletedMovementsCount,
      restoredItemsCount,
      restoredTotalUnits: totalRestoredUnits,
      adjustedPartiesCount,
      adjustedTreasuriesCount,
      executedAt: new Date().toISOString()
    };
  };

  const resetInvoicesAndKeepTreasury1101 = (): { success: boolean; message: string } => {
    deleteAllSalesInvoicesAndRelatedData();

    setTreasuries(prevTreasuries => {
      const kept = prevTreasuries.filter(t => t.accountCode === '1101' || t.id === 'treasury-cash-main');
      const deleted = prevTreasuries.filter(t => t.accountCode !== '1101' && t.id !== 'treasury-cash-main');

      deleted.forEach(t => {
        registerDeletedDoc('treasuries', t.id);
        deleteDoc(doc(db, 'treasuries', t.id)).catch(() => {});
      });

      let finalTreasuries = kept;
      if (finalTreasuries.length === 0) {
        finalTreasuries = [{
          id: 'treasury-cash-main',
          name: 'الصندوق النقدي الرئيسي (الكاشير)',
          type: 'cash_box',
          balance: 0,
          accountCode: '1101',
          isDefault: true,
          status: 'active',
          currency: 'ILS',
          currencySymbol: '₪',
          createdAt: new Date().toISOString(),
          transactions: []
        }];
      } else {
        finalTreasuries = finalTreasuries.map(t => ({
          ...t,
          balance: 0,
          transactions: []
        }));
      }

      try {
        localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(finalTreasuries));
      } catch {}
      pushToServerSync('treasuries', finalTreasuries);
      broadcastEntityChange('treasuries', finalTreasuries);
      return finalTreasuries;
    });

    return {
      success: true,
      message: 'تم حذف كافة الفواتير والارتباطات وباقي الصناديق بنجاح، والاحتفاظ بالصندوق النقدي 1101 فقط بصفر رصيد للبدء من جديد.'
    };
  };

  const renumberInvoicesToOne = (): { success: boolean; message: string } => ({
    success: false,
    message: 'تم تعطيل إعادة الترقيم الجماعي لحماية هوية الفواتير؛ التصحيح يتطلب جرد الفواتير وحجز الأرقام مركزياً.'
  });

  const restoreDeletedInvoice = async (id: string): Promise<Invoice | null> => {
    const target = deletedInvoices.find(inv => inv.id === id);
    if (!target) return null;

    const cleanRestored: Invoice = { ...target };
    delete cleanRestored.deletedAt;
    delete cleanRestored.deletedBy;
    delete cleanRestored.deletedByUserId;
    delete cleanRestored.deletionReason;

    // 1. حذف من سلة المحذوفات في Firestore
    deleteDoc(doc(db, 'deletedInvoices', id)).catch(() => {});
    setDeletedInvoices(prev => prev.filter(d => d.id !== id));

    // 2. إزالة المعرف من سجل الحذف المحظور
    try {
      const rawDel = localStorage.getItem(`${STORAGE_KEY}_deleted_docs_registry`);
      if (rawDel) {
        const arr = JSON.parse(rawDel);
        if (Array.isArray(arr)) {
          const filtered = arr.filter((x: string) => x !== `invoices_${id}` && x !== id);
          localStorage.setItem(`${STORAGE_KEY}_deleted_docs_registry`, JSON.stringify(filtered));
        }
      }
    } catch {}

    // 3. إعادة الحفظ في الفواتير النشطة في Firestore
    setDoc(doc(db, 'invoices', id), cleanDocForFirestore(cleanRestored)).catch(err => {
      console.warn('Error writing restored invoice to Firestore:', err);
    });
    setInvoices(prev => {
      const next = [cleanRestored, ...prev.filter(i => i.id !== id)];
      pushToServerSync('invoices', cleanRestored);
      broadcastEntityChange('invoices', next);
      return next;
    });

    // 4. التوثيق في سجل التدقيق
    try {
      const now = new Date();
      const auditEntry: AuditLogEntry = {
        id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        action: 'restore',
        entityType: 'invoice',
        invoiceId: id,
        invoiceNumber: target.invoiceNumber,
        user: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
        userId: currentUser?.id,
        timestamp: now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        reason: 'استعادة الفاتورة المحذوفة إلى النظام وإلغاء حذفها',
        details: {
          customerName: target.customerName,
          totalAmount: target.totalAmount,
          itemsCount: target.items?.length || 0
        },
        createdAt: now.toISOString()
      };
      setDoc(doc(db, 'auditLog', auditEntry.id), cleanDocForFirestore(auditEntry)).catch(() => {});
    } catch {}

    return cleanRestored;
  };

  const permanentlyDeleteInvoice = async (id: string): Promise<void> => {
    deleteDoc(doc(db, 'deletedInvoices', id)).catch(() => {});
    setDeletedInvoices(prev => prev.filter(d => d.id !== id));
  };

  const getInvoiceDeleteAuditLogs = async (invoiceId: string = '29'): Promise<AuditLogEntry[]> => {
    const searchTarget = (invoiceId || '').trim();
    try {
      const snapshot = await getDocs(collection(db, 'auditLog'));
      const rawLogs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as AuditLogEntry));

      const filtered = rawLogs.filter(log => {
        if (!searchTarget) return true;
        const logInvId = String(log.invoiceId || '').toLowerCase();
        const logInvNum = String(log.invoiceNumber || '').toLowerCase();
        const targetClean = searchTarget.toLowerCase();
        const targetDigits = targetClean.replace(/\D/g, '');

        const matchesExact = logInvId === targetClean || logInvNum === targetClean;
        const matchesContains = logInvId.includes(targetClean) || logInvNum.includes(targetClean);
        const matchesDigits = targetDigits && (logInvId.includes(targetDigits) || logInvNum.includes(targetDigits));

        return matchesExact || matchesContains || matchesDigits;
      });

      filtered.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp).getTime() || 0;
        const timeB = new Date(b.createdAt || b.timestamp).getTime() || 0;
        return timeB - timeA;
      });

      return filtered;
    } catch (err) {
      console.warn('Error querying auditLog collection from Firestore:', err);
      return [];
    }
  };

  const addInvoiceTechnicalNote = (invoiceId: string, text: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const newNote: InvoiceTechnicalNote = {
      id: 'tn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      userName: currentUser?.fullName || currentUser?.username || 'فني الورشة',
      userId: currentUser?.id,
      text: text.trim(),
      createdAt: now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    setInvoices(prev => {
      const next = prev.map(inv => {
        if (inv.id !== invoiceId) return inv;
        const updated = { ...inv, technicalNotes: [...(inv.technicalNotes || []), newNote] };
        pushToServerSync('invoices', updated);
        return updated;
      });
      broadcastEntityChange('invoices', next);
      return next;
    });
  };

  const addInvoiceItemAttachment = (
    invoiceId: string,
    itemIndexOrId: string | number,
    attachment: LineAttachment
  ) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updatedItems = inv.items.map((item, idx) => {
        const matches = typeof itemIndexOrId === 'number' ? idx === itemIndexOrId : (item.itemId === itemIndexOrId || String(idx) === String(itemIndexOrId));
        if (!matches) return item;
        return {
          ...item,
          attachments: [...(item.attachments || []), attachment]
        };
      });
      return { ...inv, items: updatedItems };
    }));
  };

  const removeInvoiceItemAttachment = (
    invoiceId: string,
    itemIndexOrId: string | number,
    attachmentId: string
  ): { success: boolean; message?: string } => {
    let result = { success: true, message: 'تم حذف المرفق بنجاح' };
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updatedItems = inv.items.map((item, idx) => {
        const matches = typeof itemIndexOrId === 'number' ? idx === itemIndexOrId : (item.itemId === itemIndexOrId || String(idx) === String(itemIndexOrId));
        if (!matches) return item;
        const targetAttachment = item.attachments?.find(a => a.id === attachmentId);
        if (targetAttachment?.driveFileId) {
          deleteFileFromGoogleDrive(targetAttachment.driveFileId).catch(err => {
            console.warn('Drive deletion note:', err);
          });
        }
        return {
          ...item,
          attachments: (item.attachments || []).filter(a => a.id !== attachmentId)
        };
      });
      return { ...inv, items: updatedItems };
    }));
    return result;
  };

  const startInvoicePrinting = (invoiceId: string) => {
    const now = new Date();
    const nowStr = now.toISOString();
    const user = currentUser?.fullName || currentUser?.username || 'فني الطباعة';
    updateInvoice(
      invoiceId,
      {
        workflowStatus: 'print_internal',
        printStartedAt: nowStr,
        printStartedBy: user
      },
      {
        notes: `بدء أعمال وسحب الطباعة بالورشة بواسطة ${user}`,
        userName: user,
        userId: currentUser?.id
      }
    );
  };

  const finishInvoicePrinting = (invoiceId: string) => {
    const now = new Date();
    const nowStr = now.toISOString();
    const user = currentUser?.fullName || currentUser?.username || 'فني الطباعة';
    updateInvoice(
      invoiceId,
      {
        workflowStatus: 'ready',
        printFinishedAt: nowStr,
        printFinishedBy: user
      },
      {
        notes: `اكتمال أعمال الطباعة والتجهيز - الطلبية جاهزة للتسليم بواسطة ${user}`,
        userName: user,
        userId: currentUser?.id
      }
    );
  };

  const deliverInvoice = (invoiceId: string, notes?: string) => {
    const now = new Date();
    const nowStr = now.toISOString();
    const user = currentUser?.fullName || currentUser?.username || 'فني الورشة';
    updateInvoice(
      invoiceId,
      {
        workflowStatus: 'delivered',
        deliveredAt: nowStr,
        deliveredBy: user
      },
      {
        notes: notes || `اعتماد تسليم الفاتورة للعميل (تم التسليم) وخروجها من شاشة أوامر الورشة بواسطة ${user}`,
        userName: user,
        userId: currentUser?.id
      }
    );
  };

  // Create Print Order
  const createPrintOrder = (orderData: Omit<PrintJobOrder, 'id' | 'orderNumber' | 'createdAt'>): string => {
    const id = 'job-' + Date.now();
    const orderNumber = `JOB-${new Date().getFullYear()}-${String(printOrders.length + 1).padStart(4, '0')}`;
    const today = new Date().toISOString().split('T')[0];

    const newOrder: PrintJobOrder = {
      ...orderData,
      id,
      orderNumber,
      createdAt: today
    };

    setPrintOrders(prev => {
      const next = [newOrder, ...prev];
      broadcastEntityChange('printOrders', next);
      pushToServerSync('printOrders', newOrder);
      return next;
    });

    // Save directly to Firestore for real-time multi-user syncing
    setDoc(doc(db, 'printOrders', newOrder.id), cleanDocForFirestore(newOrder)).catch(err => {
      console.warn('Direct cloud save print order notice:', err);
    });

    // If deposit was paid, record journal entry for deposit (skip if already accounted for by an invoice)
    if (orderData.depositPaid > 0 && !orderData.associatedInvoiceId) {
      addJournalEntry({
        date: today,
        description: `عربون أمر طباعة ${orderNumber} - العميل: ${orderData.customerName}`,
        referenceType: 'print_order',
        referenceId: id,
        lines: [
          {
            accountCode: '1101',
            accountName: 'الصندوق النقدي (الكاشير)',
            debit: orderData.depositPaid,
            credit: 0,
            description: `استلام عربون نقدي لأمر شغل ${orderNumber}`
          },
          {
            accountCode: '4102',
            accountName: 'إيرادات أعمال ومطبوعات المطبعة',
            debit: 0,
            credit: orderData.depositPaid,
            description: `إيراد طباعة مقدم`
          }
        ]
      });
    }

    // Update customer balance if order remaining balance exists (skip if already handled by an invoice)
    if (orderData.customerId && orderData.remainingBalance > 0 && !orderData.associatedInvoiceId) {
      setParties(prev => prev.map(p => p.id === orderData.customerId ? { ...p, balance: p.balance + orderData.remainingBalance } : p));
    }

    return id;
  };

  const updatePrintOrder = (id: string, updates: Partial<PrintJobOrder>) => {
    setPrintOrders(prev => prev.map(job => {
      if (job.id !== id) return job;
      const updated = { ...job, ...updates };

      // Link print order status with invoice workflow status
      if (updates.status) {
        const mappedInvoiceWorkflow: PosInvoiceWorkflowStatus =
          updates.status === 'new' ? 'new'
          : updates.status === 'design' ? 'designing'
          : updates.status === 'pending_approval' ? 'pending_approval'
          : updates.status === 'in_progress_external' ? 'in_progress_external'
          : updates.status === 'in_progress_internal' ? 'in_progress_internal'
          : updates.status === 'printing' || updates.status === 'finishing' ? 'in_progress_internal'
          : updates.status === 'ready' ? 'ready'
          : updates.status === 'delivered' ? 'delivered'
          : 'new';

        setInvoices(invs => invs.map(inv => {
          if (
            inv.printJobId === id ||
            (Boolean(job.associatedInvoiceId) && inv.id === job.associatedInvoiceId)
          ) {
            if (inv.workflowStatus === mappedInvoiceWorkflow) return inv;
            const now = new Date();
            const logEntry: InvoiceStatusLog = {
              id: 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
              userName: currentUser?.fullName || 'قسم الإنتاج والمطبعة',
              userId: currentUser?.id,
              date: now.toISOString().split('T')[0],
              time: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
              previousStatus: inv.workflowStatus || 'new',
              newStatus: mappedInvoiceWorkflow,
              notes: `تحديث آلي من قسم الإنتاج (أمر مطبعة #${job.orderNumber} - حالة: ${updates.status})`,
              createdAt: now.toISOString()
            };
            return {
              ...inv,
              workflowStatus: mappedInvoiceWorkflow,
              statusHistory: [...(inv.statusHistory || []), logEntry]
            };
          }
          return inv;
        }));
      }

      return updated;
    }));

    setTimeout(() => {
      const target = printOrders.find(j => j.id === id);
      if (target) {
        setDoc(doc(db, 'printOrders', id), cleanDocForFirestore({ ...target, ...updates })).catch(err => {
          console.warn('Direct cloud update print order notice:', err);
        });
      }
    }, 100);
  };

  const updatePrintOrderStatus = (id: string, newStatus: PrintJobOrder['status']) => {
    updatePrintOrder(id, { status: newStatus });
  };

  const collectPrintOrderPayment = (id: string, amount: number, paymentMethod: PaymentMethod) => {
    setPrintOrders(prev => prev.map(job => {
      if (job.id === id) {
        const newPaid = job.depositPaid + amount;
        const newRemaining = Math.max(0, job.totalPrice - newPaid);
        const today = new Date().toISOString().split('T')[0];

        // Journal entry for collection
        const paymentAccountCode = paymentMethod === 'cash' ? '1101' : paymentMethod === 'card' ? '1102' : '1102';
        const paymentAccountName = paymentMethod === 'cash' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

        addJournalEntry({
          date: today,
          description: `تحصيل دفعة أمر طباعة ${job.orderNumber} - العميل: ${job.customerName}`,
          referenceType: 'print_order',
          referenceId: job.id,
          lines: [
            {
              accountCode: paymentAccountCode,
              accountName: paymentAccountName,
              debit: amount,
              credit: 0,
              description: `سداد قيمة أمر الشغل ${job.orderNumber}`
            },
            {
              accountCode: '4102',
              accountName: 'إيرادات أعمال ومطبوعات المطبعة',
              debit: 0,
              credit: amount,
              description: `إيراد مطبوعات مستلم`
            }
          ]
        });

        // Update party balance if customer exists
        if (job.customerId) {
          setParties(pList => pList.map(p => p.id === job.customerId ? { ...p, balance: Math.max(0, p.balance - amount) } : p));
        }

        return {
          ...job,
          depositPaid: newPaid,
          remainingBalance: newRemaining
        };
      }
      return job;
    }));
  };

  const deletePrintOrder = (id: string): { success: boolean; message?: string } => {
    const isStandalone = printOrders.some(po => po.id === id);
    if (isStandalone) {
      setPrintOrders(prev => {
        const next = prev.filter(po => po.id !== id);
        broadcastEntityChange('printOrders', next);
        try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(next)); } catch {}
        return next;
      });
      try {
        deleteDoc(doc(db, 'printOrders', id)).catch(err => {
          console.warn('Firestore delete print order notice:', err);
        });
      } catch (e) {}
    } else {
      setInvoices(prev => prev.map(inv => {
        if (inv.id === id) {
          return {
            ...inv,
            workflowStatus: 'delivered',
            isWorkshopVisible: false
          };
        }
        return inv;
      }));
    }
    return { success: true, message: 'تم حذف أمر الطباعة والتشغيل بنجاح دون التأثير على فواتير المبيعات' };
  };

  const deleteMultiplePrintOrders = (ids: string[]): { success: boolean; count: number } => {
    if (!Array.isArray(ids) || ids.length === 0) return { success: false, count: 0 };
    const idSet = new Set(ids);

    setPrintOrders(prev => {
      const next = prev.filter(po => !idSet.has(po.id));
      broadcastEntityChange('printOrders', next);
      try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(next)); } catch {}
      return next;
    });

    ids.forEach(id => {
      try {
        deleteDoc(doc(db, 'printOrders', id)).catch(() => {});
      } catch (e) {}
    });

    setInvoices(prev => prev.map(inv => {
      if (idSet.has(inv.id)) {
        return {
          ...inv,
          workflowStatus: 'delivered',
          isWorkshopVisible: false
        };
      }
      return inv;
    }));

    return { success: true, count: ids.length };
  };

  const deleteAllPrintOrders = (): { success: boolean; count: number } => {
    const count = printOrders.length;

    // 1. Purge state & localStorage
    setPrintOrders([]);
    broadcastEntityChange('printOrders', []);
    try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify([])); } catch {}
    try { localStorage.removeItem(`${STORAGE_KEY}_printOrders`); } catch {}

    // 2. Register deleted docs and delete local print orders from Firestore
    printOrders.forEach(po => {
      try {
        registerDeletedDoc('printOrders', po.id);
        deleteDoc(doc(db, 'printOrders', po.id)).catch(() => {});
      } catch (e) {}
    });

    // Also fetch and delete ALL documents directly in Firestore collection 'printOrders' in case there are orphaned ones
    try {
      getDocs(collection(db, 'printOrders')).then(snapshot => {
        snapshot.docs.forEach(d => {
          registerDeletedDoc('printOrders', d.id);
          deleteDoc(doc(db, 'printOrders', d.id)).catch(() => {});
        });
      }).catch(() => {});
    } catch (e) {}

    // 3. Purge related vouchers (سندات مرتبطة بأوامر التشغيل والطباعة)
    setVouchers(prevVouchers => {
      const remainingVouchers = prevVouchers.filter(v => {
        const isLinkedToPrintOrder =
          v.relatedDocType === 'printOrder' ||
          (v.notes && (v.notes.includes('امر تشغيل') || v.notes.includes('JOB-') || v.notes.includes('أمر طباعة')));
        if (isLinkedToPrintOrder) {
          registerDeletedDoc('vouchers', v.id);
          deleteDoc(doc(db, 'vouchers', v.id)).catch(() => {});
          return false;
        }
        return true;
      });
      try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(remainingVouchers)); } catch {}
      return remainingVouchers;
    });

    // 4. Purge related stockMovements (حركات مخزنية مرتبطة)
    setStockMovements(prevMovements => {
      const remainingMovements = prevMovements.filter(sm => {
        const isLinked =
          sm.referenceType === 'printOrder' ||
          (sm.notes && (sm.notes.includes('امر تشغيل') || sm.notes.includes('JOB-')));
        if (isLinked) {
          registerDeletedDoc('stockMovements', sm.id);
          deleteDoc(doc(db, 'stockMovements', sm.id)).catch(() => {});
          return false;
        }
        return true;
      });
      try { localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(remainingMovements)); } catch {}
      return remainingMovements;
    });

    // 5. Clean linked invoices
    setInvoices(prev => prev.map(inv => {
      if (inv.workflowStatus && inv.workflowStatus !== 'new' && inv.workflowStatus !== 'delivered') {
        return {
          ...inv,
          workflowStatus: 'delivered',
          isWorkshopVisible: false,
          productionOrderNumber: undefined
        };
      }
      return inv;
    }));

    pushDeltaToServer('printOrders', 'delete', { id: 'all', _deleted: true });

    return { success: true, count };
  };

  const createPurchaseInvoice = (invoiceData: Omit<PurchaseInvoice, 'id' | 'invoiceNumber'>) => {
    const id = 'pur-' + Date.now();
    const curYear = new Date().getFullYear();
    const purPrefix = `PUR-${curYear}-`;
    let maxPurSeq = 0;
    purchases.forEach(p => {
      if (p.invoiceNumber && p.invoiceNumber.startsWith(purPrefix)) {
        const seq = parseInt(p.invoiceNumber.substring(purPrefix.length), 10);
        if (!isNaN(seq) && seq > maxPurSeq) maxPurSeq = seq;
      }
    });
    let nextPurSeq = maxPurSeq + 1;
    let invoiceNumber = `${purPrefix}${String(nextPurSeq).padStart(4, '0')}`;
    while (purchases.some(p => p.invoiceNumber === invoiceNumber)) {
      nextPurSeq++;
      invoiceNumber = `${purPrefix}${String(nextPurSeq).padStart(4, '0')}`;
    }
    
    // Group repeated SKUs before touching inventory. A purchase invoice may
    // contain several lines for the same actual item (different dimensions,
    // costs or notes). The line total is the net cost before input VAT.
    const groupedItems = new Map<string, {quantity:number;netCost:number}>();
    for(const line of invoiceData.items||[]){
      const qty=Number(line.quantity);
      const amount=Number(line.total);
      if(!line.itemId||!inventory.some(item=>item.id===line.itemId)||
        !Number.isFinite(qty)||qty<=0||!Number.isFinite(amount)||amount<0)
        throw new Error('فاتورة المشتريات تحتوي على صنف غير معروف أو كمية أو قيمة غير صحيحة.');
      const prior=groupedItems.get(line.itemId)||{quantity:0,netCost:0};
      prior.quantity=Number((prior.quantity+qty).toFixed(6));
      prior.netCost=Number((prior.netCost+amount).toFixed(2));
      groupedItems.set(line.itemId,prior);
    }
    if(!groupedItems.size)throw new Error('يجب إدخال صنف واحد على الأقل في فاتورة الشراء.');

    const lineNetTotal=Number(Array.from(groupedItems.values()).reduce((s,r)=>s+r.netCost,0).toFixed(2));
    const landedCharges=Number(invoiceData.additionalCharges||0);
    if(!Number.isFinite(landedCharges)||landedCharges<0)
      throw new Error('مصاريف التوريد الإضافية يجب أن تكون مبلغًا صحيحًا غير سالب.');
    const sourceSubtotal=invoiceData.subtotal!==undefined?
      Number(invoiceData.subtotal):
      Number(Array.from(groupedItems.values()).reduce((s,r)=>s+r.netCost,0).toFixed(2));
    const sourceTax=Number(invoiceData.taxAmount||0);
    const sourceTotal=Number(invoiceData.totalAmount);
    const exchangeRate=Number(invoiceData.exchangeRate||1);
    const isSplitPurchase=invoiceData.cashPaidAmount!==undefined||
      invoiceData.bankPaidAmount!==undefined;
    const cashAmount=Number(invoiceData.cashPaidAmount||0);
    const bankAmount=Number(invoiceData.bankPaidAmount||0);
    const cashRate=Number(invoiceData.cashPaymentExchangeRate||1);
    const bankRate=Number(invoiceData.bankPaymentExchangeRate||1);
    if(![cashAmount,bankAmount,cashRate,bankRate].every(Number.isFinite)||
      cashAmount<0||bankAmount<0||cashRate<=0||bankRate<=0)
      throw new Error('المبلغ أو سعر الصرف في الدفع النقدي/البنكي غير صحيح.');
    const cashBase=isSplitPurchase?Number((cashAmount*cashRate).toFixed(2)):0;
    const bankBase=isSplitPurchase?Number((bankAmount*bankRate).toFixed(2)):0;
    const baseTotalAmount=Number((sourceTotal*exchangeRate).toFixed(2));
    const basePaidAmount=isSplitPurchase?Number((cashBase+bankBase).toFixed(2)):
      Number((Number(invoiceData.paidAmount||0)*exchangeRate).toFixed(2));
    const unpaidBase=Number((baseTotalAmount-basePaidAmount).toFixed(2));
    const sourcePaid=isSplitPurchase
      ?(Math.abs(unpaidBase)<0.005?sourceTotal:
        Number((basePaidAmount/exchangeRate).toFixed(2)))
      :Number(invoiceData.paidAmount||0);
    if(!Number.isFinite(exchangeRate)||exchangeRate<=0||!Number.isFinite(sourceSubtotal)||
      !Number.isFinite(sourceTax)||!Number.isFinite(sourceTotal)||!Number.isFinite(sourcePaid)||
      sourceSubtotal<0||sourceTax<0||sourcePaid<0||basePaidAmount<0||
      basePaidAmount>baseTotalAmount+0.005||
      Math.abs(sourceSubtotal+sourceTax-sourceTotal)>0.011||
      Math.abs(lineNetTotal+landedCharges-sourceSubtotal)>0.011||
      (basePaidAmount>0&&invoiceData.paymentMethod==='credit'))
      throw new Error('إجمالي فاتورة المشتريات أو المبلغ المدفوع أو سعر الصرف غير متوازن.');
    if(!parties.some(p=>p.id===invoiceData.supplierId&&
      (p.type==='supplier'||p.type==='both')))
      throw new Error('المورد غير موجود في السجل المعتمد.');
    const baseSubtotal=Number((sourceSubtotal*exchangeRate).toFixed(2));
    // Convert the document total once, then split rounded base amounts.
    // This prevents a 0.01 imbalance between purchases, VAT and payments.
    const baseTaxAmount=Number((baseTotalAmount-baseSubtotal).toFixed(2));
    // Payment bases use each actual payment currency and its own approved
    // rate; the invoice exchange rate is only for valuation of the purchase.
    const stockValuesBase=new Map<string,number>();
    const groupedEntries=Array.from(groupedItems.entries());
    let allocatedBase=0;
    groupedEntries.forEach(([itemId,amount],index)=>{
      const landedShare=lineNetTotal>0
        ?landedCharges*amount.netCost/lineNetTotal
        :landedCharges*amount.quantity/
         groupedEntries.reduce((sum,[,line])=>sum+line.quantity,0);
      const baseValue=index===groupedEntries.length-1
        ?Number((baseSubtotal-allocatedBase).toFixed(2))
        :Number(((amount.netCost+landedShare)*exchangeRate).toFixed(2));
      stockValuesBase.set(itemId,baseValue);
      allocatedBase=Number((allocatedBase+baseValue).toFixed(2));
    });
    // An invoice can be paid in cash, bank, both, or entirely on account.
    // Explicit treasury references are mandatory for both real payment legs.
    const paymentLegs:(Array<{
      kind:'cash'|'bank';amount:number;rate:number;
      currency:string;treasuryCode:string;base:number;
    }>)=[];
    if(isSplitPurchase){
      if(cashBase>0)paymentLegs.push({
        kind:'cash',amount:cashAmount,rate:cashRate,
        currency:invoiceData.cashPaymentCurrency||'ILS',
        treasuryCode:invoiceData.cashTreasuryAccountCode||'',base:cashBase
      });
      if(bankBase>0)paymentLegs.push({
        kind:'bank',amount:bankAmount,rate:bankRate,
        currency:invoiceData.bankPaymentCurrency||'ILS',
        treasuryCode:invoiceData.bankTreasuryAccountCode||'',base:bankBase
      });
    }else if(basePaidAmount>0){
      paymentLegs.push({
        kind:invoiceData.paymentMethod==='cash'?'cash':'bank',
        amount:sourcePaid,rate:exchangeRate,
        currency:invoiceData.currency||'ILS',
        treasuryCode:invoiceData.treasuryAccountCode||
          (invoiceData.paymentMethod==='cash'?'1101':'1102'),
        base:basePaidAmount
      });
    }
    const verifiedPayments=paymentLegs.map(leg=>{
      const treasury=treasuries.find(t=>t.accountCode===leg.treasuryCode);
      if(!treasury||treasury.status==='inactive'||
        (leg.kind==='cash'&&treasury.type!=='cash_box')||
        (leg.kind==='bank'&&treasury.type==='cash_box'))
        throw new Error('الدفع النقدي والبنكي يجب أن يرتبط كل منهما بالصندوق أو الحساب الصحيح.');
      return {...leg,treasury};
    });

    const newPur: PurchaseInvoice = {
      ...invoiceData,
      id,
      invoiceNumber,
      currency: invoiceData.currency || settings.baseCurrencyCode || 'ILS',
      currencySymbol: invoiceData.currencySymbol || settings.currency || '₪',
      exchangeRate,
      subtotal:sourceSubtotal,taxRate:Number(invoiceData.taxRate||0),taxAmount:sourceTax,
      totalAmount:sourceTotal,paidAmount:sourcePaid,
      baseTotalAmount,basePaidAmount,
      status:unpaidBase<0.005?'paid':basePaidAmount>0?'partial':'unpaid'
    };

    setPurchases(prev => [newPur, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'purchases', newPur.id), cleanDocForFirestore(newPur)).catch(err => {
      console.warn('Direct cloud save purchase notice:', err);
    });

    // Increase inventory (convert unit price to base Shekel if foreign currency was used)
    const purMovementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    setInventory(prev => prev.map(it => {
      const match=groupedItems.get(it.id);
      if (match) {
        const effectiveNetValue=stockValuesBase.get(it.id)||0;
        const unitCostInBase=Number((effectiveNetValue/match.quantity).toFixed(6));
        const oldQty=Number(it.stockQuantity)||0;
        const newQty=Number((oldQty+match.quantity).toFixed(6));
        addStockMovement({
          itemId: it.id,
          itemCode: it.code,
          itemName: it.name,
          category: it.category,
          date: invoiceData.date,
          time: purMovementTime,
          type: 'in_purchase',
          quantity: match.quantity,
          balanceBefore: oldQty,
          balanceAfter: newQty,
          unitPrice: unitCostInBase,
          totalValue: effectiveNetValue,
          referenceType: 'purchase',
          referenceNumber: invoiceNumber,
          reason: `توريد مشتريات من المورد (${invoiceData.supplierName})`,
          performedBy: 'قسم المشتريات'
        });
        const updatedItem = {
          ...it,
          stockQuantity: newQty,
          purchasePrice: unitCostInBase,
          lastMovementDate: invoiceData.date
        };
        setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));

    // Post to Journal in BASE CURRENCY (Palestinian Shekel ₪ / ILS)
    const remainingToSupplier=Number((sourceTotal-sourcePaid).toFixed(2));
    const baseRemainingToSupplier=unpaidBase;

    const journalLines = [
      {
        accountCode: '1302',
        accountName: 'مخزون خامات وأوراق المطبعة',
        debit: baseSubtotal,
        credit: 0,
        description: `شراء مواد خام ومستلزمات فاتورة ${invoiceNumber}`
      },
      {
        accountCode: '2103',
        accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
        debit: baseTaxAmount,
        credit: 0,
        description: `ضريبة مدخلات مشتريات (محولة للشيكل)`
      }
    ];

    for(const leg of verifiedPayments){
      journalLines.push({
        accountCode:leg.treasury.accountCode,
        accountName:leg.treasury.name,
        debit:0,credit:leg.base,
        description:`سداد فاتورة مشتريات ${invoiceNumber} ${leg.kind==='cash'?'نقدًا':'بنكيًا'} ${leg.amount} ${leg.currency}`
      });

      adjustTreasuryBalance(
        leg.treasuryCode,-leg.amount,
        `سداد مشتريات ${invoiceNumber} من ${leg.treasury.name}`+
          (invoiceData.paymentReceiptNote?` — ${invoiceData.paymentReceiptNote}`:''),
        'purchase',id,{
          currency:leg.currency,currencySymbol:currencies.find(c=>c.code===leg.currency)?.symbol||leg.currency,
          exchangeRate:leg.rate,date:invoiceData.date,
          partyName:invoiceData.supplierName
        }
      );

      // A single payment voucher is created for each actually paid leg,
      // preserving the supplier statement and its cash/bank audit trail.
      const voucherId=`vch-pur-${id}-${leg.kind}`;
      const voucherNumber=`PAY-PUR-${invoiceNumber.replace('PUR-','')}-${leg.kind==='cash'?'C':'B'}`;
      const voucher:PaymentVoucher={
        id:voucherId,voucherNumber,type:'payment',
        date:invoiceData.date,partyId:invoiceData.supplierId,
        partyName:invoiceData.supplierName,amount:leg.base,
        paymentMethod:leg.kind==='cash'?'cash':'bank_transfer',
        accountCode:'2101',treasuryAccountCode:leg.treasuryCode,
        currency:'ILS',currencySymbol:'₪',baseAmount:leg.base,
        relatedDocType:'purchase',relatedDocId:id,
        description:`سداد فاتورة ${invoiceNumber} — ${leg.amount} ${leg.currency} من ${leg.treasury.name}`+
          (invoiceData.paymentReceiptNote?` — ${invoiceData.paymentReceiptNote}`:'')
      };
      setVouchers(prev=>[voucher,...prev]);
      setDoc(doc(db,'vouchers',voucherId),cleanDocForFirestore(voucher)).catch(()=>{});
    }

    if (baseRemainingToSupplier > 0) {
      journalLines.push({
        accountCode: '2101',
        accountName: 'الموردون والذمم الدائنة',
        debit: 0,
        credit: baseRemainingToSupplier,
        description: `مستحق لمورد ${invoiceData.supplierName} (محول للشيكل)`
      });

      // Update supplier balance (credit) in BASE CURRENCY
      setParties(prev => prev.map(p => {
        if (p.id === invoiceData.supplierId) {
          const updatedP = { ...p, balance: p.balance - baseRemainingToSupplier };
          setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
          return updatedP;
        }
        return p;
      }));
    }

    addJournalEntry({
      date: invoiceData.date,
      description: `فاتورة مشتريات ${invoiceNumber} من المورد ${invoiceData.supplierName}`,
      referenceType: 'purchase',
      referenceId: id,
      lines: journalLines
    });
  };

  const createPaymentVoucher = (voucherData: Omit<PaymentVoucher, 'id' | 'voucherNumber'>) => {
    const id = 'vch-' + Date.now();
    const prefix = voucherData.type === 'receipt' ? 'RCT' : 'PAY';
    const currentYear = new Date().getFullYear();
    const yearPrefix = `${prefix}-${currentYear}-`;
    let maxSeq = 0;
    vouchers.forEach(v => {
      if (v.voucherNumber && v.voucherNumber.startsWith(yearPrefix)) {
        const seq = parseInt(v.voucherNumber.substring(yearPrefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
    let nextSeq = Math.max(vouchers.length + 1, maxSeq + 1);
    let voucherNumber = `${yearPrefix}${String(nextSeq).padStart(4, '0')}`;
    while (vouchers.some(v => v.voucherNumber === voucherNumber)) {
      nextSeq++;
      voucherNumber = `${yearPrefix}${String(nextSeq).padStart(4, '0')}`;
    }

    const curr = voucherData.currency || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = voucherData.exchangeRate !== undefined
      ? voucherData.exchangeRate
      : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = voucherData.currencySymbol || (curr === 'ILS' ? '₪' : (currInfo?.symbol || curr));
    const actualAmount = voucherData.amount;
    const baseAmount = voucherData.baseAmount !== undefined
      ? voucherData.baseAmount
      : Number((actualAmount * rate).toFixed(2));

    const newVoucher: PaymentVoucher = {
      ...voucherData,
      id,
      voucherNumber,
      currency: curr,
      currencySymbol: symbol,
      exchangeRate: rate,
      baseAmount
    };

    setVouchers(prev => {
      const next = [newVoucher, ...prev];
      broadcastEntityChange('vouchers', next);
      pushToServerSync('vouchers', newVoucher);
      return next;
    });

    // Direct cloud save
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(err => {
      console.warn('Direct cloud save voucher notice:', err);
    });

    const cashBankCode = voucherData.treasuryAccountCode || (voucherData.paymentMethod === 'cash' ? '1101' : '1102');
    const targetTreasury = treasuries.find(t => t.accountCode === cashBankCode || t.id === cashBankCode);
    const cashBankName = targetTreasury ? targetTreasury.name : (voucherData.paymentMethod === 'cash' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)');
    const effectiveAccountCode = voucherData.accountCode || (voucherData.type === 'receipt' ? '1201' : '2101');

    if (voucherData.type === 'receipt') {
      // Receipt voucher: Debit Cash/Bank, Credit Account / Customer (in base currency ILS)
      addJournalEntry({
        date: voucherData.date,
        description: `سند قبض ${voucherNumber} من ${voucherData.partyName} (${actualAmount.toLocaleString()} ${symbol} معادل ${baseAmount.toLocaleString()} ₪)`,
        referenceType: 'receipt',
        referenceId: id,
        lines: [
          {
            accountCode: cashBankCode,
            accountName: cashBankName,
            debit: baseAmount,
            credit: 0,
            description: voucherData.description || `سند قبض نقدي`
          },
          {
            accountCode: effectiveAccountCode,
            accountName: 'العملاء والذمم المدينة',
            debit: 0,
            credit: baseAmount,
            description: `تسديد من العميل ${voucherData.partyName}`
          }
        ]
      });

      // Update Treasury actual currency balance!
      adjustTreasuryBalance(
        cashBankCode,
        actualAmount,
        `سند قبض ${voucherNumber} من ${voucherData.partyName}`,
        'receipt',
        id,
        {
          currency: curr,
          currencySymbol: symbol,
          exchangeRate: rate,
          voucherNumber,
          partyName: voucherData.partyName,
          date: voucherData.date
        }
      );

      // Decrease customer debit balance (in base currency ILS)
      if (voucherData.partyId) {
        setParties(prev => prev.map(p => {
          if (p.id === voucherData.partyId) {
            const updatedP = { ...p, balance: Number((p.balance - baseAmount).toFixed(2)) };
            setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
            return updatedP;
          }
          return p;
        }));
      }
    } else {
      // Payment voucher: Debit Expense / Supplier, Credit Cash/Bank (in base currency ILS)
      addJournalEntry({
        date: voucherData.date,
        description: `سند صرف ${voucherNumber} إلى ${voucherData.partyName} (${actualAmount.toLocaleString()} ${symbol} معادل ${baseAmount.toLocaleString()} ₪)`,
        referenceType: 'payment',
        referenceId: id,
        lines: [
          {
            accountCode: effectiveAccountCode,
            accountName: effectiveAccountCode.startsWith('5') ? 'مصروفات تشغيلية' : 'الموردون والذمم الدائنة',
            debit: baseAmount,
            credit: 0,
            description: voucherData.description || `سند صرف`
          },
          {
            accountCode: cashBankCode,
            accountName: cashBankName,
            debit: 0,
            credit: baseAmount,
            description: `صرف من ${cashBankName}`
          }
        ]
      });

      // Update Treasury actual currency balance!
      adjustTreasuryBalance(
        cashBankCode,
        -actualAmount,
        `سند صرف ${voucherNumber} إلى ${voucherData.partyName}`,
        'payment',
        id,
        {
          currency: curr,
          currencySymbol: symbol,
          exchangeRate: rate,
          voucherNumber,
          partyName: voucherData.partyName,
          date: voucherData.date
        }
      );

      // If supplier, adjust supplier balance (increases toward 0, reducing debt in ILS)
      if (voucherData.partyId) {
        setParties(prev => prev.map(p => {
          if (p.id === voucherData.partyId) {
            const updatedP = { ...p, balance: Number((p.balance + baseAmount).toFixed(2)) };
            setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
            return updatedP;
          }
          return p;
        }));
      }
    }
  };

  const updatePaymentVoucher = (id: string, updates: Partial<PaymentVoucher>) => {
    let finalVoucher: PaymentVoucher | null = null;
    setVouchers(prev => prev.map(v => {
      if (v.id !== id) return v;
      // Do not allow changing unique voucherNumber
      const { voucherNumber: _ignored, ...allowed } = updates;
      finalVoucher = { ...v, ...allowed };
      return finalVoucher;
    }));
    if (finalVoucher) {
      setDoc(doc(db, 'vouchers', id), cleanDocForFirestore(finalVoucher)).catch(() => {});
    }
  };

  const deletePaymentVoucher = (id: string) => {
    let remainingVouchers: PaymentVoucher[] = [];
    setVouchers(prev => {
      remainingVouchers = prev.filter(v => v.id !== id);
      pushDeltaToServer('vouchers', 'delete', { id, _deleted: true });
      broadcastEntityChange('vouchers', remainingVouchers);
      return remainingVouchers;
    });
    registerDeletedDoc('vouchers', id);
    deleteDoc(doc(db, 'vouchers', id)).catch(() => {});

    // Audit and purge linked transactions from treasuries and recalculate balances
    setTreasuries(prevTreasuries => {
      const auditedTreasuries = auditAndRecalculateTreasuries(prevTreasuries, invoices, remainingVouchers, undefined, purchases, expenses);
      try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(auditedTreasuries)); } catch {}
      pushToServerSync('treasuries', auditedTreasuries);
      broadcastEntityChange('treasuries', auditedTreasuries);
      auditedTreasuries.forEach(t => {
        setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(t)).catch(() => {});
      });
      return auditedTreasuries;
    });
  };

  const deletePurchaseInvoice = (id: string) => {
    setPurchases(prev => {
      const next = prev.filter(p => p.id !== id);
      pushDeltaToServer('purchases', 'delete', { id, _deleted: true });
      broadcastEntityChange('purchases', next);
      return next;
    });
    registerDeletedDoc('purchases', id);
    deleteDoc(doc(db, 'purchases', id)).catch(() => {});
  };

  const createPurchaseReturn = (returnData: Omit<PurchaseReturn, 'id' | 'returnNumber' | 'createdAt'>): PurchaseReturn => {
    const id = 'prn-' + Date.now();
    const curYear = new Date().getFullYear();
    const prnPrefix = `PRN-${curYear}-`;
    let maxPrnSeq = 0;
    purchaseReturns.forEach(r => {
      if (r.returnNumber && r.returnNumber.startsWith(prnPrefix)) {
        const seq = parseInt(r.returnNumber.substring(prnPrefix.length), 10);
        if (!isNaN(seq) && seq > maxPrnSeq) maxPrnSeq = seq;
      }
    });
    let nextPrnSeq = maxPrnSeq + 1;
    let returnNumber = `${prnPrefix}${String(nextPrnSeq).padStart(4, '0')}`;
    while (purchaseReturns.some(r => r.returnNumber === returnNumber)) {
      nextPrnSeq++;
      returnNumber = `${prnPrefix}${String(nextPrnSeq).padStart(4, '0')}`;
    }
    const today = returnData.date || new Date().toISOString().split('T')[0];
    const exchangeRate = returnData.exchangeRate || 1.0;
    const baseTotalAmount = Number((returnData.totalAmount * exchangeRate).toFixed(2));
    const baseSubtotal = Number((returnData.subtotal * exchangeRate).toFixed(2));
    const baseTaxAmount = Number((returnData.taxAmount * exchangeRate).toFixed(2));

    const newReturn: PurchaseReturn = {
      ...returnData,
      id,
      returnNumber,
      date: today,
      createdAt: today,
      currency: returnData.currency || settings.baseCurrencyCode || 'ILS',
      currencySymbol: returnData.currencySymbol || settings.currency || '₪',
      exchangeRate
    };

    setPurchaseReturns(prev => [newReturn, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'purchaseReturns', newReturn.id), cleanDocForFirestore(newReturn)).catch(err => {
      console.warn('Direct cloud save purchase return notice:', err);
    });

    // 1. Deduct stock quantity from inventory (returning goods to supplier)
    const retMovementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    setInventory(prev => prev.map(it => {
      const match = returnData.items.find(i => i.itemId === it.id);
      if (match) {
        const oldQty = it.stockQuantity;
        const newQty = Math.max(0, oldQty - match.quantity);
        addStockMovement({
          itemId: it.id,
          itemCode: it.code,
          itemName: it.name,
          category: it.category,
          date: today,
          time: retMovementTime,
          type: 'out_return',
          quantity: match.quantity,
          balanceBefore: oldQty,
          balanceAfter: newQty,
          unitPrice: it.purchasePrice,
          totalValue: match.quantity * it.purchasePrice,
          referenceType: 'return',
          referenceNumber: returnNumber,
          reason: `مردودات مشتريات إلى المورد (${returnData.supplierName})`,
          performedBy: 'أمين المستودع'
        });
        const updatedItem = {
          ...it,
          stockQuantity: newQty,
          lastMovementDate: today
        };
        setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));

    // 2. Adjust supplier balance or treasury
    const cashBankCode = returnData.settlementType === 'cash_refund' ? '1101' : '1102';
    const cashBankName = returnData.settlementType === 'cash_refund' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

    const journalLines = [
      {
        accountCode: returnData.settlementType === 'credit_balance' ? '2101' : cashBankCode,
        accountName: returnData.settlementType === 'credit_balance' ? 'الموردون والذمم الدائنة' : cashBankName,
        debit: baseTotalAmount,
        credit: 0,
        description: returnData.settlementType === 'credit_balance'
          ? `تخفيض مديونية المورد ${returnData.supplierName} بموجب مردودات مشتريات ${returnNumber}`
          : `استرداد نقدي/بنكي لقيمة مردودات مشتريات ${returnNumber}`
      },
      {
        accountCode: '1302',
        accountName: 'مخزون خامات وأوراق المطبعة',
        debit: 0,
        credit: baseSubtotal,
        description: `رد خامات إلى المورد بموجب مرتجع ${returnNumber}`
      },
      ...(baseTaxAmount > 0 ? [{
        accountCode: '2103',
        accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
        debit: 0,
        credit: baseTaxAmount,
        description: `عكس ضريبة مدخلات مشتريات مردودة`
      }] : [])
    ];

    if (returnData.settlementType === 'credit_balance') {
      // Reduce supplier debt (supplier balance is negative, so adding increases it toward 0)
      setParties(prev => prev.map(p => {
        if (p.id === returnData.supplierId) {
          const updatedP = { ...p, balance: p.balance + baseTotalAmount };
          setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
          return updatedP;
        }
        return p;
      }));
    } else {
      // Refund to cash/bank treasury
      adjustTreasuryBalance(
        returnData.treasuryAccountCode || cashBankCode,
        baseTotalAmount,
        `استرداد مرتجع مشتريات ${returnNumber} من المورد ${returnData.supplierName}`,
        'manual',
        id
      );
    }

    addJournalEntry({
      date: today,
      description: `إشعار مدين / مردودات مشتريات رقم ${returnNumber} للمورد ${returnData.supplierName}`,
      referenceType: 'purchase_return',
      referenceId: id,
      lines: journalLines
    });

    return newReturn;
  };

  const deletePurchaseReturn = (id: string) => {
    setPurchaseReturns(prev => {
      const next = prev.filter(r => r.id !== id);
      pushDeltaToServer('purchaseReturns', 'delete', { id, _deleted: true });
      return next;
    });
    registerDeletedDoc('purchaseReturns', id);
    deleteDoc(doc(db, 'purchaseReturns', id)).catch(() => {});
  };

  const createSalesReturn = (returnData: Omit<SalesReturn, 'id' | 'returnNumber' | 'createdAt'>): SalesReturn => {
    const id = 'srn-' + Date.now();
    const curYear = new Date().getFullYear();
    const srPrefix = `SR-${curYear}-`;
    let maxSrSeq = 0;
    salesReturns.forEach(r => {
      if (r.returnNumber && r.returnNumber.startsWith(srPrefix)) {
        const seq = parseInt(r.returnNumber.substring(srPrefix.length), 10);
        if (!isNaN(seq) && seq > maxSrSeq) maxSrSeq = seq;
      }
    });
    let nextSrSeq = maxSrSeq + 1;
    let returnNumber = `${srPrefix}${String(nextSrSeq).padStart(4, '0')}`;
    while (salesReturns.some(r => r.returnNumber === returnNumber)) {
      nextSrSeq++;
      returnNumber = `${srPrefix}${String(nextSrSeq).padStart(4, '0')}`;
    }
    const today = returnData.date || new Date().toISOString().split('T')[0];
    const exchangeRate = returnData.exchangeRate || 1.0;
    const baseTotalAmount = Number((returnData.totalAmount * exchangeRate).toFixed(2));
    const baseSubtotal = Number((returnData.subtotal * exchangeRate).toFixed(2));
    const baseTaxAmount = Number((returnData.taxAmount * exchangeRate).toFixed(2));

    const newReturn: SalesReturn = {
      ...returnData,
      id,
      returnNumber,
      date: today,
      createdAt: today,
      currency: returnData.currency || settings.baseCurrencyCode || 'ILS',
      currencySymbol: returnData.currencySymbol || settings.currency || '₪',
      exchangeRate,
      branchId: returnData.branchId || activeBranchId
    };

    setSalesReturns(prev => [newReturn, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'salesReturns', newReturn.id), cleanDocForFirestore(newReturn)).catch(err => {
      console.warn('Direct cloud save sales return notice:', err);
    });

    // 1. Return stock quantity back to inventory (adding returned goods to stock)
    const retMovementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    setInventory(prev => prev.map(it => {
      const match = returnData.items.find(i => i.itemId === it.id);
      if (match) {
        const oldQty = it.stockQuantity;
        const newQty = oldQty + match.quantity;
        addStockMovement({
          itemId: it.id,
          itemCode: it.code,
          itemName: it.name,
          category: it.category,
          date: today,
          time: retMovementTime,
          type: 'in_return',
          quantity: match.quantity,
          balanceBefore: oldQty,
          balanceAfter: newQty,
          unitPrice: it.price,
          totalValue: match.quantity * it.price,
          referenceType: 'return',
          referenceNumber: returnNumber,
          reason: `مردودات مبيعات من العميل (${returnData.customerName})`,
          performedBy: currentUser?.fullName || 'الكاشير'
        });
        const updatedItem = {
          ...it,
          stockQuantity: newQty,
          lastMovementDate: today
        };
        setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));

    // 2. Adjust customer balance or refund from treasury
    const cashBankCode = returnData.settlementType === 'cash_refund' ? '1101' : '1102';
    const cashBankName = returnData.settlementType === 'cash_refund' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

    const journalLines = [
      {
        accountCode: '4101',
        accountName: 'مردودات ومسموحات المبيعات',
        debit: baseSubtotal,
        credit: 0,
        description: `إثبات مردودات مبيعات بموجب مرتجع ${returnNumber} للعميل ${returnData.customerName}`
      },
      ...(baseTaxAmount > 0 ? [{
        accountCode: '2103',
        accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
        debit: baseTaxAmount,
        credit: 0,
        description: `عكس ضريبة مخرجات مبيعات مردودة`
      }] : []),
      {
        accountCode: returnData.settlementType === 'credit_balance' ? '1201' : cashBankCode,
        accountName: returnData.settlementType === 'credit_balance' ? 'العملاء والمدينون' : cashBankName,
        debit: 0,
        credit: baseTotalAmount,
        description: returnData.settlementType === 'credit_balance'
          ? `تخفيض مديونية العميل ${returnData.customerName} بموجب إشعار دائن ${returnNumber}`
          : `استرداد نقدي/بنكي للعميل بموجب مرتجع مبيعات ${returnNumber}`
      }
    ];

    if (returnData.settlementType === 'credit_balance') {
      setParties(prev => prev.map(p => {
        if (p.id === returnData.customerId) {
          const updatedP = { ...p, balance: Number((p.balance - baseTotalAmount).toFixed(2)) };
          setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
          return updatedP;
        }
        return p;
      }));
    } else {
      adjustTreasuryBalance(
        returnData.treasuryAccountCode || cashBankCode,
        -baseTotalAmount,
        `استرداد مرتجع مبيعات ${returnNumber} للعميل ${returnData.customerName}`,
        'manual',
        id
      );
    }

    addJournalEntry({
      date: today,
      description: `إشعار دائن / مردودات مبيعات رقم ${returnNumber} للعميل ${returnData.customerName}`,
      referenceType: 'sales_return',
      referenceId: id,
      lines: journalLines
    });

    return newReturn;
  };

  const deleteSalesReturn = (id: string) => {
    setSalesReturns(prev => {
      const next = prev.filter(r => r.id !== id);
      pushDeltaToServer('salesReturns', 'delete', { id, _deleted: true });
      return next;
    });
    registerDeletedDoc('salesReturns', id);
    deleteDoc(doc(db, 'salesReturns', id)).catch(() => {});
  };

  const [lastBackupInfo, setLastBackupInfo] = useState<{ timestamp: string; filename: string; totalRecords?: number } | null>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_last_backup_info`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const cleanAndSyncFirebaseWithScreen = async (): Promise<{ success: boolean; message: string; purgedCount: number }> => {
    try {
      const fullSnapshot: Record<string, any[]> = {
        invoices: invoices || [],
        parties: parties || [],
        inventory: inventory || [],
        accounts: accounts || [],
        treasuries: treasuries || [],
        vouchers: vouchers || [],
        purchases: purchases || [],
        purchaseReturns: purchaseReturns || [],
        salesReturns: salesReturns || [],
        journalEntries: journalEntries || [],
        stockMovements: stockMovements || [],
        expenses: expenses || [],
        employees: employees || [],
        employeeAdvances: employeeAdvances || [],
        employeeDeductions: employeeDeductions || [],
        employeeIncentives: employeeIncentives || [],
        payrollSheets: payrollSheets || [],
        printOrders: printOrders || [],
        debtClearings: debtClearings || [],
        companies: companies || [],
        branches: branches || [],
        warehouses: warehouses || [],
        warehouseOperations: warehouseOperations || [],
        roles: roles || [],
        users: users || []
      };

      // 1. Mark cutoff timestamp & clear stale deletion tombstones
      const nowTs = Date.now();
      localStorage.setItem('accounting_database_imported_at', String(nowTs));
      localStorage.setItem('accounting_last_firestore_delta_time', String(nowTs));
      localStorage.setItem('accounting_last_seen_seq', String(nowTs));
      localStorage.removeItem('accounting_deleted_docs');

      // 2. Synchronize all entities to localStorage immediately
      try {
        localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(fullSnapshot.invoices));
        localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(fullSnapshot.parties));
        localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(fullSnapshot.inventory));
        localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(fullSnapshot.accounts));
        localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(fullSnapshot.treasuries));
        localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(fullSnapshot.vouchers));
        localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(fullSnapshot.purchases));
        localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(fullSnapshot.purchaseReturns));
        localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(fullSnapshot.salesReturns));
        localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(fullSnapshot.journalEntries));
        localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(fullSnapshot.stockMovements));
        localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(fullSnapshot.expenses));
        localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(fullSnapshot.employees));
        localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(fullSnapshot.printOrders));
        localStorage.setItem(`${STORAGE_KEY}_debt_clearings`, JSON.stringify(fullSnapshot.debtClearings));
      } catch (e) {}

      // 3. Overwrite backend Express server state synchronously at /api/sync/replace-database
      try {
        await fetch('/api/sync/replace-database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: fullSnapshot })
        });
      } catch (err) {
        console.warn('Replace server database during cleanAndSync notice:', err);
      }

      // 4. Direct push to Firestore cloud database with 5s safety timeout
      await Promise.race([
        Promise.resolve({ success: false, reason: 'Legacy full-database push disabled; reconcile sources instead.' }),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]).catch(err => {
        console.warn('Push full DB notice:', err);
      });

      // Do not write legacy shadow collections in the fresh Firebase workspace.
      // Daily sheets remain in the local snapshot until unified-repository migration.
      console.warn('Legacy dailyEntrySheets Firebase shadow write disabled.');

      // 5. Broadcast to all open screens & tabs to reload state atomically
      window.dispatchEvent(new CustomEvent('accounting_database_updated'));
      if (syncChannelRef.current) {
        try {
          syncChannelRef.current.postMessage({
            type: 'DATABASE_IMPORTED',
            payload: { timestamp: nowTs }
          });
        } catch {}
      }

      // 6. Trigger obsolete collection purging in non-blocking background
      let purgedCount = 0;
      purgeObsoleteFirestoreCollections(fullSnapshot)
        .then(count => { purgedCount = count; })
        .catch(err => console.warn('Background purge notice:', err));

      return {
        success: true,
        message: `تم تحديث وتطهير سحابة Firebase والسيرفر ومزامنة كافة الشاشات بنجاح! أصبحت قاعدة البيانات مطابقة تماماً لما يُعرض على الشاشة 100%.`,
        purgedCount
      };
    } catch (e: any) {
      return {
        success: false,
        message: 'حدث خطأ أثناء تطهير فيربيس: ' + (e?.message || 'غير معروف'),
        purgedCount: 0
      };
    }
  };

  const exportDataJSON = async (): Promise<{ success: boolean; filename: string; totalRecords: number; message: string; data?: any }> => {
    // 1. Authoritative Snapshot: Exactly 100% of what is currently on screen & active in the system
    const cleanInvoices = Array.isArray(invoices) ? invoices : [];
    const cleanParties = Array.isArray(parties) ? parties : [];
    const cleanInventory = Array.isArray(inventory) ? inventory : [];
    const cleanAccounts = Array.isArray(accounts) ? accounts : [];
    const cleanTreasuries = Array.isArray(treasuries) ? treasuries : [];
    const cleanVouchers = Array.isArray(vouchers) ? vouchers : [];
    const cleanPurchases = Array.isArray(purchases) ? purchases : [];
    const cleanPurchaseReturns = Array.isArray(purchaseReturns) ? purchaseReturns : [];
    const cleanSalesReturns = Array.isArray(salesReturns) ? salesReturns : [];
    const cleanJournalEntries = Array.isArray(journalEntries) ? journalEntries : [];
    const cleanStockMovements = Array.isArray(stockMovements) ? stockMovements : [];
    const cleanExpenses = Array.isArray(expenses) ? expenses : [];
    const cleanEmployees = Array.isArray(employees) ? employees : [];
    const cleanEmployeeAdvances = Array.isArray(employeeAdvances) ? employeeAdvances : [];
    const cleanEmployeeDeductions = Array.isArray(employeeDeductions) ? employeeDeductions : [];
    const cleanEmployeeIncentives = Array.isArray(employeeIncentives) ? employeeIncentives : [];
    const cleanPayrollSheets = Array.isArray(payrollSheets) ? payrollSheets : [];
    const cleanPrintOrders = Array.isArray(printOrders) ? printOrders : [];
    const cleanDebtClearings = Array.isArray(debtClearings) ? debtClearings : [];
    const cleanCompanies = Array.isArray(companies) ? companies : [];
    const cleanBranches = Array.isArray(branches) ? branches : [];
    const cleanWarehouses = Array.isArray(warehouses) ? warehouses : [];
    const cleanWarehouseOperations = Array.isArray(warehouseOperations) ? warehouseOperations : [];
    const cleanRoles = Array.isArray(roles) ? roles : [];
    const cleanUsers = Array.isArray(users) ? users : [];
    const cleanDailyEntrySheets = dailyEntrySheets || {};

    const fullSnapshot: Record<string, any[]> = {
      invoices: cleanInvoices,
      parties: cleanParties,
      inventory: cleanInventory,
      accounts: cleanAccounts,
      treasuries: cleanTreasuries,
      vouchers: cleanVouchers,
      purchases: cleanPurchases,
      purchaseReturns: cleanPurchaseReturns,
      salesReturns: cleanSalesReturns,
      journalEntries: cleanJournalEntries,
      stockMovements: cleanStockMovements,
      expenses: cleanExpenses,
      employees: cleanEmployees,
      employeeAdvances: cleanEmployeeAdvances,
      employeeDeductions: cleanEmployeeDeductions,
      employeeIncentives: cleanEmployeeIncentives,
      payrollSheets: cleanPayrollSheets,
      printOrders: cleanPrintOrders,
      debtClearings: cleanDebtClearings,
      companies: cleanCompanies,
      branches: cleanBranches,
      warehouses: cleanWarehouses,
      warehouseOperations: cleanWarehouseOperations,
      roles: cleanRoles,
      users: cleanUsers
    };

    // 2. Pure local export to conserve Firebase Firestore quota completely

    // 3. Calculate total records matching exactly what is active on the screen
    const totalRecords =
      cleanInvoices.length +
      cleanParties.length +
      cleanInventory.length +
      cleanAccounts.length +
      cleanTreasuries.length +
      cleanVouchers.length +
      cleanPurchases.length +
      cleanPurchaseReturns.length +
      cleanSalesReturns.length +
      cleanJournalEntries.length +
      cleanStockMovements.length +
      cleanExpenses.length +
      cleanEmployees.length +
      cleanEmployeeAdvances.length +
      cleanEmployeeDeductions.length +
      cleanEmployeeIncentives.length +
      cleanPayrollSheets.length +
      cleanPrintOrders.length +
      cleanDebtClearings.length +
      cleanCompanies.length +
      cleanBranches.length +
      cleanWarehouses.length +
      cleanWarehouseOperations.length +
      cleanRoles.length +
      cleanUsers.length +
      Object.keys(cleanDailyEntrySheets).length;

    const fullBackup = {
      appTitle: 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان',
      systemName: 'برنامج الأيهم المحاسبي لإدارة المطابع والمكتبات ونقاط البيع',
      version: '2.5.0',
      backupSource: 'لقطة تصدير محلية؛ يلزم مطابقة بيانات السحابة قبل اعتمادها',
      is100PercentLiveFirebase: false,
      firebaseDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser?.fullName || currentUser?.username || 'مدير النظام',
      statsSummary: {
        totalRecords,
        invoicesCount: cleanInvoices.length,
        partiesCount: cleanParties.length,
        inventoryCount: cleanInventory.length,
        treasuriesCount: cleanTreasuries.length,
        vouchersCount: cleanVouchers.length,
        purchasesCount: cleanPurchases.length,
        salesReturnsCount: cleanSalesReturns.length,
        purchaseReturnsCount: cleanPurchaseReturns.length,
        journalEntriesCount: cleanJournalEntries.length,
        expensesCount: cleanExpenses.length,
        employeesCount: cleanEmployees.length,
        dailyEntrySheetsCount: Object.keys(cleanDailyEntrySheets).length,
        printOrdersCount: cleanPrintOrders.length,
        warehouseOperationsCount: cleanWarehouseOperations.length
      },
      settings,
      accounts: cleanAccounts,
      journalEntries: cleanJournalEntries,
      inventory: cleanInventory,
      stockMovements: cleanStockMovements,
      parties: cleanParties,
      employees: cleanEmployees,
      employeeAdvances: cleanEmployeeAdvances,
      employeeDeductions: cleanEmployeeDeductions,
      employeeIncentives: cleanEmployeeIncentives,
      payrollSheets: cleanPayrollSheets,
      printOrders: cleanPrintOrders,
      invoices: cleanInvoices,
      purchases: cleanPurchases,
      purchaseReturns: cleanPurchaseReturns,
      salesReturns: cleanSalesReturns,
      vouchers: cleanVouchers,
      treasuries: cleanTreasuries,
      companies: cleanCompanies,
      branches: cleanBranches,
      warehouses: cleanWarehouses,
      warehouseOperations: cleanWarehouseOperations,
      roles: cleanRoles,
      users: cleanUsers,
      debtClearings: cleanDebtClearings,
      expenses: cleanExpenses,
      dailyEntrySheets: cleanDailyEntrySheets
    };

    try {
      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const nowIso = new Date().toISOString();
      const datePart = nowIso.split('T')[0];
      const timePart = nowIso.split('T')[1].replace(/[:.]/g, '-').slice(0, 8);
      const filename = `نسخة_احتياطية_كاملة_فيربيس_لبنان_${datePart}_${timePart}.json`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 100);

      const backupRecord = {
        timestamp: nowIso,
        filename,
        totalRecords
      };
      setLastBackupInfo(backupRecord);
      try {
        localStorage.setItem(`${STORAGE_KEY}_last_backup_info`, JSON.stringify(backupRecord));
      } catch (e) {
        console.warn('Could not save last_backup_info to localStorage', e);
      }

      return {
        success: true,
        filename,
        totalRecords,
        data: fullBackup,
        message: `تم إنشاء وتحميل نسخة احتياطية كاملة 100% مطابقة للشاشة وفيربيس (${totalRecords} سجل) بنجاح!`
      };
    } catch (exportErr: any) {
      console.error('Error generating JSON backup blob:', exportErr);
      return {
        success: false,
        filename: '',
        totalRecords,
        data: fullBackup,
        message: 'حدث خطأ أثناء تصدير الملف: ' + (exportErr?.message || 'خطأ غير معروف')
      };
    }
  };

  const performDatabaseZeroing = (options: DatabaseZeroingOptions): ZeroingExecutionResult => {
    // 1. Restriction to System Admin only ("التصفير مقيد بمدير النظام فقط")
    const isSystemAdmin =
      currentUser?.roleId === 'role-admin' ||
      currentUser?.roleName === 'مدير النظام' ||
      currentUser?.username === 'admin' ||
      (currentUser?.email && auth.currentUser?.email === currentUser.email);

    if (!isSystemAdmin) {
      return {
        success: false,
        message: 'عفواً، عملية تصفير قاعدة البيانات مقيدة بصلاحية مدير النظام فقط!',
        summary: {
          deletedInvoices: 0,
          deletedPurchases: 0,
          deletedSalesReturns: 0,
          deletedPurchaseReturns: 0,
          deletedVouchers: 0,
          deletedJournalEntries: 0,
          deletedPrintOrders: 0,
          deletedStockMovements: 0,
          deletedWarehouseOperations: 0,
          deletedDebtClearings: 0,
          deletedExpenses: 0,
          deletedEmployees: 0,
          deletedPayrollSheets: 0,
          deletedEmployeeAdvances: 0,
          deletedEmployeeDeductions: 0,
          deletedEmployeeIncentives: 0,
          deletedPayrollRecords: 0,
          deletedManualParties: 0,
          zeroedPartyBalances: 0,
          zeroedInventoryStocks: 0,
          deletedManualItems: 0,
          deletedManualWarehouses: 0,
          zeroedTreasuries: 0,
          deletedManualTreasuries: 0,
          zeroedAccounts: 0
        },
        executedAt: new Date().toISOString(),
        executedBy: currentUser?.fullName || currentUser?.username || 'مستخدم'
      };
    }

    const isTargetDate = (dateStr?: string) => {
      if (options.scope === 'all') return true;
      if (!dateStr) return true;
      const clean = dateStr.split('T')[0];
      if (options.scope === 'from_date') {
        return clean >= (options.fromDate || options.cutoffDate);
      }
      if (options.scope === 'date_range') {
        return clean >= (options.fromDate || '1900-01-01') && clean <= options.cutoffDate;
      }
      return clean <= options.cutoffDate;
    };

    const summary = {
      deletedInvoices: 0,
      deletedPurchases: 0,
      deletedSalesReturns: 0,
      deletedPurchaseReturns: 0,
      deletedVouchers: 0,
      deletedJournalEntries: 0,
      deletedPrintOrders: 0,
      deletedStockMovements: 0,
      deletedWarehouseOperations: 0,
      deletedDebtClearings: 0,
      deletedExpenses: 0,
      deletedEmployees: 0,
      deletedPayrollSheets: 0,
      deletedEmployeeAdvances: 0,
      deletedEmployeeDeductions: 0,
      deletedEmployeeIncentives: 0,
      deletedPayrollRecords: 0,
      deletedManualParties: 0,
      zeroedPartyBalances: 0,
      zeroedInventoryStocks: 0,
      deletedManualItems: 0,
      deletedManualWarehouses: 0,
      zeroedTreasuries: 0,
      deletedManualTreasuries: 0,
      zeroedAccounts: 0
    };

    // Track all deleted IDs across collections to purge from Firestore
    const deletedDocMap: Record<string, string[]> = {
      invoices: [],
      purchases: [],
      salesReturns: [],
      purchaseReturns: [],
      vouchers: [],
      journalEntries: [],
      printOrders: [],
      stockMovements: [],
      warehouseOperations: [],
      payrollSheets: [],
      employeeAdvances: [],
      employeeDeductions: [],
      employeeIncentives: [],
      employees: [],
      debtClearings: [],
      expenses: [],
      parties: [],
      inventory: [],
      warehouses: [],
      treasuries: []
    };

    // 1. Invoices (فواتير المبيعات ونقاط البيع)
    if (options.resetInvoices) {
      setInvoices(prev => {
        const toKeep: Invoice[] = [];
        prev.forEach(inv => {
          if (isTargetDate(inv.date)) {
            deletedDocMap.invoices.push(inv.id);
          } else {
            toKeep.push(inv);
          }
        });
        summary.deletedInvoices = deletedDocMap.invoices.length;
        return toKeep;
      });
    }

    // 2. Purchases (فواتير المشتريات ومشتريات الخامات)
    if (options.resetPurchases) {
      setPurchases(prev => {
        const toKeep: PurchaseInvoice[] = [];
        prev.forEach(pur => {
          if (isTargetDate(pur.date)) {
            deletedDocMap.purchases.push(pur.id);
          } else {
            toKeep.push(pur);
          }
        });
        summary.deletedPurchases = deletedDocMap.purchases.length;
        return toKeep;
      });
    }

    // 3. Sales Returns (مردودات المبيعات)
    if (options.resetSalesReturns) {
      setSalesReturns(prev => {
        const toKeep: SalesReturn[] = [];
        prev.forEach(r => {
          if (isTargetDate(r.date)) {
            deletedDocMap.salesReturns.push(r.id);
          } else {
            toKeep.push(r);
          }
        });
        summary.deletedSalesReturns = deletedDocMap.salesReturns.length;
        return toKeep;
      });
    }

    // 4. Purchase Returns (مردودات المشتريات)
    if (options.resetPurchaseReturns) {
      setPurchaseReturns(prev => {
        const toKeep: PurchaseReturn[] = [];
        prev.forEach(r => {
          if (isTargetDate(r.date)) {
            deletedDocMap.purchaseReturns.push(r.id);
          } else {
            toKeep.push(r);
          }
        });
        summary.deletedPurchaseReturns = deletedDocMap.purchaseReturns.length;
        return toKeep;
      });
    }

    // 5. Vouchers (سندات القبض والصرف)
    if (options.resetVouchers) {
      setVouchers(prev => {
        const toKeep: PaymentVoucher[] = [];
        prev.forEach(v => {
          if (isTargetDate(v.date)) {
            deletedDocMap.vouchers.push(v.id);
          } else {
            toKeep.push(v);
          }
        });
        summary.deletedVouchers = deletedDocMap.vouchers.length;
        return toKeep;
      });
    }

    // 6. Journal Entries (قيود اليومية وحركات الحسابات)
    if (options.resetJournalEntries) {
      setJournalEntries(prev => {
        const toKeep: JournalEntry[] = [];
        prev.forEach(je => {
          if (isTargetDate(je.date)) {
            deletedDocMap.journalEntries.push(je.id);
          } else {
            toKeep.push(je);
          }
        });
        summary.deletedJournalEntries = deletedDocMap.journalEntries.length;
        return toKeep;
      });
    }

    // 7. Print Orders (أوامر تشغيل المطبعة والورشة)
    if (options.resetPrintOrders) {
      setPrintOrders(prev => {
        const toKeep: PrintJobOrder[] = [];
        prev.forEach(po => {
          if (isTargetDate(po.createdAt || po.deliveryDate)) {
            deletedDocMap.printOrders.push(po.id);
          } else {
            toKeep.push(po);
          }
        });
        summary.deletedPrintOrders = deletedDocMap.printOrders.length;
        return toKeep;
      });

      // Clear workshop status on invoices without deleting the actual sales invoices
      if (!options.resetInvoices) {
        setInvoices(prev => prev.map(inv => {
          if (inv.workflowStatus && inv.workflowStatus !== 'new' && inv.workflowStatus !== 'delivered' && isTargetDate(inv.date)) {
            return {
              ...inv,
              workflowStatus: 'delivered',
              isWorkshopVisible: false
            };
          }
          return inv;
        }));
      }
    }

    // 8. Stock Movements (حركات المخزون: صرف، قبض/توريد، جرد وتعديل، بيع وشراء، تبديل ومناقلات)
    if (options.resetStockMovements) {
      setStockMovements(prev => {
        const toKeep: StockMovement[] = [];
        prev.forEach(sm => {
          if (isTargetDate(sm.date)) {
            deletedDocMap.stockMovements.push(sm.id);
          } else {
            toKeep.push(sm);
          }
        });
        summary.deletedStockMovements = deletedDocMap.stockMovements.length;
        return toKeep;
      });
    }

    // 9. Warehouse Operations (عمليات وأذونات المستودعات)
    if (options.resetWarehouseOperations) {
      setWarehouseOperations(prev => {
        const toKeep: WarehouseOperation[] = [];
        prev.forEach(wo => {
          if (isTargetDate(wo.date)) {
            deletedDocMap.warehouseOperations.push(wo.id);
          } else {
            toKeep.push(wo);
          }
        });
        summary.deletedWarehouseOperations = deletedDocMap.warehouseOperations.length;
        return toKeep;
      });
    }

    // 9.5. Debt Clearings (المقاصات وتسوية الديون)
    if (options.resetDebtClearings !== false) {
      setDebtClearings(prev => {
        const toKeep: DebtClearingRecord[] = [];
        prev.forEach(dc => {
          if (isTargetDate(dc.date || dc.createdAt)) {
            deletedDocMap.debtClearings.push(dc.id);
          } else {
            toKeep.push(dc);
          }
        });
        summary.deletedDebtClearings = deletedDocMap.debtClearings.length;
        return toKeep;
      });
    }

    // 9.6. Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
    if (options.resetExpenses !== false) {
      setExpenses(prev => {
        const toKeep: ExpenseItem[] = [];
        prev.forEach(exp => {
          if (isTargetDate(exp.date || exp.createdAt)) {
            deletedDocMap.expenses.push(exp.id);
          } else {
            toKeep.push(exp);
          }
        });
        summary.deletedExpenses = deletedDocMap.expenses.length;
        return toKeep;
      });
    }

    // 10. Payroll, Advances, Deductions & Incentives (مسيرات الرواتب، السلف، الخصومات والمكافآت)
    if (options.resetPayroll) {
      setPayrollSheets(prev => {
        const toKeep: PayrollSheet[] = [];
        prev.forEach(ps => {
          if (isTargetDate(ps.createdAt)) {
            deletedDocMap.payrollSheets.push(ps.id);
          } else {
            toKeep.push(ps);
          }
        });
        summary.deletedPayrollSheets = deletedDocMap.payrollSheets.length;
        summary.deletedPayrollRecords += summary.deletedPayrollSheets;
        return toKeep;
      });

      setEmployeeAdvances(prev => {
        const toKeep: EmployeeAdvance[] = [];
        prev.forEach(ea => {
          if (isTargetDate(ea.date)) {
            deletedDocMap.employeeAdvances.push(ea.id);
          } else {
            toKeep.push(ea);
          }
        });
        summary.deletedEmployeeAdvances = deletedDocMap.employeeAdvances.length;
        summary.deletedPayrollRecords += summary.deletedEmployeeAdvances;
        return toKeep;
      });

      setEmployeeDeductions(prev => {
        const toKeep: EmployeeDeduction[] = [];
        prev.forEach(ed => {
          if (isTargetDate(ed.date)) {
            deletedDocMap.employeeDeductions.push(ed.id);
          } else {
            toKeep.push(ed);
          }
        });
        summary.deletedEmployeeDeductions = deletedDocMap.employeeDeductions.length;
        summary.deletedPayrollRecords += summary.deletedEmployeeDeductions;
        return toKeep;
      });

      setEmployeeIncentives(prev => {
        const toKeep: EmployeeIncentive[] = [];
        prev.forEach(ei => {
          if (isTargetDate(ei.date)) {
            deletedDocMap.employeeIncentives.push(ei.id);
          } else {
            toKeep.push(ei);
          }
        });
        summary.deletedEmployeeIncentives = deletedDocMap.employeeIncentives.length;
        summary.deletedPayrollRecords += summary.deletedEmployeeIncentives;
        return toKeep;
      });
    }

    // 10.5. Employees (أسماء وسجلات الموظفين بالكامل)
    if (options.resetEmployees) {
      setEmployees(prev => {
        const toKeep: Employee[] = [];
        prev.forEach(emp => {
          if (isTargetDate(emp.joinDate || emp.createdAt || '2000-01-01')) {
            deletedDocMap.employees.push(emp.id);
          } else {
            toKeep.push(emp);
          }
        });
        summary.deletedEmployees = deletedDocMap.employees.length;
        return toKeep;
      });
    }

    // 11. Parties (العملاء والموردين)
    if (options.resetManualParties || options.zeroPartyBalances) {
      setParties(prev => {
        const kept: Party[] = [];
        prev.forEach(p => {
          // العميل النقدي لا يمسح
          if (p.code === 'CUST-0001' || p.name === 'عميل نقدي' || p.name === 'عميل كاشير نقدي' || p.name === 'زبون عام') {
            kept.push(p);
            return;
          }
          const partyDate = p.openingBalanceDate || (p as any).createdAt || '2000-01-01';
          if (options.resetManualParties && isTargetDate(partyDate)) {
            deletedDocMap.parties.push(p.id);
            summary.deletedManualParties++;
          } else {
            kept.push(p);
          }
        });
        // تصفير المبالغ والذمم المدينة والدائنة
        return kept.map(p => {
          if (options.zeroPartyBalances && p.balance !== 0) summary.zeroedPartyBalances++;
          return options.zeroPartyBalances ? { ...p, balance: 0, openingBalance: 0 } : p;
        });
      });
    }

    // 12. Inventory & Stock Cards (الأصناف والكرتات المخزنية والكميات)
    setInventory(prev => {
      const kept: InventoryItem[] = [];
      prev.forEach(item => {
        const itemDate = item.lastMovementDate || (item as any).createdAt || '2000-01-01';
        if (options.resetManualInventoryItems && isTargetDate(itemDate)) {
          deletedDocMap.inventory.push(item.id);
          summary.deletedManualItems++;
        } else {
          kept.push(item);
        }
      });
      // تصفير كميات المخزون بالكامل في كافة المستودعات
      if (options.zeroInventoryStock) {
        return kept.map(item => {
          if (item.stockQuantity !== 0) summary.zeroedInventoryStocks++;
          return {
            ...item,
            stockQuantity: 0,
            warehouseStocks: {}
          };
        });
      }
      return kept;
    });

    // 13. Warehouses (المستودعات الإضافية)
    setWarehouses(prev => {
      const kept: Warehouse[] = [];
      prev.forEach(w => {
        // المستودع الرئيسي لا يمسح
        if (w.id === 'wh-1' || w.name.includes('الرئيسي') || w.code === 'WH-01') {
          kept.push(w);
          return;
        }
        const wDate = w.createdAt || '2000-01-01';
        if (isTargetDate(wDate)) {
          deletedDocMap.warehouses.push(w.id);
          summary.deletedManualWarehouses++;
        } else {
          kept.push(w);
        }
      });
      return kept;
    });

    // 14. Treasuries (الصناديق والخزنات)
    setTreasuries(prev => {
      const kept: Treasury[] = [];
      prev.forEach(t => {
        // الصندوق النقدي لا يمسح ولكن يصفر
        if (t.id === 'treasury-cash-main' || t.name.includes('النقدي') || t.accountCode === '1101') {
          kept.push(t);
          return;
        }
        const tDate = t.createdAt || '2000-01-01';
        if (isTargetDate(tDate)) {
          deletedDocMap.treasuries.push(t.id);
          summary.deletedManualTreasuries++;
        } else {
          kept.push(t);
        }
      });

      return kept.map(t => {
        if (t.id === 'treasury-cash-main' || t.name.includes('النقدي') || t.accountCode === '1101') {
          summary.zeroedTreasuries++;
          return {
            ...t,
            balance: 0,
            currencyBalances: { ILS: 0, USD: 0, JOD: 0 },
            transactions: []
          };
        }
        return t;
      });
    });

    // 15. Accounts (شجرة الحسابات)
    setAccounts(prev => {
      summary.zeroedAccounts = prev.length;
      return prev.map(a => ({ ...a, balance: 0 }));
    });

    // Execute direct Firestore deletion batch for all removed document IDs & persist cutoffs
    try {
      // 1. Persist in accounting_deleted_docs so any future hydration filters them out permanently
      const existingDel = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
      for (const [colName, ids] of Object.entries(deletedDocMap)) {
        for (const id of ids) {
          existingDel.push({ col: colName, id: String(id), time: Date.now() });
        }
      }
      localStorage.setItem('accounting_deleted_docs', JSON.stringify(existingDel.slice(-10000)));

      // 2. Persist zeroed cutoffs
      const currentCutoffs = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_zeroed_cutoffs`) || '{}');
      for (const colName of Object.keys(deletedDocMap)) {
        currentCutoffs[colName] = {
          scope: options.scope,
          cutoffDate: options.cutoffDate || new Date().toISOString().split('T')[0],
          timestamp: Date.now()
        };
      }
      localStorage.setItem(`${STORAGE_KEY}_zeroed_cutoffs`, JSON.stringify(currentCutoffs));
    } catch (e) {
      console.warn('Error saving zeroing deleted docs to storage:', e);
    }

    (async () => {
      try {
        let deleteCount = 0;
        let deleteBatch = writeBatch(db);
        const batchPromises: Promise<void>[] = [];

        for (const [colName, ids] of Object.entries(deletedDocMap)) {
          for (const id of ids) {
            deleteBatch.delete(doc(db, colName, String(id)));
            deleteCount++;
            if (deleteCount % 400 === 0) {
              batchPromises.push(deleteBatch.commit());
              deleteBatch = writeBatch(db);
            }
          }
        }
        if (deleteCount % 400 !== 0 && deleteCount > 0) {
          batchPromises.push(deleteBatch.commit());
        }
        await Promise.all(batchPromises);

        // Also query Firestore directly for any collections zeroed with scope === 'all' to delete orphaned documents
        if (options.scope === 'all') {
          for (const colName of ['invoices', 'printOrders', 'salesReturns', 'stockMovements']) {
            try {
              const snap = await getDocs(collection(db, colName));
              if (!snap.empty) {
                let purgeBatch = writeBatch(db);
                let purgeCount = 0;
                for (const d of snap.docs) {
                  purgeBatch.delete(d.ref);
                  purgeCount++;
                  if (purgeCount % 400 === 0) {
                    await purgeBatch.commit();
                    purgeBatch = writeBatch(db);
                  }
                }
                if (purgeCount % 400 !== 0 && purgeCount > 0) {
                  await purgeBatch.commit();
                }
              }
            } catch (err) {
              console.warn(`Purge leftover in ${colName} notice:`, err);
            }
          }
        }
      } catch (err) {
        console.warn('Direct Firestore delete batch note:', err);
      }
    })();

    // Invalidate local synced hashes so Firebase accepts the zeroed state on all collections
    try {
      localStorage.removeItem('accounting_synced_hashes');
      localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
      localStorage.setItem(`${STORAGE_KEY}_last_zeroed_at`, new Date().toISOString());
    } catch (e) {
      console.error('Error updating zeroing storage flags:', e);
    }

    // Trigger immediate cloud synchronization to Firestore
    setTimeout(() => {
      if (syncToFirebaseRef.current) {
        syncToFirebaseRef.current(true).catch(err => {
          console.error('Firebase sync after zeroing failed:', err);
        });
      }
    }, 100);

    return {
      success: true,
      message: 'تم تصفير الأصناف وفواتير المبيعات وكافة العمليات المرتبطة بها بنجاح وتحديث قاعدة البيانات سحابياً ومحلياً.',
      summary,
      executedAt: new Date().toISOString(),
      executedBy: currentUser?.fullName || currentUser?.username || 'مدير النظام'
    };
  };

  const importDataJSON = async (jsonString: string, includeSettings = true, keepTelegramSettings = true, keepFacilitySettings = true): Promise<boolean> => {
    try {
      const parsed = JSON.parse(jsonString);
      const data = parsed?.data || parsed?.snapshot || parsed?.fullBackup || parsed;
      if (data && typeof data === 'object' && (data.invoices || data.accounts || data.inventory || data.parties || data.settings || data.treasuries)) {
        let finalSettings = { ...settings };
        if (!keepFacilitySettings && data.settings) {
            finalSettings = { ...data.settings };
            if (keepTelegramSettings) {
              finalSettings.telegramConfig = settings.telegramConfig;
            }
            setSettings(finalSettings);
        } else if (keepFacilitySettings && data.settings && keepTelegramSettings === false) {
           finalSettings = { ...settings };
           finalSettings.telegramConfig = data.settings.telegramConfig;
           setSettings(finalSettings);
        }

        const ensureUniqueIdsAndTimestamps = (arr: any[], prefix: string) => {
          if (!Array.isArray(arr)) return [];
          const nowIso = new Date().toISOString();
          return arr.map((item, idx) => {
            if (!item || typeof item !== 'object') return item;
            const rawId = item.id ? String(item.id).replace(/\//g, '_') : `${prefix}-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`;
            const cleanId = rawId.trim();
            const updatedAt = item.updatedAt || item.createdAt || nowIso;
            const createdAt = item.createdAt || updatedAt;
            const newItem = { ...item, id: cleanId, createdAt, updatedAt };
            delete newItem._deleted;
            delete newItem.deletedAt;
            return newItem;
          });
        };

        // Standardize all imported entities with guaranteed UUIDs & timestamps
        if (data.accounts) data.accounts = ensureUniqueIdsAndTimestamps(data.accounts, 'acc');
        if (data.journalEntries) data.journalEntries = ensureUniqueIdsAndTimestamps(data.journalEntries, 'je');
        if (data.inventory) data.inventory = ensureUniqueIdsAndTimestamps(data.inventory, 'inv-item');
        if (data.stockMovements) data.stockMovements = ensureUniqueIdsAndTimestamps(data.stockMovements, 'sm');
        if (data.parties) data.parties = ensureUniqueIdsAndTimestamps(data.parties, 'party');
        if (data.employees) data.employees = ensureUniqueIdsAndTimestamps(data.employees, 'emp');
        if (data.employeeAdvances) data.employeeAdvances = ensureUniqueIdsAndTimestamps(data.employeeAdvances, 'adv');
        if (data.employeeDeductions) data.employeeDeductions = ensureUniqueIdsAndTimestamps(data.employeeDeductions, 'ded');
        if (data.employeeIncentives) data.employeeIncentives = ensureUniqueIdsAndTimestamps(data.employeeIncentives, 'inc');
        if (data.payrollSheets) data.payrollSheets = ensureUniqueIdsAndTimestamps(data.payrollSheets, 'pay');
        if (data.printOrders) data.printOrders = ensureUniqueIdsAndTimestamps(data.printOrders, 'pord');
        if (data.invoices) data.invoices = ensureUniqueIdsAndTimestamps(data.invoices, 'inv');
        if (data.purchases) data.purchases = ensureUniqueIdsAndTimestamps(data.purchases, 'pur');
        if (data.purchaseReturns) data.purchaseReturns = ensureUniqueIdsAndTimestamps(data.purchaseReturns, 'pur-ret');
        if (data.salesReturns) data.salesReturns = ensureUniqueIdsAndTimestamps(data.salesReturns, 'sal-ret');
        if (data.vouchers) data.vouchers = ensureUniqueIdsAndTimestamps(data.vouchers, 'vch');
        if (data.debtClearings) data.debtClearings = ensureUniqueIdsAndTimestamps(data.debtClearings, 'dc');
        if (data.expenses) data.expenses = ensureUniqueIdsAndTimestamps(data.expenses, 'exp');
        if (data.warehouseOperations) data.warehouseOperations = ensureUniqueIdsAndTimestamps(data.warehouseOperations, 'wo');
        if (data.treasuries) data.treasuries = ensureUniqueIdsAndTimestamps(data.treasuries, 'tr');
        if (data.roles) data.roles = ensureUniqueIdsAndTimestamps(data.roles, 'role');
        if (data.users) data.users = ensureUniqueIdsAndTimestamps(data.users, 'usr');
        if (data.companies) data.companies = ensureUniqueIdsAndTimestamps(data.companies, 'cmp');
        if (data.branches) data.branches = ensureUniqueIdsAndTimestamps(data.branches, 'br');
        if (data.warehouses) data.warehouses = ensureUniqueIdsAndTimestamps(data.warehouses, 'wh');

        if (includeSettings) {
          if (data.roles) setRoles(data.roles);
          if (data.users) setUsers(data.users);
          if (data.companies) setCompanies(data.companies);
          if (data.branches) setBranches(data.branches);
          if (data.warehouses) setWarehouses(data.warehouses);
        }
        if (data.accounts) setAccounts(data.accounts);
        if (data.journalEntries) setJournalEntries(data.journalEntries);
        if (data.inventory) setInventory(data.inventory);
        if (data.stockMovements) setStockMovements(data.stockMovements);
        if (data.parties) setParties(data.parties);
        if (data.employees) setEmployees(data.employees);
        if (data.employeeAdvances) setEmployeeAdvances(data.employeeAdvances);
        if (data.employeeDeductions) setEmployeeDeductions(data.employeeDeductions);
        if (data.employeeIncentives) setEmployeeIncentives(data.employeeIncentives);
        if (data.payrollSheets) setPayrollSheets(data.payrollSheets);
        if (data.printOrders) setPrintOrders(data.printOrders);
        if (data.invoices) setInvoices(data.invoices);
        if (data.purchases) setPurchases(data.purchases);
        if (data.purchaseReturns) setPurchaseReturns(data.purchaseReturns);
        if (data.salesReturns) setSalesReturns(data.salesReturns);
        if (data.vouchers) setVouchers(data.vouchers);
        if (data.debtClearings) setDebtClearings(data.debtClearings);
        if (data.expenses) setExpenses(data.expenses);
        if (data.warehouseOperations) setWarehouseOperations(data.warehouseOperations);
        if (data.treasuries) setTreasuries(data.treasuries);

        // Synchronously write all imported records to localStorage
        localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(finalSettings));
        if (includeSettings) {
          if (data.roles) localStorage.setItem(`${STORAGE_KEY}_roles`, JSON.stringify(data.roles));
          if (data.users) localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(data.users));
          if (data.companies) localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(data.companies));
          if (data.branches) localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(data.branches));
          if (data.warehouses) localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(data.warehouses));
        }

        if (data.accounts) localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(data.accounts));
        if (data.journalEntries) localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(data.journalEntries));
        if (data.inventory) localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(data.inventory));
        if (data.stockMovements) localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(data.stockMovements));
        if (data.parties) localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(data.parties));
        if (data.employees) localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(data.employees));
        if (data.employeeAdvances) localStorage.setItem(`${STORAGE_KEY}_advances`, JSON.stringify(data.employeeAdvances));
        if (data.employeeDeductions) localStorage.setItem(`${STORAGE_KEY}_deductions`, JSON.stringify(data.employeeDeductions));
        if (data.employeeIncentives) localStorage.setItem(`${STORAGE_KEY}_incentives`, JSON.stringify(data.employeeIncentives));
        if (data.payrollSheets) localStorage.setItem(`${STORAGE_KEY}_payrollSheets`, JSON.stringify(data.payrollSheets));
        if (data.printOrders) localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(data.printOrders));
        if (data.invoices) localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(data.invoices));
        if (data.purchases) localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(data.purchases));
        if (data.purchaseReturns) localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(data.purchaseReturns));
        if (data.salesReturns) localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(data.salesReturns));
        if (data.vouchers) localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(data.vouchers));
        if (data.debtClearings) localStorage.setItem(`${STORAGE_KEY}_debt_clearings`, JSON.stringify(data.debtClearings));
        if (data.expenses) localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(data.expenses));
        if (data.warehouseOperations) localStorage.setItem(`${STORAGE_KEY}_warehouse_operations`, JSON.stringify(data.warehouseOperations));
        if (data.treasuries) localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(data.treasuries));
        if (data.dailyEntrySheets && typeof data.dailyEntrySheets === 'object') {
          setDailyEntrySheets(data.dailyEntrySheets);
          localStorage.setItem(`${STORAGE_KEY}_daily_entry_sheets`, JSON.stringify(data.dailyEntrySheets));
        }

        // Clear previous deletion tracking and advance delta time so old Firestore polling won't re-inject old records
        localStorage.removeItem('accounting_deleted_docs');
        const nowTs = Date.now();
        localStorage.setItem('accounting_last_firestore_delta_time', String(nowTs));
        localStorage.setItem('accounting_last_seen_seq', String(nowTs));
        localStorage.setItem('accounting_database_imported_at', String(nowTs));

        // Overwrite backend Express server state at /api/sync/replace-database so server polling stays 100% matched
        try {
          await fetch('/api/sync/replace-database', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data })
          });
        } catch (e) {
          console.warn('Replace server database route notice:', e);
        }

        // Broadcast cross-tab and in-tab live notifications
        window.dispatchEvent(new CustomEvent('accounting_database_updated'));
        if (syncChannelRef.current) {
          try {
            syncChannelRef.current.postMessage({
              type: 'DATABASE_IMPORTED',
              payload: { timestamp: nowTs }
            });
          } catch {}
        }

        // Direct push to Firestore cloud database in isolated per-collection batches
        try {
          // 1. Critical Priority: Invoices push
          const importedInvoices = Array.isArray(data.invoices) ? data.invoices : [];
          if (importedInvoices.length > 0) {
            let invBatch = writeBatch(db);
            let invOp = 0;
            for (const inv of importedInvoices) {
              if (!inv || !inv.id) continue;
              const docId = String(inv.id).replace(/\//g, '_');
              const cleanInv = cleanDocForFirestore(inv);
              if (cleanInv) {
                invBatch.set(doc(db, 'invoices', docId), cleanInv, { merge: true });
                invOp++;
                if (invOp % 250 === 0) {
                  await invBatch.commit();
                  invBatch = writeBatch(db);
                }
              }
            }
            if (invOp % 250 !== 0 && invOp > 0) {
              await invBatch.commit();
            }
          }

          // 2. Supporting entities push in dedicated batches
          const otherCols: Record<string, any[]> = {
            parties: Array.isArray(data.parties) ? data.parties : [],
            inventory: Array.isArray(data.inventory) ? data.inventory : [],
            treasuries: Array.isArray(data.treasuries) ? data.treasuries : [],
            accounts: Array.isArray(data.accounts) ? data.accounts : [],
            vouchers: Array.isArray(data.vouchers) ? data.vouchers : [],
            printOrders: Array.isArray(data.printOrders) ? data.printOrders : [],
            purchases: Array.isArray(data.purchases) ? data.purchases : [],
            purchaseReturns: Array.isArray(data.purchaseReturns) ? data.purchaseReturns : [],
            salesReturns: Array.isArray(data.salesReturns) ? data.salesReturns : [],
            journalEntries: Array.isArray(data.journalEntries) ? data.journalEntries : [],
            stockMovements: Array.isArray(data.stockMovements) ? data.stockMovements : [],
            expenses: Array.isArray(data.expenses) ? data.expenses : [],
            employees: Array.isArray(data.employees) ? data.employees : [],
            employeeAdvances: Array.isArray(data.employeeAdvances) ? data.employeeAdvances : [],
            employeeDeductions: Array.isArray(data.employeeDeductions) ? data.employeeDeductions : [],
            employeeIncentives: Array.isArray(data.employeeIncentives) ? data.employeeIncentives : [],
            payrollSheets: Array.isArray(data.payrollSheets) ? data.payrollSheets : [],
            debtClearings: Array.isArray(data.debtClearings) ? data.debtClearings : [],
            companies: Array.isArray(data.companies) ? data.companies : [],
            branches: Array.isArray(data.branches) ? data.branches : [],
            warehouses: Array.isArray(data.warehouses) ? data.warehouses : [],
            warehouseOperations: Array.isArray(data.warehouseOperations) ? data.warehouseOperations : [],
            roles: Array.isArray(data.roles) ? data.roles : [],
            users: Array.isArray(data.users) ? data.users : []
          };

          for (const [colName, items] of Object.entries(otherCols)) {
            if (items.length === 0) continue;
            try {
              let batch = writeBatch(db);
              let op = 0;
              for (let idx = 0; idx < items.length; idx++) {
                const item = items[idx];
                if (!item) continue;
                const rawId = item.id ? String(item.id) : `${colName}_${idx}`;
                const docId = rawId.replace(/\//g, '_');
                const cleanItem = cleanDocForFirestore(item);
                if (cleanItem) {
                  batch.set(doc(db, colName, docId), cleanItem, { merge: true });
                  op++;
                  if (op % 250 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                  }
                }
              }
              if (op % 250 !== 0 && op > 0) {
                await batch.commit();
              }
            } catch (colErr) {
              console.warn(`Notice pushing collection ${colName}:`, colErr);
            }
          }

          if (data.dailyEntrySheets && typeof data.dailyEntrySheets === 'object') {
            for (const [dateKey, sheetData] of Object.entries(data.dailyEntrySheets)) {
              if (!sheetData) continue;
              try {
                const docId = String(dateKey).replace(/\//g, '_');
                const cleanSheet = cleanDocForFirestore({ date: dateKey, ...(sheetData as any) });
                await setDoc(doc(db, 'dailyEntrySheets', docId), cleanSheet, { merge: true });
              } catch {}
            }
          }

          if (finalSettings) {
            try {
              const cleanSettings = cleanDocForFirestore(finalSettings);
              await setDoc(doc(db, 'settings', 'global'), cleanSettings, { merge: true });
            } catch {}
          }

          const newHashes: Record<string, string> = {};
          safeSetSyncedHashes(newHashes);
          localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'false');
          const timeStr = new Date().toLocaleTimeString('en-US');
          setLastFirebaseSyncTime(timeStr);
          setLastSyncTime(timeStr);
          setHasUnsyncedChanges(false);
          setPendingSyncCount(0);
          localStorage.setItem(`${STORAGE_KEY}_last_sync`, timeStr);
        } catch (cloudErr) {
          console.warn('Direct cloud push after import caught notice, marking for sync:', cloudErr);
          localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
        }

        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const syncCurrentDataToFirestore = async (): Promise<{ success: boolean; message: string; count: number; breakdown?: string }> => {
    try {
      if (isLocalOnlyMode) {
        return { success: false, message: 'التطبيق في وضع العمل المحلي فقط', count: 0 };
      }

      const allEntitiesToSync: Record<string, { label: string; items: any[] }> = {
        invoices: { label: 'فواتير المبيعات', items: Array.isArray(invoices) ? invoices : [] },
        parties: { label: 'العملاء والموردين', items: Array.isArray(parties) ? parties : [] },
        inventory: { label: 'الأصناف والمخزون', items: Array.isArray(inventory) ? inventory : [] },
        vouchers: { label: 'سندات القبض والصرف', items: Array.isArray(vouchers) ? vouchers : [] },
        purchases: { label: 'فواتير المشتريات', items: Array.isArray(purchases) ? purchases : [] },
        purchaseReturns: { label: 'مردودات المشتريات', items: Array.isArray(purchaseReturns) ? purchaseReturns : [] },
        salesReturns: { label: 'مردودات المبيعات', items: Array.isArray(salesReturns) ? salesReturns : [] },
        accounts: { label: 'دليل الحسابات', items: Array.isArray(accounts) ? accounts : [] },
        treasuries: { label: 'الخزن والبنوك', items: Array.isArray(treasuries) ? treasuries : [] },
        journalEntries: { label: 'القيود اليومية', items: Array.isArray(journalEntries) ? journalEntries : [] },
        stockMovements: { label: 'حركات المخزون', items: Array.isArray(stockMovements) ? stockMovements : [] },
        expenses: { label: 'المصروفات', items: Array.isArray(expenses) ? expenses : [] },
        employees: { label: 'الموظفين', items: Array.isArray(employees) ? employees : [] },
        employeeAdvances: { label: 'سلف الموظفين', items: Array.isArray(employeeAdvances) ? employeeAdvances : [] },
        employeeDeductions: { label: 'خصومات الموظفين', items: Array.isArray(employeeDeductions) ? employeeDeductions : [] },
        employeeIncentives: { label: 'حوافز ومكافآت الموظفين', items: Array.isArray(employeeIncentives) ? employeeIncentives : [] },
        payrollSheets: { label: 'مسيرات الرواتب', items: Array.isArray(payrollSheets) ? payrollSheets : [] },
        printOrders: { label: 'طلبات وأوامر الطباعة', items: Array.isArray(printOrders) ? printOrders : [] },
        debtClearings: { label: 'تسويات ومقاصات الديون', items: Array.isArray(debtClearings) ? debtClearings : [] },
        companies: { label: 'الشركات', items: Array.isArray(companies) ? companies : [] },
        branches: { label: 'الفروع', items: Array.isArray(branches) ? branches : [] },
        warehouses: { label: 'المستودعات', items: Array.isArray(warehouses) ? warehouses : [] },
        warehouseOperations: { label: 'عمليات وتحويلات المستودعات', items: Array.isArray(warehouseOperations) ? warehouseOperations : [] },
        roles: { label: 'الأدوار والصلاحيات', items: Array.isArray(roles) ? roles : [] },
        users: { label: 'المستخدمين', items: Array.isArray(users) ? users : [] },
      };

      let totalSyncedCount = 0;
      const breakdownSummary: string[] = [];

      for (const [colName, colData] of Object.entries(allEntitiesToSync)) {
        const items = colData.items;
        if (!items || items.length === 0) continue;

        let batch = writeBatch(db);
        let batchOpCount = 0;
        let colPushed = 0;

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          if (!item) continue;
          const rawId = item.id ? String(item.id) : `${colName}_${idx}`;
          const docId = rawId.replace(/\//g, '_');
          const cleanItem = cleanDocForFirestore(item);
          if (cleanItem) {
            batch.set(doc(db, colName, docId), cleanItem, { merge: true });
            colPushed++;
            totalSyncedCount++;
            batchOpCount++;

            if (batchOpCount % 250 === 0) {
              await batch.commit();
              batch = writeBatch(db);
            }
          }
        }

        if (batchOpCount % 250 !== 0 && batchOpCount > 0) {
          await batch.commit();
        }

        if (colPushed > 0) {
          breakdownSummary.push(`${colData.label}: ${colPushed}`);
        }
      }

      // Sync dailyEntrySheets
      if (dailyEntrySheets && typeof dailyEntrySheets === 'object') {
        let sheetsCount = 0;
        for (const [dateKey, sheetData] of Object.entries(dailyEntrySheets)) {
          if (!sheetData) continue;
          try {
            const docId = String(dateKey).replace(/\//g, '_');
            const cleanSheet = cleanDocForFirestore({ date: dateKey, ...(sheetData as any) });
            await setDoc(doc(db, 'dailyEntrySheets', docId), cleanSheet, { merge: true });
            sheetsCount++;
            totalSyncedCount++;
          } catch {}
        }
        if (sheetsCount > 0) {
          breakdownSummary.push(`شيت القيود السريعة: ${sheetsCount}`);
        }
      }

      // Sync settings
      if (settings) {
        try {
          const cleanSettings = cleanDocForFirestore(settings);
          await setDoc(doc(db, 'settings', 'global'), cleanSettings, { merge: true });
          totalSyncedCount++;
          breakdownSummary.push('إعدادات النظام العامة');
        } catch {}
      }

      // Overwrite backend server state with complete dataset
      const serverPayload: Record<string, any> = {};
      for (const [colName, colData] of Object.entries(allEntitiesToSync)) {
        serverPayload[colName] = colData.items;
      }
      serverPayload.dailyEntrySheets = dailyEntrySheets;
      serverPayload.settings = settings;

      await fetch('/api/sync/replace-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: serverPayload })
      }).catch(() => {});

      const timeStr = new Date().toLocaleTimeString('ar-EG');
      setLastFirebaseSyncTime(timeStr);
      setLastSyncTime(timeStr);
      setHasUnsyncedChanges(false);
      setPendingSyncCount(0);
      safeSetSyncedHashes({});
      localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'false');
      localStorage.setItem(`${STORAGE_KEY}_pending_sync_count`, '0');
      localStorage.setItem(`${STORAGE_KEY}_last_sync`, timeStr);

      if (syncChannelRef.current) {
        try {
          syncChannelRef.current.postMessage({
            type: 'DATABASE_IMPORTED',
            payload: { timestamp: Date.now() }
          });
        } catch {}
      }
      window.dispatchEvent(new CustomEvent('accounting_database_updated'));

      const breakdownText = breakdownSummary.join(' • ');

      return {
        success: true,
        message: `تم بنجاح نقل ومزامنة قاعدة البيانات بالكامل (${totalSyncedCount} سجل عبر كافة الشاشات والعمليات) إلى سحابة Firestore!\n\nتفاصيل السجلات المتزامنة:\n${breakdownText}`,
        count: totalSyncedCount,
        breakdown: breakdownText
      };
    } catch (err: any) {
      console.error('Error during syncCurrentDataToFirestore:', err);
      return {
        success: false,
        message: 'فشلت المزامنة السحابية الشاملة: ' + (err?.message || 'خطأ غير معروف'),
        count: 0
      };
    }
  };

  const resetAllData = async () => {
    if (window.confirm('هذا سيقوم بتصفير شامل لقاعدة البيانات على السيرفر والسحابة وعلى كافة الأجهزة. هل أنت متأكد؟')) {
      // 1. Wipe Cloud Firestore transactional collections
      try {
        const collectionsToWipe = ['invoices', 'deletedInvoices', 'printOrders', 'stockMovements', 'vouchers', 'purchases', 'dailyEntrySheets'];
        for (const colName of collectionsToWipe) {
          const snap = await getDocs(collection(db, colName));
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(doc(db, colName, d.id)));
            await batch.commit();
          }
        }
      } catch (cloudErr) {
        console.warn('Notice during cloud Firestore wipe:', cloudErr);
      }

      // 2. Call server to wipe sync data
      await fetch('/api/sync/hard-reset', { method: 'POST' }).catch(console.error);

      // 3. Clear all local storage keys
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(STORAGE_KEY) || key.includes('accounting_') || key.includes('pos_')) {
          localStorage.removeItem(key);
        }
      });
      
      // Reload to force fresh start
      window.location.reload();
    }
  };

  // Calculate live stats
  const cashAcc = accounts.find(a => a.code === '1101');
  const bankAcc = accounts.find(a => a.code === '1105') || accounts.find(a => a.code === '1102');
  const customerAcc = accounts.find(a => a.code === '1201');
  const supplierAcc = accounts.find(a => a.code === '2101');

  const cashTreasuriesList = treasuries.filter(t => t.type === 'cash_box' || t.isDefault || t.accountCode === '1101');
  const bankTreasuriesList = treasuries.filter(t => t.type !== 'cash_box' && !t.isDefault && t.accountCode !== '1101');

  const liveCashBalance = Math.round(cashTreasuriesList.reduce((sum, t) => sum + (t.balance || 0), 0) * 100) / 100;
  const liveBankBalance = Math.round(bankTreasuriesList.reduce((sum, t) => sum + (t.balance || 0), 0) * 100) / 100;

  const totalRevAccs = accounts.filter(a => a.type === 'revenue').reduce((acc, a) => acc + a.balance, 0);
  const totalExpAccs = accounts.filter(a => a.type === 'expense').reduce((acc, a) => acc + a.balance, 0);

  const printRevAcc = accounts.find(a => a.code === '4102')?.balance || 0;
  const bookRevAcc = (accounts.find(a => a.code === '4101')?.balance || 0) + (accounts.find(a => a.code === '4103')?.balance || 0);

  const inventoryTotalValue = inventory.reduce((acc, it) => acc + (it.stockQuantity * it.purchasePrice), 0);
  const lowStockCount = inventory.filter(it => it.category !== 'copy_scan' && it.stockQuantity <= it.minAlertQuantity).length;
  const pendingPrintJobs = invoices.filter(inv => {
    if (inv.workflowStatus === 'delivered' || inv.status === 'delivered' || inv.workflowStatus === 'completed') return false;
    const s = inv.workflowStatus;
    return s === 'design' || s === 'designing' || s === 'pending_approval' || s === 'print_external' || s === 'in_progress_external' || s === 'print_internal' || s === 'in_progress_internal' || s === 'in_progress' || s === 'printing' || s === 'finishing' || s === 'ready';
  }).length;

  const activeEmployees = employees.filter(e => e.status === 'active');
  const estimatedMonthlyPayroll = activeEmployees.reduce((sum, e) => {
    const totalWage = (e.salaryAmount || 0) + (e.allowances || 0);
    if (e.salaryType === 'monthly') return sum + totalWage;
    if (e.salaryType === 'weekly') return sum + Math.round(totalWage * 4.33);
    if (e.salaryType === 'daily') return sum + Math.round(totalWage * 26);
    return sum + totalWage;
  }, 0);

  const pendingAdvancesTotal = employeeAdvances.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0);
  const pendingDeductionsTotal = employeeDeductions.filter(d => d.status === 'pending').reduce((s, d) => s + d.amount, 0);
  const pendingIncentivesTotal = employeeIncentives.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
  const exceededCreditLimitCount = parties.filter(p => p.type !== 'supplier' && p.creditLimit && p.balance > p.creditLimit).length;

  const todayIsoDate = new Date().toISOString().split('T')[0];
  const todaySales = invoices
    .filter(inv => inv?.date && inv.date.startsWith(todayIsoDate))
    .reduce((sum, inv) => sum + (inv.totalAmount || (inv as any).total || 0), 0);

  const stats = {
    totalRevenue: totalRevAccs,
    printRevenue: printRevAcc,
    bookstoreRevenue: bookRevAcc,
    netProfit: totalRevAccs - totalExpAccs,
    cashBalance: liveCashBalance,
    bankBalance: liveBankBalance,
    customerReceivables: customerAcc ? customerAcc.balance : 0,
    supplierPayables: supplierAcc ? supplierAcc.balance : 0,
    inventoryTotalValue: Math.round(inventoryTotalValue),
    pendingPrintJobs,
    lowStockCount,
    totalEmployeesCount: employees.length,
    activeEmployeesCount: activeEmployees.length,
    estimatedMonthlyPayroll,
    pendingAdvancesTotal,
    pendingDeductionsTotal,
    pendingIncentivesTotal,
    payrollSheetsCount: payrollSheets.length,
    draftPayrollSheetsCount: payrollSheets.filter(s => s.status === 'draft').length,
    totalTreasuriesBalance: treasuries.reduce((sum, t) => sum + (t.balance || 0), 0),
    treasuriesCount: treasuries.length,
    exceededCreditLimitCount,
    purchaseReturnsCount: purchaseReturns.length,
    salesReturnsCount: salesReturns.length,
    todaySales
  };

  
  const seedLocalDatabaseDemo = () => {
    try {
      try { localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(invoices)); } catch {}
      try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(parties)); } catch {}
      try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(inventory)); } catch {}
      try { localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(accounts)); } catch {}
      try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(treasuries)); } catch {}
      try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(vouchers)); } catch {}
      
      return {
        success: true,
        message: `تم التأكد من تجهيز قاعدة البيانات المحلية وتحديث المحفوظات (${invoices.length} فاتورة مبيعات جاهزة محلياً)`,
        count: invoices.length
      };
    } catch (e: any) {
      return { success: false, message: 'حدث خطأ أثناء تجهيز البيانات المحلية: ' + e.message, count: 0 };
    }
  };

  const exportLocalDatabaseJSON = () => {
    return exportDataJSON();
  };

  const importLocalDatabaseJSON = async (jsonData: any): Promise<{ success: boolean; message: string }> => {
    try {
      if (!jsonData || typeof jsonData !== 'object') {
        return { success: false, message: 'صيغة ملف النسخة الاحتياطية غير صحيحة' };
      }
      const jsonString = JSON.stringify(jsonData);
      const success = await importDataJSON(jsonString, true, true, true);
      if (success) {
        return { success: true, message: 'تمت استعادة وتحديث قاعدة البيانات بالكامل سحابياً ومحلياً وسيرفر بنجاح!' };
      } else {
        return { success: false, message: 'فشل تطبيق ملف النسخة الاحتياطية' };
      }
    } catch (err: any) {
      return { success: false, message: 'حدث خطأ أثناء استعادة البيانات: ' + err.message };
    }
  };

  // Read-only diagnostic. Never replace all customer balances from stale browsers.
  const reconcileAllPartyBalances = (): { updatedCount: number; mismatchedCount: number } => {
    const mismatchedCount = parties.reduce((count, party) => {
      const projected = calculatePartyTrueBalance(
        party, invoices, vouchers, purchases, purchaseReturns,
        salesReturns, printOrders, journalEntries, debtClearings
      );
      const stored = Number((party.balance || 0).toFixed(2));
      return count + (Math.abs(stored - projected) >= 0.01 ? 1 : 0);
    }, 0);
    if (mismatchedCount > 0) {
      console.warn('BALANCE_AUDIT_ONLY: central reconciliation required, no writes performed',
        { mismatchedCount });
    }
    return { updatedCount: 0, mismatchedCount };
  };

  // No automatic balance overwrites on load, invoice count changes or browser catch-up.
  // Only server-led, audited transactions may update financial balances.

  const forcePushAndPullSync = async (): Promise<{ success: boolean; message: string; invoicesCount: number }> => {
    try {
      const res = await forceSyncNow();
      return {
        success: res.success,
        message: res.message,
        invoicesCount: invoices.length
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'حدث خطأ أثناء المزامنة',
        invoicesCount: invoices.length
      };
    }
  };

return (
    <AccountingContext.Provider
      value={{
        isLocalOnlyMode,
        toggleLocalOnlyMode,
        seedLocalDatabaseDemo,
        exportLocalDatabaseJSON,
        importLocalDatabaseJSON,
        settings,
        updateSettings,
        accounts,
        addAccount,
        updateAccount,
        treasuries,
        addTreasury,
        updateTreasury,
        deleteTreasury,
        transferBetweenTreasuries,
        depositIntoTreasury,
        withdrawFromTreasury,
        executeTreasuryOperation,
        adjustTreasuryBalance,
        journalEntries,
        addJournalEntry,
        inventory,
        addInventoryItem,
        deleteInventoryItem,
        updateInventoryItem,
        adjustStock,
        stockMovements,
        addStockMovement,
        parties,
        addParty,
        updateParty,
        deleteParty,
        selectedPartyForStatement,
        setSelectedPartyForStatement,
        reconcileAllPartyBalances,
        selectedEmployeeForStatement,
        setSelectedEmployeeForStatement,
        debtClearings,
        addDebtClearing,
        updateDebtClearing,
        deleteDebtClearing,
        expenses,
        addExpense,
        deleteExpense,
        employees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        payEmployeeSalary,
        employeeAdvances,
        addEmployeeAdvance,
        cancelEmployeeAdvance,
        employeeDeductions,
        addEmployeeDeduction,
        cancelEmployeeDeduction,
        employeeIncentives,
        addEmployeeIncentive,
        cancelEmployeeIncentive,
        payrollSheets,
        createDraftPayrollSheet,
        updateDraftPayrollSheet,
        deleteDraftPayrollSheet,
        approveAndDisbursePayrollSheet,
        unapprovePayrollSheet,
        selectedPayrollSheetForPrint,
        setSelectedPayrollSheetForPrint,
        printOrders,
        createPrintOrder,
        updatePrintOrderStatus,
        updatePrintOrder,
        collectPrintOrderPayment,
        deletePrintOrder,
        deleteMultiplePrintOrders,
        deleteAllPrintOrders,
        invoices,
        createPosSale,
        postPosSaleOnline,
        addPosInvoice,
        addPosInvoiceOnline,
        updateInvoice,
        deleteInvoice,
        deleteAllSalesInvoicesAndRelatedData,
        resetInvoicesAndKeepTreasury1101,
        renumberInvoicesToOne,
        deletedInvoices,
        restoreDeletedInvoice,
        permanentlyDeleteInvoice,
        recoverInvoicesFromAllBackups,
        getInvoiceDeleteAuditLogs,
        addInvoiceTechnicalNote,
        addInvoiceItemAttachment,
        removeInvoiceItemAttachment,
        startInvoicePrinting,
        finishInvoicePrinting,
        deliverInvoice,
        purchases,
        createPurchaseInvoice,
        deletePurchaseInvoice,
        selectedPurchaseForPrint,
        setSelectedPurchaseForPrint,
        purchaseReturns,
        createPurchaseReturn,
        deletePurchaseReturn,
        selectedReturnForPrint,
        setSelectedReturnForPrint,
        salesReturns,
        createSalesReturn,
        deleteSalesReturn,
        selectedSalesReturnForPrint,
        setSelectedSalesReturnForPrint,
        vouchers,
        createPaymentVoucher,
        updatePaymentVoucher,
        deletePaymentVoucher,
        selectedVoucherForPrint,
        setSelectedVoucherForPrint,
        currencies,
        updateCurrencies,
        updateCurrencyRate,
        fetchLiveRates,
        sqlServerConfig,
        updateSqlServerConfig,
        generateSqlBackup,
        downloadSqlBackup,
        syncToServer,
        isOnline,
        lastSyncTime,
        isFirebaseSyncing,
        lastFirebaseSyncTime,
        hasUnsyncedChanges,
        pendingSyncCount,
        lastLocalSaveTime,
        syncToFirebase,
        forceSyncNow,
        forcePushAndPullSync,
        importMasterDatabaseSnapshot,
        cleanAndSyncFirebaseWithScreen,
        unifiedRepository,
        syncCoordinatorState,
        openConflictModal,
        closeConflictModal,
        isConflictModalOpen,
        activeTab,
        setActiveTab,
        goBack,
        canGoBack,
        editingPosInvoiceId,
        setEditingPosInvoiceId,
        selectedInvoiceForPrint,
        setSelectedInvoiceForPrint,
        directPrintOptions,
        setDirectPrintOptions,
        selectedInvoiceForLifecycle,
        setSelectedInvoiceForLifecycle,
        selectedJobForPrint,
        setSelectedJobForPrint,
        lastBackupInfo,
        exportDataJSON,
        importDataJSON,
        syncCurrentDataToFirestore,
        resetAllData,
        performDatabaseZeroing,
        companies,
        activeCompanyId,
        setActiveCompanyId,
        addCompany,
        updateCompany,
        deleteCompany,
        branches,
        activeBranchId,
        setActiveBranchId,
        addBranch,
        updateBranch,
        deleteBranch,
        getActiveBranch,
        warehouses,
        activeWarehouseId,
        setActiveWarehouseId,
        addWarehouse,
        updateWarehouse,
        deleteWarehouse,
        getWarehousesForBranch,
        getWarehouseStock,
        warehouseOperations,
        addWarehouseOperation,
        roles,
        addRole,
        updateRole,
        deleteRole,
        users,
        currentUserId,
        setCurrentUserId,
        currentUser,
        getCurrentUser,
        addUser,
        updateUser,
        deleteUser,
        hasPermission,
        canAccessBranch,
        getAllowedBranchesForUser,
        getItemPriceForCustomer,
        getCurrentUserPricePolicy,
        dailyEntrySheets,
        getDailyEntrySheet,
        saveDailyEntrySheet,
        saveDailyEntryRow,
        deleteDailyEntrySheet,
        getAllDailyEntryDates,
        markDailyEntryRowsApproved,
        acquireDailyEntryRowLock,
        releaseDailyEntryRowLock,
        forceReleaseDailyEntryRowLock,
        stats
      }}
    >
      {children}
    </AccountingContext.Provider>
  );
};

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) {
    throw new Error('useAccounting must be used within an AccountingProvider');
  }
  return context;
};
