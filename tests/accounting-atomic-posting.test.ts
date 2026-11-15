import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtomicPosting } from '../src/sync-next/accountingPosting';

const input = () => ({
  documentEntity:'purchases' as const,
  documentId:'purchase-1',
  document:{totalAmount:100},
  journalId:'journal-1',
  journalDate:'2026-11-15',
  currency:'ILS',
  lines:[
    {accountId:'1301',debitMinor:10000,creditMinor:0},
    {accountId:'2101',debitMinor:0,creditMinor:10000}
  ],
  movements:[] as Array<{entity:'stockMovements'|'journalEntries';id:string;value:Record<string,unknown>}>
});

test('builds linked document and balanced journal',()=>{
  const changes=buildAtomicPosting(input());
  assert.equal(changes.length,2);
  assert.equal(changes[0].id,'purchase-1');
  assert.equal(changes[1].id,'journal-1');
});

test('rejects zero-value journal lines',()=>{
  const data=input();
  data.lines[0]={accountId:'1301',debitMinor:0,creditMinor:0};
  assert.throws(()=>buildAtomicPosting(data),/Invalid journal amount/);
});

test('rejects movement that overwrites the generated journal',()=>{
  const data=input();
  data.movements.push({entity:'journalEntries',id:'journal-1',value:{}});
  assert.throws(()=>buildAtomicPosting(data),/Duplicate record in atomic posting/);
});

test('rejects duplicate stock movement IDs',()=>{
  const data=input();
  data.movements.push(
    {entity:'stockMovements',id:'move-1',value:{}},
    {entity:'stockMovements',id:'move-1',value:{}}
  );
  assert.throws(()=>buildAtomicPosting(data),/Duplicate record in atomic posting/);
});
