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
