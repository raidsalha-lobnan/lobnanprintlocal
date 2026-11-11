import test from 'node:test';
import assert from 'node:assert/strict';
import {SyncService} from '../sync-service.mjs';

// A realistic transaction harness with rollback and idempotency receipts.
// No access to production PostgreSQL.
const key=(...xs)=>xs.join(':');
class PgFake{
 state={workspaces:new Map(),records:new Map(),commands:new Map(),claims:new Map(),events:[]};
 async connect(){let tx;const me=this;return {
  release(){},async query(sql,p=[]){
   if(sql.startsWith('BEGIN')){tx=structuredClone(me.state);return {rows:[]};}
   if(sql==='COMMIT'){me.state=tx;return {rows:[]};}
   if(sql==='ROLLBACK'){return {rows:[]};}
   return me.execute(sql,p,tx);
  }}}
 async query(sql,p=[]){return this.execute(sql,p,this.state)}
 execute(sql,p,s){const rows=[];
  if(sql.startsWith('INSERT INTO sync_workspaces')){if(!s.workspaces.has(p[0]))s.workspaces.set(p[0],{next_sequence:0,next_invoice:0});}
  else if(sql.startsWith('SELECT next_sequence,next_invoice')){rows.push({...s.workspaces.get(p[0])});}
  else if(sql.startsWith('SELECT next_sequence FROM sync_workspaces')){const w=s.workspaces.get(p[0]);if(w)rows.push(w);}
  else if(sql.startsWith('SELECT fingerprint,receipt')){const v=s.commands.get(key(p[0],p[1]));if(v)rows.push(v);}
  else if(sql.startsWith('SELECT record_id AS id FROM sync_records') && sql.includes("entity='warehouses'")){
   // This isolated fixture has no warehouse records; production normalizes
   // warehouse IDs only when exactly one warehouse exists.
  }
  else if(sql.startsWith("SELECT value->>'code' AS code FROM sync_records")){
   for(const row of s.records.values()){
    if(row.workspace===p[0]&&row.entity===p[1])rows.push({code:row.value?.code});
   }
  }
  else if(sql.startsWith('SELECT version,value FROM sync_records')){const v=s.records.get(key(p[0],p[1],p[2]));if(v)rows.push(v);}
  else if(sql.startsWith('SELECT record_id FROM sync_records')){const found=Array.from(s.records.values()).find(v=>v.workspace===p[0]&&v.entity==='journalEntries'&&v.value?.referenceId===p[1]&&v.value?.referenceType===p[2]);if(found)rows.push({record_id:found.record_id});}
  else if(sql.startsWith('INSERT INTO sync_records')){s.records.set(key(p[0],p[1],p[2]),{workspace:p[0],entity:p[1],record_id:p[2],version:p[3],value:p[4]});}
  else if(sql.startsWith('UPDATE sync_records SET')){const v=s.records.get(key(p[0],p[1],p[2]));v.version=p[3];v.value=p[4];}
  else if(sql.startsWith('INSERT INTO invoice_claims')){s.claims.set(key(p[0],p[1]),p[2]);}
  else if(sql.startsWith('UPDATE sync_workspaces SET')){const w=s.workspaces.get(p[0]);w.next_sequence=p[1];w.next_invoice=p[2];}
  else if(sql.startsWith('INSERT INTO sync_commands')){s.commands.set(key(p[0],p[1]),{fingerprint:p[2],receipt:JSON.parse(p[3])});}
  else if(sql.startsWith('INSERT INTO sync_events')){s.events.push({seq:p[1],changes:JSON.parse(p[3])});}
  else if(sql.startsWith('INSERT INTO sync_telegram_outbox')){}
  else if(sql.startsWith('SELECT entity,record_id,version,value FROM sync_records')){rows.push(...s.records.values());}
  else throw Error('Unexpected SQL '+sql);
  return {rows};
 }
}
const r=(entity,id,value,expectedVersion=0)=>({entity,id,value,expectedVersion});
const make=(id='atomic-1')=>({id:'cmd-'+id,workspaceId:'lobnan_main',atomicInvoiceId:id,changes:[
 r('invoices',id,{id,invoiceNumber:'TEMP-'+id,customerId:'customer',totalAmount:8,baseTotalAmount:8,
  remainingAmount:8,isAccountingPosted:true,items:[{itemId:'sku',quantity:2,total:8,category:'print_raw'}]}),
 r('journalEntries','revenue-'+id,{id:'revenue-'+id,referenceId:id,referenceType:'pos_invoice',
  lines:[{accountCode:'1201',debit:8,credit:0},{accountCode:'4101',debit:0,credit:8}]}),
 r('journalEntries','cost-'+id,{id:'cost-'+id,referenceId:id,referenceType:'cogs',
  lines:[{accountCode:'5101',debit:4,credit:0},{accountCode:'1301',debit:0,credit:4}]}),
 r('stockMovements','movement-'+id,{id:'movement-'+id,referenceType:'pos_invoice',
  referenceNumber:'TEMP-'+id,itemId:'sku',quantity:2,totalValue:4,type:'out_sale'}),
 r('parties','customer',{id:'customer',code:'CUST-0001',type:'customer',balance:8},1),
 r('inventory','sku',{id:'sku',code:'PRI-0001',stockQuantity:8},1)
]});
test('commit and retry of full atomic sale never doubles invoice or entries',async()=>{
 const db=new PgFake(),svc=new SyncService(db);
 await svc.push('lobnan_main',{id:'seed',workspaceId:'lobnan_main',changes:[
  r('parties','customer',{id:'customer',code:'CUST-0001',type:'customer',balance:0}),
  r('inventory','sku',{id:'sku',code:'PRI-0001',stockQuantity:10})]});
 const cmd=make();const a=await svc.push('lobnan_main',cmd);
 const b=await svc.push('lobnan_main',cmd);
 assert.deepEqual(a,b);
 const snapshot=(await svc.bootstrap('lobnan_main')).records;
 assert.equal(snapshot.filter(x=>x.entity==='invoices').length,1);
 assert.equal(snapshot.filter(x=>x.entity==='journalEntries').length,2);
 assert.equal(snapshot.find(x=>x.entity==='parties').value.balance,8);
 assert.equal(snapshot.find(x=>x.entity==='inventory').value.stockQuantity,8);
 assert.equal(await svc.head('lobnan_main'),2);
});
test('version conflict rolls back invoice and all linked financial effects',async()=>{
 const db=new PgFake(),svc=new SyncService(db);
 await svc.push('lobnan_main',{id:'seed',workspaceId:'lobnan_main',changes:[
  r('parties','customer',{id:'customer',code:'CUST-0001',type:'customer',balance:0}),
  r('inventory','sku',{id:'sku',code:'PRI-0001',stockQuantity:10})]});
 const cmd=make('rollback-invoice');
 cmd.changes.find(c=>c.entity==='inventory').expectedVersion=0;
 await assert.rejects(svc.push('lobnan_main',cmd),/VERSION_CONFLICT/);
 const snapshot=(await svc.bootstrap('lobnan_main')).records;
 assert.equal(snapshot.length,2);
 assert.equal(snapshot.find(x=>x.entity==='parties').value.balance,0);
 assert.equal(snapshot.find(x=>x.entity==='inventory').value.stockQuantity,10);
 assert.equal(await svc.head('lobnan_main'),1);
});
