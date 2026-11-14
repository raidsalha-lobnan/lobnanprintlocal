import test from 'node:test';
import assert from 'node:assert/strict';
import {forbidRetiredLegacyPrintResurrection as check} from '../retired-legacy-print-guard.mjs';

const retiredIds=new Set(['journalEntries:je-old-1','printOrders:job-old-1','journalEntries:source:inv-demo-missing']);
const client={async query(query,args){
 assert.match(query,/sync_retired_legacy_records/);
 return {rows:retiredIds.has(args[1]+':'+args[2])||retiredIds.has(args[1]+':'+args[3])?[{exists:1}]:[]};
}};

test('old printing journal sources cannot be recreated with new IDs',async()=>{
 for(const referenceType of ['print_order','print_order_void_reversal']){
  await assert.rejects(()=>check(client,'lobnan_main',{
   entity:'journalEntries',id:'newly-recreated',value:{referenceType}
  }),/RETIRED_FAKE_PRINT_JOURNAL_FORBIDDEN/);
 }
});
test('original and void journal IDs cannot be resurrected under another source',async()=>{
 await assert.rejects(()=>check(client,'lobnan_main',{
  entity:'journalEntries',id:'je-old-1',value:{referenceType:'manual'}
 }),/RETIRED_LEGACY_PRINT_RECORD_CANNOT_RESURRECT/);
});
test('retired print-order records cannot be revived by offline devices',async()=>{
 await assert.rejects(()=>check(client,'lobnan_main',{
  entity:'printOrders',id:'job-old-1',value:{id:'job-old-1'}
 }),/RETIRED_LEGACY_PRINT_RECORD_CANNOT_RESURRECT/);
});
test('new valid nonfinancial print orders and invoice journals remain available',async()=>{
 await assert.doesNotReject(()=>check(client,'lobnan_main',{
  entity:'printOrders',id:'job-mini-new-1',value:{id:'job-mini-new-1'}
 }));
 await assert.doesNotReject(()=>check(client,'lobnan_main',{
  entity:'journalEntries',id:'je-sales-new',value:{referenceType:'pos_invoice'}
 }));
 await assert.doesNotReject(()=>check(client,'lobnan_main',{
  entity:'invoices',id:'inv-new',value:{}
 }));
});

test('new fake journal IDs cannot resurrect a retired sale source',async()=>{
 await assert.rejects(()=>check(client,'lobnan_main',{
  entity:'journalEntries',id:'new-random-journal',value:{referenceType:'pos_invoice',referenceId:'inv-demo-missing'}
 }),/RETIRED_LEGACY_PRINT_RECORD_CANNOT_RESURRECT/);
});
