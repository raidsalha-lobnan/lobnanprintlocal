import type {ExpenseItem,InventoryItem,PurchaseInvoice} from '../types';

export type OperationalReportKind='purchases_report'|'inventory_report'|'expenses_report';
export const inReportPeriod=(date:string,fromDate?:string,toDate?:string):boolean=>
  (!fromDate||date>=fromDate)&&(!toDate||date<=toDate);

export function purchasesForReport(rows:readonly PurchaseInvoice[],fromDate?:string,toDate?:string){
  return rows.filter(r=>inReportPeriod(r.date,fromDate,toDate))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.invoiceNumber.localeCompare(a.invoiceNumber));
}
export function inventoryShortagesForReport(rows:readonly InventoryItem[]){
  return rows.filter(r=>r.category!=='copy_scan'&&r.category!=='services'&&
    r.id!=='srv-delivery'&&r.stockQuantity<=r.minAlertQuantity)
    .sort((a,b)=>a.code.localeCompare(b.code));
}
export function expensesForReport(rows:readonly ExpenseItem[],fromDate?:string,toDate?:string){
  return rows.filter(r=>inReportPeriod(r.date,fromDate,toDate))
    .sort((a,b)=>b.date.localeCompare(a.date));
}
export const sumReportAmounts=<T>(rows:readonly T[],amount:(row:T)=>number):number=>
  rows.reduce((total,row)=>total+(Number(amount(row))||0),0);
