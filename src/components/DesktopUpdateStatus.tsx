import React,{useEffect,useState} from 'react';
import {RefreshCw,DownloadCloud,ShieldCheck,AlertTriangle} from 'lucide-react';

type UpdatePhase='idle'|'checking'|'downloading'|'ready'|'current'|'error'|
  'install-error'|'disabled';
type UpdateStatus={
 phase:UpdatePhase;
 version?:string|null;
 currentVersion?:string;
 percent?:number|null;
 installedVersion?:string|null;
 errorDetail?:string|null;
 downloadStage?:'preparing'|'connecting'|'waiting-data'|'transferring'|'verifying'|null;
 downloadMode?:'full'|'differential'|null;
 receivedBytes?:number;
 totalBytes?:number|null;
};
type UpdateApi={
 isElectron?:boolean;
 getDesktopUpdateStatus?:()=>Promise<UpdateStatus>;
 checkDesktopUpdate?:()=>Promise<UpdateStatus>;
 restartForDesktopUpdate?:()=>Promise<boolean>;
 onDesktopUpdateStatus?:(listener:(status:UpdateStatus)=>void)=>()=>void;
};
const api=(globalThis as unknown as {electronAPI?:UpdateApi}).electronAPI;

/**
 * Native-only updater status. Does not force an update, reload a tab, or
 * install while an invoice is open. The verified update is installed
 * automatically before the NEXT desktop session begins.
 */
export const DesktopUpdateStatus:React.FC=()=>{
 const [status,setStatus]=useState<UpdateStatus>({phase:'idle'});
 const [restartPending,setRestartPending]=useState(false);
 useEffect(()=>{
  if(!api?.isElectron)return;
  let mounted=true;
  let unsubscribe:(()=>void)|undefined;
  try{
   unsubscribe=api.onDesktopUpdateStatus?.(value=>{
    if(mounted)setStatus(value);
   });
  }catch{setStatus({phase:'error'});}
  void api.getDesktopUpdateStatus?.()
   .then(value=>{if(mounted)setStatus(value);})
   .catch(()=>{if(mounted)setStatus({phase:'error'});});
  return()=>{mounted=false;unsubscribe?.();};
 },[]);
 if(!api?.isElectron)return null;
 const {phase,version,percent,currentVersion,installedVersion,errorDetail,downloadStage,downloadMode,receivedBytes,totalBytes}=status;
 const transferred=typeof receivedBytes==='number'&&receivedBytes>0?(receivedBytes/1048576).toFixed(2)+' MB':'';
 const downloadLabel=downloadStage==='preparing'?'تجهيز التحديث':downloadStage==='connecting'?'الاتصال بخادم التحديث':downloadStage==='waiting-data'?'انتظار بدء التنزيل':downloadStage==='verifying'?'التحقق من التحديث':'تنزيل التحديث '+(Number.isFinite(percent)?percent+'%':'')+(transferred?' · '+transferred:'');
 const complete=phase==='ready';
 const busy=restartPending||phase==='checking'||phase==='downloading';
 const error=phase==='error'||phase==='install-error';
 const label=restartPending?'جارٍ تجهيز التثبيت…':complete
   ?'تحديث وإعادة تشغيل '+version
   :phase==='downloading'
   ?downloadLabel
   :phase==='checking'?'فحص التحديثات'
   :phase==='install-error'?'استرداد التحديث'
   :error?'إعادة محاولة التحديث'
   :phase==='current'?(installedVersion?'تم تثبيت التحديث':'التطبيق محدّث'):'تحديثات Windows';
 const title=complete
   ?'تم تنزيل التحديث والتحقق منه. اضغط لإعادة التشغيل بعد حفظ العمل، أو أغلق البرنامج وشغّله لاحقًا.'
   :error
   ?(phase==='install-error'?'اضغط لتشغيل المثبّت الرسمي بعد حفظ عملك. ':'سيُعاد الفحص تلقائيًا ويمكنك إعادة المحاولة الآن. ')+(errorDetail||'')
   :phase==='downloading'?(downloadMode==='differential'?'تحديث تفاضلي. ':'')+(transferred?'تم استقبال '+transferred+(totalBytes?' من '+(totalBytes/1048576).toFixed(2)+' MB':'')+'. ':'')+downloadLabel
   :'يفحص التطبيق تحديثات Windows وينزّلها تلقائيًا؛ لا يُثبَّت أي تحديث أثناء وجود جلسة عمل مفتوحة.';
 return (
  <span className="inline-flex items-center gap-1 shrink-0" dir="rtl">
  <span className="inline-flex h-5 items-center rounded border border-slate-400 bg-slate-800 text-white px-1.5 text-[10px] font-bold" title="الإصدار المثبت فعليًا" dir="ltr">v{currentVersion||'—'}</span>
  <button type="button" title={title} disabled={busy}
   onClick={async()=>{
    try{
     if((complete||phase==='install-error')&&api.restartForDesktopUpdate){
      setRestartPending(true);
      try{await api.restartForDesktopUpdate();}finally{setRestartPending(false);}
      return;
     }
     if(error){
      window.alert('الإصدار الحالي: '+(currentVersion||'—')+'\nالإصدار المطلوب: '+(version||'—')+'\nسبب الخطأ: '+(errorDetail||'غير متاح')+'\nسيُعاد فحص التحديثات.');
     }
     const next=await api.checkDesktopUpdate?.();
     if(next)setStatus(next);
    }catch(err){
     setStatus(previous=>({...previous,phase:'error',errorDetail:String(err)}));
    }
   }}
   className={'inline-flex h-5 shrink-0 items-center gap-1 rounded border px-2 text-[10px] font-bold '+
    (complete?'border-emerald-300 bg-emerald-800 text-white':
     error?'border-amber-300 bg-amber-800 text-white':
     'border-blue-300 bg-blue-800 text-white')}>
   {busy?<RefreshCw className="h-3 w-3 animate-spin"/>:
    error?<AlertTriangle className="h-3 w-3"/>:
    complete?<DownloadCloud className="h-3 w-3"/>:
    <ShieldCheck className="h-3 w-3"/>}
   {label}
  </button>
  </span>
 );
};
