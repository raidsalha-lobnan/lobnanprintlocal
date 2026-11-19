import test from 'node:test';
import assert from 'node:assert/strict';
import {postNewCustomerReceipt} from '../atomic-receipt-posting.mjs';

function fixture({discount=9,cash=false,existingDiscount=false,conflict=false,rate=1,wrongBase=false}={}){
 const party={record_id:'p1',version:4,value:{
  id:'p1',name:'عميل تجريبي',type:'customer',code:'CUST-0022',
  balance:1000,openingBalance:1
 }};
 const treasury={record_id:'t1',version:7,value:{
  id:'t1',accountCode:cash?'CASH-1101':'CASH-1103',name:'المحفظة التجريبية',
  status:'active',type:cash?'cash_box':'digital_wallet',balance:2000,
  currencyBalances:{ILS:2000},transactions:[]
 }};
 const liquid={record_id:'a1',version:4,value:{code:cash?'1101':'1102',name:'النقد والبنك',type:'asset',balance:2000}};
 const ar={record_id:'a2',version:5,value:{code:'1201',name:'ذمم العملاء',type:'asset',balance:1000}};
 const disc=existingDiscount?{record_id:'a3',version:2,value:{
  code:'5299',name:conflict?'مصروف مختلف':'خصومات مسموح بها للعملاء',
  type:'expense',balance:13
 }}:null;
 const inserts=[], updates=[];
 const client={query:async(sql,params)=>{
  if(sql.startsWith('SELECT record_id FROM sync_records'))return {rows:[]};
  if(sql.startsWith('SELECT record_id,version,value')){
   if(sql.includes("entity='parties'"))return {rows:[party]};
   if(sql.includes("entity='treasuries'"))return {rows:[treasury]};
   if(sql.includes("entity='accounts'") && sql.includes("'1201' FOR UPDATE"))return {rows:[ar]};
   if(sql.includes("entity='accounts'")&&params[1]==='5299')return {rows:disc?[disc]:[]};
   if(sql.includes("entity='accounts'"))return {rows:[liquid]};
  }
  if(sql.startsWith('INSERT INTO sync_records')){inserts.push(params);return {rows:[],rowCount:1};}
  if(sql.startsWith('UPDATE sync_records')){updates.push(params);return {rows:[],rowCount:1};}
  throw new Error('Unexpected SQL '+sql);
 }};
 const voucher={id:'voucher-1',voucherNumber:'RCT-2026-0001',type:'receipt',
  date:'2026-11-19',partyId:'p1',partyName:'عميل تجريبي',partyType:'customer',
  accountCode:'1201',treasuryAccountCode:treasury.value.accountCode,
  paymentMethod:cash?'cash':'e_wallet',amount:860,baseAmount:860,
  discountAmount:discount,baseDiscountAmount:wrongBase?0:discount,
  exchangeRate:rate,currency:'ILS',description:'تسوية مع الخصم'};
 return {client,inserts,updates,voucher};
}
test('bank receipt 860 plus discount 9 makes 869 balanced AR; bank moves by 860',async()=>{
 const f=fixture();const applied=[];
 await postNewCustomerReceipt(f.client,'lobnan_main',f.voucher,applied);
 const journal=applied.find(x=>x.entity==='journalEntries').value;
 assert.deepEqual(journal.lines.map(l=>[l.accountCode,l.debit,l.credit]),
  [['1102',860,0],['5299',9,0],['1201',0,869]]);
 assert.equal(journal.lines.reduce((a,l)=>a+l.debit-l.credit,0),0);
 const treasury=applied.find(x=>x.entity==='treasuries').value;
 assert.equal(treasury.balance,2860);
 assert.equal(treasury.transactions[0].baseAmount,860);
 assert.equal(applied.find(x=>x.entity==='parties').value.balance,131);
 assert.equal(applied.find(x=>x.entity==='accounts'&&x.value.code==='1201').value.balance,131);
 const discounts=applied.filter(x=>x.entity==='accounts'&&x.value.code==='5299');
 assert.equal(discounts.length,1);
 assert.equal(discounts[0].value.balance,9);
 assert.equal(f.inserts.length,2); // discount account and journal
});
test('existing dedicated discount expense account is incremented, not duplicated',async()=>{
 const f=fixture({existingDiscount:true});const applied=[];
 await postNewCustomerReceipt(f.client,'lobnan_main',f.voucher,applied);
 assert.equal(applied.find(x=>x.entity==='accounts'&&x.value.code==='5299').value.balance,22);
 assert.equal(f.inserts.length,1); // journal only
});
test('zero discount keeps original 2-line journal and no new chart account',async()=>{
 const f=fixture({discount:0,cash:true});const applied=[];
 await postNewCustomerReceipt(f.client,'lobnan_main',f.voucher,applied);
 assert.deepEqual(applied.find(x=>x.entity==='journalEntries').value.lines.map(x=>x.accountCode),['1101','1201']);
 assert.equal(f.inserts.length,1);
 assert.equal(applied.find(x=>x.entity==='parties').value.balance,140);
});
test('colliding account code refuses the entire receipt before any SQL changes',async()=>{
 const f=fixture({existingDiscount:true,conflict:true});
 await assert.rejects(()=>postNewCustomerReceipt(f.client,'lobnan_main',f.voucher,[]),
  /RECEIPT_DISCOUNT_ACCOUNT_CONFLICT/);
 assert.equal(f.inserts.length,0);assert.equal(f.updates.length,0);
});
test('inconsistent FX discount amount refuses receipt',async()=>{
 const f=fixture({wrongBase:true});
 await assert.rejects(()=>postNewCustomerReceipt(f.client,'lobnan_main',f.voucher,[]),
  /RECEIPT_DISCOUNT_CURRENCY_CONVERSION_MISMATCH/);
 assert.equal(f.inserts.length,0);
});
test('negative discount refuses receipt',async()=>{
 const f=fixture({discount:-1});
 await assert.rejects(()=>postNewCustomerReceipt(f.client,'lobnan_main',f.voucher,[]),
  /RECEIPT_DISCOUNT_INVALID/);
 assert.equal(f.inserts.length,0);
});

test('server issues next sequential RCT number within the same locked receipt transaction',async()=>{
 const f=fixture();const original=f.client.query;
 let serialWritten=null;
 f.client.query=async(sql,params)=>{
  if(sql.startsWith('SELECT COALESCE(MAX('))return {rows:[{max_seq:'41'}]};
  if(sql.startsWith('UPDATE sync_records SET value=$4')){
   serialWritten=params[3].voucherNumber;
   return {rowCount:1,rows:[]};
  }
  return original(sql,params);
 };
 f.voucher.voucherNumber='AUTO-RECEIPT';
 const applied=[{entity:'vouchers',id:f.voucher.id,value:{...f.voucher},version:1}];
 await postNewCustomerReceipt(f.client,'lobnan_main',f.voucher,applied);
 assert.equal(serialWritten,'RCT-2026-0042');
 assert.equal(applied[0].value.voucherNumber,'RCT-2026-0042');
 assert.equal(applied.find(x=>x.entity==='journalEntries').value.entryNumber,'JE-RCT-2026-0042');
 assert.equal(applied.find(x=>x.entity==='treasuries').value.balance,2860);
 assert.equal(applied.find(x=>x.entity==='parties').value.balance,131);
});
