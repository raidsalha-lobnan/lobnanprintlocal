import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';

function sale(type, debtorCode) {
  const id = 'sale-'+type;
  const partyId = type==='employee'?'emp-1':'party-1';
  return {atomicInvoiceId:id,changes:[
    {entity:'invoices',id,expectedVersion:0,value:{
      id,invoiceNumber:'TEMP-'+id,isAccountingPosted:true,
      counterpartyType:type,counterpartyId:partyId,customerId:partyId,
      subtotal:8,discountTotal:0,taxAmount:0,additionalCharges:0,
      totalAmount:8,baseTotalAmount:8,basePaidAmount:0,
      exchangeRate:1,remainingAmount:8,
      items:[{itemId:'srv-demo',quantity:1,unitPrice:8,total:8,category:'services'}]
    }},
    {entity:'journalEntries',id:'je-'+id,expectedVersion:0,value:{
      id:'je-'+id,referenceId:id,referenceType:'pos_invoice',
      lines:[{accountCode:debtorCode,debit:8,credit:0},
             {accountCode:'4101',debit:0,credit:8}]
    }},
    ...(type==='employee'?[]:[{entity:'parties',id:partyId,expectedVersion:1,
      value:{id:partyId,balance:8}}])
  ]};
}

test('customer sale must debit customer receivables 1201',()=>{
  assert.equal(validateAtomicInvoicePosting(sale('customer','1201')),true);
  assert.throws(()=>validateAtomicInvoicePosting(sale('customer','1104')),
    {message:'ATOMIC_POSTING_WRONG_COUNTERPARTY_ACCOUNT'});
});

test('employee sale must debit employee receivables 1104',()=>{
  assert.equal(validateAtomicInvoicePosting(sale('employee','1104')),true);
  assert.throws(()=>validateAtomicInvoicePosting(sale('employee','1201')),
    {message:'ATOMIC_POSTING_WRONG_COUNTERPARTY_ACCOUNT'});
});

test('supplier sale must debit supplier subledger 2101',()=>{
  assert.equal(validateAtomicInvoicePosting(sale('supplier','2101')),true);
  assert.throws(()=>validateAtomicInvoicePosting(sale('supplier','1201')),
    {message:'ATOMIC_POSTING_WRONG_COUNTERPARTY_ACCOUNT'});
});

test('employee sale cannot alter a customer card',()=>{
 const employee=sale('employee','1104');
 employee.changes.push({entity:'parties',id:'emp-1',expectedVersion:1,
   value:{id:'emp-1',balance:8}});
 assert.throws(()=>validateAtomicInvoicePosting(employee),
   {message:'ATOMIC_POSTING_EMPLOYEE_PARTY_MISMATCH'});
});
