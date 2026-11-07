import React from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Printer, X, CheckCircle, Building2, Calendar, DollarSign, FileText } from 'lucide-react';
import { PrintHeader } from './common/PrintHeader';
import { ReportSignatures } from './common/ReportSignatures';

export const PayrollPrintModal: React.FC = () => {
  const { selectedPayrollSheetForPrint, setSelectedPayrollSheetForPrint, settings } = useAccounting();

  if (!selectedPayrollSheetForPrint) return null;

  const sheet = selectedPayrollSheetForPrint;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print-modal-container">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-auto print:shadow-none print:border-none print:max-w-none print:w-full print:rounded-none print:overflow-visible">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-sm">طباعة مسير كشف الرواتب - {sheet.sheetNumber}</h2>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              sheet.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {sheet.status === 'approved' ? 'معتمد ومصروف' : 'مسودة قيد المراجعة'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة (A4)</span>
            </button>
            <button
              onClick={() => setSelectedPayrollSheetForPrint(null)}
              className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="p-6 sm:p-8 space-y-6 text-slate-800 text-sm print:p-4 print:space-y-4 font-sans" dir="rtl">
          
          {/* Header - يعتمد الهيدر الكامل المرفوع أو الترويسة القياسية */}
          <PrintHeader
            title="كشف مسير الرواتب والأجور الشهرية"
            subtitle="Monthly Payroll & Wages Statement"
            docNumber={sheet.sheetNumber}
            docDate={sheet.createdAt}
            badge="مسير رواتب رسمي"
            extraMeta={
              sheet.disbursedAt ? (
                <div className="text-emerald-700 font-bold">
                  <span>تاريخ الصرف: </span>
                  <span className="font-mono">{sheet.disbursedAt}</span>
                </div>
              ) : undefined
            }
          />

          {/* Sheet Metadata Banner */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">عنوان الكشف:</span>
              <span className="font-bold text-slate-900">{sheet.title}</span>
            </div>
            <div>
              <span className="text-slate-500 block">فترة الاحتساب:</span>
              <span className="font-bold text-slate-900">{sheet.period}</span>
            </div>
            <div>
              <span className="text-slate-500 block">الخزينة المحددة للصرف:</span>
              <span className="font-bold text-slate-900">{sheet.treasuryName || 'الصندوق النقدي'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">رقم سند الصرف المحاسبي:</span>
              <span className="font-mono font-bold text-slate-900">{sheet.voucherNumber || 'قيد المسودة'}</span>
            </div>
          </div>

          {/* Employee Breakdown Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                  <th className="p-2 border border-slate-300 text-center w-8">#</th>
                  <th className="p-2 border border-slate-300">اسم الموظف</th>
                  <th className="p-2 border border-slate-300">المسمى الوظيفي</th>
                  <th className="p-2 border border-slate-300 text-center">نظام الراتب</th>
                  <th className="p-2 border border-slate-300 text-center">الأساسي</th>
                  <th className="p-2 border border-slate-300 text-center">البدلات</th>
                  <th className="p-2 border border-slate-300 text-center">الحوافز</th>
                  <th className="p-2 border border-slate-300 text-center text-rose-700">الخصومات</th>
                  <th className="p-2 border border-slate-300 text-center text-amber-700">السلف المستقطعة</th>
                  <th className="p-2 border border-slate-300 text-center font-black bg-slate-200">الصافي المستحق</th>
                  <th className="p-2 border border-slate-300 text-center min-w-[90px]">توقيع المستلم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sheet.items.map((item, idx) => {
                  const salaryLabel = item.salaryType === 'monthly' ? 'شهري' : item.salaryType === 'weekly' ? 'أسبوعي' : 'يومي';
                  return (
                    <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="p-2 border border-slate-300 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="p-2 border border-slate-300 font-bold text-slate-900">{item.employeeName}</td>
                      <td className="p-2 border border-slate-300 text-slate-600">{item.jobTitle}</td>
                      <td className="p-2 border border-slate-300 text-center text-slate-600">{salaryLabel}</td>
                      <td className="p-2 border border-slate-300 text-center font-mono">{item.basicSalary.toLocaleString()}</td>
                      <td className="p-2 border border-slate-300 text-center font-mono">{item.allowances.toLocaleString()}</td>
                      <td className="p-2 border border-slate-300 text-center font-mono text-emerald-700 font-bold">
                        {item.incentives > 0 ? `+${item.incentives.toLocaleString()}` : '0'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono text-rose-600">
                        {item.deductions > 0 ? `-${item.deductions.toLocaleString()}` : '0'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono text-amber-700">
                        {item.advancesDeducted > 0 ? `-${item.advancesDeducted.toLocaleString()}` : '0'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono font-black text-slate-900 bg-slate-100 text-sm">
                        {item.netSalary.toLocaleString()} ر.س
                      </td>
                      <td className="p-2 border border-slate-300 text-center">
                        <div className="h-6 border-b border-dotted border-slate-400"></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 text-slate-900 font-black border-t-2 border-slate-400 text-xs">
                  <td colSpan={4} className="p-2.5 border border-slate-300 text-center">
                    المجموع الكلي ({sheet.employeesCount} موظف)
                  </td>
                  <td className="p-2.5 border border-slate-300 text-center font-mono">{sheet.totalBasic.toLocaleString()}</td>
                  <td className="p-2.5 border border-slate-300 text-center font-mono">{sheet.totalAllowances.toLocaleString()}</td>
                  <td className="p-2.5 border border-slate-300 text-center font-mono text-emerald-700">+{sheet.totalIncentives.toLocaleString()}</td>
                  <td className="p-2.5 border border-slate-300 text-center font-mono text-rose-700">-{sheet.totalDeductions.toLocaleString()}</td>
                  <td className="p-2.5 border border-slate-300 text-center font-mono text-amber-800">-{sheet.totalAdvances.toLocaleString()}</td>
                  <td className="p-2.5 border border-slate-300 text-center font-mono text-base font-black text-blue-900 bg-blue-100">
                    {sheet.totalNet.toLocaleString()} ر.س
                  </td>
                  <td className="p-2.5 border border-slate-300"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Disbursement Details & Signatures */}
          <ReportSignatures rightLabel="المحاسب المسؤول" centerLabel="أمين الصندوق / الخزينة" leftLabel="المدير العام والختم الرسمي" />
        </div>
      </div>
    </div>
  );
};
