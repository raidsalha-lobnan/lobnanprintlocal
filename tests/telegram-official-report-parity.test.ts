import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {BusinessSettings,Invoice,InventoryItem,PurchaseInvoice,ExpenseItem} from '../src/types';
import {buildDetailedSalesReportHtml} from '../src/utils/printDetailedSalesInvoiceRegister';
import {
 purchasesForReport,inventoryShortagesForReport,expensesForReport,sumReportAmounts
} from '../src/utils/operationalReportData';

const source=(file:string)=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

test('Telegram routes each of its nine report types through the same application templates',()=>{
 const integration=source('components/TelegramBotIntegration.tsx');
 const app=source('components/ReportsView.tsx');
 const pdfBridge=source('utils/useOfficialAppReportPdf.tsx');
 for(const type of [
  'customer_statement','supplier_statement','customer_items','treasuries_movement',
  'employee_statement','purchases_report','inventory_report','expenses_report'
 ])assert.ok(integration.includes("reportType:'"+type+"'")||
   ((type==='customer_statement'||type==='supplier_statement')&&
    integration.includes('reportType:requestedReport')&&
    integration.includes('dispatchStatementPdf(chatId, targetId, period, reportType)')),
   'shared app renderer missing '+type);
 assert.match(integration,/buildDetailedSalesReportHtml\(matching/);
 assert.match(integration,/captureOfficialSalesRegisterPdf\(officialHtml\)/);
 assert.doesNotMatch(integration,/generate(?:Statement|CustomerItems|TreasuryReport|SalesReport|PurchasesReport|InventoryReport|ExpensesReport|EmployeeStatement)PdfBlob/);
 assert.match(pdfBridge,/<ReportsView/);
 assert.match(pdfBridge,/querySelector<HTMLElement>\('\.report-a4-container'\)/);
 assert.match(app,/<OperationalReportDocument/);
 assert.match(source('components/reports/OperationalReportDocument.tsx'),/<PrintHeader/);
 assert.match(source('components/UnifiedPartyStatementDocument.tsx'),/<PrintHeader/);
});

test('A4 sales report uses the exact print-sheet generator without automatically opening a print dialog',()=>{
 const invoice={id:'1',invoiceNumber:'INV-0010',date:'2026-11-01',customerName:'Test',
  totalAmount:30,paidAmount:0,remainingAmount:30,items:[],subtotal:30,
  taxRate:0,taxAmount:0,discountTotal:0} as Invoice;
 const settings={businessName:'Print House',currency:'ILS'} as BusinessSettings;
 const opt={companyName:'Print House',settings,periodLabel:'November',
  invoiceTypeLabel:'all',searchLabel:'',treasuries:[],
  customerName:(inv:Invoice)=>inv.customerName};
 const html=buildDetailedSalesReportHtml([invoice],{...opt,autoPrint:false});
 assert.match(html,/\.sheet\{width:210mm;height:297mm/);
 assert.match(html,/dataset\.printReady="true"/);
 assert.doesNotMatch(html,/setTimeout\(\(\)=>window\.print\(\),180\)/);
 const original=buildDetailedSalesReportHtml([invoice],opt);
 assert.match(original,/setTimeout\(\(\)=>window\.print\(\),180\)/);
});

test('official procurement and expense filters keep order and monetary totals, including zero and negative stock',()=>{
 const buy=(id:string,date:string,value:number)=>({id,date,invoiceNumber:id,totalAmount:value,paidAmount:0} as PurchaseInvoice);
 const purchases=purchasesForReport([buy('a','2026-11-05',10),buy('b','2026-10-10',20),buy('c','2026-11-09',33)],'2026-11-01','2026-11-30');
 assert.deepEqual(purchases.map(x=>x.id),['c','a']);
 assert.equal(sumReportAmounts(purchases,r=>r.totalAmount),43);
 const stock=(id:string,qty:number,min:number,category='printing')=>({id,code:id,name:id,stockQuantity:qty,minAlertQuantity:min,category} as InventoryItem);
 const shortages=inventoryShortagesForReport([stock('a',-1,0),stock('b',8,4),stock('c',2,3),stock('service',-2,0,'services')]);
 assert.deepEqual(shortages.map(s=>s.code),['a','c']);
 const expense=(id:string,date:string,v:number)=>({id,date,amount:v} as ExpenseItem);
 const expenses=expensesForReport([expense('a','2026-11-01',11),expense('b','2026-09-01',15)],'2026-11-01');
 assert.equal(expenses.length,1);
 assert.equal(sumReportAmounts(expenses,e=>e.amount),11);
});
