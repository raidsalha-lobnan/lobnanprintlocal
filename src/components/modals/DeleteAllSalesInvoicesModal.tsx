import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { DeleteAllSalesInvoicesOptions, DeleteAllSalesInvoicesResult } from '../../types';
import {
  Trash2,
  AlertTriangle,
  RotateCcw,
  Boxes,
  Receipt,
  ArrowUpDown,
  Users,
  Wallet,
  CheckCircle2,
  X,
  ShieldAlert
} from 'lucide-react';

interface DeleteAllSalesInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteAllSalesInvoicesModal: React.FC<DeleteAllSalesInvoicesModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    invoices,
    vouchers,
    stockMovements,
    deletedInvoices,
    settings,
    deleteAllSalesInvoicesAndRelatedData
  } = useAccounting();

  const [confirmText, setConfirmText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<DeleteAllSalesInvoicesResult | null>(null);

  const [options, setOptions] = useState<DeleteAllSalesInvoicesOptions>({
    restoreStock: true,
    deleteLinkedVouchers: true,
    deleteLinkedStockMovements: true,
    deleteLinkedJournalEntries: true,
    revertCustomerBalances: true,
    revertTreasuryBalances: true,
    clearDeletedInvoicesTrash: true
  });

  // Calculate statistics of what will be affected
  const stats = useMemo(() => {
    const invCount = invoices.length;
    let totalSoldUnits = 0;
    let totalDebt = 0;
    const invIds = new Set(invoices.map(i => i.id));
    const invNumbers = new Set(invoices.map(i => i.invoiceNumber));

    invoices.forEach(inv => {
      (inv.items || []).forEach(it => {
        totalSoldUnits += Number(it.quantity) || 0;
      });
      totalDebt += Number(inv.remainingAmount) || 0;
    });

    const linkedVouchersCount = vouchers.filter(v => {
      return (
        v.id.startsWith('vch-inv-') ||
        v.voucherNumber?.startsWith('RCT-INV-') ||
        (v.referenceId && invIds.has(v.referenceId)) ||
        (v.referenceInvoiceId && invIds.has(v.referenceInvoiceId)) ||
        (v.voucherNumber && invNumbers.has(v.voucherNumber)) ||
        (v.description && (v.description.includes('فاتورة مبيعات') || v.description.includes('سند تحصيل فوري')))
      );
    }).length;

    const linkedMovementsCount = stockMovements.filter(sm => {
      return (
        sm.type === 'out_sale' ||
        sm.referenceType === 'pos_invoice' ||
        (sm.referenceNumber && invNumbers.has(sm.referenceNumber)) ||
        (sm.referenceId && invIds.has(sm.referenceId))
      );
    }).length;

    return {
      invCount,
      totalSoldUnits,
      totalDebt,
      linkedVouchersCount,
      linkedMovementsCount,
      trashCount: deletedInvoices?.length || 0
    };
  }, [invoices, vouchers, stockMovements, deletedInvoices]);

  if (!isOpen) return null;

  const handleExecute = () => {
    if (confirmText.trim() !== 'حذف' && confirmText.trim() !== 'تأكيد' && confirmText.trim() !== 'delete') {
      return;
    }
    setIsExecuting(true);
    try {
      const res = deleteAllSalesInvoicesAndRelatedData(options);
      setResult(res);
      setConfirmText('');
    } catch (err: any) {
      alert('حدث خطأ أثناء تنفيذ الحذف: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setConfirmText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-700 via-rose-800 to-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-rose-200 shadow-inner">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                حذف كافة فواتير المبيعات وتصفير ملحقاتها
              </h3>
              <p className="text-xs text-rose-200 mt-0.5">
                تصفير كامل لسجل المبيعات مع استرجاع المخزون وحذف السندات المرتبطة
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-rose-200 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          
          {result ? (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 text-center space-y-4 animate-scaleUp">
              <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-black text-emerald-900">
                  تمت عملية الحذف والتنظيف بنجاح تام!
                </h4>
                <p className="text-xs text-emerald-700 mt-1.5 max-w-md mx-auto leading-relaxed">
                  {result.message}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-right">
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                  <div className="text-slate-400 text-[10px]">فواتير محذوفة</div>
                  <div className="text-base font-black text-slate-900 font-mono mt-0.5">{result.deletedInvoicesCount}</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                  <div className="text-slate-400 text-[10px]">وحدات مخزون مسترجعة</div>
                  <div className="text-base font-black text-emerald-700 font-mono mt-0.5">{result.restoredTotalUnits}</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                  <div className="text-slate-400 text-[10px]">سندات قبض محذوفة</div>
                  <div className="text-base font-black text-rose-700 font-mono mt-0.5">{result.deletedVouchersCount}</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                  <div className="text-slate-400 text-[10px]">حركات مخزون محذوفة</div>
                  <div className="text-base font-black text-amber-700 font-mono mt-0.5">{result.deletedMovementsCount}</div>
                </div>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer mt-3"
              >
                إغلاق والعودة لقائمة الفواتير
              </button>
            </div>
          ) : (
            <>
              {/* Warning box */}
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3 text-rose-900">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">تنبيه حاسم لا يمكن التراجع عنه:</div>
                  <p className="text-[11px] text-rose-700 leading-relaxed">
                    سيتم حذف كافة فواتير المبيعات المسجلة في النظام ومسح وثائقها السحابية. يوصى بتأكيد استرجاع كميات المخزون للأصناف لضمان عودة رصيد المخزن إلى حالته الدقيقة قبل هذه المبيعات.
                  </p>
                </div>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>فواتير المبيعات النشطة</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-1">
                    {stats.invCount} <span className="text-[11px] text-slate-500 font-normal">فاتورة</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                    <span>كميات الأصناف المباعة</span>
                  </div>
                  <div className="text-lg font-black text-emerald-700 font-mono mt-1">
                    {stats.totalSoldUnits} <span className="text-[11px] text-slate-500 font-normal">قطعة ستُعاد للمخزن</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <Receipt className="w-3.5 h-3.5 text-blue-600" />
                    <span>سندات القبض المرتبطة</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-1">
                    {stats.linkedVouchersCount} <span className="text-[11px] text-slate-500 font-normal">سند</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
                    <span>حركات صرف المبيعات</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-1">
                    {stats.linkedMovementsCount} <span className="text-[11px] text-slate-500 font-normal">حركة</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ديون فواتير الأجل للتسوية</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-1">
                    {stats.totalDebt.toLocaleString('ar-SA')} <span className="text-[11px] text-slate-500 font-normal">{settings.currency}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                    <span>فواتير سلة المحذوفات</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-1">
                    {stats.trashCount} <span className="text-[11px] text-slate-500 font-normal">فاتورة</span>
                  </div>
                </div>
              </div>

              {/* Action Details Checkboxes */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="font-bold text-slate-900 text-xs mb-1">
                  الإجراءات المرتبطة التي سيتم تنفيذها تلقائياً:
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.restoreStock}
                    onChange={e => setOptions(o => ({ ...o, restoreStock: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">استرجاع كميات المخزون للأصناف المباعة</span>
                    <p className="text-[10px] text-slate-500">إضافة الكميات المباعة مجدداً إلى كرتات الأصناف والمستودعات المسندة</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.deleteLinkedVouchers}
                    onChange={e => setOptions(o => ({ ...o, deleteLinkedVouchers: e.target.checked }))}
                    className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">حذف سندات القبض والدفع التابعة لفواتير المبيعات</span>
                    <p className="text-[10px] text-slate-500">حذف سندات التحصيل الفوري (RCT-INV) المرتبطة بهذه الفواتير</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.deleteLinkedStockMovements}
                    onChange={e => setOptions(o => ({ ...o, deleteLinkedStockMovements: e.target.checked }))}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">حذف حركات المخزون الناتجة عن المبيعات (صرف مبيعات)</span>
                    <p className="text-[10px] text-slate-500">تنظيف سجل حركات المخزن من عمليات الصرف الخاصة بالفواتير المحذوفة</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.revertCustomerBalances}
                    onChange={e => setOptions(o => ({ ...o, revertCustomerBalances: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">تسوية ذمم العملاء وإلغاء مديونيات فواتير الأجل</span>
                    <p className="text-[10px] text-slate-500">خصم المبالغ المتبقية من أرصدة العملاء حتى لا تبقى ديون لفواتير محذوفة</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.revertTreasuryBalances}
                    onChange={e => setOptions(o => ({ ...o, revertTreasuryBalances: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">تسوية أرصدة وحركات الصناديق النقدية والبنكية</span>
                    <p className="text-[10px] text-slate-500">حذف التحصيلات النقدية من حركة الصناديق وتعديل الرصيد وفقاً لذلك</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.clearDeletedInvoicesTrash}
                    onChange={e => setOptions(o => ({ ...o, clearDeletedInvoicesTrash: e.target.checked }))}
                    className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">تفريغ سلة الفواتير المحذوفة نهائياً</span>
                    <p className="text-[10px] text-slate-500">مسح الفواتير السابقة الموجودة في سلة المهملات وعدم إبقائها</p>
                  </div>
                </label>
              </div>

              {/* Confirmation input */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <label className="block font-bold text-slate-800 text-xs">
                  للتأكيد، اكتب كلمة <span className="text-rose-600 font-mono font-black text-sm">"حذف"</span> في الحقل أدناه:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder='اكتب كلمة "حذف" هنا لتأكيد العملية'
                  className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-bold"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  إلغاء وتراجع
                </button>
                <button
                  type="button"
                  disabled={
                    (confirmText.trim() !== 'حذف' && confirmText.trim() !== 'تأكيد' && confirmText.trim() !== 'delete') ||
                    isExecuting
                  }
                  onClick={handleExecute}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  {isExecuting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>جارٍ الحذف والاسترجاع...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>تأكيد الحذف الشامل واسترجاع المخزون</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
};
