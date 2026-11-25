import React, {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {DeferredStatementPhotos} from './StatementPrintPhoto';
import {ChevronLeft,ChevronRight,ChevronsLeft,ChevronsRight,ZoomIn,ZoomOut} from 'lucide-react';

const PAGE_WIDTH=210*96/25.4;
const PAGE_HEIGHT=297*96/25.4;

interface Props {reportKey:string;children:React.ReactNode}

/** Local HTML pagination. The original React tree remains mounted for
 * interaction and print; no request, PDF creation or duplicate report DOM. */
export const ReportsLivePreview:React.FC<Props>=({reportKey,children})=>{
 const stageRef=useRef<HTMLDivElement>(null);
 const viewportRef=useRef<HTMLDivElement>(null);
 const contentRef=useRef<HTMLDivElement>(null);
 const latest=useRef({page:1,count:1,overflow:false});
 const [page,setPage]=useState(1);
 const [count,setCount]=useState(1);
 const [fit,setFit]=useState(.6);
 const [zoom,setZoom]=useState(1);
 const [overflow,setOverflow]=useState(false);
 const [toolbar,setToolbar]=useState<HTMLElement|null>(null);
 const scale=fit*zoom;

 const goTo=useCallback((requested:number)=>{
  const viewport=viewportRef.current;
  if(!viewport)return;
  const next=Math.max(1,Math.min(latest.current.count,requested));
  latest.current.page=next;
  setPage(next);
  viewport.scrollLeft=(next-1)*viewport.clientWidth;
  viewport.scrollTop=0;
 },[]);

 useLayoutEffect(()=>{setToolbar(document.getElementById('reports-pager-toolbar'));},[]);
 useLayoutEffect(()=>{
  const stage=stageRef.current,viewport=viewportRef.current,content=contentRef.current;
  if(!stage||!viewport||!content)return;
  latest.current={page:1,count:1,overflow:false};
  setPage(1);setCount(1);setOverflow(false);
  viewport.scrollLeft=0;viewport.scrollTop=0;
  let frame=0;let active=true;
  const measure=()=>{
   frame=0;
   if(!active)return;
   const availableWidth=Math.max(1,stage.clientWidth-16);
   const availableHeight=Math.max(1,stage.clientHeight-16);
   const nextFit=Math.min(1,availableWidth/PAGE_WIDTH,availableHeight/PAGE_HEIGHT);
   setFit(old=>Math.abs(old-nextFit)>.002?nextFit:old);
   // One fragment is an A4 content column plus its margins. Read the
   // unscaled flow itself (not the spacer used for the last page).
   const width=viewport.clientWidth||PAGE_WIDTH;
   const nextCount=Math.max(1,Math.ceil((content.scrollWidth-2)/width));
   const hasOverflow=content.scrollHeight>content.clientHeight+3;
   latest.current.count=nextCount;
   latest.current.overflow=hasOverflow;
   setCount(old=>old===nextCount?old:nextCount);
   setOverflow(old=>old===hasOverflow?old:hasOverflow);
   const next=Math.min(latest.current.page,nextCount);
   latest.current.page=next;setPage(old=>old===next?old:next);
   if(viewport.scrollLeft>(nextCount-1)*width+2)viewport.scrollLeft=(nextCount-1)*width;
  };
  const schedule=()=>{
   if(!active||frame)return;
   frame=requestAnimationFrame(measure);
  };
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  resize?.observe(stage);resize?.observe(content);
  const mutation=typeof MutationObserver==='function'?new MutationObserver(schedule):null;
  mutation?.observe(content,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','src']});
  content.addEventListener('load',schedule,true);
  window.addEventListener('resize',schedule);
  document.fonts?.ready?.then(schedule).catch(()=>undefined);
  const scroll=()=>{
   const next=Math.min(latest.current.count,Math.max(1,Math.round(viewport.scrollLeft/(viewport.clientWidth||PAGE_WIDTH))+1));
   if(next!==latest.current.page){latest.current.page=next;setPage(next);}
  };
  viewport.addEventListener('scroll',scroll,{passive:true});
  schedule();
  return()=>{
   active=false;if(frame)cancelAnimationFrame(frame);
   resize?.disconnect();mutation?.disconnect();
   content.removeEventListener('load',schedule,true);
   viewport.removeEventListener('scroll',scroll);
   window.removeEventListener('resize',schedule);
  };
 },[reportKey]);

 return <div ref={stageRef} className="reports-live-stage reports-live-a4-stage print:block" data-report-source="live-react" aria-label="معاينة مباشرة لصفحات A4">
  {toolbar&&createPortal(<div className="report-pager-controls print:hidden" dir="rtl" aria-label="التنقل بين صفحات A4">
   <button type="button" title="الصفحة الأولى" aria-label="الصفحة الأولى" disabled={page<=1} onClick={()=>goTo(1)}><ChevronsRight className="h-4 w-4"/></button>
   <button type="button" title="الصفحة السابقة" aria-label="الصفحة السابقة" disabled={page<=1} onClick={()=>goTo(page-1)}><ChevronRight className="h-4 w-4"/></button>
   <span className="reports-page-label tabular-nums" title="صفحات A4 محسوبة من المحتوى مباشرة">صفحة {page} من {count}</span>
   <button type="button" title="الصفحة التالية" aria-label="الصفحة التالية" disabled={page>=count} onClick={()=>goTo(page+1)}><ChevronLeft className="h-4 w-4"/></button>
   <button type="button" title="الصفحة الأخيرة" aria-label="الصفحة الأخيرة" disabled={page>=count} onClick={()=>goTo(count)}><ChevronsLeft className="h-4 w-4"/></button>
   <button type="button" title="تكبير المعاينة" aria-label="تكبير المعاينة" disabled={zoom>=2} onClick={()=>setZoom(x=>Math.min(2,+(x+.1).toFixed(2)))}><ZoomIn className="h-4 w-4"/></button>
   <button type="button" title="تصغير المعاينة" aria-label="تصغير المعاينة" disabled={zoom<=.8} onClick={()=>setZoom(x=>Math.max(.8,+(x-.1).toFixed(2)))}><ZoomOut className="h-4 w-4"/></button>
  </div>,toolbar)}
  {overflow&&<div className="reports-a4-overflow-notice print:hidden" role="status">يوجد عنصر أطول من مساحة A4؛ يمكن التمرير داخل الورقة لعرضه بالكامل.</div>}
  <div className="reports-live-paper-frame" style={{width:PAGE_WIDTH*scale,height:PAGE_HEIGHT*scale}}>
   <div className="reports-live-viewport reports-live-a4-viewport" ref={viewportRef} style={{transform:'scale('+scale+')',overflowY:overflow?'auto':'hidden'}} tabIndex={0} aria-label="ورقة التقرير">
    <div className="reports-live-content reports-live-a4-flow" ref={contentRef} dir="ltr">
     <DeferredStatementPhotos.Provider value={true}>{children}</DeferredStatementPhotos.Provider>
    </div>
    <span aria-hidden="true" className="reports-live-page-spacer print:hidden" style={{left:count*PAGE_WIDTH-1}}/>
   </div>
  </div>
 </div>;
};
