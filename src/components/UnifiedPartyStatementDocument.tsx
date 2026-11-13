import React from 'react';
import { formatNumber } from '../utils/numberFormat';
import { hasVisibleInvoiceDimensions, displayDimension } from '../utils/invoiceDimensions';
import { formatDateDisplay } from '../utils/dateUtils';
import { tafqeet } from '../utils/tafqeet';
import { PrintHeader } from './common/PrintHeader';
import { OfficialStamp } from './common/OfficialStamp';
import { Image as ImageIcon, Eye } from 'lucide-react';
import type { StatementResult } from '../utils/statementGenerator';
import type { BusinessSettings } from '../types';

const parseThumbnails = (val?: string): string[] => {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith('[')) {
    try { const parsed = JSON.parse(trimmed); if (Array.isArray(parsed)) return parsed; } catch {}
  }
  return [val];
};

export interface UnifiedPartyStatementProps {
  partyStatement: StatementResult;
  isCustomer: boolean;
  settings: BusinessSettings;
  clientDisplayName: string;
  fromDate: string;
  toDate: string;
  showItemDetails: boolean;
  showImageThumbnailsInStatement: boolean;
  filterType?: 'all' | 'debit' | 'credit';
  setPreviewModalImage: (image: { url: string; name: string }) => void;
}

/** The authoritative financial statement layout shared by Customers and Reports. */
export const UnifiedPartyStatementDocument: React.FC<UnifiedPartyStatementProps> = ({
  partyStatement, isCustomer, settings, clientDisplayName, fromDate, toDate,
  showItemDetails, showImageThumbnailsInStatement, setPreviewModalImage, filterType = 'all',
}) => {
  const partyTafqeet = tafqeet(partyStatement.closingBalance, 'شيكل', 'أغورة');
  const displayedPartyRows = partyStatement.rows.filter(row =>
    filterType === 'debit' ? row.debit > 0 : filterType === 'credit' ? row.credit > 0 : true
  );
  return (
    <>
      <PrintHeader />
      <div className="border-b-2 border-slate-900 pb-2">
        <div className="statement-document-heading text-center font-bold text-base mb-1.5 mt-2 text-slate-900 leading-relaxed">
          {isCustomer ? 'كشف حساب عميل تفصيلي:' : 'كشف حساب مورد تفصيلي:'}{' '}
          <span className={isCustomer ? 'text-blue-900' : 'text-rose-900'}>{clientDisplayName}</span>
          <div className="text-xs text-slate-600 mt-0.5 font-semibold">
            من تاريخ: <span className="font-mono">{fromDate || 'بداية التعامل'}</span>{' '}
            إلى تاريخ: <span className="font-mono">{toDate || 'تاريخ اليوم'}</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">
              
              {/* Summary cards are not displayed on the detailed customer statement. */}
              {!isCustomer && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-semibold block">رصيد أول المدة / سابق:</span>
                  <span className="text-xs font-black font-mono text-slate-800">
                    {formatNumber(partyStatement.openingBalance, 2)} {settings.currency}
                  </span>
                </div>

                <div className="bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/80">
                  <span className="text-[10px] text-emerald-700 font-semibold block">
                    {isCustomer ? 'إجمالي السحوبات (مدين):' : 'إجمالي التوريدات (دائن):'}
                  </span>
                  <span className="text-xs font-black font-mono text-emerald-800">
                    {formatNumber(isCustomer ? partyStatement.totalWithdrawals : partyStatement.totalCredit, 2)} {settings.currency}
                  </span>
                </div>

                <div className="bg-blue-50/70 p-2 rounded-lg border border-blue-200/80">
                  <span className="text-[10px] text-blue-700 font-semibold block">
                    {isCustomer ? 'إجمالي المقبوضات (دائن):' : 'إجمالي الصرف والمسدد (مدين):'}
                  </span>
                  <span className="text-xs font-black font-mono text-blue-800">
                    {formatNumber(isCustomer ? partyStatement.totalReceipts : partyStatement.totalDebit, 2)} {settings.currency}
                  </span>
                </div>

                <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-200/80">
                  <span className="text-[10px] text-amber-700 font-semibold block">
                    {isCustomer ? 'إجمالي الصرف / مرتجعات:' : 'المردودات والمقبوضات:'}
                  </span>
                  <span className="text-xs font-black font-mono text-amber-800">
                    {formatNumber(isCustomer ? partyStatement.totalDisbursements : 0, 2)} {settings.currency}
                  </span>
                </div>

                <div className={`p-2 rounded-lg border ${
                  partyStatement.closingBalance > 0
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : partyStatement.closingBalance < 0
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  <span className="text-[10px] font-semibold block">
                    {isCustomer
                      ? (partyStatement.closingBalance > 0 ? 'صافي المتبقي على العميل (مدين):' : partyStatement.closingBalance < 0 ? 'رصيد دائن للعميل (دائن):' : 'الحساب متطابق (صفر):')
                      : (partyStatement.closingBalance > 0 ? 'صافي مستحق للمورد (دائن):' : partyStatement.closingBalance < 0 ? 'مبلغ مدين للمورد (مدين):' : 'الحساب خالص:')}
                  </span>
                  <span className="text-xs font-black font-mono">
                    {formatNumber(Math.abs(partyStatement.closingBalance), 2)} {settings.currency}
                  </span>
                </div>
              </div>
              )}

              {/* Detailed Transactions Table - Optimized Font 12 & A4 Width */}
              <div className="border border-slate-400 rounded-md overflow-x-auto shadow-2xs min-h-[440px] print:min-h-0 flex flex-col justify-between bg-white print:block print:overflow-visible print:border-none print:shadow-none">
                <table className="w-full text-right report-table border-collapse h-full">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold border-b border-slate-900 print:bg-slate-200 print:text-slate-900">
                      <th className="w-8 min-w-8 text-center border-l border-slate-600 print:border-slate-400">م</th>
                      <th className="w-24 min-w-24 text-center border-l border-slate-600 print:border-slate-400">التاريخ</th>
                      <th className="border-l border-slate-600 print:border-slate-400">البيان والشرح والتفاصيل الكاملة</th>
                      <th className="w-[66px] min-w-[66px] text-center bg-rose-950/40 print:bg-rose-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap">
                        مدين
                      </th>
                      <th className="w-[66px] min-w-[66px] text-center bg-emerald-950/40 print:bg-emerald-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap">
                        دائن
                      </th>
                      <th className="w-[78px] min-w-[78px] text-center bg-slate-700 print:bg-slate-300 whitespace-nowrap">
                        رصيد
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {/* Opening Balance Row */}
                    <tr className="bg-slate-100/90 font-bold border-b border-slate-300 text-slate-800">
                      <td className="text-center text-slate-400 font-sans border-l border-slate-300">-</td>
                      <td className="text-center text-slate-600 font-mono border-l border-slate-300">{fromDate || 'الرصيد السابق'}</td>
                      <td className="font-sans text-slate-700 font-semibold border-l border-slate-300">
                        رصيد سابق - رصيد الحساب الافتتاحي السابق (ما قبل تاريخ {fromDate || 'بدء الحركة'})
                      </td>
                      <td className="text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300">
                        {partyStatement.openingBalance > 0 ? partyStatement.openingBalance.toFixed(2) : '-'}
                      </td>
                      <td className="text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300">
                        {partyStatement.openingBalance < 0 ? Math.abs(partyStatement.openingBalance).toFixed(2) : '-'}
                      </td>
                      <td className="text-left font-black text-slate-950 bg-slate-100 font-mono whitespace-nowrap">
                        {partyStatement.openingBalance.toFixed(2)}
                      </td>
                    </tr>

                    {displayedPartyRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 font-sans font-bold">
                          لا توجد حركات مالية مسجلة خلال هذه الفترة المحددة.
                        </td>
                      </tr>
                    ) : (
                      displayedPartyRows.map((row, idx) => {
                        const typeLabel = row.typeLabel || (
                          row.type === 'invoice' ? 'فاتورة مبيعات' :
                          row.type === 'receipt' ? 'سند قبض' :
                          row.type === 'payment' ? 'سند صرف' :
                          row.type === 'purchase' ? 'فاتورة مشتريات' :
                          row.type === 'sales_return' ? 'مردودات مبيعات' :
                          row.type === 'purchase_return' ? 'مردودات مشتريات' :
                          row.type === 'clearance' ? 'مقاصة ديون' :
                          row.type === 'opening' ? 'رصيد سابق' : 'حركة مالية'
                        );

                        let note = '';
                        if (row.type === 'invoice') {
                          if (row.invoiceNotes) {
                            note = row.invoiceNotes;
                            if (row.subCustomerName) note += ` [الزبون الفرعي: ${row.subCustomerName}]`;
                          } else if (row.subCustomerName) {
                            note = `[الزبون الفرعي: ${row.subCustomerName}]`;
                          } else if (row.description) {
                            const cleaned = row.description
                              .replace(/^فاتورة مبيعات\s*(\([^)]*\))?\s*(-\s*)?/, '')
                              .replace(/-\s*إجمالي\s*[\d,.]+/gi, '')
                              .replace(/إجمالي\s*[\d,.]+/gi, '')
                              .replace(/-\s*total\s*[\d,.]+/gi, '')
                              .trim();
                            note = cleaned;
                          }
                        } else if (row.type === 'purchase') {
                          if (row.invoiceNotes) {
                            note = row.invoiceNotes;
                          } else if (row.description) {
                            const cleaned = row.description
                              .replace(/^فاتورة مشتريات\s*(\([^)]*\))?\s*(-\s*)?/, '')
                              .replace(/-\s*إجمالي\s*[\d,.]+/gi, '')
                              .replace(/إجمالي\s*[\d,.]+/gi, '')
                              .trim();
                            note = cleaned;
                          }
                        } else if (row.type === 'receipt') {
                          const rawNote = row.voucherNotes || row.description || '';
                          note = rawNote.replace(/^سند قبض\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, '');
                        } else if (row.type === 'payment') {
                          const rawNote = row.voucherNotes || row.description || '';
                          note = rawNote.replace(/^سند صرف\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, '');
                        } else if (row.type === 'sales_return' || row.type === 'purchase_return') {
                          const rawNote = row.invoiceNotes || row.voucherNotes || row.description || '';
                          note = rawNote.replace(/^مردودات (مبيعات|مشتريات)\s*(-\s*)?/, '');
                        } else {
                          note = row.description || '';
                        }
                        const trimmedNote = note.trim();

                        const hasReceiptExtraDetails = row.type === 'receipt' && Boolean(
                          row.chequeNumber || row.chequeBank || row.chequeDueDate || row.transferReference ||
                          (row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً')
                        );

                        const hasPaymentExtraDetails = row.type === 'payment' && Boolean(
                          row.chequeNumber || row.chequeBank || row.chequeDueDate || row.transferReference ||
                          (row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً')
                        );

                        return (
                        <React.Fragment key={`${row.id || 'party-row'}-${idx}`}>
                          <tr
                            className={row.type === 'invoice'
                              ? 'statement-invoice-title bg-[#e7eff9] print:bg-[#e7eff9] font-semibold'
                              : 'bg-white print:bg-white'}
                          >
                            <td className="text-center text-slate-400 font-sans align-middle border-l border-slate-300">{idx + 1}</td>
                            <td className="text-slate-700 whitespace-nowrap text-center align-middle font-mono border-l border-slate-300">{formatDateDisplay(row.date)}</td>
                            <td className="font-sans text-slate-800 align-middle space-y-1 border-l border-slate-300">
                              {/* سطر مدمج وموحد: نوع العملية - رقم الحركة - الملاحظات */}
                              <div className="font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-1">
                                <span className="text-slate-900 font-bold">{typeLabel}</span>
                                {row.referenceNumber && row.referenceNumber !== 'OPENING' && (
                                  <>
                                    <span className="text-slate-400 font-normal">-</span>
                                    <span className="font-mono font-bold text-slate-800">{row.referenceNumber}</span>
                                  </>
                                )}
                                {trimmedNote && (
                                  <>
                                    <span className="text-slate-400 font-normal">-</span>
                                    <span className="text-slate-700 font-medium">{trimmedNote}</span>
                                  </>
                                )}
                              </div>

                              {/* تفاصيل إضافية لسند القبض بدون تكرار السند أو رقمه أو المبلغ */}
                              {hasReceiptExtraDetails && (
                                <div className="mt-1 p-1 bg-blue-50/60 border border-blue-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً' && (
                                    <div>
                                      <span className="text-slate-500">طريقة القبض: </span>
                                      <span className="font-bold text-slate-800">{row.paymentMethodLabel}</span>
                                    </div>
                                  )}
                                  {row.chequeNumber && (
                                    <div>
                                      <span className="text-slate-500">رقم الشيك: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeNumber}</span>
                                    </div>
                                  )}
                                  {row.chequeBank && (
                                    <div>
                                      <span className="text-slate-500">البنك المسحوب عليه: </span>
                                      <span className="font-bold text-slate-800">{row.chequeBank}</span>
                                    </div>
                                  )}
                                  {row.chequeDueDate && (
                                    <div>
                                      <span className="text-slate-500">تاريخ الاستحقاق: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeDueDate}</span>
                                    </div>
                                  )}
                                  {row.transferReference && (
                                    <div>
                                      <span className="text-slate-500">رقم الحوالة: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.transferReference}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* تفاصيل المقاصة */}
                              {row.type === 'clearance' && (row.counterPartyName || row.reason) && (
                                <div className="mt-1 p-1 bg-teal-50/60 border border-teal-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-2">
                                  {row.counterPartyName && (
                                    <div>
                                      <span className="text-teal-900 font-bold">الطرف المقابل: </span>
                                      <span className="font-medium text-slate-800">{row.counterPartyName}</span>
                                    </div>
                                  )}
                                  {row.reason && (
                                    <div>
                                      <span className="text-teal-900 font-bold">السبب: </span>
                                      <span className="text-slate-700">{row.reason}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* تفاصيل إضافية لسند الصرف بدون تكرار السند أو رقمه أو المبلغ */}
                              {hasPaymentExtraDetails && (
                                <div className="mt-1 p-1 bg-amber-50/60 border border-amber-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {row.paymentMethodLabel && row.paymentMethodLabel !== 'نقداً' && (
                                    <div>
                                      <span className="text-slate-500">طريقة الصرف: </span>
                                      <span className="font-bold text-slate-800">{row.paymentMethodLabel}</span>
                                    </div>
                                  )}
                                  {row.chequeNumber && (
                                    <div>
                                      <span className="text-slate-500">رقم الشيك: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeNumber}</span>
                                    </div>
                                  )}
                                  {row.chequeBank && (
                                    <div>
                                      <span className="text-slate-500">البنك: </span>
                                      <span className="font-bold text-slate-800">{row.chequeBank}</span>
                                    </div>
                                  )}
                                  {row.chequeDueDate && (
                                    <div>
                                      <span className="text-slate-500">تاريخ الاستحقاق: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.chequeDueDate}</span>
                                    </div>
                                  )}
                                  {row.transferReference && (
                                    <div>
                                      <span className="text-slate-500">رقم الحوالة: </span>
                                      <span className="font-bold text-slate-900 font-mono">{row.transferReference}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="text-left font-bold text-rose-700 font-mono align-middle whitespace-nowrap border-l border-slate-300">
                              {row.debit > 0 ? row.debit.toFixed(2) : '-'}
                            </td>
                            <td className="text-left font-bold text-emerald-700 font-mono align-middle whitespace-nowrap border-l border-slate-300">
                              {row.credit > 0 ? row.credit.toFixed(2) : '-'}
                            </td>
                            <td className="text-left font-black text-slate-900 bg-transparent font-mono align-middle whitespace-nowrap">
                              {row.runningBalance.toFixed(2)}
                            </td>
                          </tr>

                          {/* تفاصيل الفاتورة: جدول الأصناف ممتد بالكامل تحت أعمدة مدين ودائن ورصيد */}
                          {showItemDetails && row.items && row.items.length > 0 && (
                            <tr className="bg-white print:bg-white print-allow-break">
                              <td colSpan={6} className="p-0 border-b border-slate-300 print-allow-break report-subtable-cell">
                                <div className="w-full bg-white print:border-none print:rounded-none print:overflow-visible print:shadow-none print:block">
                                  <table className="w-full text-right report-sub-table border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                                        <th className="text-center w-8 min-w-8 border-l border-slate-200">م</th>
                                        <th className="border-l border-slate-200">الصنف والبيان</th>
                                        <th className="text-center w-12 min-w-12 border-l border-slate-200">الطول</th>
                                        <th className="text-center w-12 min-w-12 border-l border-slate-200">العرض</th>
                                        <th className="text-center w-10 min-w-10 border-l border-slate-200">العدد</th>
                                        <th className="text-center w-12 min-w-12 border-l border-slate-200">الكمية</th>
                                        <th className="text-left w-16 min-w-16 border-l border-slate-200">السعر</th>
                                        <th className="text-left w-18 min-w-18">الإجمالي</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                      {row.items.map((it, iIdx) => (
                                        <tr key={iIdx} className="hover:bg-slate-50">
                                          <td className="text-center font-mono font-bold text-slate-700 border-l border-slate-200 py-1">{iIdx + 1}</td>
                                          <td className="font-bold text-slate-900 border-l border-slate-200">
                                            <div>
                                              <span>{it.itemName}</span>
                                              {(it.notes || it.description) && (it.notes !== it.itemName) && (
                                                <span className="text-slate-600 font-medium"> / {it.notes || it.description}</span>
                                              )}
                                              
                                            </div>
                                          </td>
                                          <td className="text-center font-mono text-slate-800 border-l border-slate-200">{displayDimension(it.length, hasVisibleInvoiceDimensions(it))}</td>
                                          <td className="text-center font-mono text-slate-800 border-l border-slate-200">{displayDimension(it.width, hasVisibleInvoiceDimensions(it))}</td>
                                          <td className="text-center font-mono font-bold text-slate-800 border-l border-slate-200">{hasVisibleInvoiceDimensions(it) ? (it.count || 1) : '-'}</td>
                                          <td className="text-center font-mono font-bold text-slate-900 border-l border-slate-200">
                                            {it.quantity}
                                          </td>
                                          <td className="text-left font-mono text-slate-800 border-l border-slate-200">{it.unitPrice.toFixed(2)}</td>
                                          <td className="text-left font-mono font-bold text-slate-900">{it.total.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    {Boolean((row.discountTotal && row.discountTotal > 0) || (row.taxAmount && row.taxAmount > 0)) && (
                                      <tfoot className="bg-slate-50 border-t border-slate-300 font-bold">
                                        <tr>
                                          <td colSpan={8} className="py-1 px-1.5 text-left font-mono">
                                            <div className="flex items-center justify-end gap-3 text-slate-800">
                                              {row.discountTotal !== undefined && row.discountTotal > 0 && (
                                                <span className="text-rose-600 font-bold">خصم الفاتورة: -{row.discountTotal.toFixed(2)}</span>
                                              )}
                                              {row.taxAmount !== undefined && row.taxAmount > 0 && (
                                                <span className="text-slate-600">الضريبة: +{row.taxAmount.toFixed(2)}</span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      </tfoot>
                                    )}
                                  </table>

                                  {row.type === 'invoice' && (
                                    <div className="invoice-financial-strip grid grid-cols-6 items-center gap-x-1 border-t border-slate-300 bg-white px-1 py-1 font-bold text-slate-900" dir="rtl">
                                      {([
                                        ['قبل الخصم', row.subtotal ?? row.items.reduce((total, item) => total + item.total, 0)],
                                        ['الخصم', row.discountTotal ?? 0],
                                        ['الضريبة', row.taxAmount ?? 0],
                                        ['الإجمالي', row.totalAmount ?? row.items.reduce((total, item) => total + item.total, 0)],
                                        ['المدفوع', row.paidAmount ?? 0],
                                        ['المتبقي', row.remainingAmount ?? ((row.totalAmount ?? row.items.reduce((total, item) => total + item.total, 0)) - (row.paidAmount ?? 0))],
                                      ] as [string, number][]).map(([label, amount]) => (
                                        <span key={label} className="inline-flex items-center gap-1 whitespace-nowrap">
                                          <span className="text-slate-600">{label}:</span>
                                          <b className="font-mono tabular-nums text-slate-950" dir="ltr">
                                            {amount.toFixed(2)} {row.currencySymbol || settings.currency}
                                          </b>
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* كشف تفصيلي بالصور: شريط المصغرات التفصيلي بالصور تحت جدول الفاتورة مباشرة */}
                                  {showImageThumbnailsInStatement && row.items && row.items.some(it => 
                                    it.imageThumbnail || (it.attachments && it.attachments.some(a => a.data || a.type?.startsWith('image/')))
                                  ) && (
                                    <div className="bg-white p-2 border-t border-slate-200">
                                      <div className="grid grid-cols-7 gap-2.5 w-full print:grid-cols-7">
                                        {row.items.flatMap((it, itemIdx) => {
                                           const thumbs = parseThumbnails(it.imageThumbnail);
                                           const attImgs = (it.attachments || [])
                                             .filter(a => a.data || a.type?.startsWith('image/'))
                                             .map(a => a.data || '');
                                           const allImgs = Array.from(new Set([...thumbs, ...attImgs].filter(Boolean)));
                                           return allImgs.map(imgStr => ({
                                             imgStr,
                                             itemName: it.itemName,
                                             itemCode: it.itemCode,
                                             itemSeq: itemIdx + 1
                                           }));
                                         }).map((imgObj, idx) => (
                                           <div
                                             key={idx}
                                             onClick={() => setPreviewModalImage({ url: imgObj.imgStr, name: imgObj.itemName })}
                                             className="flex flex-col items-center bg-white border border-slate-200 hover:border-purple-500 hover:shadow-md rounded-lg p-1.5 shadow-2xs w-full cursor-pointer transition-all group"
                                             title={`معاينة وتكبير صورة "${imgObj.itemName}" (بند #${imgObj.itemSeq})`}
                                           >
                                             <div className="relative w-full aspect-square rounded-md overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-0.5">
                                               <span className="absolute top-0.5 right-0.5 bg-slate-900/80 text-white text-[8px] font-mono font-black px-1 rounded-xs z-10 print:bg-slate-800">
                                                 #{imgObj.itemSeq}
                                               </span>
                                               <img
                                                 src={imgObj.imgStr}
                                                 alt={imgObj.itemName}
                                                 className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                                 onError={(e) => {
                                                   e.currentTarget.style.display = 'none';
                                                 }}
                                               />
                                             </div>
                                           </div>
                                         ))}
                                       </div>
                                     </div>
                                   )}
                                 </div>
                               </td>
                             </tr>
                           )}
                         </React.Fragment>
                       );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                      <td colSpan={3} className="text-left font-sans">الإجمالي العام للحركات بالفترة:</td>
                      <td className="text-left font-mono text-rose-800 font-black whitespace-nowrap">
                        {partyStatement.totalDebit.toFixed(2)}
                      </td>
                      <td className="text-left font-mono text-emerald-800 font-black whitespace-nowrap">
                        {partyStatement.totalCredit.toFixed(2)}
                      </td>
                      <td className="text-left font-mono text-slate-900 font-black bg-slate-200/80 whitespace-nowrap">
                        {partyStatement.closingBalance.toFixed(2)} {settings.currency}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ملخص نهاية الكشف بعد الجدول بتنسيق رسمي ومضغوط سطر واحد للبنرات الأربعة */}
              <div className="mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 shadow-2xs print:border-slate-300">
                <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                  <div className="bg-white border border-slate-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs">
                    <span className="font-bold text-slate-700 text-[10px] whitespace-nowrap">رصيد سابق:</span>
                    <div className="font-black font-mono text-slate-900 text-[11px] flex items-center gap-1 whitespace-nowrap">
                      <span>{partyStatement.openingBalance.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold text-slate-500">{settings.currency}</span>
                    </div>
                  </div>
                  <div className={`bg-white border ${isCustomer ? 'border-rose-300' : 'border-emerald-300'} rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs`}>
                    <span className={`font-bold text-[10px] whitespace-nowrap ${isCustomer ? 'text-rose-900' : 'text-emerald-900'}`}>إجمالي مدين:</span>
                    <div className={`font-black font-mono text-[11px] ${isCustomer ? 'text-rose-700' : 'text-emerald-700'} flex items-center gap-1 whitespace-nowrap`}>
                      <span>{partyStatement.totalDebit.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                    </div>
                  </div>
                  <div className={`bg-white border ${isCustomer ? 'border-emerald-300' : 'border-rose-300'} rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs`}>
                    <span className={`font-bold text-[10px] whitespace-nowrap ${isCustomer ? 'text-emerald-900' : 'text-rose-900'}`}>إجمالي دائن:</span>
                    <div className={`font-black font-mono text-[11px] ${isCustomer ? 'text-emerald-700' : 'text-rose-700'} flex items-center gap-1 whitespace-nowrap`}>
                      <span>{partyStatement.totalCredit.toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                    </div>
                  </div>
                  <div className={`bg-white border rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs ${partyStatement.closingBalance > 0 ? (isCustomer ? 'border-amber-400 bg-amber-50/20' : 'border-rose-400 bg-rose-50/20') : partyStatement.closingBalance < 0 ? (isCustomer ? 'border-blue-400 bg-blue-50/20' : 'border-emerald-400 bg-emerald-50/20') : 'border-slate-300'}`}>
                    <span className="font-bold text-slate-900 text-[10px] whitespace-nowrap">
                      الإجمالي:
                    </span>
                    <div className={`font-black font-mono text-[11px] flex items-center gap-1 whitespace-nowrap ${partyStatement.closingBalance > 0 ? (isCustomer ? 'text-amber-700' : 'text-rose-700') : partyStatement.closingBalance < 0 ? (isCustomer ? 'text-blue-700' : 'text-emerald-700') : 'text-slate-800'}`}>
                      <span>{Math.abs(partyStatement.closingBalance).toFixed(2)}</span>
                      <span className="text-[9px] font-sans font-bold opacity-75">{settings.currency}</span>
                      <span className="text-[9.5px] font-sans font-bold">
                        ({isCustomer ? (partyStatement.closingBalance > 0 ? 'مدين' : partyStatement.closingBalance < 0 ? 'دائن' : 'متزن') : (partyStatement.closingBalance > 0 ? 'دائن' : partyStatement.closingBalance < 0 ? 'مدين' : 'متزن')})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tafqeet & Closing Balance */}
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <div className="flex items-center justify-between text-[10.5px] mb-0.5">
                    <span className="font-bold text-slate-700">المبلغ كتابة وتفقيطاً:</span>
                    <span className="font-bold text-slate-900 font-mono text-[11px]">
                      الرصيد الإجمالي ({isCustomer ? (partyStatement.closingBalance > 0 ? 'مدين' : partyStatement.closingBalance < 0 ? 'دائن' : 'متزن') : (partyStatement.closingBalance > 0 ? 'دائن' : partyStatement.closingBalance < 0 ? 'مدين' : 'متزن')}): {Math.abs(partyStatement.closingBalance).toFixed(2)} {settings.currency}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-semibold text-slate-800 bg-slate-50 p-1 rounded border border-slate-200 font-arabic">
                    {partyTafqeet}
                  </div>
                </div>
              </div>

              {/* Customer financial statement: only the stamp and signature */}
              {isCustomer ? (
              <div className="statement-stamp-only pt-3 mt-3 border-t border-slate-300 text-center" dir="rtl">
                <div className="min-h-[4.2cm] flex items-center justify-center relative">
                  {settings.stampUrl ? (
                    <div className="relative flex items-center justify-center">
                      <OfficialStamp size="3.5cm" />
                      {settings.signatureUrl && (
                        <img src={settings.signatureUrl} alt="Signature" className="absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none" />
                      )}
                    </div>
                  ) : settings.signatureUrl ? (
                    <img src={settings.signatureUrl} alt="Signature" className="max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90" />
                  ) : (
                    <div className="border-b border-dashed border-slate-400 w-36 mx-auto mt-10"></div>
                  )}
                </div>
                <span className="block mt-2 text-[11px] text-slate-500 font-bold">الختم والتوقيع</span>
              </div>
              ) : (
                <>
{/* Official Signatures Section */}
              <div className="pt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-[10px] mt-4">
                {/* Right Column */}
                <div className="space-y-4 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">إعداد وتدقيق المحاسب</span>
                  <div className="border-b border-dashed border-slate-400 w-28 mx-auto mt-6"></div>
                  <span className="text-[10px] text-slate-400 block font-mono">التوقيع والتاريخ</span>
                </div>

                {/* Center Column */}
                <div className="space-y-4 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">توقيع وإقرار الموظف بالمطابقة</span>
                  <div className="border-b border-dashed border-slate-400 w-28 mx-auto mt-6"></div>
                  <span className="text-[10px] text-slate-400 block font-mono">الموظف</span>
                </div>

                {/* Left Column - Official Stamp & Signature */}
                <div className="space-y-2 flex flex-col items-center justify-end">
                  <span className="font-bold text-slate-700 block mb-auto">اعتماد الإدارة / التوقيع</span>
                  
                  <div className="min-h-[4.2cm] flex items-center justify-center relative">
                    {settings.stampUrl ? (
                      <div className="relative flex items-center justify-center">
                        <OfficialStamp size="3.5cm" />
                        {settings.signatureUrl && (
                          <img
                            src={settings.signatureUrl}
                            alt="Signature"
                            className="absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none"
                          />
                        )}
                      </div>
                    ) : settings.signatureUrl ? (
                      <img
                        src={settings.signatureUrl}
                        alt="Signature"
                        className="max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90"
                      />
                    ) : (
                      <div className="border-b border-dashed border-slate-400 w-36 mx-auto mt-10"></div>
                    )}
                  </div>
                  
                  <span className="text-[11px] text-slate-400 block font-mono mt-2">الختم والتوقيع المعتمد</span>
                </div>
              </div>
              </>
              )}

            </div>
    </>
  );
};
