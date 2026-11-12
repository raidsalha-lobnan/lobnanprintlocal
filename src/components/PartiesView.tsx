import React, { useMemo, useState, useEffect } from 'react';
import { claimMasterForm, finishMasterForm } from '../utils/masterFormNavigation';
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
import { isCashCustomerParty } from '../utils/partyUtils';
import { indexedSubCustomers, isInvoiceOnlySubCustomer, registeredSubCustomer, subCustomerParentId } from '../utils/subCustomerIdentity';
import { CustomerSpecialPricesModal } from './pos/CustomerSpecialPricesModal';
import { BalanceReconciliationModal } from './BalanceReconciliationModal';
import { posSound } from '../utils/audio';
import { calculatePartyTrueBalance } from '../utils/statementGenerator';
import {
  customerPeriodRows, customerPeriodTotals, customerDateBounds,
  printCustomerPeriodRegister, exportCustomerPeriodCSV, type CustomerPeriodMode,
  type CustomerListKind
} from '../utils/customerPeriodReport';
import { Printer, CalendarDays, Banknote, ChartNoAxesCombined } from 'lucide-react';

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
    settings
  } = useAccounting();

  // Balance Reconciliation Modal State
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);

  // Filters and View Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [customerSection, setCustomerSection] = useState<CustomerListKind>('main');
  const [dateMode, setDateMode] = useState<CustomerPeriodMode>('all');
  const localDate = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'),
      String(now.getDate()).padStart(2,'0')].join('-');
  };
  const [selectedDay, setSelectedDay] = useState(localDate);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [addingSubCustomer, setAddingSubCustomer] = useState(false);
  const [parentPartyId, setParentPartyId] = useState('');

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
  const handleOpenAddModal = (asSubCustomer = false) => {
    setEditingPartyId(null);
    setPartyType('customer');
    setAddingSubCustomer(asSubCustomer);
    setParentPartyId('');
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
    setOpeningBalanceType('debit');
    setOpeningBalanceDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setSpecialPrices({});
    setSelectedSpecialItemId('');
    setSpecialItemPriceInput('');
    setShowPartyModal(true);
  };

  // Open modal for editing existing party
  const handleOpenEditModal = (party: Party) => {
    if (isCashCustomerParty(party)) {
      setToastMsg({text:'العميل النقدي CUST-0001 ثابت ولا يمكن تعديله.',type:'error'});
      return;
    }
    setAddingSubCustomer(!!party.isSubCustomer);
    setParentPartyId(party.parentPartyId || '');
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

  // The same full Add/Edit customer form is invoked by POS and master directory.
  useEffect(() => {
    const request = claimMasterForm('party');
    if (!request) return;
    const editing = request.editId ? parties.find(p => p.id === request.editId) : null;
    if (editing) {
      handleOpenEditModal(editing);
    } else {
      handleOpenAddModal(Boolean(request.isSubCustomer));
      setParentPartyId(request.parentPartyId || '');
      setName(request.initialName || '');
      setCustomerSection(request.isSubCustomer ? 'sub' : 'main');
    }
  }, []);

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSaveParty = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (editingPartyId && isCashCustomerParty(parties.find(p => p.id === editingPartyId))) {
      setToastMsg({text:'العميل النقدي CUST-0001 لا يمكن تعديله.',type:'error'});
      return;
    }
    if (!editingPartyId && addingSubCustomer &&
        !parties.some(p => p.id === parentPartyId && !p.isSubCustomer &&
          (p.type === 'customer' || p.type === 'both'))) {
      setToastMsg({text:'اختر العميل الرئيسي الصحيح قبل إضافة العميل الفرعي.',type:'error'});
      return;
    }
    if (!trimmedName) {
      setToastMsg({ text: 'يرجى كتابة الاسم التجاري أو اسم العميل أولاً', type: 'error' });
      return;
    }

    let savedPartyId: string | null = editingPartyId;
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
        const createdParty = addParty({
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
          isSubCustomer: addingSubCustomer,
          parentPartyId: addingSubCustomer ? parentPartyId : undefined,
          specialPrices
        });
        savedPartyId = createdParty.id;
        posSound.playSuccessBeep();
        setToastMsg({
          text: `تم تسجيل العميل الجديد "${trimmedName}" بنجاح في الدليل!`,
          type: 'success'
        });
      }

      if (savedPartyId) finishMasterForm('party', savedPartyId);
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
    const party = parties.find(p => p.id === id);
    if (!party || isCashCustomerParty(party)) return;
    if (invoices.some(inv => inv.customerId === id || inv.subCustomerId === id ||
      (inv as typeof inv & {counterpartyId?:string}).counterpartyId === id)) {
      setToastMsg({text:'لا يمكن حذف عميل له فواتير بيع مرتبطة به. يمكنك تعديل بياناته فقط.',type:'error'});
      return;
    }
    if (window.confirm(`هل تريد حذف العميل "${partyName}"؟ سيتم التحقق من عدم وجود أي ارتباط محاسبي.`)) {
      const result = deleteParty(id);
      setToastMsg({
        type:result.success?'success':'error',
        text:result.success?'تم حذف العميل غير المرتبط بأي حركات.':result.message||'تعذر حذف العميل.'
      });
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


  const reportSource = useMemo(() => ({
    parties, invoices, vouchers, purchases, purchaseReturns,
    salesReturns, printOrders, journalEntries, debtClearings
  }),[parties,invoices,vouchers,purchases,purchaseReturns,salesReturns,printOrders,
      journalEntries,debtClearings]);
  const dateFilter = useMemo(() => ({
    mode:dateMode,day:selectedDay,from:dateFrom,to:dateTo,
    list:customerSection,query:searchQuery
  }),[dateMode,selectedDay,dateFrom,dateTo,customerSection,searchQuery]);
  const invalidPeriod = dateMode==='range' && !!dateFrom && !!dateTo && dateFrom>dateTo;
  const mainRows = useMemo(() => invalidPeriod?[]:customerPeriodRows(reportSource,{
    ...dateFilter,list:'main'
  }),[reportSource,dateFilter,invalidPeriod]);
  const subRows = useMemo(() => invalidPeriod?[]:customerPeriodRows(reportSource,{
    ...dateFilter,list:'sub'
  }),[reportSource,dateFilter,invalidPeriod]);
  const rows = customerSection==='main'?mainRows:subRows;
  const mainTotals = customerPeriodTotals(mainRows);
  const sectionTotals = customerPeriodTotals(rows);
  const allMainCustomers = parties.filter(p => !p.isSubCustomer &&
    (p.type==='customer'||p.type==='both'));
  // The heading and report must count the same effective customer identities,
  // including invoice-only historical walk-in customers.
  const allSubCustomers = useMemo(() => indexedSubCustomers(parties, invoices).filter(p =>
    p.type === 'customer' || p.type === 'both'), [parties, invoices]);
  const money = (value:number):string =>
    Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const deleteLocked = (party:Party):boolean =>
    isInvoiceOnlySubCustomer(party) || isCashCustomerParty(party) ||
    invoices.some(inv => inv.customerId===party.id || inv.subCustomerId===party.id ||
      (inv as typeof inv & {counterpartyId?:string}).counterpartyId===party.id) ||
    vouchers.some(v => v.partyId===party.id) ||
    parties.some(p => p.parentPartyId===party.id) ||
    salesReturns.some(r => r.customerId===party.id) ||
    printOrders.some(po => po.customerId===party.id) ||
    debtClearings.some(dc => dc.customerId===party.id || dc.supplierId===party.id);

  // Do not issue a voucher, edit, or delete against a synthetic history-only ID.
  // Master creation allocates the actual SUB serial through the server on sync.
  const registerHistoricalSubCustomer = (inferred: Party): void => {
    if (!isInvoiceOnlySubCustomer(inferred)) return;
    const parentId = subCustomerParentId(inferred);
    const parent = parties.find(p => p.id === parentId && !p.isSubCustomer &&
      (p.type === 'customer' || p.type === 'both'));
    if (!parent) {
      setToastMsg({ text: 'لا يمكن تسجيل الزبون الفرعي: العميل الرئيسي غير موجود.', type: 'error' });
      return;
    }
    if (registeredSubCustomer(parties, parent.id, inferred.name)) {
      setToastMsg({ text: 'هذا الزبون الفرعي مسجل بالفعل؛ حدّث الصفحة بعد المزامنة.', type: 'success' });
      return;
    }
    try {
      addParty({
        type: 'customer',
        name: inferred.name,
        phone: inferred.phone || '',
        isSubCustomer: true,
        parentPartyId: parent.id,
        openingBalance: 0,
        initialBalance: 0
      });
      setToastMsg({
        text: 'تم إرسال تسجيل الزبون الفرعي. الرقم النهائي يعتمد بعد المزامنة، ولم تتغير الفواتير أو القيود.',
        type: 'success'
      });
    } catch (error) {
      setToastMsg({
        text: 'تعذر تسجيل الزبون الفرعي: ' + (error instanceof Error ? error.message : 'خطأ غير معروف'),
        type: 'error'
      });
    }
  };

  const printRegister = () => {
    if (invalidPeriod) {
      setToastMsg({text:'تاريخ بداية الفترة يجب ألا يكون بعد تاريخ نهايتها.',type:'error'});
      return;
    }
    printCustomerPeriodRegister(reportSource,dateFilter,
      settings.businessName || 'مطبعة ومكتبة لبنان',settings.currency||'₪');
  };
  const summaryCards = [
    {key:'closing',label:'إجمالي رصيد آخر الفترة',amount:mainTotals.closing,
      className:'bg-amber-50/60 border-amber-200 text-amber-800',Icon:Wallet},
    {key:'sales',label:'إجمالي مبيعات الفترة',amount:mainTotals.sales,
      className:'bg-blue-50/60 border-blue-200 text-blue-800',Icon:ChartNoAxesCombined},
    {key:'receipt',label:'إجمالي المقبوضات',amount:mainTotals.receipts,
      className:'bg-emerald-50/60 border-emerald-200 text-emerald-800',Icon:Banknote},
    {key:'movement',label:'صافي حركة الفترة',amount:mainTotals.movement,
      className:'bg-violet-50/60 border-violet-200 text-violet-800',Icon:FileSpreadsheet}
  ];

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col gap-1.5 overflow-hidden" dir="rtl">
      {toastMsg && (
        <div className={`absolute top-10 inset-x-2 z-30 flex items-center justify-between gap-2 p-2 rounded-lg border shadow-lg text-xs font-bold ${toastMsg.type==='error'?'bg-rose-50 text-rose-800 border-rose-200':'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
          <span>{toastMsg.text}</span>
          <button type="button" onClick={() => setToastMsg(null)} aria-label="إغلاق التنبيه">✕</button>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-xs min-h-[38px]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-blue-50 rounded-md text-blue-600"><Users className="w-4 h-4" /></div>
          <div className="min-w-0">
            <h2 className="text-[12px] font-black text-slate-900 whitespace-nowrap">دليل العملاء وكشوف الحساب</h2>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
          <button type="button" onClick={() => setShowReconciliationModal(true)}
            className="inline-flex h-7 shrink-0 items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap">
            <Scale className="w-3.5 h-3.5" /> مراجعة الأرصدة
          </button>
          <button type="button" onClick={() => handleOpenAddModal(false)}
            className="inline-flex h-7 shrink-0 items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" /> إضافة عميل رئيسي
          </button>
          <button type="button" onClick={() => handleOpenAddModal(true)}
            className="inline-flex h-7 shrink-0 items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" /> إضافة عميل فرعي
          </button>
          <button type="button" disabled={invalidPeriod}
            onClick={()=>exportCustomerPeriodCSV(reportSource,dateFilter)}
            className="inline-flex h-7 shrink-0 items-center gap-1 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap">
            <FileSpreadsheet className="w-3.5 h-3.5"/> تصدير Excel
          </button>
          <button type="button" onClick={printRegister} disabled={invalidPeriod}
            className="inline-flex h-7 shrink-0 items-center gap-1 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-400 text-white rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap">
            <Printer className="w-3.5 h-3.5" /> طباعة كشف العملاء
          </button>
        </div>
      </div>

      <div className="flex shrink-0 min-h-[39px] items-center gap-1.5 overflow-x-auto whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-xs">
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={()=>setCustomerSection('main')}
              className={`h-7 px-2.5 rounded-md text-[11px] font-black whitespace-nowrap ${customerSection==='main'?'bg-blue-700 text-white shadow-sm':'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>
              العملاء الرئيسيون ({allMainCustomers.length})
            </button>
            <button type="button" onClick={()=>setCustomerSection('sub')}
              className={`h-7 px-2.5 rounded-md text-[11px] font-black whitespace-nowrap ${customerSection==='sub'?'bg-violet-700 text-white shadow-sm':'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>
              العملاء الفرعيون ({allSubCustomers.length})
            </button>
          </div>

          <label className="flex items-center gap-2 w-[350px] shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 h-7">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input type="search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none text-xs"
              placeholder="الاسم أو الرقم التسلسلي أو الجوال..." aria-label="البحث عن عميل" />
          </label>
          <label className="flex items-center gap-1.5 shrink-0 whitespace-nowrap text-[11px] text-slate-600 font-bold">
            <CalendarDays className="w-4 h-4 text-indigo-600"/>
            <select value={dateMode} onChange={e=>setDateMode(e.target.value as CustomerPeriodMode)}
              className="h-7 w-[145px] px-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-xs">
              <option value="all">جميع التواريخ</option>
              <option value="day">تاريخ محدد</option>
              <option value="range">من تاريخ إلى تاريخ</option>
            </select>
          </label>
          {dateMode==='day'&&
            <label className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-slate-600">
              التاريخ <input type="date" value={selectedDay} onChange={e=>setSelectedDay(e.target.value)}
                dir="ltr" className="h-7 w-[126px] shrink-0 border border-slate-200 rounded-lg bg-slate-50 px-2 text-xs"/>
            </label>}
          {dateMode==='range'&&<>
            <label className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-slate-600">
              من <input type="date" value={dateFrom} max={dateTo||undefined}
                onChange={e=>setDateFrom(e.target.value)} dir="ltr"
                className="h-7 px-2 rounded-lg border border-slate-200 bg-slate-50 text-xs"/>
            </label>
            <label className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-slate-600">
              إلى <input type="date" value={dateTo} min={dateFrom||undefined}
                onChange={e=>setDateTo(e.target.value)} dir="ltr"
                className="h-7 px-2 rounded-lg border border-slate-200 bg-slate-50 text-xs"/>
            </label>
          </>}
          <button type="button"
            onClick={()=>{setSearchQuery('');setDateMode('all');setDateFrom('');setDateTo('')}}
            className="h-7 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold whitespace-nowrap">
            إظهار الكل
          </button>
          <div className="ms-auto flex shrink-0 items-center gap-2 text-[10px] whitespace-nowrap font-semibold text-slate-600">
            <span>المعروض: <b className="text-slate-900">{rows.length}</b> حساب</span>
            <span className="text-slate-300">|</span>
            <span>إجمالي الرصيد: <b dir="ltr" className="inline-block text-blue-800 tabular-nums">{money(sectionTotals.closing)} {settings.currency}</b></span>
          </div>
      </div>
      {invalidPeriod && <p className="shrink-0 px-2 text-rose-700 text-[11px] font-bold">تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.</p>}
      <div className="shrink-0 overflow-x-auto">
        <div className="grid min-w-[850px] grid-cols-4 gap-1.5">
        {summaryCards.map(({key,label,amount,className,Icon})=>(
          <div key={key} className={`rounded-lg border px-2 py-1 shadow-xs min-w-0 ${className}`}>
            <div className="flex h-[28px] items-center gap-1.5 justify-between whitespace-nowrap min-w-0">
              <Icon className="w-4 h-4 shrink-0 opacity-80" />
              <span className="text-[11px] xl:text-xs font-extrabold shrink-0">{label}</span>
              <span className="text-[13px] font-black tracking-tight tabular-nums shrink-0" dir="ltr">
                {money(amount)} <span className="text-xs">{settings.currency}</span>
              </span>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
        <div role="region" aria-label="جدول العملاء" tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[1140px] table-fixed text-[11px] text-right border-collapse">
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-blue-950 text-white">
              <tr>
                {[
                  'الرقم التسلسلي','اسم العميل',
                  'رصيد أول الفترة','مبيعات الفترة','المقبوضات',
                  'عدد الفواتير','التسويات','صافي الحركة','رصيد آخر الفترة','الإجراءات'
                ].map(h=><th key={h} className="py-2.5 px-2 text-center whitespace-nowrap font-bold border-l border-blue-900">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.length===0&&<tr><td colSpan={10} className="text-center py-10 text-slate-500">
                لا يوجد عملاء مطابقون لخيارات التصفية.
              </td></tr>}
              {rows.map((row,index)=>{
                const party=row.party;
                const cash=isCashCustomerParty(party);
                const locked=deleteLocked(party);
                const currentBalance=displayedParties.find(p=>p.id===party.id)?.balance??row.closing;
                return (
                  <tr key={party.id} className={cash?'bg-blue-50/90 hover:bg-blue-100/70':
                    index%2===0?'bg-white hover:bg-blue-50/50':'bg-slate-50/80 hover:bg-blue-50/50'}>
                    <td className="px-2 py-2 text-center whitespace-nowrap font-mono text-blue-800 font-black">
                      {isInvoiceOnlySubCustomer(party) ? 'غير مرقم' : (party.code || '—')}{cash&&<Lock className="inline w-3 h-3 text-amber-700 mr-1" />}
                    </td>
                    <td className="px-2 py-2 font-bold text-slate-900" title={party.name}>
                      <span className="block w-full truncate whitespace-nowrap">{party.name}</span>
                    </td>
                    {[row.opening,row.sales,row.receipts].map((value,k)=>(
                      <td key={k} dir="ltr" className="px-2 py-2 text-left tabular-nums whitespace-nowrap">
                        {money(value)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-bold">{row.invoiceCount}</td>
                    {[row.adjustments,row.movement].map((value,k)=>(
                      <td key={k} dir="ltr" className={`px-2 py-2 text-left tabular-nums whitespace-nowrap ${value<0?'text-rose-700':'text-emerald-800'}`}>
                        {money(value)}
                      </td>
                    ))}
                    <td dir="ltr" className={`px-2 py-2 text-left font-black tabular-nums whitespace-nowrap ${row.closing<0?'text-rose-700':'text-blue-900'}`}>
                      {money(row.closing)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={()=>setSelectedPartyForStatement(party)}
                          className="bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-md px-2 py-1 text-blue-800 font-bold"
                          title="فتح كشف الحساب التفصيلي">كشف حساب</button>
                        {isInvoiceOnlySubCustomer(party) && (
                          <button type="button" onClick={() => registerHistoricalSubCustomer(party)}
                            className="px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100"
                            title="تسجيل الزبون الفرعي في دليل العملاء والحصول على الرقم الحقيقي">تسجيل وترقيم</button>
                        )}
                        <button type="button" disabled={isInvoiceOnlySubCustomer(party)} onClick={()=>{setVoucherModalParty({...party,balance:currentBalance});setVoucherType('receipt');setVoucherAmount(Math.abs(currentBalance));}}
                          className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-md" title="سند قبض">
                          <Receipt className="w-3.5 h-3.5" /></button>
                        {!cash&&!isInvoiceOnlySubCustomer(party)&&<button type="button" onClick={()=>handleOpenEditModal(party)}
                          className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-md" title="تعديل بيانات العميل">
                          <Edit2 className="w-3.5 h-3.5" /></button>}
                        <button type="button" disabled={locked}
                          onClick={()=>handleDeleteParty(party.id,party.name)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-md"
                          title={locked?'لا يمكن حذف العميل النقدي أو العميل المرتبط بعمليات مالية':'حذف عميل بلا حركات'}>
                          <Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!!rows.length&&<tr className="bg-blue-900 text-white font-black">
                <td colSpan={2} className="px-3 py-2.5 whitespace-nowrap">إجمالي {customerSection==='main'?'العملاء الرئيسيين':'العملاء الفرعيين'}</td>
                {[sectionTotals.opening,sectionTotals.sales,sectionTotals.receipts].map((n,i)=>
                  <td key={i} dir="ltr" className="px-2 py-2.5 text-left whitespace-nowrap">{money(n)}</td>)}
                <td className="px-2 py-2.5 text-center">{sectionTotals.invoiceCount}</td>
                {[sectionTotals.adjustments,sectionTotals.movement,sectionTotals.closing].map((n,i)=>
                  <td key={i} dir="ltr" className="px-2 py-2.5 text-left whitespace-nowrap">{money(n)}</td>)}
                <td />
              </tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add / Edit Party */}
      {showPartyModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-4xl w-full p-4 shadow-2xl border border-slate-200 my-auto max-h-[92vh] flex flex-col text-slate-800 text-xs" dir="rtl">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 mb-2">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>{editingPartyId ? 'تعديل بيانات الحساب والأسعار الخاصة' : 'تسجيل عميل جديد'}</span>
              </h3>
              <button
                onClick={() => setShowPartyModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-md hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveParty} noValidate className="space-y-2 overflow-y-auto pr-1 flex-1">
              {/* Customer-only modal: no supplier controls on the customers screen. */}
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold">
                  <Users className="w-3.5 h-3.5"/>
                  {addingSubCustomer?'العميل الفرعي':'العميل الرئيسي'}
                </span>
                <span className="text-[11px] font-bold text-emerald-800 whitespace-nowrap">
                  <Lock className="w-3.5 h-3.5 inline ml-1"/> الرقم التسلسلي يصدر آليًا ولا يتكرر
                </span>
              </div>
              {addingSubCustomer && (
                <label className="flex flex-wrap items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2 text-xs font-bold text-violet-900">
                  تابع للعميل الرئيسي
                  <select required disabled={!!editingPartyId} value={parentPartyId}
                    onChange={e=>setParentPartyId(e.target.value)}
                    className="h-9 min-w-[210px] flex-1 border border-violet-200 rounded-md bg-white px-2 text-slate-900 disabled:opacity-60">
                    <option value="">اختر العميل الرئيسي</option>
                    {parties.filter(p=>!p.isSubCustomer&&(p.type==='customer'||p.type==='both'))
                      .sort((a,b)=>Number((a.code||'').match(/\\d+$/)?.[0]||0)-Number((b.code||'').match(/\\d+$/)?.[0]||0))
                      .map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </label>
              )}

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
                  placeholder="دفعة على حساب العميل، سداد فاتورة، تصفية رصيد..."
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
        customerOnly
      />
    </div>
  );
};
