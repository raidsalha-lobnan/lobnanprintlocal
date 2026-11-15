import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInvoiceRevisionBaseline} from '../invoice-revision-baseline.mjs';

function invoice(type,amount=8) {
 const party=type==='employee'?'emp-1':'sup-1';
 return {id:'invoice-1',invoiceNumber:'INV-0901',date:'2026-11-15',
  counterpartyType:type,customerId:party,counterpartyId:party,
  employeeId:type==='employee'?party:undefined,
  isOfficial:true,paymentMethod:'credit',currency:'ILS',exchangeRate:1,
  totalAmount:amount,baseTotalAmount:amount,subtotal:amount,paidAmount:0,
  basePaidAmount:0,items:[{itemId:'service-1',category:'services',
    quantity:1,unitPrice:amount,total:amount}]};
}
const source=(account)=>({value:{id:'original-sale',referenceType:'pos_invoice',
 referenceId:'invoice-1',lines:[
  {accountCode:account,debit:8,credit:0},
  {accountCode:'4101',debit:0,credit:8}
]}});
const reclass=()=>({value:{id:'reclass-employee',referenceType:'counterparty_reclassification',
 referenceId:'invoice-1',employeeId:'emp-1',sourceInvoiceNumber:'INV-0901',
 lines:[{accountCode:'1104',debit:8,credit:0},
        {accountCode:'1201',debit:0,credit:8}]}});
const edited=(old)=>({...old,subtotal:10,totalAmount:10,baseTotalAmount:10,
 items:[{...old.items[0],unitPrice:10,total:10}]});

test('historic employee reclassification remains in baseline during price edits',()=>{
 const old=invoice('employee');
 const result=verifyInvoiceRevisionBaseline({invoice:old,proposed:edited(old),
  journals:[source('1201'),reclass()],movements:[]});
 assert.deepEqual(result.accountDeltas,{'1104':200,'4101':-200});
 assert.deepEqual(result.customerBalanceChanges,[]);
});

test('supplier invoice revision preserves supplier debit account 2101',()=>{
 const old=invoice('supplier');
 const result=verifyInvoiceRevisionBaseline({invoice:old,proposed:edited(old),
  journals:[source('2101')],movements:[]});
 assert.deepEqual(result.accountDeltas,{'2101':200,'4101':-200});
});

test('supplier invoice revision refuses customer account 1201',()=>{
 const old=invoice('supplier');
 assert.throws(()=>verifyInvoiceRevisionBaseline({invoice:old,proposed:edited(old),
  journals:[source('1201')],movements:[]}),/REVISION_POSTED_ACCOUNT_MISMATCH:2101/);
});
