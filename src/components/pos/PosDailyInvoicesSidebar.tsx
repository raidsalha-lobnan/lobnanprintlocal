import React, { useState, useMemo, useEffect } from 'react';
import { DateInput } from '../../components/common/DateInput';
import { useAccounting } from '../../context/AccountingContext';
import { Invoice, PosInvoiceWorkflowStatus, PaymentMethod, Treasury } from '../../types';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Printer,
  Edit3,
  Coins,
  ArrowDownLeft,
  X,
  Check,
  Building,
  User,
  Plus,
  History,
  Calendar,
  AlignRight,
  Maximize2,
  Minimize2,
  Table as TableIcon,
  LayoutGrid
} from 'lucide-react';
import { InvoiceStatusHistoryModal } from './InvoiceStatusHistoryModal';
import { posSound } from '../../utils/audio';
import {
  WORKFLOW_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  getInvoiceWorkflowStatusMeta,
  getInvoicePaymentStatusMeta,
  computeInvoicePaymentStatus,
  getInvoiceTreasuryDisplay,
  isInvoiceAccountingEligible
} from '../../utils/invoiceStatusUtils';
import { getAllStoredDraftsAsInvoices } from '../../utils/draftsHelper';
import { formatInvoiceCustomerDisplay } from '../../utils/partyUtils';

export type DailyInvoiceFilterTab =
  | 'all'
  | 'drafts'
  | 'customer_only'
  | 'new'
  | 'quotation'
  | 'design'
  | 'pending_approval'
  | 'print_external'
  | 'print_internal'
  | 'ready'
  | 'delivered'
  | 'other'
  | 'paid'
  | 'unpaid_or_credit';

interface PosDailyInvoicesSidebarProps {
  onSelectInvoiceToLoad: (inv: Invoice) => void;
  onPrintInvoice: (inv: Invoice) => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  currentCustomerId?: string;
  currentCustomerName?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

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

export const PosDailyInvoicesSidebar: React.FC<PosDailyInvoicesSidebarProps> = ({
  onSelectInvoiceToLoad,
  onPrintInvoice,
  isOpen = true,
  onClose,
  className = '',
  currentCustomerId,
  currentCustomerName,
  isExpanded = false,
  onToggleExpand
}) => {
  const {
    invoices,
    updateInvoice,
    createPaymentVoucher,
    treasuries,
    currencies,
    settings,
    parties
  } = useAccounting();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [activeFilterTab, setActiveFilterTab] = useState<DailyInvoiceFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Additional Collection Modal State
  const [collectingInvoice, setCollectingInvoice] = useState<Invoice | null>(null);
  const [collectionAmount, setCollectionAmount] = useState<string>('');
  const [collectionMethod, setCollectionMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [collectionCurrencyCode, setCollectionCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [collectionTreasuryCode, setCollectionTreasuryCode] = useState<string>('1101');
  const [collectionNotes, setCollectionNotes] = useState<string>('');
  const [isSuccessMessage, setIsSuccessMessage] = useState<string>('');

  // Status Change Modal / Popover
  const [statusChangingInvoice, setStatusChangingInvoice] = useState<Invoice | null>(null);
  const [targetStatusForModal, setTargetStatusForModal] = useState<PosInvoiceWorkflowStatus | undefined>(undefined);

  const handleOpenStatusModal = (inv: Invoice, targetStatus?: PosInvoiceWorkflowStatus) => {
    setStatusChangingInvoice(inv);
    setTargetStatusForModal(targetStatus);
  };

  const [draftsVersion, setDraftsVersion] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setDraftsVersion(v => v + 1);
    window.addEventListener('accounting_drafts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('accounting_drafts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const rangeInvoices = useMemo(() => {
    const drafts = getAllStoredDraftsAsInvoices();
    const combined = [...drafts, ...invoices];

    return combined
      .filter(inv => {
        // Extract clean invoice date or default to current date if missing
        const todayFallback = new Date().toISOString().split('T')[0];
        const invDate = inv.date || (inv.createdAt ? inv.createdAt.split('T')[0] : todayFallback);
        const invCreatedDate = inv.createdAt ? inv.createdAt.split('T')[0] : invDate;

        if (startDate) {
          if (invDate < startDate && invCreatedDate < startDate) return false;
        }
        if (endDate) {
          if (invDate > endDate && invCreatedDate > endDate) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numB - numA;
        const dateCmp = (b.date || '').localeCompare(a.date || '');
        if (dateCmp !== 0) return dateCmp;
        const createdCmp = (b.createdAt || '').localeCompare(a.createdAt || '');
        if (createdCmp !== 0) return createdCmp;
        return (b.invoiceNumber || b.id || '').localeCompare(a.invoiceNumber || a.id || '', undefined, { numeric: true });
      });
  }, [invoices, startDate, endDate, isOpen, draftsVersion]);

  // Tab counters
  const counts = useMemo(() => {
    const res: Record<DailyInvoiceFilterTab, number> = {
      all: 0,
      drafts: 0,
      customer_only: 0,
      new: 0,
      quotation: 0,
      design: 0,
      pending_approval: 0,
      print_external: 0,
      print_internal: 0,
      ready: 0,
      delivered: 0,
      other: 0,
      paid: 0,
      unpaid_or_credit: 0
    };

    const targetCustName = (currentCustomerName || '').trim().toLowerCase();
    const targetCustId = currentCustomerId;

    rangeInvoices.forEach(inv => {
      const isDraft = (inv as any).isDraft || inv.workflowStatus === ('draft' as any) || inv.status === ('draft' as any);

      if (isDraft) {
        res.drafts++;
        return; // Don't count drafts in sales operational tabs
      }

      res.all++;

      // Check if invoice belongs to current customer
      const invCustName = (inv.customerName || '').trim().toLowerCase();
      const invSubName = (inv.subCustomerName || '').trim().toLowerCase();
      const matchesCustomer =
        (targetCustId && inv.customerId === targetCustId) ||
        (targetCustName && (invCustName === targetCustName || invSubName === targetCustName || (targetCustName !== 'عميل كاشير نقدي' && (invCustName.includes(targetCustName) || invSubName.includes(targetCustName)))));

      if (matchesCustomer) {
        res.customer_only++;
      }

      const wf = inv.workflowStatus || 'new';
      
      const pStatus = inv.paymentStatus || computeInvoicePaymentStatus({
        paymentMethod: inv.paymentMethod,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        remainingAmount: inv.remainingAmount,
        cashPaidAmount: inv.cashPaidAmount,
        bankPaidAmount: inv.bankPaidAmount
      });
      const isPaid = pStatus === 'paid_cash' || pStatus === 'paid_bank' || pStatus === 'paid_cash_bank' || (inv.remainingAmount <= 0 && inv.paidAmount > 0);
      
      if (isPaid) {
        res.paid++;
      } else {
        res.unpaid_or_credit++;
      }

      if (wf === 'new') res.new++;
      else if (wf === 'quotation') res.quotation++;
      else if (wf === 'design' || wf === 'in_progress_design') res.design++;
      else if (wf === 'pending_approval') res.pending_approval++;
      else if (wf === 'print_external' || wf === 'in_progress_external') res.print_external++;
      else if (wf === 'print_internal' || wf === 'in_progress_internal' || wf === 'in_progress') res.print_internal++;
      else if (wf === 'ready') res.ready++;
      else if (wf === 'delivered') res.delivered++;
      else res.other++;
    });

    return res;
  }, [rangeInvoices, currentCustomerId, currentCustomerName]);

  const filteredInvoices = useMemo(() => {
    const targetCustName = (currentCustomerName || '').trim().toLowerCase();
    const targetCustId = currentCustomerId;

    return rangeInvoices.filter(inv => {
      // Search
      if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        const formattedCust = formatInvoiceCustomerDisplay(inv, parties).toLowerCase();
        const matches = 
          inv.invoiceNumber?.toLowerCase().includes(lowerQ) ||
          inv.customerName?.toLowerCase().includes(lowerQ) ||
          inv.subCustomerName?.toLowerCase().includes(lowerQ) ||
          formattedCust.includes(lowerQ) ||
          inv.totalAmount.toString().includes(lowerQ);
        if (!matches) return false;
      }

      const isDraft = (inv as any).isDraft || inv.workflowStatus === ('draft' as any) || inv.status === ('draft' as any);

      // Drafts tab
      if (activeFilterTab === 'drafts') {
        return isDraft;
      }

      // If not in drafts tab, only show confirmed invoices
      if (isDraft) {
        return false;
      }

      // Customer only filter
      if (activeFilterTab === 'customer_only') {
        const invCustName = (inv.customerName || '').trim().toLowerCase();
        const invSubName = (inv.subCustomerName || '').trim().toLowerCase();
        const matchesCust =
          (targetCustId && inv.customerId === targetCustId) ||
          (targetCustName && (invCustName === targetCustName || invSubName === targetCustName || (targetCustName !== 'عميل كاشير نقدي' && (invCustName.includes(targetCustName) || invSubName.includes(targetCustName)))));
        return matchesCust;
      }

      // Tabs
      const wf = inv.workflowStatus || 'new';
      switch (activeFilterTab) {
        case 'all':
          return true;
        case 'new':
          return wf === 'new';
        case 'quotation':
          return wf === 'quotation';
        case 'design':
          return wf === 'design' || wf === 'in_progress_design';
        case 'pending_approval':
          return wf === 'pending_approval';
        case 'print_external':
          return wf === 'print_external' || wf === 'in_progress_external';
        case 'print_internal':
          return wf === 'print_internal' || wf === 'in_progress_internal' || wf === 'in_progress';
        case 'ready':
          return wf === 'ready';
        case 'delivered':
          return wf === 'delivered';
        case 'other':
          return ['deferred', 'paused', 'editing', 'cancelled'].includes(wf);
        case 'paid': {
          const pStatus = inv.paymentStatus || computeInvoicePaymentStatus({
            paymentMethod: inv.paymentMethod,
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
            remainingAmount: inv.remainingAmount,
            cashPaidAmount: inv.cashPaidAmount,
            bankPaidAmount: inv.bankPaidAmount
          });
          return pStatus === 'paid_cash' || pStatus === 'paid_bank' || pStatus === 'paid_cash_bank' || (inv.remainingAmount <= 0 && inv.paidAmount > 0);
        }
        case 'unpaid_or_credit':
          return inv.remainingAmount > 0 || inv.paidAmount === 0;
        default:
          return true;
      }
    });
  }, [rangeInvoices, activeFilterTab, searchQuery, currentCustomerId, currentCustomerName]);

  // Handle Changing Workflow Status
  const handleChangeStatus = (inv: Invoice, newStatus: PosInvoiceWorkflowStatus) => {
    updateInvoice(inv.id, {
      workflowStatus: newStatus
    });
    posSound.playSuccessBeep();
    setStatusChangingInvoice(null);
  };

  // Open Additional Collection Modal
  const handleOpenCollection = (inv: Invoice) => {
    setCollectingInvoice(inv);
    const rem = inv.remainingAmount > 0 ? inv.remainingAmount : 0;
    setCollectionAmount(rem > 0 ? String(rem) : '');
    setCollectionMethod('cash');
    setCollectionCurrencyCode(inv.currency || settings.baseCurrencyCode || 'ILS');
    setCollectionTreasuryCode('1101');
    setCollectionNotes(`دفعة تحصيل إضافية لفاتورة رقم ${inv.invoiceNumber}`);
  };

  // Execute Additional Collection
  const handleExecuteCollection = () => {
    if (!collectingInvoice) return;

    const amountNum = parseFloat(collectionAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('الرجاء إدخال مبلغ تحصيل صحيح');
      return;
    }

    const newPaid = Number(((collectingInvoice.paidAmount || 0) + amountNum).toFixed(2));
    const newRemaining = Math.max(0, Number((collectingInvoice.totalAmount - newPaid).toFixed(2)));
    const newStatus = newRemaining === 0 ? 'paid' : 'partial';

    // Update invoice
    updateInvoice(collectingInvoice.id, {
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status: newStatus
    });

    // Create payment voucher receipt (سند قبض رسمي)
    const partyId = collectingInvoice.customerId || 'pt-cust-1';
    const partyName = collectingInvoice.customerName || 'عميل كاشير نقدي';

    createPaymentVoucher({
      voucherNumber: `RCT-ADD-${Date.now().toString().slice(-5)}`,
      type: 'receipt',
      date: new Date().toISOString().split('T')[0],
      partyId,
      partyName,
      amount: amountNum,
      paymentMethod: collectionMethod,
      accountCode: collectionTreasuryCode,
      description: `سند قبض وتحصيل دفعة لفاتورة #${collectingInvoice.invoiceNumber} - ${collectionNotes}`,
      referenceInvoiceId: collectingInvoice.id,
      currency: collectionCurrencyCode,
      subCustomerId: collectingInvoice.subCustomerId,
      subCustomerName: collectingInvoice.subCustomerName,
      treasuryAccountCode: collectionTreasuryCode
    });

    posSound.playSuccessBeep();
    setIsSuccessMessage(`تم تحصيل ${amountNum.toFixed(2)} بنجاح للفاتورة #${collectingInvoice.invoiceNumber}!`);
    
    setTimeout(() => {
      setIsSuccessMessage('');
      setCollectingInvoice(null);
    }, 1200);
  };

  // Compute Totals
  const totals = useMemo(() => {
    return filteredInvoices.reduce(
      (acc, inv) => {
        acc.count += 1;
        acc.total += Number(inv.totalAmount || 0);
        acc.paid += Number(inv.paidAmount || 0);
        acc.remaining += Number(inv.remainingAmount || 0);
        return acc;
      },
      { count: 0, total: 0, paid: 0, remaining: 0 }
    );
  }, [filteredInvoices]);

  if (!isOpen) return null;

  return (
    <div className={`flex flex-col h-full bg-[#f8fafc] text-slate-800 ${className}`} dir="rtl">
      {/* Header & Controls */}
      <div className="bg-[#1f4a7c] text-white p-2 shrink-0 flex flex-col gap-1.5 shadow-xs">
        {/* Row 1: Title + Category Selector + View Mode + Expand + Close */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 shrink-0">
            <FileText className="w-4 h-4 text-amber-300 shrink-0" />
            <h3 className="font-bold text-xs sm:text-sm leading-none whitespace-nowrap">جدول الفواتير</h3>
          </div>

          {/* Classification selector right next to the title */}
          <div className="flex items-center gap-1 flex-1 min-w-0 mr-0.5">
            <div className="relative flex items-center flex-1 min-w-0 bg-[#153358] border border-blue-400/40 rounded-md px-1.5 py-0.5 shadow-inner">
              <Filter className="w-3.5 h-3.5 text-amber-300 ml-1 shrink-0" />
              <select
                value={activeFilterTab}
                onChange={(e) => setActiveFilterTab(e.target.value as any)}
                className="bg-transparent text-white text-[11px] font-bold focus:outline-none w-full cursor-pointer truncate py-0.5"
                title="تصنيف وفلترة الفواتير"
              >
                <option value="all" className="bg-[#1f4a7c] text-white">الكل ({counts.all})</option>
                {currentCustomerName && (
                  <option value="customer_only" className="bg-[#1f4a7c] text-amber-300 font-bold">
                    👤 فواتير الزبون: {currentCustomerName} ({counts.customer_only})
                  </option>
                )}
                <option value="unpaid_or_credit" className="bg-[#1f4a7c] text-white">ذمم وآجل ({counts.unpaid_or_credit})</option>
                <option value="paid" className="bg-[#1f4a7c] text-white">مسددة ({counts.paid})</option>
                <option value="new" className="bg-[#1f4a7c] text-white">جديدة ({counts.new})</option>
                <option value="quotation" className="bg-[#1f4a7c] text-white">عروض ({counts.quotation})</option>
                <option value="design" className="bg-[#1f4a7c] text-white">تصميم ({counts.design})</option>
                <option value="print_internal" className="bg-[#1f4a7c] text-white">طباعة داخلي ({counts.print_internal})</option>
                <option value="print_external" className="bg-[#1f4a7c] text-white">طباعة خارجي ({counts.print_external})</option>
                <option value="ready" className="bg-[#1f4a7c] text-white">جاهزة ({counts.ready})</option>
                <option value="delivered" className="bg-[#1f4a7c] text-white">مسلمة ({counts.delivered})</option>
                <option value="other" className="bg-[#1f4a7c] text-white">أخرى ({counts.other})</option>
              </select>
            </div>
            <span className="text-[10px] bg-blue-600/90 text-white px-1.5 py-0.5 rounded-full font-black shrink-0">
              {filteredInvoices.length}
            </span>
          </div>

          {/* View mode toggle + expand toggle + Close */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center bg-[#153358] border border-blue-400/40 rounded p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                  viewMode === 'table' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-blue-200 hover:text-white'
                }`}
                title="عرض جدول منظم"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                  viewMode === 'cards' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-blue-200 hover:text-white'
                }`}
                title="عرض بطاقات مدمجة"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="text-blue-200 hover:text-white rounded hover:bg-white/10 p-1 transition-colors shrink-0 cursor-pointer"
                title={isExpanded ? 'تصغير عرض الشريط' : 'توسيع عرض الشريط للجدول'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-blue-200 hover:text-white rounded hover:bg-white/10 p-1 transition-colors shrink-0 cursor-pointer"
                title="إغلاق السجل"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Date Range (من - إلى) */}
        <div className="flex items-center gap-1.5 bg-[#153358]/90 p-1 rounded-md border border-blue-400/25">
          <Calendar className="w-3.5 h-3.5 text-blue-200 ml-0.5 shrink-0" />
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[10px] text-blue-200 font-bold shrink-0">من:</span>
            <DateInput
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-[#1f4a7c] text-white text-[10.5px] font-mono px-1 py-0.5 rounded border border-blue-400/30 focus:outline-none cursor-pointer w-full text-center"
            />
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[10px] text-blue-200 font-bold shrink-0">إلى:</span>
            <DateInput
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-[#1f4a7c] text-white text-[10.5px] font-mono px-1 py-0.5 rounded border border-blue-400/30 focus:outline-none cursor-pointer w-full text-center"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setStartDate(todayStr);
                setEndDate(todayStr);
              }}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 transition-colors cursor-pointer ${
                startDate === todayStr && endDate === todayStr
                  ? 'bg-blue-500 text-white shadow-2xs font-black'
                  : 'bg-[#1f4a7c] hover:bg-blue-600 text-blue-100'
              }`}
              title="عرض فواتير اليوم"
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 transition-colors cursor-pointer ${
                !startDate && !endDate
                  ? 'bg-amber-500 text-white shadow-2xs font-black'
                  : 'bg-[#1f4a7c] hover:bg-blue-600 text-blue-100'
              }`}
              title="عرض كشوف وفواتير كافة الأيام وكافة المستخدمين"
            >
              كافة التواريخ
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border-b border-slate-200 p-1.5 shrink-0">
        <div className="relative">
          <Search className="absolute right-2 top-1.5 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم، عميل، أو مبلغ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-2 pr-7 py-1 border border-slate-300 rounded text-[11px] font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-slate-50 flex flex-col min-h-0">
        {filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3 p-6 my-auto">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="w-7 h-7 text-slate-300" />
            </div>
            <p className="font-bold text-xs text-center px-4">لا توجد فواتير مطابقة للبحث أو الفلتر في الفترة المحددة</p>
          </div>
        ) : viewMode === 'table' ? (
          /* ======================================================== */
          /* REAL DATA TABLE VIEW (الجدول المحاسبي المنظم) */
          /* ======================================================== */
          <div className="flex-1 overflow-auto bg-white flex flex-col min-h-0">
            <div className="min-w-full overflow-x-auto flex-1">
              <table className="w-full text-right text-xs border-collapse select-text">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-300 shadow-2xs">
                  <tr>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-[75px]"># الفاتورة</th>
                    <th className="py-2 px-2 whitespace-nowrap min-w-[130px]">العميل / البيان</th>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-[68px]">الإجمالي</th>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-[68px]">المدفوع</th>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-[68px]">الباقي</th>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-[60px]">الدفع</th>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-[95px]">الحالة</th>
                    <th className="py-2 px-2 text-center whitespace-nowrap w-[85px]">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredInvoices.map((inv, idx) => {
                    const pMeta = getInvoicePaymentStatusMeta(
                      inv.paymentStatus ||
                        computeInvoicePaymentStatus({
                          paymentMethod: inv.paymentMethod,
                          totalAmount: inv.totalAmount,
                          paidAmount: inv.paidAmount,
                          remainingAmount: inv.remainingAmount,
                          cashPaidAmount: inv.cashPaidAmount,
                          bankPaidAmount: inv.bankPaidAmount
                        })
                    );
                    const methodStr =
                      inv.paymentMethod === 'cash'
                        ? 'نقدي'
                        : inv.paymentMethod === 'bank_transfer'
                        ? 'بنكي'
                        : inv.paymentMethod === 'card'
                        ? 'بطاقة'
                        : inv.paymentMethod === 'credit'
                        ? 'آجل'
                        : 'متعدد';
                    const wMeta = getInvoiceWorkflowStatusMeta(inv.workflowStatus || 'new');
                    const hasRemaining = (inv.remainingAmount || 0) > 0.001;

                    return (
                      <tr
                        key={`sidebar-table-${inv.id || idx}-${idx}`}
                        className="hover:bg-blue-50/70 transition-colors group cursor-pointer odd:bg-white even:bg-slate-50/60"
                        onClick={() => onSelectInvoiceToLoad(inv)}
                        title="انقر لتحميل الفاتورة مباشرة إلى شاشة الكاشير"
                      >
                        {/* # الفاتورة */}
                        <td className="py-2 px-2 text-center whitespace-nowrap align-middle">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectInvoiceToLoad(inv);
                            }}
                            className="font-mono font-black text-[11px] text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white rounded px-1.5 py-0.5 border border-blue-200 hover:border-blue-600 transition-colors inline-block shadow-2xs cursor-pointer"
                            title="تحميل إلى شاشة الكاشير"
                          >
                            {inv.invoiceNumber}
                          </button>
                          {inv.time && (
                            <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                              {inv.time.slice(0, 5)}
                            </div>
                          )}
                        </td>

                        {/* العميل / البيان */}
                        <td className="py-2 px-2 align-middle">
                          <div className="font-bold text-slate-900 text-xs truncate max-w-[170px]" title={formatInvoiceCustomerDisplay(inv, parties)}>
                            {formatInvoiceCustomerDisplay(inv, parties)}
                          </div>
                          {(inv.notes || inv.paymentNotes) && (
                            <div
                              className="text-[10px] text-slate-500 truncate max-w-[170px]"
                              title={[inv.notes, inv.paymentNotes].filter(Boolean).join(' - ')}
                            >
                              {[inv.notes, inv.paymentNotes].filter(Boolean).join(' - ')}
                            </div>
                          )}
                          {inv.items && inv.items.some(it => it.imageThumbnail) && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] text-blue-700 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded font-bold inline-flex items-center gap-0.5" title="الفاتورة تحتوي صور مرفقة">
                                📷 صور ({inv.items.filter(it => it.imageThumbnail).length})
                              </span>
                              <div className="flex -space-x-1 rtl:space-x-reverse overflow-hidden">
                                {inv.items.filter(it => it.imageThumbnail).flatMap(it => parseThumbnails(it.imageThumbnail)).slice(0, 3).map((img, iIdx) => (
                                  <img key={iIdx} src={img} alt="" className="w-5 h-5 rounded object-cover border border-white ring-1 ring-slate-200 inline-block" />
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* الإجمالي */}
                        <td className="py-2 px-2 text-center whitespace-nowrap font-mono font-bold text-slate-800 text-xs align-middle">
                          {(Number(inv.totalAmount) || 0).toFixed(2)}
                        </td>

                        {/* المدفوع */}
                        <td className="py-2 px-2 text-center whitespace-nowrap font-mono font-semibold text-emerald-700 text-xs align-middle">
                          {(Number(inv.paidAmount) || 0).toFixed(2)}
                        </td>

                        {/* الباقي */}
                        <td className="py-2 px-2 text-center whitespace-nowrap font-mono align-middle">
                          {hasRemaining ? (
                            <span className="font-black text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.5 rounded text-xs inline-block">
                              {(Number(inv.remainingAmount) || 0).toFixed(2)}
                            </span>
                          ) : (
                            <span className="font-semibold text-emerald-600 text-xs">0.00</span>
                          )}
                        </td>

                        {/* طريقة الدفع والسيولة */}
                        <td className="py-2 px-2 text-center whitespace-nowrap align-middle">
                          {(() => {
                            const tInfo = getInvoiceTreasuryDisplay(inv, treasuries);
                            return (
                              <span
                                className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${pMeta.bgColor} ${pMeta.color} ${pMeta.borderColor} inline-block leading-none max-w-[125px] truncate`}
                                title={`${methodStr} - ${tInfo.label}`}
                              >
                                {tInfo.label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* الحالة */}
                        <td
                          className="py-2 px-2 text-center whitespace-nowrap align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={inv.workflowStatus || 'new'}
                            onChange={(e) =>
                              handleChangeStatus(inv, e.target.value as PosInvoiceWorkflowStatus)
                            }
                            className={`text-[10px] font-black px-1.5 py-1 rounded border cursor-pointer focus:outline-none w-full max-w-[95px] truncate ${wMeta.bgColor} ${wMeta.color} ${wMeta.borderColor}`}
                            title="تغيير الحالة تلقائياً"
                          >
                            {WORKFLOW_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id} className="bg-white text-slate-800">
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* إجراءات */}
                        <td
                          className="py-2 px-2 text-center whitespace-nowrap align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelectInvoiceToLoad(inv)}
                              className="p-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors cursor-pointer"
                              title="تعديل وتحميل إلى شاشة الكاشير"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {hasRemaining && (
                              <button
                                type="button"
                                onClick={() => handleOpenCollection(inv)}
                                className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200 transition-colors cursor-pointer"
                                title="تحصيل دفعة إضافية"
                              >
                                <Coins className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onPrintInvoice(inv)}
                              className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 transition-colors cursor-pointer"
                              title="طباعة الفاتورة"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenStatusModal(inv)}
                              className="p-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded border border-purple-200 transition-colors cursor-pointer"
                              title="سجل الحركات والتتبع"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sticky Table Footer Summary */}
            <div className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-300 p-2 text-slate-800 text-xs shadow-md">
              <div className="flex items-center justify-between gap-2 font-mono">
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                  <span>العدد:</span>
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-black">{totals.count}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="text-center">
                    <span className="text-[10px] text-slate-500 block leading-none">الإجمالي</span>
                    <span className="font-black text-slate-900">{(Number(totals.total) || 0).toFixed(2)}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-emerald-600 block leading-none">المدفوع</span>
                    <span className="font-black text-emerald-700">{(Number(totals.paid) || 0).toFixed(2)}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-rose-600 block leading-none">الباقي</span>
                    <span className="font-black text-rose-700">{(Number(totals.remaining) || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Cards View fallback */
          <div className="flex flex-col gap-2 p-2 pb-10">
            {filteredInvoices.map((inv, idx) => {
              const pMeta = getInvoicePaymentStatusMeta(
                inv.paymentStatus ||
                  computeInvoicePaymentStatus({
                    paymentMethod: inv.paymentMethod,
                    totalAmount: inv.totalAmount,
                    paidAmount: inv.paidAmount,
                    remainingAmount: inv.remainingAmount,
                    cashPaidAmount: inv.cashPaidAmount,
                    bankPaidAmount: inv.bankPaidAmount
                  })
              );
              const methodStr =
                inv.paymentMethod === 'cash'
                  ? 'نقدي'
                  : inv.paymentMethod === 'bank_transfer'
                  ? 'بنكي'
                  : inv.paymentMethod === 'card'
                  ? 'بطاقة'
                  : inv.paymentMethod === 'credit'
                  ? 'آجل'
                  : 'متعدد';
              const wMeta = getInvoiceWorkflowStatusMeta(inv.workflowStatus || 'new');
              const hasRemaining = (inv.remainingAmount || 0) > 0.001;

              return (
                <div
                  key={`sidebar-card-${inv.id || idx}-${idx}`}
                  className="bg-white border border-slate-200 hover:border-blue-400 transition-colors rounded-lg p-2 shadow-xs flex flex-col gap-1.5 group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-800 text-[13px] truncate flex-1 leading-none pt-0.5" title={formatInvoiceCustomerDisplay(inv, parties)}>
                      {formatInvoiceCustomerDisplay(inv, parties)}
                    </div>
                    <div
                      className="flex items-center justify-between shrink-0 text-xs font-mono bg-slate-50 border border-slate-100 rounded px-1 py-0.5"
                      style={{ width: '135px' }}
                      dir="rtl"
                    >
                      <div className="w-[45px] text-center font-bold text-slate-800 shrink-0">
                        {(Number(inv.totalAmount) || 0).toFixed(2)}
                      </div>
                      <div className="w-[45px] text-center font-bold text-emerald-700 shrink-0">
                        {(Number(inv.paidAmount) || 0).toFixed(2)}
                      </div>
                      <div className="w-[45px] text-center font-black text-rose-700 shrink-0">
                        {hasRemaining ? (Number(inv.remainingAmount) || 0).toFixed(2) : '0.00'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 text-[11px] text-slate-600 truncate">
                      <span
                        className={`font-black px-1.5 py-0.5 rounded border ${pMeta.bgColor} ${pMeta.color} ${pMeta.borderColor} shrink-0 leading-none`}
                      >
                        {methodStr}
                      </span>
                      <span className="truncate max-w-[200px] sm:max-w-[300px]">
                        {[inv.notes, inv.paymentNotes].filter(Boolean).join(' - ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={inv.workflowStatus || 'new'}
                        onChange={(e) =>
                          handleChangeStatus(inv, e.target.value as PosInvoiceWorkflowStatus)
                        }
                        className={`text-[10px] font-black px-1.5 py-1 rounded border cursor-pointer focus:outline-none ${wMeta.bgColor} ${wMeta.color} ${wMeta.borderColor}`}
                        title="تغيير الحالة تلقائياً"
                      >
                        {WORKFLOW_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => onSelectInvoiceToLoad(inv)}
                        className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
                        title="تعديل"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {hasRemaining && (
                        <button
                          onClick={() => handleOpenCollection(inv)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded transition-colors"
                          title="تحصيل"
                        >
                          <Coins className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Change & Audit History Modal */}
      {statusChangingInvoice && (
        <InvoiceStatusHistoryModal
          invoice={statusChangingInvoice}
          isOpen={!!statusChangingInvoice}
          onClose={() => {
            setStatusChangingInvoice(null);
            setTargetStatusForModal(undefined);
          }}
          initialTargetStatus={targetStatusForModal}
        />
      )}

      {/* Additional Collection Modal */}
      {collectingInvoice && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 p-5 w-full max-w-md text-xs text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    تحصيل إضافي لفاتورة #{collectingInvoice.invoiceNumber}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-light">
                    العميل: {collectingInvoice.customerName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCollectingInvoice(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Financial Overview Card */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center font-mono">
              <div>
                <span className="text-[9px] text-slate-400 font-light block">إجمالي الفاتورة:</span>
                <span className="font-bold text-slate-900">
                  {(Number(collectingInvoice.totalAmount) || 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 font-light block">المدفوع سابقاً:</span>
                <span className="font-bold text-emerald-700">
                  {(Number(collectingInvoice.paidAmount) || 0).toFixed(2)}
                </span>
              </div>
              <div className="bg-rose-50 rounded-lg p-1 border border-rose-200">
                <span className="text-[10px] text-rose-600 block font-bold">المتبقي المطلوب:</span>
                <span className="font-black text-rose-700">
                  {(Number(collectingInvoice.remainingAmount) || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Collection Fields */}
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مبلغ الدفعة الإضافية المراد تحصيلها الآن:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={collectingInvoice.remainingAmount}
                    value={collectionAmount}
                    onChange={e => setCollectionAmount(e.target.value)}
                    placeholder="أدخل المبلغ..."
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-black text-sm text-emerald-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setCollectionAmount(String(collectingInvoice.remainingAmount))}
                    className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    سداد كامل المتبقي
                  </button>
                </div>
              </div>

              {/* Payment Method & Currency */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">طريقة السداد:</label>
                  <select
                    value={collectionMethod}
                    onChange={e => setCollectionMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                  >
                    <option value="cash">نقدي (Cash)</option>
                    <option value="bank_transfer">تحويل بنكي / مدى</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">عملة السداد:</label>
                  <select
                    value={collectionCurrencyCode}
                    onChange={e => setCollectionCurrencyCode(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                  >
                    {currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Treasury Account (الصندوق / البنك) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  إيداع في الصندوق / الحساب البنكي (حسب العملة):
                </label>
                <select
                  value={collectionTreasuryCode}
                  onChange={e => setCollectionTreasuryCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                >
                  {treasuries.map(t => (
                    <option key={t.id} value={t.accountCode}>
                      {t.name} - رصيد: {t.balance.toFixed(2)} ({t.currency || '₪'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات التحصيل:</label>
                <input
                  type="text"
                  value={collectionNotes}
                  onChange={e => setCollectionNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
            </div>

            {/* Success Alert */}
            {isSuccessMessage && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-2.5 rounded-xl font-bold text-center flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>{isSuccessMessage}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCollectingInvoice(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteCollection}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد التحصيل والإيداع</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
