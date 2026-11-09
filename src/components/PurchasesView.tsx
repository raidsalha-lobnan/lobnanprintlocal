import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { PurchaseInvoice, PurchaseReturn, PaymentMethod, Party, PaymentVoucher } from '../types';
import {
  Truck,
  Plus,
  Search,
  Calendar,
  Layers,
  Trash2,
  DollarSign,
  CheckCircle,
  Building2,
  Printer,
  RotateCcw,
  Receipt,
  FileText,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  RefreshCw,
  Coins,
  Edit2,
  Phone,
  Mail,
  MapPin,
  User,
  Lock,
  ExternalLink,
  Filter,
  Check,
  Building
} from 'lucide-react';
import { SupplierModal } from './purchases/SupplierModal';
import { SuppliersCompactDirectory } from './SuppliersCompactDirectory';
import {PurchaseInvoiceLinesTable,emptyPurchaseLine,purchaseDraftForItem,purchaseLineAmounts,purchaseLineSummary,type PurchaseLineDraft} from './purchases/PurchaseInvoiceLinesTable';
import {PurchaseInvoiceFooter} from './purchases/PurchaseInvoiceFooter';
import {calculatePurchaseBreakdown,calculatePurchaseSettlement,purchaseMoney,type PurchasePaymentLeg} from '../utils/purchasePaymentConsole';
import { PaymentVoucherModal } from './purchases/PaymentVoucherModal';
import { AutocompleteCombobox } from './common/AutocompleteCombobox';

interface PurchasesViewProps {
  initialTab?: 'suppliers' | 'invoices' | 'returns' | 'vouchers';
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ initialTab = 'suppliers' }) => {
  const {
    purchases,
    purchaseReturns,
    vouchers,
    invoices,
    salesReturns,
    printOrders,
    debtClearings,
    parties,
    addParty,
    inventory,
    addInventoryItem,
    treasuries,
    createPurchaseInvoice,
    deletePurchaseInvoice,
    createPurchaseReturn,
    deletePurchaseReturn,
    deletePaymentVoucher,
    deleteParty,
    setSelectedPurchaseForPrint,
    setSelectedReturnForPrint,
    setSelectedVoucherForPrint,
    setSelectedPartyForStatement,
    settings,
    currencies
  } = useAccounting();

  // Top Active Tab: Suppliers vs Invoices vs Returns vs Payment Vouchers
  const [activeTab, setActiveTabState] = useState<'suppliers' | 'invoices' | 'returns' | 'vouchers'>(initialTab);

  const setActiveTab = React.useCallback((tab: 'suppliers' | 'invoices' | 'returns' | 'vouchers') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('purchases_subtab', tab);
    } catch {}
  }, []);

  React.useEffect(() => { setActiveTabState(initialTab); }, [initialTab]);
  const [searchQuery, setSearchQuery] = useState('');

  // Suppliers Management State
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<Party | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<'all' | 'creditor' | 'debtor' | 'balanced'>('all');

  // Supplier Payment Voucher Modal State
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [voucherToEdit, setVoucherToEdit] = useState<PaymentVoucher | null>(null);
  const [voucherTargetSupplier, setVoucherTargetSupplier] = useState<Party | null>(null);
  const [voucherDefaultAmount, setVoucherDefaultAmount] = useState<number | undefined>(undefined);

  // New Purchase Invoice Modal State
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceCurrency, setInvoiceCurrency] = useState(settings.baseCurrencyCode || 'ILS');
  const [invoiceExchangeRate, setInvoiceExchangeRate] = useState<number>(1.0);
  const [cashPurchasePayment,setCashPurchasePayment]=useState<PurchasePaymentLeg>({
    amount:0,currency:'ILS',rate:1,treasuryCode:''
  });
  const [bankPurchasePayment,setBankPurchasePayment]=useState<PurchasePaymentLeg>({
    amount:0,currency:'ILS',rate:1,treasuryCode:''
  });
  const [overallPurchaseDiscount,setOverallPurchaseDiscount]=useState(0);
  const [purchaseAdditionalCharges,setPurchaseAdditionalCharges]=useState(0);
  const [purchasePaymentNotes,setPurchasePaymentNotes]=useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState<number>(settings.vatRate || 0);
  const [items, setItems] = useState<PurchaseLineDraft[]>(()=>[emptyPurchaseLine()]);

  // New Purchase Return Modal State
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [linkedPurchaseId, setLinkedPurchaseId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [returnReason, setReturnReason] = useState('خامات غير مطابقة للمواصفات');
  const [settlementType, setSettlementType] = useState<'credit_balance' | 'cash_refund'>('credit_balance');
  const [returnTreasuryCode, setReturnTreasuryCode] = useState('1101');
  const [returnItems, setReturnItems] = useState<Array<{ itemId: string; itemName: string; quantity: number; unitPrice: number }>>([]);
  const [returnNotes, setReturnNotes] = useState('');

  // All suppliers list (both or supplier type)
  const suppliers = useMemo(() => {
    return parties.filter(p => p.type === 'supplier' || p.type === 'both');
  }, [parties]);

  // Next purchase invoice number preview
  const previewPurchaseNumber = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearPrefix = `PUR-${currentYear}-`;
    let maxSeq = 0;
    purchases.forEach(p => {
      if (p.invoiceNumber && p.invoiceNumber.startsWith(yearPrefix)) {
        const seq = parseInt(p.invoiceNumber.substring(yearPrefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
    return `${yearPrefix}${String(Math.max(purchases.length + 1, maxSeq + 1)).padStart(4, '0')}`;
  }, [purchases]);

  // Next purchase return number preview
  const previewReturnNumber = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearPrefix = `PRN-${currentYear}-`;
    let maxSeq = 0;
    purchaseReturns.forEach(r => {
      if (r.returnNumber && r.returnNumber.startsWith(yearPrefix)) {
        const seq = parseInt(r.returnNumber.substring(yearPrefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
    return `${yearPrefix}${String(Math.max(purchaseReturns.length + 1, maxSeq + 1)).padStart(4, '0')}`;
  }, [purchaseReturns]);

  const handleQuickAddPurchaseItem = async (name:string,index:number,price:number)=>{
    const trimmed=name.trim();if(!trimmed)return;
    const item=addInventoryItem({
      name:trimmed,code:'',barcode:'',category:'خامات ومستلزمات عامة',
      unit:'قطعة',purchasePrice:Math.max(0,Number(price)||0),
      sellingPrice:0,stockQuantity:0,minAlertQuantity:5
    });
    setItems(prev=>prev.map((r,k)=>k===index?purchaseDraftForItem(item,r):r));
  };

  const handleCurrencyChange = (currCode: string) => {
    setInvoiceCurrency(currCode);
    const curr = currencies.find(c => c.code === currCode);
    const rate=currCode==='ILS'?1:curr?.rateAgainstBase||1;
    setInvoiceExchangeRate(rate);
    setCashPurchasePayment(prev=>prev.currency===currCode?{...prev,rate}:prev);
    setBankPurchasePayment(prev=>prev.currency===currCode?{...prev,rate}:prev);
  };

  // Calculations for Purchase Invoice
  const purchaseTotals=purchaseLineSummary(items,taxRate);
  const purchaseBreakdown=(()=>{
    try{return calculatePurchaseBreakdown(items,taxRate,
      overallPurchaseDiscount,purchaseAdditionalCharges);}
    catch{return null;}
  })();
  const subtotal=purchaseBreakdown?.subtotal||0;
  const taxAmount=purchaseBreakdown?.tax||0;
  const grandTotal=purchaseBreakdown?.total||0;
  const purchaseSettlement=(()=>{
    if(!purchaseBreakdown)return null;
    try{return calculatePurchaseSettlement(grandTotal,invoiceExchangeRate,
      cashPurchasePayment,bankPurchasePayment);}
    catch{return null;}
  })();
  const cashPurchaseAccounts=treasuries.filter(t=>t.status==='active'&&t.type==='cash_box');
  const bankPurchaseAccounts=treasuries.filter(t=>t.status==='active'&&t.type!=='cash_box');
  const validPurchasePayment=!!purchaseSettlement&&
    (cashPurchasePayment.amount===0||cashPurchaseAccounts.some(t=>t.accountCode===cashPurchasePayment.treasuryCode))&&
    (bankPurchasePayment.amount===0||bankPurchaseAccounts.some(t=>t.accountCode===bankPurchasePayment.treasuryCode));
  const quickPayPurchase=(method:'cash'|'bank')=>{
    const target=method==='cash'?cashPurchasePayment:bankPurchasePayment;
    const other=method==='cash'?bankPurchasePayment:cashPurchasePayment;
    const limit=purchaseMoney(grandTotal*invoiceExchangeRate);
    const otherBase=purchaseMoney(other.amount*other.rate);
    const remainBase=Math.max(0,purchaseMoney(limit-otherBase));
    const amount=Math.max(0,Math.floor(remainBase/target.rate*100+1e-7)/100);
    const eligible=method==='cash'?cashPurchaseAccounts:bankPurchaseAccounts;
    const setter=method==='cash'?setCashPurchasePayment:setBankPurchasePayment;
    setter(prev=>({...prev,amount:purchaseMoney(amount),
      treasuryCode:prev.treasuryCode||eligible[0]?.accountCode||''}));
  };

  const handleOpenNewPurchase = (preselectedSupplier?: Party) => {
    if (preselectedSupplier) {
      setSupplierId(preselectedSupplier.id);
    } else if (suppliers.length > 0) {
      setSupplierId(suppliers[0].id);
    }
    setSupplierInvoiceNumber('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setInvoiceCurrency(settings.baseCurrencyCode || 'ILS');
    setInvoiceExchangeRate(1.0);
    setCashPurchasePayment({amount:0,currency:'ILS',rate:1,
      treasuryCode:cashPurchaseAccounts[0]?.accountCode||''});
    setBankPurchasePayment({amount:0,currency:'ILS',rate:1,
      treasuryCode:bankPurchaseAccounts[0]?.accountCode||''});
    setOverallPurchaseDiscount(0);
    setPurchaseAdditionalCharges(0);
    setPurchasePaymentNotes('');
    setNotes('');
    setItems([emptyPurchaseLine()]);
    setShowNewPurchaseModal(true);
  };

  const handleSavePurchase=(e:React.FormEvent)=>{
    e.preventDefault();
    const supplier=suppliers.find(s=>s.id===supplierId);
    if(!supplier){alert('يجب اختيار المورد الصحيح.');return;}
    if(!purchaseDate){alert('يجب تحديد تاريخ الفاتورة.');return;}
    if(!purchaseTotals.valid||!purchaseBreakdown||!purchaseSettlement){
      alert('راجع بنود فاتورة المشتريات والخصم والإضافة وضريبة المدخلات وسعر الصرف؛ يجب أن تكون جميع القيم صحيحة.');return;
    }
    if(!validPurchasePayment){
      alert('تأكد من عدم تجاوز إجمالي الفاتورة وحدد الصندوق النقدي والحساب البنكي الصحيح لكل دفعة.');return;
    }
    const currencyInfo=currencies.find(curr=>curr.code===invoiceCurrency);
    const purchaseItems=items.map((line,i)=>{
      const amount=purchaseLineAmounts(line,taxRate);
      const final=purchaseBreakdown.lines[i];
      return {itemId:line.itemId,itemName:line.itemName,itemCode:line.itemCode,
        barcode:line.barcode,notes:line.notes,unit:line.unit,
        unitCalculationType:line.unitCalculationType,hasDimensions:line.hasDimensions,
        length:line.length,width:line.width,count:line.count,
        quantity:amount.quantity,unitPrice:line.unitPrice,
        discount:final.discount,tax:final.tax,total:final.net,
        totalAfterTax:final.total};
    });
    const paymentMethod:PaymentMethod=bankPurchasePayment.amount>0?
      'bank_transfer':cashPurchasePayment.amount>0?'cash':'credit';
    try{
      createPurchaseInvoice({
        date:purchaseDate,supplierId:supplier.id,supplierName:supplier.name,
        supplierInvoiceNumber:supplierInvoiceNumber.trim()||undefined,
        currency:invoiceCurrency,currencySymbol:currencyInfo?.symbol||settings.currency||'₪',
        exchangeRate:invoiceExchangeRate,items:purchaseItems,
        subtotal,taxRate,taxAmount,totalAmount:grandTotal,
        paidAmount:purchaseSettlement.paidInvoice,
        paymentMethod,
        treasuryAccountCode:paymentMethod==='cash'?cashPurchasePayment.treasuryCode:
          bankPurchasePayment.treasuryCode,
        notes,overallDiscountPercent:overallPurchaseDiscount,
        overallDiscountAmount:purchaseBreakdown.overallDiscount,
        additionalCharges:purchaseAdditionalCharges,
        cashPaidAmount:cashPurchasePayment.amount,
        cashPaymentCurrency:cashPurchasePayment.currency,
        cashPaymentExchangeRate:cashPurchasePayment.rate,
        cashTreasuryAccountCode:cashPurchasePayment.treasuryCode,
        cashBasePaidAmount:purchaseSettlement.cashBase,
        bankPaidAmount:bankPurchasePayment.amount,
        bankPaymentCurrency:bankPurchasePayment.currency,
        bankPaymentExchangeRate:bankPurchasePayment.rate,
        bankTreasuryAccountCode:bankPurchasePayment.treasuryCode,
        bankBasePaidAmount:purchaseSettlement.bankBase,
        paymentReceiptNote:purchasePaymentNotes
      });
      setShowNewPurchaseModal(false);
      setNotes('');
      setPurchasePaymentNotes('');
    }catch(error){
      alert('تعذر حفظ فاتورة الشراء: '+(error instanceof Error?error.message:String(error)));
    }
  };

  // --- Purchase Return Handlers ---
  const handleOpenNewReturn = (prefillInvoice?: PurchaseInvoice) => {
    if (prefillInvoice) {
      setReturnSupplierId(prefillInvoice.supplierId);
      setLinkedPurchaseId(prefillInvoice.id);
      setReturnItems(
        prefillInvoice.items.map(it => ({
          itemId: it.itemId,
          itemName: it.itemName,
          quantity: 1,
          unitPrice: it.unitPrice
        }))
      );
    } else {
      setReturnSupplierId(suppliers[0]?.id || '');
      setLinkedPurchaseId('');
      if (inventory.length > 0) {
        setReturnItems([
          { itemId: inventory[0].id, itemName: inventory[0].name, quantity: 1, unitPrice: inventory[0].purchasePrice }
        ]);
      } else {
        setReturnItems([]);
      }
    }
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReturnReason('خامات غير مطابقة للمواصفات');
    setSettlementType('credit_balance');
    setReturnNotes('');
    setShowReturnModal(true);
  };

  const handleReturnItemChange = (idx: number, field: 'quantity' | 'unitPrice', val: number) => {
    setReturnItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  const handleAddReturnLine = () => {
    const it = inventory[0];
    if (!it) return;
    setReturnItems(prev => [...prev, { itemId: it.id, itemName: it.name, quantity: 1, unitPrice: it.purchasePrice }]);
  };

  const handleRemoveReturnLine = (idx: number) => {
    if (returnItems.length > 1) {
      setReturnItems(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const returnSubtotal = returnItems.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0);
  const returnTaxAmount = Number(((returnSubtotal * (settings.vatRate || 0)) / 100).toFixed(2));
  const returnGrandTotal = Number((returnSubtotal + returnTaxAmount).toFixed(2));

  const handleSaveReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnSupplierId || returnItems.length === 0) return;

    const supp = suppliers.find(s => s.id === returnSupplierId);
    if (!supp) return;

    const linkedInvoice = purchases.find(p => p.id === linkedPurchaseId);

    createPurchaseReturn({
      date: returnDate,
      purchaseInvoiceId: linkedPurchaseId || undefined,
      purchaseInvoiceNumber: linkedInvoice?.invoiceNumber || undefined,
      supplierId: supp.id,
      supplierName: supp.name,
      currency: linkedInvoice?.currency || settings.baseCurrencyCode || 'ILS',
      currencySymbol: linkedInvoice?.currencySymbol || settings.currency || '₪',
      exchangeRate: linkedInvoice?.exchangeRate || 1.0,
      items: returnItems.map(i => ({
        itemId: i.itemId,
        itemName: i.itemName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: Number((i.quantity * i.unitPrice).toFixed(2))
      })),
      subtotal: returnSubtotal,
      taxRate: settings.vatRate || 0,
      taxAmount: returnTaxAmount,
      totalAmount: returnGrandTotal,
      reason: returnReason,
      settlementType,
      treasuryAccountCode: settlementType === 'cash_refund' ? returnTreasuryCode : undefined,
      notes: returnNotes
    });

    setShowReturnModal(false);
  };

  // --- Supplier Payment Voucher Handlers ---
  const handleOpenVoucherModal = (supplier?: Party, defaultAmt?: number) => {
    setVoucherToEdit(null);
    setVoucherTargetSupplier(supplier || null);
    setVoucherDefaultAmount(defaultAmt);
    setShowVoucherModal(true);
  };

  const handleEditVoucher = (voucher: PaymentVoucher) => {
    setVoucherToEdit(voucher);
    setVoucherTargetSupplier(parties.find(p => p.id === voucher.partyId) || null);
    setVoucherDefaultAmount(voucher.amount);
    setShowVoucherModal(true);
  };

  // --- Supplier Modal Handlers ---
  const handleOpenAddSupplier = () => {
    setSupplierToEdit(null);
    setShowSupplierModal(true);
  };

  const handleEditSupplier = (supplier: Party) => {
    setSupplierToEdit(supplier);
    setShowSupplierModal(true);
  };

  const handleDeleteSupplier = (supplier: Party) => {
    const hasPurchases = purchases.some(p => p.supplierId === supplier.id);
    const hasReturns = purchaseReturns.some(r => r.supplierId === supplier.id);
    const hasVouchers = vouchers.some(v => v.partyId === supplier.id);
    const hasSales = invoices.some(inv => inv.customerId === supplier.id ||
      inv.counterpartyId === supplier.id);
    const hasOtherReferences = salesReturns.some(r => r.customerId === supplier.id) ||
      printOrders.some(p => p.customerId === supplier.id) ||
      debtClearings.some(r => r.supplierId === supplier.id || r.customerId === supplier.id);
    if (hasPurchases || hasReturns || hasVouchers || hasSales || hasOtherReferences) {
      alert(`لا يمكن حذف المورد (${supplier.name}) لوجود عمليات مالية مرتبطة بمعرّفه؛ يمكن تعديل بياناته.`);
      return;
    }
    if (window.confirm(`هل أنت متأكد من حذف المورد (${supplier.name}) ذو الكود (${supplier.code})؟`)) {
      const result = deleteParty(supplier.id);
      if (!result.success) alert(result.message || 'تعذر حذف المورد لوجود مراجع محاسبية.');
    }
  };

  // --- Filtered Data Collections ---
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return suppliers.filter(s => {
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.code && s.code.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.taxNumber && s.taxNumber.includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (supplierFilter === 'creditor') return s.balance < -0.01; // We owe them money
      if (supplierFilter === 'debtor') return s.balance > 0.01; // They owe us
      if (supplierFilter === 'balanced') return Math.abs(s.balance) <= 0.01; // Settled
      return true;
    });
  }, [suppliers, searchQuery, supplierFilter]);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return purchases.filter(p => {
      return (
        !q ||
        p.invoiceNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        (p.supplierInvoiceNumber && p.supplierInvoiceNumber.toLowerCase().includes(q))
      );
    });
  }, [purchases, searchQuery]);

  const filteredReturns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return purchaseReturns.filter(r => {
      return (
        !q ||
        r.returnNumber.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        (r.purchaseInvoiceNumber && r.purchaseInvoiceNumber.toLowerCase().includes(q))
      );
    });
  }, [purchaseReturns, searchQuery]);

  const supplierVouchers = useMemo(() => {
    return vouchers.filter(v => v.type === 'payment' && suppliers.some(s => s.id === v.partyId));
  }, [vouchers, suppliers]);

  const filteredVouchers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return supplierVouchers.filter(v => {
      return !q || v.voucherNumber.toLowerCase().includes(q) || v.partyName.toLowerCase().includes(q);
    });
  }, [supplierVouchers, searchQuery]);

  // KPI Calculations
  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + (p.totalAmount * (p.exchangeRate || 1)), 0);
  const totalPaidAmount = purchases.reduce((sum, p) => sum + (p.paidAmount * (p.exchangeRate || 1)), 0);
  const totalRemainingDebt = totalPurchasesAmount - totalPaidAmount;
  const totalReturnsAmount = purchaseReturns.reduce((sum, r) => sum + (r.totalAmount * (r.exchangeRate || 1)), 0);
  const totalCreditorSuppliersDebt = suppliers.reduce((sum, s) => s.balance < 0 ? sum + Math.abs(s.balance) : sum, 0);

  return (
    <div className={activeTab === 'suppliers'
      ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden font-sans text-right'
      : 'h-full overflow-y-auto space-y-3 font-sans text-right'}>
      {activeTab !== 'suppliers' && (<>
      {/* Top Header & Fast Actions */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900">
              إدارة المشتريات والموردين ومردودات الخامات وسندات الصرف
            </h2>
            <p className="text-[10px] text-slate-400 font-light">
              دورة مشتريات متكاملة: موردين بأكواد تسلسلية غير متكررة، فواتير توريد، مرتجعات مخزنية، وسندات صرف تفصيلية
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleOpenAddSupplier}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة مورد جديد</span>
          </button>

          <button
            onClick={() => handleOpenNewPurchase()}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>فاتورة مشتريات</span>
          </button>

          <button
            onClick={() => handleOpenNewReturn()}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>مرتجع مشتريات</span>
          </button>

          <button
            onClick={() => handleOpenVoucherModal()}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>سند صرف لمورد</span>
          </button>
        </div>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-light font-semibold">إجمالي المشتريات:</span>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
              {purchases.length} فاتورة
            </span>
          </div>
          <div className="text-base font-black text-slate-900 mt-1 font-mono">
            {totalPurchasesAmount.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} <span className="text-[11px] font-normal text-slate-500">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400">توريدات الخامات والأوراق</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-light font-semibold">المبالغ المنصرفة:</span>
            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
              {supplierVouchers.length} سند صرف
            </span>
          </div>
          <div className="text-base font-black text-emerald-600 mt-1 font-mono">
            {totalPaidAmount.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} <span className="text-[11px] font-normal text-slate-500">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-emerald-700">سداد نقدي وبنكي للموردين</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-light font-semibold">مستحقات الموردين:</span>
            <span className="text-[10px] font-mono bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold">
              التزام علينا
            </span>
          </div>
          <div className="text-base font-black text-rose-600 mt-1 font-mono">
            {totalCreditorSuppliersDebt.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} <span className="text-[11px] font-normal text-slate-500">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400">صافي ذمم دائنة واجبة السداد</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-light font-semibold">مردودات المشتريات:</span>
            <span className="text-[10px] font-mono bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold">
              {purchaseReturns.length} إشعار
            </span>
          </div>
          <div className="text-base font-black text-amber-700 mt-1 font-mono">
            {totalReturnsAmount.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} <span className="text-[11px] font-normal text-slate-500">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-amber-800">خامات معادة خارجة من المخزن</span>
        </div>
      </div>

      {/* Main Four-Tab Navigation & Search Toolbar */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full lg:w-auto font-semibold overflow-x-auto">
          {/* Tab 1: Suppliers */}
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'suppliers'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>الموردين ({suppliers.length})</span>
          </button>

          {/* Tab 2: Purchase Invoices */}
          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'invoices'
                ? 'bg-white text-blue-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>فاتورة مشتريات ({purchases.length})</span>
          </button>

          {/* Tab 3: Purchase Returns */}
          <button
            onClick={() => setActiveTab('returns')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'returns'
                ? 'bg-white text-amber-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>مرتجع فاتورة مشتريات ({purchaseReturns.length})</span>
          </button>

          {/* Tab 4: Payment Vouchers */}
          <button
            onClick={() => setActiveTab('vouchers')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'vouchers'
                ? 'bg-white text-rose-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>سندات صرف ({supplierVouchers.length})</span>
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex items-center gap-2 w-full lg:w-auto">
          {activeTab === 'suppliers' && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium">
              <button
                onClick={() => setSupplierFilter('all')}
                className={`px-2 py-1 rounded cursor-pointer ${
                  supplierFilter === 'all' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setSupplierFilter('creditor')}
                className={`px-2 py-1 rounded cursor-pointer ${
                  supplierFilter === 'creditor' ? 'bg-white text-rose-700 font-bold shadow-2xs' : 'text-slate-600'
                }`}
              >
                مستحق له سداد
              </button>
              <button
                onClick={() => setSupplierFilter('balanced')}
                className={`px-2 py-1 rounded cursor-pointer ${
                  supplierFilter === 'balanced' ? 'bg-white text-emerald-700 font-bold shadow-2xs' : 'text-slate-600'
                }`}
              >
                حساب خالص
              </button>
            </div>
          )}

          <div className="relative flex-1 lg:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'suppliers'
                  ? 'بحث باسم المورد، الكود، الهاتف...'
                  : activeTab === 'invoices'
                  ? 'بحث برقم الفاتورة، اسم المورد...'
                  : activeTab === 'returns'
                  ? 'بحث برقم المرتجع، المورد...'
                  : 'بحث برقم سند الصرف، اسم المورد...'
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-8 pl-3 py-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      </>)}
      {activeTab === 'suppliers' && (
        <SuppliersCompactDirectory
          onAdd={handleOpenAddSupplier}
          onEdit={handleEditSupplier}
          onDelete={handleDeleteSupplier}
          onPurchase={handleOpenNewPurchase}
          onReturn={handleOpenNewReturn}
          onPay={supplier => handleOpenVoucherModal(supplier)}
          onTab={setActiveTab}
        />
      )}

      {/* ========================================================= */}
      {/* --- TAB 2: PURCHASE INVOICES LIST (فواتير مشتريات) --- */}
      {/* ========================================================= */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-3">رقم الفاتورة</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">المورد</th>
                  <th className="p-3">فاتورة المورد اليدوية</th>
                  <th className="p-3 font-mono">الإجمالي ({settings.currency})</th>
                  <th className="p-3 font-mono">المدفوع</th>
                  <th className="p-3 font-mono">المتبقي آجل</th>
                  <th className="p-3">طريقة الصرف</th>
                  <th className="p-3">حالة السداد</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      لا توجد فواتير مشتريات مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map(p => {
                    const supp = parties.find(pt => pt.id === p.supplierId);
                    const baseTotal = p.totalAmount * (p.exchangeRate || 1);
                    const basePaid = p.paidAmount * (p.exchangeRate || 1);
                    const remaining = Math.max(0, baseTotal - basePaid);
                    const isFullyPaid = remaining <= 0.01;
                    const isPartiallyPaid = basePaid > 0 && remaining > 0.01;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Unique Sequential Purchase Number */}
                        <td className="p-3">
                          <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {p.invoiceNumber}
                          </span>
                        </td>

                        <td className="p-3 text-slate-500 font-mono text-[11px]">{p.date}</td>

                        {/* Supplier info */}
                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{p.supplierName}</span>
                            {supp?.code && (
                              <span className="text-[10px] font-mono text-slate-500">
                                ({supp.code})
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 font-mono text-slate-600 text-[11px]">
                          {p.supplierInvoiceNumber || '-'}
                        </td>

                        {/* Total Amount */}
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {baseTotal.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}
                          {p.currency && p.currency !== (settings.baseCurrencyCode || 'ILS') && (
                            <span className="text-[10px] text-slate-400 block font-normal">
                              ({p.totalAmount.toFixed(2)} {p.currency})
                            </span>
                          )}
                        </td>

                        {/* Paid Amount */}
                        <td className="p-3 font-mono text-emerald-700 font-semibold">
                          {basePaid.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Remaining Amount */}
                        <td className="p-3 font-mono font-bold">
                          {remaining > 0 ? (
                            <span className="text-rose-700">{remaining.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</span>
                          ) : (
                            <span className="text-slate-400 font-normal">0.00</span>
                          )}
                        </td>

                        {/* Payment Method */}
                        <td className="p-3 text-[11px]">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                            {p.paymentMethod === 'cash' ? 'نقداً (صندوق)' : p.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'آجل على الحساب'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-3">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isFullyPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPartiallyPaid
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isFullyPaid ? 'مسددة بالكامل' : isPartiallyPaid ? 'مسددة جزئياً' : 'آجلة على الحساب'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Print Purchase Invoice */}
                            <button
                              onClick={() => setSelectedPurchaseForPrint(p)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                              title="معاينة وطباعة فاتورة الشراء والتوريد"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            {/* Create Return from this Invoice */}
                            <button
                              onClick={() => handleOpenNewReturn(p)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                              title="إنشاء مرتجع مشتريات من هذه الفاتورة"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>

                            {/* Pay Remaining with Voucher */}
                            {remaining > 0 && supp && (
                              <button
                                onClick={() => handleOpenVoucherModal(supp, remaining)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                title="صرف دفعة وسداد للمتبقي"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Supplier Statement */}
                            {supp && (
                              <button
                                onClick={() => setSelectedPartyForStatement(supp)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                                title="كشف حساب المورد"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete Invoice */}
                            <button
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من حذف فاتورة المشتريات رقم ${p.invoiceNumber}؟`)) {
                                  deletePurchaseInvoice(p.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                              title="حذف الفاتورة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* --- TAB 3: PURCHASE RETURNS LIST (مرتجع مشتريات) --- */}
      {/* ========================================================= */}
      {activeTab === 'returns' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-3">رقم المرتجع</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">المورد</th>
                  <th className="p-3">الفاتورة الأصلية</th>
                  <th className="p-3">الخامات المعادة</th>
                  <th className="p-3">سبب الإرجاع</th>
                  <th className="p-3 font-mono">الإجمالي المسترجع ({settings.currency})</th>
                  <th className="p-3">طريقة التسوية</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredReturns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      لا توجد مردودات مشتريات مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredReturns.map(r => {
                    const supp = parties.find(pt => pt.id === r.supplierId);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-amber-700">
                          <span className="bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            {r.returnNumber}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">{r.date}</td>
                        <td className="p-3 font-bold text-slate-900">{r.supplierName}</td>
                        <td className="p-3 font-mono text-slate-600 text-[11px]">
                          {r.purchaseInvoiceNumber || 'إرجاع مباشر'}
                        </td>
                        <td className="p-3 text-slate-600 text-[11px]">
                          {r.items.map(i => `${i.itemName} (${i.quantity})`).join('، ')}
                        </td>
                        <td className="p-3 text-slate-600 text-[11px]">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            {r.reason || 'خامات غير مطابقة'}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-amber-800">
                          {(r.totalAmount * (r.exchangeRate || 1)).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.settlementType === 'cash_refund'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {r.settlementType === 'cash_refund' ? 'استرداد نقدي/بنكي' : 'خصم من رصيد المورد'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setSelectedReturnForPrint(r)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                              title="طباعة إشعار مدين / مرتجع A4"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {supp && (
                              <button
                                onClick={() => setSelectedPartyForStatement(supp)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                                title="كشف حساب المورد"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من حذف إشعار المرتجع ${r.returnNumber}؟`)) {
                                  deletePurchaseReturn(r.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* --- TAB 4: PAYMENT VOUCHERS LIST (سندات صرف) --- */}
      {/* ========================================================= */}
      {activeTab === 'vouchers' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-3">رقم سند الصرف</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">المورد المستلم</th>
                  <th className="p-3 font-mono">المبلغ المسدد ({settings.currency})</th>
                  <th className="p-3">طريقة الدفع والحساب</th>
                  <th className="p-3">البيان والشرح المحاسبي</th>
                  <th className="p-3 text-center">الإجراءات والطباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا توجد سندات صرف مسجلة للموردين
                    </td>
                  </tr>
                ) : (
                  filteredVouchers.map(v => {
                    const supp = parties.find(p => p.id === v.partyId);
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Unique Sequential Payment Voucher Number */}
                        <td className="p-3">
                          <span className="font-mono font-black text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            {v.voucherNumber}
                          </span>
                        </td>

                        <td className="p-3 text-slate-500 font-mono text-[11px]">{v.date}</td>

                        {/* Supplier */}
                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{v.partyName}</span>
                            {supp?.code && (
                              <span className="text-[10px] font-mono text-slate-500">
                                ({supp.code})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="p-3 font-mono font-black text-slate-900 text-xs">
                          {v.amount.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {v.currencySymbol || settings.currency || '₪'}
                        </td>

                        {/* Payment Method Details */}
                        <td className="p-3">
                          <div className="text-[11px] space-y-0.5">
                            <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-bold">
                              {v.paymentMethod === 'cash' ? 'نقداً من الصندوق' : v.paymentMethod === 'cheque' ? 'شيك بنكي' : 'تحويل بنكي'}
                            </span>
                            {v.paymentMethod === 'cheque' && v.chequeNumber && (
                              <div className="text-[10px] text-amber-700 font-mono mt-0.5">
                                شيك: {v.chequeNumber} {v.chequeDueDate ? `(استحقاق: ${v.chequeDueDate})` : ''}
                              </div>
                            )}
                            {v.paymentMethod === 'bank_transfer' && v.transferReference && (
                              <div className="text-[10px] text-blue-700 font-mono mt-0.5">
                                حوالة: {v.transferReference}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Description */}
                        <td className="p-3 text-slate-600 text-[11px] max-w-xs truncate">
                          {v.description}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Print Voucher */}
                            <button
                              onClick={() => setSelectedVoucherForPrint(v)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              title="طباعة سند الصرف الرسمي"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>طباعة</span>
                            </button>

                            {/* Edit Voucher */}
                            <button
                              onClick={() => handleEditVoucher(v)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="تعديل سند الصرف"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>تعديل</span>
                            </button>

                            {/* Supplier Statement */}
                            {supp && (
                              <button
                                onClick={() => setSelectedPartyForStatement(supp)}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition-colors"
                                title="كشف حساب المورد"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete Voucher */}
                            <button
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من حذف سند الصرف رقم ${v.voucherNumber}؟`)) {
                                  deletePaymentVoucher(v.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                              title="حذف السند"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* --- MODAL: NEW PURCHASE INVOICE (فاتورة مشتريات) --- */}
      {/* ========================================================= */}
      {showNewPurchaseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/65 p-1.5 backdrop-blur-xs sm:p-3">
          <div className="flex w-full max-w-[min(1640px,98vw)] max-h-[96vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-right font-sans shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span>فاتورة مشتريات وتوريد خامات جديدة</span>
                    <span className="font-mono text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                      {previewPurchaseNumber}
                    </span>
                  </h3>

                </div>
              </div>

              <button
                onClick={() => setShowNewPurchaseModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="flex min-h-0 flex-1 flex-col overflow-hidden text-xs">
              {/* Only identifying information stays above the item table. */}
              <div className="shrink-0 space-y-1.5 border-b border-slate-200 bg-white px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[270px] flex-[2] items-center gap-1.5">
                    <span className="shrink-0 text-[11px] font-black text-slate-700">المورد <b className="text-rose-600">*</b>:</span>
                    <div className="min-w-0 flex-1">
                      <AutocompleteCombobox
                        items={suppliers.map(s=>({
                          id:s.id,name:s.name,code:s.code,
                          subText:s.phone?`هاتف: ${s.phone}`:undefined,
                          badge:s.balance?`${Math.abs(s.balance).toFixed(2)} ${settings.currency}`:undefined,
                          raw:s
                        }))}
                        selectedId={supplierId}
                        entityType="supplier"
                        placeholder="اختر المورد / ابحث بالاسم أو الرقم..."
                        onSelect={opt=>setSupplierId(opt.id)}
                        onQuickAdd={async name=>{
                          const created=addParty({name,type:'supplier',phone:'',initialBalance:0});
                          setSupplierId(created.id);
                        }}
                      />
                    </div>
                  </div>
                  <label className="flex min-w-[190px] flex-[0.75] items-center gap-1.5">
                    <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-slate-600">رقم فاتورة المورد:</span>
                    <input type="text" value={supplierInvoiceNumber}
                      onChange={e=>setSupplierInvoiceNumber(e.target.value)}
                      placeholder="رقم المورد الخارجي" aria-label="رقم الفاتورة الخارجية"
                      className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 text-[11px] font-mono"/>
                  </label>
                  <label className="flex w-[210px] shrink-0 items-center gap-1.5">
                    <span className="shrink-0 text-[10px] font-bold text-slate-600">التاريخ:</span>
                    <DateInput required value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}
                      className="h-8 w-full min-w-0 rounded border border-slate-300 bg-slate-50 px-1 text-xs font-mono"/>
                  </label>
                </div>
                <label className="flex items-center gap-1.5">
                  <span className="shrink-0 whitespace-nowrap text-[10px] font-black text-blue-800">ملاحظات الفاتورة:</span>
                  <input type="text" value={notes} onChange={e=>setNotes(e.target.value)}
                    placeholder="ملاحظات الفاتورة العامة أو شروط التوريد أو التسليم (تظهر على المستند)..."
                    className="h-7 min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 text-[11px] outline-none focus:border-blue-500"/>
                </label>
              </div>

              {/* Item grid is the only vertically scrolling body. */}
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-1.5 py-1">
                <PurchaseInvoiceLinesTable rows={items} setRows={setItems}
                  inventory={inventory} taxRate={taxRate} currency={invoiceCurrency}
                  onQuickAdd={handleQuickAddPurchaseItem}/>
              </div>

              {/* Same order and visual structure as the POS bottom console. */}
              <PurchaseInvoiceFooter
                lineCount={items.filter(r=>!!r.itemId).length}
                totalPieces={items.filter(r=>!!r.itemId).reduce((n,r)=>n+(r.hasDimensions?r.count:r.quantity),0)}
                currency={invoiceCurrency}
                exchangeRate={invoiceExchangeRate}
                currencies={currencies}
                treasuries={treasuries}
                taxRate={taxRate}
                discountPercent={overallPurchaseDiscount}
                additionalCharges={purchaseAdditionalCharges}
                cash={cashPurchasePayment}
                bank={bankPurchasePayment}
                paymentNotes={purchasePaymentNotes}
                totals={purchaseBreakdown||{
                  lines:[],gross:0,lineDiscount:0,overallDiscount:0,
                  additionalCharges:0,subtotal:0,tax:0,total:0
                }}
                paidInvoice={purchaseSettlement?.paidInvoice||0}
                remainingInvoice={purchaseSettlement?.remainingInvoice||grandTotal}
                paidBase={purchaseSettlement?.paidBase||0}
                remainingBase={purchaseSettlement?.remainingBase||grandTotal*invoiceExchangeRate}
                onCurrency={handleCurrencyChange}
                onExchangeRate={setInvoiceExchangeRate}
                onTaxRate={setTaxRate}
                onDiscountPercent={setOverallPurchaseDiscount}
                onAdditionalCharges={setPurchaseAdditionalCharges}
                onCash={patch=>setCashPurchasePayment(prev=>({...prev,...patch}))}
                onBank={patch=>setBankPurchasePayment(prev=>({...prev,...patch}))}
                onPaymentNotes={setPurchasePaymentNotes}
                onFullCash={()=>quickPayPurchase('cash')}
                onFullBank={()=>quickPayPurchase('bank')}
                onClearPayments={()=>{
                  setCashPurchasePayment(prev=>({...prev,amount:0}));
                  setBankPurchasePayment(prev=>({...prev,amount:0}));
                }}
                onCancel={()=>setShowNewPurchaseModal(false)}
                valid={purchaseTotals.valid&&!!purchaseBreakdown&&validPurchasePayment}
              />
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* --- MODAL: PURCHASE RETURN (مرتجع مشتريات) --- */}
      {/* ========================================================= */}
      {showReturnModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto my-auto text-right font-sans">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span>تحرير إشعار مرتجع مشتريات</span>
                    <span className="font-mono text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                      {previewReturnNumber}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-light">
                    إرجاع خامات تالفة أو غير مطابقة للمورد وخصمها من رصيد المخزن والمديونية
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowReturnModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveReturn} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-[11px]">المورد:</label>
                  <AutocompleteCombobox
                    items={suppliers.map(s => ({
                      id: s.id,
                      name: s.name,
                      code: s.code,
                      subText: s.phone ? `هاتف: ${s.phone}` : undefined,
                      badge: s.balance ? `${Math.abs(s.balance).toFixed(2)} ${settings.currency}` : undefined,
                      raw: s
                    }))}
                    selectedId={returnSupplierId}
                    entityType="supplier"
                    placeholder="اكتب اسم المورد للبحث والمطابقة..."
                    onSelect={opt => setReturnSupplierId(opt.id)}
                    onQuickAdd={async name => {
                      const created = addParty({
                        name,
                        type: 'supplier',
                        phone: '',
                        initialBalance: 0
                      });
                      setReturnSupplierId(created.id);
                    }}
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1 text-[11px]">الفاتورة المرجعية:</label>
                  <select
                    value={linkedPurchaseId}
                    onChange={e => setLinkedPurchaseId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  >
                    <option value="">إرجاع عام مباشر بدون فاتورة</option>
                    {purchases
                      .filter(p => !returnSupplierId || p.supplierId === returnSupplierId)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.invoiceNumber} - {p.date} ({p.totalAmount} {p.currency})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1 text-[11px]">تاريخ المرتجع:</label>
                  <DateInput required value={returnDate} onChange={e => setReturnDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Settlement Type */}
              <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200/80 space-y-2">
                <span className="font-bold text-amber-950 block text-xs">طريقة تسوية المردودات:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettlementType('credit_balance')}
                    className={`p-2 rounded-lg border font-bold text-center cursor-pointer transition-all ${
                      settlementType === 'credit_balance'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    خصم من رصيد ومديونية المورد
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettlementType('cash_refund')}
                    className={`p-2 rounded-lg border font-bold text-center cursor-pointer transition-all ${
                      settlementType === 'cash_refund'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    استرداد نقدي / بنكي فوري
                  </button>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-slate-700 font-medium mb-1 text-[11px]">سبب الإرجاع:</label>
                <input
                  type="text"
                  required
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  placeholder="خامات تالفة، مقاس غير مطابق، جودة الورق..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              {/* Returned Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">الخامات المعادة (تخرج من المخزن بالسالب):</span>
                  <button
                    type="button"
                    onClick={handleAddReturnLine}
                    className="text-amber-600 hover:text-amber-800 font-bold flex items-center gap-1 cursor-pointer text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة بند مرتجع</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {returnItems.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 items-center">
                      <div className="col-span-5 font-semibold text-slate-900 text-xs truncate">
                        {line.itemName}
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          min="1"
                          placeholder="الكمية المعادة"
                          value={line.quantity}
                          onChange={e => handleReturnItemChange(idx, 'quantity', Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded p-1.5 text-center text-xs font-mono font-bold"
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="سعر الوحدة"
                          value={line.unitPrice}
                          onChange={e => handleReturnItemChange(idx, 'unitPrice', Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded p-1.5 font-mono text-left text-xs font-bold"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveReturnLine(idx)}
                          disabled={returnItems.length <= 1}
                          className="text-slate-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between font-black text-slate-900 text-sm">
                <span>إجمالي قيمة المردودات:</span>
                <span className="font-mono text-amber-800">{returnGrandTotal.toFixed(2)} {settings.currency}</span>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-700 font-medium mb-1 text-[11px]">ملاحظات إضافية:</label>
                <input
                  type="text"
                  value={returnNotes}
                  onChange={e => setReturnNotes(e.target.value)}
                  placeholder="رقم سند الاستلام من مندوب المورد..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>اعتماد المرتجع وخصم الكميات من المخزن</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* --- MODAL: SUPPLIER ADD / EDIT --- */}
      {/* ========================================================= */}
      <SupplierModal
        isOpen={showSupplierModal}
        onClose={() => {
          setShowSupplierModal(false);
          setSupplierToEdit(null);
        }}
        supplierToEdit={supplierToEdit}
      />

      {/* ========================================================= */}
      {/* --- MODAL: PAYMENT VOUCHER ADD / EDIT --- */}
      {/* ========================================================= */}
      <PaymentVoucherModal
        isOpen={showVoucherModal}
        onClose={() => {
          setShowVoucherModal(false);
          setVoucherToEdit(null);
          setVoucherTargetSupplier(null);
          setVoucherDefaultAmount(undefined);
        }}
        voucherToEdit={voucherToEdit}
        defaultSupplier={voucherTargetSupplier}
        defaultAmount={voucherDefaultAmount}
      />
    </div>
  );
};
