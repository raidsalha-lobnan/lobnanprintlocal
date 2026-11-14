import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTreasuryCodeIdentity,assertUniqueTreasuryCode,MAIN_CASH} from '../treasury-code-guard.mjs';
const cash={id:'treasury-cash-main',type:'cash_box',accountCode:MAIN_CASH,isDefault:true,status:'active'};
const wallet={id:'wallet-1',type:'digital_wallet',accountCode:'CASH-1106',isDefault:false,status:'active'};
test('exactly CASH-1101 is the only cash box in the central data model',()=>{
 assert.equal(assertTreasuryCodeIdentity(cash.id,cash),MAIN_CASH);
 assert.equal(assertTreasuryCodeIdentity(wallet.id,wallet),'CASH-1106');
 for(const next of [
  {...wallet,accountCode:'1106'},
  {...wallet,accountCode:'BANK-1106'},
  {...wallet,accountCode:'CASH-1101'},
  {...wallet,type:'cash_box'},
  {...wallet,isDefault:true},
  {...cash,accountCode:'CASH-1110'},
  {...cash,id:'wallet-1'}
 ]){
  assert.throws(()=>assertTreasuryCodeIdentity(next.id,next));
 }
});
test('renumbering or changing cash/noncash type after creation is blocked',()=>{
 assert.throws(()=>assertTreasuryCodeIdentity(wallet.id,
  {...wallet,accountCode:'CASH-1107'},wallet),/POSTED_TREASURY_IDENTITY_IMMUTABLE/);
 assert.throws(()=>assertTreasuryCodeIdentity(wallet.id,
  {...wallet,type:'bank_account'},wallet),/POSTED_TREASURY_IDENTITY_IMMUTABLE/);
});
test('duplicate codes across different treasury records are rejected',async()=>{
 const fake={query:async(_sql,args)=>({rows:args[1]==='CASH-1106'?
  [{record_id:'some-other-box'}]:[]})};
 await assert.rejects(()=>assertUniqueTreasuryCode(fake,'lobnan_main','wallet-1','CASH-1106'),
  /DUPLICATE_TREASURY_CODE/);
 await assert.doesNotReject(()=>assertUniqueTreasuryCode(fake,'lobnan_main','wallet-1','CASH-1105'));
});
