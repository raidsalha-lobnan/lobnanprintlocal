import React from 'react';
import { PrintHeader } from './common/PrintHeader';
import { OfficialStamp } from './common/OfficialStamp';
import { formatDateDisplay } from '../utils/dateUtils';
import { displayDimension, hasVisibleInvoiceDimensions } from '../utils/invoiceDimensions';
import { tafqeet } from '../utils/tafqeet';
import type { EmployeeStatementResult } from '../utils/statementGenerator';
import type { BusinessSettings } from '../types';

interface Props {
  statement: EmployeeStatementResult;
  settings: BusinessSettings;
  fromDate: string;
  toDate: string;
  showItemDetails?: boolean;
  filterType?: 'all' | 'debit' | 'credit';
}

/**
 * Shared customer-style A4 document for employee statements.
 * Data remains the authoritative generateEmployeeStatement result;
 * plus is an entitlement to the employee, minus is a payment/advance/
 * deduction. It is not the supplier/customer debit-credit orientation.
 */
export const UnifiedEmployeeStatementDocument: React.FC<Props> = ({
  statement, settings, fromDate, toDate,
  showItemDetails = true, filterType = 'all'
}) => {
  const displayRows = statement.rows.filter(row => {
    if (filterType === 'credit') return row.entitlement > 0;
    if (filterType === 'debit') return row.advance + row.deduction + row.disbursement > 0;
    return true;
  });
  const number = (n: number) => Number(n || 0).toFixed(2);
  const balanceMeaning = statement.closingBalance > 0
    ? 'مستحق للموظف'
    : statement.closingBalance < 0 ? 'مستحق على الموظف' : 'خالص';
  const summary = [
    ['رصيد سابق', statement.openingBalance],
    ['إجمالي الاستحقاقات (+)', statement.totalEntitlements],
    ['إجمالي المنصرف والخصم (-)', statement.totalPaid],
    ['الرصيد الختامي', Math.abs(statement.closingBalance)]
  ] as const;
  return (
    <>
      <PrintHeader />
      <div className="border-b-2 border-slate-900 pb-2">
        <div className="statement-document-heading text-center font-bold text-base mb-1.5 mt-2 text-slate-900 leading-relaxed">
          كشف حساب موظف تفصيلي: <span className="text-purple-900">{statement.employee.name}</span>
          <div className="text-xs text-slate-600 mt-0.5 font-semibold">
            من تاريخ: <span className="font-mono">{fromDate || 'بداية العمل'}</span>{' '}
            إلى تاريخ: <span className="font-mono">{toDate || 'تاريخ اليوم'}</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700 border-b border-slate-200 py-1.5">
          <span>رقم الموظف: <strong className="font-mono">{statement.employee.code || '—'}</strong></span>
          <span>المسمى الوظيفي: <strong>{statement.employee.jobTitle || statement.employee.position || '—'}</strong></span>
          <span>عدد الحركات: <strong>{statement.rows.length}</strong></span>
        </div>

        <div className="border border-slate-400 rounded-md overflow-x-auto shadow-2xs min-h-[440px] print:min-h-0 flex flex-col justify-between bg-white print:block print:overflow-visible print:border-none print:shadow-none">
          <table className="w-full text-right report-table border-collapse h-full">
            <thead>
              <tr className="bg-slate-800 text-white font-bold border-b border-slate-900 print:bg-slate-200 print:text-slate-900">
                <th className="w-8 min-w-8 text-center border-l border-slate-600 print:border-slate-400">م</th>
                <th className="w-24 min-w-24 text-center border-l border-slate-600 print:border-slate-400">التاريخ</th>
                <th className="border-l border-slate-600 print:border-slate-400">البيان والشرح والتفاصيل الكاملة</th>
                <th className="w-[75px] min-w-[75px] text-center bg-purple-950/40 print:bg-purple-50 border-l border-slate-600 print:border-slate-400">استحقاق (+)</th>
                <th className="w-[75px] min-w-[75px] text-center bg-rose-950/40 print:bg-rose-50 border-l border-slate-600 print:border-slate-400">منصرف / خصم (-)</th>
                <th className="w-[80px] min-w-[80px] text-center bg-slate-700 print:bg-slate-300">الرصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              <tr className="bg-slate-100/90 font-bold border-b border-slate-300">
                <td className="text-center border-l border-slate-300">—</td>
                <td className="text-center border-l border-slate-300">{fromDate || 'الرصيد السابق'}</td>
                <td className="border-l border-slate-300 font-sans">رصيد أول الفترة / الرصيد المرحّل من الفترة السابقة</td>
                <td className="text-left border-l border-slate-300 whitespace-nowrap">{statement.openingBalance > 0 ? number(statement.openingBalance) : '—'}</td>
                <td className="text-left border-l border-slate-300 whitespace-nowrap">{statement.openingBalance < 0 ? number(-statement.openingBalance) : '—'}</td>
                <td className="text-left bg-slate-100 whitespace-nowrap">{number(statement.openingBalance)}</td>
              </tr>
              {displayRows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center font-sans text-slate-500">لا توجد حركات للموظف في الفترة المحددة.</td></tr>
              )}
              {displayRows.map((row, index) => {
                const paid = row.advance + row.deduction + row.disbursement;
                const notes = [row.description, row.notes && row.notes !== row.description ? row.notes : '']
                  .filter(Boolean).join(' — ');
                return (
                  <React.Fragment key={row.id + '-' + index}>
                    <tr className={index % 2 ? 'bg-slate-50/40' : 'bg-white'}>
                      <td className="text-center text-slate-500 font-sans border-l border-slate-300">{index + 1}</td>
                      <td className="text-center text-slate-700 whitespace-nowrap border-l border-slate-300">{formatDateDisplay(row.date)}</td>
                      <td className="font-sans text-slate-800 border-l border-slate-300">
                        <div className="flex flex-wrap items-center gap-1 leading-tight">
                          <strong className="text-slate-900">{row.typeLabel}</strong>
                          {row.referenceNumber && <span className="font-mono font-semibold text-slate-700">— {row.referenceNumber}</span>}
                          {notes && <span className="text-slate-600">— {notes}</span>}
                        </div>
                        {(row.period || row.paymentMethod) && (
                          <div className="text-[10px] text-slate-500 mt-1">
                            {row.period && <span>الفترة: {row.period} </span>}
                            {row.paymentMethod && <span>طريقة الصرف: {row.paymentMethod === 'cash' ? 'نقدًا' : 'بنكي / محفظة'}</span>}
                          </div>
                        )}
                      </td>
                      <td className="text-left font-bold text-purple-800 border-l border-slate-300 whitespace-nowrap">{row.entitlement ? number(row.entitlement) : '—'}</td>
                      <td className="text-left font-bold text-rose-800 border-l border-slate-300 whitespace-nowrap">{paid ? number(paid) : '—'}</td>
                      <td className="text-left font-black bg-slate-50 whitespace-nowrap">{number(row.runningBalance)}</td>
                    </tr>
                    {showItemDetails && !!row.items?.length && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={6} className="p-1.5 print:p-1">
                          <div className="text-[10px] font-semibold text-slate-700 mb-1">تفاصيل الأصناف / المسحوبات — {row.referenceNumber || row.typeLabel}</div>
                          <table className="w-full border-collapse text-[10px] border border-slate-300">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="border border-slate-300 p-1">الصنف والملاحظات</th>
                                <th className="border border-slate-300 p-1">الطول</th>
                                <th className="border border-slate-300 p-1">العرض</th>
                                <th className="border border-slate-300 p-1">العدد</th>
                                <th className="border border-slate-300 p-1">الكمية</th>
                                <th className="border border-slate-300 p-1">السعر</th>
                                <th className="border border-slate-300 p-1">الإجمالي</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.items.map((item, ii) => (
                                <tr key={ii}>
                                  <td className="border border-slate-300 p-1">
                                    <b>{item.itemName}</b>{item.notes ? ' — ' + item.notes : ''}
                                  </td>
                                  <td className="border border-slate-300 p-1 text-center">{displayDimension(item.length, hasVisibleInvoiceDimensions(item))}</td>
                                  <td className="border border-slate-300 p-1 text-center">{displayDimension(item.width, hasVisibleInvoiceDimensions(item))}</td>
                                  <td className="border border-slate-300 p-1 text-center">{hasVisibleInvoiceDimensions(item) ? item.count || 1 : '—'}</td>
                                  <td className="border border-slate-300 p-1 text-center">{item.quantity}</td>
                                  <td className="border border-slate-300 p-1 text-left">{number(item.unitPrice)}</td>
                                  <td className="border border-slate-300 p-1 text-left font-bold">{number(item.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t border-slate-300">
                <td colSpan={3} className="text-left font-sans">إجمالي الحركات في الفترة:</td>
                <td className="text-left font-mono text-purple-800">{number(statement.totalEntitlements)}</td>
                <td className="text-left font-mono text-rose-800">{number(statement.totalPaid)}</td>
                <td className="text-left font-mono font-black">{number(statement.closingBalance)} {settings.currency}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 shadow-2xs print:border-slate-300">
          <div className="grid grid-cols-4 gap-1.5 text-[10px]">
            {summary.map(([label,value],i) => (
              <div key={label} className="bg-white border border-slate-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5">
                <span className="font-bold text-slate-700 whitespace-nowrap">{label}:</span>
                <span className={'font-black font-mono text-[11px] whitespace-nowrap ' +
                  (i === 1 ? 'text-purple-800' : i === 2 ? 'text-rose-800' : 'text-slate-900')}>
                  {number(value)} <span className="text-[9px]">{settings.currency}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="bg-white p-1.5 rounded border border-slate-200">
            <div className="flex items-center justify-between text-[10.5px] mb-1">
              <span className="font-bold text-slate-700">الرصيد الختامي — {balanceMeaning}:</span>
              <strong className="font-mono">{number(Math.abs(statement.closingBalance))} {settings.currency}</strong>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded p-1 text-[10.5px] font-semibold">
              {tafqeet(Math.abs(statement.closingBalance),'شيكل','أغورة')}
            </div>
          </div>
        </div>
        <div className="pt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-[10px] mt-4">
          <div className="flex flex-col items-center gap-3">
            <strong>إعداد وتدقيق المحاسب</strong>
            <div className="border-b border-dashed border-slate-400 w-28 mt-5" />
            <span className="text-slate-400">التوقيع والتاريخ</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <strong>اطلاع وتوقيع الموظف</strong>
            <div className="border-b border-dashed border-slate-400 w-28 mt-5" />
            <span className="text-slate-400">{statement.employee.name}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <strong>اعتماد الإدارة / الختم</strong>
            {settings.stampUrl ? <OfficialStamp size="3.5cm" /> :
              <div className="border-b border-dashed border-slate-400 w-28 mt-7" />}
          </div>
        </div>
      </div>
    </>
  );
};
