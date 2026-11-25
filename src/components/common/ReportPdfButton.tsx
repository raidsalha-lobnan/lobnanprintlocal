import React,{useRef,useState} from 'react';
import {FileDown} from 'lucide-react';
import {saveReportPdf,requirePdfRoot,type PdfPaper} from '../../utils/reportPdfEngine';
import {waitForStatementPrintPhotos} from '../../utils/statementPrintReadiness';

type Props={filename:string;selector:string;scope?:string;paper?:PdfPaper;compact?:boolean;numberPages?:boolean;className?:string};
export function ReportPdfButton({filename,selector,scope,paper='a4',compact,numberPages,className}:Props){
 const [busy,setBusy]=useState(false);
 const running=useRef(false);
 const button=useRef<HTMLButtonElement>(null);
 const save=async()=>{
  if(running.current)return;
  running.current=true;setBusy(true);
  try{
   const parent=scope?button.current?.closest(scope):document;
   if(!parent)throw Error('لم يتم العثور على نافذة المستند.');
   const root=parent instanceof HTMLElement&&parent.matches(selector)?parent:requirePdfRoot(selector,parent);
   const ready=await waitForStatementPrintPhotos();
   if(!ready&&!window.confirm('لم تكتمل بعض الصور الأصلية. هل تريد الحفظ بالصور المتاحة؟'))return;
   await saveReportPdf(root,{filename,paper,compact,numberPages});
  }catch(error){
   console.error('Local document PDF export failed',error);
   alert('تعذّر حفظ PDF. لم تتغير البيانات المحاسبية. '+(error instanceof Error?error.message:''));
  }finally{running.current=false;setBusy(false);}
 };
 return <button ref={button} type="button" disabled={busy} onClick={()=>void save()}
  title="حفظ مباشر PDF باستخدام Typst دون نافذة الطباعة"
  className={className||'print:hidden inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50'}>
  <FileDown className="w-4 h-4"/>{busy?'جارٍ إنشاء PDF…':'حفظ PDF'}
 </button>;
}
