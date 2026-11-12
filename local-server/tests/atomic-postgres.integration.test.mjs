import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pg from 'pg';
import {SyncService} from '../sync-service.mjs';

const url=process.env.TEST_DATABASE_URL;
const record=(entity,id,value,expectedVersion=0)=>({entity,id,value,expectedVersion});
function sale(id,version,stockBefore,partyBefore){
 const invoice={id,invoiceNumber:'TEMP-'+id,customerId:'main',counterpartyType:'customer',
  counterpartyId:'main',date:'2026-11-13',totalAmount:20,baseTotalAmount:20,
  basePaidAmount:0,remainingAmount:20,exchangeRate:1,
  subtotal:20,discountTotal:0,taxAmount:0,additionalCharges:0,
  isAccountingPosted:true,items:[{itemId:'paper',quantity:2,unitPrice:10,discount:0,category:'print_raw'}]};
 return {id:'cmd-'+id,workspaceId:null,atomicInvoiceId:id,changes:[
  record('invoices',id,invoice),
  record('journalEntries','revenue-'+id,{id:'revenue-'+id,referenceType:'pos_invoice',referenceId:id,
   lines:[{accountCode:'1201',debit:20,credit:0},{accountCode:'4101',debit:0,credit:20}]}),
  record('journalEntries','cost-'+id,{id:'cost-'+id,referenceType:'cogs',referenceId:id,
   lines:[{accountCode:'5101',debit:8,credit:0},{accountCode:'1301',debit:0,credit:8}]}),
  record('stockMovements','move-'+id,{id:'move-'+id,
   sourceInvoiceId:id,referenceType:'pos_invoice',referenceNumber:'TEMP-'+id,
   itemId:'paper',itemCode:'PRI-0001',itemName:'Paper',category:'print_raw',
   type:'out_sale',quantity:2,unitPrice:4,totalValue:8,
   balanceBefore:stockBefore,balanceAfter:stockBefore-2}),
  record('parties','main',{id:'main',code:'CUST-0002',name:'Main Customer',type:'customer',
   balance:partyBefore+20},version),
  record('inventory','paper',{id:'paper',code:'PRI-0001',name:'Paper',
   category:'print_raw',stockQuantity:stockBefore-2,purchasePrice:4},version)
 ]};
}
test('real isolated PostgreSQL: atomic financial sale commit, retry and rollback', {skip:!url},async()=>{
 const pool=new pg.Pool({connectionString:url,max:4});
 try{
  const schema=await fs.readFile(new URL('../schema.sql',import.meta.url),'utf8');
  await pool.query(schema);
  const workspace='ci-atomic-'+crypto.randomUUID();
  const svc=new SyncService(pool);
  await svc.push(workspace,{
   id:'seed-inventory-and-party',workspaceId:workspace,changes:[
    record('parties','main',{id:'main',code:'CUST-0002',name:'Main Customer',
     type:'customer',balance:10}),
    record('inventory','paper',{id:'paper',code:'PRI-0001',name:'Paper',
     category:'print_raw',stockQuantity:10,purchasePrice:4})
   ]
  });
  const first=sale('inv-pos-real1',1,10,10);first.workspaceId=workspace;
  const receipt=await svc.push(workspace,first);
  assert.equal(receipt.changes.find(c=>c.entity==='invoices').value.invoiceNumber,'INV-0001');
  assert.deepEqual(await svc.push(workspace,first),receipt);
  let records=(await svc.bootstrap(workspace)).records;
  assert.equal(records.find(x=>x.entity==='inventory').value.stockQuantity,8);
  assert.equal(records.find(x=>x.entity==='parties').value.balance,30);
  assert.equal(records.filter(x=>x.entity==='journalEntries').length,2);
  assert.equal(records.filter(x=>x.entity==='stockMovements').length,1);
  assert.equal(await svc.head(workspace),2);

  // Device B has the same old cached inventory/party versions. PostgreSQL
  // must roll the whole invoice back rather than accept a partial posting.
  const stale=sale('inv-pos-real2',1,10,10);stale.workspaceId=workspace;
  await assert.rejects(svc.push(workspace,stale),/VERSION_CONFLICT/);
  records=(await svc.bootstrap(workspace)).records;
  assert.equal(records.filter(x=>x.entity==='invoices').length,1);
  assert.equal(records.filter(x=>x.entity==='journalEntries').length,2);
  assert.equal(records.filter(x=>x.entity==='stockMovements').length,1);
  assert.equal(records.find(x=>x.entity==='inventory').value.stockQuantity,8);
  assert.equal(await svc.head(workspace),2);

  // Rebuild the same pending business sale from the authoritative records.
  const refreshed=sale('inv-pos-real2',2,8,30);refreshed.workspaceId=workspace;
  await svc.push(workspace,refreshed);
  records=(await svc.bootstrap(workspace)).records;
  assert.equal(records.filter(x=>x.entity==='invoices').length,2);
  assert.equal(records.filter(x=>x.entity==='journalEntries').length,4);
  assert.equal(records.filter(x=>x.entity==='stockMovements').length,2);
  assert.equal(records.find(x=>x.entity==='inventory').value.stockQuantity,6);
  assert.equal(records.find(x=>x.entity==='parties').value.balance,50);
  assert.equal(await svc.head(workspace),3);
  // A new temporary sub-customer is created with an official SUB serial
  // inside the *same* transaction as its first credit invoice.
  const childId='pt-sub-inv-pos-real3';
  const transient=sale('inv-pos-real3',3,6,50);transient.workspaceId=workspace;
  transient.changes[0].value.subCustomerId=childId;
  transient.changes[0].value.subCustomerName='Walk-in Debtor';
  transient.changes[4]=record('parties',childId,{
    id:childId,code:'SUB-0001',_serverAutoCode:true,
    type:'customer',name:'Walk-in Debtor',phone:'',
    isSubCustomer:true,parentPartyId:'main',balance:20,openingBalance:0
  });
  const subReceipt=await svc.push(workspace,transient);
  assert.equal(subReceipt.changes.find(c=>c.entity==='parties').value.code,'SUB-0001');
  const confirmed=(await svc.bootstrap(workspace)).records;
  assert.equal(confirmed.find(c=>c.id===childId).value.balance,20);
  assert.equal(confirmed.find(c=>c.id==='main').value.balance,50);
  assert.equal(confirmed.find(c=>c.id==='paper').value.stockQuantity,4);
  assert.deepEqual(await svc.push(workspace,transient),subReceipt);
  assert.equal(await svc.head(workspace),4);
 }finally{await pool.end();}
});
