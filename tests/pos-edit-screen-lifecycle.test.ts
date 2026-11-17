import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const posSource=readFileSync(new URL('../src/components/PosView.tsx', import.meta.url),'utf8');
const saveStart=posSource.indexOf('  const handleSaveInvoice = async (');
const saveEnd=posSource.indexOf('  handleSaveInvoiceRef.current = handleSaveInvoice;',saveStart);
assert.ok(saveStart>0&&saveEnd>saveStart);
const saveHandler=posSource.slice(saveStart,saveEnd);

test('an existing cashier invoice keeps the same editor after successful save',()=>{
 const guard=saveHandler.indexOf('if(editingId){');
 const refresh=saveHandler.indexOf('openedInvoiceSignatureRef.current=invoiceEditSignature(savedInvoice);',guard);
 const retainedIdentity=saveHandler.indexOf('currentEditingInvoiceIdRef.current=savedInvoice.id;',guard);
 const stop=saveHandler.indexOf('      return;',refresh);
 const reset=saveHandler.indexOf("setTableLines([",guard);
 assert.ok(guard>0,'Approved edit guard required');
 assert.ok(retainedIdentity>guard&&retainedIdentity<stop,'Retain original edit identity');
 assert.ok(refresh>guard&&refresh<stop,'Update authoritative fingerprint on edit');
 assert.ok(stop>guard&&stop<reset,'Return before new-sale form reset');
 assert.equal(saveHandler.slice(guard,stop).includes('setEditingPosInvoiceId(null)'),false);
});
test('save captures the original editing invoice id before awaiting PostgreSQL',()=>{
 const captured=saveHandler.indexOf('const intendedEditingInvoiceId=');
 const awaited=saveHandler.indexOf('postRes = await postPosSaleOnline(');
 assert.ok(captured>0&&captured<awaited);
 assert.ok(saveHandler.includes('editingInvoiceId: intendedEditingInvoiceId || undefined'));
 assert.ok(saveHandler.includes('const editingId=intendedEditingInvoiceId;'));
});
test('only fresh sales automatically reset the cashier screen',()=>{
 assert.ok(saveHandler.includes('// Only a NEW sale clears the cashier screen after an accepted save.'));
 assert.ok(saveHandler.includes('if (!editingId && posTargetType'));
 assert.ok(saveHandler.includes('verifyPosEditReceipt('),'Posted invoices must verify notes in server acknowledgement');
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
