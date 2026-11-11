import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLegacyReviewDraft} from '../legacy-invoice-case-review.mjs';

const row={
 invoiceNumber:'INV-0035',recordId:'inv-0035',version:2,
 customerId:'party-35',customerName:'Test customer',
 amount:155,remaining:155,paid:0,invoiceDate:'2026-11-03',
 partyBalance:155,partyInvoiceSum:155,
 counterpartyExists:true,partyBalanceMatchesInvoiceSum:true,
 linkedJournalCount:0,otherPartyFinancialDocs:0,
 invoiceAmountMatchesLines:true,itemAmountsValid:true,invoiceItemCodesValid:true,
 invoiceItems:[
  {id:'item-5',code:'PRI-00005',name:'Poster',qty:5,unitPrice:25,total:125,storedItemIdValid:true,itemCodeIdentityValid:true},
  {id:'item-2',code:'PRI-00002',name:'Board',qty:10,unitPrice:3,total:30,storedItemIdValid:true,itemCodeIdentityValid:true}
 ],
 stockRecords:[{id:'movement-legacy',date:'2026-11-01',itemId:'item-5',explicitOwner:null}]
};
const audit={workspace:'lobnan_main',readOnly:true,pending:[row]};
const register={accountingWritesEnabled:false,cases:[
 {invoiceId:'inv-0035',invoiceNumber:'INV-0035',serverVersion:2,correctionApplied:false,operatorDecision:null}
]};
test('draft retains immutable source IDs, amounts and unverified stock warning',()=>{
 const draft=buildLegacyReviewDraft(audit,register,'35');
 assert.equal(draft.invoiceNumber,'INV-0035');
 assert.equal(draft.evidence.currentTotal,155);
 assert.deepEqual(draft.evidence.originalLines.map(x=>x.itemId),['item-5','item-2']);
 assert.equal(draft.flags.partyBalanceMatchesOpenInvoices,true);
 assert.equal(draft.flags.legacyStockOwnershipUnverified,true);
 assert.equal(draft.financialChangesPerformed,false);
 assert.equal(draft.accountingWritesEnabled,false);
});
test('no audit may manufacture approved state or accept tampered totals',()=>{
 assert.throws(()=>buildLegacyReviewDraft(audit,{...register,accountingWritesEnabled:true},'35'),/UNTRUSTED/);
 assert.throws(()=>buildLegacyReviewDraft(audit,{...register,cases:[{...register.cases[0],operatorDecision:{approvedTotal:155}}]},'35'),/UNAPPROVED/);
 assert.throws(()=>buildLegacyReviewDraft({...audit,pending:[{...row,amount:150}]},register,'35'),/INVOICE_TOTAL/);
 assert.throws(()=>buildLegacyReviewDraft(audit,{...register,cases:[{...register.cases[0],serverVersion:3}]},'35'),/UNAPPROVED/);
});
