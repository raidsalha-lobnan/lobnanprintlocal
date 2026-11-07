import React, { useState, useEffect, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { posSound } from '../utils/audio';
import { PaymentVoucher } from '../types';
import {
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Printer,
  CheckCircle2,
  AlertCircle,
  Coins,
  CreditCard,
  Building2,
  Calendar,
  User,
  FileText,
  Wallet,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface TreasuryDepositWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'deposit' | 'withdrawal';
  initialTreasuryId?: string;
  onSuccess?: (message: string) => void;
}

export const TreasuryDepositWithdrawModal: React.FC<TreasuryDepositWithdrawModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'deposit',
  initialTreasuryId,
  onSuccess
}) => {
  const {
    treasuries,
    accounts,
    currencies,
    depositIntoTreasury,
    withdrawFromTreasury,
    setSelectedVoucherForPrint
  } = useAccounting();

  const [mode, setMode] = useState<'deposit' | 'withdrawal'>(initialMode);
  const [treasuryId, setTreasuryId] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [currencyCode, setCurrencyCode] = useState<string>('ILS');
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [contraAccountCode, setContraAccountCode] = useState<string>('3101');
  const [partyName, setPartyName] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');

  // Results / State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedVoucher, setCompletedVoucher] = useState<PaymentVoucher | null>(null);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const [completedEntryNumber, setCompletedEntryNumber] = useState<string | null>(null);

  // Sync with initial props
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      const defaultTId = initialTreasuryId || treasuries[0]?.id || '';
      setTreasuryId(defaultTId);
      setAmount('');
      setCurrencyCode('ILS');
      setExchangeRate(1.0);
      setContraAccountCode(initialMode === 'deposit' ? '3101' : '3102');
      setPartyName('');
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setErrorMessage(null);
      setCompletedVoucher(null);
      setCompletedMessage(null);
      setCompletedEntryNumber(null);
    }
  }, [isOpen, initialMode, initialTreasuryId, treasuries]);

  // When mode changes manually
  const handleModeChange = (newMode: 'deposit' | 'withdrawal') => {
    setMode(newMode);
    setErrorMessage(null);
    if (newMode === 'deposit') {
      if (contraAccountCode === '3102' || contraAccountCode === '5205') {
        setContraAccountCode('3101');
      }
    } else {
      if (contraAccountCode === '3101' || contraAccountCode === '4201') {
        setContraAccountCode('3102');
      }
    }
  };

  const handleCurrencyChange = (cCode: string) => {
    setCurrencyCode(cCode);
    const curr = currencies.find(c => c.code === cCode);
    setExchangeRate(cCode === 'ILS' ? 1.0 : (curr?.rateAgainstBase || 1.0));
  };

  const selectedTreasury = useMemo(() => {
    return treasuries.find(t => t.id === treasuryId);
  }, [treasuries, treasuryId]);

  const currencySymbol = useMemo(() => {
    if (currencyCode === 'ILS') return '₪';
    return currencies.find(c => c.code === currencyCode)?.symbol || currencyCode;
  }, [currencies, currencyCode]);

  // Current balance of selected treasury in chosen currency
  const availableBalanceInCurr = useMemo(() => {
    if (!selectedTreasury) return 0;
    if (selectedTreasury.currencyBalances && selectedTreasury.currencyBalances[currencyCode] !== undefined) {
      return Number(selectedTreasury.currencyBalances[currencyCode]) || 0;
    }
    return currencyCode === 'ILS' ? (selectedTreasury.balance || 0) : 0;
  }, [selectedTreasury, currencyCode]);

  const numAmount = Number(amount) || 0;
  const isOverdraft = mode === 'withdrawal' && numAmount > 0 && numAmount > availableBalanceInCurr;
  const baseEquivalent = Number((numAmount * (Number(exchangeRate) || 1.0)).toFixed(2));

  // Selected contra account details
  const selectedContraAcc = useMemo(() => {
    return accounts.find(a => a.code === contraAccountCode);
  }, [accounts, contraAccountCode]);

  // Handle Form Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!treasuryId) {
      setErrorMessage('يرجى تحديد الخزنة أو الصندوق أولاً.');
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setErrorMessage('يرجى إدخال مبلغ صحيح أكبر من الصفر.');
      return;
    }

    if (mode === 'withdrawal') {
      if (isOverdraft) {
        setErrorMessage(
          `الرصيد المتاح للسحب في (${selectedTreasury?.name}) هو ${availableBalanceInCurr.toLocaleString()} ${currencySymbol} فقط، ولا يكفي لسحب ${numAmount.toLocaleString()} ${currencySymbol}.`
        );
        return;
      }

      const res = withdrawFromTreasury({
        treasuryId,
        amount: numAmount,
        currencyCode,
        exchangeRate: Number(exchangeRate) || 1.0,
        contraAccountCode,
        recipientName: partyName.trim() || undefined,
        notes: notes.trim() || undefined,
        date
      });

      if (res.success) {
        posSound.playCashBeep();
        setCompletedVoucher(res.voucher || null);
        setCompletedMessage(res.message || 'تمت عملية السحب بنجاح.');
        setCompletedEntryNumber(res.entryNumber || null);
        if (onSuccess) onSuccess(res.message || '');
      } else {
        setErrorMessage(res.message || 'حدث خطأ أثناء تنفيذ السحب.');
      }
    } else {
      // Deposit
      const res = depositIntoTreasury({
        treasuryId,
        amount: numAmount,
        currencyCode,
        exchangeRate: Number(exchangeRate) || 1.0,
        contraAccountCode,
        depositorName: partyName.trim() || undefined,
        notes: notes.trim() || undefined,
        date
      });

      if (res.success) {
        posSound.playCashBeep();
        setCompletedVoucher(res.voucher || null);
        setCompletedMessage(res.message || 'تمت عملية الإيداع بنجاح.');
        setCompletedEntryNumber(res.entryNumber || null);
        if (onSuccess) onSuccess(res.message || '');
      } else {
        setErrorMessage(res.message || 'حدث خطأ أثناء تنفيذ الإيداع.');
      }
    }
  };

  const handlePrintVoucher = () => {
    if (completedVoucher) {
      setSelectedVoucherForPrint(completedVoucher);
      onClose();
    }
  };

  const handleResetForNew = () => {
    setCompletedVoucher(null);
    setCompletedMessage(null);
    setCompletedEntryNumber(null);
    setAmount('');
    setNotes('');
    setPartyName('');
    setErrorMessage(null);
  };

  if (!isOpen) return null;

  return (
    <div
      id="treasury-deposit-withdraw-modal-backdrop"
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div
        id="treasury-deposit-withdraw-modal-container"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in duration-200"
      >
        {/* Modal Header */}
        <div
          className={`px-5 py-4 flex items-center justify-between text-white ${
            mode === 'deposit' ? 'bg-emerald-700' : 'bg-amber-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow-xs">
              {mode === 'deposit' ? (
                <ArrowDownLeft className="w-5 h-5 text-white" />
              ) : (
                <ArrowUpRight className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-base">
                {mode === 'deposit' ? 'إيداع نقدي / بنكي في الخزينة' : 'سحب نقدي / بنكي من الخزينة'}
              </h3>
              <p className="text-xs text-white/80">
                {mode === 'deposit'
                  ? 'توريد مبالغ نقدية أو بنكية وتوليد سند قبض وقيد مزدوج آلي'
                  : 'صرف مبالغ نقدية أو بنكية وتوليد سند صرف وقيد مزدوج آلي'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (If not completed) */}
        {!completedVoucher && (
          <div className="px-5 pt-3.5 pb-2 bg-slate-50 border-b border-slate-200 flex gap-2">
            <button
              type="button"
              id="tab-mode-deposit"
              onClick={() => handleModeChange('deposit')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'deposit'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>إيداع (توريد نقدية إلى الخزنة)</span>
            </button>

            <button
              type="button"
              id="tab-mode-withdraw"
              onClick={() => handleModeChange('withdrawal')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'withdrawal'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>سحب (صرف نقدية من الخزنة)</span>
            </button>
          </div>
        )}

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700">
          {/* SUCCESS SCREEN */}
          {completedVoucher ? (
            <div className="space-y-4 py-2 text-center animate-in zoom-in-95 duration-150">
              <div
                className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${
                  completedVoucher.type === 'receipt' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-900 mb-1">
                  {completedVoucher.type === 'receipt' ? 'تم الإيداع وترحيل المحاسبة بنجاح!' : 'تم السحب وترحيل المحاسبة بنجاح!'}
                </h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">{completedMessage}</p>
              </div>

              {/* Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-right space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-semibold">رقم السند المالي:</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {completedVoucher.voucherNumber}
                  </span>
                </div>
                {completedEntryNumber && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-semibold">رقم القيد المحاسبي:</span>
                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {completedEntryNumber}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-semibold">المبلغ المنفذ:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {completedVoucher.amount.toLocaleString()} {completedVoucher.currencySymbol || completedVoucher.currency}
                    {completedVoucher.currency !== 'ILS' && (
                      <span className="text-xs font-normal text-slate-500 mr-1">
                        (≈ {completedVoucher.baseAmount?.toLocaleString()} ₪)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-semibold">الخزنة / الصندوق:</span>
                  <span className="font-bold text-slate-900">{selectedTreasury?.name}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handlePrintVoucher}
                  className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة السند رسمياً</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetForNew}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  إجراء عملية أخرى
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : (
            /* FORM VIEW */
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-semibold">{errorMessage}</span>
                </div>
              )}

              {/* 1. Select Target Treasury */}
              <div>
                <label className="block font-bold text-slate-800 mb-1.5">
                  {mode === 'deposit' ? 'الخزنة أو الصندوق المستهدف للإيداع *' : 'الخزنة أو الصندوق المراد السحب منه *'}
                </label>
                <select
                  id="select-target-treasury"
                  value={treasuryId}
                  onChange={e => setTreasuryId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                  required
                >
                  {treasuries.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (الكود: {t.accountCode}) - الرصيد الإجمالي: {t.balance.toLocaleString()} ₪
                    </option>
                  ))}
                </select>

                {/* Available Balance Status Pill */}
                {selectedTreasury && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-slate-100/90 rounded-lg border border-slate-200">
                    <span className="text-slate-600 font-medium">الرصيد المتوفر حالياً بعملة ({currencyCode}):</span>
                    <span className="font-bold text-slate-900">
                      {availableBalanceInCurr.toLocaleString()} {currencySymbol}
                      {currencyCode !== 'ILS' && (
                        <span className="text-slate-500 font-normal mr-1">
                          (من إجمالي {selectedTreasury.balance.toLocaleString()} ₪)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* 2. Amount and Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Amount */}
                <div className="sm:col-span-6">
                  <label className="block font-bold text-slate-800 mb-1.5">
                    المبلغ بالعملة المختارة *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      id="input-op-amount"
                      min="0.01"
                      step="any"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className={`w-full px-3 py-2 border rounded-lg text-sm font-bold focus:outline-hidden focus:ring-2 transition-all ${
                        isOverdraft
                          ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:ring-rose-500'
                          : 'border-slate-300 bg-white text-slate-900 focus:ring-emerald-500'
                      }`}
                      required
                    />
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                      {currencySymbol}
                    </span>
                  </div>
                </div>

                {/* Currency */}
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-800 mb-1.5">العملة *</label>
                  <select
                    id="select-op-currency"
                    value={currencyCode}
                    onChange={e => handleCurrencyChange(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="ILS">شيكل (ILS ₪)</option>
                    {currencies
                      .filter(c => c.code !== 'ILS')
                      .map(c => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.code} {c.symbol})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Exchange Rate */}
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-800 mb-1.5">سعر الصرف (للشيكل)</label>
                  <input
                    type="number"
                    id="input-op-rate"
                    step="0.001"
                    disabled={currencyCode === 'ILS'}
                    value={exchangeRate}
                    onChange={e => setExchangeRate(parseFloat(e.target.value) || 1.0)}
                    className="w-full px-2.5 py-2 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 border border-slate-300 rounded-lg text-xs font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Overdraft Warning Banner */}
              {isOverdraft && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    تنبيه: المبلغ المطلوب سحبه ({numAmount.toLocaleString()} {currencySymbol}) أكبر من الرصيد المتوفر في هذه الخزنة ({availableBalanceInCurr.toLocaleString()} {currencySymbol})!
                  </span>
                </div>
              )}

              {/* Deposit projection banner */}
              {mode === 'deposit' && numAmount > 0 && (
                <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-center justify-between">
                  <span>الرصيد المتوقع بعد الإيداع:</span>
                  <span className="font-bold">
                    {(availableBalanceInCurr + numAmount).toLocaleString()} {currencySymbol}
                    {currencyCode !== 'ILS' && (
                      <span className="font-normal text-emerald-700 mr-1.5">
                        (المعادل الأساسي: ≈ {baseEquivalent.toLocaleString()} ₪)
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* 3. Contra Account & Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    {mode === 'deposit' ? 'الحساب المقابل (مصدر التمويل) *' : 'الحساب المقابل (سبب السحب) *'}
                  </label>
                  <select
                    id="select-contra-account"
                    value={contraAccountCode}
                    onChange={e => setContraAccountCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    required
                  >
                    {mode === 'deposit' ? (
                      <>
                        <optgroup label="حقوق الملكية والتمويل">
                          <option value="3101">3101 - رأس المال المدفوع (تمويل من المالك)</option>
                          <option value="3102">3102 - جاري المالك / إيداعات الشركاء</option>
                          <option value="3201">3201 - أرباح مبقاة وتوريدات عامة</option>
                        </optgroup>
                        <optgroup label="إيرادات أخرى">
                          <option value="4201">4201 - إيرادات نقدية متنوعة وأخرى</option>
                          <option value="4101">4101 - إيرادات مبيعات كاشير عامة</option>
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <optgroup label="مسحوبات المالك والشركاء">
                          <option value="3102">3102 - مسحوبات شخصية للمالك / جاري الشركاء</option>
                        </optgroup>
                        <optgroup label="مصروفات وتشغيل نثري">
                          <option value="5205">5205 - مصروفات عمومية ونثرية طارئة</option>
                          <option value="1104">1104 - سلف وعُهد نقدية لموظف</option>
                          <option value="5201">5201 - مصروفات رواتب وأجور نقدية</option>
                          <option value="5202">5202 - إيجار المقر والمعرض</option>
                          <option value="5203">5203 - مصروفات صيانة ماكينات وقطع غيار</option>
                        </optgroup>
                      </>
                    )}
                    <optgroup label="كافة الحسابات الأخرى بدليل الحسابات">
                      {accounts
                        .filter(a => !['3101', '3102', '3201', '4201', '4101', '5205', '1104', '5201', '5202', '5203'].includes(a.code))
                        .map(a => (
                          <option key={a.code} value={a.code}>
                            {a.code} - {a.name}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                {/* Party Name */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    {mode === 'deposit' ? 'اسم المودع / الجهة الموردة' : 'اسم المستلم / المستفيد'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="input-party-name"
                      placeholder={mode === 'deposit' ? 'مثال: مالك المنشأة / العميل' : 'مثال: المدير / الموظف المستلم'}
                      value={partyName}
                      onChange={e => setPartyName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  </div>
                </div>
              </div>

              {/* 4. Date and Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">تاريخ الحركة *</label>
                  <DateInput id="input-op-date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">البيان / ملاحظات</label>
                  <input
                    type="text"
                    id="input-op-notes"
                    placeholder={mode === 'deposit' ? 'مثال: تغذية الصندوق لمصروفات الأسبوع' : 'مثال: سحب نقدي نثري'}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* 5. Live Accounting Double-Entry Preview Box */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>معاينة القيد المحاسبي المزدوج التلقائي</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-light font-normal">
                    {mode === 'deposit' ? 'سند قبض رسمي آلي' : 'سند صرف رسمي آلي'}
                  </span>
                </div>

                <div className="space-y-1 text-[11px]">
                  {mode === 'deposit' ? (
                    <>
                      <div className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-md border border-slate-100">
                        <span className="text-slate-700">
                          <strong>من حـ/</strong> {selectedTreasury?.name || 'الخزينة'} (مدين - زيادة نقدية)
                        </span>
                        <span className="font-mono font-bold text-emerald-700">
                          +{numAmount.toLocaleString()} {currencySymbol} {currencyCode !== 'ILS' && `(≈ ${baseEquivalent.toLocaleString()} ₪)`}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-md border border-slate-100">
                        <span className="text-slate-700">
                          <strong>إلى حـ/</strong> {selectedContraAcc?.name || 'الحساب المقابل'} (دائن - تمويل/إيراد)
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {baseEquivalent.toLocaleString()} ₪
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-md border border-slate-100">
                        <span className="text-slate-700">
                          <strong>من حـ/</strong> {selectedContraAcc?.name || 'الحساب المقابل'} (مدين - مسحوبات/مصروف)
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {baseEquivalent.toLocaleString()} ₪
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-md border border-slate-100">
                        <span className="text-slate-700">
                          <strong>إلى حـ/</strong> {selectedTreasury?.name || 'الخزينة'} (دائن - نقص نقدية)
                        </span>
                        <span className="font-mono font-bold text-rose-700">
                          -{numAmount.toLocaleString()} {currencySymbol} {currencyCode !== 'ILS' && `(≈ ${baseEquivalent.toLocaleString()} ₪)`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  id="btn-confirm-treasury-op"
                  disabled={isOverdraft}
                  className={`px-5 py-2 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                    isOverdraft
                      ? 'bg-slate-300 cursor-not-allowed opacity-60'
                      : mode === 'deposit'
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                      : 'bg-amber-600 hover:bg-amber-700 active:scale-95'
                  }`}
                >
                  {mode === 'deposit' ? (
                    <>
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>تأكيد الإيداع وقيد المحاسبة</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="w-4 h-4" />
                      <span>تأكيد السحب وقيد المحاسبة</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
