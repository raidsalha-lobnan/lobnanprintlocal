import test from 'node:test';
import assert from 'node:assert/strict';
import {revisePostedInvoice} from '../invoice-revision-service.mjs';
const invoice={
 id:'i66',invoiceNumber:'INV-0066',date:'2026-11-04',isOfficial:true,
 isAccountingPosted:true,warehouse:'main',customerId:'cust',paymentMethod:'credit',
 subtotal:50.4,totalAmount:50.4,baseTotalAmount:50.4,paidAmount:0,basePaidAmount:0,
 items:[
  {itemId:'paper',quantity:68,unitPrice:0.2,total:13.6,category:'print_raw'},
  {itemId:'paper',quantity:64,unitPrice:0.2,total:12.8,category:'print_raw'},
  {itemId:'card',quantity:12,unitPrice:2,total:24,category:'print_raw'}]
};
const j=(id,type,amt)=>({record_id:id,version:1,value:{id,referenceId:'i66',referenceType:type,
 lines:[{accountCode:type==='cogs'?'5101':'1201',debit:amt,credit:0},
 {accountCode:type==='cogs'?'1301':'4101',debit:0,credit:amt}]}});
const originalJournals=[j('sales','pos_invoice',50.4),j('cost','cogs',144)];
const movements=[
 {record_id:'paper-move',version:1,value:{id:'paper-move',date:'2026-11-04',
  referenceNumber:'INV-0066',itemId:'paper',type:'out_sale',quantity:132,unitPrice:1,totalValue:132}},
 {record_id:'card-move',version:1,value:{id:'card-move',date:'2026-11-04',
  referenceNumber:'INV-0066',itemId:'card',type:'out_sale',quantity:12,unitPrice:1,totalValue:12}}
];
const req={commandId:'revision-command-0066',invoiceId:'i66',expectedVersion:2,
 proposed:{...invoice,subtotal:51,totalAmount:51,baseTotalAmount:51,items:[
  {...invoice.items[0],quantity:1,unitPrice:14,total:14},
  {...invoice.items[1],quantity:1,unitPrice:13,total:13},invoice.items[2]]}};
const fixture=(options={})=>{
 const history=new Map();
 const sourceInvoice=options.employee?{
  ...invoice,customerId:'emp1',counterpartyType:'employee',counterpartyId:'emp1',employeeId:'emp1'
 }:invoice;
 const records={
  journalEntries:options.missingJournals?[]:options.duplicate?[...originalJournals,j('duplicate','pos_invoice',8)]:originalJournals,
  stockMovements:movements,
  parties:[{id:'cust',version:31,value:{id:'cust',balance:1246.4}}],
  inventory:[{id:'paper',version:1,value:{id:'paper',stockQuantity:400,
   warehouseStocks:{main:options.ambiguous?760:400}}},
   {id:'card',version:1,value:{id:'card',stockQuantity:15,warehouseStocks:{main:15}}}]
 };
 let commands=0;
 const client={async query(sql,values){
  if(sql.startsWith('SELECT request_fingerprint')){const saved=history.get(values[1]);return {rows:saved?[saved]:[]}}
  if(sql.includes("entity='invoices'"))return {rows:[{version:2,value:sourceInvoice}]};
  if(sql.includes("entity='employees'"))return {rows:options.employee?[{record_id:'emp1'}]:[]};
  if(sql.includes("entity='journalEntries'"))return {rows:records.journalEntries};
  if(sql.includes("entity='stockMovements'"))return {rows:records.stockMovements};
  if(sql.includes("entity='parties'"))return {rows:records.parties};
  if(sql.includes("entity='inventory'"))return {rows:records.inventory};
  if(sql.includes("entity='warehouses'"))return {rows:[{
   id:'wh-1',value:{id:'wh-1',name:'main',code:'WH-01',isDefault:true}
  }]};
  if(sql.startsWith('INSERT INTO sync_invoice_revision_requests')){
   history.set(values[1],{request_fingerprint:values[3],actor_id:values[4],receipt:JSON.parse(values[5])});return {rows:[]};
  }
  if(sql.startsWith('INSERT INTO sync_workspaces')||sql.startsWith('SELECT next_sequence,next_invoice'))return {rows:[{next_sequence:1,next_invoice:66}]};
  throw Error('unexpected query '+sql);
 }};
 const svc={withTx:async fn=>fn(client),pushInTx:async(_w,cmd,_actor,_client,allowedId)=>{
  commands++;assert.equal(allowedId,'i66');return {commandId:cmd.id,changes:cmd.changes};
 }};
 return {svc,get commands(){return commands}};
};
const access={canReviseInvoice:()=>true};
test('revision is assembled in one trusted central command and same request is idempotent',async()=>{
 const f=fixture();
 const first=await revisePostedInvoice(f.svc,'lobnan_main',req,'admin',access);
 const retry=await revisePostedInvoice(f.svc,'lobnan_main',req,'admin',access);
 assert.deepEqual(JSON.parse(JSON.stringify(first)),retry);
 assert.equal(f.commands,1);
 assert.equal(first.changes.find(c=>c.entity==='invoices').value.totalAmount,51);
 assert.equal(first.changes.find(c=>c.entity==='parties').value.balance,1247);
});
test('duplicate historical journals fail before any posting',async()=>{
 const f=fixture({duplicate:true});
 await assert.rejects(revisePostedInvoice(f.svc,'lobnan_main',req,'admin',access),
  /BASELINE_NEEDS_RECONCILIATION/);
 assert.equal(f.commands,0);
});
test('one registered warehouse normalizes the historical stock cache after revision',async()=>{
 const f=fixture({ambiguous:true});
 const receipt=await revisePostedInvoice(f.svc,'lobnan_main',req,'admin',access);
 assert.equal(f.commands,1);
 const inventory=receipt.changes.find(x=>x.entity==='inventory');
 assert.equal(inventory.value.stockQuantity,530);
 assert.equal(inventory.value.warehouseStocks.main,530);
 assert.equal(inventory.value.warehouseStock['wh-1'],530);
 assert.equal(inventory.value.inventoryBalanceReconciliations[0].priorWarehouseCache,760);
});
test('stale expected version and insufficient permissions fail closed',async()=>{
 const f=fixture();
 await assert.rejects(revisePostedInvoice(f.svc,'lobnan_main',
  {...req,expectedVersion:1},'admin',access),/VERSION_CONFLICT/);
 await assert.rejects(revisePostedInvoice(f.svc,'lobnan_main',
  req,'nonadmin',{canReviseInvoice:()=>false}),/PERMISSION_DENIED/);
 assert.equal(f.commands,0);
});

test('employee invoice correction updates posted invoice and journal without inventing a customer party balance',async()=>{
 const f=fixture({employee:true});
 const proposal={...req.proposed,customerId:'emp1',counterpartyType:'employee',
  counterpartyId:'emp1',employeeId:'emp1'};
 const result=await revisePostedInvoice(f.svc,'lobnan_main',
  {...req,commandId:'employee-revision',proposed:proposal},'admin',access);
 assert.equal(f.commands,1);
 assert.equal(result.changes.find(c=>c.entity==='invoices').value.customerId,'emp1');
 assert.equal(result.changes.find(c=>c.entity==='journalEntries'&&c.value.correctionKind==='financial').value.lines[0].debit,0.6);
 assert.equal(result.changes.filter(c=>c.entity==='parties').length,0);
});

test('unchanged invoice with irreconcilable legacy journals returns an authoritative no-op without postings',async()=>{
 const f=fixture({duplicate:true});
 const unchanged={...req,commandId:'unchanged-legacy-66',proposed:{
  ...invoice,items:invoice.items.map((line,index)=>({...line,id:'ui-rebuilt-'+index}))
 }};
 const result=await revisePostedInvoice(f.svc,'lobnan_main',unchanged,'admin',access);
 assert.equal(f.commands,0);
 assert.equal(result.changes.length,1);
 assert.equal(result.changes[0].entity,'invoices');
 assert.equal(result.changes[0].version,2);
 assert.deepEqual(result.changes[0].value,invoice);
 const retry=await revisePostedInvoice(f.svc,'lobnan_main',unchanged,'admin',access);
 assert.deepEqual(retry,result);
 assert.equal(f.commands,0);
});
test('real monetary change remains blocked when historical journals are duplicated',async()=>{
 const f=fixture({duplicate:true});
 await assert.rejects(revisePostedInvoice(f.svc,'lobnan_main',req,'admin',access),
  /BASELINE_NEEDS_RECONCILIATION/);
 assert.equal(f.commands,0);
});
test('unchanged invoice cannot bypass version or permissions',async()=>{
 const f=fixture({duplicate:true});
 const unchanged={...req,commandId:'unchanged-guard',proposed:invoice};
 await assert.rejects(revisePostedInvoice(f.svc,'lobnan_main',
  {...unchanged,expectedVersion:1},'admin',access),/VERSION_CONFLICT/);
 await assert.rejects(revisePostedInvoice(f.svc,'lobnan_main',
  unchanged,'operator',{canReviseInvoice:()=>false}),/PERMISSION_DENIED/);
 assert.equal(f.commands,0);
});

test('description-only revision is posted once without financial side effects, even with duplicated legacy journals',async()=>{
 const f=fixture({duplicate:true});
 const proposed={...invoice,notes:'توضيح بعد المراجعة',
  items:invoice.items.map((item,index)=>({...item,id:'recreated-'+index,
   ...(index===0?{description:'ملاحظة طباعية'}:{})}))};
 const result=await revisePostedInvoice(f.svc,'lobnan_main',
  {...req,commandId:'descriptive-review-66',proposed},'admin',access);
 assert.equal(f.commands,1);
 assert.equal(result.changes.length,1);
 assert.equal(result.changes[0].entity,'invoices');
 assert.equal(result.changes[0].value.notes,'توضيح بعد المراجعة');
 assert.equal(result.changes[0].value.items[0].description,'ملاحظة طباعية');
 assert.equal(result.changes[0].value.items[0].id,invoice.items[0].id);
 assert.equal(result.changes.filter(c=>['journalEntries','inventory','stockMovements','parties'].includes(c.entity)).length,0);
});

test('missing accounting journal rejects legacy financial changes with actionable evidence and no posting',async()=>{
 const f=fixture({missingJournals:true});
 let actual;
 try{await revisePostedInvoice(f.svc,'lobnan_main',req,'admin',access);}
 catch(error){actual=error;}
 assert.equal(actual?.message,'INVOICE_REVISION_BASELINE_NEEDS_RECONCILIATION');
 assert.equal(actual?.status,409);
 assert.equal(actual?.detail?.invoiceNumber,'INV-0066');
 assert.equal(actual?.detail?.diagnosis?.salesJournalCount,0);
 assert.equal(actual?.detail?.diagnosis?.cogsJournalCount,0);
 assert.equal(actual?.detail?.diagnosis?.stockMovementCandidateCount,2);
 assert.equal(actual?.detail?.diagnosis?.baselineRequiresAccountantReview,true);
 assert.equal(f.commands,0);
});
