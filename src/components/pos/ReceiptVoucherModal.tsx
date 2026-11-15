import React,{useEffect,useMemo,useState} from 'react';
import {DateInput} from '../common/DateInput';
import {AutocompleteCombobox} from '../common/AutocompleteCombobox';
import {useAccounting} from '../../context/AccountingContext';
import type {Party,PaymentVoucher} from '../../types';
import {X,Receipt,Check,Printer,Info} from 'lucide-react';
import {posSound} from '../../utils/audio';
import {MAIN_CASH_TREASURY_CODE} from '../../utils/treasuryCodes';
import {sortPartiesByCode} from '../../utils/partyUtils';

type TargetType='customer'|'supplier'|'employee';
interface ReceiptVoucherModalProps {
 isOpen:boolean;onClose:()=>void;defaultParty?:Party|null;
 defaultSubCustomerName?:string;defaultAmount?:number;
 editingVoucher?:PaymentVoucher|null;
}
const m=(value:number)=>Number(value.toFixed(2));
const today=()=>new Date().toISOString().slice(0,10);
const moneyInput=(value:string)=>{const amount=Number(value||0);return Number.isFinite(amount)?amount:NaN;};
const box='bg-white border border-slate-300 rounded-md px-2.5 py-2 w-full text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200';
const field='block text-[11px] text-slate-600 font-semibold mb-1';

export const ReceiptVoucherModal:React.FC<ReceiptVoucherModalProps>=({
 isOpen,onClose,defaultParty,defaultSubCustomerName='',defaultAmount=0,editingVoucher=null
})=>{
 const {parties,employees,treasuries,currencies,settings,createReceiptVoucherAtomic,
  amendReceiptVoucher,setSelectedVoucherForPrint}=useAccounting();
 const [targetType,setTargetType]=useState<TargetType>('customer');
 const [partyId,setPartyId]=useState('');
 const [subName,setSubName]=useState('');
 const [date,setDate]=useState(today());
 const [note,setNote]=useState('تسديد كامل الحساب');
 const [amount,setAmount]=useState('');
 const [currency,setCurrency]=useState(settings.baseCurrencyCode||'ILS');
 const [rate,setRate]=useState('1');
 const [discount,setDiscount]=useState('0');
 const [paymentRoute,setPaymentRoute]=useState<'cash'|'bank'>('cash');
 const [bankCode,setBankCode]=useState('');
 const [paymentNote,setPaymentNote]=useState('');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [savedVoucher,setSavedVoucher]=useState<PaymentVoucher|null>(null);

 const noncash=useMemo(()=>treasuries.filter(t=>t.status!=='inactive'&&
  t.accountCode!==MAIN_CASH_TREASURY_CODE&&t.type!=='cash_box'&&
  (!t.currency||t.currency===currency)).sort((a,b)=>
   String(a.accountCode||'').localeCompare(String(b.accountCode||''),'en',{numeric:true})),
  [treasuries,currency]);
 const selectedBank=noncash.find(t=>t.accountCode===bankCode);
 const partyChoices=useMemo(()=>{
  if(targetType==='employee')return employees.map(e=>({
   id:e.id,code:e.code,name:e.name
  }));
  return sortPartiesByCode(parties.filter(p=>!p.isSubCustomer&&(
   targetType==='customer'?p.type==='customer'||p.type==='both':
   p.type==='supplier'||p.type==='both'))).map(p=>({
    id:p.id,code:p.code,name:p.name
   }));
 },[parties,employees,targetType]);
 const selected=partyChoices.find(p=>p.id===partyId);
 const selectedParty=parties.find(p=>p.id===partyId);
 const subCustomers=parties.filter(p=>p.isSubCustomer&&p.parentPartyId===partyId);
 const displayBalance=targetType==='employee'?null:Number(selectedParty?.balance||0);
 const symbol=currencies.find(c=>c.code===currency)?.symbol||settings.currency||'₪';
 const entered=moneyInput(amount);
 const rebate=moneyInput(discount);
 const remaining=displayBalance===null?null:m(displayBalance-entered*Number(rate||1)-rebate*Number(rate||1));

 useEffect(()=>{
  if(!isOpen)return;
  setSaving(false);setError('');setSavedVoucher(null);
  const existing=editingVoucher;
  const chosen:TargetType=existing?.employeeId?'employee':
   existing?.partyType||(
    existing&&parties.find(p=>p.id===existing.partyId)?.type==='supplier'
    ?'supplier':'customer');
  setTargetType(chosen);
  setPartyId(existing?.employeeId||existing?.partyId||defaultParty?.id||'');
  setSubName(existing?.subCustomerName||defaultSubCustomerName);
  setDate(existing?.date||today());
  setNote(existing?.description||'تسديد كامل الحساب');
  const value=existing?.amount??defaultAmount;
  setAmount(value>0?String(value):'');
  const wasCash=existing?(existing.treasuryAccountCode||existing.accountCode)===MAIN_CASH_TREASURY_CODE:true;
  setPaymentRoute(wasCash?'cash':'bank');
  setCurrency(existing?.currency||settings.baseCurrencyCode||'ILS');
  setRate(String(existing?.exchangeRate||1));
  setDiscount('0');
  setBankCode(!wasCash?(existing?.treasuryAccountCode||existing?.accountCode||''):'');
  setPaymentNote(existing?.transferReference||existing?.paymentNotes||'');
 },[isOpen,editingVoucher,defaultParty,defaultSubCustomerName,defaultAmount,settings.baseCurrencyCode]);
 useEffect(()=>{
  setBankCode(previous=>noncash.some(t=>t.accountCode===previous)?previous:
   (noncash[0]?.accountCode||''));
 },[noncash]);

 if(!isOpen)return null;
 const switchTarget=(type:TargetType)=>{
  if(type===targetType)return;
  setTargetType(type);setPartyId('');setSubName('');setError('');
 };

 const submit=async(print=false)=>{
  if(saving)return;
  setError('');
  if(!selected){setError('اختر الجهة واسم صاحب السند من السجلات المعتمدة.');return;}
  if(!(Number.isFinite(entered)&&entered>0)){
   setError('يجب إدخال مبلغ قبض صحيح أكبر من صفر.');return;
  }
  if(!Number.isFinite(rebate)||rebate<0){
   setError('قيمة الخصم غير صحيحة.');return;
  }
  if(!Number.isFinite(Number(rate))||Number(rate)<=0){
   setError('سعر الصرف يجب أن يكون أكبر من صفر.');return;
  }
  if(rebate>0){
   setError('حقل الخصم جاهز؛ لا يمكن ترحيل خصم قبل اعتماد حساب الخصومات وقيوده المحاسبية.');return;
  }
  if(targetType==='employee'||targetType==='supplier'){
   setError(targetType==='employee'?
    'اختيار الموظف جاهز؛ يلزم حساب ذمم أو سلف الموظفين المعتمد قبل ترحيل قبض الموظف.':
    'اختيار المورد جاهز؛ يلزم مسار تسوية ذمم الموردين المعتمد قبل إثبات قبض من مورد، لتجنب عكس أرصدة الموردين خطأً.');return;
  }
  if(paymentRoute==='bank'&&!selectedBank){
   setError('اختر صندوقًا بنكيًا أو محفظة للجزء غير النقدي.');return;
  }
  const typeCode=paymentRoute==='cash'?MAIN_CASH_TREASURY_CODE:bankCode;
  const treasury=treasuries.find(t=>t.accountCode===typeCode);
  if(!treasury){setError('الصندوق غير معرّف أو غير متاح.');return;}
  const method:PaymentVoucher['paymentMethod']=typeCode===MAIN_CASH_TREASURY_CODE?
   'cash':treasury.type==='digital_wallet'?'e_wallet':'bank_transfer';
  const current=editingVoucher;
  if(current&&targetType!==(
   current.partyType||(
    parties.find(p=>p.id===current.partyId)?.type==='supplier'?'supplier':'customer'
   ))){
   setError('تغيير جهة سند معتمد يتطلب تسوية مصدّقة للمستند الأصلي.');return;
  }
  const appliedRate=Number(rate);
  const newVoucher:PaymentVoucher={
   id:current?.id||('vch-'+Date.now()),
   voucherNumber:current?.voucherNumber||('RCT-'+Date.now().toString().slice(-6)),
   type:'receipt',date,partyId,partyName:selected.name,
   partyType:targetType,amount:entered,baseAmount:m(entered*appliedRate),
   paymentMethod:method,accountCode:targetType==='supplier'?'2101':'1201',
   treasuryAccountCode:typeCode,description:note.trim()||'قبض وتسديد حساب',
   currency,currencySymbol:symbol,exchangeRate:appliedRate,
   subCustomerName:subName||undefined,
   paymentNotes:paymentNote.trim()||undefined,
   transferReference:paymentRoute==='bank'?paymentNote.trim()||undefined:undefined
  };
  setSaving(true);
  try {
   if(current){
    const result=await amendReceiptVoucher(current.id,current,{
     partyId,date,description:newVoucher.description,amount:entered,currency,
     exchangeRate:appliedRate,paymentMethod:method,
     treasuryAccountCode:typeCode,subCustomerName:subName,
     transferReference:paymentNote
    });
    if(!result.success)throw Error(result.message||'تعذّر تعديل سند القبض.');
   }else {
     const confirmed=await createReceiptVoucherAtomic(newVoucher);
     setSavedVoucher(confirmed);
     if(print)setSelectedVoucherForPrint(confirmed);
   }
   posSound.playSuccessBeep();
   onClose();
  }catch(cause){
   setError(cause instanceof Error?cause.message:'تعذّر حفظ السند، لم تُثبت أي حركة.');
  }finally{setSaving(false);}
 };
 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 text-xs text-slate-800" dir="rtl">
  <section className="w-full max-w-6xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden">
   <header className="flex items-center justify-between gap-3 px-5 py-3 bg-[#163e6a] text-white">
    <div className="flex items-center gap-2"><Receipt size={20}/>
     <div><h2 className="font-bold text-base">{editingVoucher?'تعديل سند القبض':'إضافة سند قبض جديد'}</h2>
      <p className="text-[11px] text-blue-100">ربط الجهة والسداد بالصناديق المعتمدة</p></div>
    </div>
    <button onClick={onClose} type="button" aria-label="إغلاق" className="p-1.5 rounded-lg hover:bg-blue-900/40"><X size={20}/></button>
   </header>
   <div className="p-4 space-y-3 bg-slate-50/70">
    <div className="grid grid-cols-1 md:grid-cols-[230px_120px_minmax(210px,1fr)_175px_145px] items-end gap-2">
     <div><label className={field}>الجهة</label><div className="flex bg-white border border-slate-300 rounded-md p-0.5 gap-0.5">
      {([['customer','عميل'],['supplier','مورد'],['employee','موظف']] as const).map(([key,name])=>
       <button key={key} type="button" onClick={()=>switchTarget(key)}
        className={'flex-1 px-1 py-2 rounded text-xs font-bold '+(targetType===key?'bg-blue-700 text-white':'text-slate-500 hover:bg-slate-100')}>{name}</button>)}
     </div></div>
     <div><label className={field}>الكود</label><input readOnly value={selected?.code||''} placeholder="—" className={box+' text-center bg-slate-100 font-mono font-semibold'}/></div>
     <div><label className={field}>اسم {targetType==='employee'?'الموظف':targetType==='supplier'?'المورد':'العميل'}</label>
      <AutocompleteCombobox
       items={partyChoices.map(item=>({id:item.id,name:item.name,code:item.code}))}
       selectedId={partyId} value={selected?.name||''}
       entityType={targetType==='employee'?'employee':targetType==='supplier'?'supplier':'customer'}
       placeholder="ابحث بالاسم أو الكود واختر..."
       onSelect={item=>{setPartyId(item.id);setSubName('');}}
       inputClassName="py-2 text-xs font-semibold" className="w-full"
      />
     </div>
     <div><label className={field}>الاسم الفرعي</label>
      {subCustomers.length>0?<select className={box} value={subName} onChange={e=>setSubName(e.target.value)}>
       <option value="">بدون اسم فرعي</option>
       {subCustomers.map(p=><option value={p.name} key={p.id}>{p.name}</option>)}
      </select>:<input className={box} value={subName} onChange={e=>setSubName(e.target.value)} placeholder="اختياري"/>}
     </div>
     <div><label className={field}>التاريخ</label>
      <DateInput value={date} onChange={e=>setDate(e.target.value)} className={box+' font-mono'}/>
     </div>
    </div>

    <div><label className={field}>ملاحظة القبض</label>
     <input className={box} value={note} onChange={e=>setNote(e.target.value)}
      placeholder="تسديد كامل الحساب، دفعة على الحساب..."/>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-[1.3fr_1fr_0.85fr_0.85fr_1.35fr] gap-2 items-end">
     <div><label className={field}>المبلغ المقبوض</label>
      <input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}
       placeholder="0.00" className={box+' font-mono font-bold text-base text-blue-800'}/></div>
     <div><label className={field}>العملة</label><select className={box} value={currency}
      onChange={e=>{setCurrency(e.target.value);setRate(String(currencies.find(c=>c.code===e.target.value)?.rateAgainstBase||1));}}>
      {currencies.map(c=><option value={c.code} key={c.code}>{c.name} ({c.code})</option>)}
     </select></div>
     <div><label className={field}>سعر الصرف</label><input type="number" min="0.0001" step="any"
      className={box+' font-mono'} value={rate} onChange={e=>setRate(e.target.value)}/></div>
     <div><label className={field}>خصم</label><input type="number" min="0" step="0.01"
      className={box+' font-mono'} value={discount} onChange={e=>setDiscount(e.target.value)}/></div>
     <div className="rounded-md bg-blue-50 px-3 py-2 border border-blue-200 text-blue-800">
      <span className="block text-[11px] font-semibold">الرصيد المسجل قبل القبض</span>
      <span className="font-bold text-sm tabular-nums">{selected?(displayBalance===null?'لا يوجد رصيد أستاذ معتمد':m(displayBalance).toFixed(2)+' ₪'):'اختر الجهة لعرض الرصيد'}</span>
     </div>
    </div>

    <div className="bg-white border border-slate-200 rounded-lg p-3">
     <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,.85fr)_minmax(200px,1.2fr)_minmax(200px,1fr)] gap-3 items-end">
      <fieldset className="flex items-center gap-4 min-h-[38px]" aria-label="طريقة القبض">
       <legend className={field}>طريقة القبض</legend>
       <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-800">
        <input type="checkbox" checked={paymentRoute==='cash'}
         onChange={()=>setPaymentRoute('cash')} className="w-4 h-4 accent-emerald-700"/>
        نقدًا
       </label>
       <label className="flex items-center gap-2 cursor-pointer font-bold text-blue-800">
        <input type="checkbox" checked={paymentRoute==='bank'}
         onChange={()=>setPaymentRoute('bank')} className="w-4 h-4 accent-blue-700"/>
        بنكي
       </label>
      </fieldset>
      <div><label className={field}>الصندوق / المحفظة</label>
       <select value={paymentRoute==='bank'?bankCode:''}
        onChange={e=>setBankCode(e.target.value)} disabled={paymentRoute!=='bank'}
        className={box+' disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed'}>
        <option value="">{paymentRoute==='bank'?'اختر الصندوق':'غير مطلوب للنقدي'}</option>
        {noncash.map(t=><option key={t.id} value={t.accountCode}>{t.accountCode} — {t.name}</option>)}
       </select>
      </div>
      <div><label className={field}>إيصال / ملاحظة الدفع</label>
       <input className={box+' disabled:bg-slate-100 disabled:text-slate-400'}
        value={paymentRoute==='bank'?paymentNote:''} disabled={paymentRoute!=='bank'}
        onChange={e=>setPaymentNote(e.target.value)} placeholder="رقم الإيصال أو تفاصيل التحويل"/>
      </div>
     </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-100 border border-slate-200 p-2.5 rounded-md">
     <span className="font-semibold text-slate-600">طريقة القبض:
      <strong className="text-blue-800 mr-1">{paymentRoute==='cash'?'نقدًا':'بنكي'}</strong>
     </span>
     <span className="font-semibold text-slate-600">المبلغ المطلوب:
      <strong className="text-slate-900 mr-1">{Number.isFinite(entered)?entered.toFixed(2):'—'} {symbol}</strong>
     </span>
     <span className="font-semibold text-slate-600">الرصيد بعد التسوية:
      <strong className="text-emerald-700 mr-1">{remaining===null?'—':remaining.toFixed(2)+' ₪'}</strong>
     </span>
    </div>
    {error&&<div role="alert" className="bg-rose-50 p-2.5 border border-rose-200 text-rose-700 font-medium rounded-md">{error}</div>}
    {savedVoucher&&<div className="text-emerald-700 font-semibold">تم تأكيد السند {savedVoucher.voucherNumber}</div>}
    <div className="text-[11px] text-slate-500 flex items-center gap-1"><Info size={13}/>
     المبلغ يُدخل مرة واحدة؛ اختر نقدًا أو بنكيًا فقط. النقدي للصندوق الرئيسي، والبنكي يتطلب اختيار الصندوق. الخصومات وقبض الموردين والموظفين تُحمى من الترحيل غير المكتمل.
    </div>
   </div>
   <footer className="px-4 py-3 flex items-center justify-between bg-white border-t border-slate-200 gap-3">
    <button type="button" onClick={onClose} className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-slate-700 font-bold">إلغاء</button>
    <div className="flex items-center gap-2">
     <button disabled={saving} onClick={()=>void submit(true)} type="button"
      className="flex items-center gap-2 bg-blue-100 text-blue-800 font-bold rounded-md px-5 py-2.5 disabled:opacity-50"><Printer size={16}/>حفظ وطباعة</button>
     <button disabled={saving} onClick={()=>void submit(false)} type="button"
      className="flex items-center gap-2 bg-emerald-600 text-white font-bold rounded-md px-6 py-2.5 disabled:opacity-50"><Check size={16}/>{saving?'جارٍ الحفظ...':editingVoucher?'حفظ التعديل':'اعتماد سند القبض'}</button>
    </div>
   </footer>
  </section>
 </div>
 );
};
