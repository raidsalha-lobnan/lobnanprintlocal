import React,{useEffect,useState} from 'react';
import {Download,MonitorSmartphone,X} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt:()=>Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>;
}

/**
 * PWA install is a browser-only shortcut and uses the existing IndexedDB.
 * It is intentionally distinct from the Windows installer that creates SQLite.
 * A missing beforeinstallprompt event shows installation instructions instead
 * of hiding the button and leaving the user without an explanation.
 */
export const PWAInstallButton:React.FC=()=>{
  const [prompt,setPrompt]=useState<BeforeInstallPromptEvent|null>(null);
  const [installed,setInstalled]=useState(false);
  const [showGuide,setShowGuide]=useState(false);
  const ios=typeof navigator!=='undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const native=Boolean((globalThis as unknown as {
    electronAPI?:{isElectron?:boolean}
  }).electronAPI?.isElectron);

  useEffect(()=>{
    if(typeof window==='undefined'||native)return;
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches||
      (window.navigator as {standalone?:boolean}).standalone===true;
    setInstalled(Boolean(standalone));
    const onPrompt=(event:Event)=>{
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled=()=>{setInstalled(true);setPrompt(null);setShowGuide(false);};
    window.addEventListener('beforeinstallprompt',onPrompt);
    window.addEventListener('appinstalled',onInstalled);
    return()=>{
      window.removeEventListener('beforeinstallprompt',onPrompt);
      window.removeEventListener('appinstalled',onInstalled);
    };
  },[native]);

  async function install(){
    if(!prompt){setShowGuide(true);return;}
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==='accepted'){setInstalled(true);setPrompt(null);}
    }catch(error){
      console.warn('PWA_INSTALL_PROMPT_UNAVAILABLE',error);
      setShowGuide(true);
    }
  }

  if(native||installed)return null;
  return (
    <>
      <button type="button" onClick={()=>{void install();}}
        aria-label={ios?'إضافة البرنامج إلى الشاشة الرئيسية':'تثبيت برنامج المتصفح على هذا الجهاز'}
        title="تثبيت نسخة Chrome/Edge التي تستخدم IndexedDB، وليس تطبيق Windows SQLite"
        className="h-5 inline-flex shrink-0 items-center gap-1 rounded border border-sky-200/70 bg-blue-700 px-2 text-[10px] font-bold text-white hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white">
        {ios?<MonitorSmartphone className="h-3 w-3"/>:<Download className="h-3 w-3"/>}
        <span className="hidden xl:inline">{ios?'تثبيت على الآيفون':'تثبيت نسخة المتصفح (IndexedDB)'}</span>
        <span className="xl:hidden">{ios?'تثبيت آيفون':'تثبيت المتصفح'}</span>
      </button>
      {showGuide&&(
        <div role="dialog" aria-modal="true"
          aria-label="طريقة تثبيت نسخة المتصفح"
          dir="rtl"
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-right shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <strong className="text-sm text-slate-900">طريقة تثبيت نسخة المتصفح</strong>
              <button type="button" onClick={()=>setShowGuide(false)}
                aria-label="إغلاق تعليمات التثبيت"
                className="rounded p-1 text-slate-600 hover:bg-slate-100">
                <X className="h-5 w-5"/>
              </button>
            </div>
            <p className="text-sm leading-7 text-slate-700">
              {ios
                ?'من Safari اضغط مشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية».'
                :'من قائمة Chrome أو Edge (⋮) اختر «تثبيت التطبيق» إن ظهر، أو «حفظ ومشاركة» ثم «تثبيت الصفحة كتطبيق». إذا لم يعرض المتصفح هذا الخيار، يمكنك الاستمرار بالعمل داخل Chrome بصورة طبيعية.'}
            </p>
            <p className="mt-3 rounded-md bg-slate-100 p-3 text-xs leading-6 text-slate-700">
              هذه نسخة المتصفح، وتستعمل IndexedDB. للحصول على قاعدة SQLite المحلية الثابتة،
              استخدم زر «تثبيت تطبيق Windows (SQLite)» أعلى البرنامج.
            </p>
            <button type="button" onClick={()=>setShowGuide(false)}
              className="mt-4 rounded bg-blue-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-600">فهمت</button>
          </div>
        </div>
      )}
    </>
  );
};
