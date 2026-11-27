import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAccountTransferPlan,TRANSFER_ACCOUNTS} from '../account-transfer-plan.mjs';
import {validateJournal} from '../sync-domain.mjs';

const types=['customer','supplier','employee'];
const endpoint=(type,id)=>({type,id,name:type+' '+id});
test('all nine type combinations and both transfer directions create one balanced journal',()=>{
 for(const from of types)for(const to of types)for(const balanceSide of ['debit','credit']){
  const source=endpoint(from,'source'),target=endpoint(to,'target');
  const plan=buildAccountTransferPlan({source,target,amount:125.35,balanceSide});
  validateJournal({lines:plan.lines});
  assert.equal(plan.lines.length,2);
  const debit=balanceSide==='debit'?target:source,credit=balanceSide==='debit'?source:target;
  assert.equal(plan.lines[0].accountCode,TRANSFER_ACCOUNTS[debit.type].code);
  assert.equal(plan.lines[0].counterpartyId,debit.id);
  assert.equal(plan.lines[0].debit,125.35);
  assert.equal(plan.lines[1].accountCode,TRANSFER_ACCOUNTS[credit.type].code);
  assert.equal(plan.lines[1].counterpartyId,credit.id);
  assert.equal(plan.lines[1].credit,125.35);
  assert.equal(plan.effects.reduce((sum,x)=>sum+x.signedLedgerDelta,0),0);
  for(const e of plan.effects)
   assert.equal(e.statementDelta,e.type==='employee'?-e.signedLedgerDelta:e.signedLedgerDelta);
  if(from===to)assert.equal(plan.accountDeltas[TRANSFER_ACCOUNTS[from].code],0);
 }
});
test('customer supplier offset has credit receivables and debit payables; both cards decrease',()=>{
 const result=buildAccountTransferPlan({source:endpoint('customer','c'),target:endpoint('supplier','s'),amount:100});
 assert.deepEqual(result.accountDeltas,{'1201':-100,'2101':-100});
});
test('supplier credit transfer reverses debit/credit correctly',()=>{
 const result=buildAccountTransferPlan({source:endpoint('supplier','s'),target:endpoint('employee','e'),amount:100,balanceSide:'credit'});
 assert.deepEqual(result.accountDeltas,{'2101':-100,'1104':-100});
 assert.equal(result.effects.find(x=>x.id==='e').statementDelta,100);
});
test('invalid inputs and same underlying balance are rejected',()=>{
 const source=endpoint('customer','c'),target=endpoint('supplier','s');
 for(const amount of [0,-1,0.001,NaN,Infinity,'100']){
  assert.throws(()=>buildAccountTransferPlan({source,target,amount}),/ACCOUNT_TRANSFER_/);
 }
 assert.throws(()=>buildAccountTransferPlan({source,target:{...source,type:'supplier'},amount:10}),/SAME_ACCOUNT/);
 assert.throws(()=>buildAccountTransferPlan({source:{...source,code:'CUST-0001'},target,amount:10}),/CASH_CUSTOMER_IMMUTABLE/);
 assert.throws(()=>buildAccountTransferPlan({source,target,amount:10,balanceSide:'unknown'}),/SIDE_INVALID/);
});
