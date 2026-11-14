import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramMiniPos} from '../telegram-mini-pos.mjs';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';
const draftId='ab849877-1d5f-43ec-8620-9d03472ad101';
const customer={entity:'parties',record_id:'cust-2',version:2,
 value:{id:'cust-2',code:'CUST-0023',name:'Customer',type:'customer',balance:0,openingBalance:0}};
const item={entity:'inventory',record_id:'itm-4',version:4,
 value:{id:'itm-4',code:'PRI-00012',name:'Print Paper',category:'printing',unit:'piece',
  stockQuantity:30,purchasePrice:2,sellingPrice:10}};
const treasury=(id,code,type,balance,version)=>({entity:'treasuries',record_id:id,version,
 value:{id,name:id,accountCode:code,type,status:'active',isDefault:code==='CASH-1101',
 balance,currencyBalances:{ILS:balance},transactions:[]}});
const cash=treasury('treasury-cash-main','CASH-1101','cash_box',100,3);
const wallet=treasury('cash-wallet','CASH-1106','digital_wallet',200,4);
const accounts=['1101','1102','1201','4101','5101','1301'].map((code,i)=>({
 entity:'accounts',record_id:'acct-'+code,version:i+1,
 value:{id:'acct-'+code,code,name:'A '+code,balance:1000,
 type:code==='4101'?'revenue':code==='5101'?'expense':'asset'}
}));
const all=[customer,item,cash,wallet,...accounts];
const body={
 documentType:'sale',date:'2026-11-14',
 customerId:customer.record_id,customerName:customer.value.name,
 counterpartyKind:'customer',
 paymentMethod:'bank_transfer',cashPaidAmount:5,bankPaidAmount:2,
 bankTreasuryCode:'CASH-1106',paidAmount:7,overallDiscount:0,
 notes:'Sale note',paymentNotes:'Receipt note',
 items:[{itemId:'itm-4',quantity:1,unitPrice:10,hasDimensions:false,notes:'Line note'}]
};
function fixture({kind='sale',paid=true}={}){
 const calls=[],commands=[];
 const draft={body:kind==='print'?{...body,documentType:'print',
  cashPaidAmount:0,bankPaidAmount:0,bankTreasuryCode:'',paidAmount:0}:body,
  status:'draft',created_at:'2026-11-14T15:00:00.000Z'};
 const pg={async query(sql,args){
  calls.push({sql,args});
  if(sql.includes('FROM sync_telegram_pos_drafts')&&sql.includes('FOR UPDATE'))
   return {rows:[draft]};
  if(sql.startsWith('INSERT INTO sync_workspaces'))return {rows:[],rowCount:1};
  if(sql.startsWith('SELECT next_sequence'))return {rows:[{next_sequence:1}]};
  if(sql.includes("entity='inventory'")&&sql.includes('record_id=ANY'))
   return {rows:[item]};
  if(sql.includes("entity='parties'")||sql.includes("entity='employees'"))
   return {rows:[customer]};
  if(sql.includes("entity='settings'"))return {rows:[{value:{vatRate:0}}]};
  if(sql.includes("entity='treasuries'"))return {rows:[cash,wallet]};
  if(sql.includes("entity='accounts'"))return {rows:accounts};
  if(sql.includes("entity='warehouses'"))return {rows:[{
   record_id:'wh-main',value:{id:'wh-main',name:'الرئيسي'}}]};
  if(sql.includes("entity='printOrders'")&&sql.includes("value->>'orderNumber'"))
   return {rows:[]};
  if(sql.startsWith('UPDATE sync_telegram_pos_drafts'))return {rows:[],rowCount:1};
  throw Error('UNEXPECTED_TX_SQL '+sql);
 }};
 const pool={async query(sql,args){
  if(sql.startsWith('SELECT fingerprint,actor_id FROM sync_commands'))return {rows:[]};
  if(sql.startsWith('SELECT value FROM sync_records')){
   const record=all.find(r=>r.entity===args[1]&&r.record_id===args[2]);
   return {rows:record?[{value:record.value}]:[]};
  }
  throw Error('UNEXPECTED_POOL_SQL '+sql);
 }};
 const sync={
  withTx:async fn=>fn(pg),
  pushInTx:async (_w,cmd,_actor,client)=>{
   assert.equal(client,pg);
   commands.push(cmd);
   if(kind==='sale'){
    assert.equal(validateAtomicInvoicePosting(cmd),true);
    return {changes:cmd.changes.map(c=>c.entity==='invoices'?{
     ...c,value:{...c.value,invoiceNumber:'INV-0345'}
    }:c)};
   }
   return {changes:cmd.changes};
  }
 };
 const mini=new TelegramMiniPos(pool,'lobnan_main',sync);
 mini.session=async()=>({
  user:{id:'user-1',name:'Owner',roleId:'admin'},
  telegramUserId:'300',
  access:{profile:{id:'user-1',roleId:'admin'},
   can:()=>true,canRead:()=>true,canChange:()=>true}
 });
 return {mini,calls,commands,draft};
}
test('signed Telegram sale persists a sale, matched receipt vouchers, deposits and ledger balances in one SQL command',async()=>{
 const f=fixture();
 const response=await f.mini.commit('signed',draftId);
 assert.equal(response.invoiceNumber,'INV-0345');
 assert.equal(response.customerName,'Customer');
 assert.equal(f.commands.length,1);
 const cmd=f.commands[0],changes=cmd.changes;
 assert.equal(cmd.miniSaleSettlement,true);
 assert.equal(changes.filter(x=>x.entity==='invoices').length,1);
 assert.equal(changes.filter(x=>x.entity==='vouchers').length,2);
 assert.equal(changes.filter(x=>x.entity==='treasuries').length,2);
 assert.equal(changes.filter(x=>x.entity==='accounts').length,6);
 assert.equal(changes.filter(x=>x.entity==='journalEntries').length,2);
 assert.equal(changes.filter(x=>x.entity==='stockMovements').length,1);
 assert.equal(changes.filter(x=>x.entity==='inventory').length,1);
 assert.equal(changes.filter(x=>x.entity==='parties').length,1);
 assert.ok(changes.filter(x=>x.entity==='vouchers').every(x=>x.value.type==='receipt'));
 assert.ok(changes.filter(x=>x.entity==='treasuries').every(x=>x.value.transactions[0].type==='deposit'));
 assert.equal(f.calls.filter(c=>c.sql.startsWith('UPDATE sync_telegram_pos_drafts')).length,1);
 assert.ok(f.calls.some(c=>c.sql.startsWith('SELECT next_sequence')&&c.sql.includes('FOR UPDATE')));
});
test('print order is a nonfinancial printOrders record only, without receipt or withdrawal',async()=>{
 const f=fixture({kind:'print'});
 const response=await f.mini.commit('signed',draftId);
 assert.equal(response.documentType,'print');
 assert.equal(response.invoiceNumber,'JOB-2026-0001');
 assert.equal(f.commands.length,1);
 assert.deepEqual(f.commands[0].changes.map(x=>x.entity),['printOrders']);
});
test('unauthorized financial postings are rejected before touching the SQL record state',async()=>{
 const f=fixture();
 f.mini.session=async()=>({user:{id:'user-1'},telegramUserId:'300',
  access:{profile:{id:'user-1',roleId:'restricted'},
   can:k=>k!=='add',canRead:()=>true,canChange:()=>false}});
 await assert.rejects(()=>f.mini.commit('signed',draftId),
  /TELEGRAM_POS_PERMISSION_DENIED|ENTITY_PERMISSION_DENIED/);
 assert.equal(f.commands.length,0);
});
