import React, {useState} from 'react';
import {authHeaders,publicSyncApiUrl,secureLoginEnabled} from '../services/secureAuth';

type Issue={
  invoiceId:string;invoiceNumber:string;version:number;totalAmount:number;
  status:'manual-review'|'no-obvious-issue';reasons:string[];
  evidence:{salesJournalCount:number;costJournalCount:number;correctionCount:number;
    explicitStockOwnership:number;unverifiedStockCandidates:number;
    stockCandidatesWithOtherOwnerOrDate:number};
  action:string;automaticFinancialRepair:false;
};
type Audit={
  generatedAt:string;
  totals:{invoices:number;needsReview:number;missingRevenue:number;
    duplicatedSales:number;duplicatedCosts:number;amountMismatch:number;
    missingStockReferences:number;reusedInvoiceNumbers:number;accepted:number};
  findings:Issue[];
};
const arabic:Record<string,string>={
  MISSING_LINKED_REVENUE:'الفاتورة معلّمة كمرحّلة، لكن قيد إيرادها الأصلي غير مرتبط بها',
  DUPLICATE_SALES_POSTINGS:'أكثر من قيد مبيعات مرتبط بالفاتورة؛ يلزم تدقيق المبالغ الصافية والتسويات',
  DUPLICATE_COST_POSTINGS:'أكثر من قيد تكلفة مرتبط بالفاتورة',
  REVENUE_TOTAL_MISMATCH:'مبلغ القيد لا يساوي مبلغ الفاتورة الحالية',
  STOCK_RECORD_NOT_FOUND:'حركة المخزون الأصلية غير موجودة تحت هذا المرجع',
  STOCK_REFERENCE_ONLY_UNVERIFIED:'توجد حركات تحمل رقم الفاتورة، دون معرّف ملكية مثبت',
  STOCK_NUMBER_REUSED_OR_DATE_MISMATCH:'رقم الفاتورة مستخدم في حركة مخزون بتاريخ آخر أو يخص مستندًا آخر',
  INVOICE_NUMBER_REUSED:'رقم الفاتورة مكرر بين سجلات مختلفة'
};
const message=(reason:string)=>arabic[reason]||reason;
export const LegacyInvoiceAuditPanel:React.FC=()=>{
  const [audit,setAudit]=useState<Audit|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState('INV-0055');
  const refresh=async()=>{
    if(!secureLoginEnabled()){
      setError('يتطلب هذا التدقيق تسجيل دخول المدير عبر خادم PostgreSQL.');
      return;
    }
    setWorking(true);setError('');
    try{
      const api=publicSyncApiUrl();
      const response=await fetch(api+'/api/v1/admin/invoices/reconciliation',{
        method:'GET',headers:authHeaders(api),cache:'no-store'
      });
      if(!response.ok){
        setError(response.status===403
          ?'هذا التقرير متاح لمدير النظام فقط.'
          :'تعذر الحصول على تقرير PostgreSQL. رمز الاستجابة: '+response.status);
        return;
      }
      const data=await response.json();
      if(!data?.totals||!Array.isArray(data.findings))throw new Error('INVALID_AUDIT_RESPONSE');
      setAudit(data);
    }catch(e){
      setError('تعذر فحص القيود والمخزون من خادم PostgreSQL: '+String(e));
    }finally{setWorking(false);}
  };
  const download=()=>{
    if(!audit)return;
    const object=URL.createObjectURL(new Blob([JSON.stringify(audit,null,2)],{
      type:'application/json;charset=utf-8'
    }));
    const link=document.createElement('a');
    link.href=object;link.download='invoice-reconciliation-readonly.json';
    document.body.appendChild(link);link.click();link.remove();
    URL.revokeObjectURL(object);
  };
  const rows=audit?.findings.filter(row=>
    row.status==='manual-review'&&(!filter.trim()||row.invoiceNumber.toLowerCase().includes(filter.trim().toLowerCase()))
  )||[];
  return <section dir="rtl" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-3">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-black text-slate-900">تدقيق الفواتير التاريخية في PostgreSQL</h3>
        <p className="mt-1 text-xs text-slate-600">فحص قراءة فقط؛ لا يُنشئ قيودًا ولا يغيّر أرصدة أو حركات مخزون</p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={working} onClick={()=>void refresh()}
          className="rounded-md bg-indigo-700 px-3 py-1.5 text-white text-xs font-bold disabled:opacity-50">
          {working?'جارٍ التدقيق...':'فحص الفواتير الآن'}
        </button>
        {audit&&<button type="button" onClick={download}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">تصدير التقرير</button>}
      </div>
    </header>
    {error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}
    {audit&&<>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-slate-50 p-2"><div>الفواتير المفحوصة</div><b>{audit.totals.invoices}</b></div>
        <div className="rounded bg-amber-50 p-2"><div>تحتاج مراجعة</div><b>{audit.totals.needsReview}</b></div>
        <div className="rounded bg-rose-50 p-2"><div>قيد الإيراد غير مرتبط</div><b>{audit.totals.missingRevenue}</b></div>
        <div className="rounded bg-indigo-50 p-2"><div>قيود مبيعات مكررة</div><b>{audit.totals.duplicatedSales}</b></div>
      </div>
      <input value={filter} onChange={e=>setFilter(e.target.value)}
        placeholder="رقم الفاتورة — اتركه فارغًا لجميع الحالات"
        className="w-full rounded border border-slate-300 p-2 text-xs"/>
      <div className="max-h-72 overflow-y-auto space-y-2">
        {rows.map(row=><article key={row.invoiceId} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
          <div className="font-black">{row.invoiceNumber} — {row.totalAmount} شيكل</div>
          <div className="mt-1">قيد المبيعات: {row.evidence.salesJournalCount}، قيد التكلفة: {row.evidence.costJournalCount}، حركات مرتبطة بالمعرّف: {row.evidence.explicitStockOwnership}</div>
          <ul className="mr-4 mt-1 list-disc space-y-1">
            {row.reasons.map(reason=><li key={reason}>{message(reason)}</li>)}
          </ul>
          <p className="mt-2 font-semibold text-rose-800">
            التصحيح المالي معلّق حتى مطابقة المستندات الأصلية والقيود وحركات المخزون؛ لا يجوز إعادة ترحيل الفاتورة.
          </p>
        </article>)}
        {rows.length===0&&<p className="text-xs text-slate-500">لا توجد نتائج تطابق البحث.</p>}
      </div>
      <p className="text-[11px] text-slate-600">
        نتائج هذا الفحص ليست موافقة على التسوية. الربط برقم الفاتورة وحده لا يثبت أن حركة المخزون أو القيد يخصان الفاتورة.
      </p>
    </>}
  </section>;
};
