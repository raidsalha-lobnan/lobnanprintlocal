import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCommand,validateJournal,InputError,fingerprint,makeNumber,makeCursor} from '../sync-domain.mjs';
const change=(entity,id,value,expectedVersion=0)=>({entity,id,value,expectedVersion});
const cmd=(changes,id='cmd-test-0001')=>({id,workspaceId:'lobnan_main',changes});
test('accepts new invoice with temporary number',()=>assert.doesNotThrow(()=>validateCommand(cmd([change('invoices','invoice-1',{id:'invoice-1',invoiceNumber:'TEMP-invoice-1'})]),'lobnan_main')));
test('rejects manually assigned official numbers',()=>assert.throws(()=>validateCommand(cmd([change('invoices','invoice-1',{id:'invoice-1',invoiceNumber:'INV-0063'})]),'lobnan_main'),/NEW_INVOICE_REQUIRES_TEMP_NUMBER/));
test('rejects duplicate record changes',()=>assert.throws(()=>validateCommand(cmd([change('parties','p',{id:'p'}),change('parties','p',{id:'p'})]),'lobnan_main'),/DUPLICATE_RECORD/));
test('valid balanced journal in minor units',()=>assert.doesNotThrow(()=>validateJournal({lines:[{accountCode:'1101',debit:50,credit:0},{accountCode:'4101',debit:0,credit:50}]})));
test('rejects journal imbalance',()=>assert.throws(()=>validateJournal({lines:[{accountCode:'1101',debit:50,credit:0},{accountCode:'4101',debit:0,credit:49.99}]}),/UNBALANCED_JOURNAL/));
test('rejects excessive precision',()=>assert.throws(()=>validateJournal({lines:[{accountCode:'1101',debit:50.001,credit:0},{accountCode:'4101',debit:0,credit:50.001}]}),/INVALID_MONEY_PRECISION/));
test('fingerprint matches identical commands',()=>{
  assert.equal(fingerprint(cmd([change('parties','1',{id:'1',name:'A'})])),fingerprint(cmd([change('parties','1',{id:'1',name:'A'})])));
  assert.notEqual(fingerprint(cmd([change('parties','1',{id:'1',name:'A'})])),fingerprint(cmd([change('parties','1',{id:'1',name:'B'})])));
});
test('official number formatting and cursor',()=>{
  assert.equal(makeNumber(63),'INV-0063');
  assert.deepEqual(makeCursor(123),{sequence:123,seconds:0,nanoseconds:0,eventId:'123'});
});
test('rejects invalid workspace',()=>assert.throws(()=>validateCommand(cmd([change('parties','a',{id:'a'})]),'other-workspace'),/INVALID_COMMAND/));
