import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SyncCommand,StoredRecord,JsonObject} from '../src/sync-next/types';
import {compareDeviceQueueWithPostgresV2} from '../src/sync-next/deviceQueueReviewV2';

function row(entity:StoredRecord['entity'],id:string,version:number,value:Record<string,unknown>):StoredRecord{
 return {key:entity+'\u001f'+id,entity,id,version,value:value as JsonObject};
}
function cmd(id:string,status:SyncCommand['status'],error:string,
 changes:SyncCommand['changes']):SyncCommand{
 return {id,workspaceId:'lobnan_main',createdAt:1794480000000,status,error,
   attempts:0,retryAt:0,changes};
}
test('authoritative V2 review compares 73-style rejected party snapshots, invoices and SKU collisions without writes',()=>{
 const parties=Array.from({length:11},(_,i)=>row('parties','pt-'+i,27,{
   id:'pt-'+i,code:'CUST-'+i,name:'private customer '+i,balance:i*10,
   phone:'private-phone-'+i
 }));
 const bulk=cmd('bulk-rejected','rejected','BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION',
   parties.map((p,i)=>({entity:'parties',id:p.id,expectedVersion:27,value:{
      ...p.value!, ...(i===4?{name:'local private customer'}:{})
   }})));
 const invoiceServer=row('invoices','inv-1',2,{
   id:'inv-1',invoiceNumber:'INV-0069',totalAmount:40,
   customerName:'private customer name',lineItems:[{name:'sensitive item'}]
 });
 const invoice=cmd('permission-denied','rejected','ENTITY_PERMISSION_DENIED',
  [{entity:'invoices',id:'inv-1',expectedVersion:1,value:{
    ...invoiceServer.value!,totalAmount:45}}]);
 const inventoryServer=row('inventory','existing-id',5,{
   id:'existing-id',name:'Existing item',code:'PRI-00015',stockQuantity:2,purchasePrice:500
 });
 const inventory=cmd('serial-rejected','rejected','ENTITY_SERIAL_ALREADY_USED',
  [{entity:'inventory',id:'local-new-id',expectedVersion:0,value:{
    id:'local-new-id',name:'Wanted item',code:'PRI-00015',_serverAutoCode:true,
    stockQuantity:100,purchasePrice:200,secretToken:'UNSAFE-PASSWORD'
  }}]);
 const pending=cmd('pending-item-edit','pending','',
  [{entity:'inventory',id:'local-new-id',expectedVersion:1,value:{
    id:'local-new-id',name:'Wanted item revised',code:'PRI-00015'
  }}]);
 const report=compareDeviceQueueWithPostgresV2([bulk,invoice,inventory,pending],
  [...parties,invoiceServer,inventoryServer],'2026-11-12T10:38:51.063Z');
 assert.equal(report.financialWrites,0);
 assert.equal(report.stockWrites,0);
 assert.equal(report.bulk[0].identical,10);
 assert.equal(report.bulk[0].different,1);
 assert.equal(report.bulk[0].missing,0);
 assert.equal(report.rejectedInvoices[0].number,'INV-0069');
 assert.equal(report.rejectedInvoices[0].financialFieldsDiffer,true);
 assert.equal(report.rejectedInventory[0].requestedCode,'PRI-00015');
 assert.equal(report.rejectedInventory[0].serverSameIdExists,false);
 assert.equal(report.rejectedInventory[0].duplicateCodeOwners[0].id,'existing-id');
 assert.equal(report.rejectedInventory[0].dependentCommands.length,1);
 const exported=JSON.stringify(report);
 for(const sensitive of ['private customer','private-phone','UNSAFE-PASSWORD',
   'purchasePrice','stockQuantity','sensitive item','500','200','100'])
   assert.ok(!exported.includes(sensitive),'leaked sensitive field '+sensitive);
});
test('older versions and absent authoritative records are not misclassified as proven no-ops',()=>{
 const local={id:'pt-1',name:'Private',balance:70};
 const rejected=cmd('bulk','rejected','BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION',
   Array.from({length:11},(_,i)=>({entity:'parties',id:'pt-'+i,expectedVersion:27,value:local})));
 const report=compareDeviceQueueWithPostgresV2([rejected],[
   row('parties','pt-0',26,local)
 ]);
 assert.equal(report.bulk[0].olderServerVersion,1);
 assert.equal(report.bulk[0].missing,10);
 assert.equal(report.bulk[0].identical,0);
});
