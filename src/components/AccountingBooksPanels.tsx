import {ReportPdfButton} from './common/ReportPdfButton';
import React, {useMemo,useState} from 'react';
import type {Account,JournalEntry} from '../types';
import {makeJournalBook,makeLedgerBook,makeTrialBalance,bookMoney} from '../utils/accountingBooks';

type Mode='journal'|'ledger'|'trial';
type Props={
 mode:Mode;entries:JournalEntry[];accounts:Account[];currency:string;
 selectedAccount:string;onAccount:(code:string)=>void;
};
const sourceLabels:Record<string,string>={
 pos_invoice:'فاتورة مبيعات',cogs:'تكلفة مبيعات',invoice_correction:'تصحيح فاتورة',
 purchase:'فاتورة مشتريات',expense:'مصروف',receipt:'قبض',payment:'صرف',
 transfer:'تحويل',manual:'قيد يدوي',sales_return:'مرتجع مبيعات',
 purchase_return:'مرتجع مشتريات',print_order:'أمر طباعة',clearance:'مقاصة'
};
const money=(n:number)=>bookMoney(n);
const safeCsv=(cell:unknown)=>{
 let value=String(cell??'');
 if(/^\s*[=+\-@]/.test(value))value="'"+value;
 return '"'+value.replace(/"/g,'""')+'"';
};
const downloadCsv=(file:string,rows:(string|number)[][])=>{
 const csv='\uFEFF'+rows.map(r=>r.map(safeCsv).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const link=document.createElement('a');link.href=url;link.download=file;link.click();
 URL.revokeObjectURL(url);
};
const dateAllowed=(date:string,from:string,to:string)=>(!from||date>=from)&&(!to||date<=to);
const dateField='h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-200';
const numberClass='text-left tabular-nums whitespace-nowrap font-mono';
const rowCell='border-b border-slate-100 px-2.5 py-2 align-top';
const displaySign=(cents:number)=>(cents===0?'—':money(Math.abs(cents)));
const signDescription=(n:number)=>n>0?'مدين':n<0?'دائن':'متوازن';

export const AccountingBooksPanels:React.FC<Props>=({
 mode,entries,accounts,currency,selectedAccount,onAccount
})=>{
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [search,setSearch]=useState('');
 const [source,setSource]=useState('');
 const [onlyIssues,setOnlyIssues]=useState(false);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [page,setPage]=useState(1);
 const [asOf,setAsOf]=useState('');
 const journal=useMemo(()=>makeJournalBook(entries,accounts),[entries,accounts]);
 const accountSet=useMemo(()=>new Set(accounts.map(a=>a.code)),[accounts]);
 const journalFiltered=useMemo(()=>journal.filter(row=>{
  if(!dateAllowed(row.entry.date,from,to))return false;
  if(source&&row.entry.referenceType!==source)return false;
  if(onlyIssues&&row.valid)return false;
  const needle=search.trim().toLowerCase();
  return !needle||[row.entry.entryNumber,row.entry.description,
   row.entry.referenceId,row.entry.referenceType,...(row.entry.lines||[]).map(l=>l.accountName+' '+l.accountCode)]
   .join(' ').toLowerCase().includes(needle);
 }).sort((a,b)=>String(b.entry.date).localeCompare(String(a.entry.date))||
 String(b.entry.createdAt).localeCompare(String(a.entry.createdAt))||
 String(b.entry.id).localeCompare(String(a.entry.id))),[journal,from,to,source,onlyIssues,search]);
 const limit=40;
 const paged=journalFiltered.slice((page-1)*limit,page*limit);
 const issueCount=journal.filter(j=>!j.valid).length;
 const ledger=useMemo(()=>makeLedgerBook(entries,selectedAccount,from,to),[entries,selectedAccount,from,to]);
 const selected=accounts.find(a=>a.code===selectedAccount);
 const trial=useMemo(()=>makeTrialBalance(entries,accounts,asOf),[entries,accounts,asOf]);
 const currencyLabel=currency||'₪';
 const onExport=()=>{
  if(mode==='journal'){
   downloadCsv('دفتر-اليومية.csv',[['التاريخ','رقم القيد','نوع المستند','مرجع المستند','البيان','الحساب','اسم الحساب','مدين','دائن','حالة القيد'],
    ...journalFiltered.flatMap(r=>(r.entry.lines||[]).map(l=>[
     r.entry.date,r.entry.entryNumber,sourceLabels[r.entry.referenceType]||r.entry.referenceType,
     r.entry.referenceId||'',r.entry.description,l.accountCode,
     accounts.find(a=>a.code===l.accountCode)?.name||l.accountName||'',
     (Number(l.debit)||0).toFixed(2),(Number(l.credit)||0).toFixed(2),
     r.valid?'سليم':r.issues.join('؛ ')]))]);
  }else if(mode==='ledger'){
   downloadCsv('دفتر-الأستاذ-'+selectedAccount+'.csv',[
    ['التاريخ','رقم القيد','المستند','مرجع المستند','البيان','مدين','دائن','الرصيد المدين','الرصيد الدائن'],
    ['', '', '', '', 'رصيد أول الفترة', '', '',(ledger.opening>0?ledger.opening/100:0).toFixed(2),(ledger.opening<0?-ledger.opening/100:0).toFixed(2)],
    ...ledger.rows.map(l=>[l.date,l.entryNumber,sourceLabels[l.source]||l.source,l.referenceId,l.description,
     (l.debit/100).toFixed(2),(l.credit/100).toFixed(2),
     (l.running>0?l.running/100:0).toFixed(2),(l.running<0?-l.running/100:0).toFixed(2)])]);
  }else{
   downloadCsv('ميزان-المراجعة.csv',[['رقم الحساب','اسم الحساب','إجمالي المدين','إجمالي الدائن','رصيد مدين','رصيد دائن','فرق رصيد البطاقة'],
    ...trial.rows.map(r=>[r.code,r.name,(r.debit/100).toFixed(2),(r.credit/100).toFixed(2),
     (r.debitBalance/100).toFixed(2),(r.creditBalance/100).toFixed(2),(r.storedDifference/100).toFixed(2)])]);
  }
 };
 const title=mode==='journal'?'دفتر اليومية العامة':mode==='ledger'?'دفتر الأستاذ العام':'ميزان المراجعة';
 const refLabel=(type:string)=>sourceLabels[type]||type||'غير محدد';
 return <section className="accounting-book-print space-y-3 text-right" dir="rtl">
  <style>{'@media print { body * {visibility:hidden!important} .accounting-book-print,.accounting-book-print * {visibility:visible!important} .accounting-book-print{position:absolute!important;top:0;right:0;left:0;width:100%!important;padding:4mm!important} .books-no-print{display:none!important} .accounting-book-print table{font-size:9px!important} .accounting-book-print tr{break-inside:avoid} .books-screen-only{display:none!important} .books-print-only{display:block!important} }'}</style>
  <header className="bg-white border border-slate-200 rounded-lg px-3 py-3 flex flex-wrap items-center justify-between gap-3">
   <div>
    <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
    <p className="text-[11px] text-slate-500 mt-1">سجل محاسبي مشتق من سطور القيود الفعلية • المبالغ بعملة {currencyLabel} • لا يغيّر الأرصدة</p>
   </div>
   <div className="books-no-print flex gap-2">
    <button type="button" onClick={onExport} className="px-3 py-1.5 text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md">تصدير Excel / CSV</button>
    <ReportPdfButton filename={title} selector=".accounting-book-print" scope=".accounting-book-print" numberPages />
                <button type="button" onClick={()=>window.print()} className="px-3 py-1.5 text-xs font-bold bg-slate-100 border border-slate-200 text-slate-700 rounded-md">طباعة</button>
   </div>
  </header>

  {mode==='journal'&&<>
   <div className="books-no-print grid grid-cols-2 md:grid-cols-6 gap-2 border border-slate-200 bg-white p-3 rounded-lg">
    <input aria-label="بحث القيود" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="بحث برقم القيد أو الحساب أو البيان..." className={dateField+' col-span-2 md:col-span-2'}/>
    <input aria-label="من تاريخ" type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1)}} className={dateField}/>
    <input aria-label="إلى تاريخ" type="date" value={to} onChange={e=>{setTo(e.target.value);setPage(1)}} className={dateField}/>
    <select aria-label="مصدر القيد" value={source} onChange={e=>{setSource(e.target.value);setPage(1)}} className={dateField}>
     <option value="">كل المصادر</option>
     {[...new Set<string>(journal.map(r=>String(r.entry.referenceType)))].sort().map(k=><option key={k} value={k}>{refLabel(k)}</option>)}
    </select>
    <label className="flex gap-1 items-center text-xs text-slate-700"><input type="checkbox" checked={onlyIssues} onChange={e=>{setOnlyIssues(e.target.checked);setPage(1)}}/> الملاحظات فقط</label>
   </div>
   <div className="grid grid-cols-3 gap-2">
    <div className="bg-white border rounded-lg p-2.5 text-xs">القيود المعروضة <strong className="block text-base">{journalFiltered.length}</strong></div>
    <div className="bg-white border rounded-lg p-2.5 text-xs">المجموع المدين <strong className="block text-base tabular-nums">{money(journalFiltered.reduce((n,r)=>n+r.debit,0))}</strong></div>
    <div className="bg-white border rounded-lg p-2.5 text-xs">ملاحظات التدقيق <strong className={'block text-base '+(issueCount?'text-rose-700':'text-emerald-700')}>{issueCount}</strong></div>
   </div>
   <div className="books-screen-only overflow-x-auto bg-white rounded-lg border border-slate-200">
    <table className="w-full min-w-[870px] text-xs border-collapse">
     <thead className="bg-slate-100 text-slate-700"><tr>
      <th className={rowCell}>التاريخ</th><th className={rowCell}>رقم القيد</th>
      <th className={rowCell}>المستند / المرجع</th><th className={rowCell}>البيان</th>
      <th className={rowCell+' text-left'}>مدين</th><th className={rowCell+' text-left'}>دائن</th>
      <th className={rowCell}>المراجعة</th><th className={rowCell+' books-no-print'}>التفاصيل</th>
     </tr></thead>
     <tbody>{paged.map(({entry,debit,credit,valid,issues},i)=>{
      const open=expanded===entry.id;
      return <React.Fragment key={entry.id||String(i)}>
       <tr className={i%2?'bg-slate-50/50':'bg-white'}>
        <td className={rowCell+' whitespace-nowrap tabular-nums'}>{entry.date}</td>
        <td className={rowCell+' font-mono font-bold'}>{entry.entryNumber||entry.id}</td>
        <td className={rowCell}><div className="font-semibold">{refLabel(entry.referenceType)}</div><div className="text-slate-500 font-mono text-[10px]">{entry.referenceId||'—'}</div></td>
        <td className={rowCell+' max-w-[320px]'}>{entry.description}</td>
        <td className={rowCell+' '+numberClass}>{money(debit)}</td>
        <td className={rowCell+' '+numberClass}>{money(credit)}</td>
        <td className={rowCell}>{valid?<span className="text-emerald-700 font-bold">متوازن وسليم</span>:<span className="text-rose-700 font-bold" title={issues.join('؛ ')}>تحقق: {issues.join('، ')}</span>}</td>
        <td className={rowCell+' books-no-print'}><button type="button" className="text-blue-700 underline" onClick={()=>setExpanded(open?null:entry.id)}>{open?'إغلاق':'عرض الأطراف'}</button></td>
       </tr>
       {open&&<tr><td colSpan={8} className="p-2 bg-blue-50/50">
        <table className="w-full text-xs bg-white border"><thead><tr className="bg-slate-100">
         <th className="p-2">الحساب</th><th className="p-2">اسم الحساب</th><th className="p-2">بيان الطرف</th><th className="p-2 text-left">مدين</th><th className="p-2 text-left">دائن</th>
        </tr></thead><tbody>{(entry.lines||[]).map((l,n)=><tr key={n} className="border-t">
         <td className="p-2 font-mono">{l.accountCode}</td>
         <td className={'p-2 '+(!accountSet.has(l.accountCode)?'text-rose-700 font-bold':'')}>{accounts.find(a=>a.code===l.accountCode)?.name||l.accountName||'غير معروف'}</td>
         <td className="p-2">{l.description||entry.description}</td>
         <td className="p-2 text-left font-mono">{displaySign(Math.round(Number(l.debit||0)*100))}</td>
         <td className="p-2 text-left font-mono">{displaySign(Math.round(Number(l.credit||0)*100))}</td>
        </tr>)}</tbody>
        <tfoot><tr className="bg-slate-100 font-bold"><td colSpan={3} className="p-2">إجمالي القيد</td><td className="p-2 text-left">{money(debit)}</td><td className="p-2 text-left">{money(credit)}</td></tr></tfoot></table>
       </td></tr>}
      </React.Fragment>;
     })}</tbody>
     <tfoot><tr className="bg-slate-100 font-bold"><td colSpan={4} className="p-2">إجمالي النتائج حسب الفلتر (جميع الصفحات)</td><td className="p-2 text-left">{money(journalFiltered.reduce((n,r)=>n+r.debit,0))}</td><td className="p-2 text-left">{money(journalFiltered.reduce((n,r)=>n+r.credit,0))}</td><td colSpan={2}/></tr></tfoot>
    </table>
    {!journalFiltered.length&&<div className="p-8 text-center text-slate-500 text-xs">لا توجد قيود مطابقة للفلاتر</div>}
   </div>
   <div className="books-print-only hidden">
    <table className="w-full text-[10px] border-collapse">
     <thead><tr className="bg-slate-100">
      <th className="border p-1">التاريخ</th><th className="border p-1">رقم القيد</th><th className="border p-1">المستند</th><th className="border p-1">البيان / الحساب</th>
      <th className="border p-1">مدين</th><th className="border p-1">دائن</th>
     </tr></thead><tbody>
     {journalFiltered.map(({entry,debit,credit,issues},index)=><React.Fragment key={entry.id||String(index)}>
      {(entry.lines||[]).map((line,lineIndex)=><tr key={lineIndex}>
       <td className="border p-1">{lineIndex===0?entry.date:''}</td>
       <td className="border p-1">{lineIndex===0?entry.entryNumber:''}</td>
       <td className="border p-1">{lineIndex===0?refLabel(entry.referenceType):''}{lineIndex===0&&entry.referenceId?' / '+entry.referenceId:''}</td>
       <td className="border p-1"><strong>{line.accountCode} — {accounts.find(a=>a.code===line.accountCode)?.name||line.accountName}</strong> — {line.description||entry.description}</td>
       <td className="border p-1 text-left">{displaySign(Math.round(Number(line.debit||0)*100))}</td>
       <td className="border p-1 text-left">{displaySign(Math.round(Number(line.credit||0)*100))}</td>
      </tr>)}
      <tr className="bg-slate-50 font-bold">
       <td colSpan={4} className="border p-1">إجمالي القيد {issues.length?'— مراجعة: '+issues.join('، '):''}</td>
       <td className="border p-1 text-left">{money(debit)}</td><td className="border p-1 text-left">{money(credit)}</td>
      </tr>
     </React.Fragment>)}
     </tbody><tfoot><tr className="bg-slate-200 font-bold"><td colSpan={4} className="border p-1">المجموع</td>
      <td className="border p-1">{money(journalFiltered.reduce((n,r)=>n+r.debit,0))}</td>
      <td className="border p-1">{money(journalFiltered.reduce((n,r)=>n+r.credit,0))}</td>
     </tr></tfoot>
    </table>
   </div>
   {journalFiltered.length>limit&&<div className="books-no-print flex items-center justify-center gap-3 text-xs">
    <button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="border rounded px-3 py-1.5 disabled:opacity-40">السابق</button>
    <span>صفحة {page} من {Math.ceil(journalFiltered.length/limit)}</span>
    <button type="button" disabled={page*limit>=journalFiltered.length} onClick={()=>setPage(p=>p+1)} className="border rounded px-3 py-1.5 disabled:opacity-40">التالي</button>
   </div>}
  </>}

  {mode==='ledger'&&<>
   <div className="books-no-print flex flex-wrap gap-2 items-center bg-white border rounded-lg p-3">
    <label className="text-xs font-bold">الحساب</label>
    <select className={dateField+' min-w-[240px] max-w-full'} value={selectedAccount} onChange={e=>onAccount(e.target.value)}>
     {accounts.map(a=><option value={a.code} key={a.code}>{a.code} — {a.name}</option>)}
    </select>
    <label className="text-xs">من</label><input type="date" className={dateField} value={from} onChange={e=>setFrom(e.target.value)}/>
    <label className="text-xs">إلى</label><input type="date" className={dateField} value={to} onChange={e=>setTo(e.target.value)}/>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
    <div className="bg-white border rounded-lg p-2.5">رصيد أول الفترة <strong className="block text-base tabular-nums">{money(Math.abs(ledger.opening))} <small>{signDescription(ledger.opening)}</small></strong></div>
    <div className="bg-white border rounded-lg p-2.5">حركة مدين <strong className="block text-base tabular-nums">{money(ledger.totalDebit)}</strong></div>
    <div className="bg-white border rounded-lg p-2.5">حركة دائن <strong className="block text-base tabular-nums">{money(ledger.totalCredit)}</strong></div>
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">رصيد آخر الفترة <strong className="block text-base tabular-nums">{money(Math.abs(ledger.closing))} <small>{signDescription(ledger.closing)}</small></strong></div>
   </div>
   <div className="bg-white border rounded-lg overflow-x-auto">
    <table className="w-full min-w-[860px] text-xs"><thead className="bg-slate-100"><tr>
     <th className={rowCell}>التاريخ</th><th className={rowCell}>رقم القيد</th><th className={rowCell}>نوع المستند</th>
     <th className={rowCell}>المرجع</th><th className={rowCell}>البيان</th>
     <th className={rowCell+' text-left'}>مدين</th><th className={rowCell+' text-left'}>دائن</th>
     <th className={rowCell+' text-left'}>رصيد مدين</th><th className={rowCell+' text-left'}>رصيد دائن</th>
    </tr></thead><tbody>
    <tr className="bg-sky-50 font-bold"><td colSpan={5} className="p-2">رصيد أول الفترة من القيود السابقة{selected?' — '+selected.name:''}</td>
     <td>—</td><td>—</td><td className="text-left px-2">{ledger.opening>0?money(ledger.opening):'—'}</td><td className="text-left px-2">{ledger.opening<0?money(-ledger.opening):'—'}</td>
    </tr>
    {ledger.rows.map((l,i)=><tr key={l.id} className={i%2?'bg-slate-50/50':''}>
     <td className={rowCell+' tabular-nums'}>{l.date}</td><td className={rowCell+' font-mono'}>{l.entryNumber}</td>
     <td className={rowCell}>{refLabel(l.source)}</td><td className={rowCell+' font-mono text-[10px]'}>{l.referenceId||'—'}</td>
     <td className={rowCell}>{l.description}</td>
     <td className={rowCell+' '+numberClass}>{displaySign(l.debit)}</td><td className={rowCell+' '+numberClass}>{displaySign(l.credit)}</td>
     <td className={rowCell+' '+numberClass}>{l.running>0?money(l.running):'—'}</td>
     <td className={rowCell+' '+numberClass}>{l.running<0?money(-l.running):'—'}</td>
    </tr>)}
    </tbody><tfoot><tr className="bg-slate-100 font-bold">
     <td colSpan={5} className="p-2">إجمالي الفترة / الرصيد الختامي</td>
     <td className="p-2 text-left">{money(ledger.totalDebit)}</td><td className="p-2 text-left">{money(ledger.totalCredit)}</td>
     <td className="p-2 text-left">{ledger.closing>0?money(ledger.closing):'—'}</td>
     <td className="p-2 text-left">{ledger.closing<0?money(-ledger.closing):'—'}</td>
    </tr></tfoot></table>
    {ledger.rows.length===0&&<div className="p-5 text-center text-slate-500">لا توجد حركة لهذا الحساب ضمن الفترة المحددة</div>}
   </div>
   <p className="text-[11px] text-slate-500">الأستاذ يحتسب الرصيد من قيود اليومية الفعلية فقط، دون إضافة رصيد بطاقة الحساب مرة أخرى. إذا لم توجد قيود افتتاحية معتمدة فلن يُفترض رصيد افتتاحي تلقائيًا.</p>
  </>}

  {mode==='trial'&&<>
   <div className="books-no-print flex flex-wrap gap-2 items-center p-3 border rounded-lg bg-white">
    <label className="text-xs font-bold">ميزان المراجعة حتى تاريخ</label>
    <input aria-label="حتى تاريخ" type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} className={dateField}/>
    <span className="text-[11px] text-slate-500">اتركه فارغًا لعرض كامل الفترة</span>
   </div>
   {(trial.unknownAccounts>0||trial.mismatchedSnapshots>0||!trial.balanced)&&
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-2.5 text-xs text-amber-950">
     <strong>ملاحظات مطابقة تحتاج مراجعة:</strong>
     {' '}حسابات غير موجودة بالدليل: {trial.unknownAccounts}،
     بطاقات حسابات تختلف أرصدتها المخزنة عن صافي قيود اليومية: {trial.mismatchedSnapshots}،
     ميزان المراجعة {trial.balanced?'متوازن من القيود':'غير متوازن من القيود'}.
     لا تتم أي تسوية آلية.
    </div>}
   <div className="bg-white border rounded-lg overflow-x-auto">
    <table className="w-full min-w-[760px] text-xs"><thead className="bg-slate-100"><tr>
     <th className={rowCell}>رقم الحساب</th><th className={rowCell}>اسم الحساب</th>
     <th className={rowCell+' text-left'}>مجموع مدين</th><th className={rowCell+' text-left'}>مجموع دائن</th>
     <th className={rowCell+' text-left'}>رصيد مدين</th><th className={rowCell+' text-left'}>رصيد دائن</th>
     <th className={rowCell}>مطابقة البطاقة</th>
    </tr></thead><tbody>{trial.rows.map((r,i)=><tr key={r.code} className={i%2?'bg-slate-50/60':''}>
     <td className={rowCell+' font-mono font-bold'}>{r.code}</td><td className={rowCell}>{r.name}</td>
     <td className={rowCell+' '+numberClass}>{displaySign(r.debit)}</td><td className={rowCell+' '+numberClass}>{displaySign(r.credit)}</td>
     <td className={rowCell+' '+numberClass}>{displaySign(r.debitBalance)}</td><td className={rowCell+' '+numberClass}>{displaySign(r.creditBalance)}</td>
     <td className={rowCell}>{r.name==='حساب غير موجود في الدليل'?<span className="text-rose-700">حساب مجهول</span>:
      r.storedDifference===0?<span className="text-emerald-700">مطابق</span>:
      <span className="text-amber-700" title={'الفرق: '+money(r.storedDifference)}>فرق {money(Math.abs(r.storedDifference))}</span>}</td>
    </tr>)}</tbody><tfoot><tr className="bg-slate-100 font-bold">
     <td colSpan={4} className="p-2">إجمالي الأرصدة المستخرجة من دفتر اليومية</td>
     <td className="p-2 text-left">{money(trial.debit)}</td><td className="p-2 text-left">{money(trial.credit)}</td>
     <td className="p-2">{trial.balanced?'متوازن':'غير متوازن'}</td>
    </tr></tfoot></table>
   </div>
   <p className="text-[11px] text-slate-500">يعرض هذا الميزان أرصدة الحركات المحاسبية المسجلة؛ فروقات أرصدة بطاقات الحساب تُعرض للتدقيق ولا تُخفى ولا تُرحَّل تلقائيًا.</p>
  </>}
 </section>;
};
