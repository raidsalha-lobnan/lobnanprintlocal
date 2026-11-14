import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReport,renderSalesReport} from '../report-ssr.compiled.mjs';
const keys=['parties','invoices','purchases','salesReturns','purchaseReturns','vouchers',
 'printOrders','journalEntries','debtClearings','inventory','treasuries','employees',
 'employeeAdvances','employeeDeductions','employeeIncentives','payrollSheets',
 'accounts','currencies','expenses'];
const snapshot=Object.fromEntries(keys.map(x=>[x,[]]));
snapshot.settings={businessName:'Test Company',currency:'ILS'};
snapshot.parties=[
 {id:'customer-1',code:'CUST-0002',name:'Test Customer',type:'customer',balance:0,openingBalance:0},
 {id:'supplier-1',code:'SUP-0001',name:'Test Supplier',type:'supplier',balance:0,openingBalance:0}
];
snapshot.employees=[{id:'employee-1',name:'Test Employee',code:'EMP-0001',status:'active'}];
for(const category of [
 'customer_statement','supplier_statement','customer_items','treasuries_movement',
 'purchases_report','inventory_report','expenses_report','employee_statement']){
 test('Official ReportsView template renders '+category,()=>{
  const report=renderReport(snapshot,{type:category,
    partyId:category==='supplier_statement'?'supplier-1':'customer-1',
    employeeId:'employee-1',fromDate:'2026-11-01',toDate:'2026-11-14'});
  assert.ok(report.hasReport);
  assert.ok(report.html.includes('report-a4-container'));
  assert.ok(report.html.length>400);
 });
}
test('Official sales invoice register template retains paginated page builder',()=>{
 const html=renderSalesReport(snapshot,{periodLabel:'All'});
 assert.match(html,/<main id="pages">/);
 assert.match(html,/printReady/);
});
