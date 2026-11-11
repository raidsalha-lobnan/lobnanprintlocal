import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInvoiceRevisionBaseline} from '../invoice-revision-baseline.mjs';
const inv={id:'i66',invoiceNumber:'INV-0066',date:'2026-11-04',
 isOfficial:true,customerId:'cust',totalAmount:50.4,baseTotalAmount:50.4,
 subtotal:50.4,paidAmount:0,items:[
  {itemId:'paper',category:'print_raw',quantity:68,total:13.6,unitPrice:0.2},
  {itemId:'paper',category:'print_raw',quantity:64,total:12.8,unitPrice:0.2},
  {itemId:'card',category:'print_raw',quantity:12,total:24,unitPrice:2}]};
const journal=(id,type,amt)=>({value:{id,referenceType:type,referenceId:'i66',
 lines:[{accountCode:type==='cogs'?'5101':'1201',debit:amt,credit:0},
 {accountCode:type==='cogs'?'1301':'4101',debit:0,credit:amt}]}});
const movements=[
 {value:{id:'old-unrelated',date:'2026-11-01',referenceNumber:'INV-0066',
  itemId:'paper',quantity:1,unitPrice:1,totalValue:1,type:'out_sale'}},
 {value:{id:'sale-card',date:'2026-11-04',referenceNumber:'INV-0066',
  itemId:'card',quantity:12,unitPrice:1,totalValue:12,type:'out_sale'}},
 {value:{id:'sale-paper',date:'2026-11-04',referenceNumber:'INV-0066',
  itemId:'paper',quantity:132,unitPrice:1,totalValue:132,type:'out_sale'}}
];
const linked=[journal('sales','pos_invoice',50.4),journal('cogs','cogs',144)];
const edited={...inv,totalAmount:51,baseTotalAmount:51,subtotal:51,
 items:[{...inv.items[0],quantity:1,unitPrice:14,total:14},
 {...inv.items[1],quantity:1,unitPrice:13,total:13},inv.items[2]]};
test('invoice 66 baseline ignores unrelated reused number and verifies exact quantities',()=>{
 const plan=verifyInvoiceRevisionBaseline({invoice:inv,proposed:edited,journals:linked,movements});
 assert.equal(plan.totalDeltaMinor,60);
 assert.equal(plan.currentCOGSMinor,14400);
 assert.equal(plan.expectedNextCOGSMinor,1400);
 assert.deepEqual(plan.verifiedMovementIds,['sale-card','sale-paper']);
});
test('invoice 71-type duplicated sales and cost journals block unreviewed amendment',()=>{
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:inv,proposed:edited,journals:[...linked,journal('duplicate','pos_invoice',8)],
  movements}),/REVISION_DUPLICATE_HISTORY_NEEDS_APPROVED_CORRECTION/);
});
test('mismatched stock and cost are never silently corrected',()=>{
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:inv,proposed:edited,journals:linked,movements:movements.slice(0,2)}),
  /STOCK_BASELINE_MISMATCH/);
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:inv,proposed:edited,journals:[linked[0],journal('cogs','cogs',130)],
  movements}),/COST_BASELINE_MISMATCH/);
});

test('a second amendment uses the net approved journal and stock history, not only the first posting',()=>{
 const current={...edited};
 const next={...current,subtotal:52,totalAmount:52,baseTotalAmount:52,
  items:[{...current.items[0],unitPrice:15,total:15},...current.items.slice(1)]};
 const approvedRevenue={value:{id:'correction-revenue',referenceType:'invoice_correction',
  referenceId:'i66',internalCorrection:true,approvedRevision:true,
  correctionGroupId:'revision-1',correctionKind:'revenue',
  lines:[{accountCode:'1201',debit:0.6,credit:0},{accountCode:'4101',debit:0,credit:0.6}]}};
 const approvedCost={value:{id:'correction-cost',referenceType:'invoice_correction',
  referenceId:'i66',internalCorrection:true,approvedRevision:true,
  correctionGroupId:'revision-1',correctionKind:'cogs',
  lines:[{accountCode:'1301',debit:130,credit:0},{accountCode:'5101',debit:0,credit:130}]}};
 const stockCorrection={value:{id:'correction-stock',type:'in_adjustment',
  sourceInvoiceId:'i66',referenceNumber:'INV-0066',referenceType:'invoice_correction',
  internalCorrection:true,approvedRevision:true,correctionGroupId:'revision-1',
  itemId:'paper',quantity:130,unitPrice:1,totalValue:130}};
 const plan=verifyInvoiceRevisionBaseline({invoice:current,proposed:next,
  journals:[...linked,approvedRevenue,approvedCost],movements:[...movements,stockCorrection]});
 assert.equal(plan.totalDeltaMinor,100);
 assert.equal(plan.currentCOGSMinor,1400);
 assert.equal(plan.expectedNextCOGSMinor,1400);
 assert.deepEqual(plan.stockDeltas,[]);
});

test('a second paid-off credit invoice edit builds on approved deltas, not original postings',()=>{
 const editedOnce={...inv,subtotal:51,totalAmount:51,baseTotalAmount:51,items:[
  {...inv.items[0],quantity:1,unitPrice:14,total:14},
  {...inv.items[1],quantity:1,unitPrice:13,total:13},inv.items[2]]};
 const editedTwice={...editedOnce,subtotal:52,totalAmount:52,baseTotalAmount:52,
  items:[{...editedOnce.items[0],unitPrice:15,total:15},...editedOnce.items.slice(1)]};
 const extraJournal={value:{id:'adjustment-sales',referenceId:'i66',referenceType:'invoice_correction',
  correctionGroupId:'revision-1',correctionKind:'revenue',approvedRevision:true,internalCorrection:true,
  lines:[{accountCode:'1201',debit:0.6,credit:0},{accountCode:'4101',debit:0,credit:0.6}]}};
 const extraCost={value:{id:'adjustment-cost',referenceId:'i66',referenceType:'invoice_correction',
  correctionGroupId:'revision-1',correctionKind:'cogs',approvedRevision:true,internalCorrection:true,
  lines:[{accountCode:'1301',debit:130,credit:0},{accountCode:'5101',debit:0,credit:130}]}};
 const stockCredit={value:{id:'credit-movement',itemId:'paper',sourceInvoiceId:'i66',
  referenceNumber:'INV-0066',referenceType:'invoice_correction',correctionGroupId:'revision-1',
  approvedRevision:true,internalCorrection:true,type:'in_adjustment',quantity:130,unitPrice:1,totalValue:130}};
 const result=verifyInvoiceRevisionBaseline({invoice:editedOnce,proposed:editedTwice,
  journals:[...linked,extraJournal,extraCost],movements:[...movements,stockCredit]});
 assert.equal(result.totalDeltaMinor,100);
 assert.equal(result.currentCOGSMinor,1400);
 assert.equal(result.expectedNextCOGSMinor,1400);
 assert.deepEqual(result.stockDeltas,[]);
});
