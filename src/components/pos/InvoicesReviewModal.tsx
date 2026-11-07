import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Invoice } from '../../types';
import { X, Search, Printer, Calendar, ArrowRight, Eye, Trash2, History, ShieldAlert } from 'lucide-react';
import { InvoiceStatusHistoryModal } from './InvoiceStatusHistoryModal';
import { InvoiceAuditLogModal } from './InvoiceAuditLogModal';
import { DeletedInvoicesModal } from './DeletedInvoicesModal';
import { getInvoiceWorkflowStatusMeta } from '../../utils/invoiceStatusUtils';
import { getAllStoredDraftsAsInvoices } from '../../utils/draftsHelper';
import { formatDateDisplay } from '../../utils/dateUtils';
import { formatInvoiceCustomerDisplay } from '../../utils/partyUtils';

interface InvoicesReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadInvoiceToScreen?: (invoice: Invoice) => void;
}

export const InvoicesReviewModal: React.FC<InvoicesReviewModalProps> = ({
  isOpen,
  onClose,
  onLoadInvoiceToScreen
}) => {
  const { invoices, setSelectedInvoiceForPrint, deleteInvoice, settings, deletedInvoices, parties } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [viewInvoiceDetails, setViewInvoiceDetails] = useState<Invoice | null>(null);
  const [statusModalInvoice, setStatusModalInvoice] = useState<Invoice | null>(null);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [isDeletedInvoicesOpen, setIsDeletedInvoicesOpen] = useState(false);
  const [auditTargetInvoiceId, setAuditTargetInvoiceId] = useState('29');

  const [draftsVersion, setDraftsVersion] = useState(0);

  React.useEffect(() => {
    const handleUpdate = () => setDraftsVersion(v => v + 1);
    window.addEventListener('accounting_drafts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('accounting_drafts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const allInvoicesAndDrafts = useMemo(() => {
    if (filterPayment === 'draft') {
      const drafts = getAllStoredDraftsAsInvoices();
      return drafts;
    }
    return invoices;
  }, [invoices, isOpen, draftsVersion, filterPayment]);

  if (!isOpen) return null;

  const filtered = allInvoicesAndDrafts
    .filter(inv => {
      const formattedCust = formatInvoiceCustomerDisplay(inv, parties).toLowerCase();
      const lowerSearch = searchTerm.toLowerCase();
      const matchesSearch =
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(lowerSearch)) ||
        (inv.customerName && inv.customerName.toLowerCase().includes(lowerSearch)) ||
        (inv.subCustomerName && inv.subCustomerName.toLowerCase().includes(lowerSearch)) ||
        formattedCust.includes(lowerSearch) ||
        (inv.notes && inv.notes.toLowerCase().includes(lowerSearch));

      const isDraft = (inv as any).isDraft || inv.workflowStatus === ('draft' as any) || inv.status === ('draft' as any);
      const matchesPayment =
        filterPayment === 'all'
          ? !isDraft
          : (filterPayment === 'draft' ? isDraft : (!isDraft && inv.paymentMethod === filterPayment));

      return matchesSearch && matchesPayment;
    })
    .sort((a, b) => {
      const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numB - numA;
      const strCmp = (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
      if (strCmp !== 0) return strCmp;
      const createdCmp = (b.createdAt || '').localeCompare(a.createdAt || '');
      if (createdCmp !== 0) return createdCmp;
      return (b.date || '').localeCompare(a.date || '');
    });

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-blue-800 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-700 rounded-lg">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">مراجعة وسجل فواتير المبيعات</h3>
              <p className="text-[11px] text-blue-200">استعراض وتصفية وطباعة الفواتير السابقة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3 text-xs">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="ابحث برقم الفاتورة، اسم العميل، الملاحظات..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">نوع الدفع:</span>
            <select
              value={filterPayment}
              onChange={e => setFilterPayment(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white font-semibold"
            >
              <option value="all">الكل</option>
              <option value="draft">المسودات 📝</option>
              <option value="cash">نقدي</option>
              <option value="card">شبكة / فيزا</option>
              <option value="credit">آجل</option>
            </select>
          </div>

          <div className="text-slate-500 font-mono">
            العدد: <span className="font-bold text-slate-800">{filtered.length}</span>
          </div>

          <div className="flex items-center gap-2 mr-auto">
            <button
              type="button"
              onClick={() => setIsDeletedInvoicesOpen(true)}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="عرض فواتير المبيعات المحذوفة مع إمكانية تعديلها واستعادتها فوراً"
            >
              <Trash2 className="w-4 h-4 text-amber-700" />
              <span>الفواتير المحذوفة</span>
              {(deletedInvoices?.length || 0) > 0 && (
                <span className="bg-amber-500 text-slate-950 text-[11px] font-black px-1.5 py-0.2 rounded-full font-mono">
                  {deletedInvoices.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuditTargetInvoiceId('29');
                setIsAuditLogOpen(true);
              }}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="استعراض سجلات حذف الفواتير في قاعدة البيانات (Audit Log)"
            >
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>سجل الحذف (Audit Log)</span>
            </button>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="p-4 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              لا توجد فواتير مطابقة لخيارات البحث.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-2.5">رقم الفاتورة</th>
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">اسم العميل</th>
                    <th className="p-2.5">عدد البنود</th>
                    <th className="p-2.5 text-left">المجموع</th>
                    <th className="p-2.5 text-left">المدفوع</th>
                    <th className="p-2.5 text-left">المتبقي</th>
                    <th className="p-2.5 text-center">طريقة الدفع</th>
                    <th className="p-2.5 text-center">مرحلة الفاتورة</th>
                    <th className="p-2.5 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filtered.map((inv, idx) => {
                    const wfMeta = getInvoiceWorkflowStatusMeta(inv.workflowStatus);
                    return (
                      <tr key={`rev-inv-${inv.id || idx}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 font-bold text-blue-700">{inv.invoiceNumber}</td>
                        <td className="p-2.5 text-slate-600 font-sans text-[11px]">{formatDateDisplay(inv.date)}</td>
                        <td className="p-2.5 font-sans font-semibold text-slate-800" title={formatInvoiceCustomerDisplay(inv, parties)}>
                          {formatInvoiceCustomerDisplay(inv, parties)}
                        </td>
                        <td className="p-2.5 text-slate-600">{inv.items?.length || 0}</td>
                        <td className="p-2.5 text-left font-bold">{(Number(inv.totalAmount) || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-left text-emerald-600">{(Number(inv.paidAmount) || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-left text-rose-600 font-bold">{(Number(inv.remainingAmount) || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            inv.paymentMethod === 'credit' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {inv.paymentMethod === 'cash' ? 'نقدي' : inv.paymentMethod === 'card' ? 'شبكة' : 'آجل'}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${wfMeta.badgeBg} ${wfMeta.badgeText} ${wfMeta.badgeBorder} inline-flex items-center gap-1`}
                            title={wfMeta.description}
                          >
                            <span>{wfMeta.label}</span>
                            <span className="text-[9px] font-mono">{wfMeta.isAccounting ? '●' : '○'}</span>
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setStatusModalInvoice(inv)}
                              title={`عرض وتوثيق سجل الحالات (${inv.statusHistory?.length || 1})`}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            >
                              <History className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                            <button
                              onClick={() => setSelectedInvoiceForPrint(inv)}
                              title="طباعة الفاتورة"
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {onLoadInvoiceToScreen && (
                              <button
                                onClick={() => {
                                  onLoadInvoiceToScreen(inv);
                                  onClose();
                                }}
                                title="عرض/تحميل على شاشة الكاشير"
                                className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm(`هل أنت متأكد من حذف الفاتورة ${inv.invoiceNumber}؟`)) {
                                  deleteInvoice(inv.id);
                                }
                              }}
                              title="حذف الفاتورة"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
          <span className="text-slate-500">
            إجمالي قيمة الفواتير المعروضة: <span className="font-bold text-slate-800 font-mono">{filtered.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0).toFixed(2)} {settings.currency}</span>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* Status History Modal */}
      {statusModalInvoice && (
        <InvoiceStatusHistoryModal
          invoice={statusModalInvoice}
          isOpen={!!statusModalInvoice}
          onClose={() => setStatusModalInvoice(null)}
        />
      )}

      {/* Delete Audit Log Modal */}
      <InvoiceAuditLogModal
        isOpen={isAuditLogOpen}
        onClose={() => setIsAuditLogOpen(false)}
        initialInvoiceId={auditTargetInvoiceId || '29'}
      />

      {/* Deleted Invoices Modal (Recycle Bin / Restore & Edit) */}
      <DeletedInvoicesModal
        isOpen={isDeletedInvoicesOpen}
        onClose={() => setIsDeletedInvoicesOpen(false)}
        onLoadInvoiceToScreen={inv => {
          if (onLoadInvoiceToScreen) {
            onLoadInvoiceToScreen(inv);
            onClose();
          }
        }}
      />
    </div>
  );
};
