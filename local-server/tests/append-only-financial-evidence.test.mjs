import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAppendOnlyAccountingEvidence} from '../append-only-financial-evidence.mjs';
import {InputError} from '../sync-domain.mjs';

const originalJournal={id:'journal-1',referenceType:'pos_invoice',
  referenceId:'invoice-1',date:'2026-11-12',
  lines:[{accountCode:'1201',debit:15,credit:0},{accountCode:'4101',debit:0,credit:15}]};
const originalStock={id:'stock-1',type:'out_sale',itemId:'item-1',
  referenceType:'pos_invoice',referenceNumber:'INV-0001',quantity:1,
  totalValue:8,balanceAfter:0};

function denied(entity,previous,proposed){
  assert.throws(()=>assertAppendOnlyAccountingEvidence(entity,previous,proposed,'stable-id'),
    e=>e instanceof InputError&&e.message==='POSTED_ACCOUNTING_EVIDENCE_IMMUTABLE'&&
      e.status===409&&e.detail.entity===entity);
}
test('no modification is allowed to an existing POS journal, even with a new command ID',()=>{
  denied('journalEntries',originalJournal,{...originalJournal,lines:[
    {accountCode:'1201',debit:150,credit:0},{accountCode:'4101',debit:0,credit:150}
  ]});
});
test('prevents editing or deleting already committed COGS and correction evidence',()=>{
  denied('journalEntries',{...originalJournal,referenceType:'cogs'},
    {...originalJournal,referenceType:'invoice_correction'});
  denied('journalEntries',originalJournal,null);
});
test('prevents inflating stock quantities or reassigning past stock movements',()=>{
  denied('stockMovements',originalStock,{...originalStock,quantity:20});
  denied('stockMovements',originalStock,{...originalStock,referenceNumber:'INV-9999'});
});
test('identical replay does not create a false financial conflict',()=>{
  const differentKeyOrder={lines:originalJournal.lines,
    referenceId:'invoice-1',date:'2026-11-12',id:'journal-1',referenceType:'pos_invoice'};
  assert.equal(assertAppendOnlyAccountingEvidence('journalEntries',originalJournal,differentKeyOrder,'journal-1'),undefined);
  assert.equal(assertAppendOnlyAccountingEvidence('stockMovements',originalStock,{...originalStock},'stock-1'),undefined);
});
test('new correction and unrelated ordinary records stay allowed',()=>{
  assert.equal(assertAppendOnlyAccountingEvidence('journalEntries',null,originalJournal,'new-id'),undefined);
  assert.equal(assertAppendOnlyAccountingEvidence('stockMovements',undefined,originalStock,'new-id'),undefined);
  assert.equal(assertAppendOnlyAccountingEvidence('parties',{name:'Old'},{name:'New'},'party'),undefined);
});
