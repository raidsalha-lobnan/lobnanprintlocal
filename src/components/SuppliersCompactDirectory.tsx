import React,{useMemo,useState} from 'react';
import {Truck,Search,CalendarDays,Plus,FileText,Receipt,RotateCcw,Printer,Edit2,Trash2,Wallet,TrendingUp,Banknote,FileSpreadsheet} from 'lucide-react';
import {useAccounting} from '../context/AccountingContext';
import type {Party} from '../types';
import {supplierPeriodRows,totalAmounts,roundMoney,moneyDisplay,directoryBounds,todayLocal,printDirectoryPeriodReport,type DirectoryDateMode} from '../utils/otherPartyPeriodReports';

interface Props{
 onAdd:()=>void;onEdit:(party:Party)=>void;onDelete:(party:Party)=>void;
 onPurchase:(party?:Party)=>void;onReturn:()=>void;onPay:(party?:Party)=>void;
 onTab:(tab:'suppliers'|'invoices'|'returns'|'vouchers')=>void;
}
export const SuppliersCompactDirectory:React.FC<Props>=({
 onAdd,onEdit,onDelete,onPurchase,onReturn,onPay,onTab
})=>{
 const {parties,invoices,vouchers,purchases,purchaseReturns,salesReturns,printOrders,
  journalEntries,debtClearings,settings,setSelectedPartyForStatement}=useAccounting();
 const [search,setSearch]=useState('');
 const [mode,setMode]=useState<DirectoryDateMode>('all');
 const [day,setDay]=useState(todayLocal);
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [status,setStatus]=useState('all');
 const filter={mode,day,from,to};
 const invalid=mode==='range'&&!!from&&!!to&&from>to;
 const src=useMemo(()=>({parties,invoices,vouchers,purchases,purchaseReturns,salesReturns,
  printOrders,journalEntries,debtClearings}),[parties,invoices,vouchers,purchases,purchaseReturns,
  salesReturns,printOrders,journalEntries,debtClearings]);
 const rows=useMemo(()=>{
  if(invalid)return [];
  const all=supplierPeriodRows(src,filter,search);
  return all.filter(row=>status==='all'||(status==='owed'&&row.closing>0.005)||
   (status==='advance'&&row.closing<-.005)||(status==='settled'&&Math.abs(row.closing)<=.005));
 },[src,mode,day,from,to,search,status,invalid]);
 const totals=totalAmounts(rows,['opening','purchases','payments','returns','adjustments','movement','closing']);
 const allCount=parties.filter(p=>p.type==='supplier'||p.type==='both').length;
 const print=()=>{
  if(invalid)return;
  const columns=['رقم المورد','اسم المورد','عدد المشتريات','رصيد أول الفترة',
   'مشتريات الفترة','المدفوعات','مرتجعات المشتريات','تسويات ±','رصيد آخر الفترة'];
  const body=rows.map(row=>[row.entity.code,row.entity.name,row.documentCount,
   row.opening,row.purchases,row.payments,row.returns,row.adjustments,row.closing]);
  body.push(['إجمالي الموردين المعروضين',rows.length,
   rows.reduce((n,r)=>n+r.documentCount,0),totals.opening,totals.purchases,
   totals.payments,totals.returns,totals.adjustments,totals.closing]);
  printDirectoryPeriodReport('كشف حركة وأرصدة الموردين',settings.businessName||'مطبعة لبنان',
   filter,columns,body,settings.currency,
   'الرصيد الموجب = مبلغ مستحق للمورد، والسالب = دفعات مقدمة أو مبلغ مستحق لنا. رصيد آخر الفترة = رصيد أول الفترة + مشتريات الفترة − المدفوعات − المرتجعات ± التسويات. جميع القيم مستمدة من كشف حساب المورد في البرنامج.');
 };
 const mini='inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] font-bold whitespace-nowrap text-white';
 const cards=[
  {label:'رصيد الموردين المستحق',amount:totals.closing,cls:'bg-amber-50 border-amber-200 text-amber-900',Icon:Wallet},
  {label:'مشتريات الفترة',amount:totals.purchases,cls:'bg-blue-50 border-blue-200 text-blue-900',Icon:TrendingUp},
  {label:'سداد الموردين',amount:totals.payments,cls:'bg-emerald-50 border-emerald-200 text-emerald-900',Icon:Banknote},
  {label:'مردودات المشتريات',amount:totals.returns,cls:'bg-violet-50 border-violet-200 text-violet-900',Icon:RotateCcw}
 ];
 return <div dir="rtl" className="flex h-full min-h-0 w-full flex-1 flex-col gap-1.5 overflow-hidden">
  <div className="flex min-h-[38px] shrink-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-xs">
   <div className="flex shrink-0 items-center gap-1.5">
    <Truck className="h-5 w-5 text-blue-700"/>
    <h2 className="whitespace-nowrap text-[12px] font-black text-slate-900">دليل الموردين وكشوف الحساب</h2>
   </div>
   <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
    <button type="button" onClick={onAdd} className={mini+' bg-indigo-700 hover:bg-indigo-800'}><Plus className="h-3.5 w-3.5"/> إضافة مورد</button>
    <button type="button" onClick={()=>onPurchase()} className={mini+' bg-blue-700 hover:bg-blue-800'}><Plus className="h-3.5 w-3.5"/> فاتورة مشتريات</button>
    <button type="button" onClick={onReturn} className={mini+' bg-amber-600 hover:bg-amber-700'}><RotateCcw className="h-3.5 w-3.5"/> مرتجع</button>
    <button type="button" onClick={()=>onPay()} className={mini+' bg-rose-700 hover:bg-rose-800'}><Receipt className="h-3.5 w-3.5"/> سند صرف</button>
    <button type="button" onClick={print} disabled={invalid} className={mini+' bg-slate-800 hover:bg-slate-900 disabled:opacity-40'}><Printer className="h-3.5 w-3.5"/> طباعة كشف الموردين</button>
   </div>
  </div>
  <div className="flex min-h-[40px] shrink-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-xs">
   <button onClick={()=>onTab('invoices')} className="h-7 shrink-0 rounded-md bg-blue-50 px-2.5 text-[11px] font-bold text-blue-800">فواتير المشتريات</button>
   <button onClick={()=>onTab('returns')} className="h-7 shrink-0 rounded-md bg-amber-50 px-2.5 text-[11px] font-bold text-amber-800">المرتجعات</button>
   <button onClick={()=>onTab('vouchers')} className="h-7 shrink-0 rounded-md bg-rose-50 px-2.5 text-[11px] font-bold text-rose-800">سندات الصرف</button>
   <label className="flex h-7 w-[350px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2">
    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400"/>
    <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
     className="w-full min-w-0 bg-transparent text-[11px] outline-none" placeholder="اسم المورد أو رقمه أو جواله..." aria-label="بحث الموردين"/>
   </label>
   <label className="flex shrink-0 items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-indigo-600"/>
    <select value={mode} onChange={e=>setMode(e.target.value as DirectoryDateMode)}
     aria-label="فترة كشف الموردين" className="h-7 w-[138px] rounded-md border border-slate-200 bg-slate-50 px-1 text-[11px]">
     <option value="all">جميع التواريخ</option><option value="day">تاريخ محدد</option><option value="range">من تاريخ إلى تاريخ</option>
    </select>
   </label>
   {mode==='day'&&<input type="date" value={day} onChange={e=>setDay(e.target.value)} dir="ltr" aria-label="اليوم" className="h-7 w-[126px] shrink-0 rounded-md border px-1 text-[11px]"/>}
   {mode==='range'&&<>
    <input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} aria-label="من تاريخ" dir="ltr" className="h-7 w-[126px] shrink-0 rounded-md border px-1 text-[11px]"/>
    <input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} aria-label="إلى تاريخ" dir="ltr" className="h-7 w-[126px] shrink-0 rounded-md border px-1 text-[11px]"/>
   </>}
   <select value={status} onChange={e=>setStatus(e.target.value)} className="h-7 shrink-0 rounded-md border px-1 text-[11px]" aria-label="حالة رصيد المورد">
    <option value="all">كل الأرصدة</option><option value="owed">مستحق للمورد</option><option value="advance">دفعات مقدمة</option><option value="settled">خالص</option>
   </select>
   <button type="button" onClick={()=>{setSearch('');setMode('all');setFrom('');setTo('');setStatus('all');}}
    className="h-7 shrink-0 rounded-md border bg-slate-100 px-2 text-[11px] font-bold">إظهار الكل</button>
   <div role="status" className="ms-auto flex shrink-0 gap-2 text-[10px] font-bold text-slate-700">
    <span>المعروض: {rows.length} / {allCount}</span><span>|</span>
    <span>الرصيد: <b dir="ltr" className="inline-block text-blue-800">{moneyDisplay(totals.closing)} {settings.currency}</b></span>
   </div>
  </div>
  {invalid&&<p className="shrink-0 text-[11px] font-bold text-red-700">بداية الفترة بعد نهايتها.</p>}
  <div className="shrink-0 overflow-x-auto">
   <div className="grid min-w-[850px] grid-cols-4 gap-1.5">
    {cards.map(({label,amount,cls,Icon})=><div key={label} className={'rounded-lg border px-2 py-1 '+cls}>
     <div className="flex h-[28px] items-center justify-between gap-1.5 whitespace-nowrap">
      <Icon className="h-4 w-4 shrink-0"/><span className="text-[11px] font-extrabold">{label}</span>
      <b dir="ltr" className="text-[13px] tabular-nums">{moneyDisplay(amount)} {settings.currency}</b>
     </div>
    </div>)}
   </div>
  </div>
  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
   <div role="region" aria-label="جدول الموردين" tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
    <table className="w-full min-w-[1080px] table-fixed border-collapse text-right text-[11px]">
     <colgroup><col style={{width:'10%'}}/><col style={{width:'23%'}}/><col style={{width:'11%'}}/>
      <col style={{width:'8%'}}/><col style={{width:'8%'}}/><col style={{width:'8%'}}/>
      <col style={{width:'8%'}}/><col style={{width:'8%'}}/><col style={{width:'9%'}}/><col style={{width:'7%'}}/></colgroup>
     <thead className="sticky top-0 z-10 bg-blue-950 text-white"><tr>
      {['رقم المورد','اسم المورد','جهة الاتصال','رصيد أول الفترة','مشتريات الفترة','المدفوعات','المرتجعات','التسويات','رصيد آخر الفترة','الإجراءات'].map(t=>
       <th key={t} className="border-l border-blue-900 px-1 py-2 text-center font-bold">{t}</th>)}
     </tr></thead>
     <tbody className="divide-y divide-slate-200">
      {!rows.length&&<tr><td colSpan={10} className="py-10 text-center text-slate-500">لا يوجد موردون مطابقون للتصفية.</td></tr>}
      {rows.map((r,i)=><tr key={r.entity.id} className={i%2?'bg-slate-50/80':'bg-white'}>
       <td className="px-1 py-2 text-center font-mono font-bold text-blue-800">{r.entity.code}</td>
       <td className="px-2 py-2"><span className="block truncate whitespace-nowrap font-bold" title={r.entity.name}>{r.entity.name}</span></td>
       <td className="px-1 py-2"><span className="block truncate" title={r.entity.contactPerson||r.entity.phone}>{r.entity.contactPerson||r.entity.phone||'—'}</span></td>
       {[r.opening,r.purchases,r.payments,r.returns,r.adjustments,r.closing].map((v,j)=>
        <td key={j} dir="ltr" className={'px-1 py-2 text-left tabular-nums whitespace-nowrap '+(j===5?'font-black text-blue-900':'')}>{moneyDisplay(v)}</td>)}
       <td className="px-1 py-2 text-center">
        <div className="flex justify-center gap-1">
         <button onClick={()=>setSelectedPartyForStatement(r.entity)} title="كشف حساب المورد" className="rounded bg-blue-50 p-1 text-blue-800"><FileText className="h-3.5 w-3.5"/></button>
         <button onClick={()=>onPay(r.entity)} title="سند صرف" className="rounded bg-rose-50 p-1 text-rose-800"><Receipt className="h-3.5 w-3.5"/></button>
         <button onClick={()=>onEdit(r.entity)} title="تعديل المورد" className="rounded bg-amber-50 p-1 text-amber-800"><Edit2 className="h-3.5 w-3.5"/></button>
         <button onClick={()=>onDelete(r.entity)} title="حذف مورد بلا مراجع مالية" className="rounded bg-rose-50 p-1 text-rose-700"><Trash2 className="h-3.5 w-3.5"/></button>
        </div>
       </td>
      </tr>)}
      {!!rows.length&&<tr className="bg-blue-900 font-black text-white">
       <td colSpan={3} className="px-2 py-2">الإجمالي</td>
       {[totals.opening,totals.purchases,totals.payments,totals.returns,totals.adjustments,totals.closing].map((v,i)=>
        <td key={i} dir="ltr" className="px-1 py-2 text-left tabular-nums">{moneyDisplay(v)}</td>)}
       <td/>
      </tr>}
     </tbody>
    </table>
   </div>
  </div>
 </div>;
};
