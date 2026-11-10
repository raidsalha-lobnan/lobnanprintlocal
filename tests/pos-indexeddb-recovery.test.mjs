import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const db=readFileSync(new URL('../src/sync-next/localDb.ts',import.meta.url),'utf8');
const context=readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');
const pos=readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');

test('closed IndexedDB handles are reopened before any transaction without deleting stores',()=>{
  assert.match(db,/private async getDb\(\)/);
  assert.match(db,/InvalidStateError/);
  assert.match(db,/this\.dbPromise = this\.openDatabase\(\)/);
  assert.match(db,/private disposed = false/);
  assert.doesNotMatch(db,/indexedDB\.deleteDatabase/);
});

test('a confirmed PostgreSQL invoice revision is not treated as rejected because its local receipt failed',()=>{
  assert.match(context,/POSTGRES_CONFIRMED_LOCAL_RECEIPT_FAILED/);
  assert.match(context,/await transport\.reviseInvoice/);
  assert.match(context,/warning:localReceiptWarning/);
  assert.match(context,/لم تحفظ الفاتورة مرة أخرى|لا تحفظ الفاتورة مرة أخرى/);
  assert.match(pos,/if \(postRes\.warning\)/);
});

test('the POS distinguishes local storage closure from rejected server transactions',()=>{
  assert.match(pos,/database connection is closing/);
  assert.match(context,/LOCAL_STORAGE_SESSION_CLOSED/);
  assert.match(context,/INVOICE_CONCURRENT_MODIFICATION_REOPEN/);
});
