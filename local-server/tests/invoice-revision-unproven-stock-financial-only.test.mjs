import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInvoiceRevisionBaseline} from '../invoice-revision-baseline.mjs';

const old=()=>({
 id:'old-no-immutable-stock',invoiceNumber:'INV-0004',date:'2026-11-01',
 isOfficial:true,counterpartyType:'customer',customerId:'pt-old',
 warehouse:'main',paymentMethod:'credit',exchangeRate:1,
 totalAmount:25,baseTotalAmount:25,subtotal:25,paidAmount:0,
 basePaidAmount:0,items:[{itemId:'item-a',category:'print_raw',
 quantity:1,unitPrice:25,total:25}]
});
const journals=()=>[
 {value:{referenceType:'pos_invoice',referenceId:'old-no-immutable-stock',
  lines:[{accountCode:'1201',debit:25,credit:0},{accountCode:'4101',debit:0,credit:25}]}},
 {value:{referenceType:'cogs',referenceId:'old-no-immutable-stock',
  lines:[{accountCode:'5101',debit:15,credit:0},{accountCode:'1301',debit:0,credit:15}]}}
];
const legacyStock=()=>[{value:{id:'old-recycled-display-number',type:'out_sale',
 referenceNumber:'INV-0004',date:'2026-10-01',
 itemId:'another-item',quantity:6,unitPrice:1,totalValue:6}}];
const verify=(proposed,jj=journals())=>verifyInvoiceRevisionBaseline({
 invoice:old(),proposed,journals:jj,movements:legacyStock()});

test('unproven historical stock: price-only amendment keeps COGS and inventory untouched',()=>{
 const proposed={...old(),totalAmount:30,baseTotalAmount:30,subtotal:30,
  items:[{...old().items[0],unitPrice:30,total:30}]};
 const plan=verify(proposed);
 assert.equal(plan.currentCOGSMinor,1500);
 assert.equal(plan.expectedNextCOGSMinor,1500);
 assert.deepEqual(plan.stockDeltas,[]);
 assert.deepEqual(plan.accountDeltas,{'1201':500,'4101':-500});
 assert.equal(plan.legacyCostReviewReason,'UNVERIFIED_HISTORICAL_STOCK_SOURCE_FINANCIAL_ONLY');
 assert.deepEqual(plan.verifiedMovementIds,[]);
});

test('unproven historical stock: quantity edit remains blocked',()=>{
 const proposed={...old(),totalAmount:50,baseTotalAmount:50,subtotal:50,
  items:[{...old().items[0],quantity:2,total:50}]};
 assert.throws(()=>verify(proposed),/REVISION_STOCK_BASELINE_MISMATCH/);
});

test('unproven historical stock: changing date or debtor is not financial-only',()=>{
 assert.throws(()=>verify({...old(),date:'2026-11-02'}),
  /REVISION_STOCK_BASELINE_MISMATCH/);
 assert.throws(()=>verify({...old(),customerId:'other'}),
  /REVISION_STOCK_BASELINE_MISMATCH/);
});

test('unproven historical stock: invalid original sales posting never qualifies',()=>{
 const bad=journals();bad[0].value.lines[0].debit=24;
 bad[0].value.lines[1].credit=24;
 assert.throws(()=>verify({...old(),notes:'memo'},bad),
  /REVISION_POSTED_ACCOUNT_MISMATCH/);
});
