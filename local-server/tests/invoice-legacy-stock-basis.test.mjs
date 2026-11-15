import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInvoiceRevisionBaseline} from '../invoice-revision-baseline.mjs';
import {buildVerifiedInvoiceRevisionBundle} from '../invoice-revision-bundle.mjs';

const sourceId='legacy-invoice-1',costJournalId='cogs-legacy-1';
const basis=()=>({
 version:1,kind:'approved_invoice_cost_basis',
 invoiceId:sourceId,invoiceNumber:'INV-0015',invoiceDate:'2026-11-01',
 costJournalId,totalCost:10,
 evidenceLevel:'document_reconstruction_not_physical_movement',
 lines:[{itemId:'leather-1',quantity:2,unitPrice:5,totalCost:10}]
});
const invoice=()=>({
 id:sourceId,invoiceNumber:'INV-0015',date:'2026-11-01',
 isOfficial:true,isAccountingPosted:true,customerId:'cust-1',
 counterpartyType:'customer',exchangeRate:1,paymentMethod:'credit',
 warehouse:'main',subtotal:40,totalAmount:40,baseTotalAmount:40,
 paidAmount:0,basePaidAmount:0,legacyStockBasis:basis(),
 items:[{itemId:'leather-1',category:'print_raw',quantity:2,unitPrice:20,total:40}]
});
const journals=()=>[
 {value:{id:'sale-1',referenceType:'pos_invoice',referenceId:sourceId,
  lines:[{accountCode:'1201',debit:40,credit:0},{accountCode:'4101',debit:0,credit:40}]}},
 {value:{id:costJournalId,referenceType:'cogs',referenceId:sourceId,
  lines:[{accountCode:'5101',debit:10,credit:0},{accountCode:'1301',debit:0,credit:10}]}}
];
const next=(original,newQty=3)=>({
 ...original,subtotal:newQty*20,totalAmount:newQty*20,
 baseTotalAmount:newQty*20,
 items:[{...original.items[0],quantity:newQty,total:newQty*20}]
});

test('audited legacy source permits future stock delta without a fake original stock movement',()=>{
 const old=invoice();
 const plan=verifyInvoiceRevisionBaseline({invoice:old,proposed:next(old),
  journals:journals(),movements:[
   {value:{id:'wrong-public-number',type:'out_sale',date:old.date,
    itemId:'another-item',referenceNumber:old.invoiceNumber,
    quantity:200,unitPrice:1,totalValue:200}}
  ]});
 assert.equal(plan.legacyDocumentaryCostBasis,true);
 assert.equal(plan.legacyDocumentaryJournalId,costJournalId);
 assert.deepEqual(plan.legacyUnverifiedPublicNumberMovementIds,['wrong-public-number']);
 assert.deepEqual(plan.verifiedMovementIds,[]);
 assert.equal(plan.currentCOGSMinor,1000);
 assert.equal(plan.expectedNextCOGSMinor,1500);
 assert.deepEqual(plan.stockDeltas,[{itemId:'leather-1',oldQuantity:2,newQuantity:3,
   inventoryChange:-1}]);
 assert.deepEqual(plan.accountDeltas,{'1201':2000,'4101':-2000});
});

test('source evidence must match one existing immutable posted cost journal',()=>{
 const original=invoice();const changed=next(original);
 const wrong={...original,legacyStockBasis:{...basis(),costJournalId:'other'}};
 assert.throws(()=>verifyInvoiceRevisionBaseline({invoice:wrong,
  proposed:next(wrong),journals:journals(),movements:[]}),
 /REVISION_LEGACY_COST_BASIS_UNVERIFIED/);
 const price={...original,legacyStockBasis:{...basis(),
  lines:[{itemId:'leather-1',quantity:2,unitPrice:6,totalCost:12}],
  totalCost:12}};
 assert.throws(()=>verifyInvoiceRevisionBaseline({invoice:price,
  proposed:next(price),journals:journals(),movements:[]}),
 /REVISION_LEGACY_COST_BASIS_JOURNAL_MISMATCH/);
 const physical=[{value:{id:'previous-real',referenceNumber:'TEMP-'+sourceId,
  type:'out_sale',itemId:'leather-1',quantity:2,unitPrice:5,
  totalValue:10,date:original.date}}];
 assert.throws(()=>verifyInvoiceRevisionBaseline({invoice:original,
  proposed:changed,journals:journals(),movements:physical}),
 /REVISION_LEGACY_COST_BASIS_DOUBLE_SOURCE/);
});

test('legacy source rolls forward through multiple approved cost and stock revisions',()=>{
 const old=next(invoice());
 const extra=[
  {value:{id:'correction-revenue',referenceType:'invoice_correction',
   referenceId:sourceId,internalCorrection:true,approvedRevision:true,
   correctionGroupId:'g1',correctionKind:'financial',
   lines:[{accountCode:'1201',debit:20,credit:0},
          {accountCode:'4101',debit:0,credit:20}]}},
  {value:{id:'correction-cogs',referenceType:'invoice_correction',
   referenceId:sourceId,internalCorrection:true,approvedRevision:true,
   correctionGroupId:'g1',correctionKind:'cogs',
   lines:[{accountCode:'5101',debit:5,credit:0},
          {accountCode:'1301',debit:0,credit:5}]}}
 ];
 const stock=[{value:{id:'approved-stock',sourceInvoiceId:sourceId,
  referenceType:'invoice_correction',correctionGroupId:'g1',
  approvedRevision:true,internalCorrection:true,type:'out_adjustment',
  itemId:'leather-1',quantity:1,unitPrice:5,totalValue:5}}];
 const result=verifyInvoiceRevisionBaseline({invoice:old,proposed:next(old,4),
  journals:[...journals(),...extra],movements:stock});
 assert.equal(result.currentCOGSMinor,1500);
 assert.equal(result.expectedNextCOGSMinor,2000);
 assert.deepEqual(result.verifiedMovementIds,['approved-stock']);
});

test('server invoice bundle preserves historical evidence against client modification',()=>{
 const old=invoice(),modified=next(old);
 modified.legacyStockBasis={...basis(),costJournalId:'malicious'};
 const plan=verifyInvoiceRevisionBaseline({invoice:old,
  proposed:next(old),journals:journals(),movements:[]});
 const result=buildVerifiedInvoiceRevisionBundle({
  invoice:old,proposed:modified,invoiceVersion:2,plan,
  partyRecords:[{id:'cust-1',version:2,value:{id:'cust-1',balance:40}}],
  inventoryRecords:[{id:'leather-1',version:2,value:{id:'leather-1',
   stockQuantity:-2,purchasePrice:5,warehouseStocks:{main:-2}}}],
  registeredWarehouseCount:1,singleWarehouseId:'main',
  singleWarehouseName:'main',commandId:'unit-reconstruct-1',
  now:'2026-11-15T14:00:00.000Z'
 });
 assert.deepEqual(result.changes.find(c=>c.entity==='invoices').value.legacyStockBasis,basis());
 assert.equal(result.changes.filter(c=>c.entity==='stockMovements').length,1);
});
