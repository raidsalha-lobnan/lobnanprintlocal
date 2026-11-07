import React, { useState, useMemo } from 'react';
import { DateInput } from '../../components/common/DateInput';
import { useAccounting } from '../../context/AccountingContext';
import { Party, PaymentVoucher } from '../../types';
import { X, Receipt, Printer, Calendar, Search, Filter, ArrowDownLeft, FileText, CheckCircle2 } from 'lucide-react';
import { tafqeet } from '../../utils/tafqeet';
import { PrintHeader } from '../common/PrintHeader';

interface CustomerReceiptsLedgerModalProps {
  party: Party | null;
  isOpen: boolean;
  onClose: () => void;
  onNewReceipt?: () => void;
}

export const CustomerReceiptsLedgerModal: React.FC<CustomerReceiptsLedgerModalProps> = ({
  party,
  isOpen,
  onClose,
  onNewReceipt
}) => {
  const { vouchers, treasuries, settings, setSelectedVoucherForPrint } = useAccounting();

  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  if (!isOpen || !party) return null;

  // Filter vouchers for this party of type 'receipt'
  const partyReceipts = useMemo(() => {
    return vouchers.filter(v => {
      if (v.type !== 'receipt') return false;
      const isTarget = party.isSubCustomer
        ? (v.subCustomerId === party.id || (v.subCustomerName && v.subCustomerName.trim() === party.name.trim()))
        : (v.partyId === party.id || (v.partyName && v.partyName.trim() === party.name.trim()));

      if (!isTarget) return false;

      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = v.voucherNumber.toLowerCase().includes(q);
        const matchDesc = v.description && v.description.toLowerCase().includes(q);
        if (!matchNum && !matchDesc) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [vouchers, party, fromDate, toDate, searchQuery]);

  const totalReceiptsAmount = partyReceipts.reduce((sum, v) => sum + (v.baseAmount || v.amount), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 text-slate-800 text-xs print:p-0 print:bg-white" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden print:border-none print:shadow-none print:max-w-none">
        {/* Header Controls (Hidden during print) */}
        <div className="bg-[#1f4a7c] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#143254] print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500 text-white rounded-xl shadow-xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">كشف سندات قبض العميل</h3>
                <span className="bg-amber-400 text-slate-900 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                  {party.code}
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                العميل: <strong className="text-white">{party.name}</strong> • إجمالي سندات القبض: ({partyReceipts.length})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNewReceipt && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewReceipt();
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shadow-xs"
              >
                + سند قبض جديد
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-[#1f4a7c] rounded-lg font-bold flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الكشف</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Toolbar (Hidden during print) */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث برقم السند أو البيان..."
                className="w-full bg-white border border-slate-300 rounded-lg pr-8 pl-3 py-1 text-xs focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold text-[11px]">من تاريخ:</span>
            <DateInput value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-mono"
            />
            <span className="text-slate-600 font-semibold text-[11px]">إلى:</span>
            <DateInput value={toDate} onChange={e => setToDate(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-mono"
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="text-[11px] text-rose-600 font-bold hover:underline"
              >
                مسح الفترة
              </button>
            )}
          </div>
        </div>

        {/* Printable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 print:p-0">
          {/* Print Header - يعتمد الهيدر الكامل أو الترويسة القياسية */}
          <div className="hidden print:block mb-4">
            <PrintHeader
              title="كشف سندات قبض ومتحصلات العميل"
              subtitle="Customer Receipt Vouchers Ledger"
              docNumber={party.code}
              docDate={new Date().toLocaleDateString('ar-SA')}
              badge="كشف مقبوضات معتمد"
              extraMeta={
                <div>
                  <span className="text-slate-400">العميل: </span>
                  <span className="font-bold">{party.name}</span>
                </div>
              }
            />
          </div>

          {/* Quick Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
            <div>
              <span className="text-[10px] text-emerald-800 font-bold block">إجمالي المبالغ المقبوضة:</span>
              <span className="text-base font-black font-mono text-emerald-900">
                {totalReceiptsAmount.toFixed(2)} {settings.currency || '₪'}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-emerald-800 font-bold block">عدد السندات المسجلة:</span>
              <span className="text-base font-black font-mono text-emerald-900">
                {partyReceipts.length} سند
              </span>
            </div>

            <div>
              <span className="text-[10px] text-emerald-800 font-bold block">رصيد حساب العميل الحالي:</span>
              <span className="text-base font-black font-mono text-slate-900">
                {party.balance.toFixed(2)} {settings.currency || '₪'}
              </span>
            </div>
          </div>

          {/* Table of Receipts */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <th className="py-2 px-3 w-10 text-center">م</th>
                  <th className="py-2 px-3 w-24">رقم السند</th>
                  <th className="py-2 px-3 w-24 font-mono">التاريخ</th>
                  <th className="py-2 px-3">البيان والشرح</th>
                  <th className="py-2 px-3 w-28">طريقة القبض</th>
                  <th className="py-2 px-3 w-32">الصندوق / البنك</th>
                  <th className="py-2 px-3 w-28 text-left font-mono text-emerald-800 font-bold">المبلغ</th>
                  <th className="py-2 px-3 w-16 text-center print:hidden">طباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {partyReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      لا توجد سندات قبض مسجلة لهذا العميل حتى الآن
                    </td>
                  </tr>
                ) : (
                  partyReceipts.map((v, idx) => {
                    const treasury = treasuries.find(t => t.accountCode === v.accountCode);
                    return (
                      <tr key={`${v.id || 'receipt'}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-blue-900">
                          {v.voucherNumber}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                          {v.date}
                        </td>
                        <td className="py-2 px-3 text-slate-800">
                          <div className="flex items-center gap-1.5 bg-blue-50/70 border border-blue-200/70 rounded-lg px-2.5 py-1 text-xs text-blue-950 font-medium">
                            <span className="font-bold text-blue-900 shrink-0 text-[11px]">ملاحظة مرتبطة بسند القبض:</span>
                            <span className="truncate" title={v.description || 'سند قبض وتحصيل'}>
                              {v.description || 'سند قبض وتحصيل'}
                            </span>
                          </div>
                          {v.subCustomerName && (
                            <span className="block text-[10px] text-amber-700 mt-0.5">
                              (زبون فرعي: {v.subCustomerName})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-semibold">
                          {v.paymentMethod === 'cash' ? 'نقداً' : v.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'شيك'}
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">
                          {treasury ? treasury.name : v.accountCode}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-black text-emerald-800 text-sm">
                          {v.amount.toFixed(2)} {v.currencySymbol || settings.currency}
                        </td>
                        <td className="py-2 px-3 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => {
                              if (setSelectedVoucherForPrint) {
                                setSelectedVoucherForPrint(v);
                              }
                            }}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded cursor-pointer"
                            title="طباعة إيصال السند الفردي"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                  <td colSpan={6} className="py-2.5 px-3 text-left">
                    إجمالي المقبوضات المسجلة:
                  </td>
                  <td className="py-2.5 px-3 text-left font-mono text-emerald-900 font-black text-sm">
                    {totalReceiptsAmount.toFixed(2)} {settings.currency || '₪'}
                  </td>
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tafqeet in words */}
          {totalReceiptsAmount > 0 && (
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700">
              <span>فقط وقدره: </span>
              <span className="font-bold text-slate-900 font-sans">
                {tafqeet(totalReceiptsAmount)} {settings.baseCurrencyCode === 'ILS' ? 'شيكل لا غير' : 'ريال لا غير'}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between print:hidden">
          <span className="text-[10px] text-slate-400 font-light">
            * هذا الكشف معتمد من واقع قيود وسندات القبض المسجلة في النظام.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
