import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Printer, X, FileText, QrCode } from 'lucide-react';
import { PrintHeader, ThermalReceiptHeader } from './common/PrintHeader';
import { ReportSignatures } from './common/ReportSignatures';
import { formatDateDisplay } from '../utils/dateUtils';
import { isDimensionalInvoiceItem } from '../utils/invoiceDimensions';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';

const parseThumbnails = (val?: string): string[] => {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [val];
};

export const InvoicePrintModal: React.FC = () => {
  const { selectedInvoiceForPrint, setSelectedInvoiceForPrint, directPrintOptions, setDirectPrintOptions, settings, parties } = useAccounting();
  const [printFormat, setPrintFormat] = useState<'a4' | 'a4-custom' | 'thermal'>('thermal');

  useEffect(() => {
    if (directPrintOptions) {
      setPrintFormat(directPrintOptions.format);
      if (directPrintOptions.autoPrint) {
        const timer = setTimeout(() => {
          window.print();
          setDirectPrintOptions(null);
          setSelectedInvoiceForPrint(null);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [directPrintOptions, setDirectPrintOptions, setSelectedInvoiceForPrint]);

  if (!selectedInvoiceForPrint) return null;

  const inv = selectedInvoiceForPrint;
  const isDraftPreview = inv.id === 'draft-pos-preview' || inv.invoiceNumber?.includes('مسودة');

  const handlePrint = () => {
    window.print();
  };

  // القاعدة النظامية: "زبون رئيسي / زبون فرعي"
  const formattedCustomerDisplayName = formatInvoiceCustomerDisplay(inv, parties);

  // =========================================================================
  // REQUIREMENT: 15 ITEMS PER PRINTED PAGE & INVOICE NUMBER EXTENSION (-1, -2) FOR PRINT ONLY
  // =========================================================================
  const ITEMS_PER_PAGE = 15;
  const rawItems = inv.items || [];
  const itemChunks: typeof rawItems[] = [];

  if (rawItems.length === 0) {
    itemChunks.push([]);
  } else {
    for (let i = 0; i < rawItems.length; i += ITEMS_PER_PAGE) {
      itemChunks.push(rawItems.slice(i, i + ITEMS_PER_PAGE));
    }
  }

  const totalPages = itemChunks.length;
  const isMultiPage = totalPages > 1;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print-modal-container">
      <div className={`bg-white rounded-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto transition-all duration-300 print:border-none print:shadow-none print:max-w-none print:w-full print:rounded-none print:overflow-visible ${
        printFormat === 'thermal' ? 'max-w-[400px]' : 'max-w-[950px]'
      }`}>
        {/* Header Controls (Hidden during print) */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-600">طريقة العرض والطباعة:</span>
            <div className="bg-slate-200 p-0.5 rounded-lg flex text-xs">
              <button
                onClick={() => setPrintFormat('a4')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  printFormat === 'a4' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                فاتورة ضريبية A4
              </button>
              <button
                onClick={() => setPrintFormat('a4-custom')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  printFormat === 'a4-custom' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                فاتورة A4 (تصميم 2)
              </button>
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                  printFormat === 'thermal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                إيصال حراري (80mm)
              </button>
            </div>
          </div>

          {isDraftPreview && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-bold text-xs">
              <FileText className="w-3.5 h-3.5 text-amber-700" />
              <span>مسودة مراجعة الفاتورة قبل الحفظ</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-colors cursor-pointer"
              title="طباعة الفاتورة للعميل لمراجعة البنود والأسعار"
            >
              <Printer className="w-4 h-4" />
              <span>{isDraftPreview ? 'طباعة المسودة للعميل' : 'طباعة الآن'}</span>
            </button>
            <button
              onClick={() => setSelectedInvoiceForPrint(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              title="إغلاق والعودة لشاشة الكاشير"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Body: A4 Standard Format */}
        {printFormat === 'a4' ? (
          <div className="p-8 space-y-8 text-slate-800 text-xs font-sans print:p-0">
            {itemChunks.map((chunk, chunkIdx) => {
              const pageNumber = chunkIdx + 1;
              const printInvoiceNumber = isMultiPage ? `${inv.invoiceNumber}-${pageNumber}` : inv.invoiceNumber;
              const isLastPage = chunkIdx === totalPages - 1;

              return (
                <div
                  key={chunkIdx}
                  className={`space-y-6 ${chunkIdx < totalPages - 1 ? 'break-after-page print:break-after-page pb-8 border-b border-slate-200 print:border-none' : ''}`}
                >
                  {/* Standard or Full Header Banner with Page Specific Invoice Number */}
                  <PrintHeader
                    title={isDraftPreview ? "فاتورة مبيعات (مسودة مراجعة)" : "فاتورة ضريبية مبسطة"}
                    subtitle={isDraftPreview ? "معاينة الفاتورة ومراجعة البنود قبل السداد والاعتماد" : "Simplified Tax Invoice - ZATCA & Official Tax Compliant"}
                    docNumber={printInvoiceNumber}
                    docDate={inv.date}
                    badge={isDraftPreview ? "مسودة مراجعة للعميل" : isMultiPage ? `صفحة ${pageNumber} من ${totalPages}` : "فاتورة مبيعات معتمدة"}
                    qrCode={
                      <div className="w-18 h-18 bg-slate-50 border border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-600 p-1">
                        <QrCode className="w-12 h-12 text-slate-800" />
                        <span className="text-[7px] font-mono">ZATCA QR</span>
                      </div>
                    }
                  />

                  {/* Customer Meta Row */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <div><span className="text-slate-500">رقم الفاتورة:</span> <strong className="font-mono text-slate-900">{printInvoiceNumber}</strong> {isMultiPage && <span className="text-[10px] text-indigo-600 font-semibold">(صفحة {pageNumber} من {totalPages})</span>}</div>
                      <div><span className="text-slate-500">تاريخ الإصدار:</span> <span className="font-mono">{formatDateDisplay(inv.date)}</span></div>
                      <div><span className="text-slate-500">طريقة السداد:</span> <strong>{inv.paymentMethod === 'cash' ? 'نقدي' : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') ? (inv.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'بطاقة بنكية / مدى') : 'آجل على الحساب'}</strong></div>
                    </div>
                    <div className="space-y-1">
                      <div><span className="text-slate-500">العميل:</span> <strong className="text-slate-900">{formattedCustomerDisplayName}</strong></div>
                      {(inv.customerPhone || inv.subCustomerPhone) && (
                        <div><span className="text-slate-500">هاتف العميل:</span> <span className="font-mono">{inv.customerPhone || inv.subCustomerPhone}</span></div>
                      )}
                      {inv.customerTaxNumber && (
                        <div><span className="text-slate-500">الرقم الضريبي للعميل:</span> <span className="font-mono">{inv.customerTaxNumber}</span></div>
                      )}
                    </div>
                  </div>

                  {/* Invoice Notes */}
                  {inv.notes && chunkIdx === 0 && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs flex items-start gap-2 shadow-2xs">
                      <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-bold text-amber-950 ml-1.5">ملاحظات الفاتورة:</span>
                        <span className="text-slate-800 font-medium whitespace-pre-wrap">{inv.notes}</span>
                      </div>
                    </div>
                  )}

                  {/* Line Items Table (Max 15 items per page) */}
                  <table className="w-full text-right text-xs border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                      <tr>
                        <th className="p-2 w-8 text-center font-bold text-slate-900">م</th>
                        <th className="p-2 min-w-[120px]">الصنف</th>
                        <th className="p-2 min-w-[120px]">البيان</th>
                        <th className="p-2 w-14 text-center">الطول</th>
                        <th className="p-2 w-14 text-center">العرض</th>
                        <th className="p-2 w-12 text-center">العدد</th>
                        <th className="p-2 w-16 text-center">الكمية</th>
                        <th className="p-2 w-14 text-center">الوحدة</th>
                        <th className="p-2 w-16 text-left">السعر</th>
                        <th className="p-2 w-14 text-left">الخصم</th>
                        <th className="p-2 w-14 text-left">الضريبة</th>
                        <th className="p-2 w-20 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-sans">
                      {chunk.map((it, idxWithinChunk) => {
                        const overallIndex = chunkIdx * ITEMS_PER_PAGE + idxWithinChunk + 1;
                        const hasDimensions = isDimensionalInvoiceItem(it);
                        const length = Number(it.length) || 0;
                        const width = Number(it.width) || 0;
                        const count = Number(it.count) || 1;
                        const unit = it.unit || (hasDimensions ? 'م²' : 'حبة');

                        return (
                          <tr key={idxWithinChunk} className="hover:bg-slate-50/50">
                            <td className="p-2 text-slate-400 font-mono text-center">{overallIndex}</td>
                            <td className="p-2 font-bold text-slate-900">
                              <div>
                                <span>{it.itemName}</span>
                                {(it.notes || it.description) && (it.notes !== it.itemName) && (
                                  <span className="text-slate-600 font-normal text-xs"> / {it.notes || it.description}</span>
                                )}
                              </div>
                              {it.imageThumbnail && (
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  {parseThumbnails(it.imageThumbnail).map((imgStr, imgIdx) => (
                                    <img
                                      key={imgIdx}
                                      src={imgStr}
                                      alt="معاينة"
                                      className="w-9 h-9 object-cover rounded border border-slate-300 shadow-2xs"
                                    />
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-slate-700 text-xs font-normal">
                              {it.notes || it.description || '-'}
                            </td>
                            <td className="p-2 text-center font-mono font-medium">
                              {hasDimensions && length > 0 ? length : '—'}
                            </td>
                            <td className="p-2 text-center font-mono font-medium">
                              {hasDimensions && width > 0 ? width : '—'}
                            </td>
                            <td className="p-2 text-center font-mono font-medium">
                              {hasDimensions ? count : '—'}
                            </td>
                            <td className="p-2 text-center font-mono font-bold text-blue-900">
                              {it.quantity}
                            </td>
                            <td className="p-2 text-center text-[11px] text-slate-700 font-medium">
                              {unit}
                            </td>
                            <td className="p-2 text-left font-mono">{it.unitPrice.toFixed(2)}</td>
                            <td className="p-2 text-left font-mono text-rose-600">
                              {it.discount && it.discount > 0 ? it.discount.toFixed(2) : '0.00'}
                            </td>
                            <td className="p-2 text-left font-mono text-indigo-700">
                              {it.tax && it.tax > 0 ? it.tax.toFixed(2) : '0.00'}
                            </td>
                            <td className="p-2 text-left font-mono font-black text-slate-900">
                              {it.total.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Totals & Signatures (Shown on Last Page or Summary) */}
                  {isLastPage ? (
                    <div className="space-y-6">
                      <div className="flex justify-end">
                        <div className="w-72 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <div className="flex justify-between text-slate-600">
                            <span>المجموع الفرعي:</span>
                            <span className="font-mono font-bold">{inv.subtotal.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                          </div>
                          {inv.discountTotal > 0 && (
                            <div className="flex justify-between text-rose-600">
                              <span>الخصم:</span>
                              <span className="font-mono font-bold">-{inv.discountTotal.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-600">
                            <span>ضريبة القيمة المضافة ({inv.taxRate}%):</span>
                            <span className="font-mono font-bold text-indigo-700">{inv.taxAmount.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                          </div>
                          <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-300">
                            <span>الإجمالي المستحق:</span>
                            <span className="font-mono text-indigo-700">{inv.totalAmount.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
                          </div>
                        </div>
                      </div>

                      {/* SIGNATURES FOOTER (توقيع وختم المستلم -- الختم) */}
                      <ReportSignatures columns={2} rightLabel="توقيع وختم المستلم" leftLabel="الختم" />
                    </div>
                  ) : (
                    <div className="text-center py-2 text-slate-500 font-medium text-xs border-t border-dashed border-slate-300">
                      يتبع باقي البنود في الصفحة التالية... (صفحة {pageNumber} من {totalPages})
                    </div>
                  )}
                </div>
              );
            })}

            {/* Footer Notice */}
            <div className="text-center pt-4 border-t border-slate-200 text-[10px] text-slate-400 font-light">
              <p>{settings.invoiceFooter}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-400">شكراً لتعاملكم مع {settings.businessName}</p>
            </div>
          </div>
        ) : printFormat === 'a4-custom' ? (
          /* A4 Custom Print Format */
          <div className="p-8 text-slate-800 text-sm font-sans print:p-0 bg-white" dir="rtl">
            {itemChunks.map((chunk, chunkIdx) => {
              const pageNumber = chunkIdx + 1;
              const printInvoiceNumber = isMultiPage ? `${inv.invoiceNumber}-${pageNumber}` : inv.invoiceNumber;
              const isLastPage = chunkIdx === totalPages - 1;

              return (
                <div
                  key={chunkIdx}
                  className={`a4-custom-outer-frame border-[3px] border-[#2b3a67] p-1.5 pb-2 flex flex-col justify-between relative mb-8 print:mb-0 print:border-[3px] print:border-[#2b3a67] print:h-[270mm] print:max-h-[275mm] print:break-inside-avoid print:box-border bg-white ${
                    chunkIdx < totalPages - 1 ? 'break-after-page print:break-after-page' : ''
                  }`}
                  style={{ border: '3px solid #2b3a67', outline: '2px solid #2b3a67' }}
                >
                  <div
                    className="a4-custom-inner-frame border-[2px] border-[#2b3a67] flex-1 flex flex-col justify-between p-2 space-y-1.5 print:p-1.5 print:space-y-1.5 bg-white"
                    style={{ border: '2px solid #2b3a67', outline: '1px solid #2b3a67' }}
                  >
                    
                    {/* Header Banner & Sub-bar */}
                    <PrintHeader
                      title={isDraftPreview ? "مسودة فاتورة مبيعات" : "فاتورة مبيعات"}
                      docNumber={printInvoiceNumber}
                      docDate={inv.date}
                      badge={isMultiPage ? `صفحة ${pageNumber} من ${totalPages}` : undefined}
                      showBorder={true}
                    />

                    {/* Customer Info Box (Single Row, single-line inline flow in preview and print) */}
                    <div
                      className="border-[2px] border-[#2b3a67] rounded-lg p-1.5 px-3 flex items-center justify-start gap-2.5 sm:gap-3 text-xs print:text-[11px] font-bold text-[#2b3a67] whitespace-nowrap overflow-hidden leading-tight bg-white w-full print:flex print:flex-row print:flex-nowrap print:justify-start print:items-center print:w-full print:py-1"
                      style={{ border: '2px solid #2b3a67' }}
                    >
                      <div className="flex items-center gap-1 shrink min-w-0 print:flex print:items-center">
                        <span className="shrink-0 text-[#2b3a67]">اسم العميل:</span>
                        <span className="text-slate-950 font-extrabold truncate max-w-[380px] sm:max-w-[480px]">{formattedCustomerDisplayName}</span>
                      </div>
                      
                      <span className="text-slate-400 shrink-0">|</span>
                      <div className="flex items-center gap-1 shrink-0 print:flex print:items-center">
                        <span className="text-[#2b3a67]">الهاتف:</span>
                        <span className="font-mono text-slate-900 font-bold">{inv.customerPhone || inv.subCustomerPhone || '—'}</span>
                      </div>

                      {inv.customerTaxNumber && (
                        <>
                          <span className="text-slate-400 shrink-0">|</span>
                          <div className="flex items-center gap-1 shrink-0 print:flex print:items-center">
                            <span className="text-[#2b3a67]">الرقم الضريبي:</span>
                            <span className="font-mono text-slate-900 font-bold">{inv.customerTaxNumber}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Table (Exactly 15 rows numbered 1-15, thicker borders, dark blue table header with white text, 5% blue shaded background for empty rows) */}
                    <div className="flex-1 flex flex-col justify-start bg-white">
                      <table className="invoice-print-table w-full text-center border-collapse border-[2.5px] border-[#2b3a67] bg-white">
                        <thead>
                          <tr className="bg-[#2b3a67] text-white font-black text-xs border-b-[2.5px] border-[#2b3a67]">
                            <th style={{ backgroundColor: '#2b3a67', color: '#ffffff' }} className="border-[2px] border-[#2b3a67] py-2 w-10 bg-[#2b3a67] text-white font-black">م</th>
                            <th style={{ backgroundColor: '#2b3a67', color: '#ffffff' }} className="border-[2px] border-[#2b3a67] py-2 w-48 bg-[#2b3a67] text-white font-black">الصنف</th>
                            <th style={{ backgroundColor: '#2b3a67', color: '#ffffff' }} className="border-[2px] border-[#2b3a67] py-2 bg-[#2b3a67] text-white font-black">البيان</th>
                            <th style={{ backgroundColor: '#2b3a67', color: '#ffffff' }} className="border-[2px] border-[#2b3a67] py-2 w-20 bg-[#2b3a67] text-white font-black">الكمية</th>
                            <th style={{ backgroundColor: '#2b3a67', color: '#ffffff' }} className="border-[2px] border-[#2b3a67] py-2 w-24 bg-[#2b3a67] text-white font-black">سعر الوحدة</th>
                            <th style={{ backgroundColor: '#2b3a67', color: '#ffffff' }} className="border-[2px] border-[#2b3a67] py-2 w-24 bg-[#2b3a67] text-white font-black">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs font-bold text-[#2b3a67]">
                          {/* Always render 15 rows numbered 1-15 */}
                          {Array.from({ length: 15 }).map((_, rowIdx) => {
                            const item = chunk[rowIdx];
                            const overallIndex = chunkIdx * ITEMS_PER_PAGE + rowIdx + 1;
                            const isEmpty = !item;

                            return (
                              <tr
                                key={rowIdx}
                                className={`h-[1.65rem] ${isEmpty ? 'empty-row-shaded bg-[#2b3a67]/5' : 'bg-white'}`}
                              >
                                {/* Column م: Always numbered 1 to 15 */}
                                <td
                                  style={isEmpty ? { backgroundColor: 'rgba(43, 58, 103, 0.05)' } : undefined}
                                  className={`border-[2px] border-[#2b3a67] font-mono font-extrabold text-center w-10 ${
                                    isEmpty ? 'bg-[#2b3a67]/5 text-[#2b3a67]' : 'bg-white text-slate-900'
                                  }`}
                                >
                                  {overallIndex}
                                </td>

                                {/* Item Name */}
                                <td
                                  style={isEmpty ? { backgroundColor: 'rgba(43, 58, 103, 0.05)' } : undefined}
                                  className={`border-[2px] border-[#2b3a67] px-2 text-right font-bold truncate ${
                                    isEmpty ? 'bg-[#2b3a67]/5' : 'bg-white'
                                  }`}
                                >
                                  {item ? item.itemName : ''}
                                </td>

                                {/* Description / Notes */}
                                <td
                                  style={isEmpty ? { backgroundColor: 'rgba(43, 58, 103, 0.05)' } : undefined}
                                  className={`border-[2px] border-[#2b3a67] px-2 text-right font-medium text-xs text-slate-800 ${
                                    isEmpty ? 'bg-[#2b3a67]/5' : 'bg-white'
                                  }`}
                                >
                                  {item ? (item.notes || item.description || '') : ''}
                                </td>

                                {/* Quantity */}
                                <td
                                  style={isEmpty ? { backgroundColor: 'rgba(43, 58, 103, 0.05)' } : undefined}
                                  className={`border-[2px] border-[#2b3a67] font-mono ${
                                    isEmpty ? 'bg-[#2b3a67]/5' : 'bg-white'
                                  }`}
                                >
                                  {item ? item.quantity : ''}
                                </td>

                                {/* Unit Price */}
                                <td
                                  style={isEmpty ? { backgroundColor: 'rgba(43, 58, 103, 0.05)' } : undefined}
                                  className={`border-[2px] border-[#2b3a67] font-mono ${
                                    isEmpty ? 'bg-[#2b3a67]/5' : 'bg-white'
                                  }`}
                                >
                                  {item ? item.unitPrice.toFixed(2) : ''}
                                </td>

                                {/* Total */}
                                <td
                                  style={isEmpty ? { backgroundColor: 'rgba(43, 58, 103, 0.05)' } : undefined}
                                  className={`border-[2px] border-[#2b3a67] font-mono ${
                                    isEmpty ? 'bg-[#2b3a67]/5' : 'bg-white'
                                  }`}
                                >
                                  {item ? item.total.toFixed(2) : ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer and Totals (Stays on same page) */}
                    {isLastPage ? (
                      <div className="space-y-3 shrink-0 bg-white">
                        <div className="grid grid-cols-2 gap-4 items-start mt-1 bg-white">
                          {/* Totals Box with Complete Dark Blue Outer Border & Outline */}
                          <div
                            className="a4-totals-box border-[2.5px] border-[#2b3a67] rounded-lg flex flex-col text-xs bg-white"
                            style={{ border: '2.5px solid #2b3a67', outline: '2px solid #2b3a67' }}
                          >
                            <div className="flex border-b-[2px] border-[#2b3a67]">
                              <div className="w-1/2 p-1 font-bold text-center border-l-[2px] border-[#2b3a67] bg-white text-[#2b3a67]">إجمالي المبلغ</div>
                              <div className="w-1/2 p-1 font-mono text-center font-bold text-[#2b3a67] bg-white">{inv.subtotal.toFixed(2)}</div>
                            </div>
                            <div className="flex border-b-[2px] border-[#2b3a67]">
                              <div className="w-1/2 p-1 font-bold text-center border-l-[2px] border-[#2b3a67] bg-white text-[#2b3a67]">الخصم</div>
                              <div className="w-1/2 p-1 font-mono text-center font-bold text-[#2b3a67] bg-white">{inv.discountTotal > 0 ? inv.discountTotal.toFixed(2) : '0.00'}</div>
                            </div>
                            <div className="flex border-b-[2px] border-[#2b3a67]">
                              <div className="w-1/2 p-1 font-bold text-center border-l-[2px] border-[#2b3a67] bg-white text-[#2b3a67]">قيمة الضريبة</div>
                              <div className="w-1/2 p-1 font-mono text-center font-bold text-[#2b3a67] bg-white">{inv.taxAmount > 0 ? inv.taxAmount.toFixed(2) : '0.00'}</div>
                            </div>
                            <div className="flex bg-[#2b3a67] text-white font-black">
                              <div className="w-1/2 p-1 font-bold text-center border-l-[2px] border-[#2b3a67] bg-[#2b3a67] text-white">المبلغ الإجمالي</div>
                              <div className="w-1/2 p-1 font-mono text-center bg-[#2b3a67] text-white font-black">{inv.totalAmount.toFixed(2)} {inv.currencySymbol || settings.currency}</div>
                            </div>
                          </div>

                          {/* Notes Box with Complete Dark Blue Outer Border & Outline */}
                          <div
                            className="a4-notes-box border-[2.5px] border-[#2b3a67] rounded-lg flex flex-col min-h-[90px] bg-white"
                            style={{ border: '2.5px solid #2b3a67', outline: '2px solid #2b3a67' }}
                          >
                            <div className="bg-white text-[#2b3a67] font-bold text-center py-1 border-b-[2px] border-[#2b3a67] text-xs">
                              ملاحظات
                            </div>
                            <div className="p-2 font-medium text-slate-800 text-xs whitespace-pre-wrap flex-1 bg-white">
                              {inv.notes || 'لا توجد ملاحظات إضافية'}
                            </div>
                          </div>
                        </div>

                        {/* SIGNATURES FOOTER (توقيع وختم المستلم -- الختم) */}
                        <ReportSignatures columns={2} rightLabel="توقيع وختم المستلم" leftLabel="الختم" />
                      </div>
                    ) : (
                      <div className="text-center py-1.5 text-[#2b3a67] font-bold text-xs border border-[#2b3a67] bg-white rounded-md">
                        يتبع باقي البنود في الصفحة التالية... (صفحة {pageNumber} من {totalPages})
                      </div>
                    )}

                    <div className="text-center font-bold text-[#2b3a67] pt-1 text-sm">
                      مع خالص الشكر والتقدير
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Thermal 80mm Receipt Format */
          <div className="p-6 max-w-xs mx-auto space-y-4 text-slate-900 font-mono text-xs text-center print:p-0">
            <ThermalReceiptHeader receiptTitle={isDraftPreview ? "مسودة مراجعة الفاتورة" : "فاتورة ضريبية مبسطة"} />

            {isDraftPreview && (
              <div className="border border-dashed border-amber-600 bg-amber-50 text-amber-950 font-bold p-1 rounded text-[11px]">
                *** مسودة مراجعة الحساب قبل السداد ***
              </div>
            )}

            <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-1 text-[11px] text-right">
              <div className="flex justify-between">
                <span>رقم الفاتورة:</span>
                <span className="font-bold">{inv.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>التاريخ والوقت:</span>
                <span>{formatDateDisplay(inv.date)}</span>
              </div>
              <div className="flex justify-between">
                <span>العميل:</span>
                <span className="font-bold">{formattedCustomerDisplayName}</span>
              </div>
              {(inv.customerPhone || inv.subCustomerPhone) && (
                <div className="flex justify-between">
                  <span>هاتف العميل:</span>
                  <span>{inv.customerPhone || inv.subCustomerPhone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>حالة السداد:</span>
                <span className="font-bold">
                  {isDraftPreview
                    ? 'مسودة قبل الحفظ'
                    : inv.paymentMethod === 'cash'
                    ? 'نقدي'
                    : inv.paymentMethod === 'bank_transfer'
                    ? 'تحويل بنكي'
                    : inv.paymentMethod === 'card'
                    ? 'شبكة مدى'
                    : 'آجل على الحساب'}
                </span>
              </div>
            </div>

            {/* Invoice Notes */}
            {inv.notes && (
              <div className="bg-amber-50 border border-amber-300 rounded p-1.5 text-right text-[10px] font-sans">
                <span className="font-bold text-amber-900 block">📝 ملاحظات الفاتورة:</span>
                <span className="text-slate-800 font-medium">{inv.notes}</span>
              </div>
            )}

            <div className="space-y-2 text-right text-[11px]">
              {inv.items.map((it, idx) => {
                const hasDimensions = isDimensionalInvoiceItem(it);
                return (
                  <div key={idx} className="border-b border-dotted border-slate-300 pb-1">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span className="max-w-[190px] leading-tight">
                        {it.itemName}
                        {(it.notes || it.description) && (it.notes !== it.itemName) && (
                          <span className="text-slate-600 font-normal text-[10px]"> / {it.notes || it.description}</span>
                        )}
                      </span>
                      <span className="font-mono">{it.total.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-[9px] text-slate-400 font-light font-mono mt-0.5">
                      <span>
                        {hasDimensions
                          ? `[${it.length}×${it.width}م × ${it.count || 1} = ${it.quantity} ${it.unit || 'م²'}] `
                          : `الكمية: ${it.quantity} ${it.unit || 'حبة'} `
                        }× {it.unitPrice.toFixed(2)}
                        {it.discount && it.discount > 0 ? ` (خصم: ${it.discount})` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-right text-[11px]">
              <div className="flex justify-between">
                <span>المجموع غير شامل:</span>
                <span>{(inv.subtotal - inv.discountTotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة 15%:</span>
                <span>{inv.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black text-sm border-t border-slate-800 pt-1">
                <span>الإجمالي الصافي:</span>
                <span>{inv.totalAmount.toFixed(2)} {inv.currencySymbol || settings.currency}</span>
              </div>
              {inv.currency && inv.currency !== 'ILS' && inv.baseTotalAmount && (
                <div className="flex justify-between text-[10px] text-slate-600 font-bold pt-0.5">
                  <span>المعادل بالشيكل:</span>
                  <span>{inv.baseTotalAmount.toFixed(2)} ₪</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center pt-2">
              <QrCode className="w-24 h-24 text-slate-900" />
              <p className="text-[9px] text-slate-400 font-light mt-1">{settings.invoiceFooter}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
