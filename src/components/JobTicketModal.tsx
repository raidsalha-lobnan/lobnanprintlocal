import React from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Printer, X, Layers, CheckCircle2, ShieldCheck } from 'lucide-react';
import { PrintHeader } from './common/PrintHeader';

export const JobTicketModal: React.FC = () => {
  const { selectedJobForTicket, setSelectedJobForTicket, settings } = useAccounting();

  if (!selectedJobForTicket) return null;

  const job = selectedJobForTicket;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print-modal-container">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto print:border-none print:shadow-none print:max-w-none print:w-full print:rounded-none print:overflow-visible">
        {/* Header Controls (Hidden during print) */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">أمر تشغيل مطبعة (Job Ticket / بطاقة ورشة)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة أمر الشغل للورشة</span>
            </button>
            <button
              onClick={() => setSelectedJobForTicket(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Ticket Body */}
        <div className="p-8 space-y-6 text-slate-900 text-xs font-sans print:p-0">
          {/* Header - يعتمد الهيدر الكامل أو الترويسة القياسية */}
          <PrintHeader
            title="بطاقة أمر تشغيل ورشة الإنتاج"
            subtitle="Workshop Production Job Ticket"
            docNumber={job.orderNumber}
            docDate={job.createdAt}
            badge="أمر تشغيل فني معتمد"
          />

          {/* Job Overview Grid */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-1.5">
              <div><span className="text-slate-500">اسم العمل / المطبوعة:</span> <strong className="text-slate-900 text-sm block">{job.title}</strong></div>
              <div><span className="text-slate-500">اسم العميل:</span> <strong>{job.customerName}</strong></div>
              <div><span className="text-slate-500">جوال التواصل:</span> <span className="font-mono">{job.customerPhone}</span></div>
            </div>
            <div className="space-y-1.5">
              <div><span className="text-slate-500">تاريخ أمر الشغل:</span> <span className="font-mono font-semibold">{job.createdAt}</span></div>
              <div><span className="text-slate-500">موعد التسليم النهائي للعميل:</span> <strong className="text-rose-600 font-mono text-sm block">{job.deadline}</strong></div>
              <div><span className="text-slate-500">حالة الشغل الحالية:</span> <span className="font-bold text-indigo-700">{job.status}</span></div>
            </div>
          </div>

          {/* Production Specifications */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 p-2.5 font-bold text-slate-900 text-xs border-b border-slate-200">
              المواصفات الفنية للتشغيل (Technical Specs)
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-slate-500 block">الكمية المطلوبة:</span>
                <strong className="text-sm font-mono text-indigo-700">{job.quantity.toLocaleString('ar-SA')} نسخة</strong>
              </div>
              <div>
                <span className="text-slate-500 block">نوع الورق والخامة:</span>
                <strong>{job.specs.paperType}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">وزن الورق / الجراماج:</span>
                <strong className="font-mono">{job.specs.paperWeight}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">المقاس والأبعاد:</span>
                <strong className="font-mono">{job.specs.dimensions}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">الألوان والوجه:</span>
                <strong>{job.specs.colors}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">السلوفان والتغطية:</span>
                <strong>{job.specs.lamination}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">التشطيب والإضافات (UV/بصمة):</span>
                <strong>{job.specs.finishing || 'بدون'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">طريقة التجليد والتقفيل:</span>
                <strong>{job.specs.binding || 'بدون'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">القص والتكسير:</span>
                <strong>{job.specs.cutting || 'قص مستقيم'}</strong>
              </div>
            </div>
          </div>

          {/* Special Notes & Instructions */}
          {job.specs.notes && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-900">
              <strong className="block mb-1">تعليمات وملاحظات العميل والتصميم:</strong>
              <p>{job.specs.notes}</p>
            </div>
          )}

          {/* Financial Summary */}
          <div className="grid grid-cols-3 gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200 font-mono text-center">
            <div>
              <span className="text-slate-500 text-[11px] block font-sans">قيمة الشغل الإجمالية:</span>
              <strong className="text-slate-900 text-sm">{job.totalCost.toFixed(2)} {settings.currency}</strong>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block font-sans">العربون المسدد:</span>
              <strong className="text-emerald-700 text-sm">{job.paidDeposit.toFixed(2)} {settings.currency}</strong>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block font-sans">المتبقي عند التسليم:</span>
              <strong className="text-rose-600 text-sm font-black">{job.remainingCost.toFixed(2)} {settings.currency}</strong>
            </div>
          </div>

          {/* Signatures for Workshop workflow */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t-2 border-slate-200 text-center">
            <div className="space-y-8">
              <span className="text-slate-500 font-semibold block">مهندس / فني التصميم</span>
              <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto"></div>
            </div>
            <div className="space-y-8">
              <span className="text-slate-500 font-semibold block">مشرف تشغيل المطبعة</span>
              <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto"></div>
            </div>
            <div className="space-y-8">
              <span className="text-slate-500 font-semibold block">توقيع استلام العميل</span>
              <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
