import React, { useMemo, useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Party } from '../types';
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Building,
  Receipt,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ShieldAlert,
  UserCheck,
  Lock,
  Hash,
  Copy,
  Check,
  Link as LinkIcon,
  Tag,
  Scale,
  RefreshCw
} from 'lucide-react';
import { generateSequentialPartyCode, isCashCustomerParty } from '../utils/partyUtils';
import { CustomerSpecialPricesModal } from './pos/CustomerSpecialPricesModal';
import { BalanceReconciliationModal } from './BalanceReconciliationModal';
import { posSound } from '../utils/audio';
import { calculatePartyTrueBalance } from '../utils/statementGenerator';

export const PartiesView: React.FC = () => {
  const {
    parties,
    invoices = [],
    vouchers = [],
    purchases = [],
    purchaseReturns = [],
    salesReturns = [],
    printOrders = [],
    journalEntries = [],
    debtClearings = [],
    inventory = [],
    addParty,
    updateParty,
    deleteParty,
    setSelectedPartyForStatement,
    createPaymentVoucher,
    treasuries,
    settings,
    stats,
    reconcileAllPartyBalances
  } = useAccounting();

  // Balance Reconciliation Modal State
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);

  // Filters and View Mode
  const [filterCategory, setFilterCategory] = useState<'all' | 'customer' | 'supplier' | 'debtor' | 'creditor' | 'exceeded' | 'subCustomer'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Add / Edit Modal State
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);

  // Form Fields - Default numeric fields are zeroed out (دائماً مصفّرة)
  const [partyType, setPartyType] = useState<'customer' | 'supplier' | 'both'>('customer');
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(0); // مصفّر افتراضياً
  const [openingBalance, setOpeningBalance] = useState<number>(0); // مصفّر افتراضياً
  const [openingBalanceType, setOpeningBalanceType] = useState<'debit' | 'credit'>('debit');
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Special Prices for Customer (بند أسعار خاصة للعميل)
  const [specialPrices, setSpecialPrices] = useState<Record<string, number>>({});
  const [selectedSpecialItemId, setSelectedSpecialItemId] = useState<string>('');
  const [specialItemPriceInput, setSpecialItemPriceInput] = useState<string>('');
  const [specialPricesPartyForModal, setSpecialPricesPartyForModal] = useState<Party | null>(null);

  // Voucher Modal State
  const [voucherModalParty, setVoucherModalParty] = useState<Party | null>(null);
  const [voucherType, setVoucherType] = useState<'receipt' | 'payment'>('receipt');
  const [voucherAmount, setVoucherAmount] = useState<number>(0);
  const [voucherMethod, setVoucherMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [voucherTreasuryCode, setVoucherTreasuryCode] = useState<string>('1101');
  const [voucherDesc, setVoucherDesc] = useState('');

  // Special price management helpers
  const handleAddSpecialPriceItem = () => {
    if (!selectedSpecialItemId) return;
    const priceNum = parseFloat(specialItemPriceInput);
    if (isNaN(priceNum) || priceNum < 0) return;
    setSpecialPrices(prev => ({
      ...prev,
      [selectedSpecialItemId]: priceNum
    }));
    setSelectedSpecialItemId('');
    setSpecialItemPriceInput('');
  };

  const handleUpdateSpecialPriceItem = (itemId: string, newPrice: number) => {
    setSpecialPrices(prev => {
      const updated = { ...prev };
      if (newPrice > 0) {
        updated[itemId] = newPrice;
      } else {
        delete updated[itemId];
      }
      return updated;
    });
  };

  const handleRemoveSpecialPriceItem = (itemId: string) => {
    setSpecialPrices(prev => {
      const updated = { ...prev };
      delete updated[itemId];
      return updated;
    });
  };

  // Open modal for new party - Always zeroed fields (مصفّرة)
  const handleOpenAddModal = (defaultType?: 'customer' | 'supplier') => {
    setEditingPartyId(null);
    setPartyType(defaultType || (filterCategory === 'supplier' ? 'supplier' : 'customer'));
    setName('');
    setContactPerson('');
    setCity('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCommercialRegister('');
    setTaxNumber('');
    setCreditLimit(0); // مصفّر دائماً
    setOpeningBalance(0); // مصفّر دائماً
    setOpeningBalanceType(defaultType === 'supplier' ? 'credit' : 'debit');
    setOpeningBalanceDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setSpecialPrices({});
    setSelectedSpecialItemId('');
    setSpecialItemPriceInput('');
    setShowPartyModal(true);
  };

  // Open modal for editing existing party
  const handleOpenEditModal = (party: Party) => {
    setEditingPartyId(party.id);
    setPartyType(party.type);
    setName(party.name);
    setContactPerson(party.contactPerson || '');
    setCity(party.city || '');
    setPhone(party.phone);
    setEmail(party.email || '');
    setAddress(party.address || '');
    setCommercialRegister(party.commercialRegister || '');
    setTaxNumber(party.taxNumber || '');
    const manualOpeningBal = party.openingBalance !== undefined ? party.openingBalance : ((party as any).initialBalance !== undefined ? (party as any).initialBalance : 0);
    setOpeningBalance(manualOpeningBal);
    setOpeningBalanceType(party.openingBalanceType || (party.type === 'supplier' ? 'credit' : 'debit'));
    setOpeningBalanceDate(party.openingBalanceDate || new Date().toISOString().split('T')[0]);
    const initialSpecials: Record<string, number> = { ...(party.specialPrices || {}) };
    inventory.forEach(it => {
      if (it.customerSpecialPrices && it.customerSpecialPrices.length > 0) {
        const entry = it.customerSpecialPrices.find(sp =>
          sp.customerId === party.id ||
          (party.code && sp.customerCode && sp.customerCode.toLowerCase() === party.code.toLowerCase()) ||
          (sp.customerName && sp.customerName.trim().toLowerCase() === party.name.trim().toLowerCase())
        );
        if (entry && typeof entry.price === 'number' && entry.price >= 0 && initialSpecials[it.id] === undefined) {
          initialSpecials[it.id] = entry.price;
        }
      }
    });
    setSpecialPrices(initialSpecials);
    setSelectedSpecialItemId('');
    setSpecialItemPriceInput('');
    setShowPartyModal(true);
  };

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSaveParty = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setToastMsg({ text: 'يرجى كتابة الاسم التجاري أو اسم العميل أولاً', type: 'error' });
      return;
    }

    try {
      if (editingPartyId) {
        updateParty(editingPartyId, {
          type: partyType,
          name: trimmedName,
          contactPerson: (contactPerson || '').trim(),
          city: (city || '').trim(),
          phone: (phone || '').trim(),
          email: (email || '').trim(),
          address: (address || '').trim(),
          commercialRegister: (commercialRegister || '').trim(),
          taxNumber: (taxNumber || '').trim(),
          creditLimit: Number(creditLimit) || 0,
          openingBalance: Number(openingBalance) || 0,
          openingBalanceType,
          openingBalanceDate,
          notes: (notes || '').trim(),
          specialPrices
        });
        posSound.playSuccessBeep();
        setToastMsg({
          text: `تم حفظ تعديلات العميل "${trimmedName}" بنجاح وتحديث السجلات وقاعدة البيانات!`,
          type: 'success'
        });
      } else {
        addParty({
          type: partyType,
          name: trimmedName,
          contactPerson: (contactPerson || '').trim(),
          city: (city || '').trim(),
          phone: (phone || '').trim(),
          email: (email || '').trim(),
          address: (address || '').trim(),
          commercialRegister: (commercialRegister || '').trim(),
          taxNumber: (taxNumber || '').trim(),
          creditLimit: Number(creditLimit) || 0,
          openingBalance: Number(openingBalance) || 0,
          openingBalanceType,
          openingBalanceDate,
          initialBalance: Number(openingBalance) || 0,
          notes: (notes || '').trim(),
          isSubCustomer: false,
          specialPrices
        });
        posSound.playSuccessBeep();
        setToastMsg({
          text: `تم تسجيل العميل الجديد "${trimmedName}" بنجاح في الدليل!`,
          type: 'success'
        });
      }

      setShowPartyModal(false);
      setTimeout(() => {
        setToastMsg(null);
      }, 4500);
    } catch (err: any) {
      setToastMsg({
        text: `حدث خطأ أثناء حفظ التعديلات: ${err?.message || 'يرجى المحاولة مجدداً'}`,
        type: 'error'
      });
    }
  };

  const handleDeleteParty = (id: string, partyName: string) => {
    if (window.confirm(`هل أنت متأكد من رغبتك في حذف الحساب: "${partyName}"؟ سيتم التحقق من عدم وجود قيود مالية معلقة.`)) {
      const result = deleteParty(id);
      if (!result.success) {
        alert(result.reason);
      }
    }
  };

  const handleSaveVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherModalParty || voucherAmount <= 0) return;

    createPaymentVoucher({
      date: new Date().toISOString().split('T')[0],
      type: voucherType,
      partyId: voucherModalParty.id,
      partyName: voucherModalParty.name,
      amount: voucherAmount,
      paymentMethod: voucherMethod,
      accountCode: voucherType === 'receipt' ? '1201' : '2101',
      description: voucherDesc || `${voucherType === 'receipt' ? 'سند قبض مالي من' : 'سند صرف مالي إلى'} ${voucherModalParty.name}`
    });

    setVoucherModalParty(null);
    setVoucherAmount(0);
    setVoucherDesc('');
  };

  // Currently selected item for special price picker
  const selectedSpecialItem = inventory.find(i => i.id === selectedSpecialItemId);

  // The cashier and the parties directory now use the SAME net balance
  // calculator, based on the latest PostgreSQL-synced invoices, receipts,
  // purchases, returns and approved accounting movements. Never use the
  // potentially stale party.balance cache as a displayed receivable.
  const displayedParties = useMemo(() => {
    const subCustomers = parties.filter(p => p.isSubCustomer);
    return parties.map(party => ({
      ...party,
      balance: calculatePartyTrueBalance(
        party, invoices, vouchers, purchases, purchaseReturns,
        salesReturns, printOrders, journalEntries, debtClearings,
        party.isSubCustomer ? party.id : undefined, subCustomers
      )
    }));
  }, [parties, invoices, vouchers, purchases, purchaseReturns,
      salesReturns, printOrders, journalEntries, debtClearings]);

  // Filtered Parties Logic
  const filteredParties = displayedParties.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      (p.code && typeof p.code === 'string' && p.code.toLowerCase().includes(q)) ||
      (p.name && typeof p.name === 'string' && p.name.toLowerCase().includes(q)) ||
      (p.phone && typeof p.phone === 'string' && p.phone.includes(q)) ||
      (p.contactPerson && typeof p.contactPerson === 'string' && p.contactPerson.toLowerCase().includes(q)) ||
      (p.city && typeof p.city === 'string' && p.city.toLowerCase().includes(q)) ||
      (p.commercialRegister && typeof p.commercialRegister === 'string' && p.commercialRegister.includes(q)) ||
      (p.taxNumber && typeof p.taxNumber === 'string' && p.taxNumber.includes(q));

    if (!matchSearch) return false;

    if (filterCategory === 'all') return !p.isSubCustomer;
    if (filterCategory === 'customer') return (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer;
    if (filterCategory === 'supplier') return (p.type === 'supplier' || p.type === 'both') && !p.isSubCustomer;
    if (filterCategory === 'debtor') return p.balance > 0 && !p.isSubCustomer;
    if (filterCategory === 'creditor') return p.balance < 0 && !p.isSubCustomer;
    if (filterCategory === 'exceeded') {
      return p.creditLimit !== undefined && p.creditLimit > 0 && p.balance > p.creditLimit && !p.isSubCustomer;
    }
    if (filterCategory === 'subCustomer') {
      return !!p.isSubCustomer;
    }
    return true;
  });

  const totalReceivables = displayedParties
    .filter(p => (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer)
    .reduce((acc, p) => acc + (p.balance > 0 ? p.balance : 0), 0);

  const totalPayables = displayedParties
    .filter(p => (p.type === 'supplier' || p.type === 'both') && !p.isSubCustomer)
    .reduce((acc, p) => acc + (p.balance < 0 ? Math.abs(p.balance) : 0), 0);

  const exceededCount = displayedParties.filter(
    p => p.type !== 'supplier' && p.creditLimit && p.balance > p.creditLimit && !p.isSubCustomer
  ).length;

  return (
    <div className="space-y-3">
      {/* Toast Alert Banner */}
      {toastMsg && (
        <div
          className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button
            onClick={() => setToastMsg(null)}
            className="p-1 hover:bg-black/5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Fast Action */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">دليل العملاء والموردين وكشوف الحساب</h2>
            <p className="text-[10px] text-slate-400 font-light">
              إدارة البيانات التجارية، الحدود الائتمانية، الديون السابقة، واستخراج كشوف الحسابات المستمرة A4
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReconciliationModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="فتح شاشة مطابقة ومراجعة كافة الأرصدة مع دفاتر العمليات والمستندات"
          >
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <span>مراجعة الأرصدة ⚖️</span>
          </button>
          <button
            onClick={() => handleOpenAddModal('customer')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة عميل جديد</span>
          </button>
          <button
            onClick={() => handleOpenAddModal('supplier')}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة مورد خامات</span>
          </button>
        </div>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-light font-semibold block">إجمالي ديون العملاء المستحقة (لنا):</span>
            <div className="text-base font-black text-amber-700 mt-0.5 font-mono">
              {totalReceivables.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}{' '}
              <span className="text-[11px] font-normal text-slate-500">{settings.currency}</span>
            </div>
            <span className="text-[10px] text-slate-400">ذمم مدينة جارية للمطبعة</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <ArrowDownLeft className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-light font-semibold block">مستحقات الموردين وشركات الورق (علينا):</span>
            <div className="text-base font-black text-rose-600 mt-0.5 font-mono">
              {totalPayables.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}{' '}
              <span className="text-[11px] font-normal text-slate-500">{settings.currency}</span>
            </div>
            <span className="text-[10px] text-slate-400">ذمم دائنة والتزامات خامات</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>

        <div className={`p-3 rounded-lg border shadow-xs flex items-center justify-between ${
          exceededCount > 0 ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-slate-200'
        }`}>
          <div>
            <span className="text-[11px] text-slate-600 font-semibold block">تنبيهات السقف والحدود الائتمانية:</span>
            <div className="text-base font-black text-slate-900 mt-0.5 font-mono flex items-center gap-1.5">
              <span>{exceededCount}</span>
              <span className="text-[11px] font-normal text-slate-600">عميل تجاوزوا الحد المسموح</span>
            </div>
            <span className="text-[9px] text-slate-400 font-light">حماية السيولة وتجنب الديون المعدومة</span>
          </div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            exceededCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'
          }`}>
            {exceededCount > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-2.5 text-xs">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1 w-full md:w-auto">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
              filterCategory === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({parties.filter(p => !p.isSubCustomer).length})
          </button>
          <button
            onClick={() => setFilterCategory('customer')}
            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
              filterCategory === 'customer' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            العملاء ({parties.filter(p => (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer).length})
          </button>
          <button
            onClick={() => setFilterCategory('subCustomer')}
            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
              filterCategory === 'subCustomer' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
            }`}
          >
            <LinkIcon className="w-3 h-3 text-amber-700" />
            <span>الزبائن الفرعيين / ديون مؤقتة ({parties.filter(p => p.isSubCustomer).length})</span>
          </button>
          <button
            onClick={() => setFilterCategory('supplier')}
            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
              filterCategory === 'supplier' ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الموردون ({parties.filter(p => (p.type === 'supplier' || p.type === 'both') && !p.isSubCustomer).length})
          </button>
          <button
            onClick={() => setFilterCategory('debtor')}
            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
              filterCategory === 'debtor' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            عليهم مبالغ (مدينون)
          </button>
          <button
            onClick={() => setFilterCategory('creditor')}
            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
              filterCategory === 'creditor' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            لهم مبالغ (دائنون)
          </button>
          {exceededCount > 0 && (
            <button
              onClick={() => setFilterCategory('exceeded')}
              className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                filterCategory === 'exceeded' ? 'bg-amber-700 text-white shadow-xs' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>تجاوزوا السقف ({exceededCount})</span>
            </button>
          )}
        </div>

        {/* Search Input & View Mode */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث بالاسم، الجوال، السجل التجاري، المدينة..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pr-8 pl-3 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="bg-slate-100 p-0.5 rounded-md flex items-center">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded cursor-pointer ${viewMode === 'grid' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}
              title="عرض كبطاقات"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1 rounded cursor-pointer ${viewMode === 'table' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}
              title="عرض كجدول"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Parties Content: Grid View or Table View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filteredParties.length === 0 ? (
            <div className="col-span-full bg-white p-8 rounded-lg border border-slate-200 text-center text-slate-400 text-xs">
              لم يتم العثور على عملاء أو موردين مطابقين لمعايير البحث
            </div>
          ) : (
            filteredParties.map(party => {
              const isCustomer = party.type === 'customer' || party.type === 'both';
              const isSupplier = party.type === 'supplier' || party.type === 'both';
              const isDebit = party.balance > 0;
              const isCredit = party.balance < 0;
              const isZero = party.balance === 0;
              const creditLimit = party.creditLimit || 0;
              const isLimitExceeded = creditLimit > 0 && party.balance > creditLimit;
              const creditUsagePercent = creditLimit > 0 ? Math.min(100, Math.round((Math.max(0, party.balance) / creditLimit) * 100)) : 0;

              return (
                <div
                  key={party.id}
                  className={`bg-white rounded-lg p-3.5 border shadow-xs transition-all flex flex-col justify-between space-y-3 ${
                    isLimitExceeded
                      ? 'border-amber-400 bg-amber-50/10 hover:border-amber-500'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div>
                    {/* Header: Type Badges & CR / Tax */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1 shadow-2xs" title="الرقم التسلسلي الآلي الصادر من النظام">
                          <Hash className="w-2.5 h-2.5 text-blue-600" />
                          <span>{party.code || 'CUST-0000'}</span>
                        </span>
                        {party.isSubCustomer ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                            <LinkIcon className="w-2.5 h-2.5 text-amber-700" />
                            <span>زبون فرعي / دين مؤقت</span>
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            party.type === 'customer' ? 'bg-blue-100 text-blue-800' :
                            party.type === 'supplier' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {party.type === 'customer' ? 'عميل' : party.type === 'supplier' ? 'مورد خامات' : 'عميل ومورد'}
                          </span>
                        )}
                        {party.isSubCustomer && party.parentPartyId && (
                          <span className="text-[10px] bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                            تابع لـ: {parties.find(p => p.id === party.parentPartyId)?.name || 'العميل الرئيسي'}
                          </span>
                        )}
                        {party.city && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5 text-slate-400" />
                            <span>{party.city}</span>
                          </span>
                        )}
                      </div>

                      {isLimitExceeded && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>تجاوز السقف</span>
                        </span>
                      )}
                    </div>

                    {/* Party Name & Contact Person */}
                    <h3 className="font-bold text-slate-900 text-xs flex items-center justify-between">
                      <span>{party.name}</span>
                      {party.contactPerson && (
                        <span className="text-[11px] font-normal text-slate-500 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-slate-400" />
                          <span>{party.contactPerson}</span>
                        </span>
                      )}
                    </h3>

                    {/* Quick Details List */}
                    <div className="space-y-1 text-[10px] text-slate-400 font-light pt-2 mt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span className="font-mono text-slate-700 text-[11px]">{party.phone}</span>
                        </div>
                        {party.commercialRegister && (
                          <span className="text-[10px] font-mono text-slate-400">
                            س.ت: {party.commercialRegister}
                          </span>
                        )}
                      </div>

                      {party.taxNumber && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          الرقم الضريبي: {party.taxNumber}
                        </div>
                      )}

                      {party.address && (
                        <div className="text-[10px] text-slate-400 font-light truncate" title={party.address}>
                          {party.address}
                        </div>
                      )}

                      {/* Credit Limit & Debt History */}
                      {creditLimit > 0 && (
                        <div className="pt-1">
                          <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="text-slate-500">الحد الائتماني: {creditLimit.toLocaleString('ar-SA')} {settings.currency}</span>
                            <span className={`font-mono font-bold ${isLimitExceeded ? 'text-rose-600' : 'text-slate-600'}`}>
                              {creditUsagePercent}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isLimitExceeded ? 'bg-rose-500' : creditUsagePercent > 80 ? 'bg-amber-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(100, creditUsagePercent)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {party.openingBalance !== undefined && party.openingBalance > 0 && (
                        <div className="text-[10px] text-slate-400 flex justify-between pt-0.5">
                          <span>دين سابق / رصيد افتتاحي:</span>
                          <span className="font-mono">{party.openingBalance.toLocaleString('ar-SA')} {settings.currency}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Balance & Action Buttons */}
                  <div className="pt-2.5 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-light font-semibold">الرصيد الجاري المستمر:</span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          isDebit ? 'text-amber-700' : isCredit ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {Math.abs(party.balance).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                        <span className="text-[10px] font-normal mr-1">
                          {isDebit ? '(لنا مطلوب منه)' : isCredit ? '(علينا مستحق له)' : '(خالص)'}
                        </span>
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 pt-1">
                      {/* Detailed Account Statement Button */}
                      <button
                        onClick={() => setSelectedPartyForStatement(party)}
                        className="col-span-2 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-md text-[11px] transition-colors cursor-pointer"
                        title="استخراج كشف حساب برصيد تراكمي مستمر وطباعته"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>كشف حساب</span>
                      </button>

                      {/* Quick Voucher Button */}
                      <button
                        onClick={() => {
                          setVoucherModalParty(party);
                          setVoucherType(isCustomer && !isSupplier ? 'receipt' : 'payment');
                          setVoucherAmount(Math.abs(party.balance));
                        }}
                        className="flex items-center justify-center gap-0.5 px-1.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md text-[11px] transition-colors cursor-pointer"
                        title="إصدار سند قبض أو صرف سريع"
                      >
                        <Receipt className="w-3 h-3 text-slate-500" />
                        <span>سند</span>
                      </button>

                      {/* Edit / Actions */}
                      <div className="flex items-center justify-end gap-1">
                        {!isCashCustomerParty(party) && party.type !== 'supplier' && (
                          <button
                            onClick={() => setSpecialPricesPartyForModal(party)}
                            className={`p-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                              party.specialPrices && Object.keys(party.specialPrices).length > 0
                                ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 font-bold border border-amber-200'
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={
                              party.specialPrices && Object.keys(party.specialPrices).length > 0
                                ? `أسعار خاصة (${Object.keys(party.specialPrices).length} أصناف)`
                                : 'تحديد أسعار خاصة للعميل'
                            }
                          >
                            <Tag className="w-3.5 h-3.5" />
                            {party.specialPrices && Object.keys(party.specialPrices).length > 0 && (
                              <span className="text-[10px] font-mono">{Object.keys(party.specialPrices).length}</span>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(party)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          title="تعديل البيانات والحد الائتماني"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteParty(party.id, party.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="حذف الحساب"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Tabular View */
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <th className="py-2.5 px-3 font-mono">الرقم التسلسلي</th>
                <th className="py-2.5 px-3">الاسم التجاري والجهة</th>
                <th className="py-2.5 px-3">النوع</th>
                <th className="py-2.5 px-3">الشخص المسؤول</th>
                <th className="py-2.5 px-3">الجوال / المدينة</th>
                <th className="py-2.5 px-3">السجل / الضريبي</th>
                <th className="py-2.5 px-3 font-mono">الحد الائتماني</th>
                <th className="py-2.5 px-3 font-mono">الرصيد الجاري</th>
                <th className="py-2.5 px-3 text-center">الإجراءات والعمليات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredParties.map(party => {
                const isDebit = party.balance > 0;
                const isCredit = party.balance < 0;
                const creditLimit = party.creditLimit || 0;
                const isLimitExceeded = creditLimit > 0 && party.balance > creditLimit;

                return (
                  <tr key={party.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-800 text-[11px] whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Hash className="w-2.5 h-2.5 text-blue-600" />
                        <span>{party.code || '-'}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      <div>{party.name}</div>
                      {isLimitExceeded && (
                        <span className="text-[10px] text-rose-600 font-semibold block">
                          تجاوز الحد الائتماني!
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {party.isSubCustomer ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          <LinkIcon className="w-2.5 h-2.5 text-amber-700" />
                          <span>زبون فرعي</span>
                        </span>
                      ) : (
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          party.type === 'customer' ? 'bg-blue-100 text-blue-800' :
                          party.type === 'supplier' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {party.type === 'customer' ? 'عميل' : party.type === 'supplier' ? 'مورد' : 'كلاهما'}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{party.contactPerson || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      <div>{party.phone}</div>
                      <div className="text-[10px] text-slate-400 font-sans">{party.city || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[9px] text-slate-400 font-light">
                      <div>{party.commercialRegister ? `س.ت: ${party.commercialRegister}` : ''}</div>
                      <div>{party.taxNumber ? `ض: ${party.taxNumber}` : ''}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 font-semibold">
                      {creditLimit > 0 ? `${creditLimit.toLocaleString('ar-SA')} ${settings.currency}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold">
                      <span className={isDebit ? 'text-amber-700' : isCredit ? 'text-rose-600' : 'text-emerald-600'}>
                        {Math.abs(party.balance).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                      </span>
                      <span className="text-[10px] font-normal block text-slate-400">
                        {isDebit ? '(لنا)' : isCredit ? '(علينا)' : '(خالص)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedPartyForStatement(party)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-[11px] flex items-center gap-1 cursor-pointer"
                          title="كشف حساب تفصيلي مستمر"
                        >
                          <FileText className="w-3 h-3" />
                          <span>كشف حساب</span>
                        </button>
                        <button
                          onClick={() => {
                            setVoucherModalParty(party);
                            setVoucherType(party.type === 'customer' ? 'receipt' : 'payment');
                            setVoucherAmount(Math.abs(party.balance));
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-[11px] flex items-center gap-1 cursor-pointer"
                          title="سند قبض أو صرف"
                        >
                          <Receipt className="w-3 h-3" />
                          <span>سند</span>
                        </button>
                        {!isCashCustomerParty(party) && party.type !== 'supplier' && (
                          <button
                            onClick={() => setSpecialPricesPartyForModal(party)}
                            className={`p-1 rounded cursor-pointer transition-colors ${
                              party.specialPrices && Object.keys(party.specialPrices).length > 0
                                ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 font-bold'
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={
                              party.specialPrices && Object.keys(party.specialPrices).length > 0
                                ? `أسعار خاصة (${Object.keys(party.specialPrices).length} أصناف)`
                                : 'تحديد أسعار خاصة للعميل'
                            }
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(party)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                          title="تعديل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteParty(party.id, party.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Add / Edit Party */}
      {showPartyModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-4xl w-full p-4 shadow-2xl border border-slate-200 my-auto max-h-[92vh] flex flex-col text-slate-800 text-xs" dir="rtl">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 mb-2">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>{editingPartyId ? 'تعديل بيانات الحساب والأسعار الخاصة' : 'تسجيل حساب جديد في الدليل'}</span>
              </h3>
              <button
                onClick={() => setShowPartyModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-md hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveParty} noValidate className="space-y-2 overflow-y-auto pr-1 flex-1">
              {/* Type Selector (Compact inline) */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 font-bold text-xs whitespace-nowrap">نوع وطبيعة الحساب:</span>
                  <div className="inline-flex rounded-md p-0.5 bg-slate-100 border border-slate-200 gap-1">
                    <button
                      type="button"
                      onClick={() => setPartyType('customer')}
                      className={`px-3 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                        partyType === 'customer'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      عميل (مشتري مطبوعات)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPartyType('supplier')}
                      className={`px-3 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                        partyType === 'supplier'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      مورد (خامات وأوراق)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPartyType('both')}
                      className={`px-3 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                        partyType === 'both'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      عميل ومورد معاً
                    </button>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold hidden sm:inline-flex items-center gap-1">
                  <span>محمي من التكرار 🔒</span>
                </span>
              </div>

              {/* الثلاثة عناوين وخاناتهم في سطر واحد كلهم (الرقم التسلسلي + الاسم التجاري أو العميل + الشخص المسؤول) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                {/* 1. الرقم التسلسلي للعميل / الحساب */}
                <div className="md:col-span-3 flex items-center gap-1.5 bg-blue-50/70 border border-blue-200 rounded-md px-2 py-1">
                  <label className="text-slate-800 font-bold text-xs whitespace-nowrap flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>الرقم التسلسلي:</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={
                      editingPartyId
                        ? (parties.find(p => p.id === editingPartyId)?.code || '')
                        : 'تلقائي بعد الحفظ'
                    }
                    className="w-full bg-white border border-blue-300 rounded px-1.5 py-0.5 font-mono text-xs font-black text-blue-900 cursor-not-allowed text-center shadow-inner h-7"
                    title="يتم توليد الرقم التسلسلي آلياً فور إتمام الحفظ لمنع التكرار بين الأجهزة"
                  />
                </div>

                {/* 2. الاسم التجاري / اسم المنشأة أو العميل */}
                <div className="md:col-span-5 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-800 font-bold text-xs whitespace-nowrap flex items-center gap-1">
                    <span>الاسم التجاري / العميل</span>
                    <span className="text-rose-500 font-black">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="مثال: مطبعة القدس، مكتبة النور..."
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>

                {/* 3. الشخص المسؤول / ضابط الاتصال */}
                <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-700 font-bold text-xs whitespace-nowrap">
                    المسؤول / الاتصال:
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    placeholder="مثال: أ. أحمد رضوان"
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>
              </div>

              {/* سطر بيانات الاتصال المدمج: رقم الجوال + المدينة / المنطقة + البريد الإلكتروني */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                {/* رقم الجوال / الهاتف */}
                <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-700 font-bold text-xs whitespace-nowrap flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-500" />
                    <span>الجوال / الهاتف:</span>
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="059xxxxxxx"
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>

                {/* المدينة / المنطقة */}
                <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-700 font-bold text-xs whitespace-nowrap flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    <span>المدينة / المنطقة:</span>
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="القدس، رام الله، الخليل..."
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>

                {/* البريد الإلكتروني */}
                <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-700 font-bold text-xs whitespace-nowrap flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-500" />
                    <span>البريد الإلكتروني:</span>
                  </label>
                  <input
                    type="text"
                    inputMode="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="info@domain.com"
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7 font-mono"
                  />
                </div>
              </div>

              {/* سطر البيانات القانونية والعنوان المدمج: السجل التجاري + الرقم الضريبي + العنوان التفصيلي */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                {/* رقم السجل التجاري */}
                <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-700 font-bold text-xs whitespace-nowrap">
                    السجل التجاري (CR):
                  </label>
                  <input
                    type="text"
                    value={commercialRegister}
                    onChange={e => setCommercialRegister(e.target.value)}
                    placeholder="رقم السجل"
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>

                {/* الرقم الضريبي */}
                <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-700 font-bold text-xs whitespace-nowrap">
                    الرقم الضريبي (VAT):
                  </label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={e => setTaxNumber(e.target.value)}
                    placeholder="الرقم الضريبي"
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>

                {/* العنوان التفصيلي */}
                <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <label className="text-slate-700 font-bold text-xs whitespace-nowrap">
                    العنوان التفصيلي:
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="الشارع، البناية، الطابق..."
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>
              </div>

              {/* سطر السقف الائتماني والديون المدمج (خانات دائماً مصفرة وصغيرة في سطر واحد) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-amber-50/40 border border-amber-200/80 rounded-md p-1.5">
                {/* الحد الائتماني المسموح - مصفّر دائماً */}
                <div className="md:col-span-4 flex items-center gap-1.5">
                  <label className="text-slate-800 font-bold text-xs whitespace-nowrap flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                    <span>الحد الائتماني ({settings.currency}):</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={creditLimit}
                    onChange={e => setCreditLimit(Number(e.target.value) || 0)}
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 font-mono font-bold text-xs text-blue-900 focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>

                {/* الرصيد الافتتاحي / الدين السابق - مصفّر دائماً */}
                <div className="md:col-span-4 flex items-center gap-1.5">
                  <label className="text-slate-800 font-bold text-xs whitespace-nowrap">
                    الرصيد الافتتاحي / السابق:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={e => setOpeningBalance(Number(e.target.value) || 0)}
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 font-mono font-bold text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                  />
                </div>

                {/* طبيعة الرصيد السابق */}
                <div className="md:col-span-4 flex items-center gap-1.5">
                  <label className="text-slate-800 font-bold text-xs whitespace-nowrap">
                    طبيعة الرصيد:
                  </label>
                  <select
                    value={openingBalanceType}
                    onChange={e => setOpeningBalanceType(e.target.value as any)}
                    className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-semibold h-7"
                  >
                    <option value="debit">مدين (مطلوب منه لنا)</option>
                    <option value="credit">دائن (مستحق له علينا)</option>
                  </select>
                </div>
              </div>

              {/* سطر الملاحظات والشروط الخاصة المدمج */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                <label className="text-slate-700 font-bold text-xs whitespace-nowrap">
                  ملاحظات وشروط خاصة:
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="شروط سداد خاصة، ملاحظات تسليم أو خصومات..."
                  className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                />
              </div>

              {/* بند أسعار خاصة للعميل يتم فيها إضافة الأصناف التي ستسعر للعميل بسعر خاص مختلف عن سعر البيع (فقط للعملاء المسجلين، وليس للزبون النقدي) */}
              {!isCashCustomerParty(editingPartyId, undefined, name) && partyType !== 'supplier' && (
                <div className="bg-gradient-to-r from-amber-50/70 to-orange-50/50 border border-amber-300 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-amber-400 text-slate-900 rounded font-bold shadow-2xs">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-xs text-slate-900">
                      بند أسعار خاصة للعميل (أصناف مسعرة بسعر خاص مختلف عن سعر البيع)
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                      {Object.keys(specialPrices).length > 0
                        ? `${Object.keys(specialPrices).length} صنف مخصص`
                        : 'لا توجد أصناف خاصة بعد'}
                    </span>
                  </div>

                  {editingPartyId && (
                    <button
                      type="button"
                      onClick={() => {
                        const currentParty = parties.find(p => p.id === editingPartyId);
                        if (currentParty) {
                          setSpecialPricesPartyForModal(currentParty);
                        }
                      }}
                      className="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-white hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 cursor-pointer flex items-center gap-1 shadow-2xs"
                      title="فتح جدول كل أصناف المخزون لتحديد أسعار خاصة سريعة"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-blue-600" />
                      <span>جدول التسعير الشامل</span>
                    </button>
                  )}
                </div>

                {/* إضافة صنف بسعر خاص */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-2 rounded-md border border-amber-200 shadow-2xs">
                  {/* اختيار الصنف */}
                  <div className={`${selectedSpecialItem ? 'md:col-span-5' : 'md:col-span-8'} flex items-center gap-1.5`}>
                    <label className="text-slate-700 font-bold text-xs whitespace-nowrap">
                      اختر الصنف:
                    </label>
                    <select
                      value={selectedSpecialItemId}
                      onChange={e => {
                        const id = e.target.value;
                        setSelectedSpecialItemId(id);
                        const found = inventory.find(i => i.id === id);
                        if (found) {
                          setSpecialItemPriceInput(
                            specialPrices[id] !== undefined ? String(specialPrices[id]) : String(found.sellingPrice)
                          );
                        } else {
                          setSpecialItemPriceInput('');
                        }
                      }}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-hidden font-medium"
                    >
                      <option value="">-- اضغط لاختيار الصنف من المخزون --</option>
                      {inventory.map(item => {
                        const isAdded = specialPrices[item.id] !== undefined;
                        return (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.code}) - بيع قياسي: {item.sellingPrice.toFixed(2)} {settings.currency} {isAdded ? '★ (محدد)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* السعر القياسي والسعر الخاص */}
                  {selectedSpecialItem && (
                    <div className="md:col-span-5 flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">
                        القياسي: <strong className="text-slate-800 font-mono">{selectedSpecialItem.sellingPrice.toFixed(2)}</strong>
                      </span>
                      <div className="flex items-center gap-1 flex-1">
                        <label className="text-amber-900 font-bold text-xs whitespace-nowrap">
                          السعر الخاص:
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={specialItemPriceInput}
                          onChange={e => setSpecialItemPriceInput(e.target.value)}
                          placeholder="السعر الخاص"
                          className="w-full bg-amber-50/70 border border-amber-400 rounded px-2 py-1 text-xs font-mono font-black text-amber-950 focus:ring-1 focus:ring-amber-500 focus:outline-hidden text-center"
                        />
                      </div>
                    </div>
                  )}

                  {/* زر الاعتماد */}
                  <div className={`${selectedSpecialItem ? 'md:col-span-2' : 'md:col-span-4'} flex justify-end`}>
                    <button
                      type="button"
                      disabled={!selectedSpecialItemId || !specialItemPriceInput}
                      onClick={handleAddSpecialPriceItem}
                      className={`w-full py-1 px-3 rounded text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                        selectedSpecialItemId && specialItemPriceInput
                          ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>اعتماد السعر الخاص</span>
                    </button>
                  </div>
                </div>

                {/* جدول الأصناف ذات الأسعار الخاصة المحددة لهذا العميل */}
                {Object.keys(specialPrices).length > 0 ? (
                  <div className="max-h-36 overflow-y-auto border border-amber-200 rounded-md bg-white">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-amber-50/80 text-amber-950 font-bold border-b border-amber-200 sticky top-0">
                        <tr>
                          <th className="py-1 px-2.5">الصنف</th>
                          <th className="py-1 px-2 text-center w-24">السعر القياسي</th>
                          <th className="py-1 px-2 text-center w-32">السعر الخاص للعميل</th>
                          <th className="py-1 px-2 text-center w-28">الفارق / الخصم</th>
                          <th className="py-1 px-2 text-center w-14">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {Object.entries(specialPrices).map(([itemId, specialVal]) => {
                          const item = inventory.find(i => i.id === itemId);
                          if (!item) return null;
                          const specialNum = Number(specialVal) || 0;
                          const diff = item.sellingPrice - specialNum;
                          const percent = item.sellingPrice > 0 ? Math.round((diff / item.sellingPrice) * 100) : 0;
                          return (
                            <tr key={itemId} className="hover:bg-amber-50/40">
                              <td className="py-1 px-2.5 font-semibold text-slate-800">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] text-slate-400">{item.code}</span>
                                  <span>{item.name}</span>
                                </div>
                              </td>
                              <td className="py-1 px-2 text-center font-mono text-slate-500 line-through text-[11px]">
                                {item.sellingPrice.toFixed(2)} {settings.currency}
                              </td>
                              <td className="py-1 px-2 text-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={specialVal}
                                  onChange={e => handleUpdateSpecialPriceItem(itemId, parseFloat(e.target.value) || 0)}
                                  className="w-24 px-1.5 py-0.5 bg-amber-50 border border-amber-300 rounded font-mono font-bold text-amber-900 text-xs text-center focus:ring-1 focus:ring-amber-500"
                                />
                              </td>
                              <td className="py-1 px-2 text-center">
                                {diff > 0 ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    توفير {percent}% ({diff.toFixed(1)} ₪)
                                  </span>
                                ) : diff < 0 ? (
                                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                    زيادة {Math.abs(percent)}%
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">نفس السعر</span>
                                )}
                              </td>
                              <td className="py-1 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSpecialPriceItem(itemId)}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                                  title="إلغاء السعر الخاص وإعادة السعر القياسي"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-white/80 border border-dashed border-amber-300 rounded-md p-2 text-center text-slate-500 text-[11px]">
                    💡 يمكنك تخصيص أسعار خاصة ومخفضة لأي صنف لهذا العميل، وسيقوم الكاشير ونظام الفواتير باعتمادها تلقائياً عند اختياره.
                  </div>
                )}
              </div>
              )}

              {/* Form Buttons */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPartyModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingPartyId ? 'حفظ التعديلات والأسعار الخاصة' : 'تسجيل الحساب بالدليل'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Special Prices Full Matrix Modal */}
      {specialPricesPartyForModal && (
        <CustomerSpecialPricesModal
          party={specialPricesPartyForModal}
          isOpen={Boolean(specialPricesPartyForModal)}
          onClose={() => setSpecialPricesPartyForModal(null)}
          onSavePrices={prices => {
            if (specialPricesPartyForModal) {
              updateParty(specialPricesPartyForModal.id, { specialPrices: prices });
              if (editingPartyId === specialPricesPartyForModal.id) {
                setSpecialPrices(prices);
              }
            }
          }}
        />
      )}

      {/* Modal: Voucher (سند قبض / سند صرف) */}
      {voucherModalParty && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-xl max-w-sm w-full p-4 shadow-xl border border-slate-200">
            <h3 className="font-bold text-xs text-slate-900 mb-1 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-blue-600" />
              <span>{voucherType === 'receipt' ? 'تحرير سند قبض مالي (استلام)' : 'تحرير سند صرف مالي (دفع)'}</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-light mb-3">
              الطرف: <strong className="text-slate-900">{voucherModalParty.name}</strong> • الرصيد الحالي: {Math.abs(voucherModalParty.balance).toLocaleString('ar-SA')} {settings.currency}
            </p>

            <form onSubmit={handleSaveVoucher} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setVoucherType('receipt')}
                  className={`py-1.5 rounded-md font-bold cursor-pointer transition-colors text-xs ${
                    voucherType === 'receipt' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  سند قبض (استلام)
                </button>
                <button
                  type="button"
                  onClick={() => setVoucherType('payment')}
                  className={`py-1.5 rounded-md font-bold cursor-pointer transition-colors text-xs ${
                    voucherType === 'payment' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  سند صرف (دفع)
                </button>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">المبلغ المسدد ({settings.currency}):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={voucherAmount}
                  onChange={e => setVoucherAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 font-bold font-mono text-slate-900 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">طريقة الدفع:</label>
                  <select
                    value={voucherMethod}
                    onChange={e => setVoucherMethod(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="cash">نقداً من الصندوق</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">الصندوق / الخزينة:</label>
                  <select
                    value={voucherTreasuryCode}
                    onChange={e => setVoucherTreasuryCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="1101">الخزينة الرئيسية (الكاشير)</option>
                    <option value="1102">الحساب البنكي الجاري</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">البيان والشرح المحاسبي:</label>
                <input
                  type="text"
                  value={voucherDesc}
                  onChange={e => setVoucherDesc(e.target.value)}
                  placeholder="دفعة على الحساب، سداد فاتورة توريد، تصفية رصيد..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVoucherModalParty(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-xs cursor-pointer text-xs"
                >
                  اعتماد السند وتحديث الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Balance Reconciliation Modal */}
      <BalanceReconciliationModal
        isOpen={showReconciliationModal}
        onClose={() => setShowReconciliationModal(false)}
      />
    </div>
  );
};
