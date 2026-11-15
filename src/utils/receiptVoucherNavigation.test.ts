import test from 'node:test';
import assert from 'node:assert/strict';
import type {PaymentVoucher} from '../types';
import {orderedReceiptVouchers,receiptVoucherPosition,receiptVoucherShortcut}
 from './receiptVoucherNavigation';

const voucher=(id:string,number:string,date:string,type:PaymentVoucher['type']='receipt')=>({
 id,voucherNumber:number,date,type,partyId:'cust',partyName:'Customer',
 amount:20,accountCode:'1201',description:'Paid',paymentMethod:'cash'
} as PaymentVoucher);

test('receipt counter includes only saved receipts, ordered chronologically and numerically',()=>{
 const rows=[
  voucher('r10','RCT-10','2026-11-15'),
  voucher('p01','PAY-01','2026-11-15','payment'),
  voucher('r2','RCT-2','2026-11-15'),
  voucher('r1','RCT-1','2026-11-14')
 ];
 const ordered=orderedReceiptVouchers(rows);
 assert.deepEqual(ordered.map(v=>v.id),['r1','r2','r10']);
 assert.equal(rows[0].id,'r10','does not mutate source');
 assert.deepEqual(receiptVoucherPosition(ordered,'r2'),{
  position:2,total:3,previous:ordered[0],next:ordered[2]
 });
});

test('new voucher counts 0 of saved register, previous goes to latest and next is disabled',()=>{
 const ordered=orderedReceiptVouchers([voucher('r1','RCT-1','2026-11-14'),
  voucher('r2','RCT-2','2026-11-15')]);
 assert.deepEqual(receiptVoucherPosition(ordered,null),{
  position:0,total:2,previous:ordered[1],next:null
 });
 assert.equal(receiptVoucherPosition([],null).total,0);
 assert.equal(receiptVoucherPosition(ordered,'r2').next,null);
 assert.equal(receiptVoucherPosition(ordered,'r1').previous,null);
});

test('Ctrl+N and Ctrl+S (or Mac Command) are recognized only with active modifier',()=>{
 const e=(key:string,ctrlKey=false,metaKey=false,altKey=false)=>({
  key,ctrlKey,metaKey,altKey
 });
 assert.equal(receiptVoucherShortcut(e('n',true)),'new');
 assert.equal(receiptVoucherShortcut(e('N',true)),'new');
 assert.equal(receiptVoucherShortcut(e('s',true)),'save');
 assert.equal(receiptVoucherShortcut(e('S',false,true)),'save');
 assert.equal(receiptVoucherShortcut(e('n')) ,null);
 assert.equal(receiptVoucherShortcut(e('n',true,false,true)),null);
 assert.equal(receiptVoucherShortcut(e('ArrowRight',true)),null);
});
