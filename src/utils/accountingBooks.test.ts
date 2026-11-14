import test from 'node:test';
import assert from 'node:assert/strict';
import type {Account,JournalEntry} from '../types';
import {bookCents,makeJournalBook,makeLedgerBook,makeTrialBalance} from './accountingBooks';

const accounts:Account[]=[
 {code:'1101',name:'Cash',type:'asset',balance:0},
 {code:'1201',name:'Receivables',type:'asset',balance:70},
 {code:'4101',name:'Revenue',type:'revenue',balance:0},
 {code:'5101',name:'Expenses',type:'expense',balance:0}
];
const entry=(id:string,date:string,lines:JournalEntry['lines']):JournalEntry=>({
 id,entryNumber:'JE-'+id,date,description:'Invoice '+id,referenceType:'pos_invoice',
 referenceId:'invoice-'+id,createdAt:date+'T12:00:00Z',lines
});
const makeLine=(accountCode:string,debit:number,credit:number)=>({
 accountCode,accountName:accountCode,description:'item movement',debit,credit
});
const journals=[
 entry('3','2026-11-11',[makeLine('1201',30,0),makeLine('4101',0,30)]),
 entry('1','2026-11-08',[makeLine('1101',20,0),makeLine('1201',50,0),makeLine('4101',0,70)]),
 entry('2','2026-11-10',[makeLine('1201',10,0),makeLine('1201',15,0),makeLine('4101',0,25)])
];
test('journal book sums integer cents and validates all sides by account code',()=>{
 const rows=makeJournalBook(journals,accounts);
 assert.equal(rows.length,3);
 assert.ok(rows.every(r=>r.valid));
 assert.deepEqual(rows.map(r=>r.debit),[3000,7000,2500]);
 assert.equal(rows[0].difference,0);
});
test('debit and credit on same row are shown as issues even when overall total balances',()=>{
 const bogus=entry('x','2026-11-10',[makeLine('1201',100,100),makeLine('4101',100,100)]);
 const rows=makeJournalBook([bogus],accounts);
 assert.equal(rows[0].balanced,true);
 assert.equal(rows[0].valid,false);
 assert.ok(rows[0].issues.some(i=>i.includes('طرف مدين ودائن')));
});
test('unknown accounts and non-balanced journals stay visible, never silently corrected',()=>{
 const bad=entry('x','2026-11-10',[makeLine('9999',10,0),makeLine('4101',0,9)]);
 const rows=makeJournalBook([bad],accounts);
 assert.equal(rows[0].valid,false);
 assert.equal(rows[0].difference,100);
 assert.ok(rows[0].issues.some(i=>i.includes('9999')));
});
test('ledger includes every same-account journal line, chronological date order and running balances',()=>{
 const ledger=makeLedgerBook(journals,'1201');
 assert.equal(ledger.rows.length,4);
 assert.deepEqual(ledger.rows.map(r=>r.date),[
  '2026-11-08','2026-11-10','2026-11-10','2026-11-11']);
 assert.deepEqual(ledger.rows.map(r=>r.running),[5000,6000,7500,10500]);
 assert.equal(ledger.totalDebit,10500);
 assert.equal(ledger.closing,10500);
});
test('dated ledger period correctly brings opening from previous postings and computes closing',()=>{
 const nov=makeLedgerBook(journals,'1201','2026-11-10','2026-11-10');
 assert.equal(nov.opening,5000);
 assert.equal(nov.rows.length,2);
 assert.deepEqual(nov.rows.map(r=>r.running),[6000,7500]);
 assert.equal(nov.closing,7500);
});
test('ledger distinguishes credit-normal resulting balance without relying on Account.balance',()=>{
 const x=makeLedgerBook(journals,'4101');
 assert.equal(x.closing,-12500);
 assert.equal(x.rows.length,3);
});
test('trial balance is from posted journals, identifies stored discrepancies and remains balanced',()=>{
 const t=makeTrialBalance(journals,accounts);
 assert.equal(t.balanced,true);
 assert.equal(t.debit,t.credit);
 assert.equal(t.debit,12500);
 assert.equal(t.rows.find(r=>r.code==='1201')?.debitBalance,10500);
 assert.equal(t.rows.find(r=>r.code==='4101')?.creditBalance,12500);
 assert.equal(t.mismatchedSnapshots,3);
});
test('historical trial date never includes future lines',()=>{
 const t=makeTrialBalance(journals,accounts,'2026-11-09');
 assert.equal(t.debit,7000);
 assert.equal(t.credit,7000);
 assert.equal(t.rows.find(r=>r.code==='4101')?.creditBalance,7000);
});
test('trial balance never hides unknown account movement',()=>{
 const j=entry('unknown','2026-11-10',[makeLine('9999',12,0),makeLine('4101',0,12)]);
 const t=makeTrialBalance([j],accounts);
 assert.equal(t.unknownAccounts,1);
 assert.equal(t.rows.find(r=>r.code==='9999')?.debitBalance,1200);
});
test('minor unit conversion remains exact for standard two-decimal values',()=>{
 assert.equal(bookCents(22.35),2235);
 assert.equal(bookCents(22.3),2230);
});
