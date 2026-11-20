import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHeldInvoice,storeHeldPosInvoice,listHeldPosInvoices,deleteHeldPosInvoice} from '../held-pos-invoices.mjs';

const held={id:'held-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
 customerName:'زبون',lines:[{id:'l1',itemName:'طباعة',quantity:1}],
 totalAmount:100,notes:'بانتظار استئناف الفاتورة'};
test('held snapshots never require invoice numbers or accounting entries',()=>{
 assert.equal(typeof validateHeldInvoice('desktop',held),'string');
 assert.throws(()=>validateHeldInvoice('desktop',{...held,id:'INV-0001'}),/HELD_INVOICE_ID_INVALID/);
 assert.throws(()=>validateHeldInvoice('desktop',{...held,lines:[]}),/HELD_INVOICE_ITEMS_INVALID/);
 assert.throws(()=>validateHeldInvoice('mobile',held),/HELD_INVOICE_ITEMS_INVALID/);
});
test('PostgreSQL store/list/delete preserve the full snapshot and owner',async()=>{
 const queries=[];
 const tx={async query(sql,args=[]){
  queries.push({sql,args});
  if(sql.startsWith('SELECT owner_user_id'))return {rows:[]};
  if(sql.startsWith('SELECT count'))return {rows:[{count:0}]};
  if(sql.startsWith('INSERT INTO sync_pos_held_invoices'))return {rowCount:1};
  return {rows:[],rowCount:1};
 },release(){}};
 const db={connect:async()=>tx,query:async(sql,args)=>{
  queries.push({sql,args});
  return sql.startsWith('SELECT body')?{rows:[{body:held}]}:{rowCount:1};
 }};
 assert.deepEqual(await storeHeldPosInvoice(db,'workspace','staff-1','desktop',held),
  {id:held.id,saved:true});
 assert.deepEqual(await listHeldPosInvoices(db,'workspace','staff-1','desktop'),[held]);
 assert.deepEqual(await deleteHeldPosInvoice(db,'workspace','staff-1',held.id),
  {id:held.id,deleted:true});
 assert.ok(queries.some(q=>q.sql.startsWith('DELETE FROM sync_pos_held_invoices')&&q.args[1]==='staff-1'));
 assert.ok(!queries.some(q=>/journalEntries|stockMovements|sync_records|sync_events/.test(q.sql)));
});
test('existing hold owned by a different employee is rejected without overwrite',async()=>{
 const tx={async query(sql){
  if(sql.startsWith('SELECT owner_user_id'))return {rows:[{owner_user_id:'other-user',kind:'desktop'}]};
  return {rowCount:1,rows:[]};
 },release(){}};
 const db={connect:async()=>tx};
 await assert.rejects(
  ()=>storeHeldPosInvoice(db,'workspace','staff-1','desktop',held),
  /HELD_INVOICE_ACCESS_DENIED/);
});
