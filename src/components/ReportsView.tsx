import React, { useState, useMemo, useEffect } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import {
  BarChart3,
  Printer,
  FileSpreadsheet,
  TrendingUp,
  Percent,
  DollarSign,
  ShieldCheck,
  Calendar,
  Users,
  Truck,
  Boxes,
  Wallet,
  Receipt,
  UserCheck,
  CreditCard,
  Landmark,
  Layers,
  Search,
  Filter,
  Download,
  CheckCircle,
  FileText,
  Building,
  ChevronDown,
  Image as ImageIcon,
  Eye,
  X
} from 'lucide-react';
import { Party } from '../types';
import { generateAccountStatement, generateEmployeeStatement, StatementRow } from '../utils/statementGenerator';
import { tafqeetArabic } from '../utils/tafqeet';
import { PrintHeader } from './common/PrintHeader';
import { UnifiedPartyStatementDocument } from './UnifiedPartyStatementDocument';
import { OfficialStamp } from './common/OfficialStamp';
import { ReportSignatures } from './common/ReportSignatures';
import { AutocompleteCombobox, ComboboxOption } from './common/AutocompleteCombobox';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';

const parseThumbnails = (val?: string): string[] => {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [val];
};

export type ReportType =
  | 'customer_statement'
  | 'customer_items'
  | 'supplier_statement'
  | 'supplier_items'
  | 'receipt_vouchers'
  | 'payment_vouchers'
  | 'employee_statement'
  | 'payroll_sheets'
  | 'treasuries_movement'
  | 'income'
  | 'balance_sheet'
  | 'vat';

interface ReportsViewProps {
  initialReport?: ReportType;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ initialReport }) => {
  const {
    accounts,
    settings,
    invoices,
    salesReturns,
    purchases,
    purchaseReturns,
    vouchers,
    printOrders,
    parties,
    inventory,
    employees,
    payrollSheets,
    treasuries,
    journalEntries,
    currencies,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    debtClearings
  } = useAccounting();

  const [activeReport, setActiveReport] = useState<ReportType>(initialReport || 'customer_statement');

  useEffect(() => {
    if (initialReport) {
      setActiveReport(initialReport);
    }
  }, [initialReport]);

  // Common filters
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1 & 2: Customer selection (Main & Sub)
  const mainCustomers = useMemo(() => {
    return parties.filter(p => (p.type === 'customer' || p.type === 'both') && !p.parentPartyId && !p.isSubCustomer);
  }, [parties]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(mainCustomers[0]?.id || '');
  const [selectedSubCustomerId, setSelectedSubCustomerId] = useState<string>('all');

  const subCustomersForSelected = useMemo(() => {
    if (!selectedCustomerId) return [];

    const map = new Map<string, Party>();

    // 1. Registered sub-customer parties in database
    parties
      .filter(p => p.parentPartyId === selectedCustomerId || (p.isSubCustomer && p.parentPartyId === selectedCustomerId))
      .forEach(p => map.set(p.id, p));

    // 2. Discover any sub-customers from invoices linked to selectedCustomerId
    invoices.forEach(inv => {
      if (inv.customerId === selectedCustomerId) {
        if (inv.subCustomerId && !map.has(inv.subCustomerId)) {
          const found = parties.find(p => p.id === inv.subCustomerId);
          if (found) map.set(found.id, found);
        }
        const subName = (inv.subCustomerName || inv.customCustomerText || '').trim();
        if (subName && !Array.from(map.values()).some(p => p.name.trim().toLowerCase() === subName.toLowerCase())) {
          const synthId = inv.subCustomerId || `synth-sub-${subName}`;
          map.set(synthId, {
            id: synthId,
            code: synthId,
            type: 'customer',
            name: subName,
            parentPartyId: selectedCustomerId,
            isSubCustomer: true,
            balance: 0
          } as Party);
        }
      }
    });

    return Array.from(map.values());
  }, [parties, invoices, selectedCustomerId]);

  // 3 & 4: Supplier selection (Main & Sub)
  const mainSuppliers = useMemo(() => {
    return parties.filter(p => (p.type === 'supplier' || p.type === 'both') && !p.parentPartyId && !p.isSubCustomer);
  }, [parties]);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(mainSuppliers[0]?.id || '');
  const [selectedSubSupplierId, setSelectedSubSupplierId] = useState<string>('all');

  const subSuppliersForSelected = useMemo(() => {
    if (!selectedSupplierId) return [];
    return parties.filter(p => p.parentPartyId === selectedSupplierId);
  }, [parties, selectedSupplierId]);

  // خيارات قائمة الزبائن المنسدلة للبحث والمطابقة الفورية
  const customerComboboxOptions: ComboboxOption[] = useMemo(() => {
    return parties
      .filter(p => p.type === 'customer' || p.type === 'both')
      .map(p => {
        let badge = p.isSubCustomer ? 'زبون فرعي' : 'عميل';
        let subText = p.phone || '';
        if (p.parentCustomerName) {
          subText = `تابع لـ: ${p.parentCustomerName}${p.phone ? ' | ' + p.phone : ''}`;
        } else if (p.currentBalance !== undefined) {
          subText = `الرصيد: ${p.currentBalance.toFixed(2)} ${settings.currency || '₪'}${p.phone ? ' | ' + p.phone : ''}`;
        }
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          subText,
          badge,
          extraSearchCorpus: `${p.name} ${p.code || ''} ${p.phone || ''} ${p.parentCustomerName || ''} ${p.city || ''}`,
          raw: p
        };
      });
  }, [parties, settings.currency]);

  // خيارات قائمة الموردين المنسدلة للبحث والمطابقة الفورية
  const supplierComboboxOptions: ComboboxOption[] = useMemo(() => {
    return parties
      .filter(p => p.type === 'supplier' || p.type === 'both')
      .map(p => {
        let badge = 'مورد';
        let subText = p.phone || '';
        if (p.currentBalance !== undefined) {
          subText = `المستحق: ${p.currentBalance.toFixed(2)} ${settings.currency || '₪'}${p.phone ? ' | ' + p.phone : ''}`;
        }
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          subText,
          badge,
          extraSearchCorpus: `${p.name} ${p.code || ''} ${p.phone || ''} ${p.city || ''}`,
          raw: p
        };
      });
  }, [parties, settings.currency]);

  // خيارات قائمة الموظفين المنسدلة للبحث والمطابقة الفورية برقم أو اسم الموظف
  const employeeComboboxOptions: ComboboxOption[] = useMemo(() => {
    return employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      code: emp.code || emp.id.slice(-4),
      subText: `${emp.jobTitle || 'موظف'}${emp.phone ? ' | هاتف: ' + emp.phone : ''}`,
      badge: emp.department || 'عام',
      extraSearchCorpus: `${emp.name} ${emp.code || ''} ${emp.jobTitle || ''} ${emp.phone || ''} ${emp.department || ''}`,
      raw: emp
    }));
  }, [employees]);

  // 5: Receipt vouchers treasury filter
  const [receiptTreasuryFilter, setReceiptTreasuryFilter] = useState<string>('all');

  // 6: Payment vouchers treasury filter
  const [paymentTreasuryFilter, setPaymentTreasuryFilter] = useState<string>('all');

  // 7: Employee selection
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || '');

  // 9: Treasuries selection
  const [selectedTreasuryCode, setSelectedTreasuryCode] = useState<string>('all');

  // Print helper
  const handlePrint = () => {
    window.print();
  };

  // Export CSV helper
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // -------------------------------------------------------------
  // REPORT 1: Detailed Customer Statement (كشف حساب تفصيلي عميل)
  // -------------------------------------------------------------
  const [showStatementItemDetails, setShowStatementItemDetails] = useState<boolean>(true);
  const [showStatementImageThumbnails, setShowStatementImageThumbnails] = useState<boolean>(true);
  const [previewModalImage, setPreviewModalImage] = useState<{ url: string; name: string } | null>(null);

  const selectedSubCustObj = useMemo(() => {
    if (!selectedSubCustomerId || selectedSubCustomerId === 'all') return null;
    return subCustomersForSelected.find(s => s.id === selectedSubCustomerId);
  }, [subCustomersForSelected, selectedSubCustomerId]);

  const selectedSubSuppObj = useMemo(() => {
    if (!selectedSubSupplierId || selectedSubSupplierId === 'all') return null;
    return subSuppliersForSelected.find(s => s.id === selectedSubSupplierId);
  }, [subSuppliersForSelected, selectedSubSupplierId]);

  const customerStatementData = useMemo(() => {
    const cust = parties.find(p => p.id === selectedCustomerId);
    if (!cust) return { party: null, statement: null, rows: [], totalDebit: 0, totalCredit: 0, balance: 0, openingBalance: 0, fromDate, toDate };

    const statement = generateAccountStatement({
      party: cust,
      invoices,
      purchases,
      purchaseReturns,
      salesReturns,
      vouchers,
      printOrders,
      journalEntries,
      debtClearings,
      fromDate,
      toDate,
      subCustomerId: selectedSubCustomerId,
      subCustomers: subCustomersForSelected
    });

    return {
      party: cust,
      statement,
      rows: statement.rows,
      totalDebit: statement.totalDebit,
      totalCredit: statement.totalCredit,
      balance: statement.closingBalance,
      openingBalance: statement.openingBalance,
      fromDate,
      toDate
    };
  }, [parties, selectedCustomerId, selectedSubCustomerId, subCustomersForSelected, invoices, purchases, purchaseReturns, salesReturns, vouchers, printOrders, journalEntries, debtClearings, fromDate, toDate]);

  // -----------------------------------------------------------------------------------
  // REPORT 2: Customer Items Aggregated (كشف حساب الأصناف للعميل مع تجميع الأصناف المتشابهة)
  // -----------------------------------------------------------------------------------
  const customerItemsData = useMemo(() => {
    const cust = parties.find(p => p.id === selectedCustomerId);
    if (!cust) return { party: null, items: [], totalQuantity: 0, totalAmount: 0 };

    const targetCustomerIds = new Set<string>();
    targetCustomerIds.add(cust.id);
    if (selectedSubCustomerId === 'all') {
      subCustomersForSelected.forEach(sub => targetCustomerIds.add(sub.id));
    } else if (selectedSubCustomerId) {
      targetCustomerIds.clear();
      targetCustomerIds.add(selectedSubCustomerId);
    }

    // Map: itemKey -> aggregated data
    const map = new Map<string, {
      itemId: string;
      itemCode: string;
      itemName: string;
      description?: string;
      notes?: string;
      unit: string;
      category: string;
      totalQuantity: number;
      totalAmount: number;
      lastDate: string;
      invoiceCount: number;
    }>();

    invoices.forEach(inv => {
      // IDs are authoritative: never attach another customer's invoice by a matching name.
      const isMatch = selectedSubCustomerId && selectedSubCustomerId !== 'all'
        ? inv.subCustomerId === selectedSubCustomerId
        : Boolean((inv.customerId && targetCustomerIds.has(inv.customerId)) ||
          (inv.subCustomerId && targetCustomerIds.has(inv.subCustomerId)));
      if (!isMatch) return;
      if (fromDate && inv.date < fromDate) return;
      if (toDate && inv.date > toDate) return;

      inv.items.forEach((line, lineIndex) => {
        // Aggregate by permanent inventory ID, never by a mutable description.
        const linkedId = line.itemId || line.item?.id;
        const currentItem = linkedId ? inventory.find(item => item.id === linkedId) : undefined;
        const key = linkedId || `unlinked:${inv.id}:${lineIndex}`;
        const name = currentItem?.name || line.itemName || line.item?.name || line.description || 'صنف غير محدد';
        const code = currentItem?.code || line.itemCode || line.item?.code || '-';
        const unit = line.unit || line.item?.unit || 'قطعة';
        const category = line.item?.category || 'عام';
        const qty = line.quantity || 1;
        const lineTotal = (line.unitPrice || line.item?.price || 0) * qty - (line.discount || 0);
        const noteText = line.notes || (line as any).note || '';
        const descText = line.description && line.description !== name ? line.description : '';

        if (!map.has(key)) {
          map.set(key, {
            itemId: key,
            itemCode: code,
            itemName: name,
            description: descText,
            notes: noteText,
            unit,
            category,
            totalQuantity: qty,
            totalAmount: lineTotal,
            lastDate: inv.date,
            invoiceCount: 1
          });
        } else {
          const prev = map.get(key)!;
          prev.totalQuantity += qty;
          prev.totalAmount += lineTotal;
          prev.invoiceCount += 1;
          if (!prev.notes && noteText) prev.notes = noteText;
          if (!prev.description && descText) prev.description = descText;
          if (inv.date > prev.lastDate) {
            prev.lastDate = inv.date;
          }
        }
      });
    });

    const items = Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.totalAmount, 0);

    return {
      party: cust,
      items,
      totalQuantity,
      totalAmount
    };
  }, [parties, selectedCustomerId, selectedSubCustomerId, subCustomersForSelected, invoices, inventory, fromDate, toDate]);

  // -------------------------------------------------------------
  // REPORT 3: Detailed Supplier Statement (كشف حساب تفصيلي مورد)
  // -------------------------------------------------------------
  const supplierStatementData = useMemo(() => {
    const supp = parties.find(p => p.id === selectedSupplierId);
    if (!supp) return { party: null, statement: null, rows: [], totalDebit: 0, totalCredit: 0, balance: 0, openingBalance: 0, fromDate, toDate };

    const statement = generateAccountStatement({
      party: supp,
      invoices,
      purchases,
      purchaseReturns,
      salesReturns,
      vouchers,
      printOrders,
      journalEntries,
      debtClearings,
      fromDate,
      toDate,
      subCustomerId: selectedSubSupplierId,
      subCustomers: subSuppliersForSelected
    });

    return {
      party: supp,
      statement,
      rows: statement.rows,
      totalDebit: statement.totalDebit,
      totalCredit: statement.totalCredit,
      balance: statement.closingBalance,
      openingBalance: statement.openingBalance,
      fromDate,
      toDate
    };
  }, [parties, selectedSupplierId, selectedSubSupplierId, subSuppliersForSelected, invoices, purchases, purchaseReturns, salesReturns, vouchers, printOrders, journalEntries, debtClearings, fromDate, toDate]);

  // -----------------------------------------------------------------------------------
  // REPORT 4: Supplier Items Aggregated (كشف حساب الأصناف للمورد مع تجميع الأصناف المتشابهة)
  // -----------------------------------------------------------------------------------
  const supplierItemsData = useMemo(() => {
    const supp = parties.find(p => p.id === selectedSupplierId);
    if (!supp) return { party: null, items: [], totalQuantity: 0, totalAmount: 0 };

    const targetSuppIds = new Set<string>();
    targetSuppIds.add(supp.id);
    if (selectedSubSupplierId === 'all') {
      subSuppliersForSelected.forEach(sub => targetSuppIds.add(sub.id));
    } else if (selectedSubSupplierId) {
      targetSuppIds.clear();
      targetSuppIds.add(selectedSubSupplierId);
    }

    const map = new Map<string, {
      itemId: string;
      itemName: string;
      description?: string;
      notes?: string;
      totalQuantity: number;
      totalAmount: number;
      lastDate: string;
      invoiceCount: number;
    }>();

    purchases.forEach(pur => {
      const isMatch = (pur.supplierId && targetSuppIds.has(pur.supplierId)) || (pur.supplierName === supp.name);
      if (!isMatch) return;
      if (fromDate && pur.date < fromDate) return;
      if (toDate && pur.date > toDate) return;

      pur.items.forEach(line => {
        const key = line.itemId || line.itemName;
        const name = line.itemName;
        const qty = line.quantity || 1;
        const lineTotal = line.unitPrice * qty;
        const noteText = (line as any).notes || (line as any).note || '';
        const descText = (line as any).description && (line as any).description !== name ? (line as any).description : '';

        if (!map.has(key)) {
          map.set(key, {
            itemId: key,
            itemName: name,
            description: descText,
            notes: noteText,
            totalQuantity: qty,
            totalAmount: lineTotal,
            lastDate: pur.date,
            invoiceCount: 1
          });
        } else {
          const prev = map.get(key)!;
          prev.totalQuantity += qty;
          prev.totalAmount += lineTotal;
          prev.invoiceCount += 1;
          if (!prev.notes && noteText) prev.notes = noteText;
          if (!prev.description && descText) prev.description = descText;
          if (pur.date > prev.lastDate) {
            prev.lastDate = pur.date;
          }
        }
      });
    });

    const items = Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.totalAmount, 0);

    return {
      party: supp,
      items,
      totalQuantity,
      totalAmount
    };
  }, [parties, selectedSupplierId, selectedSubSupplierId, subSuppliersForSelected, purchases, fromDate, toDate]);

  // -------------------------------------------------------------
  // REPORT 5: Detailed Receipt Vouchers (كشف تفصيلي سندات القبض)
  // -------------------------------------------------------------
  const receiptVouchersData = useMemo(() => {
    return vouchers.filter(v => {
      if (v.type !== 'receipt') return false;
      if (receiptTreasuryFilter !== 'all' && v.accountCode !== receiptTreasuryFilter && v.treasuryAccountCode !== receiptTreasuryFilter) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          v.voucherNumber.toLowerCase().includes(q) ||
          (v.partyName && v.partyName.toLowerCase().includes(q)) ||
          (v.description && v.description.toLowerCase().includes(q))
        );
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [vouchers, receiptTreasuryFilter, fromDate, toDate, searchQuery]);

  // -------------------------------------------------------------
  // REPORT 6: Detailed Payment Vouchers (كشف تفصيلي سندات الصرف)
  // -------------------------------------------------------------
  const paymentVouchersData = useMemo(() => {
    return vouchers.filter(v => {
      if (v.type !== 'payment') return false;
      if (paymentTreasuryFilter !== 'all' && v.accountCode !== paymentTreasuryFilter && v.treasuryAccountCode !== paymentTreasuryFilter) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          v.voucherNumber.toLowerCase().includes(q) ||
          (v.partyName && v.partyName.toLowerCase().includes(q)) ||
          (v.description && v.description.toLowerCase().includes(q))
        );
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [vouchers, paymentTreasuryFilter, fromDate, toDate, searchQuery]);

  // -------------------------------------------------------------
  // REPORT 7: Detailed Employee Statement (كشف حساب تفصيلي موظف)
  // -------------------------------------------------------------
  const employeeStatementData = useMemo(() => {
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return { employee: null, rows: [], totalDue: 0, totalPaid: 0, netBalance: 0 };

    const statement = generateEmployeeStatement({
      employee: emp,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      vouchers,
      advances: employeeAdvances,
      deductions: employeeDeductions,
      incentives: employeeIncentives,
      invoices,
      purchases,
      purchaseReturns,
      payrollSheets,
      journalEntries,
      debtClearings
    });

    const mappedRows = statement.rows.map(r => ({
      date: r.date,
      type: r.typeLabel,
      refNumber: r.referenceNumber,
      description: r.description,
      dueAmount: r.entitlement,
      paidAmount: r.advance + r.deduction + r.disbursement,
      runningBalance: r.runningBalance,
      notes: r.notes
    }));

    return {
      employee: emp,
      rows: mappedRows,
      totalDue: statement.totalDue,
      totalPaid: statement.totalPaid,
      netBalance: statement.closingBalance
    };
  }, [
    employees,
    selectedEmpId,
    fromDate,
    toDate,
    vouchers,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    invoices,
    purchases,
    purchaseReturns,
    payrollSheets,
    journalEntries,
    debtClearings
  ]);

  // -------------------------------------------------------------
  // REPORT 8: Payroll Sheets Report (كشف رواتب الموظفين)
  // -------------------------------------------------------------
  const payrollSheetsData = useMemo(() => {
    return (payrollSheets || []).filter(sheet => {
      const sheetDate = sheet.createdAt || sheet.disbursedAt || (sheet as any).periodMonth || '';
      if (fromDate && sheetDate < fromDate) return false;
      if (toDate && sheetDate > toDate) return false;
      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [payrollSheets, fromDate, toDate]);

  // -------------------------------------------------------------
  // REPORT 9: Treasuries Movement Report (كشف تفصيلي للصناديق)
  // -------------------------------------------------------------
  const treasuriesMovementData = useMemo(() => {
    const targetTreasuries = selectedTreasuryCode === 'all'
      ? treasuries
      : treasuries.filter(t => t.accountCode === selectedTreasuryCode);

    interface TreasuryRow {
      date: string;
      treasuryName: string;
      type: string;
      docNumber: string;
      partyName: string;
      actualCurrency: string;
      actualAmount: number;
      exchangeRate: number;
      inflow: number;  // مقبوضات واردة بالعملة الأساسية (شيكل)
      outflow: number; // مدفوعات منصرفة بالعملة الأساسية (شيكل)
      notes: string;
      timestamp?: number;
    }

    const rows: TreasuryRow[] = [];
    const seenTxKeys = new Set<string>();
    const seenInvoiceNumbers = new Set<string>();

    const getCleanDate = (d?: string) => {
      if (!d) return '';
      return d.split('T')[0];
    };

    // 1. Primary Source: All transactions recorded on the target treasuries (t.transactions)
    targetTreasuries.forEach(t => {
      (t.transactions || []).forEach(tx => {
        const cleanDate = getCleanDate(tx.date);
        const actualCurr = tx.currency || tx.actualCurrency || 'ILS';
        const rate = Number(tx.exchangeRate) || 1.0;
        const actualAmt = Math.abs(Number(tx.actualAmount !== undefined ? tx.actualAmount : tx.amount) || 0);
        const baseAmt = Math.abs(Number(tx.baseAmount !== undefined ? tx.baseAmount : (actualAmt * rate)) || 0);
        const isIncome = tx.type === 'deposit' || tx.type === 'transfer_in';

        let opLabel = 'حركة مالية';
        if (tx.referenceType === 'pos_sale' || tx.referenceType === 'invoice') {
          opLabel = 'تحصيل مبيعات';
        } else if (tx.type === 'transfer_in') {
          opLabel = 'تحويل وارد';
        } else if (tx.type === 'transfer_out') {
          opLabel = 'تحويل صادر';
        } else if (tx.referenceType === 'receipt' || (isIncome && (tx.voucherNumber?.startsWith('RCT-') || tx.voucherNumber?.startsWith('RC-')))) {
          opLabel = 'سند قبض';
        } else if (tx.referenceType === 'payment' || (!isIncome && (tx.voucherNumber?.startsWith('PV-') || tx.voucherNumber?.startsWith('PAY-')))) {
          opLabel = 'سند صرف';
        } else if (tx.referenceType === 'expense') {
          opLabel = 'مصروفات نقدية';
        } else if (tx.referenceType === 'purchase') {
          opLabel = 'سداد مشتريات';
        } else if (tx.referenceType === 'payroll') {
          opLabel = 'صرف رواتب';
        } else if (tx.referenceType === 'advance') {
          opLabel = 'سلفة موظف';
        } else {
          opLabel = isIncome ? 'إيداع نقدي' : 'سحب نقدي';
        }

        const docNum = tx.voucherNumber || tx.referenceId || tx.id.slice(0, 10);
        const party = tx.partyName || (tx.targetTreasuryName ? `إلى/من: ${tx.targetTreasuryName}` : '-');

        // Deduplication tracking: Ensure an invoice is never duplicated across treasuries unless paid via two distinct receipts/vouchers
        const isInvTx = (docNum && docNum.startsWith('INV-')) || tx.referenceType === 'pos_sale' || tx.referenceType === 'invoice';
        if (isInvTx) {
          if (docNum) seenInvoiceNumbers.add(docNum);
          if (tx.referenceId) seenInvoiceNumbers.add(tx.referenceId);
          if (tx.voucherNumber) seenInvoiceNumbers.add(tx.voucherNumber);
        }

        const uniqueKey = `${t.accountCode}_${docNum}_${cleanDate}_${baseAmt}`;
        seenTxKeys.add(uniqueKey);
        if (docNum && docNum !== '-') seenTxKeys.add(`${t.accountCode}_${docNum}`);

        rows.push({
          date: cleanDate,
          treasuryName: t.name,
          type: opLabel,
          docNumber: docNum,
          partyName: party,
          actualCurrency: actualCurr,
          actualAmount: actualAmt,
          exchangeRate: rate,
          inflow: isIncome ? baseAmt : 0,
          outflow: !isIncome ? baseAmt : 0,
          notes: tx.description || '-',
          timestamp: new Date(tx.date).getTime() || 0
        });
      });
    });

    // 2. Secondary Source: Sales Invoices with cash/card payment linked to target treasuries
    invoices.forEach(inv => {
      if ((inv.paidAmount || 0) <= 0) return;
      
      const docNum = inv.invoiceNumber;

      // CRITICAL RULE: If invoice transaction is already recorded in any treasury, SKIP to avoid duplicate across treasuries!
      if (seenInvoiceNumbers.has(docNum) || (inv.id && seenInvoiceNumbers.has(inv.id))) {
        return;
      }

      let invTreasuryCode = inv.treasuryAccountCode || 
        (inv.paymentMethod === 'cash' ? (inv.cashTreasuryCode || '1101') : (inv.bankTreasuryCode || '1105'));

      if (invTreasuryCode === '1102' && !treasuries.some(tr => tr.accountCode === '1102' || tr.id === '1102')) {
        invTreasuryCode = '1105';
      }

      const isMatch = selectedTreasuryCode === 'all' || selectedTreasuryCode === invTreasuryCode;
      if (!isMatch) return;

      if (seenTxKeys.has(`${invTreasuryCode}_${docNum}`)) return;
      seenTxKeys.add(`${invTreasuryCode}_${docNum}`);
      seenInvoiceNumbers.add(docNum);

      const tObj = treasuries.find(t => t.accountCode === invTreasuryCode || t.id === invTreasuryCode);
      const cleanDate = getCleanDate(inv.date || inv.createdAt);
      const curr = inv.currency || 'ILS';
      const rate = Number(inv.exchangeRate) || 1.0;
      const actualAmt = Number(inv.paidAmount) || 0;
      const baseAmt = Number(inv.basePaidAmount) || (actualAmt * rate);

      rows.push({
        date: cleanDate,
        treasuryName: tObj?.name || 'الصندوق',
        type: 'تحصيل مبيعات (كاشير)',
        docNumber: docNum,
        partyName: formatInvoiceCustomerDisplay(inv, parties),
        actualCurrency: curr,
        actualAmount: actualAmt,
        exchangeRate: rate,
        inflow: baseAmt,
        outflow: 0,
        notes: inv.notes || inv.paymentNotes || `تحصيل فاتورة مبيعات رقم ${inv.invoiceNumber}`,
        timestamp: new Date(inv.date || inv.createdAt || '').getTime() || 0
      });
    });

    // 3. Secondary Source: Vouchers linked to target treasuries not already recorded
    vouchers.forEach(v => {
      const vTreasuryCode = v.treasuryAccountCode || v.accountCode;
      const isMatch = selectedTreasuryCode === 'all' || selectedTreasuryCode === vTreasuryCode;
      if (!isMatch) return;

      const docNum = v.voucherNumber;
      if (seenTxKeys.has(`${vTreasuryCode}_${docNum}`)) return;

      const tObj = treasuries.find(t => t.accountCode === vTreasuryCode);
      const cleanDate = getCleanDate(v.date);
      const curr = v.currency || 'ILS';
      const rate = Number(v.exchangeRate) || 1.0;
      const actualAmt = Number(v.amount) || 0;
      const baseAmt = Number(v.baseAmount) || (actualAmt * rate);
      const isReceipt = v.type === 'receipt';

      rows.push({
        date: cleanDate,
        treasuryName: tObj?.name || 'الخزينة',
        type: isReceipt ? 'سند قبض' : 'سند صرف',
        docNumber: docNum,
        partyName: v.partyName || '-',
        actualCurrency: curr,
        actualAmount: actualAmt,
        exchangeRate: rate,
        inflow: isReceipt ? baseAmt : 0,
        outflow: !isReceipt ? baseAmt : 0,
        notes: v.description || '-',
        timestamp: new Date(v.date).getTime() || 0
      });
    });

    // Filter by date range
    const filtered = rows.filter(r => {
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      return true;
    }).sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    const totalInflow = filtered.reduce((s, r) => s + r.inflow, 0);
    const totalOutflow = filtered.reduce((s, r) => s + r.outflow, 0);

    // Target holdings by currency
    const targetHoldings: Record<string, number> = {};
    targetTreasuries.forEach(t => {
      if (t.currencyBalances && Object.keys(t.currencyBalances).length > 0) {
        Object.entries(t.currencyBalances).forEach(([c, amt]) => {
          targetHoldings[c] = (targetHoldings[c] || 0) + (Number(amt) || 0);
        });
      } else {
        targetHoldings['ILS'] = (targetHoldings['ILS'] || 0) + (t.balance || 0);
      }
    });

    // Net movements grouped by actual currency
    const currencyMovements: Record<string, { in: number; out: number }> = {};
    filtered.forEach(r => {
      if (!currencyMovements[r.actualCurrency]) {
        currencyMovements[r.actualCurrency] = { in: 0, out: 0 };
      }
      if (r.inflow > 0) {
        currencyMovements[r.actualCurrency].in += r.actualAmount;
      }
      if (r.outflow > 0) {
        currencyMovements[r.actualCurrency].out += r.actualAmount;
      }
    });

    return {
      targetTreasuries,
      rows: filtered,
      totalInflow,
      totalOutflow,
      netMovement: totalInflow - totalOutflow,
      targetHoldings,
      currencyMovements
    };
  }, [treasuries, selectedTreasuryCode, vouchers, invoices, fromDate, toDate]);

  // -------------------------------------------------------------
  // Financial Statements Data (Income & Balance Sheet)
  // -------------------------------------------------------------
  const revBookstore = accounts.find(a => a.code === '4101')?.balance || 0;
  const revPrinting = accounts.find(a => a.code === '4102')?.balance || 0;
  const revServices = accounts.find(a => a.code === '4103')?.balance || 0;
  const totalRevenues = revBookstore + revPrinting + revServices;

  const cogsBookstore = accounts.find(a => a.code === '5101')?.balance || 0;
  const cogsPrinting = accounts.find(a => a.code === '5102')?.balance || 0;
  const totalCogs = cogsBookstore + cogsPrinting;

  const grossProfit = totalRevenues - totalCogs;

  const expSalaries = accounts.find(a => a.code === '5201')?.balance || 0;
  const expRent = accounts.find(a => a.code === '5202')?.balance || 0;
  const expMaintenance = accounts.find(a => a.code === '5203')?.balance || 0;
  const expUtilities = accounts.find(a => a.code === '5204')?.balance || 0;
  const expGeneral = accounts.find(a => a.code === '5205')?.balance || 0;
  const totalExpenses = expSalaries + expRent + expMaintenance + expUtilities + expGeneral;

  const netProfit = grossProfit - totalExpenses;

  const assetCash = accounts.find(a => a.code === '1101')?.balance || 0;
  const assetBank = accounts.find(a => a.code === '1102')?.balance || 0;
  const assetReceivables = accounts.find(a => a.code === '1201')?.balance || 0;
  const assetInventoryBooks = accounts.find(a => a.code === '1301')?.balance || 0;
  const assetInventoryPrint = accounts.find(a => a.code === '1302')?.balance || 0;
  const assetMachines = accounts.find(a => a.code === '1501')?.balance || 0;

  const totalCurrentAssets = assetCash + assetBank + assetReceivables + assetInventoryBooks + assetInventoryPrint;
  const totalFixedAssets = assetMachines;
  const totalAssets = totalCurrentAssets + totalFixedAssets;

  const liabPayables = accounts.find(a => a.code === '2101')?.balance || 0;
  const liabVat = accounts.find(a => a.code === '2103')?.balance || 0;
  const liabDelivery = accounts.find(a => a.code === '2104')?.balance || 0;
  const totalLiabilities = liabPayables + liabVat + liabDelivery;

  const eqCapital = accounts.find(a => a.code === '3101')?.balance || 0;
  const eqRetained = accounts.find(a => a.code === '3201')?.balance || 0;
  const totalEquity = eqCapital + eqRetained + netProfit;

  // VAT calculations
  const totalSalesTaxable = invoices.reduce((acc, inv) => acc + (inv.subtotal - inv.discountTotal), 0);
  const totalOutputVat = invoices.reduce((acc, inv) => acc + inv.taxAmount, 0);
  const totalPurchasesTaxable = purchases.reduce((acc, p) => acc + p.subtotal, 0);
  const totalInputVat = purchases.reduce((acc, p) => acc + p.taxAmount, 0);
  const netVatPayable = totalOutputVat - totalInputVat;

  // Report navigation tabs metadata
  interface ReportTabItem {
    id: ReportType;
    name: string;
    icon: React.ElementType;
  }

  interface ReportCategory {
    group: string;
    items: ReportTabItem[];
  }

  const reportsCategories: ReportCategory[] = [
    {
      group: 'تقارير العملاء والمبيعات',
      items: [
        { id: 'customer_statement' as const, name: '1. كشف حساب تفصيلي عميل', icon: Users },
        { id: 'customer_items' as const, name: '2. كشف حساب الأصناف للعميل', icon: Boxes }
      ]
    },
    {
      group: 'تقارير الموردين والمشتريات',
      items: [
        { id: 'supplier_statement' as const, name: '3. كشف حساب تفصيلي مورد', icon: Truck },
        { id: 'supplier_items' as const, name: '4. كشف حساب الأصناف للمورد', icon: Boxes }
      ]
    },
    {
      group: 'سندات القبض والصرف',
      items: [
        { id: 'receipt_vouchers' as const, name: '5. كشف تفصيلي سندات القبض', icon: Receipt },
        { id: 'payment_vouchers' as const, name: '6. كشف تفصيلي سندات الصرف', icon: Wallet }
      ]
    },
    {
      group: 'الموظفون والخزائن',
      items: [
        { id: 'employee_statement' as const, name: '7. كشف حساب تفصيلي موظف', icon: UserCheck },
        { id: 'payroll_sheets' as const, name: '8. كشف رواتب الموظفين', icon: FileSpreadsheet },
        { id: 'treasuries_movement' as const, name: '9. كشف تفصيلي للصناديق', icon: Landmark }
      ]
    },
    {
      group: 'القوائم الختامية والضريبية',
      items: [
        { id: 'income' as const, name: 'قائمة الدخل والأرباح', icon: TrendingUp },
        { id: 'balance_sheet' as const, name: 'الميزانية العمومية', icon: BarChart3 },
        { id: 'vat' as const, name: 'الإقرار الضريبي المعتمد', icon: Percent }
      ]
    }
  ];

  return (
    <div className="space-y-5" dir="rtl">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">مركز التقارير المحاسبية والتفصيلية</h1>
            <p className="text-[10px] text-slate-400 font-light">
              كشوفات الحسابات المعتمدة، حركات وتجميع الأصناف، سندات القبض والصرف، الرواتب والصناديق والقوائم المالية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* Reports Navigation Bar (Tabs Selector) */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs print:hidden space-y-2">
        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold mb-1">
          <span>اختر التقرير المطلوب:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {reportsCategories.flatMap(cat => cat.items).map(item => {
            const Icon = item.icon;
            const isSelected = activeReport === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveReport(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Common Filters Bar (Dates & Entities) */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Customer Selector if activeReport is customer_statement or customer_items */}
          {(activeReport === 'customer_statement' || activeReport === 'customer_items') && (
            <div className="flex items-center gap-2 flex-wrap min-w-[280px]">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 whitespace-nowrap text-xs">
                <div className="p-1 rounded bg-blue-100 text-blue-700">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span>الزبون / العميل:</span>
              </div>
              <div className="w-64 sm:w-72">
                <AutocompleteCombobox
                  items={customerComboboxOptions}
                  selectedId={selectedSubCustomerId !== 'all' ? selectedSubCustomerId : selectedCustomerId}
                  value={parties.find(p => p.id === (selectedSubCustomerId !== 'all' ? selectedSubCustomerId : selectedCustomerId))?.name || ''}
                  onSelect={(opt) => {
                    if (opt.raw) {
                      if (opt.raw.parentPartyId) {
                        setSelectedCustomerId(opt.raw.parentPartyId);
                        setSelectedSubCustomerId(opt.raw.id);
                      } else {
                        setSelectedCustomerId(opt.raw.id);
                        setSelectedSubCustomerId('all');
                      }
                    }
                  }}
                  entityType="customer"
                  placeholder="ابحث واكتب اسم الزبون للمطابقة..."
                  className="w-full text-xs"
                  inputClassName="py-1 px-2.5 text-xs font-bold bg-slate-50 border-slate-200"
                />
              </div>

              {subCustomersForSelected.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500">الزبون الفرعي:</span>
                  <select
                    value={selectedSubCustomerId}
                    onChange={e => setSelectedSubCustomerId(e.target.value)}
                    className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 text-xs text-blue-900 font-semibold"
                  >
                    <option value="all">كل الزبائن الفرعيين والتابعِين</option>
                    {subCustomersForSelected.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeReport === 'customer_statement' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="h-6 w-px bg-slate-200 self-center hidden sm:block mx-0.5"></div>
                  
                  <button
                    type="button"
                    onClick={() => setShowStatementItemDetails(prev => !prev)}
                    className={`px-2 py-1 rounded-lg font-bold text-[10.5px] cursor-pointer transition-colors flex items-center gap-1.5 border select-none ${
                      showStatementItemDetails
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{showStatementItemDetails ? 'إخفاء تفاصيل الفواتير' : 'إظهار تفاصيل الفواتير والمقاسات'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowStatementImageThumbnails(prev => !prev)}
                    className={`px-2 py-1 rounded-lg font-bold text-[10.5px] cursor-pointer transition-all flex items-center gap-1 border select-none ${
                      showStatementImageThumbnails
                        ? 'bg-purple-600 text-white border-purple-700 shadow-2xs hover:bg-purple-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                    title={showStatementImageThumbnails ? 'إخفاء مصغرات صور الأصناف من الكشف' : 'إظهار مصغرات صور الأصناف تحت جدول الفاتورة'}
                  >
                    <ImageIcon className={`w-3 h-3 ${showStatementImageThumbnails ? 'text-amber-300' : 'text-purple-600'}`} />
                    <span>{showStatementImageThumbnails ? 'إخفاء صور الأصناف' : 'إظهار صور الأصناف 🖼️'}</span>
                  </button>

                  <div className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-1 select-none">
                    عدد الحركات: <strong className="font-mono text-slate-900">{customerStatementData?.rows?.length || 0}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Supplier Selector if activeReport is supplier_statement or supplier_items */}
          {(activeReport === 'supplier_statement' || activeReport === 'supplier_items') && (
            <div className="flex items-center gap-2 flex-wrap min-w-[280px]">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 whitespace-nowrap text-xs">
                <div className="p-1 rounded bg-amber-100 text-amber-700">
                  <Truck className="w-3.5 h-3.5" />
                </div>
                <span>المورد:</span>
              </div>
              <div className="w-64 sm:w-72">
                <AutocompleteCombobox
                  items={supplierComboboxOptions}
                  selectedId={selectedSubSupplierId !== 'all' ? selectedSubSupplierId : selectedSupplierId}
                  value={parties.find(p => p.id === (selectedSubSupplierId !== 'all' ? selectedSubSupplierId : selectedSupplierId))?.name || ''}
                  onSelect={(opt) => {
                    if (opt.raw) {
                      if (opt.raw.parentPartyId) {
                        setSelectedSupplierId(opt.raw.parentPartyId);
                        setSelectedSubSupplierId(opt.raw.id);
                      } else {
                        setSelectedSupplierId(opt.raw.id);
                        setSelectedSubSupplierId('all');
                      }
                    }
                  }}
                  entityType="supplier"
                  placeholder="ابحث واكتب اسم المورد للمطابقة..."
                  className="w-full text-xs"
                  inputClassName="py-1 px-2.5 text-xs font-bold bg-slate-50 border-slate-200"
                />
              </div>

              {subSuppliersForSelected.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500">الفرعي:</span>
                  <select
                    value={selectedSubSupplierId}
                    onChange={e => setSelectedSubSupplierId(e.target.value)}
                    className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 text-xs text-amber-900 font-semibold"
                  >
                    <option value="all">كل الفروع التابعة</option>
                    {subSuppliersForSelected.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeReport === 'supplier_statement' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="h-6 w-px bg-slate-200 self-center hidden sm:block mx-0.5"></div>
                  
                  <button
                    type="button"
                    onClick={() => setShowStatementItemDetails(prev => !prev)}
                    className={`px-2 py-1 rounded-lg font-bold text-[10.5px] cursor-pointer transition-colors flex items-center gap-1.5 border select-none ${
                      showStatementItemDetails
                        ? 'bg-amber-700 text-white border-amber-800 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{showStatementItemDetails ? 'إخفاء تفاصيل الفواتير' : 'إظهار تفاصيل الفواتير والمقاسات'}</span>
                  </button>

                  <div className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-1 select-none">
                    عدد الحركات: <strong className="font-mono text-slate-900">{supplierStatementData?.rows?.length || 0}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Employee Selector if activeReport is employee_statement */}
          {activeReport === 'employee_statement' && (
            <div className="flex items-center gap-2 flex-wrap min-w-[280px]">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 whitespace-nowrap text-xs">
                <UserCheck className="w-4 h-4 text-purple-600" />
                <span>اختيار الموظف:</span>
              </div>
              <div className="w-64">
                <AutocompleteCombobox
                  options={employeeComboboxOptions}
                  value={selectedEmpId}
                  onChange={(val) => setSelectedEmpId(val)}
                  placeholder="ابحث بالاسم أو رقم الموظف..."
                  searchPlaceholder="اكتب اسم أو كود الموظف..."
                  emptyMessage="لا يوجد موظف مطابق"
                />
              </div>

              <div className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-1 select-none">
                عدد الحركات: <strong className="font-mono text-slate-900">{employeeStatementData?.rows?.length || 0}</strong>
              </div>
            </div>
          )}

          {/* Treasury Filter if activeReport is treasuries_movement, receipt_vouchers, or payment_vouchers */}
          {(activeReport === 'treasuries_movement' || activeReport === 'receipt_vouchers' || activeReport === 'payment_vouchers') && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">الخزينة / الحساب:</span>
              <select
                value={
                  activeReport === 'treasuries_movement'
                    ? selectedTreasuryCode
                    : activeReport === 'receipt_vouchers'
                    ? receiptTreasuryFilter
                    : paymentTreasuryFilter
                }
                onChange={e => {
                  const val = e.target.value;
                  if (activeReport === 'treasuries_movement') setSelectedTreasuryCode(val);
                  else if (activeReport === 'receipt_vouchers') setReceiptTreasuryFilter(val);
                  else setPaymentTreasuryFilter(val);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="all">كل الخزائن والحسابات البنكية</option>
                {treasuries.map(t => (
                  <option key={t.id} value={t.accountCode}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Date Filter Inputs */}
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-[11px] text-slate-400">من:</span>
          <DateInput value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs"
          />
          <span className="text-[11px] text-slate-400">إلى:</span>
          <DateInput value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs"
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="text-rose-600 text-[11px] font-bold hover:underline cursor-pointer"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. كشف حساب تفصيلي عميل */}
      {/* ========================================================================= */}
      {activeReport === 'customer_statement' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-3 print:p-0 print:border-0 print:shadow-none report-a4-container">
          {customerStatementData.statement ? (
            <UnifiedPartyStatementDocument
              partyStatement={customerStatementData.statement}
              isCustomer={true}
              settings={settings}
              clientDisplayName={customerStatementData.party?.name === 'زبون نقدي' && selectedSubCustObj ? selectedSubCustObj.name : (customerStatementData.party?.name || 'غير محدد')}
              fromDate={fromDate}
              toDate={toDate}
              showItemDetails={showStatementItemDetails}
              showImageThumbnailsInStatement={showStatementImageThumbnails}
              setPreviewModalImage={setPreviewModalImage}
            />
          ) : <div className="text-center text-slate-500 p-8">اختر عميلاً لعرض كشف حسابه</div>}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. كشف حساب الأصناف للعميل (تجميع الأصناف المتشابهة للفترة) */}
      {/* ========================================================================= */}
      {activeReport === 'customer_items' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="كشف مبيعات الأصناف التراكمي للعميل"
            subtitle={customerItemsData.party ? `العميل: ${customerItemsData.party.name}` : undefined}
            docDate={new Date().toISOString().split('T')[0]}
          />
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">تقرير مبيعات الأصناف التراكمي</span>
              <h2 className="text-sm font-bold text-slate-900 mt-1">
                كشف الأصناف المسحوبة للعميل: {customerItemsData.party?.name}
              </h2>
              <p className="text-[10px] text-slate-400 font-light mt-0.5">
                تجميع كميات وقيم الأصناف ومواد الطباعة المسحوبة من قبل العميل للفترة المحددة
              </p>
            </div>

            <div className="text-left">
              <span className="text-[11px] text-slate-400 block">إجمالي قيمة المشتريات:</span>
              <strong className="text-lg font-mono font-bold text-indigo-600">
                {customerItemsData.totalAmount.toLocaleString('ar-SA')} {settings.currency}
              </strong>
              <span className="text-[10px] text-slate-400 block font-mono">
                إجمالي الوحدات: {customerItemsData.totalQuantity.toLocaleString('ar-SA')}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right report-table border-collapse">
              <thead className="bg-slate-800 text-white font-semibold border-b">
                <tr>
                  <th className="text-center w-10 min-w-10">م</th>
                  <th>اسم الصنف / المطبوع</th>
                  <th>التصنيف</th>
                  <th>الوحدة</th>
                  <th className="text-center w-14 min-w-14">إجمالي الكمية</th>
                  <th className="text-left w-20 min-w-20">متوسط السعر</th>
                  <th className="text-left w-24 min-w-24">إجمالي القيمة</th>
                  <th className="text-center w-20 min-w-20">آخر سحب</th>
                  <th className="text-center w-16 min-w-16">عدد الفواتير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {customerItemsData.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400">لا توجد مسحوبات أصناف لهذا العميل خلال الفترة</td>
                  </tr>
                ) : (
                  customerItemsData.items.map((item, itemIdx) => {
                    const avgPrice = item.totalQuantity > 0 ? item.totalAmount / item.totalQuantity : 0;
                    return (
                      <tr key={`cust-item-${item.itemId || itemIdx}-${itemIdx}`} className="hover:bg-slate-50">
                        <td className="font-mono font-bold text-slate-600 text-center">{itemIdx + 1}</td>
                        <td className="font-bold text-slate-900">
                          {item.itemName}
                        </td>
                        <td className="text-slate-600">{item.category}</td>
                        <td className="text-slate-500">{item.unit}</td>
                        <td className="font-mono font-bold text-indigo-700 text-center">
                          {item.totalQuantity.toLocaleString('ar-SA')}
                        </td>
                        <td className="font-mono text-slate-700 text-left">
                          {avgPrice.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} {settings.currency}
                        </td>
                        <td className="font-mono font-bold text-slate-900 text-left">
                          {item.totalAmount.toLocaleString('ar-SA')} {settings.currency}
                        </td>
                        <td className="font-mono text-slate-500 text-center">{item.lastDate}</td>
                        <td className="font-mono text-blue-600 font-semibold text-center">{item.invoiceCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                <tr>
                  <td colSpan={4} className="text-slate-800">الإجمالي العام:</td>
                  <td className="font-mono text-indigo-700 font-black text-center">{customerItemsData.totalQuantity.toLocaleString('ar-SA')}</td>
                  <td></td>
                  <td className="font-mono text-slate-900 font-black text-left">{customerItemsData.totalAmount.toLocaleString('ar-SA')} {settings.currency}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="إعداد التقرير" centerLabel="توقيع وختم العميل بالمطابقة" leftLabel="المدير المالي والاعتماد" />

        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. كشف حساب تفصيلي مورد */}
      {/* ========================================================================= */}
      {activeReport === 'supplier_statement' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-3 print:p-0 print:border-0 print:shadow-none report-a4-container">
          {supplierStatementData.statement ? (
            <UnifiedPartyStatementDocument
              partyStatement={supplierStatementData.statement}
              isCustomer={false}
              settings={settings}
              clientDisplayName={supplierStatementData.party?.name === 'زبون نقدي' && selectedSubSuppObj ? selectedSubSuppObj.name : (supplierStatementData.party?.name || 'غير محدد')}
              fromDate={fromDate}
              toDate={toDate}
              showItemDetails={showStatementItemDetails}
              showImageThumbnailsInStatement={showStatementImageThumbnails}
              setPreviewModalImage={setPreviewModalImage}
            />
          ) : <div className="text-center text-slate-500 p-8">اختر مورداً لعرض كشف حسابه</div>}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. كشف حساب الأصناف للمورد (تجميع الأصناف المتشابهة للفترة) */}
      {/* ========================================================================= */}
      {activeReport === 'supplier_items' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="كشف الخامات والمشتريات التراكمي للمورد"
            subtitle={supplierItemsData.party ? `المورد: ${supplierItemsData.party.name}` : undefined}
            docDate={new Date().toISOString().split('T')[0]}
          />
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">تقرير خامات ومشتريات المورد التراكمي</span>
              <h2 className="text-sm font-bold text-slate-900 mt-1">
                كشف الخامات الموردة من: {supplierItemsData.party?.name}
              </h2>
              <p className="text-[10px] text-slate-400 font-light mt-0.5">
                تجميع الخامات ومستلزمات الإنتاج وألواح الورق الموردة من هذا المورد خلال الفترة المحددة
              </p>
            </div>

            <div className="text-left">
              <span className="text-[11px] text-slate-400 block">إجمالي قيمة التوريدات:</span>
              <strong className="text-lg font-mono font-bold text-amber-700">
                {supplierItemsData.totalAmount.toLocaleString('ar-SA')} {settings.currency}
              </strong>
              <span className="text-[10px] text-slate-400 block font-mono">
                إجمالي الكميات: {supplierItemsData.totalQuantity.toLocaleString('ar-SA')}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right report-table border-collapse">
              <thead className="bg-slate-800 text-white font-semibold border-b">
                <tr>
                  <th>اسم الخامة / الصنف</th>
                  <th className="text-center w-16 min-w-16">إجمالي الكمية</th>
                  <th className="text-left w-24 min-w-24">متوسط التكلفة</th>
                  <th className="text-left w-24 min-w-24">إجمالي القيمة</th>
                  <th className="text-center w-20 min-w-20">آخر توريد</th>
                  <th className="text-center w-16 min-w-16">عدد الفواتير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {supplierItemsData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">لا توجد توريدات أصناف من هذا المورد خلال الفترة</td>
                  </tr>
                ) : (
                  supplierItemsData.items.map((item, itemIdx) => {
                    const avgCost = item.totalQuantity > 0 ? item.totalAmount / item.totalQuantity : 0;
                    return (
                      <tr key={`supp-item-${item.itemId || itemIdx}-${itemIdx}`} className="hover:bg-slate-50">
                        <td className="font-bold text-slate-900">
                          {item.itemName}
                        </td>
                        <td className="font-mono font-bold text-amber-700 text-center">
                          {item.totalQuantity.toLocaleString('ar-SA')}
                        </td>
                        <td className="font-mono text-slate-700 text-left">
                          {avgCost.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} {settings.currency}
                        </td>
                        <td className="font-mono font-bold text-slate-900 text-left">
                          {item.totalAmount.toLocaleString('ar-SA')} {settings.currency}
                        </td>
                        <td className="font-mono text-slate-500 text-center">{item.lastDate}</td>
                        <td className="font-mono text-amber-600 font-semibold text-center">{item.invoiceCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                <tr>
                  <td className="text-slate-800">الإجمالي العام:</td>
                  <td className="font-mono text-amber-700 font-black text-center">{supplierItemsData.totalQuantity.toLocaleString('ar-SA')}</td>
                  <td></td>
                  <td className="font-mono text-slate-900 font-black text-left">{supplierItemsData.totalAmount.toLocaleString('ar-SA')} {settings.currency}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="إعداد التقرير" centerLabel="مصادقة وختم المورد" leftLabel="المدير المالي والاعتماد" />

        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. كشف تفصيلي سندات القبض */}
      {/* ========================================================================= */}
      {activeReport === 'receipt_vouchers' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="تقرير وكشف سندات القبض"
            subtitle="سجل المبالغ المقبوضة والتحصيلات المالية"
            docDate={new Date().toISOString().split('T')[0]}
          />
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">تقرير التحصيلات والمقبوضات</span>
              <h2 className="text-sm font-bold text-slate-900 mt-1">كشف تفصيلي لسندات القبض</h2>
              <p className="text-[10px] text-slate-400 font-light mt-0.5">سجل كافة المبالغ المقبوضة من العملاء وجهات التحصيل المختلفة</p>
            </div>

            <div className="text-left">
              <span className="text-[11px] text-slate-400 block">إجمالي المقبوضات:</span>
              <strong className="text-lg font-mono font-bold text-emerald-600">
                {receiptVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString('ar-SA')} {settings.currency}
              </strong>
              <span className="text-[10px] text-slate-400 block">عدد السندات: {receiptVouchersData.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right report-table border-collapse">
              <thead className="bg-slate-800 text-white font-semibold border-b">
                <tr>
                  <th className="w-20 min-w-20 text-center">رقم السند</th>
                  <th className="w-20 min-w-20 text-center">التاريخ</th>
                  <th>اسم العميل / المستلم منه</th>
                  <th>البيان والشرح</th>
                  <th className="w-20 min-w-20 text-center">طريقة القبض</th>
                  <th className="w-24 min-w-24">الخزينة</th>
                  <th className="w-24 min-w-24 text-left">المبلغ المقبوض</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {receiptVouchersData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">لا توجد سندات قبض مطابقة</td>
                  </tr>
                ) : (
                  receiptVouchersData.map((v, idx) => (
                    <tr key={`${v.id || 'rec-v'}-${idx}`} className="hover:bg-slate-50">
                      <td className="font-mono font-bold text-emerald-700 text-center">{v.voucherNumber}</td>
                      <td className="font-mono text-slate-600 text-center">{v.date}</td>
                      <td className="font-semibold text-slate-900">{v.partyName}</td>
                      <td className="text-slate-600 max-w-[200px] truncate">{v.description}</td>
                      <td className="text-center">
                        <span className="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded text-[10.5px] font-medium">
                          {v.paymentMethod === 'cash' ? 'نقداً' : v.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'شيك'}
                        </span>
                      </td>
                      <td className="text-slate-600 font-medium">
                        {treasuries.find(t => t.accountCode === v.accountCode || t.accountCode === v.treasuryAccountCode)?.name || 'الخزينة'}
                      </td>
                      <td className="font-mono font-bold text-emerald-700 text-left">
                        {v.amount.toLocaleString('ar-SA')} {settings.currency}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                <tr>
                  <td colSpan={6} className="text-slate-800">إجمالي المقبوضات:</td>
                  <td className="font-mono font-black text-emerald-700 text-left">
                    {receiptVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString('ar-SA')} {settings.currency}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="أمين الصندوق / المحصل" centerLabel="المراجع والمحاسب" leftLabel="المدير المالي والاعتماد" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. كشف تفصيلي سندات الصرف */}
      {/* ========================================================================= */}
      {activeReport === 'payment_vouchers' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="تقرير وكشف سندات الصرف"
            subtitle="سجل المدفوعات والمنصرفات والمسددات"
            docDate={new Date().toISOString().split('T')[0]}
          />
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="text-[10px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded">تقرير المدفوعات والمنصرفات</span>
              <h2 className="text-sm font-bold text-slate-900 mt-1">كشف تفصيلي لسندات الصرف</h2>
              <p className="text-[10px] text-slate-400 font-light mt-0.5">سجل المبالغ المسددة للموردين والمصروفات والعهد النقدية والبنكية</p>
            </div>

            <div className="text-left">
              <span className="text-[11px] text-slate-400 block">إجمالي المنصرفات:</span>
              <strong className="text-lg font-mono font-bold text-rose-600">
                {paymentVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString('ar-SA')} {settings.currency}
              </strong>
              <span className="text-[10px] text-slate-400 block">عدد السندات: {paymentVouchersData.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right report-table border-collapse">
              <thead className="bg-slate-800 text-white font-semibold border-b">
                <tr>
                  <th className="w-20 min-w-20 text-center">رقم السند</th>
                  <th className="w-20 min-w-20 text-center">التاريخ</th>
                  <th>المستفيد / المورد</th>
                  <th>البيان والشرح</th>
                  <th className="w-20 min-w-20 text-center">طريقة الصرف</th>
                  <th className="w-24 min-w-24">الخزينة</th>
                  <th className="w-24 min-w-24 text-left">المبلغ المصروف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {paymentVouchersData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">لا توجد سندات صرف مطابقة</td>
                  </tr>
                ) : (
                  paymentVouchersData.map((v, idx) => (
                    <tr key={`${v.id || 'pay-v'}-${idx}`} className="hover:bg-slate-50">
                      <td className="font-mono font-bold text-rose-700 text-center">{v.voucherNumber}</td>
                      <td className="font-mono text-slate-600 text-center">{v.date}</td>
                      <td className="font-semibold text-slate-900">{v.partyName}</td>
                      <td className="text-slate-600 max-w-[200px] truncate">{v.description}</td>
                      <td className="text-center">
                        <span className="bg-rose-50 text-rose-800 px-1.5 py-0.5 rounded text-[10.5px] font-medium">
                          {v.paymentMethod === 'cash' ? 'نقداً' : v.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'شيك'}
                        </span>
                      </td>
                      <td className="text-slate-600 font-medium">
                        {treasuries.find(t => t.accountCode === v.accountCode || t.accountCode === v.treasuryAccountCode)?.name || 'الخزينة'}
                      </td>
                      <td className="font-mono font-bold text-rose-700 text-left">
                        {v.amount.toLocaleString('ar-SA')} {settings.currency}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                <tr>
                  <td colSpan={6} className="text-slate-800">إجمالي المنصرفات:</td>
                  <td className="font-mono font-black text-rose-700 text-left">
                    {paymentVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString('ar-SA')} {settings.currency}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="أمين الصندوق / الصارف" centerLabel="المستلم / المستفيد" leftLabel="المدير المالي والاعتماد" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. كشف حساب تفصيلي موظف */}
      {/* ========================================================================= */}
      {activeReport === 'employee_statement' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          {/* 1. ترويسة كشف الحساب المعتمدة */}
          <PrintHeader />
          <div className="text-center font-bold text-base mb-1 mt-2 text-slate-900 leading-relaxed border-b-2 border-slate-900 pb-2">
            كشف حساب موظف:{' '}
            <span className="text-purple-900">
              {employeeStatementData.employee?.name || 'غير محدد'}
            </span>
            <div className="text-xs text-slate-600 mt-0.5 font-semibold">
              من تاريخ: <span className="font-mono">{fromDate || 'بداية العمل'}</span>{' '}
              إلى تاريخ: <span className="font-mono">{toDate || 'تاريخ اليوم'}</span>
            </div>
          </div>

          {/* 3. جدول الحركات المالي المفصل للموظف */}
          <div className="overflow-x-auto">
            <table className="w-full text-right report-table border-collapse">
              <thead className="bg-slate-800 text-white font-semibold border-b">
                <tr>
                  <th className="text-center w-8 min-w-8">م</th>
                  <th className="text-center w-20 min-w-20">التاريخ</th>
                  <th>البيان والشرح والتفاصيل</th>
                  <th className="text-left w-24 min-w-24 whitespace-nowrap">استحقاق (+)</th>
                  <th className="text-left w-24 min-w-24 whitespace-nowrap">منصرف (-)</th>
                  <th className="text-left w-28 min-w-28 whitespace-nowrap">الرصيد المتبقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {employeeStatementData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 font-bold">
                      لا توجد حركات مسجلة لهذا الموظف خلال الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  employeeStatementData.rows.map((row: any, idx: number) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                      }`}
                    >
                      <td className="text-center text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      <td className="font-mono text-slate-700 text-center whitespace-nowrap">
                        {row.date}
                      </td>
                      <td>
                        <div className="font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-1">
                          <span className="text-slate-900 font-bold">{row.type}</span>
                          {row.refNumber && (
                            <>
                              <span className="text-slate-400 font-normal">-</span>
                              <span className="font-mono font-bold text-slate-800">{row.refNumber}</span>
                            </>
                          )}
                          {row.description && (
                            <>
                              <span className="text-slate-400 font-normal">-</span>
                              <span className="text-slate-700 font-medium">{row.description}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="font-mono font-bold text-purple-700 text-left whitespace-nowrap">
                        {row.dueAmount > 0 ? row.dueAmount.toFixed(2) : '-'}
                      </td>
                      <td className="font-mono font-bold text-rose-700 text-left whitespace-nowrap">
                        {row.paidAmount > 0 ? row.paidAmount.toFixed(2) : '-'}
                      </td>
                      <td className="font-mono font-black text-slate-900 text-left bg-slate-50/70 whitespace-nowrap">
                        {row.runningBalance.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                <tr>
                  <td colSpan={3} className="text-left font-sans">الإجمالي العام للحركات بالفترة:</td>
                  <td className="text-left font-mono text-purple-800 font-black whitespace-nowrap">
                    {employeeStatementData.totalDue.toFixed(2)}
                  </td>
                  <td className="text-left font-mono text-rose-800 font-black whitespace-nowrap">
                    {employeeStatementData.totalPaid.toFixed(2)}
                  </td>
                  <td className="text-left font-mono text-slate-900 font-black bg-slate-200/80 whitespace-nowrap">
                    {employeeStatementData.netBalance.toFixed(2)} {settings.currency}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 4. ملخص نهاية الكشف بعد الجدول بتنسيق رسمي ومضغوط */}
          <div className="mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 shadow-2xs print:border-slate-300">
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {/* 1. إجمالي استحقاقات الفترة */}
              <div className="bg-white border border-purple-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs">
                <span className="font-bold text-purple-900 text-[11px] whitespace-nowrap">إجمالي المستحقات:</span>
                <div className="font-black font-mono text-purple-700 text-xs flex items-center gap-1 whitespace-nowrap">
                  <span>{employeeStatementData.totalDue.toFixed(2)}</span>
                  <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                </div>
              </div>

              {/* 2. إجمالي المنصرف والمسدد للفترة */}
              <div className="bg-white border border-rose-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs">
                <span className="font-bold text-rose-900 text-[11px] whitespace-nowrap">إجمالي المنصرف:</span>
                <div className="font-black font-mono text-rose-700 text-xs flex items-center gap-1 whitespace-nowrap">
                  <span>{employeeStatementData.totalPaid.toFixed(2)}</span>
                  <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                </div>
              </div>

              {/* 3. الإجمالي */}
              <div className={`bg-white border rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs ${
                employeeStatementData.netBalance > 0
                  ? 'border-purple-400 bg-purple-50/20'
                  : employeeStatementData.netBalance < 0
                  ? 'border-rose-400 bg-rose-50/20'
                  : 'border-slate-300'
              }`}>
                <span className="font-bold text-slate-900 text-[11px] whitespace-nowrap">
                  الإجمالي:
                </span>
                <div className={`font-black font-mono text-xs flex items-center gap-1 whitespace-nowrap ${
                  employeeStatementData.netBalance > 0
                    ? 'text-purple-800'
                    : employeeStatementData.netBalance < 0
                    ? 'text-rose-800'
                    : 'text-slate-700'
                }`}>
                  <span>{Math.abs(employeeStatementData.netBalance).toFixed(2)}</span>
                  <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                  <span className="text-[10px] font-sans font-bold">
                    ({employeeStatementData.netBalance > 0 ? 'دائن' : employeeStatementData.netBalance < 0 ? 'مدين' : 'متزن'})
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="المحاسب المسؤول" centerLabel="توقيع واستلام الموظف" leftLabel="المدير العام والاعتماد" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. كشف مسيرات الرواتب */}
      {/* ========================================================================= */}
      {activeReport === 'payroll_sheets' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="كشف مسيرات الرواتب الشهرية"
            subtitle="ملخص الرواتب والبدلات والاستقطاعات المعتمدة"
            docDate={new Date().toISOString().split('T')[0]}
          />
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">شؤون الموظفين والرواتب</span>
              <h2 className="text-sm font-bold text-slate-900 mt-1">كشف مسيرات الرواتب الشهرية</h2>
              <p className="text-[10px] text-slate-400 font-light mt-0.5">ملخص المسيرات المعتمدة والمسودات ومبالغ الرواتب الإجمالية والصافية</p>
            </div>

            <div className="text-left">
              <span className="text-[11px] text-slate-400 block">إجمالي الرواتب المصروفة:</span>
              <strong className="text-lg font-mono font-bold text-blue-700">
                {payrollSheetsData.filter(s => s.status === 'approved').reduce((s, p) => s + p.totalNet, 0).toLocaleString('ar-SA')} {settings.currency}
              </strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right report-table border-collapse">
              <thead className="bg-slate-800 text-white font-semibold border-b">
                <tr>
                  <th className="text-center w-16 min-w-16">رقم المسير</th>
                  <th>شهر الاستحقاق</th>
                  <th className="text-center w-24 min-w-24">الحالة</th>
                  <th className="text-center w-20 min-w-20">عدد الموظفين</th>
                  <th className="text-left w-20 min-w-20">الأساسي</th>
                  <th className="text-left w-20 min-w-20">البدلات</th>
                  <th className="text-left w-20 min-w-20">الاستقطاعات</th>
                  <th className="text-left w-24 min-w-24">صافي الرواتب</th>
                  <th className="text-center w-20 min-w-20">تاريخ الاعتماد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {payrollSheetsData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400">لا توجد مسيرات رواتب مسجلة</td>
                  </tr>
                ) : (
                  payrollSheetsData.map(sheet => {
                    const sheetItems = (sheet as any).items || (sheet as any).lines || [];
                    const employeesCount = sheetItems.length || sheet.employeesCount || 0;
                    return (
                      <tr key={sheet.id} className="hover:bg-slate-50">
                        <td className="font-mono font-bold text-blue-600 text-center">{sheet.sheetNumber}</td>
                        <td className="font-mono font-bold text-slate-900">{sheet.period || (sheet as any).periodMonth || sheet.title}</td>
                        <td className="text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            sheet.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {sheet.status === 'approved' ? 'معتمد ومصروف' : 'مسودة قيد المراجعة'}
                          </span>
                        </td>
                        <td className="font-mono text-center">{employeesCount} موظف</td>
                        <td className="font-mono text-slate-700 text-left">{sheet.totalBasic.toLocaleString('ar-SA')}</td>
                        <td className="font-mono text-emerald-700 text-left">+{sheet.totalAllowances.toLocaleString('ar-SA')}</td>
                        <td className="font-mono text-rose-700 text-left">-{sheet.totalDeductions.toLocaleString('ar-SA')}</td>
                        <td className="font-mono font-bold text-slate-900 text-left">{sheet.totalNet.toLocaleString('ar-SA')} {settings.currency}</td>
                        <td className="font-mono text-slate-500 text-center">{sheet.disbursedAt || (sheet as any).approvedAt || sheet.createdAt || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="إعداد شؤون الموظفين" centerLabel="المراجعة المالية" leftLabel="المدير العام والاعتماد" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. كشف تفصيلي للصناديق */}
      {/* ========================================================================= */}
      {activeReport === 'treasuries_movement' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="كشف حركات الصناديق والحسابات البنكية"
            subtitle="سجل التدفقات النقدية والمقبوضات والمنصرفات"
            docDate={new Date().toISOString().split('T')[0]}
          />
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-2 gap-2">
            <div>
              <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded">إدارة السيولة والخزائن</span>
              <h2 className="text-sm font-bold text-slate-900 mt-1">كشف حركات الصناديق والحسابات البنكية</h2>
              <p className="text-[10px] text-slate-400 font-light mt-0.5">تفاصيل التدفقات النقدية الداخلة والخارجة وحركات العملات الفعلية وأسعار الصرف</p>
            </div>

            {/* Holdings breakdown by currency */}
            <div className="text-right sm:text-left space-y-1">
              <span className="text-[10px] text-slate-400 font-light block font-semibold">الموجودات الفعلية في الصناديق المختارة:</span>
              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                {Object.entries(treasuriesMovementData.targetHoldings).map(([currCode, amt]) => {
                  const currObj = currencies.find(c => c.code === currCode);
                  const sym = currCode === 'ILS' ? '₪' : (currObj?.symbol || currCode);
                  const name = currObj?.name || currCode;
                  const num = Number(amt) || 0;
                  return (
                    <div key={currCode} className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                      <span className="text-slate-500 font-sans">{name}:</span>
                      <strong className="font-mono text-slate-900">{num.toLocaleString('ar-SA')} {sym}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-400">
                المعادل المحاسبي الإجمالي: <strong className="font-mono text-teal-700 font-bold">{treasuriesMovementData.targetTreasuries.reduce((s, t) => s + t.balance, 0).toLocaleString('ar-SA')} ₪</strong>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right report-table border-collapse">
              <thead className="bg-slate-800 text-white font-semibold border-b">
                <tr>
                  <th className="w-20 min-w-20 text-center">التاريخ</th>
                  <th className="w-24 min-w-24">الصندوق</th>
                  <th className="w-20 min-w-20 text-center">العملية</th>
                  <th className="w-16 min-w-16 text-center">المستند</th>
                  <th>الطرف / المستفيد</th>
                  <th className="w-20 min-w-20 text-left">المبلغ الفعلي</th>
                  <th className="w-16 min-w-16 text-center">الصرف</th>
                  <th className="w-20 min-w-20 text-left">وارد (₪)</th>
                  <th className="w-20 min-w-20 text-left">منصرف (₪)</th>
                  <th>البيان والشرح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {treasuriesMovementData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-slate-400">لا توجد حركات مسجلة للصناديق خلال الفترة</td>
                  </tr>
                ) : (
                  treasuriesMovementData.rows.map((row, idx) => {
                    const currObj = currencies.find(c => c.code === row.actualCurrency);
                    const sym = row.actualCurrency === 'ILS' ? '₪' : (currObj?.symbol || row.actualCurrency);

                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="font-mono text-slate-600 text-center whitespace-nowrap">{row.date}</td>
                        <td className="font-semibold text-slate-900">{row.treasuryName}</td>
                        <td className="text-center font-medium whitespace-nowrap">{row.type}</td>
                        <td className="font-mono text-blue-600 font-bold text-center whitespace-nowrap">{row.docNumber}</td>
                        <td className="text-slate-700">{row.partyName}</td>
                        <td className="font-mono font-bold text-slate-900 text-left whitespace-nowrap">
                          {row.actualAmount.toLocaleString('ar-SA')} {sym}
                        </td>
                        <td className="font-mono text-center text-slate-500 whitespace-nowrap">
                          {row.exchangeRate.toFixed(4)}
                        </td>
                        <td className="font-mono font-bold text-emerald-700 text-left whitespace-nowrap">
                          {row.inflow > 0 ? row.inflow.toLocaleString('ar-SA') : '-'}
                        </td>
                        <td className="font-mono font-bold text-rose-700 text-left whitespace-nowrap">
                          {row.outflow > 0 ? row.outflow.toLocaleString('ar-SA') : '-'}
                        </td>
                        <td className="text-slate-500 max-w-[150px] truncate">{row.notes}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                <tr>
                  <td colSpan={7} className="text-slate-800">
                    <div className="space-y-1">
                      <span>إجمالي التدفقات المكافئة (شيكل):</span>
                      {/* Currency Movements Breakdown */}
                      <div className="flex flex-wrap gap-2 text-[10.5px] font-normal text-slate-600">
                        <span>صافي حركة العملات:</span>
                        {Object.entries(treasuriesMovementData.currencyMovements).map(([currCode, mov]) => {
                          const m = mov as { in: number; out: number };
                          const net = m.in - m.out;
                          const currObj = currencies.find(c => c.code === currCode);
                          const sym = currCode === 'ILS' ? '₪' : (currObj?.symbol || currCode);
                          return (
                            <span key={currCode} className={`font-mono font-bold px-1.5 py-0.5 rounded ${net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {currCode}: {net >= 0 ? '+' : ''}{net.toLocaleString('ar-SA')} {sym}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-emerald-700 font-black text-left whitespace-nowrap">
                    +{treasuriesMovementData.totalInflow.toLocaleString('ar-SA')} ₪
                  </td>
                  <td className="font-mono text-rose-700 font-black text-left whitespace-nowrap">
                    -{treasuriesMovementData.totalOutflow.toLocaleString('ar-SA')} ₪
                  </td>
                  <td className="font-mono text-teal-700 font-black text-left whitespace-nowrap">
                    صافي: {treasuriesMovementData.netMovement.toLocaleString('ar-SA')} ₪
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="مسؤول الصندوق" centerLabel="المراجع الداخلي" leftLabel="المدير المالي والاعتماد" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* FINANCIAL STATEMENTS: Income Statement */}
      {/* ========================================================================= */}
      {activeReport === 'income' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="قائمة الدخل والأرباح والخسائر"
            subtitle={`للفترة المنتهية في ${new Date().toLocaleDateString('ar-SA')}`}
            docDate={new Date().toISOString().split('T')[0]}
          />

          <div className="space-y-3 text-xs">
            <div>
              <div className="font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300">
                <span>أولاً: الإيرادات التشغيلية (Revenues)</span>
                <span className="font-mono text-blue-700 font-black">{totalRevenues.toLocaleString('ar-SA')} {settings.currency}</span>
              </div>
              <div className="space-y-1 px-2 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span>إيرادات أعمال ومطبوعات المطبعة:</span>
                  <span className="font-mono font-semibold">{revPrinting.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>إيرادات مبيعات المكتبة والقرطاسية:</span>
                  <span className="font-mono font-semibold">{revBookstore.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>إيرادات خدمات التصوير والتجليد:</span>
                  <span className="font-mono font-semibold">{revServices.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300">
                <span>ثانياً: تكلفة المبيعات والخامات (Cost of Goods Sold)</span>
                <span className="font-mono text-rose-600 font-black">({totalCogs.toLocaleString('ar-SA')}) {settings.currency}</span>
              </div>
              <div className="space-y-1 px-2 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span>تكلفة خامات وأحبار ومستهلكات الطباعة:</span>
                  <span className="font-mono font-semibold">{cogsPrinting.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>تكلفة بضاعة مبيعات القرطاسية والكتب:</span>
                  <span className="font-mono font-semibold">{cogsBookstore.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-300 p-2 rounded flex justify-between text-xs font-bold text-emerald-900">
              <span>مجمل الربح (Gross Profit):</span>
              <span className="font-mono font-black">{grossProfit.toLocaleString('ar-SA')} {settings.currency}</span>
            </div>

            <div>
              <div className="font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300">
                <span>ثالثاً: المصروفات التشغيلية والعمومية (Operating Expenses)</span>
                <span className="font-mono text-rose-600 font-black">({totalExpenses.toLocaleString('ar-SA')}) {settings.currency}</span>
              </div>
              <div className="space-y-1 px-2 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span>مصروفات الرواتب والأجور:</span>
                  <span className="font-mono font-semibold">{expSalaries.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>إيجار المعرض والمطبعة:</span>
                  <span className="font-mono font-semibold">{expRent.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>مصروفات صيانة ماكينات الطباعة:</span>
                  <span className="font-mono font-semibold">{expMaintenance.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>فواتير الكهرباء والمياه:</span>
                  <span className="font-mono font-semibold">{expUtilities.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>مصروفات عمومية وتسويق:</span>
                  <span className="font-mono font-semibold">{expGeneral.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 text-white p-2.5 rounded flex justify-between text-xs font-bold">
              <span>صافي الربح للفترة (Net Profit):</span>
              <span className="font-mono font-black text-emerald-400">{netProfit.toLocaleString('ar-SA')} {settings.currency}</span>
            </div>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="إعداد المحاسب القانوني" centerLabel="المراجع المالي" leftLabel="المدير العام والاعتماد" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* FINANCIAL STATEMENTS: Balance Sheet */}
      {/* ========================================================================= */}
      {activeReport === 'balance_sheet' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="الميزانية العمومية والمركز المالي"
            subtitle={`كما في تاريخ ${new Date().toLocaleDateString('ar-SA')}`}
            docDate={new Date().toISOString().split('T')[0]}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 bg-slate-100 p-1.5 rounded border border-slate-300">
                الجانب الأيمن: الأصول (Assets)
              </h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>نقدية بالصندوق (الكاشير):</span>
                  <span className="font-mono font-semibold">{assetCash.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between">
                  <span>أرصدة البنوك:</span>
                  <span className="font-mono font-semibold">{assetBank.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between">
                  <span>العملاء والذمم المدينة:</span>
                  <span className="font-mono font-semibold">{assetReceivables.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between">
                  <span>مخزون الكتب والقرطاسية:</span>
                  <span className="font-mono font-semibold">{assetInventoryBooks.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between">
                  <span>مخزون الورق وخامات الطباعة:</span>
                  <span className="font-mono font-semibold">{assetInventoryPrint.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between pt-1 border-t font-bold">
                  <span>إجمالي الأصول المتداولة:</span>
                  <span className="font-mono text-blue-700">{totalCurrentAssets.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>آلات ومعدات الطباعة (أصول ثابتة):</span>
                  <span className="font-mono font-semibold">{totalFixedAssets.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between bg-blue-50 border border-blue-200 p-1.5 rounded font-bold text-blue-900 mt-1">
                  <span>مجموع الأصول:</span>
                  <span className="font-mono">{totalAssets.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 bg-slate-100 p-1.5 rounded border border-slate-300">
                الجانب الأيسر: الخصوم وحقوق الملكية
              </h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>الموردون والذمم الدائنة:</span>
                  <span className="font-mono font-semibold">{liabPayables.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between">
                  <span>أمانات ضريبة القيمة المضافة:</span>
                  <span className="font-mono font-semibold">{liabVat.toLocaleString('ar-SA')}</span>
                </div>
                {liabDelivery > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>أمانات ومستحقات عمال التوصيل:</span>
                    <span className="font-mono font-semibold">{liabDelivery.toLocaleString('ar-SA')}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t font-bold">
                  <span>إجمالي الخصوم والالتزامات:</span>
                  <span className="font-mono text-rose-700">{totalLiabilities.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>رأس المال المدفوع:</span>
                  <span className="font-mono font-semibold">{eqCapital.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between">
                  <span>الأرباح المبقاة / المحتجزة:</span>
                  <span className="font-mono font-semibold">{eqRetained.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between">
                  <span>أرباح الفترة الحالية:</span>
                  <span className="font-mono font-semibold text-emerald-600">{netProfit.toLocaleString('ar-SA')}</span>
                </div>
                <div className="flex justify-between bg-blue-50 border border-blue-200 p-1.5 rounded font-bold text-blue-900 mt-1">
                  <span>مجموع الخصوم وحقوق الملكية:</span>
                  <span className="font-mono">{totalEquity.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="إعداد المحاسب القانوني" centerLabel="المراجع المالي" leftLabel="مجلس الإدارة والاعتماد" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* FINANCIAL STATEMENTS: VAT Return */}
      {/* ========================================================================= */}
      {activeReport === 'vat' && (
        <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3">
          <PrintHeader
            title="إقرار ضريبة القيمة المضافة المعتمد"
            subtitle={`الرقم الضريبي: ${settings.taxNumber || '-'}`}
            docDate={new Date().toISOString().split('T')[0]}
          />

          <div className="space-y-3 text-xs">
            <div>
              <div className="font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300">
                <span>1. المبيعات وضريبة المخرجات:</span>
                <span className="font-mono text-blue-700 font-black">{totalOutputVat.toLocaleString('ar-SA')} {settings.currency}</span>
              </div>
              <div className="space-y-1 px-2 text-xs">
                <div className="flex justify-between">
                  <span>المبيعات الخاضعة للنسبة الأساسية ({settings.vatRate || 0}%):</span>
                  <span className="font-mono font-semibold">{totalSalesTaxable.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>ضريبة المخرجات المستحقة:</span>
                  <span className="font-mono font-semibold text-blue-600">{totalOutputVat.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300">
                <span>2. المشتريات وضريبة المدخلات:</span>
                <span className="font-mono text-emerald-700 font-black">{totalInputVat.toLocaleString('ar-SA')} {settings.currency}</span>
              </div>
              <div className="space-y-1 px-2 text-xs">
                <div className="flex justify-between">
                  <span>المشتريات الخاضعة للنسبة الأساسية:</span>
                  <span className="font-mono font-semibold">{totalPurchasesTaxable.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>ضريبة المدخلات القابلة للخصم:</span>
                  <span className="font-mono font-semibold text-emerald-600">{totalInputVat.toLocaleString('ar-SA')} {settings.currency}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 text-white p-2.5 rounded flex justify-between text-xs font-bold">
              <span>صافي الضريبة المستحقة للسداد:</span>
              <span className="font-mono font-black text-amber-400">{netVatPayable.toLocaleString('ar-SA')} {settings.currency}</span>
            </div>
          </div>
          {/* Signatures */}
          <ReportSignatures rightLabel="إعداد مسؤول الضرائب" centerLabel="المراجع القانوني" leftLabel="المفوض بالتوقيع والاعتماد" />
        </div>
      )}

      {/* Image Preview Lightbox Modal */}
      {previewModalImage && (
        <div
          className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 print:hidden"
          onClick={() => setPreviewModalImage(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-sm truncate">{previewModalImage.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-hidden">
              <img
                src={previewModalImage.url}
                alt={previewModalImage.name}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">صورة مصغرة لبند الفاتورة في كشف الحساب</span>
              <button
                type="button"
                onClick={() => setPreviewModalImage(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg cursor-pointer transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
