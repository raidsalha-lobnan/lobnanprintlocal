import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useAccounting} from '../context/AccountingContext';
import type {DebtClearingRecord} from '../types';
import {AccountTransferModal,transferTypeLabel} from './AccountTransferModal';
import {PrintHeader} from './common/PrintHeader';
import {OfficialStamp} from './common/OfficialStamp';
import {ReportPdfButton} from './common/ReportPdfButton';
import {printReportSurface} from '../utils/reportPdfEngine';
import {CLEARING_PRINT_CSS,CLEARING_PREVIEW_CSS,renderClearingBody} from '../utils/clearingPrintDocument';
import {Plus,Search,Printer,Edit2,Trash2,Eye,RefreshCw,X} from 'lucide-react';
const money=(v:number)=>Number(v||0).toFixed(2);
const name=(r:DebtClearingRecord,credit:boolean)=>(credit?r.customerName:r.supplierName)+((credit?r.creditSubCustomerName:r.debitSubCustomerName)?' / '+(credit?r.creditSubCustomerName:r.debitSubCustomerName):'');
export const DebtClearingView:React.FC=()=>{
 const {debtClearings,settings,currentUser,unifiedRepository}=useAccounting();
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(1);
 const [mode,setMode]=useState<'new'|'edit'|'delete'|null>(null);
 const [chosen,setChosen]=useState<DebtClearingRecord|undefined>();
 const [preview,setPreview]=useState<DebtClearingRecord|undefined>();
 const [register,setRegister]=useState(false);
 const [fitPreview,setFitPreview]=useState(true);
 const viewportRef=useRef<HTMLDivElement>(null);
 const paperRef=useRef<HTMLDivElement>(null);
 const isPreviewOpen=!!preview||register;
 useLayoutEffect(()=>{
  if(!isPreviewOpen)return;
  const viewport=viewportRef.current,paper=paperRef.current;
  if(!viewport||!paper)return;
  let frame=0;
  const measure=()=>{
   const width=paper.offsetWidth,height=paper.offsetHeight;
   if(!width||!height)return;
   const widthFit=Math.max(0.1,(viewport.clientWidth-24)/width);
   // On handheld screens and multi-page registers fit width, not total height.
   const heightFit=register||viewport.clientWidth<560?1:Math.max(0.1,(viewport.clientHeight-24)/height);
   const scale=fitPreview?Math.min(1,widthFit,heightFit):1;
   viewport.style.setProperty('--clearing-preview-scale',String(scale));
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
  measure();
  const observer=new ResizeObserver(schedule);
  observer.observe(viewport);observer.observe(paper);
  window.addEventListener('resize',schedule);
  return ()=>{observer.disconnect();window.removeEventListener('resize',schedule);cancelAnimationFrame(frame);};
 },[isPreviewOpen,preview?.id,register,fitPreview]);
 const [notice,setNotice]=useState('');
 const [showHistory,setShowHistory]=useState(false);
 const reversed=useMemo(()=>new Set(debtClearings.filter(r=>r.reversesId).map(r=>r.reversesId)),[debtClearings]);
 const status=(r:DebtClearingRecord)=>r.reversesId?'قيد عكسي':reversed.has(r.id)?(debtClearings.some(c=>c.replacesId===r.id)?'معدّل':'ملغى'):'معتمد';
 const active=debtClearings.filter(r=>!r.reversesId&&!reversed.has(r.id));
 const rows=(showHistory?debtClearings:active).filter(r=>[r.clearingNumber,r.date,r.customerName,r.supplierName,r.creditSubCustomerName,r.debitSubCustomerName,r.reason,r.notes].join(' ').toLowerCase().includes(query.trim().toLowerCase())).slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 const count=Math.max(1,Math.ceil(rows.length/18)),current=Math.min(page,count),visible=rows.slice((current-1)*18,current*18);
 const totals=Object.entries(active.reduce((m,r)=>{const c=r.currency||settings.currency;m[c]=(m[c]||0)+r.amount;return m;},{} as Record<string,number>));
 const open=(m:'new'|'edit'|'delete',r?:DebtClearingRecord)=>{
  if(r&&(r.transferVersion!==2||r.reversesId||reversed.has(r.id))){setNotice(r.transferVersion!==2?'السند القديم يحتاج تحققاً من القيد الأصلي قبل إلغائه أو تعديله.':'السند ملغى أو معكوس بالفعل.');return;}
  setChosen(r);setMode(m);setNotice('');
 };
 const print=async()=>{try{const root=document.querySelector<HTMLElement>('#clearing-print-document');if(!root)throw Error('لم يتم فتح المستند');await printReportSurface(root);}catch(e){alert(String(e));}};
 const head=['رقم السند','التاريخ','الحساب الدائن','الحساب المدين','البيان','المبلغ','المنفذ','الحالة'];
 const cell=(r:DebtClearingRecord)=>[r.clearingNumber,r.date,name(r,true),name(r,false),r.reason,money(r.amount)+' '+(r.currency||settings.currency),r.createdBy,status(r)];
 return <div dir="rtl" className="flex flex-col gap-2 text-xs">
  <style>{CLEARING_PRINT_CSS+CLEARING_PREVIEW_CSS}</style>
  <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2">
   <strong className="text-sm">المقاصة والتحويل بين الحسابات</strong>
   <button onClick={()=>open('new')} className="inline-flex items-center gap-1 rounded bg-indigo-600 text-white px-3 py-1.5"><Plus size={14}/>مقاصة جديدة</button>
   <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute right-2 top-2 text-slate-400"/><input className="w-full rounded border pr-7 pl-2 py-1.5" placeholder="بحث بالرقم أو الاسم أو البيان..." value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div>
   <button onClick={()=>{unifiedRepository?.requestSync();setNotice('تم طلب تحديث السجل');}} className="rounded border p-1.5" title="تحديث"><RefreshCw size={14}/></button>
   <button onClick={()=>setRegister(true)} className="inline-flex items-center gap-1 rounded border px-2 py-1.5"><Printer size={14}/>طباعة / PDF السجل</button>
   <label className="flex gap-1 items-center"><input type="checkbox" checked={showHistory} onChange={e=>{setShowHistory(e.target.checked);setPage(1);}}/>إظهار الملغاة والقيود العكسية</label>
   <strong>عدد السندات: {active.length}</strong><span className="font-bold text-indigo-700">الإجمالي: {totals.map(([c,v])=>money(Number(v))+' '+c).join(' / ')||'0.00'}</span>
  </section>
  {notice&&<div className="flex justify-between rounded border border-amber-200 bg-amber-50 p-2">{notice}<button onClick={()=>setNotice('')}>✕</button></div>}
  <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 border rounded bg-white">
   <span>نتائج البحث: {rows.length}</span><span className="text-slate-500">لا أثر على الصناديق والبنوك</span>
   <div className="flex gap-2 items-center"><button disabled={current<=1} onClick={()=>setPage(current-1)} className="border rounded px-2 disabled:opacity-40">السابق</button>{current} / {count}<button disabled={current>=count} onClick={()=>setPage(current+1)} className="border rounded px-2 disabled:opacity-40">التالي</button></div>
  </div>
  <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-right text-xs"><thead className="bg-slate-100 text-slate-700"><tr>{head.map(h=><th key={h} className="border-b border-l px-2 py-1.5 whitespace-nowrap">{h}</th>)}<th className="border-b px-2 py-1.5 text-center">الإجراءات</th></tr></thead><tbody>
   {!visible.length&&<tr><td colSpan={9} className="text-center py-4 text-slate-400">لا توجد عمليات مقاصة مسجلة</td></tr>}
   {visible.map(r=><tr key={r.id} className="border-b hover:bg-slate-50">{cell(r).map((v,i)=><td key={i} title={v} className="px-2 py-1 whitespace-nowrap">{v}</td>)}<td className="px-2 py-1"><div className="flex justify-center gap-2">
    <button title="عرض / طباعة / PDF" onClick={()=>setPreview(r)} className="text-indigo-700"><Eye size={15}/></button>
    <button title="تعديل" onClick={()=>open('edit',r)} className="text-amber-700"><Edit2 size={15}/></button>
    <button title="حذف / إلغاء محاسبي" onClick={()=>open('delete',r)} className="text-rose-700"><Trash2 size={15}/></button>
    <button title="معاينة الطباعة" onClick={()=>setPreview(r)} className="text-blue-700"><Printer size={15}/></button>
   </div></td></tr>)}
  </tbody></table></div>
  {mode&&<AccountTransferModal key={currentUser?.id||'none'} edit={mode==='edit'?chosen:undefined} reverse={mode==='delete'?chosen:undefined} onClose={()=>setMode(null)} onSaved={r=>{setMode(null);setPreview(r);setNotice('تم اعتماد العملية محاسبياً');}}/>}
  {(preview||register)&&<div className="clearing-print-modal fixed inset-0 z-[100] bg-slate-900/60">
   <div className="clearing-preview-dialog" role="dialog" aria-modal="true" aria-label={register?'معاينة سجل المقاصة':'معاينة سند المقاصة'} data-no-modal-expand>
   <div className="clearing-print-toolbar print:hidden bg-slate-900 text-white p-2 flex flex-wrap items-center gap-2">
    <b className="flex-1">{register?'معاينة سجل المقاصة':'معاينة سند المقاصة'}</b>
    <button onClick={()=>void print()} className="bg-indigo-600 rounded px-3 py-1.5">طباعة</button>
    <ReportPdfButton filename={preview?'سند مقاصة - '+preview.clearingNumber:'سجل المقاصة'} selector="#clearing-print-document" scope=".clearing-print-modal"/>
    <button type="button" onClick={()=>setFitPreview(v=>!v)} className="rounded border border-slate-500 px-2 py-1.5" aria-pressed={fitPreview}>{fitPreview?'الحجم الطبيعي':'ملاءمة الشاشة'}</button>
    <button title="إغلاق" aria-label="إغلاق المعاينة" onClick={()=>{setPreview(undefined);setRegister(false);setFitPreview(true);}}><X size={18}/></button>
   </div>
   <div ref={viewportRef} className="clearing-preview-viewport">
   <div ref={paperRef} id="clearing-print-document" className="clearing-paper" data-pdf-document data-no-modal-expand>
    <PrintHeader showBorder={false}/>
    {preview?<><div dangerouslySetInnerHTML={{__html:renderClearingBody(preview,settings.currency,status(preview))}}/>
     <div className="clr-sign"><div>توقيع الطرف الأول<span className="clr-line"/></div><div>توقيع الطرف الثاني<span className="clr-line"/></div><div>الختم والتوقيع<span className="clr-line"/><div className="clr-stamp"><OfficialStamp size="3.5cm"/></div></div></div>
     <div className="clr-foot">تسوية محاسبية دون حركة نقدية أو بنكية.</div></>:<><h2 className="clr-section text-center">سجل المقاصة والتحويل بين الحسابات</h2><table><thead><tr>{head.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{cell(r).map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody></table></>}
   </div>
   </div>
   </div>
  </div>}
 </div>;
};