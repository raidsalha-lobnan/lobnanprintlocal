import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ReportsView,type ReportType} from '../components/ReportsView';
import {captureOfficialPrintSurface} from './captureOfficialPrintSurface';

export interface AppReportPdfRequest {
  reportType:ReportType;
  fromDate?:string;
  toDate?:string;
  partyId?:string;
  employeeId?:string;
  filename:string;
}
type Pending=AppReportPdfRequest&{id:number};
type Resolver={
  id:number;
  resolve:(file:{blob:Blob;filename:string})=>void;
  reject:(error:Error)=>void;
  timeout:ReturnType<typeof setTimeout>;
};
const PDF_RENDER_TIMEOUT_MS=85000;

/** The real application's React print surface is the only report template.
 * A browser/render failure must settle, reset and release the Telegram queue.
 */
export function useOfficialAppReportPdf(){
  const [pending,setPending]=useState<Pending|null>(null);
  const nextId=useRef(0);
  const deferred=useRef<Resolver|null>(null);
  const nodeRef=useRef<HTMLDivElement|null>(null);

  const finish=useCallback((id:number,result?:{blob:Blob;filename:string},error?:Error)=>{
    const current=deferred.current;
    if(!current||current.id!==id)return;
    deferred.current=null;
    clearTimeout(current.timeout);
    setPending(previous=>previous?.id===id?null:previous);
    if(error)current.reject(error);
    else if(result)current.resolve(result);
    else current.reject(new Error('OFFICIAL_REPORT_EMPTY_RESULT'));
  },[]);

  const createReportPdf=useCallback((input:AppReportPdfRequest)=>{
    if(deferred.current)return Promise.reject(new Error('OFFICIAL_REPORT_EXPORT_BUSY'));
    const id=++nextId.current;
    return new Promise<{blob:Blob;filename:string}>((resolve,reject)=>{
      const timeout=setTimeout(()=>
        finish(id,undefined,new Error('OFFICIAL_REPORT_RENDER_TIMEOUT')),PDF_RENDER_TIMEOUT_MS);
      deferred.current={id,resolve,reject,timeout};
      setPending({...input,id});
    });
  },[finish]);

  useEffect(()=>{
    if(!pending)return;
    const controller=new AbortController();
    const task=async()=>{
      try{
        for(let i=0;i<15;i++){
          await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
          if(controller.signal.aborted)return;
          const report=nodeRef.current?.querySelector<HTMLElement>('.report-a4-container');
          if(!report)continue;
          const blob=await captureOfficialPrintSurface(report,controller.signal);
          if(controller.signal.aborted)return;
          if(!blob.size||blob.size>20_000_000)throw new Error('OFFICIAL_REPORT_PDF_SIZE_INVALID');
          finish(pending.id,{blob,filename:pending.filename});
          return;
        }
        throw new Error('OFFICIAL_REPORT_PRINT_SURFACE_NOT_FOUND');
      }catch(error){
        if(!controller.signal.aborted)
          finish(pending.id,undefined,error instanceof Error?error:new Error(String(error)));
      }
    };
    void task();
    return()=>controller.abort();
  },[pending,finish]);

  useEffect(()=>()=> {
    const current=deferred.current;
    if(current)finish(current.id,undefined,new Error('OFFICIAL_REPORT_EXPORT_UNMOUNTED'));
  },[finish]);

  const printSurface=pending?createPortal(
    <div ref={nodeRef} data-telegram-shared-report={pending.reportType}
      style={{position:'fixed',left:'-12000px',top:0,width:'794px',
        background:'#fff',pointerEvents:'none',zIndex:-1}}
      dir="rtl">
      <ReportsView key={pending.id} initialReport={pending.reportType}
        exportSelection={{
          fromDate:pending.fromDate,toDate:pending.toDate,
          partyId:pending.partyId,employeeId:pending.employeeId
        }}
      />
    </div>,document.body
  ):null;
  return {createReportPdf,printSurface};
}
