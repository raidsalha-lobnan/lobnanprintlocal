import { Account, InventoryItem, Party, PrintJobOrder, Invoice, PurchaseInvoice, PurchaseReturn, SalesReturn, JournalEntry, PaymentVoucher, Employee, EmployeeAdvance, EmployeeDeduction, EmployeeIncentive, PayrollSheet, Treasury, Company, Branch, Warehouse, SystemUser, Role, DebtClearingRecord, ExpenseItem, BusinessSettings, StockMovement } from '../types';
import masterSnapshot from '../data/blankSnapshot.json';

const snap: any = masterSnapshot || {};

const defaultBusinessSettings: BusinessSettings = {
  businessName: 'مطبعة ومكتبة لبنان',
  businessNameEn: 'Lobnan Press & Library',
  activityType: 'مطبعة ومكتبة ومستلزمات دعاية وإعلان',
  currency: '₪',
  baseCurrencyCode: 'ILS',
  vatRate: 0,
  invoiceFooterNote: 'شكراً لتعاملكم معنا - نسعد بخدمتكم دائماً',
  logoText: 'مطبعة ومكتبة لبنان',
  phone: '0000000000',
  email: '',
  address: 'فلسطين - غزة - دير البلح',
  telegramConfig: {
    botToken: '',
    defaultChatId: '',
    enabled: false
  }
};

const rawSettings = snap.settings;
export const initialSettings: BusinessSettings = (rawSettings && !Array.isArray(rawSettings) && typeof rawSettings === 'object')
  ? {
      ...defaultBusinessSettings,
      ...rawSettings,
      telegramConfig: {
        ...defaultBusinessSettings.telegramConfig,
        ...((rawSettings as any).telegramConfig || {})
      }
    }
  : defaultBusinessSettings;

export const initialAccounts: Account[] = Array.isArray(snap.accounts) ? snap.accounts : [];
export const initialInventory: InventoryItem[] = Array.isArray(snap.inventory) ? snap.inventory : [];
export const initialParties: Party[] = Array.isArray(snap.parties) ? snap.parties : [];
export const initialPrintOrders: PrintJobOrder[] = Array.isArray(snap.printOrders) ? snap.printOrders : [];
export const initialInvoices: Invoice[] = Array.isArray(snap.invoices) ? snap.invoices : [];
export const initialPurchases: PurchaseInvoice[] = Array.isArray(snap.purchases) ? snap.purchases : [];
export const initialPurchaseReturns: PurchaseReturn[] = Array.isArray(snap.purchaseReturns) ? snap.purchaseReturns : [];
export const initialSalesReturns: SalesReturn[] = Array.isArray(snap.salesReturns) ? snap.salesReturns : [];
export const initialJournalEntries: JournalEntry[] = Array.isArray(snap.journalEntries) ? snap.journalEntries : [];
export const initialEmployees: Employee[] = Array.isArray(snap.employees) ? snap.employees : [];
export const initialEmployeeAdvances: EmployeeAdvance[] = Array.isArray(snap.employeeAdvances) ? snap.employeeAdvances : [];
export const initialEmployeeDeductions: EmployeeDeduction[] = Array.isArray(snap.employeeDeductions) ? snap.employeeDeductions : [];
export const initialEmployeeIncentives: EmployeeIncentive[] = Array.isArray(snap.employeeIncentives) ? snap.employeeIncentives : [];
export const initialPayrollSheets: PayrollSheet[] = Array.isArray(snap.payrollSheets) ? snap.payrollSheets : [];
const rawSnapTreasuries: Treasury[] = Array.isArray(snap.treasuries) ? snap.treasuries : [];

export const initialTreasuries: Treasury[] = (rawSnapTreasuries.length > 0 ? rawSnapTreasuries : [
  {
    id: 'treasury-cash-main',
    name: 'الصندوق النقدي الرئيسي (الكاشير)',
    type: 'cash_box',
    balance: 0,
    accountCode: 'CASH-1101',
    isDefault: true,
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: []
  },
  {
    id: 'treasury-1793633324279',
    name: 'البنك الإسلامي الفلسطيني - حساب تجريبي',
    type: 'bank_account',
    balance: 0,
    accountCode: 'CASH-1102',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: []
  },
  {
    id: 'treasury-1791395958513',
    name: 'طلة لبنان - محفظة جوال باي',
    type: 'digital_wallet',
    balance: 0,
    accountCode: 'CASH-1103',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: []
  },
  {
    id: 'treasury-1790639512764',
    name: 'بنك فلسطين - حساب تجريبي',
    type: 'bank_account',
    balance: 0,
    accountCode: 'CASH-1104',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: []
  },
  {
    id: 'treasury-1791324119020',
    name: 'محفظة بال باي - PalPay / مستخدم تجريبي',
    type: 'digital_wallet',
    balance: 0,
    accountCode: 'CASH-1105',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: []
  },
  {
    id: 'treasury-1791395958599-1107',
    name: 'مسؤول النظام - بال بي - جوال باي - مال شات',
    type: 'digital_wallet',
    balance: 0,
    accountCode: 'CASH-1106',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: []
  }
]).map(t => {
  let accountCode = t.accountCode ? String(t.accountCode).trim() : '';
  if (t.id === 'treasury-cash-main' || t.name.includes('النقدي الرئيسي') || t.name.includes('الكاشير')) {
    accountCode = 'CASH-1101';
  } else if (accountCode && !accountCode.startsWith('CASH-') && !accountCode.startsWith('BANK-') && !accountCode.startsWith('TR-')) {
    accountCode = `CASH-${accountCode}`;
  }
  return { ...t, accountCode };
});
export const initialVouchers: PaymentVoucher[] = Array.isArray(snap.vouchers) ? snap.vouchers : [];
export const initialStockMovements: StockMovement[] = Array.isArray(snap.stockMovements) ? snap.stockMovements : [];
export const initialExpenses: ExpenseItem[] = Array.isArray(snap.expenses) ? snap.expenses : [];
