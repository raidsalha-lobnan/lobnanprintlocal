import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBusinessStockMovements,committedStockBalance} from '../src/utils/stockMovementProjection';

test('business statement shows final committed 14 without internal 12→14 transition',()=>{
 const records=[
  {id:'sale',itemId:'sku1',type:'out_sale',quantity:1,sourceInvoiceId:'inv1'},
  {id:'correction-credit',itemId:'sku1',type:'in_adjustment',quantity:2,
   sourceInvoiceId:'inv1',internalCorrection:true,correctionGroupId:'revision-2',approvedRevision:true},
  {id:'correction-debit',itemId:'sku1',type:'out_adjustment',quantity:0,
   sourceInvoiceId:'inv1',internalCorrection:true,correctionGroupId:'revision-2',approvedRevision:true},
  {id:'purchase',itemId:'sku1',type:'in_purchase',quantity:10}
 ];
 const shown=projectBusinessStockMovements(records);
 assert.deepEqual(shown.map(x=>x.id),['sale','purchase']);
 assert.equal(committedStockBalance(14),14);
 assert.equal(records.length,4,'underlying audit trail stays intact');
});
test('never hide legacy movements or unapproved corrections',()=>{
 const rows=[
  {id:'legacy',itemId:'sku',type:'in_adjustment',quantity:2},
  {id:'unapproved',itemId:'sku',type:'in_adjustment',quantity:2,
   internalCorrection:true,correctionGroupId:'unapproved-group',sourceInvoiceId:'inv',approvedRevision:false}
 ];
 assert.deepEqual(projectBusinessStockMovements(rows),rows);
});
