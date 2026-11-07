import {
  Account,
  Treasury,
  InventoryItem,
  Party,
  Invoice,
  PurchaseInvoice,
  PrintJobOrder,
  Employee,
  EmployeeAdvance,
  PayrollSheet,
  JournalEntry,
  BusinessSettings
} from '../types';

export interface SqlDumpData {
  settings: BusinessSettings;
  accounts: Account[];
  treasuries: Treasury[];
  inventory: InventoryItem[];
  parties: Party[];
  invoices: Invoice[];
  purchases: PurchaseInvoice[];
  printOrders: PrintJobOrder[];
  employees: Employee[];
  advances: EmployeeAdvance[];
  payrollSheets: PayrollSheet[];
  journals: JournalEntry[];
}

function escapeSql(str: any): string {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'number') return isNaN(str) ? '0' : str.toString();
  if (typeof str === 'boolean') return str ? 'TRUE' : 'FALSE';
  const clean = String(str).replace(/'/g, "''");
  return `'${clean}'`;
}

export function generateSqlDump(data: SqlDumpData, dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres'): string {
  const timestamp = new Date().toISOString();
  const header = `
-- ==========================================================
-- قاعدة بيانات نظام المحاسبة وإدارة المطبعة والمكتبة (Al-Noor Press & Bookstore)
-- توليد تلقائي متكامل: متوافق مع ${dialect.toUpperCase()}
-- تاريخ الإنشاء: ${timestamp}
-- العملة الأساسية للحسابات: الشيكل الفلسطيني (ILS / ₪)
-- النمط التشغيلي: Offline-First مع دعم التزامن مع خوادم SQL
-- ==========================================================

`;

  const lines: string[] = [header];

  if (dialect === 'mysql') {
    lines.push('SET FOREIGN_KEY_CHECKS = 0;\nSET NAMES utf8mb4;\n');
  } else if (dialect === 'postgres') {
    lines.push('SET client_encoding = \'UTF8\';\n');
  } else if (dialect === 'sqlite') {
    lines.push('PRAGMA foreign_keys = OFF;\n');
  }

  // 1. Settings Table
  lines.push(`
-- جدول إعدادات المنشأة والعملة الأساسية
DROP TABLE IF EXISTS business_settings;
CREATE TABLE business_settings (
  id VARCHAR(50) PRIMARY KEY,
  business_name VARCHAR(255) NOT NULL,
  activity_type VARCHAR(255),
  tax_number VARCHAR(50),
  cr_number VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(100),
  address TEXT,
  base_currency VARCHAR(10) DEFAULT 'ILS',
  currency_symbol VARCHAR(10) DEFAULT '₪',
  vat_rate DECIMAL(5, 2) DEFAULT 16.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO business_settings (id, business_name, activity_type, tax_number, cr_number, phone, email, address, base_currency, currency_symbol, vat_rate)
VALUES (
  'main',
  ${escapeSql(data.settings.businessName)},
  ${escapeSql(data.settings.activityType)},
  ${escapeSql(data.settings.taxNumber)},
  ${escapeSql(data.settings.crNumber)},
  ${escapeSql(data.settings.phone)},
  ${escapeSql(data.settings.email)},
  ${escapeSql(data.settings.address)},
  'ILS',
  ${escapeSql(data.settings.currency || '₪')},
  ${escapeSql(data.settings.vatRate || 0)}
);
`);

  // 2. Accounts (Chart of Accounts)
  lines.push(`
-- دليل الحسابات العام (مقوّم بالشيكل الفلسطيني ILS)
DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  balance DECIMAL(15, 2) DEFAULT 0.00,
  is_system BOOLEAN DEFAULT FALSE,
  description TEXT
);
`);
  if (data.accounts.length > 0) {
    lines.push('INSERT INTO accounts (code, name, type, balance, is_system, description) VALUES');
    const accRows = data.accounts.map(
      a => `(${escapeSql(a.code)}, ${escapeSql(a.name)}, ${escapeSql(a.type)}, ${a.balance || 0}, ${a.isSystem ? 'TRUE' : 'FALSE'}, ${escapeSql(a.description || '')})`
    );
    lines.push(accRows.join(',\n') + ';\n');
  }

  // 3. Treasuries & Cash Boxes
  lines.push(`
-- الخزنات والصناديق والتطبيقات البنكية (متعددة العملات مع تقييم بالشيكل)
DROP TABLE IF EXISTS treasuries;
CREATE TABLE treasuries (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  account_code VARCHAR(20),
  balance DECIMAL(15, 2) DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'ILS',
  currency_symbol VARCHAR(10) DEFAULT '₪',
  is_default BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'active'
);
`);
  if (data.treasuries.length > 0) {
    lines.push('INSERT INTO treasuries (id, name, type, account_code, balance, currency, currency_symbol, is_default, status) VALUES');
    const tRows = data.treasuries.map(
      t => `(${escapeSql(t.id)}, ${escapeSql(t.name)}, ${escapeSql(t.type)}, ${escapeSql(t.accountCode)}, ${t.balance || 0}, ${escapeSql(t.currency || 'ILS')}, ${escapeSql(t.currencySymbol || '₪')}, ${t.isDefault ? 'TRUE' : 'FALSE'}, ${escapeSql(t.status || 'active')})`
    );
    lines.push(tRows.join(',\n') + ';\n');
  }

  // 4. Inventory Items
  lines.push(`
-- بطاقة الأصناف والمخزون والخدمات
DROP TABLE IF EXISTS inventory_items;
CREATE TABLE inventory_items (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  barcode VARCHAR(100),
  category VARCHAR(100),
  purchase_price DECIMAL(15, 2) DEFAULT 0.00,
  selling_price DECIMAL(15, 2) DEFAULT 0.00,
  stock_quantity DECIMAL(15, 2) DEFAULT 0.00,
  min_alert_quantity DECIMAL(15, 2) DEFAULT 5.00,
  unit VARCHAR(50) DEFAULT 'قطعة'
);
`);
  if (data.inventory.length > 0) {
    lines.push('INSERT INTO inventory_items (id, code, name, barcode, category, purchase_price, selling_price, stock_quantity, min_alert_quantity, unit) VALUES');
    const invRows = data.inventory.map(
      i => `(${escapeSql(i.id)}, ${escapeSql(i.code)}, ${escapeSql(i.name)}, ${escapeSql(i.barcode || '')}, ${escapeSql(i.category || '')}, ${i.purchasePrice || 0}, ${i.sellingPrice || 0}, ${i.stockQuantity || 0}, ${i.minAlertQuantity || 5}, ${escapeSql(i.unit || 'قطعة')})`
    );
    lines.push(invRows.join(',\n') + ';\n');
  }

  // 5. Parties (Customers & Suppliers)
  lines.push(`
-- سجل العملاء والموردين وأرصدتهم المجمعة بالشيكل
DROP TABLE IF EXISTS parties;
CREATE TABLE parties (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(100),
  address TEXT,
  tax_number VARCHAR(50),
  balance DECIMAL(15, 2) DEFAULT 0.00,
  credit_limit DECIMAL(15, 2) DEFAULT 0.00
);
`);
  if (data.parties.length > 0) {
    lines.push('INSERT INTO parties (id, name, type, phone, email, address, tax_number, balance, credit_limit) VALUES');
    const pRows = data.parties.map(
      p => `(${escapeSql(p.id)}, ${escapeSql(p.name)}, ${escapeSql(p.type)}, ${escapeSql(p.phone || '')}, ${escapeSql(p.email || '')}, ${escapeSql(p.address || '')}, ${escapeSql(p.taxNumber || '')}, ${p.balance || 0}, ${p.creditLimit || 0})`
    );
    lines.push(pRows.join(',\n') + ';\n');
  }

  // 6. Invoices (Sales & POS) with Multi-Currency & Shekel Base Total
  lines.push(`
-- فواتير المبيعات ونقاط البيع (مع دعم العملات الأجنبية والمعادل الأساسي بالشيكل)
DROP TABLE IF EXISTS invoices;
CREATE TABLE invoices (
  id VARCHAR(50) PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'pos',
  subtotal DECIMAL(15, 2) DEFAULT 0.00,
  tax_amount DECIMAL(15, 2) DEFAULT 0.00,
  total_amount DECIMAL(15, 2) DEFAULT 0.00,
  paid_amount DECIMAL(15, 2) DEFAULT 0.00,
  remaining_amount DECIMAL(15, 2) DEFAULT 0.00,
  payment_method VARCHAR(50) DEFAULT 'cash',
  currency VARCHAR(10) DEFAULT 'ILS',
  exchange_rate DECIMAL(10, 4) DEFAULT 1.0000,
  base_total_amount DECIMAL(15, 2) DEFAULT 0.00,
  status VARCHAR(20) DEFAULT 'paid'
);
`);
  if (data.invoices.length > 0) {
    lines.push('INSERT INTO invoices (id, invoice_number, date, customer_name, type, subtotal, tax_amount, total_amount, paid_amount, remaining_amount, payment_method, currency, exchange_rate, base_total_amount, status) VALUES');
    const invRows = data.invoices.map(inv => {
      const rate = inv.exchangeRate || 1.0;
      const baseTotal = inv.baseTotalAmount || (inv.totalAmount * rate);
      return `(${escapeSql(inv.id)}, ${escapeSql(inv.invoiceNumber)}, ${escapeSql(inv.date)}, ${escapeSql(inv.customerName || 'عميل نقدي')}, ${escapeSql(inv.type)}, ${inv.subtotal || 0}, ${inv.taxAmount || 0}, ${inv.totalAmount || 0}, ${inv.paidAmount || 0}, ${inv.remainingAmount || 0}, ${escapeSql(inv.paymentMethod)}, ${escapeSql(inv.currency || 'ILS')}, ${rate}, ${baseTotal}, ${escapeSql(inv.status)})`;
    });
    lines.push(invRows.join(',\n') + ';\n');
  }

  // 7. Print Job Orders
  lines.push(`
-- أوامر تشغيل المطبعة وعقود الطباعة
DROP TABLE IF EXISTS print_job_orders;
CREATE TABLE print_job_orders (
  id VARCHAR(50) PRIMARY KEY,
  job_number VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  total_price DECIMAL(15, 2) DEFAULT 0.00,
  deposit_paid DECIMAL(15, 2) DEFAULT 0.00,
  remaining_balance DECIMAL(15, 2) DEFAULT 0.00,
  status VARCHAR(50) DEFAULT 'pending',
  delivery_date DATE
);
`);
  if (data.printOrders.length > 0) {
    lines.push('INSERT INTO print_job_orders (id, job_number, title, customer_name, total_price, deposit_paid, remaining_balance, status, delivery_date) VALUES');
    const poRows = data.printOrders.map(
      po => `(${escapeSql(po.id)}, ${escapeSql(po.orderNumber || po.id)}, ${escapeSql(po.title)}, ${escapeSql(po.customerName)}, ${po.totalPrice || 0}, ${po.depositPaid || 0}, ${po.remainingBalance || 0}, ${escapeSql(po.status)}, ${escapeSql(po.deliveryDate)})`
    );
    lines.push(poRows.join(',\n') + ';\n');
  }

  // 8. Journal Entries (General Ledger in ILS)
  lines.push(`
-- قيود اليومية العامة ودفتر الأستاذ (مقيدة بالكامل بالشيكل الفلسطيني)
DROP TABLE IF EXISTS journal_entries;
CREATE TABLE journal_entries (
  id VARCHAR(50) PRIMARY KEY,
  entry_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  total_debit DECIMAL(15, 2) DEFAULT 0.00,
  total_credit DECIMAL(15, 2) DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'ILS'
);
`);
  if (data.journals.length > 0) {
    lines.push('INSERT INTO journal_entries (id, entry_number, date, description, total_debit, total_credit, currency) VALUES');
    const jRows = data.journals.map(
      j => {
        const totalDebit = (j.lines || []).reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = (j.lines || []).reduce((sum, l) => sum + (l.credit || 0), 0);
        return `(${escapeSql(j.id)}, ${escapeSql(j.entryNumber)}, ${escapeSql(j.date)}, ${escapeSql(j.description)}, ${totalDebit.toFixed(2)}, ${totalCredit.toFixed(2)}, 'ILS')`;
      }
    );
    lines.push(jRows.join(',\n') + ';\n');
  }

  if (dialect === 'mysql') {
    lines.push('\nSET FOREIGN_KEY_CHECKS = 1;\n');
  } else if (dialect === 'sqlite') {
    lines.push('\nPRAGMA foreign_keys = ON;\n');
  }

  lines.push(`
-- ==========================================================
-- نهاية ملف التصدير SQL. إجمالي الجداول: 8، العملة الأساسية: ₪ (ILS)
-- ==========================================================
`);

  return lines.join('\n');
}

export function downloadSqlFile(sqlContent: string, filename: string = 'database_backup_alnoor.sql'): void {
  const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJsonBackup(data: any, filename: string = 'alnoor_full_database_backup.json'): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sends a full snapshot to the configured SQL Web Server API endpoint
 */
export async function syncWithWebServer(
  url: string,
  payload: any,
  apiKey?: string
): Promise<{ success: boolean; message: string; timestamp?: string }> {
    if (!url) {
      return {
        success: false,
        message: 'عنوان السيرفر غير مدخل. يرجى إدخال رابط سيرفر المزامنة أو الاعتماد على سحابة Firebase.'
      };
    }

    try {

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'alnoor_pos_offline_first',
        timestamp: new Date().toISOString(),
        data: payload
      })
    });

    if (res.ok) {
      return {
        success: true,
        message: 'تمت المزامنة بنجاح مع خادم الويب وقاعدة بيانات SQL',
        timestamp: new Date().toLocaleTimeString('ar-SA')
      };
    } else {
      return {
        success: false,
        message: `تعذر الاتصال بالخادم (رمز الاستجابة: ${res.status} ${res.statusText})`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `خطأ في الاتصال بالخادم: ${err.message || 'تعذر الوصول إلى مسار الخادم المحدد'}`
    };
  }
}
