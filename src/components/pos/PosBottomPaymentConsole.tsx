import React from 'react';
import {
  Coins,
  CreditCard,
  Banknote,
  FileText,
  Landmark,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Percent,
  Tag
} from 'lucide-react';
import { PaymentMethod, Currency, TreasuryAccount } from '../../types';

export interface PosBottomPaymentConsoleProps {
  // 1. Invoice Currency & Exchange Rate (عملة الفاتورة وسعر الصرف)
  currencies: Currency[];
  invoiceCurrencyCode?: string;
  onSelectInvoiceCurrency?: (code: string) => void;
  invoiceExchangeRate?: number;
  onChangeInvoiceExchangeRate?: (rate: number) => void;
  activeInvoiceCurrency?: Currency;

  // 2. Cash Payment (الدفع النقدي: المبلغ، العملة، سعر الصرف، الصندوق)
  cashAmount: string;
  onChangeCashAmount: (val: string) => void;
  cashCurrencyCode: string;
  onChangeCashCurrency: (code: string) => void;
  cashExchangeRate: number;
  onChangeCashExchangeRate: (rate: number) => void;
  cashTreasuryCode: string;
  onChangeCashTreasury: (code: string) => void;

  // 3. Bank Payment (الدفع البنكي: المبلغ، عملة الدفع، سعر الصرف، الصندوق)
  bankAmount: string;
  onChangeBankAmount: (val: string) => void;
  bankCurrencyCode: string;
  onChangeBankCurrency: (code: string) => void;
  bankExchangeRate: number;
  onChangeBankExchangeRate: (rate: number) => void;
  bankTreasuryCode: string;
  onChangeBankTreasury: (code: string) => void;

  // Treasuries List
  treasuries: TreasuryAccount[];

  // 4. Notes Line (سطر ملاحظة إيصال السداد / سند القبض)
  paymentNotes?: string;
  onChangePaymentNotes?: (notes: string) => void;
  invoiceNotes?: string;
  onChangeInvoiceNotes?: (notes: string) => void;

  // 5. Overall Discount
  overallDiscount?: number;
  onChangeOverallDiscount?: (val: number) => void;
  discountType?: 'amount' | 'percent';
  onChangeDiscountType?: (type: 'amount' | 'percent') => void;

  // Financial Totals & Action Helpers
  calculatedTotalAmount: number; // in base currency (ILS ₪)
  onQuickFullCash?: () => void;
  onQuickFullBank?: () => void;
  onQuickCredit?: () => void;

  // Base Currency Symbol
  baseCurrencySymbol?: string;

  // Layout customization
  isEditMode?: boolean;
  onToggleVisibility?: () => void;

  // Backward-compatibility props (optional)
  paymentMethod?: PaymentMethod;
  onSelectPaymentMethod?: (method: PaymentMethod) => void;
  selectedTreasuryCode?: string;
  onSelectTreasury?: (code: string) => void;
  selectedCurrencyCode?: string;
  onSelectCurrency?: (code: string) => void;
  customExchangeRate?: number;
  onExchangeRateChange?: (rate: number) => void;
  paidAmountInput?: string;
  onPaidAmountIlsChange?: (val: string) => void;
  paidAmountForeignInput?: string;
  onPaidAmountForeignChange?: (val: string) => void;
  onPayFullAmount?: () => void;
  changeDueAmount?: number;
  onChangeNotes?: (notes: string) => void;
}

export const PosBottomPaymentConsole: React.FC<PosBottomPaymentConsoleProps> = ({
  // 1. Invoice Currency & Exchange Rate
  currencies,
  invoiceCurrencyCode,
  onSelectInvoiceCurrency,
  invoiceExchangeRate,
  onChangeInvoiceExchangeRate,
  activeInvoiceCurrency,

  // 2. Cash Payment
  cashAmount,
  onChangeCashAmount,
  cashCurrencyCode,
  onChangeCashCurrency,
  cashExchangeRate,
  onChangeCashExchangeRate,
  cashTreasuryCode,
  onChangeCashTreasury,

  // 3. Bank Payment
  bankAmount,
  onChangeBankAmount,
  bankCurrencyCode,
  onChangeBankCurrency,
  bankExchangeRate,
  onChangeBankExchangeRate,
  bankTreasuryCode,
  onChangeBankTreasury,

  // Treasuries List
  treasuries,

  // 4. Notes
  paymentNotes,
  onChangePaymentNotes,
  invoiceNotes,
  onChangeInvoiceNotes,

  // 5. Discount
  overallDiscount = 0,
  onChangeOverallDiscount,
  discountType = 'amount',
  onChangeDiscountType,

  // Financial Totals & Actions
  calculatedTotalAmount,
  onQuickFullCash,
  onQuickFullBank,
  onQuickCredit,
  baseCurrencySymbol = '₪',

  // Customization
  isEditMode = false,
  onToggleVisibility,

  // Backward compatibility fallback props
  selectedCurrencyCode,
  onSelectCurrency,
  customExchangeRate,
  onExchangeRateChange,
  onChangeNotes
}) => {
  // Fallback default treasuries if none supplied
  const defaultTreasuriesList: TreasuryAccount[] = React.useMemo(() => [
    { id: 'tr-1101', accountCode: '1101', name: 'الصندوق النقدي الرئيسي (الكاشير)', type: 'cash_box', balance: 0, currency: 'ILS', isDefault: true },
    { id: 'tr-1102', accountCode: '1102', name: 'حساب البنك الأهلي / بطاقات Visa', type: 'bank_account', balance: 0, currency: 'ILS', isDefault: false }
  ], []);

  const effectiveTreasuries = React.useMemo(() => {
    return (treasuries && treasuries.length > 0) ? treasuries : defaultTreasuriesList;
  }, [treasuries, defaultTreasuriesList]);

  const cashTreasuryOptions = React.useMemo(() => {
    const cashList = effectiveTreasuries.filter(t => t.type === 'cash_box' || t.isDefault);
    const otherList = effectiveTreasuries.filter(t => !(t.type === 'cash_box' || t.isDefault));
    return [...cashList, ...otherList];
  }, [effectiveTreasuries]);

  const bankTreasuryOptions = React.useMemo(() => {
    const bankList = effectiveTreasuries.filter(t => t.type !== 'cash_box');
    const cashList = effectiveTreasuries.filter(t => t.type === 'cash_box');
    return [...bankList, ...cashList];
  }, [effectiveTreasuries]);

  const selectedCashTreasuryObj = React.useMemo(() => {
    return cashTreasuryOptions.find(t => t.id === cashTreasuryCode || t.accountCode === cashTreasuryCode) || cashTreasuryOptions[0];
  }, [cashTreasuryOptions, cashTreasuryCode]);

  const selectedBankTreasuryObj = React.useMemo(() => {
    return bankTreasuryOptions.find(t => t.id === bankTreasuryCode || t.accountCode === bankTreasuryCode) || bankTreasuryOptions[0];
  }, [bankTreasuryOptions, bankTreasuryCode]);

  // Resolve effective currency and exchange rate (Default ILS and 1.0)
  const currentInvCurrencyCode = invoiceCurrencyCode || selectedCurrencyCode || 'ILS';
  const currentInvRate = invoiceExchangeRate ?? customExchangeRate ?? 1.0;
  const currentActiveCurrency =
    activeInvoiceCurrency ||
    currencies.find(c => c.code === currentInvCurrencyCode) || {
      code: 'ILS',
      name: 'شيكل',
      symbol: '₪',
      rateAgainstBase: 1.0,
      isBase: true,
      isActive: true
    };

  const handleCurrencySelect = (code: string) => {
    if (onSelectInvoiceCurrency) {
      onSelectInvoiceCurrency(code);
    } else if (onSelectCurrency) {
      onSelectCurrency(code);
    }
  };

  const handleExchangeRateChange = (rate: number) => {
    if (onChangeInvoiceExchangeRate) {
      onChangeInvoiceExchangeRate(rate);
    } else if (onExchangeRateChange) {
      onExchangeRateChange(rate);
    }
  };

  const handleNotesChange = (val: string) => {
    if (onChangeInvoiceNotes) {
      onChangeInvoiceNotes(val);
    } else if (onChangeNotes) {
      onChangeNotes(val);
    }
  };

  // Calculations in Base Currency (ILS)
  const numCashAmount = parseFloat(cashAmount) || 0;
  const numCashRate = cashExchangeRate > 0 ? cashExchangeRate : 1.0;
  const cashPaidBase = Number((numCashAmount * numCashRate).toFixed(2));

  const numBankAmount = parseFloat(bankAmount) || 0;
  const numBankRate = bankExchangeRate > 0 ? bankExchangeRate : 1.0;
  const bankPaidBase = Number((numBankAmount * numBankRate).toFixed(2));

  const totalPaidBase = Number((cashPaidBase + bankPaidBase).toFixed(2));
  const changeDueBase = Math.max(0, Number((totalPaidBase - calculatedTotalAmount).toFixed(2)));
  const remainingDueBase = Math.max(0, Number((calculatedTotalAmount - totalPaidBase).toFixed(2)));

  // Equivalent Total in Invoice Currency if not ILS
  const totalInInvoiceCurrency =
    currentInvRate > 0 ? Number((calculatedTotalAmount / currentInvRate).toFixed(2)) : calculatedTotalAmount;

  // زر كامل: يضع قيمة المتبقي مع الاحتفاظ بالمدفوعات الأخرى
  const handleInternalFullCash = () => {
    if (onQuickFullCash) {
      onQuickFullCash();
      return;
    }
    const currentBankPaid = (parseFloat(bankAmount) || 0) * (bankExchangeRate > 0 ? bankExchangeRate : 1.0);
    const remainingBase = Math.max(0, Number((calculatedTotalAmount - currentBankPaid).toFixed(2)));
    const cRate = cashExchangeRate > 0 ? cashExchangeRate : 1.0;
    const reqCash = Number((remainingBase / cRate).toFixed(2));
    onChangeCashAmount(String(reqCash));
  };

  const handleInternalFullBank = () => {
    if (onQuickFullBank) {
      onQuickFullBank();
      return;
    }
    const currentCashPaid = (parseFloat(cashAmount) || 0) * (cashExchangeRate > 0 ? cashExchangeRate : 1.0);
    const remainingBase = Math.max(0, Number((calculatedTotalAmount - currentCashPaid).toFixed(2)));
    const bRate = bankExchangeRate > 0 ? bankExchangeRate : 1.0;
    const reqBank = Number((remainingBase / bRate).toFixed(2));
    onChangeBankAmount(String(reqBank));
  };

  return (
    <div
      className={`relative bg-[#122b49] p-1 rounded-lg  shadow-md flex flex-col gap-1.5 text-xs text-white ${
        isEditMode ? 'ring-2 ring-amber-400 bg-[#122b49]/95' : ''
      }`}
    >
      {/* Live Customization Badge & Hide Button */}
      {isEditMode && (
        <div className="absolute -top-3 left-3 flex items-center gap-1 z-10">
          <span className="bg-amber-400 text-amber-950 font-black text-[10px] px-2 py-0.5 rounded-md shadow-sm">
            لوحة العملات والصناديق والدفع
          </span>
          {onToggleVisibility && (
            <button
              type="button"
              onClick={onToggleVisibility}
              className="bg-rose-600 hover:bg-rose-500 text-white p-1 rounded-md text-[10px] flex items-center gap-0.5 cursor-pointer shadow-sm"
              title="إخفاء لوحة الدفع من الشاشة"
            >
              <EyeOff className="w-3 h-3" />
              <span>إخفاء</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. السطر الأول: الخصم + عملة الفاتورة وسعر الصرف + سطر الملاحظات */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* الخصم */}
          <div className="flex items-center gap-1 bg-[#122b49] px-2 py-0.5 rounded ">
            <Tag className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="text-[11px] text-rose-200 font-bold">خصم:</span>
            <div className="flex items-center">
              <input
                type="number"
                step="0.01"
                min="0"
                value={overallDiscount === 0 ? '' : overallDiscount}
                onChange={e => {
                  if (onChangeOverallDiscount) {
                    onChangeOverallDiscount(parseFloat(e.target.value) || 0);
                  }
                }}
                placeholder="0.00"
                className="w-16 bg-white text-slate-900 font-mono font-bold px-1.5 py-0.5 rounded-r text-xs text-center border-y border-r border-rose-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-400 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (onChangeDiscountType) {
                    onChangeDiscountType(discountType === 'percent' ? 'amount' : 'percent');
                  }
                }}
                className={`px-2 py-0.5 rounded-l text-xs font-bold border-y border-l border-rose-300 transition-colors ${
                  discountType === 'percent' 
                    ? 'bg-rose-500 text-white' 
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                }`}
                title={discountType === 'percent' ? 'الخصم بنسبة مئوية (%)' : 'الخصم بمبلغ ثابت'}
              >
                <Percent className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* شارة عملة الفاتورة */}
          <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md  font-bold">
            <Coins className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="text-[11px]">عملة الفاتورة:</span>
          </div>

          {/* اختيار عملة الفاتورة (التلقائي شيكل) */}
          <div className="flex items-center gap-1">
            <select
              value={currentInvCurrencyCode}
              onChange={e => handleCurrencySelect(e.target.value)}
              className="bg-white text-slate-900 font-bold px-2 py-0.5 rounded text-xs border border-slate-300 cursor-pointer shadow-2xs focus:ring-1 focus:ring-amber-400"
            >
              {currencies.map(c => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* سعر الصرف (التلقائي 1 للشيكل) */}
          <div className="flex items-center gap-1 bg-amber-400/10 px-2 py-0.5 rounded ">
            <span className="text-[11px] text-amber-200 font-bold">سعر الصرف:</span>
            <input
              type="number"
              step="0.001"
              min="0.001"
              disabled={currentInvCurrencyCode === 'ILS'}
              value={currentInvCurrencyCode === 'ILS' ? 1 : currentInvRate}
              onChange={e => handleExchangeRateChange(parseFloat(e.target.value) || 1.0)}
              className={`w-16 bg-white text-slate-900 font-mono font-bold px-1.5 py-0.5 rounded text-xs text-center border ${
                currentInvCurrencyCode === 'ILS'
                  ? 'opacity-70 cursor-not-allowed border-slate-300'
                  : 'border-amber-400 focus:border-amber-600 focus:ring-1 focus:ring-amber-300'
              }`}
              title={
                currentInvCurrencyCode === 'ILS'
                  ? 'الشيكل هو العملة الأساسية للنظام (سعر الصرف 1 دائماً)'
                  : `سعر صرف 1 ${currentActiveCurrency.symbol} مقابل الشيكل`
              }
            />
            <span className="text-xs text-amber-300 font-bold">{baseCurrencySymbol}</span>
          </div>

          {/* إجمالي الفاتورة بالعملة المختارة إذا كانت أجنبية */}
          {currentInvCurrencyCode !== 'ILS' && (
            <div className="bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded text-[11px] font-bold border border-amber-400/40 shrink-0">
              المطلوب: {totalInInvoiceCurrency.toFixed(2)} {currentActiveCurrency.symbol}
            </div>
          )}
        </div>

        {/* سطر ملاحظة إيصال السداد / سند القبض (منفصلة تماماً عن ملاحظات الفاتورة العامة بالأعلى) */}
        <div className="flex-1 min-w-[220px] flex items-center gap-1.5 bg-[#0f2845]/80 px-2 py-0.5 rounded-md border border-amber-400/30">
          <div className="flex items-center gap-1 text-amber-300 font-bold shrink-0">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px]">ملاحظة إيصال السداد:</span>
          </div>
          <input
            type="text"
            value={paymentNotes !== undefined ? paymentNotes : (invoiceNotes || '')}
            onChange={e => {
              if (onChangePaymentNotes) onChangePaymentNotes(e.target.value);
              else if (onChangeInvoiceNotes) onChangeInvoiceNotes(e.target.value);
            }}
            placeholder="ملاحظة إيصال السداد / سند القبض (مثال: تم السداد من حساب بنكي باسم محمد أحمد)..."
            className="flex-1 bg-white text-slate-900 placeholder-slate-400 font-medium border border-slate-300 px-2.5 py-0.5 rounded text-xs focus:ring-1 focus:ring-amber-400 focus:outline-hidden"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. السطر المدمج: الدفع النقدي والدفع البنكي في سطر واحد بخانات مصغرة وأنيقة */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 items-center text-xs">
        {/* قسم الدفع النقدي */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-[#0f2845]/80 p-1 rounded-md ">
          {/* شارة نقدي */}
          <div className="flex items-center gap-1 text-emerald-400 font-bold shrink-0">
            <div className="p-0.5 bg-emerald-500/20 rounded">
              <Banknote className="w-3.5 h-3.5" />
            </div>
            <span className="text-[11px]">نقدي:</span>
          </div>

          {/* المبلغ + كامل */}
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              step="0.01"
              min="0"
              value={cashAmount}
              onChange={e => onChangeCashAmount(e.target.value)}
              placeholder="0.00"
              className="w-20 sm:w-24 bg-white text-slate-900 font-mono font-black px-1.5 py-0.5 rounded text-xs text-left border border-slate-300 focus:ring-1 focus:ring-emerald-400"
              title="المبلغ المدفوع نقداً"
            />
            <button
              type="button"
              onClick={handleInternalFullCash}
              className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded shrink-0 cursor-pointer shadow-2xs whitespace-nowrap active:scale-95 transition-all"
              title="وضع قيمة المبلغ المتبقي نقداً مع الاحتفاظ بأي قيمة دفع أخرى موجودة"
            >
              كامل
            </button>
          </div>

          {/* العملة */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={cashCurrencyCode}
              onChange={e => {
                const code = e.target.value;
                onChangeCashCurrency(code);
                const found = currencies.find(c => c.code === code);
                onChangeCashExchangeRate(code === 'ILS' ? 1.0 : found?.rateAgainstBase || 1.0);
              }}
              className="min-w-[84px] sm:min-w-[96px] bg-white text-slate-900 font-black px-1.5 py-0.5 rounded text-xs border border-emerald-400 cursor-pointer shadow-2xs focus:ring-1 focus:ring-emerald-400"
              title="عملة الدفع النقدي"
            >
              {currencies.map(c => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.name ? `${c.name}` : c.code}
                </option>
              ))}
            </select>
          </div>

          {/* سعر الصرف */}
          <div className="flex items-center gap-1 shrink-0" title="سعر الصرف">
            <span className="text-[10px] text-blue-200 font-medium hidden sm:inline">صرف:</span>
            <input
              type="number"
              step="0.001"
              min="0.001"
              disabled={cashCurrencyCode === 'ILS'}
              value={cashCurrencyCode === 'ILS' ? 1 : cashExchangeRate}
              onChange={e => onChangeCashExchangeRate(parseFloat(e.target.value) || 1.0)}
              className={`w-14 bg-white text-slate-900 font-mono font-bold px-1 py-0.5 rounded text-[11px] text-center border ${
                cashCurrencyCode === 'ILS' ? 'opacity-60 cursor-not-allowed border-slate-300' : 'border-emerald-400'
              }`}
              title="سعر صرف العملة النقدية"
            />
          </div>

          {/* الصندوق */}
          <div className="flex-1 min-w-[90px] flex items-center gap-1">
            <select
              value={selectedCashTreasuryObj?.id || cashTreasuryCode}
              onChange={e => {
                const selectedId = e.target.value;
                const found = effectiveTreasuries.find(t => t.id === selectedId || t.accountCode === selectedId);
                onChangeCashTreasury(found ? (found.accountCode || found.id) : selectedId);
              }}
              className="w-full bg-white text-slate-900 font-bold px-1.5 py-0.5 rounded text-[11px] border border-slate-300 cursor-pointer shadow-2xs truncate"
              title="الصندوق أو الخزنة النقدية المستلمة"
            >
              {cashTreasuryOptions.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* قسم الدفع البنكي */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-[#0f2845]/80 p-1 rounded-md ">
          {/* شارة بنكي */}
          <div className="flex items-center gap-1 text-blue-300 font-bold shrink-0">
            <div className="p-0.5 bg-blue-500/20 rounded">
              <Landmark className="w-3.5 h-3.5" />
            </div>
            <span className="text-[11px]">بنكي:</span>
          </div>

          {/* المبلغ + كامل */}
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              step="0.01"
              min="0"
              value={bankAmount}
              onChange={e => onChangeBankAmount(e.target.value)}
              placeholder="0.00"
              className="w-20 sm:w-24 bg-white text-slate-900 font-mono font-black px-1.5 py-0.5 rounded text-xs text-left border border-slate-300 focus:ring-1 focus:ring-blue-400"
              title="المبلغ المدفوع بنكياً / شبكة"
            />
            <button
              type="button"
              onClick={handleInternalFullBank}
              className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded shrink-0 cursor-pointer shadow-2xs whitespace-nowrap active:scale-95 transition-all"
              title="وضع قيمة المبلغ المتبقي بنكياً مع الاحتفاظ بأي قيمة دفع أخرى موجودة"
            >
              كامل
            </button>
          </div>

          {/* عملة الدفع */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={bankCurrencyCode}
              onChange={e => {
                const code = e.target.value;
                onChangeBankCurrency(code);
                const found = currencies.find(c => c.code === code);
                onChangeBankExchangeRate(code === 'ILS' ? 1.0 : found?.rateAgainstBase || 1.0);
              }}
              className="min-w-[84px] sm:min-w-[96px] bg-white text-slate-900 font-black px-1.5 py-0.5 rounded text-xs border border-blue-400 cursor-pointer shadow-2xs focus:ring-1 focus:ring-blue-400"
              title="عملة الدفع البنكي"
            >
              {currencies.map(c => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.name ? `${c.name}` : c.code}
                </option>
              ))}
            </select>
          </div>

          {/* سعر الصرف */}
          <div className="flex items-center gap-1 shrink-0" title="سعر الصرف">
            <span className="text-[10px] text-blue-200 font-medium hidden sm:inline">صرف:</span>
            <input
              type="number"
              step="0.001"
              min="0.001"
              disabled={bankCurrencyCode === 'ILS'}
              value={bankCurrencyCode === 'ILS' ? 1 : bankExchangeRate}
              onChange={e => onChangeBankExchangeRate(parseFloat(e.target.value) || 1.0)}
              className={`w-14 bg-white text-slate-900 font-mono font-bold px-1 py-0.5 rounded text-[11px] text-center border ${
                bankCurrencyCode === 'ILS' ? 'opacity-60 cursor-not-allowed border-slate-300' : 'border-blue-400'
              }`}
              title="سعر صرف العملة البنكية"
            />
          </div>

          {/* الصندوق / الحساب البنكي */}
          <div className="flex-1 min-w-[90px] flex items-center gap-1">
            <select
              value={selectedBankTreasuryObj?.id || bankTreasuryCode}
              onChange={e => {
                const selectedId = e.target.value;
                const found = effectiveTreasuries.find(t => t.id === selectedId || t.accountCode === selectedId);
                onChangeBankTreasury(found ? (found.accountCode || found.id) : selectedId);
              }}
              className="w-full bg-white text-slate-900 font-bold px-1.5 py-0.5 rounded text-[11px] border border-slate-300 cursor-pointer shadow-2xs truncate"
              title="الحساب البنكي أو نقطة البيع / الشبكة"
            >
              {bankTreasuryOptions.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
