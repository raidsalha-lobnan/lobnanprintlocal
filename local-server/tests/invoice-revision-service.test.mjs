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
  journalEntries:options.duplicate?[...originalJournals,j('duplicate','pos_invoice',8)]:originalJournals,
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
test('historical warehouse/global stock difference preserves the offset on approved invoice revision',async()=>{
 const f=fixture({ambiguous:true});
 const receipt=await revisePostedInvoice(f.svc,'lobnan_main',req,'admin',access);
 assert.equal(f.commands,1);
 const inventory=receipt.changes.find(x=>x.entity==='inventory');
 assert.equal(inventory.value.stockQuantity,530);
 assert.equal(inventory.value.warehouseStocks.main,890);
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
 assert.equal(result.changes.find(c=>c.entity==='journalEntries'&&c.value.correctionKind==='revenue').value.lines[0].debit,0.6);
 assert.equal(result.changes.filter(c=>c.entity==='parties').length,0);
});
