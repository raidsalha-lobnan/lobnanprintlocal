import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('cashier holds persist as private PostgreSQL data, not financial postings',()=>{
 const schema=src('local-server/schema.sql');
 const helper=src('local-server/held-pos-invoices.mjs');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS sync_pos_held_invoices/);
 assert.match(schema,/owner_user_id text NOT NULL/);
 assert.match(schema,/body jsonb NOT NULL/);
 assert.doesNotMatch(helper,/sync_records|sync_events|journalEntries|stockMovements/);
});
test('all held list/save/delete operations are scoped to the logged-in owner',()=>{
 const server=src('local-server/server.mjs');
 const helper=src('local-server/held-pos-invoices.mjs');
 assert.match(server,/HELD_INVOICE_PERMISSION_DENIED/);
 assert.match(helper,/owner_user_id=\$2 AND kind=\$3/);
 assert.match(helper,/WHERE sync_pos_held_invoices.owner_user_id=EXCLUDED.owner_user_id/);
 assert.match(helper,/owner_user_id=\$2 AND hold_id=\$3/);
});
test('desktop suspension never clears cashier before PostgreSQL acknowledgement',()=>{
 const pos=src('src/components/PosView.tsx');
 const part=pos.slice(pos.indexOf('const handleHoldInvoice = async'),pos.indexOf('// Resuming leaves the PostgreSQL snapshot intact'));
 assert.ok(part.includes("await saveCentralHeldInvoice('desktop',confirmedHeld)"));
 assert.ok(part.indexOf('handleClearInvoiceDirect(true)')>
           part.indexOf("await saveCentralHeldInvoice('desktop',confirmedHeld)"));
 assert.match(part,/fullDraft:\{/);
});
test('desktop resumption restores details without deleting the held snapshot',()=>{
 const pos=src('src/components/PosView.tsx');
 const part=pos.slice(pos.indexOf('const handleResumeHeldInvoice='),pos.indexOf('const handleDeleteHeldInvoice='));
 for(const key of ['setTableLines','setInvoiceNotes','setPaymentNotes','setInvoiceDate','setCashAmountInput','setBankAmountInput']){
  assert.ok(part.includes(key),key);
 }
 assert.doesNotMatch(part,/deleteCentralHeldInvoice/);
});
test('mobile suspension and resumption use same PostgreSQL API without premature clearing',()=>{
 const mobile=src('src/components/pos/MobilePosView.tsx');
 const part=mobile.slice(mobile.indexOf('const handleHoldInvoice = async'),mobile.indexOf('const handleResumeHeldInvoice'));
 assert.ok(part.indexOf("await saveCentralHeldInvoice('mobile',confirmedHeld)")>=0);
 assert.ok(part.indexOf('setCart([])')>part.indexOf("await saveCentralHeldInvoice('mobile',confirmedHeld)"));
 const resume=mobile.slice(mobile.indexOf('const handleResumeHeldInvoice'),mobile.indexOf('const handleDeleteHeldInvoice'));
 assert.doesNotMatch(resume,/deleteCentralHeldInvoice|setHeldInvoices\(prev=>prev\.filter/);
});

test('a failed central suspension is still recoverable locally without clearing the cashier',()=>{
 const pos=src('src/components/PosView.tsx');
 const mobile=src('src/components/pos/MobilePosView.tsx');
 for(const component of [pos,mobile]){
  const section=component.slice(component.indexOf('const handleHoldInvoice = async'),component.indexOf('const handleResumeHeldInvoice'));
  assert.match(section,/await checkpointLocalHeld\(heldCacheKey,pendingHeld\)/);
  assert.match(section,/localBackupSaved/);
  assert.match(section,/localOnly:true/);
  assert.match(section,/if\(localBackupSaved\)setHeldInvoices/);
  assert.match(section,/saveCentralHeldInvoice/);
 }
});

test('held restoration protects stored prices and dimensions before any state hydration',()=>{
 const desktop=src('src/components/PosView.tsx');
 const mobile=src('src/components/pos/MobilePosView.tsx');
 const d=desktop.slice(desktop.indexOf('const handleResumeHeldInvoice='),desktop.indexOf('const handleDeleteHeldInvoice='));
 const m=mobile.slice(mobile.indexOf('const handleResumeHeldInvoice'),mobile.indexOf('const handleDeleteHeldInvoice'));
 assert.ok(d.indexOf('resumedHeldInvoiceIdRef.current=held.id')<d.indexOf('setTableLines(structuredClone(held.lines))'));
 assert.ok(m.indexOf('resumedMobileHeldIdRef.current=held.id')<m.indexOf('setCart(structuredClone(held.cart))'));
 assert.match(desktop,/if \(resumedHeldInvoiceIdRef.current \|\| isInvoiceLoadingRef.current/);
 assert.match(mobile,/if\(resumedMobileHeldIdRef.current\)\{prevMobileCustIdRef.current=selectedCustomerId;return;\}/);
 assert.match(desktop,/resumedHeldId:resumedHeldInvoiceIdRef.current/);
 assert.match(mobile,/resumedHeldId:resumedMobileHeldIdRef.current/);
 assert.match(d,/previousCurrency.current=restoredCurrency/);
});
test('hold save checks the entire persisted JSON body, not only the id',()=>{
 const service=src('src/services/heldPosInvoices.ts');
 assert.match(service,/listCentralHeldInvoices<T>\(kind\)/);
 assert.match(service,/heldSnapshotsMatch\(snapshot,stored\)/);
 assert.match(service,/HELD_INVOICE_SNAPSHOT_MISMATCH/);
});
