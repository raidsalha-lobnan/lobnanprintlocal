import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveReceiptRoute,sumReceiptRoutes} from './receiptRouting';
const treasuries=[
 {accountCode:'CASH-1101',type:'cash_box',status:'active'},
 {accountCode:'CASH-1103',type:'digital_wallet',status:'active'},
 {accountCode:'CASH-1104',type:'bank_account',status:'active'},
] as const;
const voucher=(accountCode:string,amount:number,paymentMethod:'cash'|'bank_transfer'|'e_wallet'|'cheque'='cash')=>({
 accountCode,treasuryAccountCode:accountCode,amount,paymentMethod,
 id:accountCode+'_'+amount,voucherNumber:'R',date:'2026-11-11',type:'receipt' as const,
 partyId:'p',partyName:'A',description:'receipt',currency:'ILS'
});
test('legacy cash payment label cannot override the actual wallet destination',()=>{
 assert.equal(resolveReceiptRoute(voucher('CASH-1103',150),treasuries),'wallet');
 assert.equal(resolveReceiptRoute(voucher('CASH-1101',288),treasuries),'cash');
 assert.equal(resolveReceiptRoute(voucher('CASH-1104',12),treasuries),'bank_transfer');
});
test('receipt statistics split 288 cash and 150 digital wallet correctly',()=>{
 const result=sumReceiptRoutes([voucher('CASH-1101',288),voucher('CASH-1103',150)],treasuries);
 assert.deepEqual(result,{total:438,cash:288,noncash:150,unknown:0});
});
test('unrecognized or foreign cash boxes must never inflate CASH-1101 stats',()=>{
 assert.equal(resolveReceiptRoute(voucher('CASH-9999',150),treasuries),'unknown');
 assert.equal(resolveReceiptRoute(voucher('CASH-1104',10,'cheque'),treasuries),'cheque');
 assert.equal(sumReceiptRoutes([voucher('CASH-9999',150)],treasuries).cash,0);
});
