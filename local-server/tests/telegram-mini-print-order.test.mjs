import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramMiniPos} from '../telegram-mini-pos.mjs';
const draftId='d0137980-8e9c-4c98-bffe-f0ad36f15d84';
const main={id:'pt-main',type:'customer',name:'شركة تجريبية',code:'CUST-2001',phone:''};
const item={id:'item-a',name:'لوحة مطبوعة',code:'PRI-00001',unit:'م²',sellingPrice:30,stockQuantity:100};
const body={documentType:'print',date:'2026-11-14',customerId:main.id,
 paymentMethod:'credit',paidAmount:0,cashPaidAmount:0,bankPaidAmount:0,
 notes:'الطباعة قبل الغد',paymentNotes:'',
 items:[{itemId:item.id,hasDimensions:true,length:1,width:2,count:2,quantity:4,unitPrice:30,notes:'ألوان خاصة'}]};
function fixture(){
 const calls=[],mutations=[];
 const pg={
  query:async(sql,args)=>{
   calls.push(sql);
   if(sql.includes("entity='parties'"))return {rows:[{entity:'parties',record_id:main.id,value:main}]};
   if(sql.includes("entity='inventory'"))return {rows:[{record_id:item.id,value:item}]};
   if(sql.startsWith('INSERT INTO sync_workspaces'))return {rows:[]};
   if(sql.startsWith('SELECT next_sequence FROM sync_workspaces'))return {rows:[{next_sequence:1}]};
   if(sql.includes("value->>'orderNumber' AS code"))return {rows:[{code:'JOB-2026-0010'}]};
   if(sql.includes("UPDATE sync_telegram_pos_drafts SET"))return {rowCount:1,rows:[]};
   throw Error('UNEXPECTED_TRANSACTION_SQL '+sql);
  }
 };
 const pool={query:async sql=>{
  if(sql.startsWith('SELECT fingerprint,actor_id FROM sync_commands'))return {rows:[]};
  if(sql.startsWith('SELECT value FROM sync_records'))return {rows:[]};
  throw Error('UNEXPECTED_POOL_SQL '+sql);
 }};
 const service={pushInTx:async(_workspace,command)=>{
  mutations.push(command);
  return {changes:command.changes};
 }};
 const mini=new TelegramMiniPos(pool,'lobnan_main',service);
 const auth={user:{id:'usr-1'},access:{
  profile:{id:'usr-1',roleId:'role-1'},can:()=>true,
  canRead:()=>true,canChange:()=>true
 }};
 const draft={status:'draft',body,created_at:'2026-11-14T10:00:00.000Z'};
 return {mini,pg,auth,draft,calls,mutations};
}
test('print order is one authorized printOrders-only write with a unique year sequence and no accounting side effects',async()=>{
 const f=fixture();
 const result=await f.mini.commitPrintOrderInTx(f.pg,f.auth,draftId,f.draft);
 assert.equal(result.invoiceNumber,'JOB-2026-0011');
 assert.equal(result.documentType,'print');
 assert.equal(result.totalAmount,0);
 assert.equal(f.mutations.length,1);
 const command=f.mutations[0];
 assert.equal(command.atomicInvoiceId,undefined);
 assert.equal(command.changes.length,1);
 assert.equal(command.changes[0].entity,'printOrders');
 const saved=command.changes[0].value;
 assert.equal(saved.status,'new');
 assert.equal(saved.totalPrice,0);
 assert.equal(saved.depositPaid,0);
 assert.equal(saved.remainingBalance,0);
 assert.equal(saved.customerName,main.name);
 assert.equal(saved.items.length,1);
 assert.equal(saved.items[0].notes,'ألوان خاصة');
 assert.equal(saved.items[0].total,0);
 assert.equal(saved.items[0].unitPrice,0);
 assert.equal(saved.notes,'الطباعة قبل الغد');
 assert.ok(f.calls.some(sql=>sql.includes('FOR UPDATE')));
 assert.ok(f.calls.some(sql=>sql.includes('UPDATE sync_telegram_pos_drafts SET')));
});
test('print order cannot contain a payment and cannot create an invoice',async()=>{
 const f=fixture();f.draft.body={...body,cashPaidAmount:25,cashTreasuryCode:'1101'};
 await assert.rejects(f.mini.commitPrintOrderInTx(f.pg,f.auth,draftId,f.draft),
  /MINI_PRINT_ORDER_FINANCIAL_PAYMENT_NOT_ALLOWED/);
 assert.equal(f.mutations.length,0);
});
test('print order requires the correct role permission',async()=>{
 const f=fixture();
 f.auth.access.can=key=>key!=='view_print_orders';
 await assert.rejects(f.mini.commitPrintOrderInTx(f.pg,f.auth,draftId,f.draft),
  /MINI_PRINT_ORDER_PERMISSION_DENIED/);
 assert.equal(f.mutations.length,0);
});
test('posted print order is idempotent and never posts another operation',async()=>{
 const f=fixture();f.draft.status='posted';
 const order={id:'job-mini-'+draftId,orderNumber:'JOB-2026-0011',
   customerName:main.name,totalPrice:0};
 f.pg.query=async sql=>{
  if(sql.includes("entity='printOrders'"))return {rows:[{value:order}]};
  throw Error('UNEXPECTED_SQL');
 };
 const result=await f.mini.commitPrintOrderInTx(f.pg,f.auth,draftId,f.draft);
 assert.equal(result.alreadyPosted,true);
 assert.equal(result.invoiceNumber,order.orderNumber);
 assert.equal(f.mutations.length,0);
});
