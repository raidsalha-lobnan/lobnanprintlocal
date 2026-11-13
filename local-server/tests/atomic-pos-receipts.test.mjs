import test from 'node:test';
import assert from 'node:assert/strict';
import {findVerifiedAtomicPosReceipts} from '../atomic-pos-receipts.mjs';

const good=[
 {entity:'invoices',id:'inv-pos-one',version:1,value:{
  id:'inv-pos-one',invoiceNumber:'INV-0273',isAccountingPosted:true,totalAmount:13}},
 {entity:'journalEntries',id:'je-1',version:1,value:{id:'je-1'}},
 {entity:'journalEntries',id:'je-2',version:1,value:{id:'je-2'}},
 {entity:'stockMovements',id:'sm-1',version:1,value:{id:'sm-1'}}
];
test('exact user-owned SHA-256 and committed atomic invoice are required',async()=>{
 let lastParams;
 const pool={query:async(sql,params)=>{
  lastParams=params;
  assert.match(sql,/actor_id=\$2/);
  return {rows:[
   {command_id:'764624bf-99b0-4c69-ab20-3d3e10ba05c8',fingerprint:'a'.repeat(64),
    receipt:{commandId:'764624bf-99b0-4c69-ab20-3d3e10ba05c8',changes:good}},
   {command_id:'other-unsafe',fingerprint:'b'.repeat(64),receipt:{changes:good}}
  ]};
 }};
 const proof={id:'764624bf-99b0-4c69-ab20-3d3e10ba05c8',fingerprint:'a'.repeat(64)};
 const checked=await findVerifiedAtomicPosReceipts(pool,'lobnan_main','usr-1',[proof]);
 assert.deepEqual(lastParams,['lobnan_main','usr-1',[proof.id]]);
 assert.equal(checked.length,1);
 assert.equal(checked[0].commandId,proof.id);
 assert.equal(checked[0].changes[0].value.invoiceNumber,'INV-0273');
 assert.deepEqual(await findVerifiedAtomicPosReceipts(pool,'lobnan_main','usr-1',
   [{...proof,fingerprint:'c'.repeat(64)}]),[]);
});
test('invalid proof and unposted invoice never clears local financial command',async()=>{
 const pool={query:async()=>({rows:[{command_id:'764624bf-99b0-4c69-ab20-3d3e10ba05c8',
    fingerprint:'a'.repeat(64),receipt:{changes:good.map((c,i)=>
     i===0?{...c,value:{...c.value,isAccountingPosted:false}}:c)}}]})};
 const proof={id:'764624bf-99b0-4c69-ab20-3d3e10ba05c8',fingerprint:'a'.repeat(64)};
 assert.deepEqual(await findVerifiedAtomicPosReceipts(pool,'lobnan_main','usr-1',[proof]),[]);
 await assert.rejects(()=>findVerifiedAtomicPosReceipts(pool,'lobnan_main','usr-1',
  [{id:'abc',fingerprint:'a'.repeat(64)}]),/INVALID_ATOMIC_RECEIPT_CHECK/);
});
