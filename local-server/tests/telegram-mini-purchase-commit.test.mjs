import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramMiniPos} from '../telegram-mini-pos.mjs';
import {telegramRelevantChanges} from '../telegram-delivery.mjs';
const draftId='877ce039-0836-4c44-b963-2f0423792c90';
const date='2026-11-14';
const account=(code,type='asset')=>({entity:'accounts',record_id:'acct-'+code,version:2,
 value:{code,name:'Account '+code,type,balance:100}});
const records=[
 {entity:'parties',record_id:'supplier-1',version:2,
  value:{id:'supplier-1',name:'Vendor',code:'SUPP-0001',type:'supplier',balance:-50}},
 {entity:'inventory',record_id:'item-1',version:5,
  value:{id:'item-1',name:'Paper',code:'PRI-00001',category:'printing',
   stockQuantity:10,purchasePrice:1,sellingPrice:2,unit:'piece'}},
 {entity:'treasuries',record_id:'cash-1',version:5,
  value:{id:'cash-1',name:'Main Cash',type:'cash_box',status:'active',accountCode:'1101',
   balance:600,currencyBalances:{ILS:600},transactions:[]}},
 {entity:'warehouses',record_id:'main',version:2,value:{id:'main',name:'الرئيسي'}},
 {entity:'settings',record_id:'global',version:2,value:{vatRate:0}},
 account('1302'),account('2101','liability'),account('2103'),
 account('1101'),account('5105','expense')
];
const body={
 date,documentType:'purchase',customerId:'supplier-1',overallDiscount:0,
 counterpartyKind:'supplier',paymentMethod:'credit',
 cashPaidAmount:0,bankPaidAmount:0,notes:'Main',paymentNotes:'Payment note',
 items:[{itemId:'item-1',quantity:2,unitPrice:7,hasDimensions:false,notes:'Line'}]
};
function fixture({type='purchase',employee=false,missingAccount=false}={}){
 const calls=[],pushes=[];
 const value={...body,documentType:type,expenseAccountCode:type==='expense'?'5105':'',
  expenseCategory:'utilities'};
 const data=missingAccount?records.filter(r=>r.record_id!=='acct-1302'):records;
 const draft={body:value,status:'draft',created_at:date+'T14:00:00Z'};
 const pg={
  async query(sql,args){
   calls.push({sql,args});
   if(sql.includes('FROM sync_telegram_pos_drafts')&&sql.includes('FOR UPDATE'))
    return {rows:[draft]};
   if(sql.startsWith('INSERT INTO sync_workspaces'))return {rows:[]};
   if(sql.startsWith('SELECT next_sequence'))return {rows:[{next_sequence:12}]};
   if(sql.startsWith('SELECT entity,record_id,version,value FROM sync_records'))
    return {rows:data};
   if(sql.includes("value->>'invoiceNumber' AS code"))return {rows:[{
    code:type==='purchase'?'PUR-2026-0044':'EXP-2026-0003'}]};
   if(sql.startsWith('UPDATE sync_telegram_pos_drafts'))return {rowCount:1};
   if(sql.startsWith('SELECT value FROM sync_records'))return{
    rows:[{value:{invoiceNumber:type==='purchase'?'PUR-2026-0045':'EXP-2026-0004',
     totalAmount:14,supplierName:'Vendor',beneficiary:'Vendor'}}]};
   throw Error('UNEXPECTED_PG_SQL '+sql);
  }
 };
 const pool={query:async sql=>{
  if(sql.startsWith('SELECT fingerprint,actor_id FROM sync_commands'))return {rows:[]};
  if(sql.startsWith('SELECT value FROM sync_records'))return {rows:[]};
  throw Error('UNEXPECTED_ROOT_SQL '+sql);
 }};
 let txCalls=0;
 const sync={
  withTx:async fn=>{txCalls++;return fn(pg);},
  pushInTx:async(_workspace,cmd,_actor,client)=>{
   assert.equal(client,pg);
   pushes.push(cmd);
   return {changes:cmd.changes};
  }
 };
 const mini=new TelegramMiniPos(pool,'lobnan_main',sync);
 mini.session=async()=>({user:{id:'usr-1',name:'Tester'},telegramUserId:'100',
  access:{profile:{id:'usr-1',roleId:'admin'},can:()=>true,
   canRead:()=>true,canChange:()=>true}});
 return {mini,calls,pushes,draft,pg,txCalls:()=>txCalls};
}
test('purchase commit is one draft checkpoint and one authorized SQL command with purchase inventory and journal',async()=>{
 const f=fixture();
 const out=await f.mini.commit('telegram',draftId);
 assert.equal(out.invoiceNumber,'PUR-2026-0045');
 assert.equal(out.documentType,'purchase');
 assert.equal(f.txCalls(),1);
 assert.equal(f.pushes.length,1);
 const c=f.pushes[0];
 assert.equal(c.id,draftId);
 assert.equal(c.changes.filter(x=>x.entity==='purchases').length,1);
 assert.equal(c.changes.filter(x=>x.entity==='stockMovements').length,1);
 assert.equal(c.changes.filter(x=>x.entity==='inventory').length,1);
 assert.equal(c.changes.filter(x=>x.entity==='journalEntries').length,1);
 assert.equal(c.changes.find(x=>x.entity==='purchases').value.source,'telegram-mini');
 assert.ok(f.calls.some(x=>x.sql.includes('FOR UPDATE')));
 assert.equal(f.calls.filter(x=>x.sql.startsWith('UPDATE sync_telegram_pos_drafts')).length,1);
 assert.equal(telegramRelevantChanges(c.changes).length,1);
 assert.equal(telegramRelevantChanges(c.changes)[0].entity,'purchases');
});
test('expense commit creates one official expense-purchase invoice and does not alter stock',async()=>{
 const f=fixture({type:'expense'});
 const out=await f.mini.commit('telegram',draftId);
 assert.equal(out.invoiceNumber,'EXP-2026-0004');
 assert.equal(out.documentType,'expense');
 assert.equal(f.pushes.length,1);
 const changes=f.pushes[0].changes;
 assert.equal(changes.filter(x=>x.entity==='expenses').length,1);
 assert.equal(changes.filter(x=>x.entity==='purchases').length,0);
 assert.equal(changes.filter(x=>x.entity==='inventory'||x.entity==='stockMovements').length,0);
 assert.equal(changes.find(x=>x.entity==='expenses').value.documentType,'purchase_invoice');
 assert.equal(telegramRelevantChanges(changes).length,1);
 assert.equal(telegramRelevantChanges(changes)[0].entity,'expenses');
});
test('missing accounts reject the entire purchase before any record or draft is marked posted',async()=>{
 const f=fixture({missingAccount:true});
 await assert.rejects(f.mini.commit('telegram',draftId),
  /MINI_FINANCIAL_ACCOUNT_NOT_CONFIGURED_1302/);
 assert.equal(f.pushes.length,0);
 assert.equal(f.calls.filter(x=>x.sql.startsWith('UPDATE sync_telegram_pos_drafts')).length,0);
});
test('purchase and expense posted retries never create new records or allocate a new number',async()=>{
 for(const type of ['purchase','expense']){
  const f=fixture({type});f.draft.status='posted';
  const out=await f.mini.commit('telegram',draftId);
  assert.equal(out.alreadyPosted,true);
  assert.equal(f.pushes.length,0);
  assert.equal(f.calls.filter(x=>x.sql.includes('FOR UPDATE')).length,1);
 }
});
