import {authHeaders,getCurrentSessionToken,publicSyncApiUrl} from '../services/secureAuth';

export type OfficialStatementRequest={
  type:'customer_statement'|'supplier_statement'|'employee_statement';
  partyId?:string;
  subPartyId?:string;
  employeeId?:string;
  fromDate?:string;
  toDate?:string;
  showItemDetails?:boolean;
  showImages?:boolean;
};

/**
 * Direct PDF output from the authorized PostgreSQL report service.
 * The service already renders the original React report with headless Chrome
 * (@media print and Chrome's Arabic text shaper); no canvas screenshots and
 * no browser print dialog are used here.
 */
export async function downloadServerOfficialStatementPdf(
  request:OfficialStatementRequest,filename:string
):Promise<void>{
  const api=publicSyncApiUrl().replace(/\/+$/,'');
  const token=getCurrentSessionToken();
  if(!token)throw new Error('يرجى تسجيل الدخول مجدداً قبل حفظ PDF.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),90000);
  let response:Response;
  try{
    response=await fetch(api+'/api/v1/reports/official-pdf',{
      method:'POST',cache:'no-store',signal:controller.signal,
      headers:{
        ...authHeaders(api,token),
        'Content-Type':'application/json',
        'Accept':'application/pdf'
      },
      body:JSON.stringify(request)
    });
  }catch(error){
    if(controller.signal.aborted)
      throw new Error('تجاوز إعداد PDF المهلة المسموحة. جرّب فترة أقصر أو استخدم طباعة التقرير.');
    throw new Error('تعذّر الاتصال بالخادم المخصص لإعداد PDF.');
  }finally{clearTimeout(timeout);}
  if(!response.ok){
    const body=await response.json().catch(()=>null);
    const reason=String(body?.code||'HTTP_'+response.status);
    if(response.status===401)throw new Error('انتهت جلسة الدخول؛ يرجى تسجيل الدخول مجدداً.');
    if(response.status===403)throw new Error('ليس لديك صلاحية تصدير هذا الكشف المالي.');
    if(response.status===404)throw new Error('خدمة PDF المباشرة غير مفعّلة على الخادم بعد.');
    if(response.status===429)throw new Error('الخادم منشغل بإنشاء كشف آخر. أعد المحاولة.');
    throw new Error('تعذّر إعداد PDF على الخادم ('+reason+').');
  }
  const blob=await response.blob();
  if(blob.size<500||blob.size>30_000_000||
     await blob.slice(0,5).text()!=='%PDF-')
    throw new Error('رد الخادم ليس ملف PDF صالحاً.');
  const url=URL.createObjectURL(blob);
  try{
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=filename.replace(/\.pdf$/i,'')+'.pdf';
    anchor.style.display='none';
    document.body.appendChild(anchor);
    try{anchor.click();}
    finally{anchor.remove();}
  }finally{
    // Chrome may still be streaming a large PDF into the downloads manager.
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
}
