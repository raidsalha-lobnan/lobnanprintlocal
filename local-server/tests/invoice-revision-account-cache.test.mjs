import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeAtomicSaleAccountCards} from '../atomic-pos-account-cache.mjs';

const defaults=[
 {code:'1201',type:'asset',balance:100},
 {code:'4101',type:'revenue',balance:100},
 {code:'5101',type:'expense',balance:50},
 {code:'1301',type:'asset',balance:-50}
];
function fixture({missing=null}={}){
 const accounts=defaults.filter(a=>a.code!==missing).map((value,i)=>({
  record_id:'gl-'+value.code,version:1+i,value:{...value,name:'GL '+value.code}
 }));
 const posted=[
  {entity:'invoices',id:'invoice-1',version:5,value:{
   id:'invoice-1',isAccountingPosted:true,invoiceNumber:'INV-0091'}},
  {entity:'journalEntries',id:'new-revenue',version:1,value:{
   referenceId:'invoice-1',referenceType:'invoice_correction',
   lines:[{accountCode:'1201',debit:3.6,credit:0},
          {accountCode:'4101',debit:0,credit:3.6}]}},
  {entity:'journalEntries',id:'new-cogs',version:1,value:{
   referenceId:'invoice-1',referenceType:'invoice_correction',
   lines:[{accountCode:'5101',debit:2.7,credit:0},
          {accountCode:'1301',debit:0,credit:2.7}]}}
 ];
 const writes=[];
 const client={async query(sql,args){
  if(sql.startsWith('SELECT record_id,version,value FROM sync_records'))
   return {rows:accounts.filter(a=>args[1].includes(a.value.code))};
  if(sql.startsWith("SELECT l->>'accountCode' code, SUM("))
   return {rows:[
    {code:'1201',signed:'103.60'},
    {code:'4101',signed:'-103.60'},
    {code:'5101',signed:'52.70'},
    {code:'1301',signed:'-52.70'}
   ].filter(a=>args[1].includes(a.code))};
  if(sql.startsWith('UPDATE sync_records SET version=')){
   writes.push({id:args[2],value:args[4]});return {rows:[]};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 return {client,posted,writes};
}

test('invoice revision reprojects four GL cards in the same atomic operation',async()=>{
 const t=fixture();
 const count=await synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
  {id:'revision-91'},t.posted,'invoice-1');
 assert.equal(count,4);
 assert.deepEqual(Object.fromEntries(t.writes.map(x=>[x.value.code,x.value.balance])),
  {'1201':103.6,'4101':103.6,'1301':-52.7,'5101':52.7});
 assert.equal(t.posted.filter(x=>x.entity==='accounts').length,4);
 assert.equal(t.posted.filter(x=>x.entity==='journalEntries').length,2,
  'GL cache reprojection must not create additional journals');
});

test('notes-only posted invoice amendment needs no GL update',async()=>{
 const t=fixture();
 const n=await synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
  {id:'revision-notes'},t.posted.slice(0,1),'invoice-1');
 assert.equal(n,0);
 assert.equal(t.writes.length,0);
});

test('unknown account in invoice correction fails atomically',async()=>{
 const t=fixture({missing:'1301'});
 await assert.rejects(
  synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
   {id:'revision-91'},t.posted,'invoice-1'),
  /ATOMIC_POS_GENERAL_LEDGER_ACCOUNT_MISSING_OR_DUPLICATED/);
 assert.equal(t.writes.length,0);
});
