import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft,ChevronRight,FileText,X,Download} from 'lucide-react';
import type {PDFDocumentProxy,RenderTask,PDFDocumentLoadingTask} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {waitForStatementPrintPhotos} from '../utils/statementPrintReadiness';
type NativeApi={getReportA4Preview?:()=>Promise<Uint8Array>};
const native=()=> (globalThis as unknown as {electronAPI?:NativeApi}).electronAPI?.getReportA4Preview;
export const ReportA4PreviewButton:React.FC<{onBrowserPrint:()=>void;reportKey:string}>=({onBrowserPrint,reportKey})=>{
 const [busy,setBusy]=useState(false);
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null);
 const [bytes,setBytes]=useState<Uint8Array|null>(null);
 const [page,setPage]=useState(1);
 const [error,setError]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null);
 const loading=useRef<PDFDocumentLoadingTask|null>(null);
 const generation=useRef(0);
 const close=()=>{
  generation.current++;
  if(loading.current)void loading.current.destroy();
  loading.current=null;setPdf(null);setBytes(null);setBusy(false);setError('');
 };
 useEffect(()=>{close();return()=>{generation.current++;if(loading.current)void loading.current.destroy();loading.current=null;};},[reportKey]);
 const open=async()=>{
  const generate=native();
  if(!generate){onBrowserPrint();return;}
  if(busy)return;
  const id=++generation.current;
  setBusy(true);setError('');
  try{
   const ready=await waitForStatementPrintPhotos();
   if(!ready&&!window.confirm('بعض الصور الأصلية لم تكتمل. هل تريد المعاينة بالصور المتاحة؟'))return;
   if(id!==generation.current)return;
   const data=await generate();
   if(id!==generation.current)return;
   const lib=await import('pdfjs-dist/legacy/build/pdf.mjs');
   if(id!==generation.current)return;
   lib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
   const task=lib.getDocument({data:new Uint8Array(data),useSystemFonts:true});
   loading.current=task;
   const doc=await task.promise;
   if(id!==generation.current){void task.destroy();return;}
   setBytes(data);setPage(1);setPdf(doc);
  }catch(e){
   if(id===generation.current){
    setError('تعذرت معاينة A4: '+(e instanceof Error?e.message:String(e)));
    if(loading.current)void loading.current.destroy();
    loading.current=null;
   }
  }finally{if(id===generation.current)setBusy(false);}
 };
 useEffect(()=>{
  if(!pdf||!canvas.current)return;
  let canceled=false;let task:RenderTask|undefined;
  (async()=>{
   try{
    const p=await pdf.getPage(page);
    if(canceled||!canvas.current)return;
    const target=canvas.current;
    const base=p.getViewport({scale:1});
    const scale=Math.min(2,Math.max(.25,(window.innerWidth-80)/base.width),Math.max(.25,(window.innerHeight-140)/base.height));
    const ratio=Math.min(2,window.devicePixelRatio||1);
    const view=p.getViewport({scale:scale*ratio});
    const context=target.getContext('2d',{alpha:false});
    if(!context)return;
    target.width=Math.ceil(view.width);target.height=Math.ceil(view.height);
    target.style.width=Math.ceil(view.width/ratio)+'px';target.style.height=Math.ceil(view.height/ratio)+'px';
    task=p.render({canvasContext:context,canvas:target,viewport:view});await task.promise;
   }catch(e){if(!canceled)setError('تعذّر عرض الصفحة. '+String(e));}
  })();
  return()=>{canceled=true;task?.cancel();};
 },[pdf,page]);
 const save=()=>{
  if(!bytes)return;
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=url;a.download='تقرير-A4.pdf';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 return <>
  <button type="button" disabled={busy} onClick={()=>void open()} className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-bold px-3 py-2.5 rounded-lg" title="معاينة صفحات A4 باستخدام محرك الطباعة">
   <FileText className="w-4 h-4"/>{busy?'جارٍ تجهيز A4...':'معاينة A4'}
  </button>
  {error&&!pdf&&<div className="text-xs text-red-700 print:hidden" role="alert">{error}</div>}
  {pdf&&createPortal(<div data-no-print="true" className="fixed inset-0 z-[200] bg-slate-900/75 flex flex-col items-center gap-2 p-3 print:hidden" dir="rtl" role="dialog" aria-label="معاينة صفحات A4">
   <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-2 rounded text-slate-900 shadow">
    <button type="button" aria-label="الصفحة السابقة" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronRight className="h-5 w-5"/></button>
    <strong>صفحة {page} من {pdf.numPages} — A4</strong>
    <button type="button" aria-label="الصفحة التالية" disabled={page>=pdf.numPages} onClick={()=>setPage(p=>p+1)}><ChevronLeft className="h-5 w-5"/></button>
    <button type="button" onClick={save} className="flex items-center gap-1 text-blue-700"><Download className="h-4 w-4"/>حفظ PDF</button>
    <button type="button" onClick={close} aria-label="إغلاق المعاينة"><X className="h-5 w-5"/></button>
   </div>
   {error&&<p className="bg-white text-red-700 p-2">{error}</p>}
   <div className="flex-1 min-h-0 overflow-auto w-full flex justify-center items-start"><canvas ref={canvas} className="bg-white shadow-xl" aria-label={'صفحة التقرير '+page}/></div>
  </div>,document.body)}
 </>;
};
