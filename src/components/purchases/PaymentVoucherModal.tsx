import React, { useState, useEffect } from 'react';
import { DateInput } from '../../components/common/DateInput';
import { useAccounting } from '../../context/AccountingContext';
import { Party, PaymentVoucher } from '../../types';
import { AutocompleteCombobox } from '../common/AutocompleteCombobox';
import {
  Receipt,
  X,
  Lock,
  DollarSign,
  Calendar,
  Building2,
  CreditCard,
  Landmark,
  FileText,
  Check,
  Printer,
  Coins
} from 'lucide-react';

interface PaymentVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucherToEdit?: PaymentVoucher | null;
  defaultSupplier?: Party | null;
  defaultAmount?: number;
}

export const PaymentVoucherModal: React.FC<PaymentVoucherModalProps> = ({
  isOpen,
  onClose,
  voucherToEdit,
  defaultSupplier,
  defaultAmount
}) => {
  const {
    parties,
    treasuries,
    currencies,
    settings,
    vouchers,
    createPaymentVoucher,
    updatePaymentVoucher,
    setSelectedVoucherForPrint
  } = useAccounting();

  const suppliers = parties.filter(p => p.type === 'supplier' || p.type === 'both');

  const [supplierId, setSupplierId] = useState<string>('');
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [currencyCode, setCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque'>('bank_transfer');
  const [treasuryCode, setTreasuryCode] = useState<string>('1101');
  const [description, setDescription] = useState<string>('');
  
  // Cheque & Transfer specific details
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeBank, setChequeBank] = useState<string>('بنك فلسطين');
  const [chequeDueDate, setChequeDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transferReference, setTransferReference] = useState<string>('');

  const [autoPrint, setAutoPrint] = useState<boolean>(true);

  // Next non-repeating voucher sequence preview
  const [previewVoucherNumber, setPreviewVoucherNumber] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (voucherToEdit) {
        setSupplierId(voucherToEdit.partyId);
        setVoucherDate(voucherToEdit.date);
        setAmount(voucherToEdit.amount);
        setCurrencyCode(voucherToEdit.currency || settings.baseCurrencyCode || 'ILS');
        setExchangeRate(voucherToEdit.exchangeRate || 1.0);
        setPaymentMethod(voucherToEdit.paymentMethod || 'bank_transfer');
        setTreasuryCode(voucherToEdit.treasuryAccountCode || voucherToEdit.accountCode || '1101');
        setDescription(voucherToEdit.description || '');
        setChequeNumber(voucherToEdit.chequeNumber || '');
        setChequeBank(voucherToEdit.chequeBank || 'بنك فلسطين');
        setChequeDueDate(voucherToEdit.chequeDueDate || new Date().toISOString().split('T')[0]);
        setTransferReference(voucherToEdit.transferReference || '');
        setPreviewVoucherNumber(voucherToEdit.voucherNumber);
      } else {
        const initSupp = defaultSupplier || suppliers[0];
        setSupplierId(initSupp?.id || '');
        setVoucherDate(new Date().toISOString().split('T')[0]);
        
        // If defaultAmount given, use it; else if supplier owes, pre-fill that absolute balance
        if (defaultAmount !== undefined) {
          setAmount(defaultAmount);
        } else if (initSupp && initSupp.balance < 0) {
          setAmount(Math.abs(initSupp.balance));
        } else {
          setAmount(0);
        }

        setCurrencyCode(settings.baseCurrencyCode || 'ILS');
        setExchangeRate(1.0);
        setPaymentMethod('bank_transfer');
        setTreasuryCode('1102'); // Default to Bank for suppliers
        setDescription(initSupp ? `سداد دفعة للمورد ${initSupp.name} مقابل فواتير خامات ومستلزمات` : '');
        setChequeNumber('');
        setChequeBank('بنك فلسطين');
        setChequeDueDate(new Date().toISOString().split('T')[0]);
        setTransferReference('');

        // Generate next sequence preview
        setPreviewVoucherNumber('تلقائي عند الحفظ');
      }
    }
  }, [isOpen, voucherToEdit, defaultSupplier, defaultAmount, suppliers, vouchers, settings]);

  if (!isOpen) return null;

  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const supp = suppliers.find(s => s.id === id);
    if (supp) {
      if (amount <= 0 && supp.balance < 0) {
        setAmount(Math.abs(supp.balance));
      }
      if (!description || description.startsWith('سداد دفعة للمورد')) {
        setDescription(`سداد دفعة للمورد ${supp.name} مقابل فواتير خامات ومستلزمات`);
      }
    }
  };

  const handleCurrencyChange = (currCode: string) => {
    setCurrencyCode(currCode);
    const curr = currencies.find(c => c.code === currCode);
    if (curr) {
      setExchangeRate(curr.rateAgainstBase || 1.0);
    } else {
      setExchangeRate(1.0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || amount <= 0) return;

    const supp = suppliers.find(s => s.id === supplierId);
    if (!supp) return;

    const finalAmountBase = Number((amount * exchangeRate).toFixed(2));
    const currSymbol = currencies.find(c => c.code === currencyCode)?.symbol || settings.currency || '₪';

    if (voucherToEdit) {
      updatePaymentVoucher(voucherToEdit.id, {
        date: voucherDate,
        amount: finalAmountBase,
        currency: currencyCode,
        currencySymbol: currSymbol,
        exchangeRate,
        paymentMethod,
        treasuryAccountCode: treasuryCode,
        accountCode: '2101',
        description: description.trim() || `سداد دفعة للمورد ${supp.name}`,
        chequeNumber: paymentMethod === 'cheque' ? chequeNumber : undefined,
        chequeBank: paymentMethod === 'cheque' ? chequeBank : undefined,
        chequeDueDate: paymentMethod === 'cheque' ? chequeDueDate : undefined,
        transferReference: paymentMethod === 'bank_transfer' ? transferReference : undefined
      });
      onClose();
    } else {
      const newVoucherData = {
        date: voucherDate,
        type: 'payment' as const,
        partyId: supp.id,
        partyName: supp.name,
        amount: finalAmountBase,
        currency: currencyCode,
        currencySymbol: currSymbol,
        exchangeRate,
        paymentMethod,
        treasuryAccountCode: treasuryCode,
        accountCode: '2101',
        description: description.trim() || `سداد دفعة للمورد ${supp.name} مقابل توريدات خامات`,
        chequeNumber: paymentMethod === 'cheque' ? chequeNumber : undefined,
        chequeBank: paymentMethod === 'cheque' ? chequeBank : undefined,
        chequeDueDate: paymentMethod === 'cheque' ? chequeDueDate : undefined,
        transferReference: paymentMethod === 'bank_transfer' ? transferReference : undefined
      };

      createPaymentVoucher(newVoucherData);

      if (autoPrint) {
        // Construct printable voucher object for instant preview
        setSelectedVoucherForPrint({
          id: 'vch-temp',
          voucherNumber: previewVoucherNumber,
          ...newVoucherData
        });
      }

      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto my-auto text-right font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                {voucherToEdit ? 'تعديل سند صرف للمورد' : 'تحرير سند صرف جديد للمورد'}
              </h3>
              <p className="text-[10px] text-slate-400 font-light">
                سند صرف نقدية أو بنكي رسمي للمورد مع خيارات السداد المتعددة والطباعة
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Voucher Sequential Serial Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-xs font-bold text-slate-800 block">رقم سند الصرف التسلسلي (غير قابل للتكرار):</span>
                <span className="text-[9px] text-slate-400 font-light">ترميز نظامي خاص بسندات الصرف PAY مع ترقيم تلقائي متسلسل</span>
              </div>
            </div>

            <div className="font-mono text-sm font-black bg-white border border-rose-200 text-rose-800 px-3 py-1 rounded-md shadow-2xs">
              {previewVoucherNumber}
            </div>
          </div>

          {/* Supplier Selection & Balance Indicator */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col">
              <label className="block text-slate-700 font-bold mb-1">
                المورد المستلم <span className="text-rose-500">*</span>
              </label>
              <AutocompleteCombobox
                items={suppliers.map(s => ({
                  id: s.id,
                  name: s.name,
                  code: s.code,
                  badge: s.balance ? `رصيد: ${Math.abs(s.balance).toFixed(2)}` : undefined
                }))}
                selectedId={supplierId}
                value={selectedSupplier?.name || ''}
                entityType="supplier"
                placeholder="ابحث عن المورد..."
                onSelect={(opt) => handleSupplierChange(opt.id)}
                disabled={Boolean(voucherToEdit)}
                required={true}
                className="flex-1"
                inputClassName="p-2 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">تاريخ تحرير السند:</label>
              <div className="relative">
                <DateInput required value={voucherDate} onChange={e => setVoucherDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono focus:bg-white focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
          </div>

          {/* Live Balance Notice for Selected Supplier */}
          {selectedSupplier && (
            <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
              selectedSupplier.balance < 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : selectedSupplier.balance > 0
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-600" />
                <span>
                  كود المورد: <strong className="font-mono">{selectedSupplier.code}</strong> | هاتف: <span className="font-mono">{selectedSupplier.phone || '-'}</span>
                </span>
              </div>

              <div className="font-bold">
                {selectedSupplier.balance < 0 ? (
                  <span>مستحق للمورد حالياً: <span className="font-mono text-sm text-rose-700">{Math.abs(selectedSupplier.balance).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}</span></span>
                ) : selectedSupplier.balance > 0 ? (
                  <span>رصيد دائن لنا: <span className="font-mono text-sm text-blue-700">{selectedSupplier.balance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}</span></span>
                ) : (
                  <span className="text-emerald-700">الحساب متسوي خالص (0.00 {settings.currency})</span>
                )}
              </div>
            </div>
          )}

          {/* Amount & Multi-Currency */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-900 font-bold">
              <DollarSign className="w-4 h-4 text-rose-600" />
              <span>مبلغ سند الصرف والعملة:</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  المبلغ المنصرف <span className="text-rose-500">*</span>:
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={amount || ''}
                    onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded-md p-2 text-sm font-mono font-black focus:ring-2 focus:ring-rose-500 pr-2 pl-8"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">العملة:</label>
                <select
                  value={currencyCode}
                  onChange={e => handleCurrencyChange(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md p-2 text-xs font-bold focus:ring-2 focus:ring-rose-500"
                >
                  {currencies.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">سعر الصرف مقابل الشيكل:</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-white border border-slate-300 rounded-md p-2 text-xs font-mono font-bold focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {currencyCode !== (settings.baseCurrencyCode || 'ILS') && (
              <div className="text-[11px] text-blue-700 bg-blue-50/70 p-1.5 rounded border border-blue-100 font-medium">
                المبلغ المعادل بالشيكل الأساسي: <strong className="font-mono">{(amount * exchangeRate).toFixed(2)} {settings.currency}</strong>
              </div>
            )}
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-2 text-xs">
            <label className="block text-slate-700 font-bold mb-1">طريقة الصرف والدفع للمورد:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('cash');
                  const cashTr = treasuries.find(t => t.type === 'cash_box') || treasuries[0];
                  setTreasuryCode(cashTr ? (cashTr.accountCode || cashTr.id) : '1101');
                }}
                className={`p-2.5 rounded-lg border text-center font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>نقداً من الصندوق</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('bank_transfer');
                  const bankTr = treasuries.find(t => t.type === 'bank_account' || t.type === 'bank_app' || t.accountCode === '1107' || t.accountCode === '1103') || treasuries.find(t => t.type !== 'cash_box') || treasuries[0];
                  setTreasuryCode(bankTr ? (bankTr.accountCode || bankTr.id) : '1102');
                }}
                className={`p-2.5 rounded-lg border text-center font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  paymentMethod === 'bank_transfer'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Landmark className="w-4 h-4 text-blue-600" />
                <span>تحويل بنكي / إيداع</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('cheque');
                  const bankTr = treasuries.find(t => t.type === 'bank_account' || t.type === 'bank_app' || t.accountCode === '1107' || t.accountCode === '1103') || treasuries.find(t => t.type !== 'cash_box') || treasuries[0];
                  setTreasuryCode(bankTr ? (bankTr.accountCode || bankTr.id) : '1102');
                }}
                className={`p-2.5 rounded-lg border text-center font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  paymentMethod === 'cheque'
                    ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 text-amber-600" />
                <span>شيك بنكي مؤجل/حالي</span>
              </button>
            </div>
          </div>

          {/* Treasury Account Selection */}
          <div className="text-xs">
            <label className="block text-slate-700 font-medium mb-1">الخزينة أو الحساب البنكي المسحوب منه:</label>
            <select
              value={treasuryCode}
              onChange={e => setTreasuryCode(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-rose-500"
            >
              {treasuries.map(t => (
                <option key={t.id} value={t.accountCode || t.id}>
                  {t.name} ({t.type === 'cash' || t.type === 'cash_box' ? 'صندوق نقدي' : 'حساب بنكي / تطبيق'}) - رصيد: {t.balance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                </option>
              ))}
            </select>
          </div>

          {/* Specific Cheque Fields */}
          {paymentMethod === 'cheque' && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3 text-xs space-y-2.5">
              <span className="font-bold text-amber-900 block">بيانات الشيك الصادر للمورد:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">رقم الشيك:</label>
                  <input
                    type="text"
                    required
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                    placeholder="مثال: 001248"
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">البنك المسحوب عليه:</label>
                  <input
                    type="text"
                    value={chequeBank}
                    onChange={e => setChequeBank(e.target.value)}
                    placeholder="بنك فلسطين / البنك العربي"
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">تاريخ استحقاق الشيك:</label>
                  <DateInput required value={chequeDueDate} onChange={e => setChequeDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Specific Bank Transfer Field */}
          {paymentMethod === 'bank_transfer' && (
            <div className="text-xs">
              <label className="block text-slate-700 font-medium mb-1">رقم الحوالة / المرجع البنكي (اختياري للتوثيق):</label>
              <input
                type="text"
                value={transferReference}
                onChange={e => setTransferReference(e.target.value)}
                placeholder="رقم العملية البنكية أو رقم التحويل"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
              />
            </div>
          )}

          {/* Description / Notes */}
          <div className="text-xs">
            <label className="block text-slate-700 font-medium mb-1">البيان والشرح المحاسبي للسند:</label>
            <textarea
              rows={2}
              required
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="وذلك عن سداد فواتير خامات أوراق / حبر، دفعة تحت الحساب..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Auto-print option */}
          {!voucherToEdit && (
            <div className="flex items-center gap-2 pt-1 text-xs">
              <input
                type="checkbox"
                id="autoPrint"
                checked={autoPrint}
                onChange={e => setAutoPrint(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
              />
              <label htmlFor="autoPrint" className="text-slate-700 font-medium cursor-pointer flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>فتح شاشة المعاينة والطباعة مباشرة بمجرد حفظ السند</span>
              </label>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{voucherToEdit ? 'حفظ تعديلات السند' : 'حفظ وإصدار سند الصرف'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
