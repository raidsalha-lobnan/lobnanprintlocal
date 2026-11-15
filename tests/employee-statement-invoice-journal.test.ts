import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEmployeeStatement } from '../src/utils/statementGenerator';
import type { Employee, Invoice, JournalEntry } from '../src/types';

const employee: Employee = {
  id:'emp-test-1',code:'EMP-001',name:'أحمد عيسى',jobTitle:'مصمم',
  department:'design',phone:'',salaryType:'monthly',salaryAmount:0,
  hireDate:'2026-11-01',status:'active',paymentMethod:'cash'
};
const invoice: Invoice = {
  id:'inv-emp-1',invoiceNumber:'INV-0161',date:'2026-11-04',
  customerId:employee.id,customerName:employee.name,
  counterpartyType:'employee',counterpartyId:employee.id,employeeId:employee.id,
  type:'pos',items:[{
    itemId:'item-1',itemCode:'PRI-00001',itemName:'ورق مطبوع',
    quantity:2,unitPrice:8,discount:0,tax:0,total:16,notes:'أبيض'
  }],
  subtotal:16,discountTotal:0,taxRate:0,taxAmount:0,totalAmount:16,
  paidAmount:0,remainingAmount:16,paymentMethod:'credit',status:'unpaid',
  isAccountingPosted:true
};
const financialJournal=(type:'pos_invoice'|'cogs',id:string):JournalEntry=>({
  id,entryNumber:type==='cogs'?'JE-2026-0268':'JE-POS-test',
  referenceType:type,referenceId:'inv-emp-1',date:'2026-11-04',
  createdAt:'2026-11-04T12:00:00Z',
  description:'فاتورة مبيعات رقم INV-0161 - أحمد عيسى',
  lines:type==='pos_invoice'?[
    {accountCode:'1201',accountName:'ذمم العملاء',debit:16,credit:0,description:'فاتورة أحمد عيسى'},
    {accountCode:'4101',accountName:'إيراد المبيعات',debit:0,credit:16}
  ]:[
    {accountCode:'5101',accountName:'تكلفة المبيعات',debit:2,credit:0},
    {accountCode:'1301',accountName:'مخزون',debit:0,credit:2}
  ]
});

test('employee invoice includes full printable line items and original financial totals',()=>{
 const result=generateEmployeeStatement({
   employee,fromDate:'2026-11-01',toDate:'2026-11-15',
   invoices:[invoice],journalEntries:[financialJournal('pos_invoice','je-sale'),financialJournal('cogs','je-cogs')]
 });
 assert.equal(result.rows.length,1,'sale/COGS journal lines must not become employee adjustments');
 const row=result.rows[0];
 assert.equal(row.type,'invoice');
 assert.equal(row.referenceNumber,'INV-0161');
 assert.equal(row.items?.length,1);
 assert.equal(row.items?.[0].itemName,'ورق مطبوع');
 assert.equal(row.items?.[0].quantity,2);
 assert.equal(row.totalAmount,16);
 assert.equal(row.remainingAmount,16);
 assert.equal(result.closingBalance,-16);
});

test('a name in an unrelated manual journal is not sufficient to charge the employee',()=>{
 const journal:JournalEntry={
   id:'je-unrelated',entryNumber:'JE-2026-7777',date:'2026-11-04',
   referenceType:'manual',referenceId:'other-record',
   createdAt:'2026-11-04T12:00:00Z',description:'إيرادات - أحمد عيسى',
   lines:[
     {accountCode:'1104',accountName:'سلف الموظفين',debit:10,credit:0,description:'أحمد عيسى'},
     {accountCode:'1101',accountName:'نقد',debit:0,credit:10}
   ]
 };
 const result=generateEmployeeStatement({employee,fromDate:'2026-11-01',toDate:'2026-11-15',journalEntries:[journal]});
 assert.equal(result.rows.length,0);
 assert.equal(result.closingBalance,0);
});

test('only a manual journal explicitly referencing the employee and advance account is included',()=>{
 const journal:JournalEntry={
   id:'je-advance',entryNumber:'JE-2026-1010',date:'2026-11-04',
   referenceType:'manual',referenceId:employee.id,
   createdAt:'2026-11-04T12:00:00Z',description:'تسوية سلفة معتمدة',
   lines:[
     {accountCode:'1104',accountName:'سلف موظفين',debit:3,credit:0},
     {accountCode:'1101',accountName:'نقد',debit:0,credit:3}
   ]
 };
 const result=generateEmployeeStatement({employee,fromDate:'2026-11-01',toDate:'2026-11-15',journalEntries:[journal]});
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].typeLabel,'تسوية يدوية معتمدة لسلفة موظف');
 assert.equal(result.rows[0].disbursement,3);
 assert.equal(result.closingBalance,-3);
});

test('approved payroll prints salary components once, even with matching salary history and linked adjustments',()=>{
 const sheetId='prs-approved-1';
 const payroll = {
   id:sheetId,sheetNumber:'PR-2026-0001',period:'نوفمبر 2026',
   createdAt:'2026-11-04',disbursedAt:'2026-11-06',
   status:'approved',voucherNumber:'PV-SAL-2026-0001',
   items:[{
     employeeId:employee.id,employeeName:employee.name,
     employeeCode:employee.code,isIncluded:true,
     basicSalary:3000,allowances:200,incentives:100,
     deductions:50,advancesDeducted:500,netSalary:2750
   }]
 };
 const result=generateEmployeeStatement({
   employee:{
     ...employee,
     paymentHistory:[{
       id:'salary-history',date:'2026-11-06',type:'salary',
       amount:2750,period:'نوفمبر 2026',paymentMethod:'cash',
       voucherNumber:'PV-SAL-2026-0001'
     }]
   },
   fromDate:'2026-11-01',toDate:'2026-11-15',
   payrollSheets:[payroll],
   advances:[{
     id:'adv-prior',employeeId:employee.id,employeeName:employee.name,
     date:'2026-11-01',amount:500,status:'deducted',
     disbursedImmediately:true,treasuryAccountCode:'CASH-1101',
     treasuryName:'الصندوق النقدي الرئيسي',reason:'سلفة سابقة',
     payrollSheetId:sheetId
   }],
   deductions:[{
     id:'ded-payroll',employeeId:employee.id,employeeName:employee.name,
     date:'2026-11-05',amount:50,reason:'خصم',
     status:'deducted',payrollSheetId:sheetId
   }],
   incentives:[{
     id:'inc-payroll',employeeId:employee.id,employeeName:employee.name,
     date:'2026-11-05',amount:100,reason:'مكافأة',
     status:'paid',payrollSheetId:sheetId
   }]
 });
 assert.equal(result.rows.length,2,'one advance and one approved payroll, not four duplicate postings');
 const slip=result.rows.find(row=>row.type==='payroll_sheet');
 assert.ok(slip);
 assert.equal(slip.entitlement,3300);
 assert.equal(slip.deduction,50);
 assert.equal(slip.disbursement,2750);
 assert.equal(slip.payrollDetails?.incentives,100);
 assert.equal(slip.payrollDetails?.advancesDeducted,500);
 assert.equal(result.closingBalance,0,'previous advance is not deducted twice in payroll');
});

test('draft payroll, pending adjustments and unapproved contractual accrual do not become official debt',()=>{
 const report=generateEmployeeStatement({
   employee:{...employee,salaryAmount:3000,hireDate:'2026-01-01'},
   fromDate:'2026-11-01',toDate:'2026-11-15',
   payrollSheets:[{
     id:'prs-draft-1',sheetNumber:'PR-2026-0099',
     status:'draft',createdAt:'2026-11-01',period:'نوفمبر 2026',
     items:[{employeeId:employee.id,employeeCode:employee.code,
      isIncluded:true,basicSalary:3000,netSalary:3000}]
   }],
   advances:[{
     id:'adv-pending',employeeId:employee.id,employeeName:employee.name,
     date:'2026-11-01',amount:500,disbursedImmediately:false,
     status:'pending',treasuryAccountCode:'CASH-1101',
     treasuryName:'الصندوق',reason:'طلب'
   }],
   deductions:[{
     id:'ded-pending',employeeId:employee.id,employeeName:employee.name,
     date:'2026-11-01',amount:100,reason:'طلب خصم',status:'pending'
   }],
   incentives:[{
     id:'inc-pending',employeeId:employee.id,employeeName:employee.name,
     date:'2026-11-01',amount:100,reason:'طلب مكافأة',status:'pending'
   }]
 });
 assert.equal(report.rows.length,0);
 assert.equal(report.closingBalance,0);
});
