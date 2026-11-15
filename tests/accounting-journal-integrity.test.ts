import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJournal } from '../local-server/sync-domain.mjs';

const balanced = (debit,credit) => ({
  lines:[
    {accountCode:'1201',debit,credit:0,debitMinor:Math.round(debit*100),creditMinor:0},
    {accountCode:'4101',debit:0,credit, debitMinor:0,creditMinor:Math.round(credit*100)}
  ]
});

test('accepts balanced journal with matching decimal and minor-unit amounts',()=>{
  assert.doesNotThrow(()=>validateJournal(balanced(58,58)));
});

test('rejects journal whose displayed debit disagrees with minor-unit debit',()=>{
  const journal=balanced(58,58);
  journal.lines[0].debitMinor=5700;
  assert.throws(()=>validateJournal(journal),{message:'JOURNAL_MINOR_AMOUNT_MISMATCH'});
});

test('rejects journal whose displayed credit disagrees with minor-unit credit',()=>{
  const journal=balanced(58,58);
  journal.lines[1].creditMinor=5900;
  assert.throws(()=>validateJournal(journal),{message:'JOURNAL_MINOR_AMOUNT_MISMATCH'});
});

test('rejects a non-cent decimal even when minor-unit field is valid',()=>{
  const journal=balanced(58,58);
  journal.lines[0].debit=58.001;
  assert.throws(()=>validateJournal(journal),{message:'INVALID_MONEY_PRECISION'});
});

test('continues to accept balanced legacy journals without minor-unit fields',()=>{
  assert.doesNotThrow(()=>validateJournal({lines:[
    {accountCode:'1201',debit:10,credit:0},
    {accountCode:'4101',debit:0,credit:10}
  ]}));
});
