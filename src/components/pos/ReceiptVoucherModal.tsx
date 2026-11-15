import React, { useState, useEffect, useMemo } from 'react';
import { DateInput } from '../../components/common/DateInput';
import { useAccounting } from '../../context/AccountingContext';
import { Party, PaymentVoucher } from '../../types';
import { X, Receipt, Check, Printer, DollarSign, Calendar, Landmark, User, FileText } from 'lucide-react';
import { posSound } from '../../utils/audio';
import { AutocompleteCombobox } from '../common/AutocompleteCombobox';

interface ReceiptVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultParty?: Party | null;
  defaultSubCustomerName?: string;
  defaultAmount?: number;
  editingVoucher?: PaymentVoucher | null;
}

export const ReceiptVoucherModal: React.FC<ReceiptVoucherModalProps> = ({
  isOpen,
  onClose,
  defaultParty,
  defaultSubCustomerName = '',
  defaultAmount = 0,
  editingVoucher = null
}) => {
  const {
    parties,
    treasuries,
    currencies,
    settings,
    createPaymentVoucher,
    amendReceiptVoucher,
    setSelectedVoucherForPrint
  } = useAccounting();

  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [subCustomerName, setSubCustomerName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [currencyCode, setCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'e_wallet'>('cash');
  const [treasuryCode, setTreasuryCode] = useState<string>('CASH-1101');
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('دفعة سداد حساب من العميل');
  const [transferReference, setTransferReference] = useState<string>('');
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeBank, setChequeBank] = useState<string>('');
  const [chequeDueDate, setChequeDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [createdVoucher, setCreatedVoucher] = useState<PaymentVoucher | null>(null);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');

  // Active currency
  const activeCurrency = useMemo(() => {
    return currencies.find(c => c.code === currencyCode) || currencies.find(c => c.isBase) || {
      code: 'ILS',
      symbol: '₪',
      rateAgainstBase: 1.0
    };
  }, [currencies, currencyCode]);

  // Filter treasuries matching payment method and currency when possible
  const matchingTreasuries = useMemo(() => {
    return treasuries.filter(t => t.status!=='inactive' &&
      (!t.currency || t.currency===currencyCode) &&
      (paymentMethod==='cash'?t.accountCode==='CASH-1101'&&t.type==='cash_box':
       paymentMethod==='e_wallet'?t.type==='digital_wallet':
       paymentMethod==='cheque'?t.type==='bank_account'||t.type==='bank_app':
       t.accountCode!=='CASH-1101'&&t.type!=='cash_box'));
  }, [treasuries, currencyCode,paymentMethod]);

  useEffect(() => {
    if (isOpen) {
      setSaveError('');
      setSaving(false);
      if(editingVoucher){
        setSelectedPartyId(editingVoucher.partyId);
        setSubCustomerName(editingVoucher.subCustomerName||'');
        setAmount(String(editingVoucher.amount));
        setCurrencyCode(editingVoucher.currency||'ILS');
        setPaymentMethod(editingVoucher.paymentMethod==='e_wallet'||editingVoucher.paymentMethod==='electronic'?'e_wallet':
          editingVoucher.paymentMethod==='cheque'?'cheque':
          editingVoucher.treasuryAccountCode==='CASH-1101'?'cash':'bank_transfer');
        setTreasuryCode(editingVoucher.treasuryAccountCode||editingVoucher.accountCode);
        setVoucherDate(editingVoucher.date);
        setDescription(editingVoucher.description||'');
        setTransferReference(editingVoucher.transferReference||'');
        setChequeNumber(editingVoucher.chequeNumber||'');
        setChequeBank(editingVoucher.chequeBank||'');
        setChequeDueDate(editingVoucher.chequeDueDate||editingVoucher.date);
        setCreatedVoucher(null);
        return;
      }
      setPaymentMethod('cash');
      setTreasuryCode('CASH-1101');
      if (defaultParty) {
        setSelectedPartyId(defaultParty.id);
      } else if (parties.length > 0) {
        const firstCust = parties.find(p => p.type === 'customer' || p.type === 'both');
        if (firstCust) setSelectedPartyId(firstCust.id);
      }

      setSubCustomerName(defaultSubCustomerName);
      if (defaultAmount > 0) {
        setAmount(String(defaultAmount));
      } else {
        setAmount('');
      }

      setCurrencyCode(settings.baseCurrencyCode || 'ILS');
      setTransferReference('');
      setChequeNumber('');
      setChequeBank('');
      setChequeDueDate(new Date().toISOString().split('T')[0]);
      setCreatedVoucher(null);
    }
  }, [isOpen, editingVoucher,defaultParty,defaultSubCustomerName,defaultAmount,parties,settings.baseCurrencyCode]);

  // Update default treasury when currency or payment method changes
  useEffect(() => {
    if (!isOpen)return;
    setTreasuryCode(old=>matchingTreasuries.some(t=>t.accountCode===old)?old:
      (matchingTreasuries[0]?.accountCode||''));
  }, [isOpen,matchingTreasuries]);

  if (!isOpen) return null;

  const currentParty = parties.find(p => p.id === selectedPartyId);

  const handleSubmit = async (andPrint = false) => {
    if(saving)return;
    setSaveError('');
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      alert('يرجى إدخال مبلغ سند صحيح');
      return;
    }

    if(!currentParty){setSaveError('اختر العميل المسجل في سند القبض.');return;}
    const selectedTreasury=matchingTreasuries.find(t=>t.accountCode===treasuryCode);
    if(!selectedTreasury){setSaveError('اختر صندوقًا صالحًا لطريقة القبض.');return;}
    const correctMethod:PaymentVoucher['paymentMethod']=treasuryCode==='CASH-1101'?'cash':
      paymentMethod==='cheque'?'cheque':selectedTreasury.type==='digital_wallet'?'e_wallet':'bank_transfer';
    const partyName=currentParty.name;
    const rate = activeCurrency.rateAgainstBase || 1.0;
    const baseAmt = Number((amtNum * rate).toFixed(2));

    const voucherNumber = `RCT-${Date.now().toString().slice(-6)}`;
    const newVoucher: PaymentVoucher = {
      id: `vch-${Date.now()}`,
      voucherNumber,
      type: 'receipt',
      date: voucherDate,
      partyId: selectedPartyId,
      partyName,
      amount: amtNum,
      paymentMethod:correctMethod,
      accountCode: '1201',
      description: description.trim() || 'دفعة سداد حساب من العميل',
      currency: currencyCode,
      currencySymbol: activeCurrency.symbol,
      exchangeRate: rate,
      baseAmount: baseAmt,
      subCustomerName: subCustomerName.trim() || undefined,
      treasuryAccountCode: treasuryCode,
      transferReference: correctMethod === 'bank_transfer' ? transferReference.trim() || undefined : undefined,
      chequeNumber: correctMethod === 'cheque' ? chequeNumber.trim() || undefined : undefined,
      chequeBank: correctMethod === 'cheque' ? chequeBank.trim() || undefined : undefined,
      chequeDueDate: correctMethod === 'cheque' ? chequeDueDate : undefined
    };

    if(editingVoucher){
      setSaving(true);
      const result=await amendReceiptVoucher(editingVoucher.id,editingVoucher,{
        partyId:selectedPartyId,date:voucherDate,description:description.trim(),
        amount:amtNum,currency:currencyCode,exchangeRate:rate,
        paymentMethod:correctMethod,treasuryAccountCode:treasuryCode,
        subCustomerName:subCustomerName.trim(),transferReference:transferReference.trim(),
        chequeNumber:chequeNumber.trim(),chequeBank:chequeBank.trim(),
        chequeDueDate
      });
      setSaving(false);
      if(!result.success){setSaveError(result.message||'تعذر تعديل السند.');return;}
      posSound.playSuccessBeep();
      if(andPrint)setSelectedVoucherForPrint({...newVoucher,id:editingVoucher.id,
        voucherNumber:editingVoucher.voucherNumber});
      onClose();
      return;
    }
    try {createPaymentVoucher(newVoucher);}
    catch(error){setSaveError(error instanceof Error?error.message:'تعذر حفظ السند.');return;}
    posSound.playSuccessBeep();

    if (andPrint) {
      if (setSelectedVoucherForPrint) {
        setSelectedVoucherForPrint(newVoucher);
      }
      onClose();
    } else {
      setCreatedVoucher(newVoucher);
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 text-slate-800 text-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#1f4a7c] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#143254]">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500 text-white rounded-xl shadow-xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{editingVoucher ? ("تعديل سند القبض " + editingVoucher.voucherNumber) : "إضافة سند قبض جديد"}</h3>
              <p className="text-[11px] text-blue-200">استلام وتحصيل نقدية / بنكي وإيداعها في الصندوق</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3.5">
          {/* Party Selection & Sub-Customer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="block font-bold text-slate-700 mb-1">العميل المستلم منه (الحساب الرئيسي):</label>
              <AutocompleteCombobox
                items={parties
                  .filter(p => !p.isSubCustomer && (p.type === 'customer' || p.type === 'both'))
                  .map(p => ({
                    id: p.id,
                    name: p.name,
                    code: p.code,
                    badge: p.balance ? `رصيد: ${p.balance.toFixed(2)}` : undefined
                  }))
                }
                selectedId={selectedPartyId}
                value={currentParty?.name || ''}
                entityType="customer"
                placeholder="ابحث عن العميل..."
                onSelect={(opt) => setSelectedPartyId(opt.id)}
                className="flex-1"
                inputClassName="py-1.5 font-semibold text-xs"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">اسم الزبون الفرعي (اختياري):</label>
              <input
                type="text"
                value={subCustomerName}
                onChange={e => setSubCustomerName(e.target.value)}
                placeholder="اسم فرعي أو رقم هاتف..."
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">المبلغ المقبوض:</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded-lg pr-3 pl-12 py-2 font-mono font-black text-base text-emerald-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <span className="absolute left-3 top-2.5 font-bold text-slate-500 font-mono">
                  {activeCurrency.symbol}
                </span>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">العملة:</label>
              <select
                value={currencyCode}
                onChange={e => setCurrencyCode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 font-bold text-xs"
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment Method & Treasury */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">طريقة القبض:</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-xs"
              >
                <option value="cash">نقداً (في الصندوق)</option>
                <option value="bank_transfer">تحويل بنكي / إيداع</option>
                <option value="e_wallet">محفظة إلكترونية</option>
                <option value="cheque">شيك مصرفي</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                الصندوق / الخزنة المستلمة ({currencyCode}):
              </label>
              <select
                value={treasuryCode}
                onChange={e => setTreasuryCode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-xs"
              >
                {matchingTreasuries.map(t => (
                  <option key={t.id} value={t.accountCode || t.id}>
                    {t.name} ({t.currency || '₪'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bank Transfer Details */}
          {paymentMethod === 'bank_transfer' && (
            <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200">
              <label className="block font-bold text-blue-900 mb-1">رقم الحوالة / المرجع البنكي (اختياري):</label>
              <input
                type="text"
                value={transferReference}
                onChange={e => setTransferReference(e.target.value)}
                placeholder="مثال: REF-983724"
                className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          )}

          {/* Cheque Details */}
          {paymentMethod === 'cheque' && (
            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block font-bold text-amber-900 mb-1">رقم الشيك:</label>
                <input
                  type="text"
                  value={chequeNumber}
                  onChange={e => setChequeNumber(e.target.value)}
                  placeholder="رقم الشيك"
                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-amber-900 mb-1">البنك المسحوب عليه:</label>
                <input
                  type="text"
                  value={chequeBank}
                  onChange={e => setChequeBank(e.target.value)}
                  placeholder="اسم البنك"
                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-amber-900 mb-1">تاريخ الاستحقاق:</label>
                <DateInput value={chequeDueDate} onChange={e => setChequeDueDate(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* Date & Statement Description */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">تاريخ السند:</label>
              <DateInput value={voucherDate} onChange={e => setVoucherDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">البيان والشرح:</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="سداد حساب أو دفعة..."
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          {saveError && <div role="alert" className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-rose-700 font-semibold">{saveError}</div>}
          {/* Created Alert */}
          {createdVoucher && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-2.5 rounded-xl font-bold text-center flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>تم إصدار وحفظ سند القبض رقم #{createdVoucher.voucherNumber} بنجاح!</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{editingVoucher ? 'حفظ التعديل والطباعة' : 'حفظ وطباعة السند'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'جارٍ الحفظ...' : editingVoucher ? 'حفظ التعديل' : 'حفظ السند'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
