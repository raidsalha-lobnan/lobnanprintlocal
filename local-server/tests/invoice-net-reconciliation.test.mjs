import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileInvoiceLinkedRevenue as audit,runReadOnlyInvoiceNetAudit} from '../invoice-net-reconciliation.mjs';

const inv=(id,total,extra={})=>({record_id:id,value:{id,invoiceNumber:id,totalAmount:total,isAccountingPosted:true,...extra}});
const journal=(id,invoiceId,type,account,debit,credit)=>({
  record_id:id,value:{referenceId:invoiceId,referenceType:type,
    lines:[{accountCode:account,debit,credit}]}
});

test('detects historical overposting without proposing accounting changes',()=>{
  const invoices=[inv('INV-0003',800),inv('INV-0007',510)];
  const journals=[
    journal('j1','INV-0003','pos_invoice','4101',0,800),
    journal('j2','INV-0003','pos_invoice','4101',0,1600),
    journal('j3','INV-0007','pos_invoice','4101',0,510),
    journal('j4','INV-0007','pos_invoice','4101',0,510)
  ];
  const before=JSON.stringify({invoices,journals});
  const r=audit(invoices,journals);
  assert.equal(r.linkedRevenueVarianceCount,2);
  assert.equal(r.positiveLinkedVariance,2110);
  assert.equal(r.cases[0].variance,1600);
  assert.equal(r.cases[0].requiresManualReconciliation,true);
  assert.equal(JSON.stringify({invoices,journals}),before);
});

test('includes correction journal debits and credits before reporting a variance',()=>{
  const invoices=[inv('INV-0135',150)];
  const corrected=[
    journal('orig','INV-0135','pos_invoice','4101',0,120),
    journal('fix','INV-0135','invoice_correction','4101',0,30)
  ];
  assert.equal(audit(invoices,corrected).linkedRevenueVarianceCount,0);
  const duplicateReversed=[
    journal('a','INV-0135','pos_invoice','4101',0,150),
    journal('b','INV-0135','pos_invoice','4101',0,150),
    journal('c','INV-0135','invoice_correction','4101',150,0)
  ];
  assert.equal(audit(invoices,duplicateReversed).linkedRevenueVarianceCount,0);
});

test('tracks orphan invoice journals separately from valid accounting records',()=>{
  const r=audit([inv('uuid-one',5)],[journal('orphan','no-such-uuid','pos_invoice','4101',0,100)]);
  assert.equal(r.orphanJournals.length,1);
  assert.equal(r.cases.length,0);
  assert.equal(r.problems[0].reason,'POSTED_WITHOUT_LINKED_SALE_CREDITS');
});

test('flags non-numeric journal entries instead of treating them as zero',()=>{
  const r=audit([inv('x',20)],[journal('bad','x','pos_invoice','4101',0,'not-money')]);
  assert.equal(r.problems[0].reason,'INVALID_LINKED_JOURNAL_LINE');
});

test('ignores sub-cent representation drift',()=>{
  const r=audit([inv('x',10.001)],[journal('j','x','pos_invoice','4101',0,10.0001)]);
  assert.equal(r.cases.length,0);
});

test('15 ILS delivery credited to courier liability 2104 is NOT an income shortfall',()=>{
  const invoices=[inv('INV-0024',1180)];
  const journals=[
    journal('rev','INV-0024','pos_invoice','4101',0,1165),
    journal('delivery','INV-0024','pos_invoice','2104',0,15)
  ];
  const r=audit(invoices,journals);
  assert.equal(r.linkedInvoiceCreditVarianceCount,0);
  assert.equal(r.negativeLinkedVariance,0);
  assert.equal(r.problems.length,0);
  const allocated=audit([inv('DELIVERY-ONLY',15)],[
    journal('delivery-only','DELIVERY-ONLY','pos_invoice','2104',0,15)
  ]);
  assert.equal(allocated.problems.length,0);
  assert.equal(allocated.linkedInvoiceCreditVarianceCount,0);
});

test('VAT 2103 is not sales revenue but is a valid invoice credit',()=>{
  const r=audit([inv('VAT-EXAMPLE',110)],[
    journal('revenue','VAT-EXAMPLE','pos_invoice','4101',0,100),
    journal('vat','VAT-EXAMPLE','pos_invoice','2103',0,10)
  ]);
  assert.equal(r.linkedInvoiceCreditVarianceCount,0);
  assert.equal(r.negativeLinkedVariance,0);
});

test('missing delivery liability still triggers invoice-credit variance',()=>{
  const r=audit([inv('NOT-CORRECTLY-POSTED',1180)],[
    journal('revenue','NOT-CORRECTLY-POSTED','pos_invoice','4101',0,1165)
  ]);
  assert.equal(r.linkedInvoiceCreditVarianceCount,1);
  assert.equal(r.cases[0].variance,-15);
});

test('runs in a PostgreSQL read-only consistent transaction with parameterized SELECTs',async()=>{
  const queries=[];
  const pool={connect:async()=>({
    query:async(...args)=>{
      queries.push(args);
      return {rows:[]};
    },release:()=>{}
  })};
  const report=await runReadOnlyInvoiceNetAudit(pool,'test_workspace');
  assert.equal(report.workspace,'test_workspace');
  assert.equal(queries[0][0],'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1)[0],'COMMIT');
  assert.equal(queries.filter(x=>x[0].startsWith('SELECT')).length,2);
  assert.ok(queries.every(x=>/^(SELECT|COMMIT|BEGIN)/.test(x[0])));
  assert.ok(queries.filter(x=>x[0].startsWith('SELECT')).every(x=>x[1][0]==='test_workspace'));
});
