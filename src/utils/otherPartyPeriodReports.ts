import type {Party, Employee, Invoice, PaymentVoucher, PurchaseInvoice, PurchaseReturn, SalesReturn, PrintJobOrder, JournalEntry, DebtClearingRecord, EmployeeAdvance, EmployeeDeduction, EmployeeIncentive, PayrollSheet} from '../types';
import {generateAccountStatement, generateEmployeeStatement} from './statementGenerator';

export type DirectoryDateMode='all'|'day'|'range';
export type DirectoryDateFilter={mode:DirectoryDateMode;day:string;from:string;to:string};
export const todayLocal=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
export function directoryBounds(filter:DirectoryDateFilter){
 if(filter.mode==='all')return {from:undefined,to:undefined,label:'جميع التواريخ'};
 if(filter.mode==='day'){
  if(!filter.day)throw new Error('اختر تاريخًا صحيحًا.');
  return {from:filter.day,to:filter.day,label:'يوم '+filter.day};
 }
 if(filter.from&&filter.to&&filter.from>filter.to)throw new Error('بداية الفترة بعد نهايتها.');
 return {from:filter.from||undefined,to:filter.to||undefined,
  label:filter.from&&filter.to?'من '+filter.from+' إلى '+filter.to:
   filter.from?'من '+filter.from:filter.to?'حتى '+filter.to:'جميع التواريخ'};
}
export const sortBySerial=<T extends {code:string;id:string}>(a:T,b:T)=>{
 const n=(x:string)=>Number(x.match(/(\d+)\s*$/)?.[1]||Number.MAX_SAFE_INTEGER);
 return n(a.code)-n(b.code)||a.code.localeCompare(b.code,'en',{numeric:true})||a.id.localeCompare(b.id);
};
export const roundMoney=(amount:number)=>Math.round((Number(amount)||0)*100)/100;
export const moneyDisplay=(amount:number)=>Number(amount||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

export type SupplierLedgerSource={
 parties:Party[];invoices:Invoice[];vouchers:PaymentVoucher[];
 purchases:PurchaseInvoice[];purchaseReturns:PurchaseReturn[];salesReturns:SalesReturn[];
 printOrders:PrintJobOrder[];journalEntries:JournalEntry[];debtClearings:DebtClearingRecord[];
};
export type SupplierPeriodRow={entity:Party;opening:number;purchases:number;payments:number;returns:number;adjustments:number;movement:number;closing:number;documentCount:number};
export function supplierPeriodRows(source:SupplierLedgerSource,filter:DirectoryDateFilter,search=''):SupplierPeriodRow[]{
 const bounds=directoryBounds(filter),q=search.trim().toLowerCase();
 return source.parties.filter(p=>p.type==='supplier'||p.type==='both')
  .filter(p=>!q||[p.code,p.name,p.phone,p.city,p.taxNumber,p.contactPerson].some(v=>String(v||'').toLowerCase().includes(q)))
  .sort(sortBySerial).map(entity=>{
   const statement=generateAccountStatement({party:entity,fromDate:bounds.from,toDate:bounds.to,
    invoices:source.invoices,vouchers:source.vouchers,purchases:source.purchases,
    purchaseReturns:source.purchaseReturns,salesReturns:source.salesReturns,
    printOrders:source.printOrders,journalEntries:source.journalEntries,
    debtClearings:source.debtClearings});
   // The general ledger stores suppliers as credit balances (negative). The
   // supplier directory displays our amount payable as a positive number.
   const amount=(type:string)=>statement.rows.filter(r=>r.type===type);
   const sum=(vals:number[])=>roundMoney(vals.reduce((x,y)=>x+y,0));
   const purchases=sum(amount('purchase').map(r=>r.credit-r.debit));
   const payments=sum(amount('payment').map(r=>r.debit-r.credit));
   const returns=sum(amount('purchase_return').map(r=>r.debit-r.credit));
   const opening=roundMoney(-statement.openingBalance);
   const closing=roundMoney(-statement.closingBalance);
   const movement=roundMoney(closing-opening);
   const adjustments=roundMoney(movement-purchases+payments+returns);
   return {entity,opening,purchases,payments,returns,adjustments,movement,closing,
    documentCount:amount('purchase').length};
  });
}

export type EmployeeLedgerSource={
 employees:Employee[];vouchers:PaymentVoucher[];invoices:Invoice[];
 purchases:PurchaseInvoice[];purchaseReturns:PurchaseReturn[];salesReturns:SalesReturn[];
 employeeAdvances:EmployeeAdvance[];employeeDeductions:EmployeeDeduction[];
 employeeIncentives:EmployeeIncentive[];payrollSheets:PayrollSheet[];
 journalEntries:JournalEntry[];debtClearings:DebtClearingRecord[];
};
export type EmployeePeriodRow={entity:Employee;opening:number;entitlements:number;advances:number;deductions:number;payments:number;movement:number;closing:number;documentCount:number};
export function employeePeriodRows(source:EmployeeLedgerSource,filter:DirectoryDateFilter,search='',status='all'):EmployeePeriodRow[]{
 const bounds=directoryBounds(filter),q=search.trim().toLowerCase();
 return source.employees.filter(e=>(status==='all'||e.status===status)&&
  (!q||[e.code,e.name,e.jobTitle,e.phone,e.nationalId].some(v=>String(v||'').toLowerCase().includes(q))))
  .sort(sortBySerial).map(entity=>{
   const stmt=generateEmployeeStatement({
    employee:entity,fromDate:bounds.from,toDate:bounds.to,
    vouchers:source.vouchers,advances:source.employeeAdvances,
    deductions:source.employeeDeductions,incentives:source.employeeIncentives,
    invoices:source.invoices,purchases:source.purchases,
    purchaseReturns:source.purchaseReturns,salesReturns:source.salesReturns,
    payrollSheets:source.payrollSheets,journalEntries:source.journalEntries,
    debtClearings:source.debtClearings});
   return {entity,opening:roundMoney(stmt.openingBalance),
    entitlements:roundMoney(stmt.totalEntitlements),
    advances:roundMoney(stmt.totalAdvances),
    deductions:roundMoney(stmt.totalDeductions),
    payments:roundMoney(stmt.totalDisbursements),
    movement:roundMoney(stmt.closingBalance-stmt.openingBalance),
    closing:roundMoney(stmt.closingBalance),documentCount:stmt.rows.length};
  });
}

export function totalAmounts<T>(rows:T[],keys:(keyof T)[]):Record<string,number>{
 const totals:Record<string,number>={};
 for(const key of keys)totals[String(key)]=roundMoney(rows.reduce((n,row)=>n+Number(row[key]||0),0));
 return totals;
}
const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,ch=>entities[ch]||ch);
const columnHTML=(value:unknown,index:number)=>'<td class="'+(index<2?'':'number')+'">'+
 esc(typeof value==='number'?moneyDisplay(value):value)+'</td>';
/** Read-only A4 report; it does not post ledger entries or change balances. */
export function printDirectoryPeriodReport(title:string,company:string,filter:DirectoryDateFilter,
 columns:string[],data:(string|number)[][],currency:string,explanation:string){
 const pop=window.open('','_blank');
 if(!pop){window.alert('يرجى السماح بفتح نافذة الطباعة.');return;}
 const bounds=directoryBounds(filter);
 const markup='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+
 esc(title)+'</title><style>'+
 '@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'+
 'body{font:11px Tahoma,Arial,sans-serif;color:#16304e}'+
 'header{text-align:center;border-bottom:2px solid #193f68;padding:9px 0}h1{font-size:18px;margin:5px}'+
 '.meta{display:flex;justify-content:space-between;margin:9px 0 14px;font-weight:700}'+
 'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #b9c9d8;padding:5px 4px;text-align:right;overflow-wrap:anywhere}'+
 'th{background:#dce9f7!important;font-weight:800}tbody tr:nth-child(even) td{background:#f0f6fc!important}'+
 'td.number{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}'+
 'tr.total td{background:#173e6d!important;color:#fff!important;font-weight:800}'+
 'thead{display:table-header-group}tr{break-inside:avoid}'+
 '.note{background:#edf4fb;border:1px solid #b7c8da;padding:9px;margin-top:14px}'+
 '.toolbar{margin-bottom:12px}.toolbar button{background:#1c5c9f;color:#fff;border:0;border-radius:5px;padding:7px 14px;cursor:pointer}'+
 '@media print{.toolbar{display:none}}'+
 '</style></head><body><div class="toolbar"><button onclick="window.print()">طباعة / حفظ PDF</button></div>'+
 '<header><b>'+esc(company)+'</b><h1>'+esc(title)+'</h1></header>'+
 '<div class="meta"><span>الفترة: '+esc(bounds.label)+'</span><span>العملة: '+esc(currency)+
 '</span><span>تاريخ الطباعة: '+esc(new Date().toLocaleString('ar-EG'))+'</span></div>'+
 '<table><thead><tr>'+columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+
 data.map((row,index)=>'<tr class="'+(index===data.length-1?'total':'')+'">'+
 row.map(columnHTML).join('')+'</tr>').join('')+
 '</tbody></table><div class="note">'+esc(explanation)+'</div></body></html>';
 pop.document.open();pop.document.write(markup);pop.document.close();
 pop.onload=()=>{pop.focus();pop.print();};
}
