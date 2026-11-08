import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBusinessStockMovements,committedStockBalance} from '../src/utils/stockMovementProjection';

test('approved revision consolidates original sale into final effective quantity',()=>{
 const invoices=[{id:'inv66',date:'2026-11-04',invoiceNumber:'INV-0066'}];
 const rows=[
  {id:'sale-paper',itemId:'paper',type:'out_sale',quantity:132,
    referenceNumber:'INV-0066',date:'2026-11-04',unitPrice:1,balanceAfter:307},
  {id:'legacy-other',itemId:'paper',type:'out_sale',quantity:1,
    referenceNumber:'INV-0066',date:'2026-11-01',unitPrice:1,balanceAfter:0},
  {id:'internal-credit',itemId:'paper',type:'in_adjustment',quantity:130,
   sourceInvoiceId:'inv66',correctionGroupId:'revision66',internalCorrection:true,
   approvedRevision:true,balanceAfter:569}
 ];
 const visible=projectBusinessStockMovements(rows,invoices);
 assert.deepEqual(visible.map(x=>x.id),['sale-paper','legacy-other']);
 assert.equal(visible[0].quantity,2);
 assert.equal(visible[0].totalValue,2);
 assert.equal(visible[0].balanceAfter,569);
 assert.equal(committedStockBalance(569),569);
 assert.equal(rows[0].quantity,132,'audit source is never mutated');
});
test('unknown invoice and ambiguous original sales stay visible for review',()=>{
 const invoices=[{id:'inv66',date:'2026-11-04',invoiceNumber:'INV-0066'}];
 const correction={id:'correction',itemId:'paper',type:'in_adjustment',quantity:10,
  sourceInvoiceId:'inv66',correctionGroupId:'r',internalCorrection:true,approvedRevision:true};
 const rows=[
  {id:'a',itemId:'paper',type:'out_sale',quantity:15,
   referenceNumber:'INV-0066',date:'2026-11-04'},
  {id:'b',itemId:'paper',type:'out_sale',quantity:5,
   referenceNumber:'INV-0066',date:'2026-11-04'},
  correction
 ];
 assert.deepEqual(projectBusinessStockMovements(rows,invoices),rows);
 assert.deepEqual(projectBusinessStockMovements([correction],[]),[correction]);
});
test('legacy and unapproved adjustment entries remain visible without a verified revision',()=>{
 const rows=[
  {id:'old',itemId:'sku',type:'in_adjustment',quantity:2},
  {id:'unapproved',itemId:'sku',type:'in_adjustment',quantity:2,
    internalCorrection:true,sourceInvoiceId:'inv',correctionGroupId:'r',approvedRevision:false}
 ];
 assert.deepEqual(projectBusinessStockMovements(rows,[]),rows);
});
