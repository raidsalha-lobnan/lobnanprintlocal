import React, { useState } from 'react';
import { Invoice, InvoiceTechnicalNote } from '../../types';
import {
  X,
  MessageSquare,
  Send,
  User,
  Clock,
  Wrench,
  CheckCircle2
} from 'lucide-react';
import { posSound } from '../../utils/audio';

interface WorkshopTechnicalNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onAddNote: (invoiceId: string, text: string) => void;
  currentUserName: string;
}

export const WorkshopTechnicalNoteModal: React.FC<WorkshopTechnicalNoteModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onAddNote,
  currentUserName
}) => {
  const [newNoteText, setNewNoteText] = useState('');
  const [successPing, setSuccessPing] = useState(false);

  if (!isOpen || !invoice) return null;

  const notesList: InvoiceTechnicalNote[] = invoice.technicalNotes || [];

  const handleSendNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    onAddNote(invoice.id, newNoteText.trim());
    posSound.beep();
    setNewNoteText('');
    setSuccessPing(true);
    setTimeout(() => setSuccessPing(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">الملاحظات الفنية للورشة</h3>
                <span className="bg-indigo-900/80 text-indigo-200 border border-indigo-700/60 text-xs px-2 py-0.5 rounded font-mono font-semibold">
                  فاتورة {invoice.invoiceNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                العميل: <strong className="text-slate-200">{invoice.customerName}</strong>
                {invoice.subCustomerName && (
                  <span className="text-slate-400 mr-2">({invoice.subCustomerName})</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Technical Notes Timeline */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 pb-1 border-b border-slate-200">
            <span>سجل التوجيهات والملاحظات الفنية ({notesList.length})</span>
            <span className="text-[10px] text-slate-400 font-light font-normal">تسجل مع اسم الفني وتوقيت الإضافة</span>
          </div>

          {notesList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30 text-indigo-500" />
              <p className="text-xs font-medium">لا توجد ملاحظات فنية مسجلة على هذه الفاتورة حتى الآن</p>
              <p className="text-[11px] text-slate-400 mt-1">
                يمكن للفني أو المشرف كتابة ملاحظة تقنية بخصوص الماكينة، الخامات، أو وقت التشغيل أدناه.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notesList.map((nt) => (
                <div
                  key={nt.id}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2 text-right"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-light border-b border-slate-100 pb-1.5">
                    <div className="flex items-center gap-1.5 text-indigo-900 font-bold">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{nt.userName || 'فني الورشة'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{nt.createdAt}</span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {nt.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Note input form */}
        <form onSubmit={handleSendNote} className="p-4 bg-white border-t border-slate-200 space-y-3">
          {successPing && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>تم تسجيل وحفظ الملاحظة الفنية بنجاح!</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              إضافة ملاحظة فنية جديدة:
            </label>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="اكتب الملاحظة الفنية هنا (مثال: تم تجهيز زنكة الذهب، السحب على ماكينة 2، فحص دقة القص...)"
              className="w-full bg-slate-50 border border-slate-300 focus:border-indigo-500 focus:bg-white rounded-lg p-2.5 text-xs text-slate-800 outline-none transition-all resize-none min-h-[75px]"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              المستخدم الحالي: <strong className="text-slate-600">{currentUserName}</strong>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="submit"
                disabled={!newNoteText.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 rotate-180" />
                <span>حفظ الملاحظة</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
