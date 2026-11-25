import React from 'react';

type LeaveAction = 'save' | 'hold' | 'discard';
interface Props {
  busy: boolean;
  onAction: (action:LeaveAction)=>void;
  onCancel: ()=>void;
}

/** Navigation is blocked until the operator explicitly resolves the unsent form. */
export const PosLeaveDialog:React.FC<Props> = ({busy,onAction,onCancel}) => (
  <div className="fixed inset-0 z-[650] flex items-center justify-center bg-slate-950/60 p-3 print:hidden"
    dir="rtl" data-testid="pos-leave-dialog">
    <div role="dialog" aria-modal="true" aria-labelledby="pos-leave-title"
      className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl">
      <h2 id="pos-leave-title" className="mb-2 text-lg font-extrabold">مغادرة شاشة الكاشير</h2>
      <p className="mb-4 text-sm">هناك فاتورة مفتوحة. اختر ما تريد فعله بها قبل الانتقال إلى الشاشة المطلوبة.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" disabled={busy} onClick={()=>onAction('save')}
          className="rounded-lg bg-emerald-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">
          حفظ الفاتورة
        </button>
        <button type="button" disabled={busy} onClick={()=>onAction('hold')}
          className="rounded-lg bg-amber-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">
          تعليق الفاتورة
        </button>
        <button type="button" disabled={busy} onClick={()=>onAction('discard')}
          className="rounded-lg bg-rose-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">
          تجاهل الفاتورة
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        بعد الحفظ أو التعليق أو التجاهل ستُفتح فاتورة جديدة فارغة عند العودة. إلغاء المغادرة يبقي بياناتك كما هي.
      </p>
      <button type="button" disabled={busy} onClick={onCancel}
        className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-100 py-2 text-sm font-bold disabled:opacity-50">
        إلغاء — البقاء في الكاشير
      </button>
      {busy&&<p role="status" className="mt-2 text-center text-xs text-blue-800">جاري تأكيد حفظ العملية على الجهاز…</p>}
    </div>
  </div>
);
