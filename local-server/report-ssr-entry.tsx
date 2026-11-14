import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReportsView} from '../src/components/ReportsView';
import {buildDetailedSalesReportHtml} from '../src/utils/printDetailedSalesInvoiceRegister';
import {formatInvoiceCustomerDisplay} from '../src/utils/partyUtils';
import {isConfirmedSalesInvoice} from '../src/utils/invoiceConfirmation';
export function renderSalesReport(snapshot,{fromDate='',toDate='',periodLabel='كامل الفترة'}={}){
 const invoices=(snapshot.invoices||[]).filter(inv=>isConfirmedSalesInvoice(inv)&&
  (!fromDate||inv.date>=fromDate)&&(!toDate||inv.date<=toDate));
 return buildDetailedSalesReportHtml(invoices,{
  companyName:snapshot.settings?.businessName||'',
  settings:snapshot.settings||{},periodLabel,invoiceTypeLabel:'فواتير المبيعات',
  searchLabel:'',customerName:inv=>formatInvoiceCustomerDisplay(inv,snapshot.parties||[]),
  treasuries:snapshot.treasuries||[],autoPrint:false
 });
}
export function renderReport(snapshot,options={}){
 globalThis.__reportSnapshot=snapshot;
 try{
  const html=renderToStaticMarkup(React.createElement(ReportsView,{
   initialReport:options.type||'customer_statement',
   exportSelection:{partyId:options.partyId,employeeId:options.employeeId,
    fromDate:options.fromDate,toDate:options.toDate}
  }));
  const start=html.indexOf('class="');
  return {html,hasReport:html.includes('report-a4-container'),
   type:options.type||'customer_statement',length:html.length};
 }finally{globalThis.__reportSnapshot=null;}
}
