import React from 'react';
import {useAccounting} from '../../context/AccountingContext';
import {PrintHeader} from '../common/PrintHeader';
import {ReportSignatures} from '../common/ReportSignatures';
import {type OperationalReportKind,purchasesForReport,inventoryShortagesForReport,expensesForReport,sumReportAmounts} from '../../utils/operationalReportData';

interface Props{kind:OperationalReportKind;fromDate?:string;toDate?:string}
const money=(v:number)=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const quantity=(v:number)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:4});
const th='border border-slate-300 bg-slate-100 px-1.5 py-1.5 text-[10px] font-bold text-slate-900';
const td='border border-slate-300 px-1.5 py-1 text-[10px] text-slate-800';
const titles={purchases_report:'كشف فواتير المشتريات التفصيلي',inventory_report:'كشف نواقص المخزون',expenses_report:'كشف المصروفات التفصيلي'};
export const OperationalReportDocument:React.FC<Props>=({kind,fromDate,toDate})=>{
 const {settings,purchases,inventory,expenses}=useAccounting();
 const purchasesRows=purchasesForReport(purchases,fromDate,toDate);
 const stocks=inventoryShortagesForReport(inventory);
 const expenseRows=expensesForReport(expenses,fromDate,toDate);
 const period=kind==='inventory_report'?'الرصيد الحالي':
   'من '+(fromDate||'بداية النشاط')+' إلى '+(toDate||'الآن');
 const heading=kind==='purchases_report'
  ? ['م','التاريخ','رقم الفاتورة','المورد','الأصناف','الإجمالي','المدفوع','المتبقي']
  :kind==='inventory_report'
   ? ['م','كود الصنف','الصنف','الوحدة','الرصيد','الحد الأدنى','العجز','سعر التكلفة']
   : ['م','التاريخ','التصنيف','الحساب','المستفيد','البيان / الملاحظات','الصندوق','المبلغ'];
 const len=kind==='purchases_report'?purchasesRows.length:kind==='inventory_report'?stocks.length:expenseRows.length;
 return <div className="report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 space-y-3" dir="rtl" data-official-report-type={kind}>
  <PrintHeader title={titles[kind]} subtitle={period}/>
  <div className="flex items-center justify-between border-b pb-2">
   <strong className="text-sm text-slate-900">{titles[kind]}</strong>
   <span className="text-xs text-slate-500">{period}</span>
  </div>
  <table className="w-full table-fixed border-collapse text-right">
   <thead><tr>{heading.map(s=><th className={th} key={s}>{s}</th>)}</tr></thead>
   <tbody>
    {kind==='purchases_report'&&purchasesRows.map((r,i)=><tr key={r.id} className="break-inside-avoid">
     <td className={td}>{i+1}</td><td className={td}>{r.date}</td><td className={td}>{r.invoiceNumber}</td>
     <td className={td}>{r.supplierName}</td>
     <td className={td}>{r.items?.map(x=>x.itemName).filter(Boolean).join('، ')||'-'}</td>
     <td className={td}>{money(r.totalAmount)}</td><td className={td}>{money(r.paidAmount)}</td>
     <td className={td}>{money(Math.max(0,(r.totalAmount||0)-(r.paidAmount||0)))}</td>
    </tr>)}
    {kind==='inventory_report'&&stocks.map((r,i)=><tr key={r.id} className="break-inside-avoid">
     <td className={td}>{i+1}</td><td className={td}>{r.code}</td><td className={td}>{r.name}</td>
     <td className={td}>{r.unit}</td><td className={td}>{quantity(r.stockQuantity)}</td>
     <td className={td}>{quantity(r.minAlertQuantity)}</td>
     <td className={td}>{quantity(Math.max(0,r.minAlertQuantity-r.stockQuantity))}</td>
     <td className={td}>{money(r.purchasePrice)}</td>
    </tr>)}
    {kind==='expenses_report'&&expenseRows.map((r,i)=><tr key={r.id} className="break-inside-avoid">
     <td className={td}>{i+1}</td><td className={td}>{r.date}</td><td className={td}>{r.categoryName}</td>
     <td className={td}>{r.expenseAccountName}</td><td className={td}>{r.beneficiary}</td>
     <td className={td}>{r.notes||'-'}</td><td className={td}>{r.treasuryName}</td><td className={td}>{money(r.amount)}</td>
    </tr>)}
   </tbody>
   <tfoot><tr className="break-inside-avoid bg-slate-100 font-bold">
    <td className={th} colSpan={5}>إجمالي السجلات: {len}</td>
    {kind==='purchases_report'?<>
     <td className={td}>{money(sumReportAmounts(purchasesRows,r=>r.totalAmount))}</td>
     <td className={td}>{money(sumReportAmounts(purchasesRows,r=>r.paidAmount))}</td>
     <td className={td}>{money(sumReportAmounts(purchasesRows,r=>Math.max(0,(r.totalAmount||0)-(r.paidAmount||0))))}</td>
    </>:<td className={td} colSpan={3}>
     {kind==='inventory_report'?'الأصناف الناقصة':
      money(sumReportAmounts(expenseRows,r=>r.amount))+' '+settings.currency}
    </td>}
   </tr></tfoot>
  </table>
  <ReportSignatures rightLabel="إعداد ومراجعة" centerLabel="تدقيق الحسابات" leftLabel="الختم والتوقيع"/>
 </div>;
};
