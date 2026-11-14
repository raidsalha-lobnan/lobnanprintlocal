import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareTreasurySequence} from './treasurySequence';
const mk=(code:string,name=code)=>({accountCode:code,id:code,name});
test('CASH treasuries always follow numeric serial ascending without requiring a DB update',()=>{
 const entries=[mk('CASH-1106'),mk('CASH-1103'),mk('CASH-1101'),
  mk('CASH-1104'),mk('CASH-1102'),mk('CASH-1105')];
 const sorted=entries.sort(compareTreasurySequence);
 assert.deepEqual(sorted.map(x=>x.accountCode),[
  'CASH-1101','CASH-1102','CASH-1103','CASH-1104','CASH-1105','CASH-1106'
 ]);
});
test('numeric ordering, unknown codes and stable fallback are deterministic',()=>{
 const v=[mk('CASH-11100'),mk('OTHER-1'),mk('CASH-1102'),mk('CASH-11010')];
 assert.deepEqual(v.sort(compareTreasurySequence).map(x=>x.accountCode),[
  'CASH-1102','CASH-11010','CASH-11100','OTHER-1'
 ]);
});
test('treasury cards omit requested redundant captions without deleting underlying metadata',()=>{
 const ui=readFileSync(new URL('../components/TreasuriesView.tsx',import.meta.url),'utf8');
 assert.ok(ui.includes('.sort(compareTreasurySequence)'));
 assert.ok(!ui.includes('{typeInfo.label}</span>'));
 assert.ok(!ui.includes('treasury.bankName && ('));
 assert.ok(!ui.includes('treasury.notes && ('));
 assert.ok(!ui.includes('Accounting Equivalent in Base Currency'));
 assert.ok(!ui.includes('Card Top: Badges & Type')||ui.includes('Card Bottom Actions'));
 assert.ok(ui.includes('curBal[\\x27ILS\\x27]')||ui.includes("curBal['ILS']"));
 assert.ok(ui.includes('handleOpenDeposit(treasury.id)'));
 assert.ok(ui.includes('handleOpenWithdraw(treasury.id)'));
 assert.ok(ui.includes('handleOpenTransfer(treasury.id)'));
});
