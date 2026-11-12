import test from 'node:test';
import assert from 'node:assert/strict';
import type {Party, Invoice} from '../src/types';
import {
  indexedSubCustomers, registeredSubCustomer, normalizeSubCustomerName,
  getInvoiceSubCustomerName, isInvoiceOnlySubCustomer
} from '../src/utils/subCustomerIdentity';
import {customerPeriodRows} from '../src/utils/customerPeriodReport';

const parent = (id:string, code:string):Party => ({
  id, code, name:id==='cash'?'زبون نقدي':'عميل دائم', type:'customer',
  balance:0, openingBalance:0
} as Party);

const invoice = (id:string, parentId:string, name:string, total=50):Invoice => ({
  id, invoiceNumber:id, date:'2026-11-05', customerId:parentId,
  customerName:parentId==='cash'?'زبون نقدي':'عميل دائم',
  subCustomerName:name, type:'pos', items:[], subtotal:total, totalAmount:total,
  paidAmount:0, remainingAmount:total, paymentMethod:'credit', status:'unpaid',
  workflowStatus:'new', notes:''
} as Invoice);

const report = (parties:Party[], invoices:Invoice[], query='') =>
  customerPeriodRows({
    parties, invoices, vouchers:[], purchases:[], purchaseReturns:[],
    salesReturns:[], printOrders:[], journalEntries:[], debtClearings:[]
  }, {mode:'all', day:'', from:'', to:'', list:'sub', query});

test('legacy invoice names appear as one searchable walk-in account per parent, without mutations', () => {
  const parties=[parent('cash','CUST-0001')];
  const invoices=[
    invoice('INV-0185','cash','مؤمن الدرفيل',1905),
    invoice('INV-0199','cash','مؤمن   الدرفيل',125),
  ];
  const before=JSON.stringify({parties,invoices});
  const indexed=indexedSubCustomers(parties,invoices);
  assert.equal(indexed.length,1);
  assert.equal(indexed[0].parentPartyId,'cash');
  assert.equal(isInvoiceOnlySubCustomer(indexed[0]),true);
  const rows=report(parties,invoices,'مؤمن الدرفيل');
  assert.equal(rows.length,1);
  assert.equal(rows[0].invoiceCount,2);
  assert.equal(JSON.stringify({parties,invoices}),before);
});

test('same walk-in name under different parents never crosses customer accounts', () => {
  const parties=[parent('cash','CUST-0001'),parent('other','CUST-0002')];
  const invoices=[invoice('INV-A','cash','مؤمن الدرفيل',120),invoice('INV-B','other','مؤمن الدرفيل',600)];
  const groups=indexedSubCustomers(parties,invoices);
  assert.equal(groups.length,2);
  assert.notEqual(groups[0].id,groups[1].id);
  const rows=report(parties,invoices,'مؤمن');
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.invoiceCount).sort(),[1,1]);
});

test('registered sub-customer automatically collects old name-only invoices under its own parent', () => {
  const registered={id:'sub-1',name:'مؤمن الدرفيل',code:'SUB-0001',type:'customer',
    parentPartyId:'cash',isSubCustomer:true,balance:0,openingBalance:0} as Party;
  const parties=[parent('cash','CUST-0001'),registered];
  const invoices=[invoice('INV-0185','cash','مؤمن الدرفيل')];
  assert.equal(registeredSubCustomer(parties,'cash','مُؤْمِن الدرفيل')?.id,'sub-1');
  assert.equal(indexedSubCustomers(parties,invoices).length,1);
  assert.equal(report(parties,invoices,'مؤمن')[0].invoiceCount,1);
});

test('old parentCustomerId alias and duplicate registered records remain one search group', () => {
  const a = {id:'old-1', name:'مؤمن الدرفيل', code:'SUB-3', type:'customer',
    isSubCustomer:true, parentCustomerId:'cash', balance:0} as unknown as Party;
  const b = {id:'old-2', name:'مؤمن الدرفيل', code:'SUB-7', type:'customer',
    isSubCustomer:true, parentPartyId:'cash', balance:0} as Party;
  const parties=[parent('cash','CUST-0001'),a,b];
  const invoices=[invoice('INV-0185','cash','مؤمن الدرفيل')];
  assert.equal(registeredSubCustomer(parties,'cash','مؤمن الدرفيل')?.id,'old-1');
  assert.equal(indexedSubCustomers(parties,invoices).length,1);
  assert.equal(report(parties,invoices,'مؤمن').length,1);
});

test('normalization handles harmless Arabic variants, not substring aliases', () => {
  assert.equal(normalizeSubCustomerName(' مُؤْمِن    الدرفيل '), normalizeSubCustomerName('مؤمن الدرفيل'));
  assert.equal(getInvoiceSubCustomerName({subCustomerName:'',customCustomerText:'مؤمن الدرفيل 0591234567'} as Invoice),'مؤمن الدرفيل');
});
