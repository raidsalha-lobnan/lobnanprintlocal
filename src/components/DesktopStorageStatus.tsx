import React,{useEffect,useState} from 'react';
import {Database,X,CheckCircle2,AlertTriangle} from 'lucide-react';

type NativeInfo={
  installed:boolean;
  pinned:boolean;
  persistent:boolean;
  root:string;
  databasePath:string;
};
type NativeBridge={
  isElectron?:boolean;
  getStorageInfo?:()=>Promise<NativeInfo>;
};
const bridge=(globalThis as unknown as {electronAPI?:NativeBridge}).electronAPI;

/**
 * Visible only in installed Windows app. Confirms the actual, pinned SQLite
 * location returned by the Electron main process. Does not pretend that a
 * browser PWA has access to the Windows filesystem.
 */
export const DesktopStorageStatus:React.FC=()=>{
  const [info,setInfo]=useState<NativeInfo|null>(null);
  const [error,setError]=useState(false);
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    if(!bridge?.isElectron)return;
    let alive=true;
    if(!bridge.getStorageInfo){
      setError(true);return;
    }
    void bridge.getStorageInfo().then(value=>{
      if(!alive)return;
      if(!value.installed||!value.pinned||!value.persistent||!value.databasePath){
        setError(true);return;
      }
      setInfo(value);setError(false);
    }).catch(()=>{if(alive)setError(true);});
    return()=>{alive=false;};
  },[]);
  if(!bridge?.isElectron)return null;

  return <>
    <button type="button" onClick={()=>setOpen(true)}
      title={info?'SQLite متصلة: '+info.databasePath:
        'لم يتم تأكيد حالة قاعدة البيانات المحلية بعد'}
      className={'h-5 inline-flex shrink-0 items-center gap-1 rounded border px-2 text-[10px] font-bold '+
        (info&&!error?'border-emerald-400 bg-emerald-800 text-white':
        'border-amber-400 bg-amber-800 text-white')}>
      <Database className="h-3 w-3"/>
      {info&&!error?'SQLite: متصلة':error?'SQLite: تحقق':'SQLite: فحص'}
    </button>
    {open&&(
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4"
        role="dialog" aria-modal="true" aria-label="حالة قاعدة SQLite" dir="rtl">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <strong className="text-base text-slate-900">قاعدة بيانات التطبيق المثبّت</strong>
            <button type="button" onClick={()=>setOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="إغلاق">
              <X className="h-5 w-5"/>
            </button>
          </div>
          {info&&!error?(
            <>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-5 w-5"/> SQLite مفتوحة، والمسار معتمد وثابت
              </div>
              <p className="mt-3 text-xs text-slate-700">مكان حفظ قاعدة البيانات المحلية:</p>
              <input dir="ltr" readOnly aria-label="مسار قاعدة البيانات"
                value={info.databasePath} onFocus={event=>event.currentTarget.select()}
                className="mt-1 w-full rounded border border-slate-300 bg-slate-50 p-2 text-left font-mono text-xs text-slate-900"/>
              <p className="mt-3 text-xs leading-6 text-slate-600">
                يعيد التطبيق استخدام قاعدة البيانات ذات الهوية المعتمدة بعد إعادة التشغيل
                والتحديث. إذا فُقد القرص أو ملف القاعدة، يتوقف البرنامج بدل إنشاء قاعدة فارغة.
              </p>
            </>
          ):(
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-5 w-5"/> لم يُؤكَّد اتصال SQLite. لا تعتمد حفظ فواتير جديدة حتى مراجعة السبب.
            </p>
          )}
          <button type="button" onClick={()=>setOpen(false)}
            className="mt-4 rounded bg-blue-700 px-4 py-1.5 text-xs font-bold text-white">إغلاق</button>
        </div>
      </div>
    )}
  </>;
};
