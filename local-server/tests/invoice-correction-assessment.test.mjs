import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessInvoiceCorrection} from '../invoice-correction-assessment.mjs';
const invoice={id:'i1',invoiceNumber:'INV-0071',isOfficial:true,
 paymentMethod:'credit',paidAmount:0,customerId:'p1',totalAmount:180,
 items:[{itemId:'sku1',quantity:45,unitPrice:4,total:180}]};
const proposed={...invoice,totalAmount:8,items:[{...invoice.items[0],quantity:2,total:8}]};
const j=(id,type,debit)=>({id,referenceType:type,
 lines:[{accountCode:type==='cogs'?'5101':'1201',debit,credit:0},
 {accountCode:type==='cogs'?'1301':'4101',debit:0,credit:debit}]});
const sourceJournals=[j('j1','pos_invoice',180),j('j2','cogs',90),
 j('j3','pos_invoice',8),j('j4','cogs',4)];
const stockMovements=[{id:'s1',type:'out_sale',quantity:45,itemId:'sku1',unitPrice:2},
 {id:'s2',type:'out_sale',quantity:2,itemId:'sku1',unitPrice:2}];
const params={invoice,proposed,sourceJournals,stockMovements,party:{id:'p1'}};
test('published correction assessment identifies original and new postings without writing',()=>{
 const plan=assessInvoiceCorrection(params);
 assert.equal(plan.ready,true);
 assert.equal(plan.revenueReversal,180);
 assert.equal(plan.cogsReversal,90);
 assert.equal(plan.stockReturnQuantity,45);
 assert.equal(plan.customerBalanceDelta,-172);
 assert.deepEqual(plan.preservedEntryIds,['j3','j4']);
});
test('missing, duplicate, or changed financial evidence fails closed',()=>{
 for(const variant of [
  {...params,sourceJournals:sourceJournals.slice(0,3)},
  {...params,sourceJournals:[...sourceJournals,sourceJournals[0]]},
  {...params,stockMovements:stockMovements.slice(1)},
  {...params,proposed:{...proposed,id:'other'}},
  {...params,proposed:{...proposed,paidAmount:5}},
  {...params,proposed:{...proposed,items:[{...proposed.items[0],unitPrice:5}]}}
 ]){
  const result=assessInvoiceCorrection(variant);
  assert.equal(result.ready,false,JSON.stringify(result));
 }
});
