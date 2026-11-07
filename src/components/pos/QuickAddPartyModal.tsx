import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Phone,
  MapPin,
  Building,
  CreditCard,
  Wallet,
  FileText,
  Check,
  Briefcase,
  AlertCircle,
  Users
} from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';
import { Party } from '../../types';

interface QuickAddPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'customer' | 'supplier' | 'employee';
  partyToEdit?: Party | null;
  onSuccess: (party: { id: string; name: string; code: string }) => void;
}

export const QuickAddPartyModal: React.FC<QuickAddPartyModalProps> = ({
  isOpen,
  onClose,
  initialType = 'customer',
  partyToEdit = null,
  onSuccess
}) => {
  const { parties, addParty, updateParty, addEmployee } = useAccounting();

  const [targetType, setTargetType] = useState<'customer' | 'supplier' | 'employee'>(initialType);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(5000);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [openingBalanceType, setOpeningBalanceType] = useState<'debit' | 'credit'>('debit');
  const [notes, setNotes] = useState('');

  // Employee specific fields
  const [jobTitle, setJobTitle] = useState('موظف مبيعات');
  const [department, setDepartment] = useState('المبيعات والكاشير');
  const [salaryAmount, setSalaryAmount] = useState<number>(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (partyToEdit) {
        setTargetType((partyToEdit.type as any) || initialType);
        setName(partyToEdit.name || '');
        setPhone(partyToEdit.phone || '');
        setCity(partyToEdit.city || '');
        setAddress(partyToEdit.address || '');
        setContactPerson(partyToEdit.contactPerson || '');
        setTaxNumber(partyToEdit.taxNumber || '');
        setCommercialRegister(partyToEdit.commercialRegister || '');
        setCreditLimit(partyToEdit.creditLimit !== undefined ? partyToEdit.creditLimit : 5000);
        setOpeningBalance(partyToEdit.openingBalance || 0);
        setOpeningBalanceType(partyToEdit.openingBalanceType || (partyToEdit.type === 'supplier' ? 'credit' : 'debit'));
        setNotes(partyToEdit.notes || '');
        setErrorMessage(null);
      } else {
        setTargetType(initialType);
        setName('');
        setPhone('');
        setCity('');
        setAddress('');
        setContactPerson('');
        setTaxNumber('');
        setCommercialRegister('');
        setCreditLimit(5000);
        setOpeningBalance(0);
        setOpeningBalanceType(initialType === 'supplier' ? 'credit' : 'debit');
        setNotes('');
        setJobTitle('موظف مبيعات');
        setDepartment('المبيعات والكاشير');
        setSalaryAmount(0);
        setErrorMessage(null);
      }
    }
  }, [isOpen, initialType, partyToEdit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('يرجى إدخال اسم العميل / الطرف');
      return;
    }

    // Check duplicate warnings for default generic names
    if (
      trimmedName === 'زبون نقدي' ||
      trimmedName === 'عميل نقدي' ||
      trimmedName === 'عميل كاشير نقدي' ||
      trimmedName === 'زبون عام'
    ) {
      setErrorMessage('لا يمكن تكرار اسم الزبون النقدي العام، يرجى كتابة اسم العميل الحقيقي أو اسم الشركة/المحل');
      return;
    }

    if (partyToEdit) {
      updateParty(partyToEdit.id, {
        name: trimmedName,
        type: targetType as any,
        phone: phone.trim(),
        city: city.trim(),
        address: address.trim(),
        contactPerson: contactPerson.trim(),
        taxNumber: taxNumber.trim(),
        commercialRegister: commercialRegister.trim(),
        creditLimit: Number(creditLimit) || 0,
        notes: notes.trim()
      });
      onSuccess({ id: partyToEdit.id, name: trimmedName, code: partyToEdit.code });
      onClose();
      return;
    }

    // Check if customer already exists with this exact name
    const existingParty = parties.find(
      p => p.name.trim().toLowerCase() === trimmedName.toLowerCase() && !p.isSubCustomer
    );
    if (existingParty && targetType !== 'employee') {
      const confirmUseExisting = window.confirm(
        `يوجد بالفعل ${existingParty.type === 'customer' ? 'عميل' : 'طرف'} مسجل باسم "${existingParty.name}" (كود: ${existingParty.code}).\nهل تريد اختياره مباشرة في الفاتورة؟`
      );
      if (confirmUseExisting) {
        onSuccess({ id: existingParty.id, name: existingParty.name, code: existingParty.code });
        onClose();
        return;
      } else {
        setErrorMessage('يرجى إضافة تمييز لاسم العميل لمنع تكرار نفس الاسم مرتين في قاعدة البيانات');
        return;
      }
    }

    try {
      if (targetType === 'customer' || targetType === 'supplier') {
        const created = addParty({
          name: trimmedName,
          type: targetType,
          phone: phone.trim() || undefined,
          city: city.trim() || undefined,
          address: address.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
          taxNumber: taxNumber.trim() || undefined,
          commercialRegister: commercialRegister.trim() || undefined,
          creditLimit: Number(creditLimit) || 0,
          openingBalance: Number(openingBalance) || 0,
          openingBalanceType: openingBalanceType,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          notes: notes.trim() || undefined
        });

        onSuccess({ id: created.id, name: created.name, code: created.code });
        onClose();
      } else if (targetType === 'employee') {
        const createdEmp = addEmployee({
          name: trimmedName,
          jobTitle: jobTitle.trim() || 'موظف',
          department: department.trim() || 'عام',
          phone: phone.trim() || '',
          salaryType: 'monthly',
          salaryAmount: Number(salaryAmount) || 0,
          status: 'active',
          hireDate: new Date().toISOString().split('T')[0]
        });

        onSuccess({ id: createdEmp.id, name: createdEmp.name, code: createdEmp.id });
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء إضافة العميل');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between border-b border-emerald-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl text-emerald-300">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {partyToEdit
                  ? `تعديل بيانات ${targetType === 'customer' ? 'العميل' : targetType === 'supplier' ? 'المورد' : 'الموظف'}`
                  : targetType === 'customer'
                  ? 'إضافة عميل جديد للنظام'
                  : targetType === 'supplier'
                  ? 'إضافة مورد جديد للنظام'
                  : 'إضافة موظف جديد للنظام'}
              </h2>
              <p className="text-xs text-emerald-100">
                {partyToEdit ? 'تعديل البيانات التجارية وحفظها سحابياً ومحلياً فوراً' : 'فتح بطاقة عميل جديدة وإدراجها مباشرة في شاشة الكاشير'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl text-emerald-100 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Type Selector Tabs */}
        <div className="bg-slate-100 p-2 flex items-center gap-1.5 border-b border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTargetType('customer')}
            className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              targetType === 'customer'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>عميل (زبون)</span>
          </button>

          <button
            type="button"
            onClick={() => setTargetType('supplier')}
            className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              targetType === 'supplier'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>مورد</span>
          </button>

          <button
            type="button"
            onClick={() => setTargetType('employee')}
            className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              targetType === 'employee'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>موظف</span>
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-2.5 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-bold">{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
          {/* Name Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {targetType === 'customer'
                ? 'اسم العميل / المؤسسة'
                : targetType === 'supplier'
                ? 'اسم المورد / الشركة'
                : 'اسم الموظف'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={
                targetType === 'customer'
                  ? 'أدخل اسم العميل الحقيقي (مثال: شركة النور، أحمد خليل)...'
                  : targetType === 'supplier'
                  ? 'أدخل اسم المورد...'
                  : 'أدخل اسم الموظف...'
              }
              autoFocus
              required
              className="w-full text-xs font-bold border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Phone and City */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>رقم الهاتف / الجوال</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="059xxxxxxx"
                dir="ltr"
                className="w-full text-xs font-mono border border-slate-300 rounded-xl px-3 py-1.5 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>المدينة / المنطقة</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="مثال: غزة، رام الله، نابلس..."
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-1.5 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
              />
            </div>
          </div>

          {/* Address and Contact Person */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الشخص المسؤول / جهة الاتصال
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={e => setContactPerson(e.target.value)}
                placeholder="اسم الشخص المسؤول..."
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-1.5 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                العنوان التفصيلي
              </label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="الشارع، البناية..."
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-1.5 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
              />
            </div>
          </div>

          {targetType !== 'employee' ? (
            <>
              {/* Financial Fields: Opening Balance & Credit Limit */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>البيانات المالية والأرصدة الافتتاحية (اختياري)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      الرصيد الافتتاحي
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={openingBalance || ''}
                        onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full text-xs font-mono font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:border-emerald-500 focus:outline-hidden"
                      />
                      <select
                        value={openingBalanceType}
                        onChange={e => setOpeningBalanceType(e.target.value as 'debit' | 'credit')}
                        className="text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 bg-white shrink-0"
                      >
                        <option value="debit">مدين (لنا عليه)</option>
                        <option value="credit">دائن (له علينا)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-slate-500" />
                      <span>سقف الائتمان (الحد الأقصى للآجل)</span>
                    </label>
                    <input
                      type="number"
                      step="100"
                      min="0"
                      value={creditLimit || ''}
                      onChange={e => setCreditLimit(parseFloat(e.target.value) || 0)}
                      placeholder="5000"
                      className="w-full text-xs font-mono font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      الرقم الضريبي
                    </label>
                    <input
                      type="text"
                      value={taxNumber}
                      onChange={e => setTaxNumber(e.target.value)}
                      placeholder="رقم المشتغل المرخص..."
                      className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-1 bg-white focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      السجل التجاري
                    </label>
                    <input
                      type="text"
                      value={commercialRegister}
                      onChange={e => setCommercialRegister(e.target.value)}
                      placeholder="رقم السجل التجاري..."
                      className="w-full text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-1 bg-white focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>ملاحظات إضافية</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="أي ملاحظات خاصة بهذا العميل أو شروط تسليم ودفع..."
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-hidden transition"
                />
              </div>
            </>
          ) : (
            /* Employee Fields */
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المسمى الوظيفي</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">القسم</label>
                <input
                  type="text"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                />
              </div>
            </div>
          )}

          {/* Submit & Cancel Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-colors active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{partyToEdit ? 'حفظ تعديلات العميل والاعتماد' : 'حفظ وإدراج في الفاتورة فوراً'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
