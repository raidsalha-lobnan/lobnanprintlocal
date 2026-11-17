import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dateForNewPosInvoice,isValidPosInvoiceDate,localPosToday} from '../src/utils/posInvoiceDate';

const today=new Date(2026,10,17,12,30,0);
test('fixed 15 Nov remains the next invoice date after a save on 17 Nov',()=>{
 const settings={isDateLocked:true,lockedDate:'2026-11-15'};
 assert.equal(dateForNewPosInvoice(settings,today),'2026-11-15');
 // Both an accepted new sale and an accepted amendment start a blank
 // invoice with this same setting.
 assert.equal(dateForNewPosInvoice(settings,new Date(2026,10,18)),'2026-11-15');
});

test('without a date pin, a new invoice uses the local computer calendar day',()=>{
 assert.equal(dateForNewPosInvoice({isDateLocked:false,lockedDate:'2026-11-15'},today),'2026-11-17');
 assert.equal(dateForNewPosInvoice({isDateLocked:false,lockedDate:''},today),'2026-11-17');
 assert.equal(dateForNewPosInvoice(undefined,today),'2026-11-17');
 assert.equal(localPosToday(today),'2026-11-17');
});

test('malformed saved dates cannot become invalid financial document dates',()=>{
 for(const invalid of ['2026-11-31','2026-02-29','17/11/2026','2026-13-15','']) {
  assert.equal(isValidPosInvoiceDate(invalid),false);
  assert.equal(dateForNewPosInvoice({isDateLocked:true,lockedDate:invalid},today),'2026-11-17');
 }
 assert.equal(isValidPosInvoiceDate('2024-02-29'),true);
});

test('saved pin applies to all new-POS pathways, not existing posted invoice loading',()=>{
 const pos=readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');
 const saveStart=pos.indexOf('const handleSaveInvoice = async');
 const saveEnd=pos.indexOf('handleSaveInvoiceRef.current = handleSaveInvoice;',saveStart);
 const afterSave=pos.slice(saveStart,saveEnd);
 assert.ok(afterSave.includes('setInvoiceDate(dateForNewPosInvoice(posLayoutConfig));'),
  'After a confirmed save, the next invoice must obey the pin');
 assert.ok(afterSave.includes('if (editingId) {'),
  'An edited invoice must be closed before the next blank one opens');
 const clearStart=pos.indexOf('const handleClearInvoiceDirect =');
 const clearEnd=pos.indexOf('// عند فتح شاشة الكاشير',clearStart);
 assert.ok(pos.slice(clearStart,clearEnd).includes('setInvoiceDate(dateForNewPosInvoice(posLayoutConfig));'),
  'Ctrl+N and navigator New must honor the pin');
 const loadStart=pos.indexOf('const loadInvoiceToScreen =');
 const loadEnd=pos.indexOf('// Handle Edit Mode from InvoicesView',loadStart);
 assert.ok(pos.slice(loadStart,loadEnd).includes('if (inv.date) setInvoiceDate(inv.date);'),
  'Existing invoices must keep their own recorded dates');
 assert.ok(pos.includes('const dateToLock = nextLocked ? (invoiceDate || localPosToday())'),
  'Pin captures the date written in the invoice, not today');
 assert.ok(pos.includes('if (!nextLocked && !currentEditingInvoiceIdRef.current && !editingPosInvoiceId)'),
  'Unpin must not silently rewrite the date of an existing invoice');
});
