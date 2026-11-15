import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';

const proof=(kind,cost,physicalItemCount=1)=>({
 version:1,kind,totalCost:cost,physicalItemCount,
 source:'atomic_pos_stock_movements'
});
const sale=(cost=0,category='print_raw')=>{
 const id='sale-cost-proof',itemId='item-1',physical=category!=='services';
 const invoice={id,invoiceNumber:'INV-0400',isAccountingPosted:true,
  counterpartyType:'customer',customerId:'cust-1',exchangeRate:1,
  subtotal:20,discountTotal:0,taxAmount:0,additionalCharges:0,
  totalAmount:20,baseTotalAmount:20,basePaidAmount:0,remainingAmount:20,
  items:[{itemId,category,quantity:1,unitPrice:20,discount:0}],
  costPostingEvidence:proof(cost>0?'posted_cogs':
   physical?'verified_zero_cost':'non_stock_service',cost,physical?1:0)};
 const changes=[
  {entity:'invoices',id,expectedVersion:0,value:invoice},
  {entity:'journalEntries',id:'revenue-1',expectedVersion:0,value:{
   id:'revenue-1',referenceType:'pos_invoice',referenceId:id,
   lines:[{accountCode:'1201',debit:20,credit:0},
          {accountCode:'4101',debit:0,credit:20}]}},
  {entity:'parties',id:'cust-1',expectedVersion:1,value:{id:'cust-1',balance:20}}
 ];
 if(physical){
  changes.push({entity:'stockMovements',id:'stock-1',expectedVersion:0,
   value:{id:'stock-1',referenceType:'pos_invoice',sourceInvoiceId:id,
   referenceNumber:invoice.invoiceNumber,type:'out_sale',
   itemId,quantity:1,balanceBefore:2,balanceAfter:1,
   unitPrice:cost,totalValue:cost}});
  changes.push({entity:'inventory',id:itemId,expectedVersion:1,
   value:{id:itemId,stockQuantity:1}});
 }
 if(cost>0){
  changes.push({entity:'journalEntries',id:'cogs-1',expectedVersion:0,
   value:{id:'cogs-1',referenceType:'cogs',referenceId:id,
   lines:[{accountCode:'5101',debit:cost,credit:0},
          {accountCode:'1301',debit:0,credit:cost}]}});
 }
 return {atomicInvoiceId:id,changes};
};

test('cost-positive sale has evidence and exactly one original COGS journal',()=>{
 assert.equal(validateAtomicInvoicePosting(sale(4)),true);
});
test('physical zero-cost sale documents proven zero without fabricated zero journal',()=>{
 const s=sale(0);
 assert.equal(validateAtomicInvoicePosting(s),true);
 assert.equal(s.changes.filter(c=>c.entity==='journalEntries').length,1);
});
test('service-only sale records no physical cost and no stock transaction',()=>{
 const s=sale(0,'services');
 assert.equal(validateAtomicInvoicePosting(s),true);
 assert.equal(s.changes.filter(c=>c.entity==='stockMovements').length,0);
});
test('false zero-cost proof cannot be used to suppress positive COGS',()=>{
 const s=sale(4);
 s.changes[0].value.costPostingEvidence=proof('verified_zero_cost',0);
 assert.throws(()=>validateAtomicInvoicePosting(s),/ATOMIC_POSTING_COST_EVIDENCE_MISMATCH/);
});
test('omitted positive-cost COGS remains forbidden even with forged evidence',()=>{
 const s=sale(4);
 s.changes=s.changes.filter(c=>c.value?.referenceType!=='cogs');
 assert.throws(()=>validateAtomicInvoicePosting(s),/ATOMIC_POSTING_COST_JOURNAL_REQUIRED/);
});
test('physical zero-cost sale cannot claim to be service-only',()=>{
 const s=sale(0);
 s.changes[0].value.costPostingEvidence=proof('non_stock_service',0,0);
 assert.throws(()=>validateAtomicInvoicePosting(s),/ATOMIC_POSTING_COST_EVIDENCE_MISMATCH/);
});
