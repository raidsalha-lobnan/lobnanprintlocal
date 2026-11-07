import React, { useState } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { Account, AccountType, JournalEntry } from '../types';
import {
  BookOpenCheck,
  Plus,
  Filter,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  ListOrdered,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Search
} from 'lucide-react';

export const AccountingView: React.FC = () => {
  const { accounts, journalEntries, addJournalEntry, addAccount, settings } = useAccounting();

  const [activeTab, setActiveTabState] = useState<'chart' | 'journal' | 'ledger' | 'trial'>(() => {
    try {
      const saved = localStorage.getItem('accounting_active_subtab');
      if (saved && ['chart', 'journal', 'ledger', 'trial'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return 'journal';
  });

  const setActiveTab = React.useCallback((tab: 'chart' | 'journal' | 'ledger' | 'trial') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('accounting_active_subtab', tab);
    } catch {}
  }, []);

  const [selectedLedgerAccount, setSelectedLedgerAccountState] = useState<string>(() => {
    try {
      return localStorage.getItem('accounting_selected_ledger') || '1101';
    } catch {}
    return '1101';
  });

  const setSelectedLedgerAccount = React.useCallback((acc: string) => {
    setSelectedLedgerAccountState(acc);
    try {
      localStorage.setItem('accounting_selected_ledger', acc);
    } catch {}
  }, []);
  const [showNewEntryModal, setShowNewEntryModal] = useState(false);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);

  // New Journal Entry Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryDesc, setEntryDesc] = useState('');
  const [entryLines, setEntryLines] = useState<Array<{ accountCode: string; debit: number; credit: number; desc: string }>>([
    { accountCode: '1101', debit: 0, credit: 0, desc: '' },
    { accountCode: '4101', debit: 0, credit: 0, desc: '' }
  ]);

  // New Account Form State
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('expense');
  const [newAccDesc, setNewAccDesc] = useState('');

  // Total debits and credits in manual entry
  const totalDebit = entryLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = entryLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const handleAddLine = () => {
    setEntryLines([...entryLines, { accountCode: '1101', debit: 0, credit: 0, desc: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    if (entryLines.length > 2) {
      setEntryLines(entryLines.filter((_, idx) => idx !== index));
    }
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    setEntryLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced || !entryDesc) return;

    addJournalEntry({
      date: entryDate,
      description: entryDesc,
      referenceType: 'manual',
      lines: entryLines.map(l => {
        const acc = accounts.find(a => a.code === l.accountCode);
        return {
          accountCode: l.accountCode,
          accountName: acc?.name || '',
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.desc || entryDesc
        };
      })
    });

    setShowNewEntryModal(false);
    setEntryDesc('');
    setEntryLines([
      { accountCode: '1101', debit: 0, credit: 0, desc: '' },
      { accountCode: '4101', debit: 0, credit: 0, desc: '' }
    ]);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccCode || !newAccName) return;

    addAccount({
      code: newAccCode,
      name: newAccName,
      type: newAccType,
      description: newAccDesc,
      initialBalance: 0
    });

    setShowNewAccountModal(false);
    setNewAccCode('');
    setNewAccName('');
    setNewAccDesc('');
  };

  const getAccountTypeLabel = (type: AccountType) => {
    switch (type) {
      case 'asset': return { label: 'أصول', class: 'bg-emerald-50 text-emerald-700' };
      case 'liability': return { label: 'خصوم (التزامات)', class: 'bg-rose-50 text-rose-700' };
      case 'equity': return { label: 'حقوق ملكية', class: 'bg-purple-50 text-purple-700' };
      case 'revenue': return { label: 'إيرادات', class: 'bg-sky-50 text-sky-700' };
      case 'expense': return { label: 'مصروفات', class: 'bg-amber-50 text-amber-700' };
    }
  };

  // General Ledger transactions for selected account
  const ledgerEntries = journalEntries.filter(je =>
    je.lines.some(l => l.accountCode === selectedLedgerAccount)
  );

  const selectedAcc = accounts.find(a => a.code === selectedLedgerAccount);

  return (
    <div className="space-y-4">
      {/* Top Header & Tab Navigation */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <BookOpenCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">النظام المحاسبي ودفاتر اليومية والأستاذ</h2>
            <p className="text-[10px] text-slate-400 font-light">نظام القيد المزدوج المتوازن، شجرة الحسابات، وميزان المراجعة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-0.5 rounded-md flex items-center text-xs font-semibold">
            <button
              onClick={() => setActiveTab('journal')}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer text-xs ${
                activeTab === 'journal' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              دفتر اليومية العامة
            </button>
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer text-xs ${
                activeTab === 'chart' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              دليل الحسابات
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer text-xs ${
                activeTab === 'ledger' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              دفتر الأستاذ
            </button>
            <button
              onClick={() => setActiveTab('trial')}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer text-xs ${
                activeTab === 'trial' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ميزان المراجعة
            </button>
          </div>

          <button
            onClick={() => setShowNewEntryModal(true)}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>قيد يومية يدوي</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Journal Entries (دفتر اليومية العامة) */}
      {activeTab === 'journal' && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-2.5 flex items-center justify-between text-xs">
            <span className="text-slate-500">إجمالي القيود المسجلة: <strong className="text-slate-900 font-bold font-mono">{journalEntries.length}</strong> قيد</span>
            <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px]">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>كافة القيود مطابقة ومتزنة (مدين = دائن)</span>
            </span>
          </div>

          <div className="space-y-2.5">
            {journalEntries.map((entry, idx) => {
              const entryTotalDebit = entry.lines.reduce((acc, l) => acc + l.debit, 0);
              return (
                <div key={`${entry.id || 'je'}-${idx}`} className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
                  <div className="bg-slate-50 p-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-600 bg-white border border-blue-100 px-1.5 py-0.5 rounded text-[11px]">
                        {entry.entryNumber}
                      </span>
                      <span className="font-bold text-slate-800 text-xs">{entry.description}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                      <span>التاريخ: <span className="font-mono">{entry.date}</span></span>
                      <span className="font-mono font-bold text-slate-800">
                        الإجمالي: {entryTotalDebit.toLocaleString('ar-SA')} {settings.currency}
                      </span>
                    </div>
                  </div>

                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100 text-[11px]">
                      <tr>
                        <th className="p-2">رقم الحساب</th>
                        <th className="p-2">اسم الحساب</th>
                        <th className="p-2">البيان والتفاصيل</th>
                        <th className="p-2 text-left w-24">مدين ({settings.currency})</th>
                        <th className="p-2 text-left w-24">دائن ({settings.currency})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entry.lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-2 font-mono text-slate-600 font-semibold text-[11px]">{line.accountCode}</td>
                          <td className="p-2 font-bold text-slate-800 text-xs">{line.accountName}</td>
                          <td className="p-2 text-slate-500 text-[11px]">{line.description || '-'}</td>
                          <td className="p-2 text-left font-mono font-bold text-emerald-700 text-xs">
                            {line.debit > 0 ? line.debit.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="p-2 text-left font-mono font-bold text-blue-700 text-xs">
                            {line.credit > 0 ? line.credit.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Chart of Accounts (دليل الحسابات) */}
      {activeTab === 'chart' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-2.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-xs text-slate-900">شجرة الحسابات المعتمدة</h3>
            <button
              onClick={() => setShowNewAccountModal(true)}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة حساب فرعي جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5">رمز الحساب</th>
                  <th className="p-2.5">اسم الحساب</th>
                  <th className="p-2.5">النوع والتصنيف</th>
                  <th className="p-2.5">الرصيد الدفتري الحالي</th>
                  <th className="p-2.5">طبيعة الحساب</th>
                  <th className="p-2.5">الوصف والغرض</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map(acc => {
                  const badge = getAccountTypeLabel(acc.type);
                  const isDebitNature = acc.type === 'asset' || acc.type === 'expense';
                  return (
                    <tr key={acc.code} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 font-mono font-bold text-blue-600">{acc.code}</td>
                      <td className="p-2.5 font-bold text-slate-900">{acc.name}</td>
                      <td className="p-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${badge.class}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">
                        {acc.balance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                      </td>
                      <td className="p-2.5 text-slate-500 text-[11px]">
                        {isDebitNature ? 'مدين بطبيعته' : 'دائن بطبيعته'}
                      </td>
                      <td className="p-2.5 text-slate-500 text-[11px]">{acc.description || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: General Ledger (دفتر الأستاذ العام) */}
      {activeTab === 'ledger' && (
        <div className="space-y-3">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">اختر الحساب لعرض كشف الحركات:</label>
              <select
                value={selectedLedgerAccount}
                onChange={e => setSelectedLedgerAccount(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
              >
                {accounts.map(a => (
                  <option key={a.code} value={a.code}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedAcc && (
              <div className="text-xs flex items-center gap-2">
                <span className="text-slate-500">الرصيد الختامي الحالي:</span>
                <span className="font-mono font-bold text-blue-600 text-xs">
                  {selectedAcc.balance.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} {settings.currency}
                </span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5">التاريخ</th>
                  <th className="p-2.5">رقم القيد</th>
                  <th className="p-2.5">البيان والشرح</th>
                  <th className="p-2.5 text-left">حركة مدينة</th>
                  <th className="p-2.5 text-left">حركة دائنة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                      لا توجد حركات مسجلة لهذا الحساب حتى الآن.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((entry, idx) => {
                    const line = entry.lines.find(l => l.accountCode === selectedLedgerAccount);
                    if (!line) return null;
                    return (
                      <tr key={`${entry.id || 'je'}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 text-slate-500 font-mono text-[11px]">{entry.date}</td>
                        <td className="p-2.5 font-mono font-bold text-blue-600">{entry.entryNumber}</td>
                        <td className="p-2.5 font-medium text-slate-900">{entry.description}</td>
                        <td className="p-2.5 text-left font-mono font-bold text-emerald-600">
                          {line.debit > 0 ? line.debit.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="p-2.5 text-left font-mono font-bold text-blue-600">
                          {line.credit > 0 ? line.credit.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Trial Balance (ميزان المراجعة) */}
      {activeTab === 'trial' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-2.5 border-b border-slate-200 bg-slate-50/60">
            <h3 className="font-bold text-xs text-slate-900">ميزان المراجعة بالأرصدة (Trial Balance)</h3>
            <p className="text-[10px] text-slate-400 font-light">مراجعة مطابقة إجمالي الأرصدة المدينة والدائنة لكافة الحسابات</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5">رمز الحساب</th>
                  <th className="p-2.5">اسم الحساب</th>
                  <th className="p-2.5">النوع</th>
                  <th className="p-2.5 text-left">أرصدة مدينة ({settings.currency})</th>
                  <th className="p-2.5 text-left">أرصدة دائنة ({settings.currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map(acc => {
                  const isDebit = acc.type === 'asset' || acc.type === 'expense';
                  return (
                    <tr key={acc.code} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 font-mono font-bold text-slate-600">{acc.code}</td>
                      <td className="p-2.5 font-bold text-slate-800">{acc.name}</td>
                      <td className="p-2.5 text-slate-500 text-[11px]">{getAccountTypeLabel(acc.type).label}</td>
                      <td className="p-2.5 text-left font-mono font-bold text-emerald-700">
                        {isDebit ? acc.balance.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="p-2.5 text-left font-mono font-bold text-blue-700">
                        {!isDebit ? acc.balance.toLocaleString('ar-SA', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <tr>
                  <td colSpan={3} className="p-2.5 text-slate-900 text-xs">إجمالي ميزان المراجعة:</td>
                  <td className="p-2.5 text-left font-mono text-emerald-800 text-xs">
                    {accounts
                      .filter(a => a.type === 'asset' || a.type === 'expense')
                      .reduce((acc, a) => acc + a.balance, 0)
                      .toLocaleString('ar-SA', { minimumFractionDigits: 2 })}{' '}
                    {settings.currency}
                  </td>
                  <td className="p-2.5 text-left font-mono text-blue-800 text-xs">
                    {accounts
                      .filter(a => a.type !== 'asset' && a.type !== 'expense')
                      .reduce((acc, a) => acc + a.balance, 0)
                      .toLocaleString('ar-SA', { minimumFractionDigits: 2 })}{' '}
                    {settings.currency}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Manual Journal Entry */}
      {showNewEntryModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-2xl w-full p-4 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-xs text-slate-900 mb-3 flex items-center gap-1.5">
              <BookOpenCheck className="w-4 h-4 text-blue-600" />
              <span>إدخال قيد يومية يدوي مركب</span>
            </h3>

            <form onSubmit={handleSubmitEntry} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">تاريخ القيد:</label>
                  <DateInput required value={entryDate} onChange={e => setEntryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">البيان العام للقيد:</label>
                  <input
                    type="text"
                    required
                    value={entryDesc}
                    onChange={e => setEntryDesc(e.target.value)}
                    placeholder="مثال: سداد مصروفات صيانة ماكينة أوفست..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs"
                  />
                </div>
              </div>

              {/* Entry Lines */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-xs">أطراف القيد (المدين والدائن):</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة طرف جديد</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {entryLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5 bg-slate-50 p-2 rounded-md border border-slate-200 items-center">
                      <div className="col-span-5">
                        <select
                          value={line.accountCode}
                          onChange={e => handleLineChange(idx, 'accountCode', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded p-1.5 font-medium text-xs"
                        >
                          {accounts.map(a => (
                            <option key={a.code} value={a.code}>
                              {a.code} - {a.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="مدين"
                          value={line.debit || ''}
                          onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded p-1.5 font-mono text-left text-xs"
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="دائن"
                          value={line.credit || ''}
                          onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded p-1.5 font-mono text-left text-xs"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          disabled={entryLines.length <= 2}
                          className="text-slate-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer text-sm"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance Validation Bar */}
              <div className="bg-slate-100 p-2.5 rounded-md flex items-center justify-between font-mono font-bold text-xs">
                <div>إجمالي المدين: <span className="text-emerald-700">{totalDebit.toFixed(2)}</span></div>
                <div>إجمالي الدائن: <span className="text-blue-700">{totalCredit.toFixed(2)}</span></div>
                <div>
                  {isBalanced ? (
                    <span className="text-emerald-600 flex items-center gap-1 font-sans text-[11px]">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>القيد متزن تماماً</span>
                    </span>
                  ) : (
                    <span className="text-rose-600 flex items-center gap-1 font-sans text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>فارق: {Math.abs(totalDebit - totalCredit).toFixed(2)}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewEntryModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!isBalanced || !entryDesc}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-md shadow-xs cursor-pointer text-xs"
                >
                  ترحيل القيد لدفتر الأستاذ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Account to Chart */}
      {showNewAccountModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-xl border border-slate-200">
            <h3 className="font-bold text-xs text-slate-900 mb-3">إضافة حساب جديد إلى دليل الحسابات</h3>
            <form onSubmit={handleSaveAccount} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">رمز الحساب (الكود):</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 5206"
                  value={newAccCode}
                  onChange={e => setNewAccCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">اسم الحساب:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مصروفات التغليف والشحن"
                  value={newAccName}
                  onChange={e => setNewAccName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">نوع الحساب:</label>
                <select
                  value={newAccType}
                  onChange={e => setNewAccType(e.target.value as AccountType)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs"
                >
                  <option value="asset">أصول (Assets)</option>
                  <option value="liability">خصوم والتزامات (Liabilities)</option>
                  <option value="equity">حقوق ملكية (Equity)</option>
                  <option value="revenue">إيرادات (Revenue)</option>
                  <option value="expense">مصروفات (Expense)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">الوصف والغرض:</label>
                <textarea
                  rows={2}
                  value={newAccDesc}
                  onChange={e => setNewAccDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAccountModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-md cursor-pointer text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-xs cursor-pointer text-xs"
                >
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
