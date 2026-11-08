import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInvoiceCounterparty} from '../invoice-counterparty.mjs';
const rows={
 employees:new Map([['emp1',{id:'emp1',code:'EMP-002',name:'محمود أبو حمد'}]]),
 parties:new Map([['c1',{id:'c1',type:'customer',name:'زبون'}],
 ['s1',{id:'s1',type:'supplier',name:'مورد'}],
 ['both1',{id:'both1',type:'both',name:'مورد وعميل'}]])
};
const db={query:async(_,p)=>({rows:rows[p[1]]?.has(p[2])?[{value:rows[p[1]].get(p[2])}]:[]})};
test('employee sale links to permanent employee id and not an invented customer',async()=>{
 const recipient=await validateInvoiceCounterparty(db,'lobnan_main',{
  counterpartyType:'employee',counterpartyId:'emp1',customerId:'emp1',
  employeeId:'emp1',customerName:'اسم قديم'});
 assert.deepEqual(recipient,{type:'employee',id:'emp1',entity:'employees'});
});
test('supplier invoice uses existing supplier ID and permits both-type party',async()=>{
 for(const id of ['s1','both1']){
  const result=await validateInvoiceCounterparty(db,'lobnan_main',
   {counterpartyType:'supplier',counterpartyId:id,customerId:id,customerName:'مورد'});
  assert.equal(result.id,id);
 }
});
test('wrong person type, invalid ID and nonexistent target fail closed',async()=>{
 await assert.rejects(validateInvoiceCounterparty(db,'lobnan_main',
  {counterpartyType:'employee',counterpartyId:'c1',customerId:'c1'}),/NOT_FOUND/);
 await assert.rejects(validateInvoiceCounterparty(db,'lobnan_main',
  {counterpartyType:'supplier',counterpartyId:'c1',customerId:'c1'}),/WRONG_TYPE/);
 await assert.rejects(validateInvoiceCounterparty(db,'lobnan_main',
  {counterpartyType:'customer',counterpartyId:'s1',customerId:'c1'}),/ID_MISMATCH/);
});
test('historical invoices with no typed link remain readable and untouched',async()=>{
 assert.equal(await validateInvoiceCounterparty(db,'lobnan_main',
  {customerId:'emp1',customerName:'موظف'}),undefined);
});
