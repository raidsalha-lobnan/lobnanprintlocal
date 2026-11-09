import React from 'react';
import {Banknote,Check,Coins,FileText,Wallet} from 'lucide-react';
import type {CurrencyInfo,Treasury} from '../../types';
import type {PurchaseBreakdown,PurchasePaymentLeg} from '../../utils/purchasePaymentConsole';

interface Props {
 lineCount:number; totalPieces:number;
 currency:string;exchangeRate:number;taxRate:number;
 currencies:CurrencyInfo[];treasuries:Treasury[];
 discountPercent:number;additionalCharges:number;
 cash:PurchasePaymentLeg;bank:PurchasePaymentLeg;
 paymentNotes:string;
 totals:PurchaseBreakdown;
 paidInvoice:number;remainingInvoice:number;
 paidBase:number;remainingBase:number;
 onCurrency:(value:string)=>void;
 onExchangeRate:(value:number)=>void;
 onTaxRate:(value:number)=>void;
 onDiscountPercent:(value:number)=>void;
 onAdditionalCharges:(value:number)=>void;
 onCash:(patch:Partial<PurchasePaymentLeg>)=>void;
 onBank:(patch:Partial<PurchasePaymentLeg>)=>void;
 onPaymentNotes:(value:string)=>void;
 onFullCash:()=>void;
 onFullBank:()=>void;
 onClearPayments:()=>void;
 onCancel:()=>void;
 valid:boolean;
}
const miniInput='h-6 min-w-0 rounded border border-slate-400 bg-white px-1 text-center text-[11px] font-bold text-slate-900 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-200';
const miniSelect='h-6 min-w-0 rounded border border-slate-400 bg-white px-1 text-[10px] font-bold text-slate-900 outline-none';
const badge='inline-flex shrink-0 items-center gap-1 rounded border bg-white px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap';
const money=(n:number)=>Number(n||0).toFixed(2);

export const PurchaseInvoiceFooter:React.FC<Props>=(p)=>{
 const cashAccounts=p.treasuries.filter(t=>t.status==='active'&&t.type==='cash_box');
 const bankAccounts=p.treasuries.filter(t=>t.status==='active'&&t.type!=='cash_box');
 const paidStatus=p.remainingBase<0.005?'مدفوع بالكامل':p.paidBase>0?'مدفوع جزئياً':'آجل';
 const currSymbol=p.currencies.find(c=>c.code===p.currency)?.symbol||p.currency;
 const compactRate=(v:number)=>Number(v||1).toFixed(4);
 const paymentLeg=(kind:'cash'|'bank')=>{
  const isCash=kind==='cash';
  const leg=isCash?p.cash:p.bank;
  const onchange=isCash?p.onCash:p.onBank;
  const filtered=isCash?cashAccounts:bankAccounts;
  return <div className="flex min-w-0 flex-1 items-center gap-1 whitespace-nowrap">
   <span className="shrink-0 text-[10px] font-bold text-white">{isCash?'نقدي:':'بنكي:'}</span>
   <input type="number" min="0" step="0.01" value={leg.amount}
    aria-label={isCash?'المبلغ النقدي المدفوع للمورد':'المبلغ البنكي المدفوع للمورد'}
    onChange={e=>onchange({amount:Number(e.target.value)})}
    className={miniInput+' w-[70px] shrink-0'}/>
   <button type="button" onClick={isCash?p.onFullCash:p.onFullBank}
    className="h-6 shrink-0 rounded bg-blue-800 px-1 text-[10px] font-bold text-blue-50 hover:bg-blue-600">
    كامل
   </button>
   <select aria-label={isCash?'عملة الدفع النقدي':'عملة الدفع البنكي'}
    value={leg.currency} onChange={e=>{
     const selected=p.currencies.find(c=>c.code===e.target.value);
     onchange({currency:e.target.value,rate:e.target.value==='ILS'?1:selected?.rateAgainstBase||1});
    }} className={miniSelect+' w-[85px] shrink-0'}>
    {p.currencies.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
   </select>
   <label className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-blue-100">
    صرف:
    <input type="number" min="0.0001" step="0.0001" value={leg.rate}
     disabled={leg.currency==='ILS'} onChange={e=>onchange({rate:Number(e.target.value)})}
     className={miniInput+' w-[58px] disabled:bg-slate-200'}/>
   </label>
   <select aria-label={isCash?'الصندوق النقدي':'البنك أو الحساب المحول منه'}
    value={leg.treasuryCode} onChange={e=>onchange({treasuryCode:e.target.value})}
    className={miniSelect+' min-w-[100px] flex-1 truncate'}>
    <option value="">اختر {isCash?'الصندوق':'البنك'}</option>
    {filtered.map(t=><option key={t.id} value={t.accountCode}>{t.name}</option>)}
   </select>
  </div>;
 };
 return <div className="z-20 w-full shrink-0 border-t-2 border-[#173657] bg-[#193a61] text-white shadow-xl" dir="rtl">
  {/* POS-style single-line summary, the only grand-total area in this form. */}
  <div className="flex min-h-[31px] items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-[#a4bdd5] bg-[#b8cfe6] px-2 py-0.5 text-slate-900">
   <span className={badge+' border-slate-300 text-slate-700'}>عدد الأصناف: {p.lineCount}</span>
   <span className={badge+' border-slate-300 text-slate-700'}>إجمالي القطع: {p.totalPieces}</span>
   <span className={badge+' border-blue-300 bg-[#173759] text-white'}>الإجمالي: {money(p.totals.total)} {currSymbol}</span>
   <span className={badge+' border-rose-300 text-rose-700'}>الخصم: {money(p.totals.lineDiscount+p.totals.overallDiscount)}</span>
   <label className={badge+' border-amber-300 text-amber-800'}>إضافة:
    <input aria-label="مصاريف شراء إضافية توزع على تكلفة الأصناف" type="number" min="0" step="0.01"
     value={p.additionalCharges} onChange={e=>p.onAdditionalCharges(Number(e.target.value))}
     className="w-[61px] border-b border-amber-300 bg-transparent text-center text-[11px] font-bold"/>
   </label>
   <span className={badge+' border-blue-300 text-blue-800'}>الضريبة: {money(p.totals.tax)}</span>
   <label className={badge+' border-blue-300 text-blue-800'}>VAT%:
    <select aria-label="نسبة ضريبة المدخلات" value={p.taxRate}
     onChange={e=>p.onTaxRate(Number(e.target.value))}
     className="max-w-[60px] bg-transparent text-[10px] font-bold">
     <option value={0}>0%</option><option value={15}>15%</option><option value={16}>16%</option>
    </select>
   </label>
   <span className={badge+' border-emerald-300 text-emerald-700'}>المدفوع: {money(p.paidInvoice)}</span>
   <span className={badge+' border-rose-500 bg-rose-600 text-white'}>المتبقي: {money(p.remainingInvoice)} {currSymbol}</span>
   <span className={badge+' border-slate-300 text-slate-700'}>حالة الدفع: <b>{paidStatus}</b></span>
  </div>
  {/* Invoice currency/exchange, percentage discount and receipt notes, in the same strip as POS. */}
  <div className="flex min-h-[32px] items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-[#30557e] px-2 py-1">
   <label className="flex min-w-[180px] flex-1 items-center gap-1">
    <span className="shrink-0 text-[10px] font-bold text-amber-300">ملاحظة إيصال السداد:</span>
    <input type="text" value={p.paymentNotes} onChange={e=>p.onPaymentNotes(e.target.value)}
     placeholder="ملاحظة للسداد أو سند الصرف..."
     aria-label="ملاحظة سند صرف المشتريات"
     className={miniInput+' min-w-[180px] flex-1 text-right font-normal'}/>
   </label>
   <label className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-300">سعر الصرف:
    <input type="number" min="0.0001" step="0.0001" value={p.exchangeRate}
     disabled={p.currency==='ILS'} onChange={e=>p.onExchangeRate(Number(e.target.value))}
     className={miniInput+' w-[72px] disabled:bg-slate-200'}/>
   </label>
   <label className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-300">عملة الفاتورة:
    <select value={p.currency} aria-label="عملة فاتورة المشتريات"
     onChange={e=>p.onCurrency(e.target.value)} className={miniSelect+' w-[112px]'}>
     {p.currencies.map(c=><option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
    </select>
   </label>
   <label className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-rose-300">خصم%:
    <input type="number" min="0" max="100" step="0.01" value={p.discountPercent}
     onChange={e=>p.onDiscountPercent(Number(e.target.value))}
     aria-label="خصم عام على فاتورة المشتريات"
     className={miniInput+' w-[61px]'}/>
   </label>
   <span className="shrink-0 text-[10px] font-bold text-blue-200">ما يعادل: {money(p.totals.total*p.exchangeRate)} ₪</span>
  </div>
  {/* Explicit cash & bank payments: independently chosen treasury, currency and exchange rate. */}
  <div className="flex min-h-[33px] items-center gap-2 overflow-x-auto whitespace-nowrap px-2 py-1">
   {paymentLeg('cash')}
   <span className="h-5 w-px shrink-0 bg-[#476689]"/>
   {paymentLeg('bank')}
   <button type="button" onClick={p.onClearPayments}
    className="h-6 shrink-0 rounded border border-blue-400 px-2 text-[10px] text-blue-100 hover:bg-blue-800">أجل</button>
  </div>
  <div className="flex min-h-[33px] items-center justify-between gap-2 border-t border-[#30557e] px-2 py-1">
   <span className="shrink-0 text-[10px] text-blue-200">
    <Banknote className="inline h-3 w-3"/> إجمالي المدفوع بالشيكل: {money(p.paidBase)} ₪
    <span className="mx-1">|</span>المستحق للمورد: {money(p.remainingBase)} ₪
   </span>
   <div className="flex items-center gap-2">
    <button type="button" onClick={p.onCancel} className="rounded bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700">إلغاء</button>
    <button type="submit" disabled={!p.valid}
     className="inline-flex items-center gap-1 rounded bg-blue-600 px-4 py-1.5 text-[11px] font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-35">
     <Check className="h-3.5 w-3.5"/> اعتماد فاتورة المشتريات
    </button>
   </div>
  </div>
 </div>;
};
