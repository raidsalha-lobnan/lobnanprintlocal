import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { Party, DebtClearingRecord } from '../types';
import { tafqeet } from '../utils/tafqeet';
import { formatNumber } from '../utils/numberFormat';
import {
  ArrowRightLeft,
  Users,
  Truck,
  Plus,
  Printer,
  Calendar,
  Search,
  Scale,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Building2,
  X
} from 'lucide-react';

export const DebtClearingView: React.FC = () => {
  const {
    parties,
    debtClearings,
    addDebtClearing,
    updateDebtClearing,
    deleteDebtClearing,
    settings,
    currentUser
  } = useAccounting();

  // Filter customers & suppliers
  const customers = useMemo(() => parties.filter(p => p.type === 'customer' || p.type === 'both'), [parties]);
  const suppliers = useMemo(() => parties.filter(p => p.type === 'supplier' || p.type === 'both'), [parties]);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [clearingAmount, setClearingAmount] = useState<number>(0);
  const [clearingDate, setClearingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('مقاصة تسوية ديون ومشتريات ومبيعات متبادلة');
  const [notes, setNotes] = useState<string>('');

  // Delete Confirmation state
  const [recordToDelete, setRecordToDelete] = useState<DebtClearingRecord | null>(null);

  // Print state
  const [selectedClearingForPrint, setSelectedClearingForPrint] = useState<DebtClearingRecord | null>(null);

  // Search in history
  const [searchQuery, setSearchQuery] = useState('');

  // Notification state
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const selectedCustomer = useMemo(() => {
    return parties.find(p => p.id === selectedCustomerId) || null;
  }, [parties, selectedCustomerId]);

  const selectedSupplier = useMemo(() => {
    return parties.find(p => p.id === selectedSupplierId) || null;
  }, [parties, selectedSupplierId]);

  // Calculated suggested max clearing
  const suggestedMaxAmount = useMemo(() => {
    if (!selectedCustomer || !selectedSupplier) return 0;
    const custDebt = selectedCustomer.balance > 0 ? selectedCustomer.balance : 0;
    const suppCredit = selectedSupplier.balance < 0 ? Math.abs(selectedSupplier.balance) : 0;
    return Math.min(custDebt, suppCredit);
  }, [selectedCustomer, selectedSupplier]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingRecordId(null);
    const initialCust = customers[0]?.id || '';
    const initialSupp = suppliers[0]?.id || '';
    setSelectedCustomerId(initialCust);
    setSelectedSupplierId(initialSupp);

    const cust = parties.find(p => p.id === initialCust);
    const supp = parties.find(p => p.id === initialSupp);
    const maxPoss = Math.min(
      cust && cust.balance > 0 ? cust.balance : 0,
      supp && supp.balance < 0 ? Math.abs(supp.balance) : 0
    );
    setClearingAmount(maxPoss > 0 ? maxPoss : 0);
    setClearingDate(new Date().toISOString().split('T')[0]);
    setReason('مقاصة تسوية ديون ومشتريات ومبيعات متبادلة');
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (record: DebtClearingRecord) => {
    setModalMode('edit');
    setEditingRecordId(record.id);
    setSelectedCustomerId(record.customerId);
    setSelectedSupplierId(record.supplierId);
    setClearingAmount(record.amount);
    setClearingDate(record.date);
    setReason(record.reason);
    setNotes(record.notes || '');
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedSupplier) {
      showFeedback('يرجى اختيار العميل والمورد أولاً', 'error');
      return;
    }

    if (clearingAmount <= 0) {
      showFeedback('يرجى إدخال مبلغ مقاصة صحيح أكبر من الصفر', 'error');
      return;
    }

    if (selectedCustomer.id === selectedSupplier.id && selectedCustomer.type !== 'both') {
      showFeedback('يرجى اختيار طرفين مختلفين أو طرف معرف كعميل ومورد في آن واحد', 'error');
      return;
    }

    if (modalMode === 'create') {
      const res = addDebtClearing({
        date: clearingDate,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        amount: clearingAmount,
        currency: settings.currency,
        reason,
        notes,
        createdBy: currentUser?.fullName || 'المسؤول المالي',
        customerOldBalance: selectedCustomer.balance,
        customerNewBalance: selectedCustomer.balance - clearingAmount,
        supplierOldBalance: selectedSupplier.balance,
        supplierNewBalance: selectedSupplier.balance + clearingAmount
      });

      if (res.success && res.record) {
        setIsModalOpen(false);
        showFeedback(res.message || 'تم تسجيل سند المقاصة بنجاح وتحديث الأرصدة والقيود');
        setSelectedClearingForPrint(res.record);
      } else {
        showFeedback(res.message || 'تعذر تسجيل المقاصة', 'error');
      }
    } else if (modalMode === 'edit' && editingRecordId) {
      const res = updateDebtClearing(editingRecordId, {
        customerId: selectedCustomer.id,
        supplierId: selectedSupplier.id,
        amount: clearingAmount,
        date: clearingDate,
        reason,
        notes
      });

      if (res.success) {
        setIsModalOpen(false);
        showFeedback(res.message || 'تم تعديل سند المقاصة بنجاح وتصحيح الأرصدة');
      } else {
        showFeedback(res.message || 'تعذر تعديل المقاصة', 'error');
      }
    }
  };

  const handleConfirmDelete = () => {
    if (!recordToDelete) return;
    const res = deleteDebtClearing(recordToDelete.id);
    if (res.success) {
      showFeedback(res.message || 'تم حذف سند المقاصة واسترجاع الأرصدة والقيود المحاسبية بنجاح');
      setRecordToDelete(null);
    } else {
      showFeedback(res.message || 'تعذر حذف سند المقاصة', 'error');
    }
  };

  const filteredHistory = useMemo(() => {
    return debtClearings.filter(c => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.clearingNumber.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.supplierName.toLowerCase().includes(q) ||
        c.reason.toLowerCase().includes(q)
      );
    });
  }, [debtClearings, searchQuery]);

  return (
    <div className="space-y-5" dir="rtl">
      {/* Toast Notification */}
      {feedbackMessage && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl shadow-lg border flex items-center gap-2 text-xs font-bold transition-all ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-200" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Scale className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-800">مقاصة وتسوية الديون بين عميل ومورد</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-light mt-1">
            تسوية الذمم المالية المتبادلة دون المساس بصناديق النقد والخزائن، مع إثبات القيود المزدوجة وإتاحة التعديل والحذف المحاسبي المتوازن.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إجراء مقاصة جديدة</span>
        </button>
      </div>

      {/* Rule Notice Banner */}
      <div className="bg-teal-50/70 border border-teal-200 p-3 rounded-xl flex items-start gap-2.5 text-xs text-teal-900">
        <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">القاعدة المحاسبية المعتمدة للمقاصة:</span>
          <p className="text-[11px] text-teal-800">
            عملية المقاصة تخفض ذمة العميل (دائن) وتسقط التزام المورد (مدين) بموجب قيد يومية متوازن، وتظهر تلقائياً بكشف حساب كل طرف دون الدخول في حركات الخزن النقدية أو البنوك.
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">إجمالي مبالغ المقاصة المنفذة</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-indigo-600">
              {formatNumber(debtClearings.reduce((sum, c) => sum + (c.amount || 0), 0), 2)}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block font-mono">{debtClearings.length} عملية تسوية ومقاصة</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">أطراف مشتركة (عميل ومورد معاً)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-slate-800">
              {parties.filter(p => p.type === 'both').length}
            </strong>
            <span className="text-xs text-slate-400">جهة تجارية</span>
          </div>
          <span className="text-[10px] text-emerald-600 mt-1 block">تتعامل بالتوريد والطباعة معاً</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">أثر المقاصة على الصناديق</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-emerald-600">
              معزولة عن الخزينة
            </strong>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">تسوية قيود ذمم دون التأثير على رصيد الصندوق النقدي</span>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث برقم المقاصة، اسم العميل، اسم المورد، أو البيان..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div className="text-[10px] text-slate-400 font-light">
            عدد التسويات: <span className="font-bold text-slate-800 font-mono">{filteredHistory.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="p-3">رقم التسوية</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">طرف العميل (مدين)</th>
                <th className="p-3">طرف المورد (دائن)</th>
                <th className="p-3">سبب وبيان المقاصة</th>
                <th className="p-3">مبلغ المقاصة</th>
                <th className="p-3">المنفذ</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <ArrowRightLeft className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">لا توجد عمليات مقاصة مسجلة</p>
                  </td>
                </tr>
              ) : (
                filteredHistory.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-mono font-bold text-indigo-600">
                      {item.clearingNumber}
                    </td>
                    <td className="p-3 text-slate-600 font-mono">{item.date}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-800">{item.customerName}</div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        الرصيد بعد: {formatNumber(item.customerNewBalance, 2)} {settings.currency}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-800">{item.supplierName}</div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        الرصيد بعد: {formatNumber(Math.abs(item.supplierNewBalance), 2)} {settings.currency}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 max-w-[220px] truncate" title={item.reason}>
                      {item.reason}
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-700 text-sm">
                      {formatNumber(item.amount, 2)} {settings.currency}
                    </td>
                    <td className="p-3 text-slate-500 text-[11px]">{item.createdBy}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedClearingForPrint(item)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                          title="طباعة سند المقاصة والتسوية"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                          title="تعديل سند المقاصة وإعادة احتساب الأرصدة"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setRecordToDelete(item)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="حذف سند المقاصة وإلغاء أثره المحاسبي"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execute / Edit Clearing Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5" />
                <h3 className="font-bold text-sm">
                  {modalMode === 'create'
                    ? 'تحرير تسوية ومقاصة ديون جديدة بين عميل ومورد'
                    : 'تعديل سند المقاصة وتسوية الذمم المحاسبية'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Customer Selector */}
                <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>الطرف الأول: العميل (الذمم المدينة)</span>
                  </div>
                  <select
                    value={selectedCustomerId}
                    onChange={e => setSelectedCustomerId(e.target.value)}
                    className="w-full p-2 bg-white border border-blue-200 rounded-lg text-xs font-semibold"
                  >
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (مديونية: {formatNumber(c.balance, 2)} {settings.currency})
                      </option>
                    ))}
                  </select>

                  {selectedCustomer && (
                    <div className="text-[11px] text-slate-600 space-y-1 bg-white p-2 rounded-lg border border-blue-100">
                      <div className="flex justify-between">
                        <span>الرصيد الحالي المستحق:</span>
                        <strong className="font-mono text-blue-700">
                          {formatNumber(selectedCustomer.balance, 2)} {settings.currency}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>الرصيد المتوقع بعد المقاصة:</span>
                        <strong className="font-mono text-emerald-700">
                          {formatNumber(selectedCustomer.balance - clearingAmount, 2)} {settings.currency}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Supplier Selector */}
                <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-100 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Truck className="w-4 h-4 text-amber-600" />
                    <span>الطرف الثاني: المورد (الذمم الدائنة)</span>
                  </div>
                  <select
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    className="w-full p-2 bg-white border border-amber-200 rounded-lg text-xs font-semibold"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (مستحقاته: {formatNumber(Math.abs(s.balance), 2)} {settings.currency})
                      </option>
                    ))}
                  </select>

                  {selectedSupplier && (
                    <div className="text-[11px] text-slate-600 space-y-1 bg-white p-2 rounded-lg border border-amber-100">
                      <div className="flex justify-between">
                        <span>الرصيد الحالي المستحق له:</span>
                        <strong className="font-mono text-amber-700">
                          {formatNumber(Math.abs(selectedSupplier.balance), 2)} {settings.currency}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>الرصيد المتوقع بعد المقاصة:</span>
                        <strong className="font-mono text-emerald-700">
                          {formatNumber(Math.abs(selectedSupplier.balance + clearingAmount), 2)} {settings.currency}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-700 font-semibold">مبلغ المقاصة ({settings.currency})</label>
                    {suggestedMaxAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => setClearingAmount(suggestedMaxAmount)}
                        className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
                      >
                        أقصى مقاصة متقابلة: {formatNumber(suggestedMaxAmount, 2)} {settings.currency}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={clearingAmount || ''}
                    onChange={e => setClearingAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full p-2.5 border border-indigo-300 rounded-lg font-mono font-bold text-indigo-700 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                  {clearingAmount > 0 && (
                    <p className="text-[9px] text-slate-400 font-light mt-1">
                      فقط {tafqeet(clearingAmount, settings.currency)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تاريخ المقاصة</label>
                  <DateInput required value={clearingDate} onChange={e => setClearingDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">سبب وموضوع المقاصة</label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="مثال: تسوية مقابل مطبوعات الدعاية ومشتريات الورق..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">ملاحظات وشروط الاتفاق</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="أي تفاصيل قانونية أو مراجع فواتير..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              {/* Accounting Entry Preview */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-[11px] block">الأثر المحاسبي المزدوج للقيد (دون لمس الصناديق):</span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    قيد متوازن 100%
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-600 flex justify-between">
                  <span>من حـ/ الموردون والذمم الدائنة (2101) - مدين:</span>
                  <strong className="text-indigo-600 font-bold">{formatNumber(clearingAmount, 2)} {settings.currency}</strong>
                </div>
                <div className="text-[11px] font-mono text-slate-600 flex justify-between">
                  <span>إلى حـ/ العملاء والذمم المدينة (1201) - دائن:</span>
                  <strong className="text-emerald-600 font-bold">{formatNumber(clearingAmount, 2)} {settings.currency}</strong>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  {modalMode === 'create' ? 'اعتماد وتنفيذ المقاصة وتوليد القيد' : 'حفظ التعديلات وتحديث القيود'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {recordToDelete && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">تأكيد حذف سند المقاصة</h3>
                <p className="text-[10px] text-slate-400 font-light font-mono mt-0.5">{recordToDelete.clearingNumber}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف عملية المقاصة بمبلغ{' '}
              <strong className="text-slate-900 font-mono font-bold">
                {formatNumber(recordToDelete.amount, 2)} {settings.currency}
              </strong>{' '}
              بين العميل (<span className="font-bold text-slate-800">{recordToDelete.customerName}</span>) والمورد (
              <span className="font-bold text-slate-800">{recordToDelete.supplierName}</span>)؟
            </p>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-900 space-y-1">
              <span className="font-bold block">ما يترتب على الحذف محاسبياً:</span>
              <ul className="list-disc list-inside space-y-0.5 text-[10.5px]">
                <li>استرجاع مديونية العميل السابقة بإضافة مبلغ المقاصة لرصيده.</li>
                <li>استرجاع مستحقات المورد السابقة بخصم المبلغ من رصيده.</li>
                <li>إلغاء وحذف قيد اليومية المرتبط بالمقاصة تماماً.</li>
                <li>لا تتأثر أي صناديق أو خزن نقدية بأي تغيير.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
              >
                تأكيد الحذف وإلغاء الأثر المحاسبي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Print Modal for Settlement Document */}
      {selectedClearingForPrint && (
        <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <span className="font-bold text-xs">معاينة وطباعة سند مقاصة رسمي</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  onClick={() => setSelectedClearingForPrint(null)}
                  className="text-white/70 hover:text-white text-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Document A4-style */}
            <div className="p-8 text-slate-800 text-xs space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">{settings.businessName}</h2>
                  <p className="text-[10px] text-slate-400 font-light mt-0.5">أنظمة المحاسبة والطباعة المتكاملة ERP</p>
                  {settings.taxNumber && (
                    <p className="text-[10px] text-slate-400 font-mono">الرقم الضريبي: {settings.taxNumber}</p>
                  )}
                </div>
                <div className="text-left font-mono">
                  <span className="inline-block bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded font-bold text-xs">
                    {selectedClearingForPrint.clearingNumber}
                  </span>
                  <div className="text-[10px] text-slate-400 font-light mt-1">التاريخ: {selectedClearingForPrint.date}</div>
                </div>
              </div>

              {/* Title */}
              <div className="text-center py-1">
                <h3 className="text-lg font-black text-slate-900 tracking-wide border-b border-slate-300 inline-block px-4 pb-1">
                  سند مقاصة وتسوية ذمم رسمية
                </h3>
              </div>

              {/* Legal Text & Details */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 leading-relaxed">
                <p>
                  بموجب هذا السند تم الاتفاق على إجراء مقاصة مالية محاسبية بين كل من الطرفين أدناه، وذلك لتسوية الذمم المتبادلة وإسقاطها من الحسابات:
                </p>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">الطرف الأول (العميل):</span>
                    <strong className="text-sm font-bold text-slate-800 block mt-0.5">
                      {selectedClearingForPrint.customerName}
                    </strong>
                    <span className="text-[9px] text-slate-400 font-light block mt-1 font-mono">
                      الرصيد المتبقي: {formatNumber(selectedClearingForPrint.customerNewBalance, 2)} {settings.currency}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">الطرف الثاني (المورد):</span>
                    <strong className="text-sm font-bold text-slate-800 block mt-0.5">
                      {selectedClearingForPrint.supplierName}
                    </strong>
                    <span className="text-[9px] text-slate-400 font-light block mt-1 font-mono">
                      الرصيد المتبقي: {formatNumber(Math.abs(selectedClearingForPrint.supplierNewBalance), 2)} {settings.currency}
                    </span>
                  </div>
                </div>

                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-emerald-800 block font-semibold">مبلغ المقاصة المعتمد:</span>
                    <strong className="text-lg font-mono font-bold text-emerald-700">
                      {formatNumber(selectedClearingForPrint.amount, 2)} {settings.currency}
                    </strong>
                  </div>
                  <div className="text-[11px] text-emerald-800 font-medium">
                    {tafqeet(selectedClearingForPrint.amount, settings.currency)}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-slate-700">البيان والسبب: </span>
                  <span className="text-slate-600">{selectedClearingForPrint.reason}</span>
                </div>

                {selectedClearingForPrint.notes && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-700">ملاحظات إضافية: </span>
                    <span className="text-slate-600">{selectedClearingForPrint.notes}</span>
                  </div>
                )}
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-4 pt-8 text-center border-t border-slate-200">
                <div>
                  <span className="block font-bold text-slate-700 mb-8">توقيع الطرف الأول (العميل)</span>
                  <div className="border-b border-dashed border-slate-300 w-32 mx-auto"></div>
                </div>
                <div>
                  <span className="block font-bold text-slate-700 mb-8">توقيع الطرف الثاني (المورد)</span>
                  <div className="border-b border-dashed border-slate-300 w-32 mx-auto"></div>
                </div>
                <div>
                  <span className="block font-bold text-slate-700 mb-8">اعتماد الإدارة المالية</span>
                  <div className="border-b border-dashed border-slate-300 w-32 mx-auto"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
