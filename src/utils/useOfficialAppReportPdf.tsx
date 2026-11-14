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
type Resolver={resolve:(file:{blob:Blob;filename:string})=>void;reject:(error:Error)=>void};

/** The Telegram client uses the SAME mounted report view as the app's print
 * screen; it never reimplements statements, columns, header or calculations.
 */
export function useOfficialAppReportPdf(){
  const [pending,setPending]=useState<Pending|null>(null);
  const nextId=useRef(0);
  const deferred=useRef<Resolver|null>(null);
  const nodeRef=useRef<HTMLDivElement|null>(null);
  const createReportPdf=useCallback((input:AppReportPdfRequest)=>{
    if(deferred.current) return Promise.reject(new Error('OFFICIAL_REPORT_EXPORT_BUSY'));
    return new Promise<{blob:Blob;filename:string}>((resolve,reject)=>{
      deferred.current={resolve,reject};
      setPending({...input,id:++nextId.current});
    });
  },[]);

  useEffect(()=>{
    if(!pending)return;
    let cancelled=false;
    const task=async()=>{
      try{
        // Wait for the real React report component to mount and lay out.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(cancelled)return;
        const host=nodeRef.current;
        const report=host?.querySelector<HTMLElement>('.report-a4-container');
        if(!report)throw new Error('OFFICIAL_REPORT_PRINT_SURFACE_NOT_FOUND');
        const blob=await captureOfficialPrintSurface(report);
        if(cancelled)return;
        deferred.current?.resolve({blob,filename:pending.filename});
      }catch(error){
        if(!cancelled)deferred.current?.reject(
          error instanceof Error?error:new Error(String(error))
        );
      }finally{
        if(!cancelled){deferred.current=null;setPending(null);}
      }
    };
    void task();
    return()=>{cancelled=true;};
  },[pending]);

  useEffect(()=>()=>{deferred.current?.reject(new Error('OFFICIAL_REPORT_EXPORT_UNMOUNTED'));deferred.current=null;},[]);

  const printSurface=pending?createPortal(
    <div
      ref={nodeRef}
      data-telegram-shared-report={pending.reportType}
      style={{position:'fixed',left:'-12000px',top:0,width:'794px',
        background:'#fff',pointerEvents:'none',zIndex:-1}}
      dir="rtl"
    >
      <ReportsView
        key={pending.id}
        initialReport={pending.reportType}
        exportSelection={{
          fromDate:pending.fromDate,toDate:pending.toDate,
          partyId:pending.partyId,employeeId:pending.employeeId
        }}
      />
    </div>,document.body
  ):null;
  return {createReportPdf,printSurface};
}
