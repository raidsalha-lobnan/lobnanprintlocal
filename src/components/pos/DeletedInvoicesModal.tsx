import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Invoice } from '../../types';
import {
  X,
  Search,
  Trash2,
  RotateCcw,
  Edit3,
  Eye,
  Calendar,
  User,
  AlertCircle,
  FileText,
  DollarSign,
  Layers,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { formatDateDisplay } from '../../utils/dateUtils';
import { posSound } from '../../utils/audio';
import { formatInvoiceCustomerDisplay } from '../../utils/partyUtils';

interface DeletedInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadInvoiceToScreen?: (invoice: Invoice) => void;
}

export const DeletedInvoicesModal: React.FC<DeletedInvoicesModalProps> = ({
  isOpen,
  onClose,
  onLoadInvoiceToScreen
}) => {
  const { deletedInvoices, restoreDeletedInvoice, permanentlyDeleteInvoice, settings, parties } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewInvoiceDetails, setViewInvoiceDetails] = useState<Invoice | null>(null);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return (deletedInvoices || []).filter(inv => {
      if (!inv) return false;
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;

      const formattedCust = formatInvoiceCustomerDisplay(inv, parties).toLowerCase();

      return (
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(term)) ||
        (inv.customerName && inv.customerName.toLowerCase().includes(term)) ||
        (inv.subCustomerName && inv.subCustomerName.toLowerCase().includes(term)) ||
        formattedCust.includes(term) ||
        (inv.deletedBy && inv.deletedBy.toLowerCase().includes(term)) ||
        (inv.deletionReason && inv.deletionReason.toLowerCase().includes(term)) ||
        (inv.notes && inv.notes.toLowerCase().includes(term))
      );
    });
  }, [deletedInvoices, searchTerm, parties]);

  if (!isOpen) return null;

  // استعادة الفاتورة وإبقائها كنشطة
  const handleRestoreOnly = async (inv: Invoice) => {
    if (!confirm(`هل ترغب في استعادة فاتورة المبيعات رقم (${inv.invoiceNumber}) وإعادتها لقائمة الفواتير النشطة؟`)) {
      return;
    }

    setIsRestoringId(inv.id);
    try {
      await restoreDeletedInvoice(inv.id);
      posSound.success();
    } catch (err) {
      console.error('Error restoring invoice:', err);
      alert('حدث خطأ أثناء استعادة الفاتورة.');
    } finally {
      setIsRestoringId(null);
    }
  };

  // استعادة الفاتورة وفتحها مباشرة في شاشة الكاشير للتعديل عليها
  const handleRestoreAndEditInPos = async (inv: Invoice) => {
    setIsRestoringId(inv.id);
    try {
      const restored = await restoreDeletedInvoice(inv.id);
      posSound.beep();
      if (restored && onLoadInvoiceToScreen) {
        onLoadInvoiceToScreen(restored);
        onClose();
      }
    } catch (err) {
      console.error('Error restoring and editing invoice:', err);
      alert('حدث خطأ أثناء استعادة وتعديل الفاتورة.');
    } finally {
      setIsRestoringId(null);
    }
  };

  // حذف نهائي من سلة المحذوفات
  const handlePermanentDelete = async (inv: Invoice) => {
    if (!confirm(`تحذير نهائي:\nهل ترغب في مسح الفاتورة رقم (${inv.invoiceNumber}) نهائياً وبشكل لا يمكن التراجع عنه؟`)) {
      return;
    }
    try {
      await permanentlyDeleteInvoice(inv.id);
      posSound.beep();
    } catch (err) {
      console.error('Error permanently deleting invoice:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-900 via-rose-900 to-slate-900 text-white px-5 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 border border-white/20 rounded-xl text-amber-300 shadow-inner">
              <Trash2 className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <span>سلة فواتير المبيعات المحذوفة</span>
                <span className="text-xs bg-amber-400 text-slate-950 font-black px-2.5 py-0.5 rounded-full">
                  {deletedInvoices.length} فاتورة محذوفة
                </span>
              </h3>
              <p className="text-[11px] text-amber-200">
                استعراض فواتير المبيعات التي تم حذفها مع إمكانية استعادتها وتعديلها وإعادتها للنظام
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-xl hover:bg-white/10 cursor-pointer transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="ابحث برقم الفاتورة، اسم العميل، المستخدم الحاذف، السبب..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span>النتائج المعروضة:</span>
            <strong className="text-slate-900 font-mono text-sm">{filtered.length}</strong>
          </div>
        </div>

        {/* Main List */}
        <div className="p-4 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <Trash2 className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 mb-1">
                سلة الفواتير المحذوفة فارغة
              </h4>
              <p className="text-xs text-slate-400 max-w-md">
                {searchTerm
                  ? `لا توجد فواتير محذوفة مطابقة لكلمة البحث "${searchTerm}".`
                  : 'أي فاتورة يتم حذفها من شاشة الكاشير أو مراجعة الفواتير ستظهر هنا لتتمكن من استعادتها وتعديلها وإعادتها فوراً.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-3">رقم الفاتورة</th>
                    <th className="p-3">العميل</th>
                    <th className="p-3">تاريخ الفاتورة</th>
                    <th className="p-3 text-left">إجمالي المبلغ</th>
                    <th className="p-3">بيانات الحذف (المستخدم / التاريخ)</th>
                    <th className="p-3">سبب الحذف</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((inv, idx) => {
                    const isRestoring = isRestoringId === inv.id;

                    return (
                      <tr
                        key={`del-inv-${inv.id || idx}-${idx}`}
                        className="hover:bg-amber-50/50 transition-colors"
                      >
                        {/* 1. رقم الفاتورة */}
                        <td className="p-3 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-xs">
                              {inv.invoiceNumber}
                            </span>
                            {inv.type === 'print_order' && (
                              <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded font-sans">
                                مطبعة
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. العميل */}
                        <td className="p-3 font-semibold text-slate-800" title={formatInvoiceCustomerDisplay(inv, parties)}>
                          <div>{formatInvoiceCustomerDisplay(inv, parties)}</div>
                        </td>

                        {/* 3. تاريخ الفاتورة */}
                        <td className="p-3 font-mono text-slate-600">
                          {formatDateDisplay(inv.date)}
                        </td>

                        {/* 4. إجمالي المبلغ */}
                        <td className="p-3 text-left font-mono font-black text-sm text-slate-900">
                          {(Number(inv.totalAmount) || 0).toFixed(2)}
                          <span className="text-[10px] text-slate-500 font-normal mr-1">
                            {inv.currencySymbol || settings.currency || '₪'}
                          </span>
                        </td>

                        {/* 5. بيانات الحذف */}
                        <td className="p-3 text-[11px]">
                          <div className="flex items-center gap-1 font-bold text-rose-800">
                            <User className="w-3 h-3 text-rose-600" />
                            <span>{inv.deletedBy || 'مستخدم النظام'}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {inv.deletedAt || 'غير مسجل'}
                          </div>
                        </td>

                        {/* 6. سبب الحذف */}
                        <td className="p-3 text-[11px] text-slate-600 max-w-[180px] truncate" title={inv.deletionReason || inv.notes}>
                          {inv.deletionReason || inv.notes || 'حذف يدوي'}
                        </td>

                        {/* 7. الإجراءات */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* زر استعادة وتعديل في الكاشير */}
                            {onLoadInvoiceToScreen && (
                              <button
                                type="button"
                                disabled={isRestoring}
                                onClick={() => handleRestoreAndEditInPos(inv)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                                title="استعادة الفاتورة وفتحها مباشرة في شاشة الكاشير للتعديل وإعادة الحفظ"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>تعديل واسترجاع</span>
                              </button>
                            )}

                            {/* زر استعادة سريعة فقط */}
                            <button
                              type="button"
                              disabled={isRestoring}
                              onClick={() => handleRestoreOnly(inv)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                              title="استعادة الفاتورة وإعادتها لقائمة الفواتير النشطة مباشرة"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>استعادة</span>
                            </button>

                            {/* معاينة التفاصيل */}
                            <button
                              type="button"
                              onClick={() => setViewInvoiceDetails(inv)}
                              className="p-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg cursor-pointer transition-colors"
                              title="معاينة تفاصيل الفاتورة وبنودها"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* حذف نهائي */}
                            <button
                              type="button"
                              onClick={() => handlePermanentDelete(inv)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer transition-colors"
                              title="حذف نهائي لا يمكن التراجع عنه"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>يمكنك استعادة أي فاتورة محذوفة أو فتحها في الكاشير لتعديل الكميات والأسعار وإعادة حفظها.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>

      {/* Details Preview Modal */}
      {viewInvoiceDetails && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-slate-800">
            <div className="bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-300" />
                <h4 className="font-bold text-sm">
                  تفاصيل الفاتورة المحذوفة (#{viewInvoiceDetails.invoiceNumber})
                </h4>
              </div>
              <button
                onClick={() => setViewInvoiceDetails(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500">العميل:</div>
                  <div className="font-bold text-slate-900">{viewInvoiceDetails.customerName}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">التاريخ:</div>
                  <div className="font-mono font-bold text-slate-900">{formatDateDisplay(viewInvoiceDetails.date)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">الإجمالي:</div>
                  <div className="font-mono font-black text-blue-700">{(Number(viewInvoiceDetails.totalAmount) || 0).toFixed(2)} ₪</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">طريقة الدفع:</div>
                  <div className="font-bold text-slate-900">
                    {viewInvoiceDetails.paymentMethod === 'cash' ? 'نقدي' : viewInvoiceDetails.paymentMethod === 'card' ? 'شبكة/بنك' : 'آجل'}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h5 className="font-bold text-slate-700 mb-2">بنود وأصناف الفاتورة ({viewInvoiceDetails.items?.length || 0}):</h5>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="p-2">الصنف</th>
                        <th className="p-2 text-center">الكمية</th>
                        <th className="p-2 text-left">السعر</th>
                        <th className="p-2 text-left">الإجمالي</th>
                        <th className="p-2">الملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {(viewInvoiceDetails.items || []).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-sans font-bold text-slate-900">{it.itemName}</td>
                          <td className="p-2 text-center">{it.quantity} {it.unit || ''}</td>
                          <td className="p-2 text-left">{(Number(it.unitPrice) || 0).toFixed(2)}</td>
                          <td className="p-2 text-left font-bold text-blue-700">{(Number(it.total) || 0).toFixed(2)}</td>
                          <td className="p-2 font-sans text-slate-500 text-[11px]">{it.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {viewInvoiceDetails.notes && (
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-xs">
                  <span className="font-bold text-amber-900">ملاحظات الفاتورة: </span>
                  <span className="text-amber-800">{viewInvoiceDetails.notes}</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {onLoadInvoiceToScreen && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewInvoiceDetails;
                      setViewInvoiceDetails(null);
                      handleRestoreAndEditInPos(target);
                    }}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>استعادة وتعديل في الكاشير</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const target = viewInvoiceDetails;
                    setViewInvoiceDetails(null);
                    handleRestoreOnly(target);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>استعادة فقط</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewInvoiceDetails(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
