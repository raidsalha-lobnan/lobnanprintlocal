import React,{useState} from 'react';
import {useAccounting} from '../context/AccountingContext';
import type {AccountTransferPartyType,AccountTransferBalanceSide,DebtClearingRecord} from '../types';
import {authHeaders,getCurrentSessionToken,publicSyncApiUrl} from '../services/secureAuth';
import {fetchWithSyncDeadline} from '../sync-next/requestDeadline';
import {AutocompleteCombobox} from './common/AutocompleteCombobox';
import {subCustomerParentId,isInvoiceOnlySubCustomer} from '../utils/subCustomerIdentity';
import {calculateEmployeeTrueBalance,calculatePartyTrueBalance} from '../utils/statementGenerator';

export const transferTypeLabel=(type?:AccountTransferPartyType)=>type==='employee'?'موظف':type==='supplier'?'مورد':'عميل';
type Endpoint={type:AccountTransferPartyType;id:string;subCustomerId?:string};
type Request={requestId:string;date:string;source:Endpoint;target:Endpoint;amount:number;balanceSide:AccountTransferBalanceSide;reason:string;notes:string;replacesId?:string}|{requestId:string;date:string;reversesId:string;reason:string;notes:string};
const dateToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const types:AccountTransferPartyType[]=['customer','supplier','employee'];
const fmt=(n:number)=>n.toFixed(2);
function readPending(key:string):Request|null{
 try{const value=JSON.parse(localStorage.getItem(key)||'null');return value?.requestId?value:null;}catch{return null;}
}
export function AccountTransferModal({onClose,onSaved,reverse,edit}:{key?:string;onClose:()=>void;onSaved:(r:DebtClearingRecord)=>void;reverse?:DebtClearingRecord;edit?:DebtClearingRecord}){
 const {parties,employees,settings,currentUser,unifiedRepository,vouchers,employeeAdvances,
  employeeDeductions,employeeIncentives,invoices,purchases,purchaseReturns,salesReturns,payrollSheets,
  journalEntries,debtClearings,printOrders}=useAccounting();
 const pendingKey='lobnan_account_transfer_pending_v2:'+String(currentUser?.id||'none');
 const [pending,setPending]=useState<Request|null>(()=>readPending(pendingKey));
 const [source,setSource]=useState<Endpoint>(()=>pending&&'source' in pending?pending.source:edit?{type:edit.sourceType||'customer',id:edit.sourceId||edit.customerId,subCustomerId:edit.sourceSubCustomerId}:{type:'customer',id:''});
 const [target,setTarget]=useState<Endpoint>(()=>pending&&'target' in pending?pending.target:edit?{type:edit.targetType||'supplier',id:edit.targetId||edit.supplierId,subCustomerId:edit.targetSubCustomerId}:{type:'supplier',id:''});
 const [balanceSide,setBalanceSide]=useState<AccountTransferBalanceSide>(()=>pending&&'balanceSide' in pending?pending.balanceSide:edit?.balanceSide||'debit');
 const [amount,setAmount]=useState(()=>pending&&'amount' in pending?String(pending.amount):String(reverse?.amount||edit?.amount||''));
 const [date,setDate]=useState(pending?.date||edit?.date||dateToday());
 const [reason,setReason]=useState(pending?.reason||(reverse?'عكس سند '+reverse.clearingNumber:edit?.reason||''));
 const [notes,setNotes]=useState(pending?.notes||edit?.notes||'');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [sourceSearch,setSourceSearch]=useState(()=>parties.find(x=>x.id===source.id)?.name||employees.find(x=>x.id===source.id)?.name||'');
 const [targetSearch,setTargetSearch]=useState(()=>parties.find(x=>x.id===target.id)?.name||employees.find(x=>x.id===target.id)?.name||'');
 const [sourceSubSearch,setSourceSubSearch]=useState(()=>parties.find(x=>x.id===source.subCustomerId)?.name||'');
 const [targetSubSearch,setTargetSubSearch]=useState(()=>parties.find(x=>x.id===target.subCustomerId)?.name||'');
 const options=(type:AccountTransferPartyType)=>{
  if(type==='employee')return employees.map(e=>({id:e.id,name:e.name,code:e.code}));
  return parties.filter(p=>(p.type===type||p.type==='both')&&!p.isSubCustomer&&p.code!=='CUST-0001')
    .map(p=>({id:p.id,name:p.name,code:p.code}));
 };
 const getBalance=(p:Endpoint)=>{
  if(!p.id)return null;
  if(p.type==='employee'){
   const emp=employees.find(e=>e.id===p.id);
   return emp?-calculateEmployeeTrueBalance(emp,vouchers,employeeAdvances,employeeDeductions,employeeIncentives,
    invoices,purchases,purchaseReturns,salesReturns,payrollSheets,journalEntries,debtClearings):null;
  }
  const main=parties.find(x=>x.id===p.id);
  if(main&&p.subCustomerId){
   const subs=parties.filter(x=>x.isSubCustomer&&subCustomerParentId(x)===main.id);
   return calculatePartyTrueBalance(main,invoices,vouchers,purchases,purchaseReturns,salesReturns,printOrders,journalEntries,debtClearings,p.subCustomerId,subs);
  }
  return main?.balance??null;
 };
 const numeric=Number(amount);
 const validAmount=Number.isFinite(numeric)&&numeric>0&&numeric<1e12&&Math.abs(numeric*100-Math.round(numeric*100))<0.00001;
 const same=(source.type==='employee')===(target.type==='employee')&&source.id===target.id&&!(source.type==='customer'&&target.type==='customer'&&String(source.subCustomerId||'')!==String(target.subCustomerId||''));
 const locked=!!pending||busy;
 const balanceText=(n:number|null)=>n===null?'—':fmt(Math.abs(n))+' '+settings.currency+' '+(n>0?'مدين':n<0?'دائن':'');
 const endpointControl=(p:Endpoint,set:(v:Endpoint)=>void,search:string,setSearch:(v:string)=>void,side:'source'|'target')=>{
  const balance=getBalance(p),delta=(balanceSide==='debit'?-1:1)*(side==='source'?1:-1)*numeric;
  const list=options(p.type);
  const subSearch=side==='source'?sourceSubSearch:targetSubSearch;
  const setSubSearch=side==='source'?setSourceSubSearch:setTargetSubSearch;
  const subs=p.type==='customer'&&p.id?parties.filter(x=>x.isSubCustomer&&subCustomerParentId(x)===p.id&&!isInvoiceOnlySubCustomer(x)).map(x=>({id:x.id,name:x.name,code:x.code})):[];
  return <div className="space-y-2 rounded-lg border bg-slate-50 p-3">
   <strong>{side==='source'?'الطرف الأول — من حساب':'الطرف الثاني — إلى حساب'}</strong>
   <div className="flex gap-1">{types.map(t=><button type="button" key={t} disabled={locked} onClick={()=>{set({type:t,id:''});setSearch('');setSubSearch('');}}
    className={'flex-1 rounded border p-1.5 font-bold '+(t===p.type?'bg-indigo-600 text-white':'bg-white')}>{transferTypeLabel(t)}</button>)}</div>
   <AutocompleteCombobox items={list} selectedId={p.id} value={locked?(list.find(x=>x.id===p.id)?.name||search):search}
    entityType={p.type} showCode={false} allowQuickAdd={false} disabled={locked}
    placeholder={'اكتب اسم '+transferTypeLabel(p.type)+' أو الكود...'}
    onChangeText={text=>{setSearch(text);if(text!==list.find(x=>x.id===p.id)?.name){set({type:p.type,id:''});setSubSearch('');}}}
    onSelect={opt=>{set({type:p.type,id:opt.id});setSearch(opt.name);setSubSearch('');}}/>
   {p.type==='customer'&&<AutocompleteCombobox items={subs} selectedId={p.subCustomerId||''}
    value={locked?(subs.find(x=>x.id===p.subCustomerId)?.name||subSearch):subSearch}
    entityType="customer" showCode={false} allowQuickAdd={false} disabled={locked||!p.id}
    placeholder="العميل الفرعي (اختياري)"
    onChangeText={text=>{setSubSearch(text);if(text!==subs.find(x=>x.id===p.subCustomerId)?.name)set({...p,subCustomerId:undefined});}}
    onSelect={opt=>{set({...p,subCustomerId:opt.id||undefined});setSubSearch(opt.name);}}/>}
   <div>الرصيد الحالي: <b>{balanceText(balance)}</b></div>
   <div>الرصيد المتوقع: <b>{balanceText(balance===null||!validAmount?null:balance+delta)}</b></div>
   <div className="text-[10px] text-slate-500">الرصيد حسب بيانات الجهاز؛ يعتمد الخادم بياناته الفعلية عند الحفظ.</div>
  </div>;
 };
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(busy)return;
  if(!currentUser?.id){setError('يرجى تسجيل الدخول أولاً');return;}
  if(!pending&&!reverse&&(!source.id||!target.id||same||!validAmount||!reason.trim()||(sourceSubSearch.trim()&&!source.subCustomerId)||(targetSubSearch.trim()&&!target.subCustomerId))){
   setError('اختر حسابين مختلفين وأدخل مبلغاً صحيحاً وبيان التحويل.');return;
  }
  if(!pending&&!window.confirm(edit?'سيتم عكس السند القديم واعتماد البديل معاً. هل تؤكد التعديل؟':reverse?'سيُنشأ قيد عكسي مستقل دون حذف القيد الأصلي. هل تريد المتابعة؟':'هل تؤكد اتجاه التحويل والمبلغ؟ سيُرحّل قيد متوازن دون حركة نقدية.'))return;
  const request:Request=pending||(reverse?
   {requestId:crypto.randomUUID(),date,reversesId:reverse.id,reason,notes}:
   {requestId:crypto.randomUUID(),date,source,target,amount:numeric,balanceSide,reason,notes,...(edit?{replacesId:edit.id}:{})});
  try{
   // The immutable request is stored BEFORE transmission; a lost response
   // is retried using the same key rather than creating a second journal.
   localStorage.setItem(pendingKey,JSON.stringify(request));
   if(localStorage.getItem(pendingKey)!==JSON.stringify(request))throw Error('LOCAL_REQUEST_NOT_PERSISTED');
  }catch{setError('تعذر حفظ طلب الاسترداد محلياً؛ لم يتم الإرسال.');return;}
  setPending(request);setBusy(true);setError('');
  try{
   const base=publicSyncApiUrl(),token=getCurrentSessionToken();
   if(!token)throw Error('SESSION_LOGIN_REQUIRED');
   const response=await fetchWithSyncDeadline(base+'/api/v1/account-transfers',{
    method:'POST',headers:{...authHeaders(base,token),'Content-Type':'application/json'},
    body:JSON.stringify(request),cache:'no-store'
   },25000);
   const result=await response.json().catch(()=>({code:'INVALID_SERVER_REPLY'}));
   if(!response.ok)throw Error(String(result.code||response.status));
   const record=result.record as DebtClearingRecord;
   if(result.commandId!=='account-transfer-'+request.requestId||record?.id!=='clr-transfer-'+request.requestId||
      record.transferVersion!==2||!record.journalEntryId)throw Error('ACCOUNT_TRANSFER_RECEIPT_MISMATCH');
   // A confirmed PostgreSQL response is the only success path.
   try{localStorage.removeItem(pendingKey);}catch{}
   setPending(null);unifiedRepository?.requestSync();onSaved(record);
  }catch(err){
   setError('لم يتأكد اعتماد العملية. بقي الطلب محفوظاً على هذا الجهاز؛ أعد المحاولة بنفس الطلب بعد الاتصال. '+String(err));
  }finally{setBusy(false);}
 };
 return <div dir="rtl" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3">
  <form onSubmit={submit} className="w-full max-w-3xl max-h-[95vh] overflow-auto rounded-xl bg-white p-4 text-xs shadow-xl space-y-3">
   <div className="flex justify-between items-center"><h3 className="font-bold text-base">{edit?'تعديل سند '+edit.clearingNumber:reverse?'إلغاء سند مقاصة':'سند مقاصة وتحويل حسابات'}</h3><button type="button" onClick={onClose} disabled={busy}>إغلاق ✕</button></div>
   {edit&&!pending&&<p className="rounded border border-amber-300 bg-amber-50 p-2">سيعكس النظام السند السابق ويرحّل البديل في معاملة واحدة. معاينة الأرصدة الحالية قبل عكس السند.</p>}
   {pending&&<p className="rounded border border-amber-300 bg-amber-50 p-2">يوجد طلب محفوظ لم يتأكد اعتماده بعد. إعادة المحاولة تستخدم المعرف نفسه؛ لن تنشئ قيداً ثانياً.</p>}
   {!reverse&&!(pending&&'reversesId' in pending)&&<>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{endpointControl(source,setSource,sourceSearch,setSourceSearch,'source')}{endpointControl(target,setTarget,targetSearch,setTargetSearch,'target')}</div>
    <button type="button" disabled={locked} onClick={()=>{setSource(target);setTarget(source);setSourceSearch(targetSearch);setTargetSearch(sourceSearch);setSourceSubSearch(targetSubSearch);setTargetSubSearch(sourceSubSearch);}} className="rounded border p-2">عكس الطرفين ⇄</button>
    <div className="flex flex-wrap gap-2 items-center"><label>نوع الرصيد المنقول:</label>
     <label><input type="radio" disabled={locked} checked={balanceSide==='debit'} onChange={()=>setBalanceSide('debit')}/> مدين</label>
     <label><input type="radio" disabled={locked} checked={balanceSide==='credit'} onChange={()=>setBalanceSide('credit')}/> دائن</label>
    </div>
    <label className="block">المبلغ ({settings.currency})<input type="number" min="0.01" step="0.01" disabled={locked} value={amount} onChange={e=>setAmount(e.target.value)} className="block w-full rounded border p-2"/></label>
    {source.id&&target.id&&validAmount&&!same&&<div className="rounded bg-blue-50 p-2">
     <b>معاينة القيد:</b> مدين {transferTypeLabel((balanceSide==='debit'?target:source).type)} — {fmt(numeric)} | دائن {transferTypeLabel((balanceSide==='debit'?source:target).type)} — {fmt(numeric)}
    </div>}
   </>}
   {(reverse||(pending&&'reversesId' in pending))&&<p className="rounded bg-amber-50 p-2">سيتم عكس السند {reverse?.clearingNumber||('reversesId' in (pending||{})?(pending as {reversesId:string}).reversesId:'')} بقيد مستقل.</p>}
   <label className="block">التاريخ<input type="date" required disabled={locked} value={date} onChange={e=>setDate(e.target.value)} className="block w-full rounded border p-2"/></label>
   <label className="block">البيان<input disabled={locked} value={reason} onChange={e=>setReason(e.target.value)} className="block w-full rounded border p-2"/></label>
   <label className="block">ملاحظات<textarea disabled={locked} value={notes} onChange={e=>setNotes(e.target.value)} className="block w-full rounded border p-2"/></label>
   {error&&<div role="alert" className="rounded bg-rose-50 text-rose-800 p-2">{error}</div>}
   <div className="flex gap-2 justify-end"><button type="button" disabled={busy} onClick={onClose} className="rounded border px-3 py-2">إغلاق</button>
    <button type="submit" disabled={busy} className="rounded bg-indigo-700 text-white px-4 py-2 font-bold disabled:opacity-50">{busy?'جاري التحقق من الاعتماد...':pending?'إعادة محاولة الاعتماد':reverse?'تأكيد الإلغاء':edit?'حفظ التعديل':'اعتماد المقاصة والقيد'}</button></div>
  </form>
 </div>;
}
