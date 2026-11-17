import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePosPaymentMethod} from '../src/utils/posPaymentMethod';

test('editing bank transfer remains bank transfer, not a card sale',()=>{
 assert.equal(resolvePosPaymentMethod(0,100,'bank_transfer'),'bank_transfer');
 assert.equal(resolvePosPaymentMethod(0,100,'card'),'card');
});
test('cash, credit and mixed payments stay on their existing approved paths',()=>{
 assert.equal(resolvePosPaymentMethod(100,0,'cash'),'cash');
 assert.equal(resolvePosPaymentMethod(0,0,'credit'),'credit');
 assert.equal(resolvePosPaymentMethod(10,30,'cash'),'cash');
 assert.equal(resolvePosPaymentMethod(0,25,'cash'),'card');
});
test('invalid monetary input is never silently converted to a payment type',()=>{
 assert.throws(()=>resolvePosPaymentMethod(NaN,0,'cash'),/INVALID_POS_PAYMENT_AMOUNTS/);
 assert.throws(()=>resolvePosPaymentMethod(-1,0,'cash'),/INVALID_POS_PAYMENT_AMOUNTS/);
});
