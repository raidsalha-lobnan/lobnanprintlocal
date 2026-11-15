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

test('invoice 73 public-number duplicate is not double-counted for price-only amendment',()=>{
 const original={
  id:'inv-pos-1794135084876-00quw',invoiceNumber:'INV-0073',date:'2026-11-08',
  isOfficial:true,warehouse:'المستودع الرئيسي - الكتب والمطبوعات الجاهزة',
  customerId:'school-42',currency:'ILS',paymentMethod:'credit',
  totalAmount:4702.5,baseTotalAmount:4702.5,subtotal:4702.5,paidAmount:0,
  items:[
   {itemId:'skin',category:'print_raw',quantity:6,unitPrice:150,total:900},
   {itemId:'skin',category:'print_raw',quantity:29.25,unitPrice:130,total:3802.5}
  ]
 };
 const proposed={...original,totalAmount:4942.5,baseTotalAmount:4942.5,
  subtotal:4942.5,items:[{...original.items[0],unitPrice:190,total:1140},original.items[1]]};
 const sale={value:{id:'sale-73',referenceType:'pos_invoice',referenceId:original.id,
  lines:[{accountCode:'1201',debit:4702.5,credit:0},{accountCode:'4101',debit:0,credit:4702.5}]}};
 const cost={value:{id:'cost-73',referenceType:'cogs',referenceId:original.id,
  lines:[{accountCode:'5101',debit:3172.5,credit:0},{accountCode:'1301',debit:0,credit:3172.5}]}};
 const stock=[
  {value:{id:'legacy-nov1',type:'out_sale',date:'2026-11-01',referenceNumber:'INV-0073',
   itemId:'other',quantity:1,unitPrice:1,totalValue:1}},
  {value:{id:'temp-73',type:'out_sale',date:'2026-11-08',
   referenceNumber:'TEMP-'+original.id,itemId:'skin',quantity:35.25,
   unitPrice:90,totalValue:3172.5}},
  {value:{id:'public-number-duplicate-73',type:'out_sale',date:'2026-11-08',
   referenceNumber:'INV-0073',itemId:'skin',quantity:35.25,
   unitPrice:90,totalValue:3172.5}}
 ];
 const result=verifyInvoiceRevisionBaseline({invoice:original,proposed,
  journals:[sale,cost],movements:stock});
 assert.equal(result.totalDeltaMinor,24000);
 assert.equal(result.currentCOGSMinor,317250);
 assert.equal(result.expectedNextCOGSMinor,317250);
 assert.deepEqual(result.stockDeltas,[]);
 assert.deepEqual(result.verifiedMovementIds,['temp-73']);
 assert.deepEqual(result.legacyDuplicateDisplayMovementIds,['public-number-duplicate-73']);
 assert.deepEqual(result.accountDeltas,{'1201':24000,'4101':-24000});
 // Quantity corrections are NOT approved from ambiguous historical stock.
 const changedQuantity={...proposed,items:[
  proposed.items[0],{...proposed.items[1],quantity:30,total:3900}],
  totalAmount:5040,baseTotalAmount:5040,subtotal:5040};
 assert.throws(()=>verifyInvoiceRevisionBaseline({invoice:original,
  proposed:changedQuantity,journals:[sale,cost],movements:stock}),
  /REVISION_LEGACY_DOUBLE_STOCK_REQUIRES_INVENTORY_AUDIT/);
});

test('same-date foreign owner and mismatching stock cannot be adopted as duplicate proof',()=>{
 const i={id:'one',date:'2026-11-08',invoiceNumber:'INV-0073',
  isOfficial:true,warehouse:'main',totalAmount:180,paidAmount:0,
  items:[{itemId:'skin',category:'print_raw',quantity:2,unitPrice:90,total:180}]};
 const p={...i,totalAmount:190,items:[{...i.items[0],unitPrice:95,total:190}]};
 const j=[{value:{referenceType:'pos_invoice',referenceId:i.id,lines:[
  {accountCode:'1201',debit:180,credit:0},{accountCode:'4101',debit:0,credit:180}]}},
 {value:{referenceType:'cogs',referenceId:i.id,lines:[
  {accountCode:'5101',debit:100,credit:0},{accountCode:'1301',debit:0,credit:100}]}}];
 const stock=[{value:{id:'temp',type:'out_sale',referenceNumber:'TEMP-one',
  date:i.date,itemId:'skin',quantity:2,unitPrice:50,totalValue:100}},
 {value:{id:'foreign',type:'out_sale',referenceNumber:'INV-0073',sourceInvoiceId:'other',
  date:i.date,itemId:'skin',quantity:2,unitPrice:50,totalValue:100}}];
 const ok=verifyInvoiceRevisionBaseline({invoice:i,proposed:p,
  journals:j,movements:stock});
 assert.deepEqual(ok.legacyDuplicateDisplayMovementIds,[]);
 assert.deepEqual(ok.verifiedMovementIds,['temp']);
 const wrong=[...stock,{value:{id:'not-duplicate',type:'out_sale',referenceNumber:'INV-0073',
  date:i.date,itemId:'skin',quantity:2,unitPrice:51,totalValue:102}}];
 assert.throws(()=>verifyInvoiceRevisionBaseline({invoice:i,proposed:p,
  journals:j,movements:wrong}),/REVISION_STOCK_(BASELINE_MISMATCH|COST_CHANGED_WITHOUT_REVALUATION)/);
});
test('legacy sale with missing COGS and no proven stock may change only price, never inventory',()=>{
 const old={
  id:'inv-pos-legacy-26',invoiceNumber:'INV-0026',date:'2026-11-04',
  warehouse:'main',isOfficial:true,currency:'ILS',
  totalAmount:10,baseTotalAmount:10,paidAmount:0,subtotal:10,
  customerId:'customer-1',items:[{
   itemId:'cardboard-1',category:'print_raw',quantity:10,
   unitPrice:1,total:10,unit:'piece',length:1,width:1,count:1,hasDimensions:false
  }]
 };
 const next={...old,totalAmount:12,baseTotalAmount:12,subtotal:12,
  items:[{...old.items[0],unitPrice:1.2,total:12}]};
 const onlySales=[{value:{id:'legacy-revenue-26',referenceType:'pos_invoice',
  referenceId:old.id,lines:[
   {accountCode:'1201',debit:10,credit:0},
   {accountCode:'4101',debit:0,credit:10}
  ]}}];
 const result=verifyInvoiceRevisionBaseline({
  invoice:old,proposed:next,journals:onlySales,movements:[]
 });
 assert.equal(result.legacyCostReviewRequired,true);
 assert.equal(result.currentCOGSMinor,0);
 assert.equal(result.expectedNextCOGSMinor,0);
 assert.deepEqual(result.stockDeltas,[]);
 assert.deepEqual(result.accountDeltas,{'1201':200,'4101':-200});
 assert.deepEqual(result.verifiedMovementIds,[]);
 const bigger={...next,items:[{...next.items[0],quantity:11,total:13.2}],
  totalAmount:13.2,baseTotalAmount:13.2,subtotal:13.2};
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:old,proposed:bigger,journals:onlySales,movements:[]
 }),/REVISION_STOCK_BASELINE_MISMATCH/);
});
test('legacy missing-cost price-only path never bypasses invalid original AR or sales journals',()=>{
 const old={
  id:'missing-cost-invoice',invoiceNumber:'INV-0042',date:'2026-11-04',
  warehouse:'main',isOfficial:true,currency:'ILS',
  totalAmount:20,baseTotalAmount:20,paidAmount:0,subtotal:20,
  items:[{itemId:'paper',category:'print_raw',quantity:10,unitPrice:2,total:20}]
 };
 const edited={...old,totalAmount:21,baseTotalAmount:21,subtotal:21,
  items:[{...old.items[0],unitPrice:2.1,total:21}]};
 const bad=[{value:{referenceType:'pos_invoice',referenceId:old.id,
  lines:[{accountCode:'1201',debit:19,credit:0},{accountCode:'4101',debit:0,credit:19}]}}];
 assert.throws(()=>verifyInvoiceRevisionBaseline({
  invoice:old,proposed:edited,journals:bad,movements:[]
 }),/REVISION_POSTED_ACCOUNT_MISMATCH/);
});
