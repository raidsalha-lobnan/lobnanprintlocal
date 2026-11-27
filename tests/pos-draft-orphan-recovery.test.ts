import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findRecoverableCashierDrafts,discardRecoverableCashierDraft} from '../src/utils/posDraftRecovery';

function storage(rows: Record<string, string>): Pick<Storage,'length'|'key'|'getItem'> {
  const keys = Object.keys(rows);
  return {
    length: keys.length,
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) => rows[key] ?? null
  };
}
const makeDraft = (ownerId: string, draftId: string, itemName: string, timestamp: number) =>
  JSON.stringify({ownerId,draftId,timestamp,
    tableLines: [{id:'line-1',itemName,notes:'',unitPrice:12}]});

test('cashier can discover an unsent draft when reopening with a fresh tab slot', () => {
  const rows = {
    'pos_active_full_draft:worker-1:old-tab': makeDraft('worker-1','draft-old','طباعة بنر',20),
    'pos_active_full_draft:worker-1:current': makeDraft('worker-1','draft-current','فاتورة حالية',30),
    'pos_active_full_draft:worker-2:other': makeDraft('worker-2','draft-other','خاص',40),
    'pos_active_full_draft:worker-1:empty': makeDraft('worker-1','draft-empty','',10)
  };
  const recovered = findRecoverableCashierDrafts(storage(rows),'worker-1',
    'pos_active_full_draft:worker-1:current','draft-current');
  assert.deepEqual(recovered.map(x=>x.draftId),['draft-old']);
  assert.equal(recovered[0].itemPreview,'طباعة بنر');
});

test('recovery never uses an old edit or pending invoice as an automatic cloud write', () => {
  const source = readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');
  const recovery = source.slice(source.indexOf('{recoverableDrafts.length > 0'),
    source.indexOf('{draftStorageFailed &&'));
  assert.match(recovery,/window\.confirm/);
  assert.match(recovery,/localStorage\.setItem\(POS_FULL_DRAFT_KEY, candidate\.raw\)/);
  assert.doesNotMatch(recovery,/postPosSaleOnline|repo\.commit|enqueueAtomicInvoicePosting/);
});

test('starting a new invoice cannot abandon the active form during a local save', () => {
  const source = readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');
  const action = source.slice(source.indexOf('  const handleStartNewInvoice = () => {'),
    source.indexOf('  // Clear / Void Invoice'));
  const lock = action.indexOf('if (posSaveUiInFlightRef.current)');
  const confirm = action.indexOf('window.confirm');
  const reset = action.indexOf('handleClearInvoiceDirect(true)');
  assert.ok(lock >= 0 && confirm > lock && reset > confirm);
});

test('new offline sale confirms a durable outbox or acknowledged record before returning success', () => {
  const context = readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');
  const begin = context.indexOf('  const postPosSaleOnlineCore = async');
  const end = context.indexOf('  const postPosSaleOnline = async', begin);
  const sale = context.slice(begin,end);
  const queued = sale.indexOf('const savedCommandId = await enqueueAtomicInvoicePosting(repo,posting)');
  const proof = sale.indexOf("throw new Error('LOCAL_INVOICE_SAVE_RECEIPT_MISSING')");
  const success = sale.indexOf('return {success:true,invoice,isOffline:',queued);
  assert.ok(queued >= 0 && proof > queued && success > proof);
  assert.match(sale,/confirmedInvoice\(invoiceId\)/);
  assert.match(sale,/getLocalDb\(\)\.pending\(\)/);
});

test('explicit discard removes only the selected unchanged recovery copy', () => {
  const active='pos_active_full_draft:worker-1:current';
  const old='pos_active_full_draft:worker-1:old';
  const other='pos_active_full_draft:worker-2:other';
  const rows:Record<string,string>={
    [active]:makeDraft('worker-1','draft-current','active',30),
    [old]:makeDraft('worker-1','draft-old','old',20),
    [other]:makeDraft('worker-2','draft-other','other',40),
    'pos_held_private_cache_v1_worker-1':'held',
    'lobnan_pending_atomic_pos_attempt:draft-old':'pending'
  };
  const store={get length(){return Object.keys(rows).length;},
    key:(i:number)=>Object.keys(rows)[i]??null,
    getItem:(k:string)=>rows[k]??null,removeItem:(k:string)=>{delete rows[k];}};
  const [candidate]=findRecoverableCashierDrafts(store,'worker-1',active,'draft-current');
  const original=rows[old];
  rows[old]=makeDraft('worker-1','draft-old','changed in another tab',50);
  assert.equal(discardRecoverableCashierDraft(store,'worker-1',active,'draft-current',candidate),false);
  rows[old]=original;
  assert.equal(discardRecoverableCashierDraft(store,'worker-2',active,'draft-current',candidate),false);
  assert.equal(discardRecoverableCashierDraft(store,'worker-1',old,'draft-current',candidate),false);
  assert.equal(discardRecoverableCashierDraft(store,'worker-1',active,'draft-current',candidate),true);
  assert.equal(store.getItem(old),null);
  assert.ok(rows[active]&&rows[other]);
  assert.equal(rows['pos_held_private_cache_v1_worker-1'],'held');
  assert.equal(rows['lobnan_pending_atomic_pos_attempt:draft-old'],'pending');
  assert.deepEqual(findRecoverableCashierDrafts(store,'worker-1',active,'draft-current'),[]);
});
