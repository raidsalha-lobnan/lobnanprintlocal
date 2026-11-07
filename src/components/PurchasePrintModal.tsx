import React from 'react';
import { useAccounting } from '../context/AccountingContext';
import { tafqeet } from '../utils/tafqeet';
import { Printer, X, Building2, Truck, RotateCcw } from 'lucide-react';
import { PrintHeader } from './common/PrintHeader';
import { OfficialStamp } from './common/OfficialStamp';

export const PurchasePrintModal: React.FC = () => {
  const {
    selectedPurchaseForPrint,
    setSelectedPurchaseForPrint,
    selectedReturnForPrint,
    setSelectedReturnForPrint,
    settings
  } = useAccounting();

  if (!selectedPurchaseForPrint && !selectedReturnForPrint) return null;

  const isReturn = !!selectedReturnForPrint;
  const data = selectedReturnForPrint || selectedPurchaseForPrint!;

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    if (isReturn) {
      setSelectedReturnForPrint(null);
    } else {
      setSelectedPurchaseForPrint(null);
    }
  };

  const currencySymbol = data.currencySymbol || settings.currency || '₪';
  const totalInWords = tafqeet(data.totalAmount, 'شيكل', 'أغورة');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-xs overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print-modal-container">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-auto print:shadow-none print:border-none print:max-w-none print:w-full print:rounded-none print:overflow-visible">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            {isReturn ? (
              <RotateCcw className="w-5 h-5 text-amber-400" />
            ) : (
              <Truck className="w-5 h-5 text-blue-400" />
            )}
            <h2 className="font-bold text-sm">
              {isReturn ? `طباعة إشعار مدين / مردودات مشتريات - ${(data as any).returnNumber}` : `طباعة فاتورة توريد مشتريات - ${(data as any).invoiceNumber}`}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة (A4)</span>
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Area */}
        <div className="p-6 sm:p-8 space-y-5 text-slate-800 text-xs print:p-4 print:space-y-4 font-sans" dir="rtl">
          
          {/* Header - يعتمد الهيدر الكامل أو الترويسة القياسية */}
          <PrintHeader
            title={isReturn ? 'إشعار مدين / مردودات مشتريات' : 'فاتورة توريد مواد خام ومستلزمات'}
            subtitle={isReturn ? 'Debit Note / Purchase Return' : 'Purchase Invoice / Raw Materials'}
            docNumber={(data as any).returnNumber || (data as any).invoiceNumber}
            docDate={data.date}
            badge={isReturn ? 'مردودات موردين' : 'فاتورة مشتريات'}
            extraMeta={
              <div>
                <span className="text-slate-400">العملة: </span>
                <span>{data.currency || 'ILS'} ({currencySymbol})</span>
                {data.exchangeRate && data.exchangeRate !== 1 && (
                  <div>سعر الصرف: {data.exchangeRate}</div>
                )}
              </div>
            }
          />

          {/* Supplier Info & Reason */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <span className="text-[9px] text-slate-400 font-light font-semibold block">المورد / الجهة الموردة:</span>
              <span className="font-bold text-slate-900 text-xs">{data.supplierName}</span>
            </div>
            {isReturn ? (
              <>
                <div>
                  <span className="text-[9px] text-slate-400 font-light font-semibold block">الفاتورة الأصلية المرجعية:</span>
                  <span className="font-mono text-slate-800">{(data as any).purchaseInvoiceNumber || 'شراء مباشر'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-light font-semibold block">طريقة التسوية:</span>
                  <span className="font-semibold text-slate-800">
                    {(data as any).settlementType === 'cash_refund' ? 'استرداد نقدي / بنكي' : 'خصم من رصيد المورد الدائن'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[9px] text-slate-400 font-light font-semibold block">طريقة السداد المعتمدة:</span>
                  <span className="font-semibold text-slate-800">
                    {(data as any).paymentMethod === 'cash' ? 'نقداً من الصندوق' :
                     (data as any).paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'آجل على الحساب'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-light font-semibold block">حالة الدفع:</span>
                  <span className="font-semibold text-slate-800">
                    {(data as any).paidAmount >= data.totalAmount ? 'مسددة بالكامل' :
                     (data as any).paidAmount > 0 ? `مدفوع جزئي (${(data as any).paidAmount} ${currencySymbol})` : 'آجلة'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <th className="py-2 px-3 w-10 text-center">م</th>
                  <th className="py-2 px-3">بيان الصنف والمواصفات</th>
                  <th className="py-2 px-3 w-24 text-center font-mono">الكمية</th>
                  <th className="py-2 px-3 w-28 text-left font-mono">سعر الوحدة ({currencySymbol})</th>
                  <th className="py-2 px-3 w-28 text-left font-mono">الإجمالي ({currencySymbol})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {data.items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{it.itemName}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">{it.quantity}</td>
                    <td className="py-2 px-3 text-left font-mono">{it.unitPrice.toFixed(2)}</td>
                    <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">{it.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="flex-1 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 w-full sm:w-auto">
              <span className="font-bold text-slate-700 text-xs block">المبلغ الإجمالي كتابةً:</span>
              <p className="font-medium text-slate-800 bg-white p-2 rounded border border-slate-200 text-xs">
                {totalInWords}
              </p>
              {data.notes && (
                <p className="text-[10px] text-slate-400 font-light pt-1">
                  <strong>ملاحظات:</strong> {data.notes}
                </p>
              )}
            </div>

            <div className="w-full sm:w-64 space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-xs">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span className="font-bold">{data.subtotal.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ضريبة القيمة المضافة ({data.taxRate || settings.vatRate}%):</span>
                <span className="font-bold">{data.taxAmount.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between text-slate-900 font-black pt-1.5 border-t border-slate-300 text-sm">
                <span>الإجمالي النهائي:</span>
                <span className="text-blue-700">{data.totalAmount.toFixed(2)} {currencySymbol}</span>
              </div>
              {!isReturn && (data as any).paidAmount !== undefined && (
                <>
                  <div className="flex justify-between text-emerald-700 pt-1 border-t border-slate-200 text-xs">
                    <span>المبلغ المسدد:</span>
                    <span>{(data as any).paidAmount.toFixed(2)} {currencySymbol}</span>
                  </div>
                  <div className="flex justify-between text-amber-800 font-bold text-xs">
                    <span>المتبقي للمورد:</span>
                    <span>{(data.totalAmount - (data as any).paidAmount).toFixed(2)} {currencySymbol}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Signatures */}
          <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-4 gap-4 text-center text-xs">
            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">أمين المستودع</span>
              <div className="h-16 flex items-end justify-center">
                <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
              </div>
            </div>
            
            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">الختم الرسمي</span>
              {settings.stampUrl ? (
                <div className="min-h-[4.2cm] flex items-center justify-center">
                  <OfficialStamp />
                </div>
              ) : (
                <div className="h-16 flex items-end justify-center">
                  <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">توقيع الإدارة / المحاسب</span>
              {settings.signatureUrl ? (
                <div className="h-16 flex items-end justify-center">
                  <img src={settings.signatureUrl} alt="Signature" className="max-h-full object-contain mix-blend-multiply opacity-80" />
                </div>
              ) : (
                <div className="h-16 flex items-end justify-center">
                  <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">مندوب المورد</span>
              <div className="h-16 flex items-end justify-center">
                <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
