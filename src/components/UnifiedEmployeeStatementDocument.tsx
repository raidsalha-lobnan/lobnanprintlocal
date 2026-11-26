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
    ['استحقاقات', statement.totalEntitlements],
    ['خصومات', statement.totalPaid],
    ['رصيد', Math.abs(statement.closingBalance)]
  ] as const;
  return (
    <>
      <style>{`
        /* Highlight the entire sales invoice heading, on screen and A4 print. */
        .employee-sales-invoice-heading,
        .employee-sales-invoice-heading > td {
          background-color: #173b50 !important;
          color: #ffffff !important;
          font-weight: 700;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .employee-sales-invoice-heading * {
          color: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .employee-sales-invoice-heading > td {
          border-color: #68829a !important;
        }
        @media print {
          .employee-sales-invoice-heading { break-inside: avoid; }
        }
      `}</style>
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

        <div className="border border-slate-400 rounded-md overflow-x-auto shadow-2xs min-h-0 bg-white print:block print:overflow-visible print:border-none print:shadow-none">
          <table className="w-full text-right report-table border-collapse">
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
                    <tr className={row.type === 'invoice' ? 'employee-sales-invoice-heading' : index % 2 ? 'bg-slate-50/40' : 'bg-white'}>
                      <td className="text-center text-slate-500 font-sans border-l border-slate-300">{index + 1}</td>
                      <td className="text-center text-slate-700 whitespace-nowrap border-l border-slate-300">{formatDateDisplay(row.date)}</td>
                      <td className="font-sans text-slate-800 border-l border-slate-300">
                        <div className="flex flex-wrap items-center gap-1 leading-tight">
                          <strong className="text-slate-900">{row.typeLabel}</strong>
                          {row.referenceNumber && <span className="font-semibold text-slate-700">— <bdi dir="ltr" className="inline-block font-mono">{row.referenceNumber}</bdi></span>}
                          {notes && <span className="text-slate-600">— <bdi dir="auto">{notes}</bdi></span>}
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
                      <tr className="bg-white print:bg-white print-allow-break">
                        <td colSpan={6} className="p-0 border-b border-slate-300 print-allow-break report-subtable-cell">
                          <div className="w-full bg-white print:border-none print:block">
                            <table className="w-full text-right report-sub-table border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                                  <th className="text-center w-8 border-l border-slate-200">م</th>
                                  <th className="border-l border-slate-200">الصنف والبيان</th>
                                  <th className="text-center w-12 border-l border-slate-200">الطول</th>
                                  <th className="text-center w-12 border-l border-slate-200">العرض</th>
                                  <th className="text-center w-10 border-l border-slate-200">العدد</th>
                                  <th className="text-center w-12 border-l border-slate-200">الكمية</th>
                                  <th className="text-left w-16 border-l border-slate-200">السعر</th>
                                  <th className="text-left w-18">الإجمالي</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {row.items.map((item, ii) => (
                                  <tr key={ii}>
                                    <td className="text-center border-l border-slate-200 font-mono">{ii + 1}</td>
                                    <td className="border-l border-slate-200">
                                      <strong><bdi dir="auto">{item.itemName}</bdi></strong>
                                      {(item.notes || item.description) && <bdi dir="auto" className="font-medium text-slate-600"> / {item.notes || item.description}</bdi>}
                                    </td>
                                    <td className="text-center font-mono border-l border-slate-200">{displayDimension(item.length, hasVisibleInvoiceDimensions(item))}</td>
                                    <td className="text-center font-mono border-l border-slate-200">{displayDimension(item.width, hasVisibleInvoiceDimensions(item))}</td>
                                    <td className="text-center font-mono border-l border-slate-200">{displayDimension(item.count, hasVisibleInvoiceDimensions(item))}</td>
                                    <td className="text-center font-mono border-l border-slate-200 font-bold">{item.quantity}</td>
                                    <td className="text-left font-mono border-l border-slate-200">{number(item.unitPrice)}</td>
                                    <td className="text-left font-mono font-bold">{number(item.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {row.type === 'invoice' && (
                              <div className="invoice-financial-strip grid grid-cols-6 items-center gap-x-1 border-t border-slate-300 bg-white px-1 py-1 font-bold text-slate-900" dir="rtl">
                                {([
                                  ['قبل الخصم', row.subtotal ?? row.items.reduce((total,item)=>total+item.total,0)],
                                  ['الخصم', row.discountTotal ?? 0],
                                  ['الضريبة', row.taxAmount ?? 0],
                                  ['الإجمالي', row.totalAmount ?? row.items.reduce((total,item)=>total+item.total,0)],
                                  ['المدفوع', row.paidAmount ?? 0],
                                  ['المتبقي', row.remainingAmount ?? ((row.totalAmount ?? 0)-(row.paidAmount ?? 0))]
                                ] as [string,number][]).map(([label,amount]) => (
                                  <span key={label} className="inline-flex items-center gap-1 whitespace-nowrap text-[9px]">
                                    <span className="text-slate-600">{label}:</span>
                                    <span className="font-mono">{number(amount)}</span>
                                  </span>
                                ))}
                                {row.invoiceCurrency && row.invoiceCurrency !== 'ILS' && (
                                  <span className="col-span-6 text-[9px] text-slate-500">قيم الفاتورة بعملة {row.invoiceCurrency}، بينما رصيد الموظف محتسب بالعملة الأساسية ₪</span>
                                )}
                                {row.additionalCharges !== undefined && row.additionalCharges > 0 && (
                                  <span className="col-span-6 text-[9px] text-slate-600">إضافات الفاتورة: {number(row.additionalCharges)}</span>
                                )}
                                {row.invoiceNotes && (
                                  <span className="col-span-6 text-[9px] font-normal text-slate-700">ملاحظات الفاتورة: {row.invoiceNotes}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {showItemDetails && row.payrollDetails && (
                      <tr className="bg-white print:bg-white print-allow-break">
                        <td colSpan={6} className="p-0 border-b border-slate-300 report-subtable-cell">
                          <table className="w-full text-right report-sub-table border-collapse">
                            <thead>
                              <tr className="bg-slate-100 text-slate-800 font-bold">
                                <th className="w-8 text-center border-l border-slate-200">م</th>
                                <th className="border-l border-slate-200">تفاصيل مسير الراتب المعتمد</th>
                                <th className="text-left w-24 border-l border-slate-200">استحقاق (+)</th>
                                <th className="text-left w-24 border-l border-slate-200">استقطاع / صرف (-)</th>
                                <th className="text-right">البيان</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-[10px]">
                              {([
                                ['الراتب الأساسي',row.payrollDetails.basicSalary,0,'استحقاق معتمد'],
                                ['البدلات',row.payrollDetails.allowances,0,'بدلات الموظف'],
                                ['الحوافز والمكافآت',row.payrollDetails.incentives,0,'حوافز معتمدة ضمن المسير'],
                                ['الخصومات والجزاءات',0,row.payrollDetails.deductions,'استقطاعات مسير الراتب'],
                                ['صرف صافي الراتب',0,row.payrollDetails.netSalary,'مبلغ الراتب المصروف فعليًا'],
                                ['السلف المستقطعة سابقًا',0,0,
                                  'للعلم فقط: '+number(row.payrollDetails.advancesDeducted)+
                                  ' — السلفة سُجلت عند صرفها، فلا تُخصم من رصيد الموظف مرة ثانية']
                              ] as [string,number,number,string][]).filter(([label,plus,minus]) =>
                                plus!==0 || minus!==0 || label==='الراتب الأساسي' ||
                                (label==='السلف المستقطعة سابقًا' && row.payrollDetails!.advancesDeducted>0)
                              ).map(([label,plus,minus,description],ii) => (
                                <tr key={label}>
                                  <td className="text-center font-mono border-l border-slate-200">{ii+1}</td>
                                  <td className="border-l border-slate-200 font-bold">{label}</td>
                                  <td className="text-left font-mono border-l border-slate-200 text-purple-800">{plus ? number(plus) : '—'}</td>
                                  <td className="text-left font-mono border-l border-slate-200 text-rose-800">{minus ? number(minus) : '—'}</td>
                                  <td className="text-slate-600 font-sans">{description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="invoice-financial-strip bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between gap-x-3 gap-y-1 p-1.5 text-[10px] font-bold">
                            <span>فترة المسير: {row.payrollDetails.period || '—'}</span>
                            <span>إجمالي المستحقات: {number(row.payrollDetails.basicSalary+row.payrollDetails.allowances+row.payrollDetails.incentives)} {settings.currency}</span>
                            <span>إجمالي الخصومات: {number(row.payrollDetails.deductions)} {settings.currency}</span>
                            <span>سلف سابقة مقتطعة: {number(row.payrollDetails.advancesDeducted)} {settings.currency}</span>
                            <span>صافي المصروف: {number(row.payrollDetails.netSalary)} {settings.currency}</span>
                          </div>
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
