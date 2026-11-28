import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clearingPdfFilename,clearingShortcut} from '../src/utils/clearingActions';
import type {DebtClearingRecord} from '../src/types';
test('save shortcuts are exclusive and work with Arabic keyboard layout',()=>{
 const k={key:'س',code:'KeyS',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false};
 assert.equal(clearingShortcut({...k,ctrlKey:true}),'save');
 assert.equal(clearingShortcut({...k,altKey:true}),'print');
 assert.equal(clearingShortcut({...k,ctrlKey:true,altKey:true}),'pdf');
 assert.equal(clearingShortcut({...k,ctrlKey:true,shiftKey:true}),null);
});
test('PDF filename follows selected source and target, not debit/credit order',()=>{
 const r={sourceType:'employee',sourceName:'أحمد',targetType:'customer',targetName:'مؤسسة / غزة',targetSubCustomerName:'فرع',balanceSide:'credit',date:'2026-11-28',clearingNumber:'CLR-2026-002'} as DebtClearingRecord;
 assert.equal(clearingPdfFilename(r),'مقاصة موظف أحمد إلى عميل مؤسسة - غزة - فرع - 28-11-2026 - CLR-2026-002.pdf');
});
test('all save actions share a single authenticated posting and output runs only after the receipt',()=>{
 const modal=readFileSync(new URL('../src/components/AccountTransferModal.tsx',import.meta.url),'utf8');
 const view=readFileSync(new URL('../src/components/DebtClearingView.tsx',import.meta.url),'utf8');
 assert.equal(modal.split("base+'/api/v1/account-transfers'").length,2);
 assert.ok(modal.indexOf('onSaved(record,action)')>modal.indexOf('ACCOUNT_TRANSFER_RECEIPT_MISMATCH'));
 assert.match(modal,/submitting\.current\|\|busy/);
 assert.match(view,/outputRequest\.current=null/);
 assert.match(view,/saveReportPdf\(root,\{filename:clearingPdfFilename\(preview\)/);
});
