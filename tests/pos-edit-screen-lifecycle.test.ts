import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const posSource=readFileSync(new URL('../src/components/PosView.tsx', import.meta.url),'utf8');
const saveStart=posSource.indexOf('  const handleSaveInvoice = async (');
const saveEnd=posSource.indexOf('  const handleQuickPayCash = ',saveStart);
assert.ok(saveStart>0&&saveEnd>saveStart);
const saveHandler=posSource.slice(saveStart,saveEnd);

test('a confirmed cashier invoice edit closes the previous invoice and opens a blank one',()=>{
 const receiptVerified=saveHandler.indexOf('verifyPosEditReceipt(');
 const confirmationFinished=saveHandler.indexOf('    posSound.success();');
 const editClose=saveHandler.indexOf('    if (editingId) {',confirmationFinished);
 const editIdentityClear=saveHandler.indexOf('currentEditingInvoiceIdRef.current = null;',editClose);
 const signatureClear=saveHandler.indexOf('openedInvoiceSignatureRef.current = null;',editClose);
 const stateClear=saveHandler.indexOf('setEditingPosInvoiceId(null);',editClose);
 const blankLine=saveHandler.indexOf('setTableLines([',stateClear);
 assert.ok(receiptVerified>0&&confirmationFinished>receiptVerified,'Do not clear before durably saved notes');
 assert.ok(editClose>confirmationFinished,'Only close the edited invoice after approved save');
 assert.ok(editIdentityClear>editClose&&editIdentityClear<blankLine,'Clear edit ref before blank invoice');
 assert.ok(signatureClear>editClose&&signatureClear<blankLine,'Forget the old invoice fingerprint');
 assert.ok(stateClear>editClose&&stateClear<blankLine,'Reset editing mode before rendering new line');
 assert.ok(blankLine>stateClear,'New form appears after closing old invoice');
 assert.ok(saveHandler.includes("setInvoiceNotes('');"));
 assert.ok(saveHandler.includes("setPaymentNotes('');"));
 assert.ok(saveHandler.includes("setInvoiceSeqNumber('');"));
 assert.ok(saveHandler.includes("setPaymentMethod('cash');"));
 assert.ok(saveHandler.includes("setInvoiceWorkflowStatus('new');"));
});
test('save captures the original editing invoice id before awaiting PostgreSQL',()=>{
 const captured=saveHandler.indexOf('const intendedEditingInvoiceId=');
 const awaited=saveHandler.indexOf('postRes = await postPosSaleOnline(');
 assert.ok(captured>0&&captured<awaited);
 assert.ok(saveHandler.includes('editingInvoiceId: intendedEditingInvoiceId || undefined'));
 assert.ok(saveHandler.includes('const editingId=intendedEditingInvoiceId;'));
});
test('approved new sales and verified amendments both reset; failed and partial saves keep the form',()=>{
 assert.ok(saveHandler.includes('// Applies to both a confirmed edit and a newly approved POS sale.'));
 assert.ok(saveHandler.includes('if (!editingId && posTargetType'),'Do not add an extra walk-in customer during editing');
 assert.ok(saveHandler.includes('verifyPosEditReceipt('),'Posted invoices must verify locally saved notes before reset');
 const failure=saveHandler.indexOf('if (!postRes.success || !postRes.invoice)');
 const verified=saveHandler.indexOf('verifyPosEditReceipt(');
 const reset=saveHandler.indexOf('setTableLines([',verified);
 assert.ok(failure>0&&failure<reset,'Rejected invoice stops before the reset');
 assert.ok(verified>failure&&verified<reset,'Mismatching receipt stops before reset');
 assert.ok(saveHandler.includes('if(mismatch){'));
 assert.ok(saveHandler.includes('return;',saveHandler.indexOf('if(mismatch){')));
});
test('service-worker upgrades cannot silently interrupt unsaved cashier edits',()=>{
 const vite=readFileSync(new URL('../vite.config.ts', import.meta.url),'utf8');
 assert.ok(vite.includes("registerType: 'prompt'"));
 assert.ok(vite.includes('skipWaiting: false'));
 assert.ok(vite.includes('clientsClaim: false'));
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.ok(app.includes('const applyBuildUpdateManually = async () => {'));
 assert.ok(app.includes('if (!mayApplyBuildUpdate) return;'));
});
