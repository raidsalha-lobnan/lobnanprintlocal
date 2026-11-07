import React, { useState } from 'react';
import { Invoice, PosInvoiceWorkflowStatus, InvoiceStatusLog } from '../../types';
import { useAccounting } from '../../context/AccountingContext';
import {
  WORKFLOW_STATUS_OPTIONS,
  getInvoiceWorkflowStatusMeta
} from '../../utils/invoiceStatusUtils';
import {
  Clock,
  User,
  Calendar,
  FileText,
  CheckCircle2,
  AlertCircle,
  History,
  ArrowLeft,
  X,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { posSound } from '../../utils/audio';

interface InvoiceStatusHistoryModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  initialTargetStatus?: PosInvoiceWorkflowStatus;
}

export const InvoiceStatusHistoryModal: React.FC<InvoiceStatusHistoryModalProps> = ({
  invoice,
  isOpen,
  onClose,
  initialTargetStatus
}) => {
  const { updateInvoice, currentUser } = useAccounting();

  const currentWf = invoice?.workflowStatus || 'new';
  const [selectedStatus, setSelectedStatus] = useState<PosInvoiceWorkflowStatus>(
    initialTargetStatus || currentWf
  );
  const [changeNote, setChangeNote] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'change' | 'history'>('change');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Synchronize when opened with initialTargetStatus or invoice changes
  React.useEffect(() => {
    if (invoice) {
      setSelectedStatus(initialTargetStatus || invoice.workflowStatus || 'new');
      setChangeNote('');
      if (initialTargetStatus && initialTargetStatus !== (invoice.workflowStatus || 'new')) {
        setActiveTab('change');
      }
    }
  }, [invoice, initialTargetStatus, isOpen]);

  if (!isOpen || !invoice) return null;

  const currentMeta = getInvoiceWorkflowStatusMeta(currentWf);
  const targetMeta = getInvoiceWorkflowStatusMeta(selectedStatus);

  // Compile full history list (reverse chronological, newest first)
  const historyList: InvoiceStatusLog[] = (invoice.statusHistory && invoice.statusHistory.length > 0)
    ? [...invoice.statusHistory].reverse()
    : [
        {
          id: 'st-init-' + invoice.id,
          userName: invoice.userName || 'النظام / كاشير',
          userId: invoice.userId,
          date: invoice.date || new Date().toISOString().split('T')[0],
          time: 'البداية',
          previousStatus: currentWf,
          newStatus: currentWf,
          notes: 'إنشاء الفاتورة وتثبيتها في النظام',
          createdAt: invoice.date
        }
      ];

  const handleSaveStatusChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStatus === currentWf && !changeNote.trim()) {
      alert('الرجاء اختيار حالة جديدة أو كتابة ملاحظة لتسجيلها في سجل الفاتورة.');
      return;
    }

    setIsSubmitting(true);
    try {
      updateInvoice(
        invoice.id,
        {
          workflowStatus: selectedStatus
        },
        {
          notes: changeNote.trim() || undefined,
          userName: currentUser?.fullName || 'المستخدم',
          userId: currentUser?.id
        }
      );

      posSound.playSuccessBeep();
      setChangeNote('');
      setActiveTab('history');
    } catch (err) {
      console.error('Error saving invoice status change:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl text-xs text-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm">توثيق وسجل حالات الفاتورة #{invoice.invoiceNumber}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${currentMeta.badgeBg} ${currentMeta.badgeText} ${currentMeta.badgeBorder}`}>
                  الحالية: {currentMeta.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                العميل: <strong className="text-white">{invoice.customerName}</strong>
                {invoice.subCustomerName && <span className="text-amber-300 mr-2">(زبون فرعي: {invoice.subCustomerName})</span>}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('change')}
            className={`pb-2 px-3 font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'change'
                ? 'border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>تغيير وتوثيق الحالة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2 px-3 font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل التغييرات ({historyList.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'change' ? (
            <form onSubmit={handleSaveStatusChange} className="space-y-4">
              {/* Audit System Information Banner */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-slate-700">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold text-[11px]">
                    المستخدم المسؤول عن التسجيل: <strong className="text-blue-900">{currentUser?.fullName}</strong> ({currentUser?.roleName})
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {new Date().toISOString().split('T')[0]}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Status Selector Grid */}
              <div className="space-y-2">
                <label className="font-bold text-slate-700 flex items-center justify-between">
                  <span>اختر الحالة الجديدة للفاتورة:</span>
                  <span className="text-[9px] text-slate-400 font-light font-normal">
                    الحالة السابقة: <strong className="text-slate-800">{currentMeta.label}</strong>
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {WORKFLOW_STATUS_OPTIONS.map(opt => {
                    const optMeta = getInvoiceWorkflowStatusMeta(opt.id);
                    const isSelected = selectedStatus === opt.id;
                    const isCurrent = currentWf === opt.id;

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedStatus(opt.id)}
                        className={`p-2.5 rounded-xl border text-right font-bold transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? 'ring-2 ring-blue-600 bg-blue-50/70 border-blue-400 shadow-xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${opt.isAccounting ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span className={`text-xs ${isSelected ? 'text-blue-900 font-black' : optMeta.color}`}>
                              {opt.label}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-normal">
                                الحالية
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                              opt.isAccounting ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {opt.isAccounting ? '● محاسبي' : '○ غير محاسبي'}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-light font-normal leading-tight">
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note / Reason Field (الملاحظة) */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="font-bold text-slate-800 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>الملاحظة (سبب التغيير / توجيهات التنفيذ):</span>
                </label>
                <textarea
                  value={changeNote}
                  onChange={e => setChangeNote(e.target.value)}
                  placeholder="اكتب ملاحظة توثيقية حول سبب تغيير الحالة، موافقة الزبون، ملاحظات المطبعة أو التسليم..."
                  rows={2}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <span className="text-[9px] text-slate-400 font-light block">
                  * سيتم حفظ هذه الملاحظة وتوثيقها باسمك وتاريخ ووقت العملية في السجل الدائم للنظام.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأكيد وحفظ تغيير الحالة في النظام</span>
                </button>
              </div>
            </form>
          ) : (
            /* Audit Log / History View */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-blue-600" />
                  <span>سجل تغييرات حالات الفاتورة المسجلة في النظام:</span>
                </h4>
                <span className="text-[10px] text-slate-400 font-light font-mono">
                  إجمالي التغييرات: {historyList.length}
                </span>
              </div>

              <div className="space-y-2">
                {historyList.map((log, index) => {
                  const prevMeta = getInvoiceWorkflowStatusMeta(log.previousStatus);
                  const newMeta = getInvoiceWorkflowStatusMeta(log.newStatus);

                  return (
                    <div
                      key={log.id || index}
                      className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:border-blue-300 transition-all space-y-2"
                    >
                      {/* Top Bar: User + Date + Time */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                            <User className="w-3 h-3" />
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] block">المستخدم:</span>
                            <strong className="text-slate-900 font-bold text-xs">
                              {log.userName || 'المستخدم'}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <strong>{log.date}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <strong>{log.time}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Status Transition: Previous -> New */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[10px]">الحالة السابقة:</span>
                          <span className={`px-2 py-0.5 rounded font-bold border ${prevMeta.badgeBg} ${prevMeta.badgeText} ${prevMeta.badgeBorder}`}>
                            {prevMeta.label}
                          </span>
                        </div>

                        <ArrowLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[10px]">الحالة الجديدة:</span>
                          <span className={`px-2 py-0.5 rounded font-bold border ${newMeta.badgeBg} ${newMeta.badgeText} ${newMeta.badgeBorder}`}>
                            {newMeta.label}
                          </span>
                          <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${newMeta.isAccounting ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {newMeta.isAccounting ? '● محاسبي' : '○ غير محاسبي'}
                          </span>
                        </div>
                      </div>

                      {/* Note (الملاحظة) */}
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700">
                        <span className="text-slate-500 font-bold text-[10px] block mb-0.5">الملاحظة:</span>
                        <p className="text-xs text-slate-800 whitespace-pre-wrap">
                          {log.notes && log.notes.trim() ? log.notes : <span className="text-slate-400 italic">لا توجد ملاحظة مدونة</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('change')}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>تغيير الحالة مرة أخرى</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
