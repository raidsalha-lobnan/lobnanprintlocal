import React,{useMemo,useState} from 'react';
import {Users,UserPlus,Search,CalendarDays,Printer,FileText,Edit2,Trash2,Banknote,CreditCard,TrendingUp,Wallet,PlusCircle,MinusCircle,Eye,DollarSign} from 'lucide-react';
import {useAccounting} from '../context/AccountingContext';
import type {Employee} from '../types';
import {employeePeriodRows,totalAmounts,moneyDisplay,todayLocal,printDirectoryPeriodReport,type DirectoryDateMode} from '../utils/otherPartyPeriodReports';

interface Props{
 onAdd:()=>void;onEdit:(emp:Employee)=>void;onDelete:(emp:Employee)=>void;
 onPay:(emp:Employee)=>void;onAdvance:(empId:string)=>void;
 onDeduction:(empId:string)=>void;onIncentive:(empId:string)=>void;
 onDetail:(emp:Employee)=>void;
 onTab:(tab:'employees'|'adjustments'|'payroll_sheets')=>void;
}
export const EmployeesCompactDirectory:React.FC<Props>=({
 onAdd,onEdit,onDelete,onPay,onAdvance,onDeduction,onIncentive,onDetail,onTab
})=>{
 const {employees,vouchers,invoices,purchases,purchaseReturns,salesReturns,
  employeeAdvances,employeeDeductions,employeeIncentives,payrollSheets,
  journalEntries,debtClearings,settings,setSelectedEmployeeForStatement}=useAccounting();
 const [search,setSearch]=useState('');
 const [mode,setMode]=useState<DirectoryDateMode>('all');
 const [day,setDay]=useState(todayLocal);
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [status,setStatus]=useState('all');
 const [salaryType,setSalaryType]=useState('all');
 const filter={mode,day,from,to};
 const invalid=mode==='range'&&!!from&&!!to&&from>to;
 const source=useMemo(()=>({employees,vouchers,invoices,purchases,purchaseReturns,salesReturns,
  employeeAdvances,employeeDeductions,employeeIncentives,payrollSheets,
  journalEntries,debtClearings}),[employees,vouchers,invoices,purchases,purchaseReturns,
  salesReturns,employeeAdvances,employeeDeductions,employeeIncentives,payrollSheets,
  journalEntries,debtClearings]);
 const rows=useMemo(()=>invalid?[]:employeePeriodRows(source,filter,search,status)
  .filter(r=>salaryType==='all'||r.entity.salaryType===salaryType),
 [source,mode,day,from,to,search,status,salaryType,invalid]);
 const totals=totalAmounts(rows,['opening','entitlements','advances','deductions','payments','movement','closing']);
 const currency=settings.currency;
 const locked=(emp:Employee)=>Boolean(emp.paymentHistory?.length)||
  employeeAdvances.some(r=>r.employeeId===emp.id)||
  employeeDeductions.some(r=>r.employeeId===emp.id)||
  employeeIncentives.some(r=>r.employeeId===emp.id)||
  payrollSheets.some(s=>s.items.some(item=>item.employeeId===emp.id))||
  vouchers.some(v=>v.partyId===emp.id)||
  invoices.some(v=>v.counterpartyType==='employee'&&v.counterpartyId===emp.id)||
  purchases.some(v=>v.supplierId===emp.id);
 const print=()=>{
  if(invalid)return;
  const cols=['رقم الموظف','اسم الموظف','الوظيفة','رصيد أول الفترة','المستحقات',
   'السلف','الخصومات','المبالغ المصروفة','صافي الحركة','رصيد آخر الفترة'];
  const body=rows.map(r=>[r.entity.code,r.entity.name,r.entity.jobTitle,r.opening,r.entitlements,
   r.advances,r.deductions,r.payments,r.movement,r.closing]);
  body.push(['إجمالي الموظفين المعروضين',rows.length,'',totals.opening,totals.entitlements,
   totals.advances,totals.deductions,totals.payments,totals.movement,totals.closing]);
  printDirectoryPeriodReport('كشف حركة ومستحقات الموظفين',
   settings.businessName||'مطبعة لبنان',filter,cols,body,currency,
   'الرصيد الموجب = مستحق للموظف، والسالب = سلفة أو التزام على الموظف. الرصيد الختامي = رصيد أول الفترة + المستحقات − السلف − الخصومات − المصروف الفعلي. المستحقات والرواتب مستمدة من كشف الموظف المعتمد، وليس من افتراض دفع الراتب الشهري.');
 };
 const cards=[
  {label:'صافي مستحقات الموظفين',amount:totals.closing,cls:'bg-amber-50 border-amber-200 text-amber-900',Icon:Wallet},
  {label:'مستحقات الفترة',amount:totals.entitlements,cls:'bg-blue-50 border-blue-200 text-blue-900',Icon:TrendingUp},
  {label:'السلف والخصومات',amount:totals.advances+totals.deductions,cls:'bg-violet-50 border-violet-200 text-violet-900',Icon:CreditCard},
  {label:'المدفوع للموظفين',amount:totals.payments,cls:'bg-emerald-50 border-emerald-200 text-emerald-900',Icon:Banknote}
 ];
 const mini='inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] font-bold whitespace-nowrap text-white';
 return <div dir="rtl" className="flex h-full min-h-0 w-full flex-1 flex-col gap-1.5 overflow-hidden">
  <div className="flex min-h-[38px] shrink-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-xs">
   <div className="flex shrink-0 items-center gap-1.5"><Users className="h-5 w-5 text-blue-700"/>
    <h2 className="whitespace-nowrap text-[12px] font-black text-slate-900">دليل الموظفين وكشوف المستحقات</h2>
   </div>
   <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
    <button type="button" onClick={onAdd} className={mini+' bg-blue-700 hover:bg-blue-800'}><UserPlus className="h-3.5 w-3.5"/> إضافة موظف</button>
    <button type="button" onClick={()=>onTab('adjustments')} className={mini+' bg-amber-700 hover:bg-amber-800'}><CreditCard className="h-3.5 w-3.5"/> السلف والخصومات والحوافز</button>
    <button type="button" onClick={()=>onTab('payroll_sheets')} className={mini+' bg-emerald-700 hover:bg-emerald-800'}><FileText className="h-3.5 w-3.5"/> مسيرات الرواتب</button>
    <button type="button" onClick={print} disabled={invalid} className={mini+' bg-slate-800 hover:bg-slate-900 disabled:opacity-40'}><Printer className="h-3.5 w-3.5"/> طباعة كشف الموظفين</button>
   </div>
  </div>
  <div className="flex min-h-[40px] shrink-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-xs">
   <label className="flex h-7 w-[350px] shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2">
    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400"/>
    <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
     className="w-full min-w-0 bg-transparent text-[11px] outline-none" placeholder="اسم الموظف أو رقمه أو الوظيفة أو الجوال..." aria-label="بحث الموظفين"/>
   </label>
   <label className="flex shrink-0 items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-indigo-600"/>
    <select value={mode} onChange={e=>setMode(e.target.value as DirectoryDateMode)}
     aria-label="فترة كشف الموظفين" className="h-7 w-[138px] rounded-md border border-slate-200 bg-slate-50 px-1 text-[11px]">
     <option value="all">جميع التواريخ</option><option value="day">يوم محدد</option><option value="range">من تاريخ إلى تاريخ</option>
    </select>
   </label>
   {mode==='day'&&<input type="date" value={day} onChange={e=>setDay(e.target.value)} dir="ltr" aria-label="اليوم" className="h-7 w-[126px] shrink-0 rounded-md border px-1 text-[11px]"/>}
   {mode==='range'&&<>
    <input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} aria-label="من تاريخ" dir="ltr" className="h-7 w-[126px] shrink-0 rounded-md border px-1 text-[11px]"/>
    <input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} aria-label="إلى تاريخ" dir="ltr" className="h-7 w-[126px] shrink-0 rounded-md border px-1 text-[11px]"/>
   </>}
   <select value={status} onChange={e=>setStatus(e.target.value)} aria-label="حالة الموظف" className="h-7 shrink-0 rounded-md border px-1 text-[11px]">
    <option value="all">جميع الحالات</option><option value="active">على رأس العمل</option><option value="on_leave">إجازة</option><option value="terminated">منتهي الخدمة</option>
   </select>
   <select value={salaryType} onChange={e=>setSalaryType(e.target.value)} aria-label="نوع الراتب" className="h-7 shrink-0 rounded-md border px-1 text-[11px]">
    <option value="all">كل الرواتب</option><option value="monthly">شهري</option><option value="weekly">أسبوعي</option><option value="daily">يومي</option>
   </select>
   <button type="button" onClick={()=>{setSearch('');setMode('all');setFrom('');setTo('');setStatus('all');setSalaryType('all');}}
    className="h-7 shrink-0 rounded-md border bg-slate-100 px-2 text-[11px] font-bold">إظهار الكل</button>
   <div role="status" className="ms-auto flex shrink-0 gap-2 text-[10px] font-bold text-slate-700">
    <span>المعروض: {rows.length} / {employees.length}</span><span>|</span>
    <span>صافي الرصيد: <b dir="ltr" className="inline-block text-blue-800">{moneyDisplay(totals.closing)} {currency}</b></span>
   </div>
  </div>
  {invalid&&<p className="shrink-0 text-[11px] font-bold text-red-700">بداية الفترة بعد نهايتها.</p>}
  <div className="shrink-0 overflow-x-auto"><div className="grid min-w-[850px] grid-cols-4 gap-1.5">
   {cards.map(({label,amount,cls,Icon})=><div key={label} className={'rounded-lg border px-2 py-1 '+cls}>
    <div className="flex h-[28px] items-center justify-between gap-1 whitespace-nowrap">
     <Icon className="h-4 w-4 shrink-0"/><span className="text-[11px] font-extrabold">{label}</span>
     <b dir="ltr" className="text-[13px] tabular-nums">{moneyDisplay(amount)} {currency}</b>
    </div>
   </div>)}
  </div></div>
  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
   <div role="region" tabIndex={0} aria-label="جدول الموظفين" className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
    <table className="w-full min-w-[1150px] table-fixed border-collapse text-right text-[11px]">
     <colgroup><col style={{width:'8%'}}/><col style={{width:'18%'}}/><col style={{width:'11%'}}/><col style={{width:'8%'}}/>
      <col style={{width:'8%'}}/><col style={{width:'7%'}}/><col style={{width:'7%'}}/><col style={{width:'7%'}}/>
      <col style={{width:'7%'}}/><col style={{width:'8%'}}/><col style={{width:'11%'}}/></colgroup>
     <thead className="sticky top-0 z-10 bg-blue-950 text-white"><tr>
      {['رقم الموظف','اسم الموظف','الوظيفة','نوع الراتب','رصيد أول الفترة','المستحقات','السلف','الخصومات','المصروف','رصيد آخر الفترة','الإجراءات'].map(t=>
       <th key={t} className="border-l border-blue-900 px-1 py-2 text-center font-bold">{t}</th>)}
     </tr></thead>
     <tbody className="divide-y divide-slate-200">
      {!rows.length&&<tr><td colSpan={11} className="py-10 text-center text-slate-500">لا يوجد موظفون مطابقون للتصفية.</td></tr>}
      {rows.map((r,i)=><tr key={r.entity.id} className={i%2?'bg-slate-50/80':'bg-white'}>
       <td className="px-1 py-2 text-center font-mono font-bold text-blue-800">{r.entity.code}</td>
       <td className="px-2 py-2"><span className="block truncate font-bold" title={r.entity.name}>{r.entity.name}</span></td>
       <td className="px-1 py-2"><span className="block truncate" title={r.entity.jobTitle}>{r.entity.jobTitle||'—'}</span></td>
       <td className="px-1 py-2 text-center">{r.entity.salaryType==='monthly'?'شهري':r.entity.salaryType==='weekly'?'أسبوعي':'يومي'}</td>
       {[r.opening,r.entitlements,r.advances,r.deductions,r.payments,r.closing].map((v,j)=>
        <td key={j} dir="ltr" className={'px-1 py-2 text-left tabular-nums whitespace-nowrap '+(j===5?'font-black text-blue-900':'')}>{moneyDisplay(v)}</td>)}
       <td className="px-1 py-2 text-center">
        <div className="flex justify-center gap-0.5">
         <button onClick={()=>setSelectedEmployeeForStatement(r.entity)} title="كشف الموظف" className="rounded bg-blue-50 p-1 text-blue-800"><FileText className="h-3 w-3"/></button>
         <button onClick={()=>onAdvance(r.entity.id)} title="سلفة" className="rounded bg-amber-50 p-1 text-amber-800"><CreditCard className="h-3 w-3"/></button>
         <button onClick={()=>onDeduction(r.entity.id)} title="خصم" className="rounded bg-rose-50 p-1 text-rose-800"><MinusCircle className="h-3 w-3"/></button>
         <button onClick={()=>onIncentive(r.entity.id)} title="حافز" className="rounded bg-emerald-50 p-1 text-emerald-800"><PlusCircle className="h-3 w-3"/></button>
         <button onClick={()=>onPay(r.entity)} title="صرف راتب" className="rounded bg-blue-50 p-1 text-blue-800"><DollarSign className="h-3 w-3"/></button>
         <button onClick={()=>onDetail(r.entity)} title="تفاصيل الموظف" className="rounded bg-slate-50 p-1 text-slate-700"><Eye className="h-3 w-3"/></button>
         <button onClick={()=>onEdit(r.entity)} title="تعديل بيانات الموظف" className="rounded bg-amber-50 p-1 text-amber-800"><Edit2 className="h-3 w-3"/></button>
         <button onClick={()=>onDelete(r.entity)} disabled={locked(r.entity)} title={locked(r.entity)?'للموظف مراجع مالية ولا يمكن حذفه':'حذف موظف بلا حركات'} className="rounded bg-rose-50 p-1 text-rose-700 disabled:cursor-not-allowed disabled:opacity-25"><Trash2 className="h-3 w-3"/></button>
        </div>
       </td>
      </tr>)}
      {!!rows.length&&<tr className="bg-blue-900 font-black text-white">
       <td colSpan={4} className="px-2 py-2">الإجمالي</td>
       {[totals.opening,totals.entitlements,totals.advances,totals.deductions,totals.payments,totals.closing].map((v,i)=>
        <td key={i} dir="ltr" className="px-1 py-2 text-left tabular-nums">{moneyDisplay(v)}</td>)}
       <td/>
      </tr>}
     </tbody>
    </table>
   </div>
  </div>
 </div>;
};
