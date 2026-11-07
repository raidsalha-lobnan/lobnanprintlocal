import React, { useState, useEffect } from 'react';
import { DateInput } from '../../components/common/DateInput';
import { useAccounting } from '../../context/AccountingContext';
import { Party } from '../../types';
import { generateSequentialPartyCode } from '../../utils/partyUtils';
import { Building2, X, Lock, Phone, Mail, MapPin, User, FileText, DollarSign, Check, AlertCircle } from 'lucide-react';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierToEdit?: Party | null;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({
  isOpen,
  onClose,
  supplierToEdit
}) => {
  const { parties, addParty, updateParty, settings } = useAccounting();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [openingBalanceType, setOpeningBalanceType] = useState<'credit' | 'debit'>('credit');
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Auto-calculated sequential code (non-repeating)
  const [generatedCode, setGeneratedCode] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (supplierToEdit) {
        setName(supplierToEdit.name);
        setPhone(supplierToEdit.phone || '');
        setEmail(supplierToEdit.email || '');
        setContactPerson(supplierToEdit.contactPerson || '');
        setTaxNumber(supplierToEdit.taxNumber || '');
        setCommercialRegister(supplierToEdit.commercialRegister || '');
        setCity(supplierToEdit.city || '');
        setAddress(supplierToEdit.address || '');
        const manualOpBal = supplierToEdit.openingBalance !== undefined ? supplierToEdit.openingBalance : 0;
        setOpeningBalance(manualOpBal);
        setOpeningBalanceType(supplierToEdit.openingBalanceType || 'credit');
        setOpeningBalanceDate(supplierToEdit.openingBalanceDate || new Date().toISOString().split('T')[0]);
        setNotes(supplierToEdit.notes || '');
        setGeneratedCode(supplierToEdit.code || '');
      } else {
        setName('');
        setPhone('');
        setEmail('');
        setContactPerson('');
        setTaxNumber('');
        setCommercialRegister('');
        setCity('');
        setAddress('');
        setOpeningBalance(0);
        setOpeningBalanceType('credit'); // default for suppliers: they are credited (we owe them)
        setOpeningBalanceDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setGeneratedCode('تلقائي بعد الحفظ');
      }
    }
  }, [isOpen, supplierToEdit, parties]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (supplierToEdit) {
      updateParty(supplierToEdit.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        contactPerson: contactPerson.trim(),
        taxNumber: taxNumber.trim(),
        commercialRegister: commercialRegister.trim(),
        city: city.trim(),
        address: address.trim(),
        openingBalance: Number(openingBalance) || 0,
        openingBalanceType,
        openingBalanceDate,
        notes: notes.trim()
      });
    } else {
      addParty({
        type: 'supplier',
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        contactPerson: contactPerson.trim(),
        taxNumber: taxNumber.trim(),
        commercialRegister: commercialRegister.trim(),
        city: city.trim(),
        address: address.trim(),
        openingBalance: Number(openingBalance) || 0,
        openingBalanceType,
        openingBalanceDate,
        notes: notes.trim()
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto my-auto text-right font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                {supplierToEdit ? 'تعديل بيانات المورد' : 'إضافة مورد جديد للنظام'}
              </h3>
              <p className="text-[10px] text-slate-400 font-light">
                {supplierToEdit ? 'تحديث السجلات والمعلومات المالية للمورد' : 'تسجيل مورد خامات ومستلزمات مع إصدار رقم تسلسلي فريد'}
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
          {/* Sequential Supplier Code Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-xs font-bold text-slate-700 block">
                  رقم المورد التسلسلي الآلي (غير قابل للتكرار):
                </span>
                <span className="text-[9px] text-slate-400 font-light">
                  كود نظامي موحد يصدر تلقائياً للموردين لربط العمليات والفواتير
                </span>
              </div>
            </div>

            <div className="font-mono text-sm font-black bg-white border border-blue-200 text-blue-800 px-3 py-1 rounded-md shadow-2xs">
              {generatedCode}
            </div>
          </div>

          {/* Supplier Basic Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">
                اسم المورد / الشركة <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: شركة القدس لتجارة الورق والكرتون"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">الشخص المسؤول / جهة الاتصال:</label>
              <div className="relative">
                <input
                  type="text"
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  placeholder="اسم المندوب أو المدير"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 pr-8 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
                <User className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">رقم الهاتف / الجوال:</label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="059xxxxxxx"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 pr-8 text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 text-left"
                />
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">الرقم الضريبي:</label>
              <input
                type="text"
                value={taxNumber}
                onChange={e => setTaxNumber(e.target.value)}
                placeholder="الرقم الضريبي للمورد إن وجد"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">السجل التجاري:</label>
              <input
                type="text"
                value={commercialRegister}
                onChange={e => setCommercialRegister(e.target.value)}
                placeholder="رقم السجل التجاري"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">البريد الإلكتروني:</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="supplier@domain.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 pr-8 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 text-left"
                />
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">المدينة / المنطقة:</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="مثال: الخليل / رام الله / غزة"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-medium mb-1">العنوان التفصيلي وموقع المستودع:</label>
              <div className="relative">
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="الشارع، المجمع، موقع المستودع"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 pr-8 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Opening Balance Financial Section */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-3 text-xs space-y-2.5">
            <div className="flex items-center gap-1.5 text-amber-900 font-bold">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span>الرصيد الافتتاحي السابق للمورد (عند بدء الاستخدام):</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">قيمة الرصيد السابق:</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance || ''}
                    onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 pr-2 pl-8"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[11px]">
                    {settings.currency || '₪'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">طبيعة الرصيد:</label>
                <select
                  value={openingBalanceType}
                  onChange={e => setOpeningBalanceType(e.target.value as 'credit' | 'debit')}
                  className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs font-bold focus:ring-1 focus:ring-amber-500"
                >
                  <option value="credit">دائن للمورد (مستحق له علينا)</option>
                  <option value="debit">مدين (سلفة سابقة لنا على المورد)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">تاريخ الرصيد السابق:</label>
                <DateInput value={openingBalanceDate} onChange={e => setOpeningBalanceDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs font-mono focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-amber-800">
              * في حال كان للمورد مستحقات سابقة قبل إدخال الفواتير، حدد "دائن للمورد" وسيظهر في كشف الحساب كالتزام يبدأ به الحساب.
            </p>
          </div>

          {/* Notes */}
          <div className="text-xs">
            <label className="block text-slate-700 font-medium mb-1">ملاحظات وشروط التعامل:</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="شروط التوريد، مدة السداد، فترات التسليم، أصناف الخامات المتخصصة..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

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
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{supplierToEdit ? 'حفظ التعديلات' : 'تسجيل المورد'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
