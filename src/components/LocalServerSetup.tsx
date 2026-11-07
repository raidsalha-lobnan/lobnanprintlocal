import React,{useState} from 'react';
import {URL_KEY,TOKEN_KEY,WORKSPACE_KEY} from '../sync-next/httpTransport';

export function LocalServerSetup(){
  const [url,setUrl]=useState(localStorage.getItem(URL_KEY)||'http://localhost:4577');
  const [token,setToken]=useState(localStorage.getItem(TOKEN_KEY)||'');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  async function save(){
    setBusy(true);setStatus('جاري التحقق من اتصال الخادم…');
    try {
      const cleaned=url.trim().replace(/\/+$/,'');
      if(!/^https?:\/\//.test(cleaned)||token.trim().length<32)throw new Error('أدخل عنوان الخادم ورمز الاتصال الصحيح');
      const response=await fetch(cleaned+'/api/v1/health?workspace=lobnan_main',{headers:{Authorization:'Bearer '+token.trim()},cache:'no-store'});
      if(!response.ok)throw new Error('الخادم لا يقبل الاتصال: '+response.status);
      const health=await response.json();
      if(health.workspace!=='lobnan_main')throw new Error('مساحة عمل مختلفة');
      localStorage.setItem(URL_KEY,cleaned);
      localStorage.setItem(TOKEN_KEY,token.trim());
      localStorage.setItem(WORKSPACE_KEY,'lobnan_main');
      // Historical data is never automatically imported to this new isolated workspace.
      localStorage.setItem('lobnan_local_new_database_consent','true');
      window.location.reload();
    } catch(err){setStatus(String((err as Error).message||err));setBusy(false);}
  }
  return <div dir="rtl" style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f5f7fa',padding:20}}><section style={{maxWidth:540,width:'100%',padding:28,background:'#fff',borderRadius:16,boxShadow:'0 6px 22px #0001',fontFamily:'sans-serif'}}>
    <h1 style={{fontSize:23,fontWeight:700,marginBottom:8}}>إعداد قاعدة مطبعة لبنان المحلية</h1>
    <p style={{color:'#475569'}}>يجب تعريف كل جهاز مرة واحدة بعنوان الكمبيوتر الرئيسي ورمز الاتصال. لن يتم استيراد الفواتير القديمة تلقائيًا.</p>
    <label style={{display:'block',marginTop:16}}>عنوان الخادم على الكمبيوتر الرئيسي</label>
    <input style={{width:'100%',padding:12,border:'1px solid #cbd5e1',borderRadius:8}} dir="ltr" value={url} onChange={e=>setUrl(e.target.value)} placeholder="http://192.168.1.25:4577"/>
    <label style={{display:'block',marginTop:16}}>رمز اتصال الأجهزة</label>
    <input style={{width:'100%',padding:12,border:'1px solid #cbd5e1',borderRadius:8}} dir="ltr" type="password" value={token} onChange={e=>setToken(e.target.value)}/>
    <button style={{width:'100%',marginTop:20,padding:12,border:0,borderRadius:9,background:'#0f766e',color:'white',fontWeight:700,cursor:'pointer'}} disabled={busy} onClick={()=>void save()}>اختبار الاتصال وربط الجهاز</button>
    <p role="status" style={{color:'#b45309',marginTop:12}}>{status}</p>
    <small>إذا توقف الخادم بعد الربط، تستمر الإدخالات في التخزين المحلي. لن تتزامن إلا عند استعادة الاتصال.</small>
  </section></div>;
}
