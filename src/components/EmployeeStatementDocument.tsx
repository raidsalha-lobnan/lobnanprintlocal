import React from 'react';
import { formatNumber } from '../utils/numberFormat';
import { formatDateDisplay } from '../utils/dateUtils';
import { tafqeet } from '../utils/tafqeet';
import { PrintHeader } from './common/PrintHeader';
import { OfficialStamp } from './common/OfficialStamp';
import type { BusinessSettings } from '../types';
import type { EmployeeStatementResult, EmployeeStatementRow } from '../utils/statementGenerator';

interface EmployeeStatementDocumentProps {
  statement: EmployeeStatementResult;
  settings: BusinessSettings;
  fromDate: string;
  toDate: string;
  filterType?: 'all' | 'debit' | 'credit';
  showItemDetails?: boolean;
}

const debit = (row: EmployeeStatementRow) => Number((row.advance + row.deduction + row.disbursement).toFixed(2));
const fmt = (amount: number) => formatNumber(amount, 2);
const balanceLabel = (value: number) => value > 0 ? 'مستحق للموظف' : value < 0 ? 'مستحق على الموظف' : 'خالٍ من المستحقات';

/**
 * Same official print hierarchy as the customer/supplier statement:
 * letterhead, party identity and date range, six-column running ledger,
 * four-value closing summary, amount in words and sign-off.
 * Employee-specific credits are salary/bonus/entitlements; debits are
 * advances, deductions, withdrawals and salary disbursements.
 */
export const EmployeeStatementDocument: React.FC<EmployeeStatementDocumentProps> = ({
  statement, settings, fromDate, toDate, filterType = 'all', showItemDetails = true
}) => {
  const rows = statement.rows.filter(row =>
    filterType === 'credit' ? row.entitlement > 0 :
    filterType === 'debit' ? debit(row) > 0 : true
  );
  const closing = statement.closingBalance;
  const balanceWords = tafqeet(Math.abs(closing), 'شيكل', 'أغورة');
  return (
    <div className="space-y-3" dir="rtl">
      <PrintHeader />
      <div className="border-b-2 border-slate-900 pb-2">
        <h2 className="statement-document-heading text-center font-bold text-base mb-1.5 mt-2 text-slate-900 leading-relaxed">
          كشف حساب موظف تفصيلي: <span className="text-blue-900">{statement.employee.name}</span>
        </h2>
        <div className="text-xs font-semibold text-slate-600 text-center">
          من تاريخ: <span className="font-mono">{fromDate || 'بداية العمل'}</span>
          {' '} إلى تاريخ: <span className="font-mono">{toDate || 'تاريخ اليوم'}</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-[10.5px] font-semibold text-slate-600 mt-1">
          {statement.employee.code && <span>رقم الموظف: <b className="font-mono">{statement.employee.code}</b></span>}
          {statement.employee.jobTitle && <span>الوظيفة: {statement.employee.jobTitle}</span>}
          {statement.employee.phone && <span>الهاتف: <b className="font-mono">{statement.employee.phone}</b></span>}
        </div>
      </div>

      <div className="border border-slate-400 rounded-md overflow-x-auto shadow-2xs min-h-[440px] print:min-h-0 print:block print:overflow-visible print:border-none print:shadow-none bg-white">
        <table className="w-full text-right report-table border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white font-bold border-b border-slate-900 print:bg-slate-200 print:text-slate-900">
              <th className="w-8 text-center border-l border-slate-600 print:border-slate-400">م</th>
              <th className="w-24 text-center border-l border-slate-600 print:border-slate-400">التاريخ</th>
              <th className="border-l border-slate-600 print:border-slate-400">البيان والشرح والتفاصيل الكاملة</th>
              <th className="w-[76px] text-center border-l border-slate-600 print:border-slate-400 whitespace-nowrap">استحقاق (+)</th>
              <th className="w-[76px] text-center border-l border-slate-600 print:border-slate-400 whitespace-nowrap">منصرف (-)</th>
              <th className="w-[86px] text-center print:bg-slate-300 whitespace-nowrap">الرصيد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr className="bg-slate-100 font-bold border-b border-slate-300 text-slate-800">
              <td className="text-center border-l border-slate-300">—</td>
              <td className="text-center border-l border-slate-300">{fromDate || 'سابق'}</td>
              <td className="border-l border-slate-300">رصيد أول المدة — ما قبل بداية الفترة المحددة</td>
              <td className="font-mono text-left border-l border-slate-300">{statement.openingBalance > 0 ? fmt(statement.openingBalance) : '—'}</td>
              <td className="font-mono text-left border-l border-slate-300">{statement.openingBalance < 0 ? fmt(Math.abs(statement.openingBalance)) : '—'}</td>
              <td className="font-mono text-left font-black">{fmt(statement.openingBalance)}</td>
            </tr>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500 font-semibold">لا توجد حركات للموظف ضمن الفترة والتصفية المحددتين.</td></tr>
            ) : rows.map((row, index) => (
              <React.Fragment key={row.id + '-' + index}>
                <tr className={index % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                  <td className="text-center border-l border-slate-300 text-slate-500">{index + 1}</td>
                  <td className="text-center font-mono border-l border-slate-300 whitespace-nowrap">{formatDateDisplay(row.date)}</td>
                  <td className="border-l border-slate-300">
                    <div className="flex flex-wrap items-center gap-1 leading-tight">
                      <b className="text-slate-900">{row.typeLabel || 'حركة مالية'}</b>
                      {row.referenceNumber && <><span className="text-slate-400">-</span><b className="font-mono text-slate-800">{row.referenceNumber}</b></>}
                      {row.description && <><span className="text-slate-400">-</span><span className="text-slate-700">{row.description}</span></>}
                    </div>
                    {(row.period || row.paymentMethod || (row.notes && row.notes !== row.description)) && (
                      <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                        {row.period && <span>فترة الاستحقاق: {row.period}</span>}
                        {row.paymentMethod && <span>طريقة الصرف: {row.paymentMethod === 'cash' ? 'نقدًا' : 'بنكي / تحويل'}</span>}
                        {row.notes && row.notes !== row.description && <span>ملاحظة: {row.notes}</span>}
                      </div>
                    )}
                    {(row.advance > 0 || row.deduction > 0 || row.disbursement > 0) && (
                      <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                        {row.advance > 0 && <span>سلفة: {fmt(row.advance)}</span>}
                        {row.deduction > 0 && <span>خصم: {fmt(row.deduction)}</span>}
                        {row.disbursement > 0 && <span>منصرف / مسحوبات: {fmt(row.disbursement)}</span>}
                      </div>
                    )}
                  </td>
                  <td className="text-left font-mono font-bold text-emerald-800 border-l border-slate-300 whitespace-nowrap">{row.entitlement > 0 ? fmt(row.entitlement) : '—'}</td>
                  <td className="text-left font-mono font-bold text-rose-800 border-l border-slate-300 whitespace-nowrap">{debit(row) > 0 ? fmt(debit(row)) : '—'}</td>
                  <td className="text-left font-mono font-black text-slate-900 bg-slate-100/60 whitespace-nowrap">{fmt(row.runningBalance)}</td>
                </tr>
                {showItemDetails && !!row.items?.length && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={6} className="py-1.5 px-2">
                      <div className="font-sans text-[10px] font-bold mb-1">تفاصيل الأصناف المرتبطة بالحركة:</div>
                      <table className="w-full border-collapse text-[10px]">
                        <thead><tr className="bg-slate-100">
                          <th className="border border-slate-200 text-right">الصنف / الملاحظات</th>
                          <th className="border border-slate-200 text-center">الكمية</th>
                          <th className="border border-slate-200 text-center">السعر</th>
                          <th className="border border-slate-200 text-center">الإجمالي</th>
                        </tr></thead>
                        <tbody>{row.items.map((it, j) => (
                          <tr key={j}>
                            <td className="border border-slate-200">{it.itemName}{it.notes ? ' — ' + it.notes : it.description ? ' — ' + it.description : ''}</td>
                            <td className="border border-slate-200 text-center font-mono">{it.quantity}</td>
                            <td className="border border-slate-200 text-center font-mono">{fmt(it.unitPrice)}</td>
                            <td className="border border-slate-200 text-center font-mono">{fmt(it.total)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold border-t border-slate-300">
              <td colSpan={3} className="text-left">الإجمالي العام للحركات خلال الفترة:</td>
              <td className="text-left font-mono text-emerald-800">{fmt(statement.totalDue)}</td>
              <td className="text-left font-mono text-rose-800">{fmt(statement.totalPaid)}</td>
              <td className="text-left font-mono font-black">{fmt(closing)} {settings.currency}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 print:border-slate-300">
        <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-1.5 text-[10px]">
          {[
            ['رصيد سابق', statement.openingBalance],
            ['إجمالي المستحقات', statement.totalDue],
            ['إجمالي المنصرف والخصومات', statement.totalPaid],
            [balanceLabel(closing), Math.abs(closing)]
          ].map(([label, amount], i) => (
            <div key={i} className="bg-white border border-slate-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5">
              <span className="font-bold text-slate-800">{label}:</span>
              <span className="font-mono font-black text-slate-900 whitespace-nowrap">{fmt(Number(amount))} {settings.currency}</span>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-slate-600 flex flex-wrap gap-x-4">
          <span>السلف: {fmt(statement.totalAdvances)}</span>
          <span>الخصومات: {fmt(statement.totalDeductions)}</span>
          <span>المصروفات والمسحوبات: {fmt(statement.totalDisbursements)}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded p-1.5 text-[10.5px]">
          <div className="flex justify-between gap-2 font-bold">
            <span>المبلغ كتابة وتفقيطًا:</span>
            <span>{balanceLabel(closing)}: {fmt(Math.abs(closing))} {settings.currency}</span>
          </div>
          <p className="mt-1 bg-slate-50 border border-slate-200 rounded p-1 font-semibold">{balanceWords}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-[10px] border-t border-slate-300 pt-3 mt-3">
        <div className="flex flex-col items-center gap-2">
          <b>إعداد ومراجعة المحاسب</b>
          <div className="border-b border-dashed border-slate-400 w-28 mt-5" />
          <span>التوقيع والتاريخ</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <b>إقرار الموظف بالمطابقة</b>
          <div className="border-b border-dashed border-slate-400 w-28 mt-5" />
          <span>توقيع الموظف</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <b>اعتماد المنشأة</b>
          <div className="relative min-h-[3.5cm] flex items-center justify-center">
            {settings.stampUrl && <OfficialStamp size="3.5cm" />}
            {settings.signatureUrl && <img src={settings.signatureUrl} alt="التوقيع المعتمد" className="absolute bottom-1 left-1/2 -translate-x-1/2 max-w-[110px] max-h-12 object-contain mix-blend-multiply" />}
          </div>
        </div>
      </div>
    </div>
  );
};
