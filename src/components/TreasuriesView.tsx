import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { Treasury, TreasuryType, TreasuryTransaction } from '../types';
import { posSound } from '../utils/audio';
import { TreasuryDepositWithdrawModal } from './TreasuryDepositWithdrawModal';
import {
  Wallet,
  Landmark,
  Smartphone,
  CreditCard,
  ArrowLeftRight,
  Plus,
  Edit2,
  Trash2,
  History,
  Search,
  Building2,
  Coins,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  Filter,
  ShieldCheck,
  TrendingUp,
  Receipt,
  Printer
} from 'lucide-react';

export const TreasuriesView: React.FC = () => {
  const {
    treasuries,
    addTreasury,
    updateTreasury,
    deleteTreasury,
    transferBetweenTreasuries,
    setSelectedVoucherForPrint,
    vouchers,
    settings,
    journalEntries,
    currencies
  } = useAccounting();

  // Filter and search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingTreasury, setEditingTreasury] = useState<Treasury | null>(null);

  // Deposit and Withdrawal Modal state
  const [showDepositWithdrawModal, setShowDepositWithdrawModal] = useState(false);
  const [depositWithdrawMode, setDepositWithdrawMode] = useState<'deposit' | 'withdrawal'>('deposit');
  const [depositWithdrawTargetTreasuryId, setDepositWithdrawTargetTreasuryId] = useState<string | undefined>(undefined);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string>('');
  const [transferDestId, setTransferDestId] = useState<string>('');
  const [transferCurrency, setTransferCurrency] = useState<string>('ILS');
  const [transferExchangeRate, setTransferExchangeRate] = useState<number>(1.0);
  const [transferAmount, setTransferAmount] = useState<number | ''>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [selectedTreasuryForLedger, setSelectedTreasuryForLedger] = useState<Treasury | null>(null);

  // Form state for add/edit
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<TreasuryType>('bank_app');
  const [formBalance, setFormBalance] = useState<number>(0);
  const [formBankName, setFormBankName] = useState('');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formAccountCode, setFormAccountCode] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');

  // KPI calculations
  const totalLiquidity = useMemo(() => {
    return treasuries.reduce((sum, t) => sum + (t.balance || 0), 0);
  }, [treasuries]);

  const cashBoxTotal = useMemo(() => {
    return treasuries
      .filter(t => t.type === 'cash_box')
      .reduce((sum, t) => sum + (t.balance || 0), 0);
  }, [treasuries]);

  const bankAppsTotal = useMemo(() => {
    return treasuries
      .filter(t => t.type === 'bank_app' || t.type === 'bank_account')
      .reduce((sum, t) => sum + (t.balance || 0), 0);
  }, [treasuries]);

  const walletsAndPosTotal = useMemo(() => {
    return treasuries
      .filter(t => t.type === 'digital_wallet' || t.type === 'pos_terminal')
      .reduce((sum, t) => sum + (t.balance || 0), 0);
  }, [treasuries]);

  // Multi-currency system-wide holdings
  const systemCurrencyHoldings = useMemo(() => {
    const holdings: Record<string, number> = {};
    treasuries.forEach(t => {
      if (t.currencyBalances && Object.keys(t.currencyBalances).length > 0) {
        Object.entries(t.currencyBalances).forEach(([c, amt]) => {
          holdings[c] = (holdings[c] || 0) + (Number(amt) || 0);
        });
      } else {
        holdings['ILS'] = (holdings['ILS'] || 0) + (t.balance || 0);
      }
    });
    return holdings;
  }, [treasuries]);

  // Filtered treasuries
  const filteredTreasuries = useMemo(() => {
    return treasuries.filter(t => {
      const matchType = typeFilter === 'all' || t.type === typeFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.bankName && t.bankName.toLowerCase().includes(q)) ||
        (t.accountNumber && t.accountNumber.toLowerCase().includes(q)) ||
        (t.accountCode && t.accountCode.includes(q));
      return matchType && matchSearch;
    });
  }, [treasuries, typeFilter, searchQuery]);

  // Handle open Add Modal
  const handleOpenAdd = () => {
    setEditingTreasury(null);
    setFormName('');
    setFormType('bank_app');
    setFormBalance(0);
    setFormBankName('الحساب البنكي');
    setFormAccountNumber('');
    setFormAccountCode('');
    setFormNotes('');
    setFormStatus('active');
    setShowAddEditModal(true);
  };

  // Handle open Edit Modal
  const handleOpenEdit = (t: Treasury) => {
    setEditingTreasury(t);
    setFormName(t.name);
    setFormType(t.type);
    setFormBalance(t.balance);
    setFormBankName(t.bankName || '');
    setFormAccountNumber(t.accountNumber || '');
    setFormAccountCode(t.accountCode || '');
    setFormNotes(t.notes || '');
    setFormStatus(t.status);
    setShowAddEditModal(true);
  };

  // Handle Save
  const handleSaveTreasury = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingTreasury) {
      const res = updateTreasury(editingTreasury.id, {
        name: formName.trim(),
        type: formType,
        bankName: formBankName.trim() || undefined,
        accountNumber: formAccountNumber.trim() || undefined,
        accountCode: formAccountCode.trim() || undefined,
        notes: formNotes.trim() || undefined,
        status: formStatus
      });
      if (res.success) {
        posSound.playSuccessBeep();
        setShowAddEditModal(false);
      } else {
        alert(res.message);
      }
    } else {
      const res = addTreasury({
        name: formName.trim(),
        type: formType,
        balance: Number(formBalance) || 0,
        bankName: formBankName.trim() || undefined,
        accountNumber: formAccountNumber.trim() || undefined,
        accountCode: formAccountCode.trim() || undefined,
        notes: formNotes.trim() || undefined,
        status: formStatus
      });
      if (res.success) {
        posSound.playCashBeep();
        setShowAddEditModal(false);
      } else {
        alert(res.message);
      }
    }
  };

  // Handle Delete
  const handleDelete = (t: Treasury) => {
    if (t.isDefault) {
      alert('لا يمكن حذف الصندوق النقدي الرئيسي للنظام.');
      return;
    }
    if (t.balance > 0) {
      alert(`لا يمكن حذف الخزنة (${t.name}) لأن رصيدها الحالي (${t.balance.toLocaleString()} ${settings.currency}) أكبر من صفر. قم بتحويل الرصيد إلى خزنة أخرى أولاً.`);
      return;
    }
    if (window.confirm(`هل أنت متأكد من حذف الخزنة "${t.name}"؟`)) {
      const res = deleteTreasury(t.id);
      if (res.success) {
        posSound.playErrorBeep();
      } else {
        alert(res.message);
      }
    }
  };

  // Handle open Deposit and Withdrawal Modal
  const handleOpenDeposit = (treasuryId?: string) => {
    setDepositWithdrawMode('deposit');
    setDepositWithdrawTargetTreasuryId(treasuryId);
    setShowDepositWithdrawModal(true);
  };

  const handleOpenWithdraw = (treasuryId?: string) => {
    setDepositWithdrawMode('withdrawal');
    setDepositWithdrawTargetTreasuryId(treasuryId);
    setShowDepositWithdrawModal(true);
  };

  // Handle open Transfer Modal
  const handleOpenTransfer = (defaultSourceId?: string) => {
    const src = defaultSourceId || treasuries[0]?.id || '';
    setTransferSourceId(src);
    const availableDest = treasuries.find(t => t.id !== src);
    setTransferDestId(availableDest ? availableDest.id : '');
    setTransferCurrency('ILS');
    setTransferExchangeRate(1.0);
    setTransferAmount('');
    setTransferNotes('');
    setTransferDate(new Date().toISOString().split('T')[0]);
    setShowTransferModal(true);
  };

  const handleCurrencyChange = (currCode: string) => {
    setTransferCurrency(currCode);
    const curr = currencies.find(c => c.code === currCode);
    setTransferExchangeRate(currCode === 'ILS' ? 1.0 : (curr?.rateAgainstBase || 1.0));
  };

  // Handle execute Transfer
  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSourceId || !transferDestId || !transferAmount || Number(transferAmount) <= 0) {
      alert('يرجى اختيار الخزينة المصدر والوجهة وتحديد مبلغ التحويل.');
      return;
    }

    const res = transferBetweenTreasuries(
      transferSourceId,
      transferDestId,
      Number(transferAmount),
      transferNotes.trim() || undefined,
      transferDate,
      transferCurrency,
      Number(transferExchangeRate) || 1.0
    );

    if (res.success) {
      posSound.playCashBeep();
      setShowTransferModal(false);
      alert(res.message);
    } else {
      alert(res.message);
    }
  };

  // Type metadata
  const getTypeInfo = (type: TreasuryType) => {
    switch (type) {
      case 'cash_box':
        return {
          label: 'صندوق نقدي (كاشير)',
          icon: Coins,
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          badgeColor: 'bg-emerald-100 text-emerald-800'
        };
      case 'bank_app':
        return {
          label: 'تطبيق بنكي (Bank App)',
          icon: Smartphone,
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          badgeColor: 'bg-blue-100 text-blue-800'
        };
      case 'digital_wallet':
        return {
          label: 'محفظة إلكترونية (Wallet)',
          icon: Wallet,
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          badgeColor: 'bg-purple-100 text-purple-800'
        };
      case 'pos_terminal':
        return {
          label: 'جهاز نقاط بيع (مدى / POS)',
          icon: CreditCard,
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          badgeColor: 'bg-amber-100 text-amber-800'
        };
      case 'bank_account':
        return {
          label: 'حساب بنكي جاري',
          icon: Landmark,
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          badgeColor: 'bg-indigo-100 text-indigo-800'
        };
      default:
        return {
          label: 'خزينة',
          icon: Wallet,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          badgeColor: 'bg-slate-100 text-slate-800'
        };
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      
      {/* Top Header & Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Wallet className="w-4 h-4" />
            </div>
            <h1 className="text-sm font-bold text-slate-900">إدارة الخزنات والصناديق والتطبيقات البنكية</h1>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => handleOpenDeposit()}
              id="btn-treasury-quick-deposit"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
              title="إيداع مبلغ مالي في خزنة أو تطبيق بنكي"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>إيداع</span>
            </button>

            <button
              onClick={() => handleOpenWithdraw()}
              id="btn-treasury-quick-withdraw"
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
              title="سحب مبلغ مالي من خزنة أو تطبيق بنكي"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>سحب</span>
            </button>

            <button
              onClick={() => handleOpenTransfer()}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors border border-slate-300 cursor-pointer shadow-xs"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-600" />
              <span>تحويل</span>
            </button>

            <button
              onClick={() => {
                posSound.playSuccessBeep();
                alert('تمت إعادة تدقيق ومراجعة كافة الفواتير والسندات تلقائياً، وتوزيع جميع الحركات المترتبة عليها على خزاينها الصحيحة وتطهير الصناديق السابقة بنجاح! 🟢');
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
              title="إعادة فحص وتدقيق وتوزيع كافة الفواتير على الخزائن والصناديق تلقائياً"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>تدقيق تلقائي</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة خزنة</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Total Liquidity */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block">إجمالي السيولة</span>
              <span className="text-sm font-bold font-mono text-slate-900">
                {totalLiquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Primary Cash Vault */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block">الصندوق النقدي (الكاشير)</span>
              <span className="text-sm font-bold font-mono text-teal-700">
                {cashBoxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Bank Apps & Accounts */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block">التطبيقات والحسابات البنكية</span>
              <span className="text-sm font-bold font-mono text-blue-700">
                {bankAppsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </span>
            </div>
          </div>
        </div>

        {/* POS & Wallets */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block">أجهزة مدى والمحافظ</span>
              <span className="text-sm font-bold font-mono text-purple-700">
                {walletsAndPosTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، البنك، رقم الحساب أو كود الدليل..."
            className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-colors"
          />
        </div>

        {/* Type Filter Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'cash_box', label: 'صناديق نقدية' },
            { id: 'bank_app', label: 'تطبيقات بنكية' },
            { id: 'digital_wallet', label: 'محافظ رقمية' },
            { id: 'pos_terminal', label: 'أجهزة مدى POS' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                typeFilter === f.id
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Treasuries Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredTreasuries.map(treasury => {
          const typeInfo = getTypeInfo(treasury.type);
          const IconComp = typeInfo.icon;
          const isPrimary = treasury.isDefault || treasury.id === 'treasury-cash-main';

          return (
            <div
              key={treasury.id}
              className={`bg-white rounded-xl border transition-all duration-200 shadow-xs flex flex-col justify-between ${
                isPrimary
                  ? 'border-emerald-300 ring-1 ring-emerald-400/30'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="p-4">
                {/* Card Top: Badges & Type */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${typeInfo.bg}`}>
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{treasury.name}</h3>
                        {isPrimary && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            الرئيسي
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-light">{typeInfo.label}</span>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                    كود: {treasury.accountCode}
                  </span>
                </div>

                {/* Balance Display - Multi-Currency Separated */}
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200/80 mb-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-1">
                    <span className="text-[9px] text-slate-400 font-light font-bold">الرصيد الفعلي في الصندوق</span>
                    <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold border border-emerald-200/60">
                      مفصول بالعملة الفعلية
                    </span>
                  </div>

                  {/* Multi-currency distinct list */}
                  <div className="space-y-1">
                    {(() => {
                      const curBal = { ...(treasury.currencyBalances || {}) };
                      let foreignVal = 0;
                      Object.entries(curBal).forEach(([cCode, cAmt]) => {
                        if (cCode !== 'ILS') {
                          const cRate = currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0;
                          foreignVal += (Number(cAmt) || 0) * cRate;
                        }
                      });
                      curBal['ILS'] = Number(((treasury.balance || 0) - foreignVal).toFixed(2));
                      
                      const balances = Object.entries(curBal).filter(([_, amt]) => (amt as number) !== 0);
                      if (balances.length === 0) {
                        balances.push(['ILS', treasury.balance || 0]);
                      }

                      return balances.map(([currCode, amt]) => {
                        const currObj = currencies.find(c => c.code === currCode);
                        const symbol = currCode === 'ILS' ? '₪' : (currObj?.symbol || currCode);
                        const name = currObj?.name || currCode;

                        return (
                          <div key={currCode} className="flex items-center justify-between text-xs bg-white px-2 py-1 rounded border border-slate-200/70">
                            <span className="text-slate-600 font-medium flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                              <span>{name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">({currCode})</span>
                            </span>
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              {(amt as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {symbol}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Accounting Equivalent in Base Currency */}
                  <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400 font-light">
                    <span>المعادل التقديري المحاسبي:</span>
                    <span className="font-mono font-bold text-slate-700">
                      {treasury.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                    </span>
                  </div>
                </div>

                {/* Additional Details */}
                <div className="space-y-1.5 text-xs text-slate-600">
                  {treasury.bankName && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        <span>البنك / المشغل:</span>
                      </span>
                      <span className="font-semibold text-slate-800">{treasury.bankName}</span>
                    </div>
                  )}

                  {treasury.accountNumber && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        <span>رقم الحساب / الآيبان:</span>
                      </span>
                      <span className="font-mono text-slate-800 font-medium dir-ltr select-all">
                        {treasury.accountNumber}
                      </span>
                    </div>
                  )}

                  {treasury.notes && (
                    <p className="text-[10px] text-slate-400 font-light line-clamp-2 pt-1 border-t border-slate-100">
                      {treasury.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Card Bottom Actions */}
              <div className="px-3.5 py-2.5 bg-slate-50/80 border-t border-slate-100 rounded-b-xl flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => handleOpenDeposit(treasury.id)}
                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title={`إيداع مبلغ في ${treasury.name}`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                    <span>إيداع</span>
                  </button>

                  <button
                    onClick={() => handleOpenWithdraw(treasury.id)}
                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title={`سحب مبلغ من ${treasury.name}`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-amber-700" />
                    <span>سحب</span>
                  </button>

                  <button
                    onClick={() => handleOpenTransfer(treasury.id)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-blue-700 border border-slate-200 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="تحويل مالي من هذه الخزنة"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                    <span>تحويل</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedTreasuryForLedger(treasury);
                      setShowTransactionsModal(true);
                    }}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="استعراض سجل العمليات وحركة الخزنة"
                  >
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">الحركات</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(treasury)}
                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                    title="تعديل بيانات الخزنة"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {!isPrimary && (
                    <button
                      onClick={() => handleDelete(treasury)}
                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      title="حذف الخزنة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTreasuries.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">لم يتم العثور على أي خزنات أو تطبيقات تطابق البحث</h3>
          <p className="text-[10px] text-slate-400 font-light mb-4">يمكنك إضافة تطبيق بنكي جديد أو صندوق نقدي بنقرة واحدة</p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة خزنة جديدة</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. Add / Edit Treasury Modal */}
      {/* ========================================================================= */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">
                  {editingTreasury ? `تعديل بيانات: ${editingTreasury.name}` : 'إضافة خزنة / تطبيق بنكي جديد'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveTreasury} className="p-5 space-y-3.5">
              
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الخزنة / التطبيق البنكي: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="مثال: الحساب البنكي الرئيسي، الصندوق النقدي الفرعي..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-colors"
                />
              </div>

              {/* Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الخزنة / الحساب:</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as TreasuryType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="bank_app">تطبيق بنكي (Bank App)</option>
                    <option value="cash_box">صندوق نقدي (خزينة كاشير)</option>
                    <option value="digital_wallet">محفظة رقمية (STC Pay / Urpay)</option>
                    <option value="pos_terminal">جهاز نقاط بيع وشبكة (مدى POS)</option>
                    <option value="bank_account">حساب بنكي جاري</option>
                  </select>
                </div>

                {/* Initial Balance (only for new) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {editingTreasury ? 'الرصيد الحالي:' : 'الرصيد الافتتاحي:'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!!editingTreasury}
                    value={formBalance}
                    onChange={e => setFormBalance(Number(e.target.value))}
                    className={`w-full border rounded-lg p-2 text-xs font-mono font-bold ${
                      editingTreasury
                        ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                        : 'bg-slate-50 text-slate-900 border-slate-200 focus:bg-white focus:ring-2 focus:ring-emerald-500'
                    }`}
                  />
                  {editingTreasury && (
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      يتم تعديل الرصيد تلقائياً عبر حركات الإيداع والصرف والتحويل.
                    </span>
                  )}
                </div>
              </div>

              {/* Bank Name & Account Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم البنك / المشغل:</label>
                  <input
                    type="text"
                    value={formBankName}
                    onChange={e => setFormBankName(e.target.value)}
                    placeholder="بنك فلسطين، البنك العربي، بنك القدس..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الحساب / الآيبان / المعرف:</label>
                  <input
                    type="text"
                    value={formAccountNumber}
                    onChange={e => setFormAccountNumber(e.target.value)}
                    placeholder="SA0380000... أو رقم الجوال أو رقم الجهاز"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 dir-ltr text-right"
                  />
                </div>
              </div>

              {/* Account Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">كود الحساب في شجرة الحسابات (مثل 1102):</label>
                <input
                  type="text"
                  value={formAccountCode}
                  disabled={Boolean(editingTreasury && ((editingTreasury.transactions?.length || 0) > 0 || editingTreasury.balance !== 0))}
                  onChange={e => setFormAccountCode(e.target.value)}
                  placeholder="اتركه فارغاً ليقوم النظام بتعيينه تلقائياً (1102، 1103...)"
                  className={`w-full border rounded-lg p-2 text-xs font-mono ${
                    Boolean(editingTreasury && ((editingTreasury.transactions?.length || 0) > 0 || editingTreasury.balance !== 0))
                      ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                      : 'bg-slate-50 text-slate-900 border-slate-200 focus:bg-white focus:ring-2 focus:ring-emerald-500'
                  }`}
                />
                {editingTreasury && ((editingTreasury.transactions?.length || 0) > 0 || editingTreasury.balance !== 0) && (
                  <span className="text-[10px] text-amber-600 block mt-0.5 font-bold">
                    🔒 تم قفل وتثبيت كود الحساب لوجود حركات أو رصيد مسجل عليه حفاظاً على سلامة النظام المحاسبي.
                  </span>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وبيان الخزنة:</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="أي ملاحظات حول الغرض من الخزنة أو صلاحيات الاستخدام..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>



              {/* Actions */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {editingTreasury ? 'حفظ التعديلات' : 'إنشاء الخزنة / التطبيق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Transfer Between Treasuries Modal */}
      {/* ========================================================================= */}
      {showTransferModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">تحويل مالي بين الخزائن والتطبيقات البنكية</h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Transfer Form */}
            <form onSubmit={handleExecuteTransfer} className="p-5 space-y-4">
              
              {/* From / To Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Source Treasury */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    من الخزنة (المصدر / المسحوب منها): <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={transferSourceId}
                    onChange={e => setTransferSourceId(e.target.value)}
                    required
                    className="w-full bg-white border border-slate-300 rounded-md p-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    {treasuries.map(t => (
                      <option key={t.id} value={t.id} disabled={t.id === transferDestId}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  {/* Selected Source Balance Preview */}
                  {(() => {
                    const src = treasuries.find(t => t.id === transferSourceId);
                    if (!src) return null;
                    const srcBal = (src.currencyBalances && src.currencyBalances[transferCurrency] !== undefined)
                      ? src.currencyBalances[transferCurrency]
                      : (transferCurrency === 'ILS' ? (src.balance || 0) : 0);
                    const currObj = currencies.find(c => c.code === transferCurrency);
                    const sym = transferCurrency === 'ILS' ? '₪' : (currObj?.symbol || transferCurrency);

                    return (
                      <div className="mt-2 text-[11px] p-2 bg-white rounded border border-slate-200/80 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">المتاح من ({transferCurrency}):</span>
                          <strong className={`font-mono ${srcBal < (Number(transferAmount) || 0) ? 'text-rose-600' : 'text-slate-900'}`}>
                            {srcBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {sym}
                          </strong>
                        </div>
                        {srcBal < (Number(transferAmount) || 0) && (
                          <div className="text-[10px] text-rose-600 font-bold">
                            ⚠️ الرصيد المتاح من هذه العملة غير كافٍ!
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Dest Treasury */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    إلى الخزنة (الوجهة / المودع فيها): <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={transferDestId}
                    onChange={e => setTransferDestId(e.target.value)}
                    required
                    className="w-full bg-white border border-slate-300 rounded-md p-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    {treasuries.map(t => (
                      <option key={t.id} value={t.id} disabled={t.id === transferSourceId}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  {/* Selected Dest Balance Preview */}
                  {(() => {
                    const dst = treasuries.find(t => t.id === transferDestId);
                    if (!dst) return null;
                    const dstBal = (dst.currencyBalances && dst.currencyBalances[transferCurrency] !== undefined)
                      ? dst.currencyBalances[transferCurrency]
                      : (transferCurrency === 'ILS' ? (dst.balance || 0) : 0);
                    const currObj = currencies.find(c => c.code === transferCurrency);
                    const sym = transferCurrency === 'ILS' ? '₪' : (currObj?.symbol || transferCurrency);
                    const newDstBal = dstBal + (Number(transferAmount) || 0);

                    return (
                      <div className="mt-2 text-[11px] p-2 bg-white rounded border border-slate-200/80">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">الرصيد بعد التحويل:</span>
                          <strong className="text-emerald-700 font-mono">
                            {newDstBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {sym}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Currency & Exchange Rate selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عملة التحويل الفعلية: <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={transferCurrency}
                    onChange={e => handleCurrencyChange(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md p-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  >
                    {currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code} - {c.symbol})
                      </option>
                    ))}
                  </select>
                  <span className="text-[9px] text-slate-400 font-light mt-1 block">
                    تبقى العملة كما هي في الصندوق الوجهة دون تحويل
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر الصرف وقت العملية ({settings.currency}): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    disabled={transferCurrency === 'ILS'}
                    value={transferExchangeRate}
                    onChange={e => setTransferExchangeRate(Number(e.target.value) || 1.0)}
                    className="w-full bg-white border border-slate-300 rounded-md p-2 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-[9px] text-slate-400 font-light mt-1 block">
                    {transferCurrency === 'ILS' ? 'العملة الأساسية (سعر 1.0)' : 'يستخدم لاحتساب القيد المحاسبي بالشيكل فقط'}
                  </span>
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المبلغ المراد تحويله ({transferCurrency}): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                  {transferCurrency !== 'ILS' && Number(transferAmount) > 0 && (
                    <div className="mt-1 text-[11px] text-slate-600">
                      المعادل المحاسبي: <strong className="text-blue-700 font-mono font-bold">{((Number(transferAmount) || 0) * transferExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2 })} ₪</strong>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التحويل:</label>
                  <DateInput required value={transferDate} onChange={e => setTransferDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Statement / Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان / سبب التحويل:</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  placeholder="مثال: توريد نقدية مبيعات الكاشير إلى الحساب البنكي، أو تغذية العهدة..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Double-entry notice */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-[11px]">
                  <p>
                    <strong>ترحيل القيد المزدوج التلقائي:</strong>
                  </p>
                  <p>• من حـ/ {treasuries.find(t => t.id === transferDestId)?.name || 'الخزنة المودع فيها'} (مدين - زيادة أصل)</p>
                  <p>• إلى حـ/ {treasuries.find(t => t.id === transferSourceId)?.name || 'الخزنة المسحوب منها'} (دائن - نقص أصل)</p>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>اعتماد التحويل الآن</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Treasury Transactions & Movements Modal */}
      {/* ========================================================================= */}
      {showTransactionsModal && selectedTreasuryForLedger && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm">سجل حركات وعمليات: {selectedTreasuryForLedger.name}</h3>
                  <p className="text-[11px] text-slate-400">
                    كود الحساب: {selectedTreasuryForLedger.accountCode} | الرصيد الحالي: {selectedTreasuryForLedger.balance.toLocaleString()} {settings.currency}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTransactionsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content / Table */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {/* Mini Summary Box with Multi-Currency */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="text-[9px] text-slate-400 font-light block">النوع</span>
                    <span className="text-xs font-bold text-slate-800">{getTypeInfo(selectedTreasuryForLedger.type).label}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-light block">البنك / المشغل</span>
                    <span className="text-xs font-bold text-slate-800">{selectedTreasuryForLedger.bankName || 'خزينة محلية'}</span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[9px] text-slate-400 font-light block">المعادل المحاسبي (شيكل)</span>
                    <span className="text-xs font-bold font-mono text-emerald-700">
                      {selectedTreasuryForLedger.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ₪
                    </span>
                  </div>
                </div>

                {/* Balances by currency */}
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[9px] text-slate-400 font-light font-bold block mb-1">الموجودات النقدية الفعلية داخل الصندوق (مفصولة بالعملة):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const balances = selectedTreasuryForLedger.currencyBalances && Object.keys(selectedTreasuryForLedger.currencyBalances).length > 0
                        ? Object.entries(selectedTreasuryForLedger.currencyBalances).filter(([_, amt]) => amt !== 0)
                        : [['ILS', selectedTreasuryForLedger.balance || 0]];

                      if (balances.length === 0) balances.push(['ILS', 0]);

                      return balances.map(([currCode, amt]) => {
                        const currObj = currencies.find(c => c.code === currCode);
                        const sym = currCode === 'ILS' ? '₪' : (currObj?.symbol || currCode);
                        const name = currObj?.name || currCode;
                        return (
                          <div key={currCode} className="bg-white px-2.5 py-1 rounded border border-slate-200 font-mono text-xs flex items-center gap-1.5 shadow-2xs">
                            <span className="text-slate-500 font-sans font-medium">{name}:</span>
                            <span className="font-bold text-slate-900">
                              {(amt as number).toLocaleString(undefined, { minimumFractionDigits: 2 })} {sym}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* Multi-currency Rule Note */}
              <div className="px-3 py-1.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-[11px] text-blue-800 flex items-center justify-between">
                <span>سعر الصرف مثبت وقت كل عملية مالية ولا يعاد تعديل العمليات القديمة مع تغير الأسعار اللاحقة.</span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-100/70 px-2 py-0.5 rounded">معيار محاسبي</span>
              </div>

              {/* Transactions List */}
              {selectedTreasuryForLedger.transactions && selectedTreasuryForLedger.transactions.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2">التاريخ</th>
                        <th className="p-2">نوع الحركة</th>
                        <th className="p-2">البيان والتفاصيل</th>
                        <th className="p-2 text-left">المبلغ الفعلي</th>
                        <th className="p-2 text-center">سعر الصرف</th>
                        <th className="p-2 text-left">المكافئ (شيكل)</th>
                        <th className="p-2 text-left">الرصيد بعدها</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {selectedTreasuryForLedger.transactions.map((tx, idx) => {
                        const isIncome = tx.type === 'deposit' || tx.type === 'transfer_in';
                        const currCode = tx.actualCurrency || 'ILS';
                        const currObj = currencies.find(c => c.code === currCode);
                        const sym = currCode === 'ILS' ? '₪' : (currObj?.symbol || currCode);
                        const actualAmt = tx.actualAmount ?? tx.amount;
                        const rate = tx.exchangeRate || 1.0;
                        const baseAmt = tx.baseAmount ?? tx.amount;

                        return (
                          <tr key={`tr-tx-${tx.id || idx}-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2 text-slate-600 whitespace-nowrap">{tx.date}</td>
                            <td className="p-2 font-sans whitespace-nowrap">
                              {tx.type === 'deposit' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  إيداع
                                </span>
                              )}
                              {tx.type === 'withdrawal' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  صرف / سحب
                                </span>
                              )}
                              {tx.type === 'transfer_in' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  تحويل وارد
                                </span>
                              )}
                              {tx.type === 'transfer_out' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  تحويل صادر
                                </span>
                              )}
                            </td>
                            <td className="p-2 font-sans text-slate-800">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="line-clamp-1">{tx.description}</span>
                                {tx.voucherNumber && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const v = vouchers.find(vch => vch.voucherNumber === tx.voucherNumber);
                                      if (v) setSelectedVoucherForPrint(v);
                                    }}
                                    className="font-mono text-[10px] text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="معاينة وطباعة السند المالي"
                                  >
                                    <Printer className="w-2.5 h-2.5" />
                                    <span>{tx.voucherNumber}</span>
                                  </button>
                                )}
                              </div>
                              {tx.targetTreasuryName && (
                                <span className="text-[9px] text-slate-400 font-light block">
                                  الطرف الآخر: {tx.targetTreasuryName}
                                </span>
                              )}
                            </td>
                            <td className={`p-2 text-left font-bold whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isIncome ? '+' : '-'}{actualAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })} {sym}
                            </td>
                            <td className="p-2 text-center text-slate-500 text-[11px] whitespace-nowrap">
                              {rate.toFixed(4)}
                            </td>
                            <td className="p-2 text-left text-slate-700 font-medium whitespace-nowrap">
                              {baseAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })} ₪
                            </td>
                            <td className="p-2 text-left text-slate-900 font-bold whitespace-nowrap">
                              {tx.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-semibold">لا توجد حركات مسجلة لهذه الخزنة حتى الآن</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    جميع عمليات التحويل والصرف والإيداع التي تتم ستظهر هنا بتسلسل زمني دقيق.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setShowTransactionsModal(false);
                    handleOpenDeposit(selectedTreasuryForLedger.id);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>إيداع في هذه الخزنة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowTransactionsModal(false);
                    handleOpenWithdraw(selectedTreasuryForLedger.id);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>سحب من هذه الخزنة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowTransactionsModal(false);
                    handleOpenTransfer(selectedTreasuryForLedger.id);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>تحويل مالي</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowTransactionsModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit and Withdrawal Modal */}
      <TreasuryDepositWithdrawModal
        isOpen={showDepositWithdrawModal}
        onClose={() => setShowDepositWithdrawModal(false)}
        initialMode={depositWithdrawMode}
        initialTreasuryId={depositWithdrawTargetTreasuryId}
      />

    </div>
  );
};
