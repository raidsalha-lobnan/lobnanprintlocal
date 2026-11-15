import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeAtomicSaleAccountCards} from '../atomic-pos-account-cache.mjs';

const defaults=[
 {code:'1201',name:'ذمم العملاء',type:'asset',balance:110242.41},
 {code:'4101',name:'إيرادات المبيعات',type:'revenue',balance:110455.41},
 {code:'1301',name:'مخزون',type:'asset',balance:-81902.30},
 {code:'5101',name:'تكلفة مبيعات',type:'expense',balance:81902.30}
];
const make=({missing=null,malformed=false}={})=>{
 const cards=new Map(defaults.filter(a=>a.code!==missing).map((x,i)=>[x.code,{
  record_id:'account-'+x.code,version:7+i,value:{...x,isSystem:true}
 }]));
 const updated=[];
 const client={async query(sql,args){
  if(sql.startsWith("SELECT record_id,version,value FROM sync_records")&&sql.includes("entity='accounts'"))
   return {rows:[...cards.values()].filter(x=>args[1].includes(x.value.code))};
  if(sql.startsWith("SELECT l->>'accountCode' code, SUM("))
   return {rows:malformed?[]:[
    {code:'1201',signed:'112202.41'},
    {code:'4101',signed:'-112415.41'},
    {code:'1301',signed:'-82842.30'},
    {code:'5101',signed:'82842.30'}
   ].filter(x=>args[1].includes(x.code))};
  if(sql.startsWith('UPDATE sync_records SET version=')){
   updated.push({entity:args[1],id:args[2],version:args[3],value:args[4]});
   return {rows:[]};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 const sale={id:'inv-pos-352',isAccountingPosted:true};
 const posted=[
  {entity:'invoices',id:sale.id,value:sale,version:1},
  {entity:'journalEntries',id:'sale352',value:{referenceId:sale.id,
    referenceType:'pos_invoice',lines:[
     {accountCode:'1201',debit:1960,credit:0},
     {accountCode:'4101',debit:0,credit:1960}
    ]}},
  {entity:'journalEntries',id:'cost352',value:{referenceId:sale.id,
    referenceType:'cogs',lines:[
     {accountCode:'5101',debit:940,credit:0},
     {accountCode:'1301',debit:0,credit:940}
    ]}}
 ];
 return {cards,updated,client,sale,posted};
};

test('reprojects all four affected GL cards from journal evidence, including backlog drift',async()=>{
 const t=make();
 const count=await synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
  {atomicInvoiceId:t.sale.id},t.posted);
 assert.equal(count,4);
 assert.equal(t.updated.length,4);
 const mapped=Object.fromEntries(t.updated.map(a=>[a.value.code,a.value.balance]));
 assert.deepEqual(mapped,{'1201':112202.41,'4101':112415.41,
  '1301':-82842.30,'5101':82842.30});
 assert.ok(t.updated.every(a=>a.value.isSystem===true));
 assert.deepEqual(t.posted.filter(x=>x.entity==='accounts').map(x=>x.id).sort(),
  [...t.cards.values()].map(x=>x.record_id).sort());
 assert.equal(t.posted.filter(x=>x.entity==='journalEntries').length,2,
  'GL cache refresh must not create extra journal postings');
});

test('missing COA account is fatal: entire atomic sale must roll back',async()=>{
 const t=make({missing:'5101'});
 await assert.rejects(synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
  {atomicInvoiceId:t.sale.id},t.posted),
  /ATOMIC_POS_GENERAL_LEDGER_ACCOUNT_MISSING_OR_DUPLICATED/);
 assert.equal(t.updated.length,0);
});

test('missing GL aggregate evidence is fatal, never assume balance zero',async()=>{
 const t=make({malformed:true});
 await assert.rejects(synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
  {atomicInvoiceId:t.sale.id},t.posted),/ATOMIC_POS_LEDGER_BASELINE_INVALID/);
 assert.equal(t.updated.length,0);
});

test('unposted invoice and mini-sale settlement do not run ordinary GL projection',async()=>{
 const t=make();
 assert.equal(await synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
  {atomicInvoiceId:t.sale.id,miniSaleSettlement:true},t.posted),0);
 assert.equal(await synchronizeAtomicSaleAccountCards(t.client,'lobnan_main',
  {atomicInvoiceId:'not-in-applied'},t.posted),0);
 assert.equal(t.updated.length,0);
});
