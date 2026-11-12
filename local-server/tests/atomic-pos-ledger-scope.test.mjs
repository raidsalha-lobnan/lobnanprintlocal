import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeCommand} from '../access-policy.mjs';
import {authoritativeAtomicSaleEffect} from '../atomic-pos-ledger-scope.mjs';

const invoiceId='inv-pos-guarded';
const invoice={id:invoiceId,invoiceNumber:'TEMP-'+invoiceId,
  customerId:'customer-a',counterpartyType:'customer',counterpartyId:'customer-a',
  isAccountingPosted:true,date:'2026-11-13',
  totalAmount:20,baseTotalAmount:20,basePaidAmount:0,exchangeRate:1,
  remainingAmount:20,subtotal:20,discountTotal:0,taxAmount:0,additionalCharges:0,
  items:[{itemId:'sku-one',quantity:2,unitPrice:10,discount:0,category:'print_raw'}]};
const oldParty={id:'customer-a',type:'customer',code:'CUST-0002',name:'Customer',
  balance:15,phone:'xxx',creditLimit:250};
const oldItem={id:'sku-one',code:'PRI-0001',name:'Paper',purchasePrice:4,
  stockQuantity:10,category:'print_raw',lastMovementDate:'2026-11-12'};
const c=(entity,id,value,expectedVersion=0)=>({entity,id,value,expectedVersion});
const bundle=()=>({
 id:'cmd-atomic-guarded',workspaceId:'lobnan_main',atomicInvoiceId:invoiceId,changes:[
  c('invoices',invoiceId,structuredClone(invoice)),
  c('journalEntries','j-revenue',{id:'j-revenue',referenceId:invoiceId,referenceType:'pos_invoice',
   lines:[{accountCode:'1201',debit:20,credit:0},{accountCode:'4101',debit:0,credit:20}]}),
  c('journalEntries','j-cost',{id:'j-cost',referenceId:invoiceId,referenceType:'cogs',
   lines:[{accountCode:'5101',debit:8,credit:0},{accountCode:'1301',debit:0,credit:8}]}),
  c('stockMovements','move-one',{id:'move-one',itemId:'sku-one',type:'out_sale',
   sourceInvoiceId:invoiceId,referenceType:'pos_invoice',referenceNumber:'TEMP-'+invoiceId,
   quantity:2,unitPrice:4,totalValue:8,balanceBefore:10,balanceAfter:8}),
  c('parties','customer-a',{...oldParty,balance:35},1),
  c('inventory','sku-one',{...oldItem,stockQuantity:8,lastMovementDate:'2026-11-13'},1)
 ]
});
const fakePool={
 query:async (sql,args)=>{
  if(sql.startsWith('SELECT fingerprint,actor_id'))return {rows:[]};
  if(sql.startsWith('SELECT value FROM sync_records')){
   const [workspace,entity,id]=args;
   if(workspace==='lobnan_main'&&entity==='inventory'&&id==='sku-one')return {rows:[{value:oldItem}]};
   if(workspace==='lobnan_main'&&entity==='parties'&&id==='customer-a')return {rows:[{value:oldParty}]};
   return {rows:[]};
  }
  throw Error('Unexpected SQL '+sql);
 }
};
const posUser={
  profile:{id:'cashier1',roleId:'r1'},can:(key)=>['view','view_pos','add'].includes(key),
  canRead:(entity)=>entity==='invoices',canChange:(entity)=>entity==='invoices'
};

test('POS-only cashier can post precisely scoped complete accounting effects',async()=>{
 await authorizeCommand(fakePool,'lobnan_main',posUser,bundle());
});

test('POS-only cashier cannot post arbitrary standalone journal entries',async()=>{
 const command={id:'standalone',workspaceId:'lobnan_main',changes:[
  c('journalEntries','j-solo',{id:'j-solo',
   lines:[{accountCode:'1201',debit:20,credit:0},{accountCode:'4101',debit:0,credit:20}]})
 ]};
 await assert.rejects(authorizeCommand(fakePool,'lobnan_main',posUser,command),
  /ENTITY_PERMISSION_DENIED/);
});

test('atomic POS cannot smuggle a customer name, credit limit or inventory cost change',async()=>{
 const cmd=bundle();
 cmd.changes.find(c=>c.entity==='parties').value.creditLimit=1000000;
 await assert.rejects(authorizeCommand(fakePool,'lobnan_main',posUser,cmd),
  /ATOMIC_POS_DEBTOR_METADATA_CHANGE_FORBIDDEN/);
 const next=bundle();
 next.changes.find(c=>c.entity==='inventory').value.purchasePrice=0;
 await assert.rejects(authorizeCommand(fakePool,'lobnan_main',posUser,next),
  /ATOMIC_POS_STOCK_METADATA_CHANGE_FORBIDDEN/);
});

test('atomic POS refuses stale purchase cost before accepting sale evidence',()=>{
 const cmd=bundle();
 const item=cmd.changes.find(c=>c.entity==='inventory');
 assert.throws(()=>authoritativeAtomicSaleEffect(cmd,item,{...oldItem,purchasePrice:5}),
  /ATOMIC_POS_COST_CHANGED_REFRESH_SALE/);
});
test('atomic financial quantity and balance changes retain unrelated identity fields',()=>{
 const cmd=bundle();
 const inv=authoritativeAtomicSaleEffect(cmd,cmd.changes.find(c=>c.entity==='inventory'),oldItem);
 const party=authoritativeAtomicSaleEffect(cmd,cmd.changes.find(c=>c.entity==='parties'),oldParty);
 assert.equal(inv.stockQuantity,8);
 assert.equal(inv.code,'PRI-0001');
 assert.equal(party.balance,35);
 assert.equal(party.creditLimit,250);
});
