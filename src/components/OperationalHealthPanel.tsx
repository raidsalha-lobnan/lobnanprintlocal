import React, {useState} from 'react';
import {authHeaders,publicSyncApiUrl,secureLoginEnabled} from '../services/secureAuth';
type Finding={severity:'high'|'review';type:string;entity:string;id:string;relatedId?:string;code?:string;differenceCents?:number};
type Report={snapshotAt:string;counts:Record<string,number>;issueCount:number;
 bySeverity:Record<string,number>;byType:Record<string,number>;issues:Finding[];
 commandStats?:{committed_commands:number;distinct_commands:number};
 eventStats?:{count:number;max_sequence:number}};
const descriptions:Record<string,string>={
  DUPLICATE_BUSINESS_CODE:'كود مكرر لعميل أو صنف أو حساب',
  DUPLICATE_INVOICE_NUMBER:'رقم فاتورة مكرر',
  INVALID_INVOICE_TOTAL:'إجمالي فاتورة غير صالح',
  INVALID_INVOICE_SUBTOTAL:'مجموع فرعي غير صالح',
  INVOICE_ITEM_SUM_DIFFERS_FROM_SUBTOTAL:'اختلاف مجموع بنود الفاتورة عن الإجمالي الفرعي',
  INVOICE_PARTY_REFERENCE_NOT_IN_PARTIES_OR_EMPLOYEES:'طرف الفاتورة غير موجود في سجلات الأطراف والموظفين',
  INVOICE_PRODUCT_REFERENCE_NOT_FOUND:'مرجع صنف في الفاتورة غير موجود',
  INVALID_JOURNAL_LINES:'قيد محاسبي بلا بنود صحيحة',
  UNBALANCED_JOURNAL:'قيد محاسبي غير متوازن',
  JOURNAL_INVOICE_ID_NOT_FOUND:'قيد مالي مرتبط بمعرّف فاتورة غير موجود',
  POSTED_INVOICE_WITHOUT_LINKED_REVENUE:'فاتورة مرحّلة دون قيد إيراد مرتبط',
  MULTIPLE_SALES_JOURNALS_NEED_NET_RECONCILIATION:'أكثر من قيد مبيعات؛ يلزم فحص التسويات الصافية',
  MULTIPLE_COGS_JOURNALS_NEED_NET_RECONCILIATION:'أكثر من قيد تكلفة؛ يلزم فحص التسويات الصافية',
  STOCK_ITEM_REFERENCE_MISSING:'حركة مخزون بصنف غير موجود',
  INVALID_STOCK_QUANTITY:'كمية مخزون غير صالحة',
  EXPLICIT_STOCK_INVOICE_REFERENCE_MISSING:'حركة مخزون مرتبطة بمعرّف فاتورة غير موجود'
};
export const OperationalHealthPanel:React.FC=()=>{
 const [report,setReport]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [showDetails,setShowDetails]=useState(false);
 const run=async()=>{
  if(!secureLoginEnabled()){setError('يتطلب التقرير تسجيل دخول المدير عبر خادم البرنامج.');return;}
  setBusy(true);setError('');
  try{
   const api=publicSyncApiUrl();
   const response=await fetch(api+'/api/v1/admin/operational-health',{
    headers:authHeaders(api),cache:'no-store'
   });
   if(!response.ok)throw new Error(response.status===403
     ?'التقرير متاح لمدير النظام فقط.'
     :'خطأ استجابة الخادم: '+response.status);
   const data=await response.json();
   if(!data?.byType||!Array.isArray(data?.issues))throw new Error('استجابة الفحص غير مكتملة');
   setReport(data);
  }catch(e){setError(String((e as Error).message||e));}
  finally{setBusy(false);}
 };
 const exportJson=()=>{
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='lobnan-operational-audit.json';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 };
 return <section dir="rtl" className="rounded-xl border border-slate-300 bg-white p-3 space-y-3">
  <header className="flex flex-wrap items-start justify-between gap-2">
   <div><h3 className="font-black text-sm">فحص سلامة البرنامج والبيانات — جميع الوحدات</h3>
    <p className="text-xs text-slate-600 mt-1">قراءة فقط من PostgreSQL؛ لا تصفير ولا تعديل تلقائي للقيود أو الأرصدة</p>
   </div>
   <div className="flex gap-2">
    <button type="button" disabled={busy} onClick={()=>void run()}
      className="rounded-lg bg-indigo-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
      {busy?'جارٍ فحص النظام...':'بدء الفحص الشامل'}
    </button>
    {report&&<button type="button" onClick={exportJson}
      className="rounded-lg border border-slate-300 px-3 py-2 text-xs">تصدير التقرير</button>}
   </div>
  </header>
  {error&&<div role="alert" className="text-xs text-red-700">{error}</div>}
  {report&&<>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
    <div className="bg-slate-100 p-2 rounded"><div>الفواتير</div><b>{report.counts.invoices||0}</b></div>
    <div className="bg-slate-100 p-2 rounded"><div>القيود</div><b>{report.counts.journalEntries||0}</b></div>
    <div className="bg-rose-50 p-2 rounded"><div>مؤشرات عالية الخطورة</div><b>{report.bySeverity.high||0}</b></div>
    <div className="bg-amber-50 p-2 rounded"><div>حالات تحتاج مراجعة</div><b>{report.bySeverity.review||0}</b></div>
   </div>
   <p className="text-xs text-slate-600">
    وقت لقطة الفحص: {new Date(report.snapshotAt).toLocaleString('ar-EG')}.
    هذه مؤشرات تدقيق؛ قد توجد عدة مؤشرات للسجل الواحد، ولا تعني وجود خسارة مؤكدة.
   </p>
   <div className="space-y-1">
    {Object.entries(report.byType).sort((a,b)=>Number(b[1])-Number(a[1])).map(([kind,count])=>
     <div key={kind} className="flex justify-between gap-2 border-b border-slate-100 py-1 text-xs">
      <span>{descriptions[kind]||kind}</span><b>{count}</b>
     </div>)}
   </div>
   <button type="button" onClick={()=>setShowDetails(x=>!x)}
    className="text-xs font-semibold text-indigo-800 underline">
    {showDetails?'إخفاء تفاصيل السجلات':'عرض تفاصيل السجلات للفحص'}
   </button>
   {showDetails&&<div className="max-h-64 overflow-auto space-y-1">
    {report.issues.slice(0,300).map((x,i)=><div key={x.entity+x.id+x.type+i}
     className="rounded border border-slate-200 p-2 text-xs">
     <b>{descriptions[x.type]||x.type}</b> — {x.entity} / {x.id}
     {x.relatedId&&<span> — المرجع: {x.relatedId}</span>}
    </div>)}
    {report.issues.length>300&&<p className="text-xs">تفاصيل إضافية متاحة في التقرير المصدَّر.</p>}
   </div>}
   <p className="text-xs text-slate-600">
    الأعطال المؤقتة تُعالج بإعادة مزامنة ذات معرّف ثابت، أما القيود المالية غير المتطابقة فتحتاج تسوية مثبتة؛
    لا يقوم هذا التقرير بإنشاء قيود تعويضية تلقائيًا.
   </p>
  </>}
 </section>;
};
