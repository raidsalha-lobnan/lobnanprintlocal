import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import {
  DollarSign,
  Plus,
  Search,
  Calendar,
  Filter,
  Printer,
  Trash2,
  TrendingDown,
  Tag,
  FileText,
  Wallet,
  Landmark,
  Layers,
  PieChart,
  CheckCircle,
  Building,
  AlertCircle
} from 'lucide-react';

interface ExpenseItem {
  id: string;
  date: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  category: 'maintenance' | 'rent' | 'utilities' | 'marketing' | 'hospitality' | 'supplies' | 'other';
  categoryName: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer';
  treasuryAccountCode: string;
  treasuryName: string;
  beneficiary: string;
  taxInvoiceNumber?: string;
  notes: string;
  createdAt: string;
}

export const ExpensesView: React.FC = () => {
  const {
    accounts,
    treasuries,
    settings,
    expenses,
    addExpense,
    deleteExpense,
    createPaymentVoucher,
    vouchers
  } = useAccounting();

  // Filter accounts with type 'expense' (starts with 5)
  const expenseAccounts = useMemo(() => {
    return accounts.filter(a => a.type === 'expense' || a.code.startsWith('5'));
  }, [accounts]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalAccountCode, setModalAccountCode] = useState(expenseAccounts[0]?.code || '5205');
  const [modalCategory, setModalCategory] = useState<ExpenseItem['category']>('maintenance');
  const [modalAmount, setModalAmount] = useState<number>(0);
  const [modalMethod, setModalMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [modalTreasuryCode, setModalTreasuryCode] = useState('1101');
  const [modalBeneficiary, setModalBeneficiary] = useState('');
  const [modalTaxInvoiceNumber, setModalTaxInvoiceNumber] = useState('');
  const [modalNotes, setModalNotes] = useState('');

  // Categories dictionary
  const categoriesMap: Record<string, string> = {
    maintenance: 'صيانة وقطع غيار',
    rent: 'إيجارات ومقرات',
    utilities: 'كهرباء وماء ومرافق',
    marketing: 'تسويق ودعاية',
    hospitality: 'ضيافة وبوفيه ونظافة',
    supplies: 'أدوات ومهمات مكتبية',
    other: 'مصروفات متنوعة'
  };

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(item => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (fromDate && item.date < fromDate) return false;
      if (toDate && item.date > toDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.expenseAccountName.toLowerCase().includes(q);
        const matchBeneficiary = item.beneficiary.toLowerCase().includes(q);
        const matchNotes = item.notes.toLowerCase().includes(q);
        const matchInv = item.taxInvoiceNumber && item.taxInvoiceNumber.toLowerCase().includes(q);
        if (!matchName && !matchBeneficiary && !matchNotes && !matchInv) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, categoryFilter, fromDate, toDate, searchQuery]);

  // Statistics
  const todayIso = new Date().toISOString().split('T')[0];
  const thisMonthPrefix = todayIso.substring(0, 7);

  const totalExpensesSum = expenses.reduce((s, e) => s + e.amount, 0);
  const thisMonthExpensesSum = expenses.filter(e => e.date.startsWith(thisMonthPrefix)).reduce((s, e) => s + e.amount, 0);
  const todayExpensesSum = expenses.filter(e => e.date === todayIso).reduce((s, e) => s + e.amount, 0);
  const maintenanceExpensesSum = expenses.filter(e => e.category === 'maintenance').reduce((s, e) => s + e.amount, 0);

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalAmount <= 0) {
      alert('يرجى إدخال مبلغ المصروف بشكل صحيح');
      return;
    }

    const selectedAcc = expenseAccounts.find(a => a.code === modalAccountCode) || {
      code: modalAccountCode,
      name: 'مصروفات عامة'
    };

    const selectedTreasury = treasuries.find(t => t.accountCode === modalTreasuryCode) || {
      name: modalMethod === 'cash' ? 'الصندوق الرئيسي' : 'الحساب البنكي'
    };

    addExpense({
      date: modalDate,
      expenseAccountCode: selectedAcc.code,
      expenseAccountName: selectedAcc.name,
      category: modalCategory,
      categoryName: categoriesMap[modalCategory] || 'مصروفات عامة',
      amount: modalAmount,
      paymentMethod: modalMethod,
      treasuryAccountCode: modalTreasuryCode,
      treasuryName: selectedTreasury.name,
      beneficiary: modalBeneficiary || 'مصروف نقدي عام',
      taxInvoiceNumber: modalTaxInvoiceNumber,
      notes: modalNotes
    });

    // Also register in vouchers as a payment voucher
    createPaymentVoucher({
      type: 'payment',
      date: modalDate,
      partyId: 'expense-party',
      partyName: modalBeneficiary || selectedAcc.name,
      amount: modalAmount,
      paymentMethod: modalMethod,
      accountCode: selectedAcc.code,
      treasuryAccountCode: modalTreasuryCode,
      description: `مصروف تشغيلي: ${selectedAcc.name} - ${modalNotes}`
    });

    setIsModalOpen(false);
    setModalAmount(0);
    setModalNotes('');
    setModalBeneficiary('');
    setModalTaxInvoiceNumber('');
  };

  const handleDeleteExpense = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المصروف وإلغاء أثره المالي؟')) {
      deleteExpense(id);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-800">المصروفات والمصاريف التشغيلية</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-light mt-1">
            تسجيل ومتابعة المصروفات العمومية والتشغيلية، فواتير الخدمات، الصيانة الدورية، والضيافة مع الترحيل المحاسبي اللحظي
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>تسجيل مصروف جديد</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">إجمالي المصروفات المسجلة</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-amber-600">
              {totalExpensesSum.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">{expenses.length} عملية صرف مسجلة</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">مصروفات هذا الشهر</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-slate-800">
              {thisMonthExpensesSum.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-amber-600 mt-1 block">للفترة المالية الحالية</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">مصروفات اليوم</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-slate-800">
              {todayExpensesSum.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">مصاريف نثرية وتشغيلية</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">صيانة الماكينات وقطع الغيار</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-indigo-600">
              {maintenanceExpensesSum.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">جاهزية الآلات والورشة</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالبند، اسم المستفيد، الشرح، رقم الفاتورة..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">كل تصنيفات المصروفات</option>
              <option value="maintenance">صيانة وقطع غيار</option>
              <option value="rent">إيجارات ومقرات</option>
              <option value="utilities">كهرباء وماء ومرافق</option>
              <option value="marketing">تسويق ودعاية</option>
              <option value="hospitality">ضيافة وبوفيه ونظافة</option>
              <option value="supplies">أدوات ومهمات مكتبية</option>
              <option value="other">مصروفات متنوعة</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="text-[11px] text-slate-400">من:</span>
          <DateInput value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">إلى:</span>
          <DateInput value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
          />
          {(searchQuery || categoryFilter !== 'all' || fromDate || toDate) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
                setFromDate('');
                setToDate('');
              }}
              className="text-amber-600 hover:text-amber-700 text-[11px] font-medium px-2 py-1 cursor-pointer"
            >
              إلغاء الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="p-3">التاريخ</th>
                <th className="p-3">بند المصروف</th>
                <th className="p-3">التصنيف</th>
                <th className="p-3">المستفيد / الجهة</th>
                <th className="p-3">البيان والشرح</th>
                <th className="p-3">طريقة الدفع والصندوق</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">لا توجد مصروفات مسجلة مطابقة لمعايير البحث</p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 text-slate-600 font-mono">{exp.date}</td>
                    <td className="p-3 font-semibold text-slate-900">
                      <div>{exp.expenseAccountName}</div>
                      <span className="text-[10px] text-slate-400 font-mono">كود: {exp.expenseAccountCode}</span>
                    </td>
                    <td className="p-3">
                      <span className="inline-block bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        {exp.categoryName}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">
                      <span className="font-medium">{exp.beneficiary}</span>
                      {exp.taxInvoiceNumber && (
                        <div className="text-[10px] text-slate-400 font-mono">فاتورة: {exp.taxInvoiceNumber}</div>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 max-w-[240px] truncate" title={exp.notes}>
                      {exp.notes}
                    </td>
                    <td className="p-3 text-slate-600 text-[11px]">
                      <div className="font-medium">{exp.treasuryName}</div>
                      <span className="text-slate-400">
                        {exp.paymentMethod === 'cash' ? 'نقداً (كاش)' : 'تحويل بنكي'}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-amber-700 text-sm">
                      {exp.amount.toLocaleString('ar-SA')} {settings.currency}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => window.print()}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          title="طباعة إشعار المصروف"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="حذف المصروف"
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

      {/* New Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                <h3 className="font-bold text-sm">تسجيل مصروف تشغيلي جديد</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تاريخ المصروف</label>
                  <DateInput required value={modalDate} onChange={e => setModalDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">المبلغ المطلوب صرفه ({settings.currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={modalAmount || ''}
                    onChange={e => setModalAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full p-2 border border-amber-300 rounded-lg font-mono font-bold text-amber-700 text-sm focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">بند المصروف (دليل الحسابات)</label>
                <select
                  value={modalAccountCode}
                  onChange={e => setModalAccountCode(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                >
                  {expenseAccounts.map(acc => (
                    <option key={acc.code} value={acc.code}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                  <option value="5205">5205 - مصروفات عمومية وتسويقية متنوعة</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تصنيف المصروف</label>
                  <select
                    value={modalCategory}
                    onChange={e => setModalCategory(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="maintenance">صيانة وقطع غيار</option>
                    <option value="rent">إيجارات ومقرات</option>
                    <option value="utilities">كهرباء وماء ومرافق</option>
                    <option value="marketing">تسويق ودعاية</option>
                    <option value="hospitality">ضيافة وبوفيه ونظافة</option>
                    <option value="supplies">أدوات ومهمات مكتبية</option>
                    <option value="other">مصروفات متنوعة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">طريقة الصرف</label>
                  <select
                    value={modalMethod}
                    onChange={e => setModalMethod(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="cash">نقداً (من الصندوق)</option>
                    <option value="bank_transfer">تحويل بنكي (من الحساب)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">الخزينة أو الحساب البنكي المنصرف منه</label>
                <select
                  value={modalTreasuryCode}
                  onChange={e => setModalTreasuryCode(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium"
                >
                  {treasuries.map(t => (
                    <option key={t.id} value={t.accountCode || t.id}>
                      {t.name} (الرصيد: {t.balance.toLocaleString('ar-SA')} {settings.currency})
                    </option>
                  ))}
                  <option value="1101">1101 - الصندوق الرئيسي (الكاشير)</option>
                  <option value="1102">1102 - بنك فلسطين - حساب جاري</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">المستفيد / الجهة المستلمة</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: شركة الكهرباء / فني الصيانة..."
                    value={modalBeneficiary}
                    onChange={e => setModalBeneficiary(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم الفاتورة الضريبية / الإيصال</label>
                  <input
                    type="text"
                    placeholder="اختياري (مثال: INV-9821)"
                    value={modalTaxInvoiceNumber}
                    onChange={e => setModalTaxInvoiceNumber(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">البيان والشرح التفصيلي</label>
                <textarea
                  rows={2}
                  required
                  placeholder="اكتب شرحاً وافياً لسبب المصروف وما تم إنجازه..."
                  value={modalNotes}
                  onChange={e => setModalNotes(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  عند حفظ المصروف سيتم تلقائياً إصدار سند صرف رسمي (Payment Voucher) وقيد محاسبي متوازن يخصم من رصيد الخزينة المحددة ويثبت في حساب المصروفات.
                </span>
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
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  حفظ وترحيل المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
