import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('completed cashier attempts survive UI reset, and legacy recovery cannot replay a known invoice',()=>{
 for(const p of ['src/components/PosView.tsx','src/components/pos/MobilePosView.tsx']){
  assert.ok(!read(p).includes("removePosAttempt('lobnan_pending_atomic_pos_attempt:'"));
 }
 const context=read('src/context/AccountingContext.tsx');
 const guard=context.indexOf('if(!pending&&draftId)');
 assert.ok(guard>=0&&guard<context.indexOf('const {posting,invoice}=buildNewAtomicPosSale',guard));
 assert.ok(context.includes('local.confirmedInvoice(priorInvoiceId)'));
 assert.ok(context.includes('cmd.atomicInvoiceId===priorInvoiceId'));
});
