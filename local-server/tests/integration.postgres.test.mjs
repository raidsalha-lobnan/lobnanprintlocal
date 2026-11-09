import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
import {SyncService} from '../sync-service.mjs';
const url=process.env.TEST_DATABASE_URL;
test('real PostgreSQL: concurrent invoice allocation, retry safety, and rollback', {skip:!url}, async()=>{
 const pool=new pg.Pool({connectionString:url,max:10});
 try {
  const ddl=await fs.readFile(new URL('../schema.sql',import.meta.url),'utf8');
  await pool.query(ddl);
  const workspace='ci-'+crypto.randomUUID();
  const svc=new SyncService(pool);
  const make=(i)=>({id:'command-'+i,workspaceId:workspace,changes:[{entity:'invoices',id:'invoice-'+i,expectedVersion:0,value:{id:'invoice-'+i,invoiceNumber:'TEMP-'+i}}]});
  const commands=Array.from({length:15},(_,i)=>make(i));
  const receipts=await Promise.all(commands.map(c=>svc.push(workspace,c)));
  const numbers=receipts.map(r=>r.changes[0].value.invoiceNumber);
  assert.equal(new Set(numbers).size,15,'no duplicate official invoice numbers');
  assert.deepEqual([...numbers].sort(),Array.from({length:15},(_,i)=>'INV-'+String(i+1).padStart(4,'0')),'gap-free allocation');
  assert.equal(await svc.head(workspace),15);
  assert.deepEqual(await svc.push(workspace,commands[0]),receipts[0],'re-sending command does not create a second invoice');
  assert.equal(await svc.head(workspace),15,'retry does not advance event cursor');
  const bad={id:'failing-transaction',workspaceId:workspace,changes:[
   {entity:'parties',id:'not-committed',expectedVersion:0,value:{id:'not-committed',code:'CUST-CI-ROLLBACK',name:'Transient'}},
   {entity:'invoices',id:'invoice-0',expectedVersion:0,value:{id:'invoice-0',invoiceNumber:'TEMP-stale'}}
  ]};
  await assert.rejects(svc.push(workspace,bad),e=>e.message==='VERSION_CONFLICT');
  assert.equal(await svc.head(workspace),15,'failed transaction cannot advance cursor');
  const snap=await svc.bootstrap(workspace);
  assert.equal(snap.records.some(r=>r.id==='not-committed'),false,'failed transaction rolls back all rows');
  assert.equal(snap.cursor.sequence,15);
  assert.equal((await svc.pull(workspace,0,100)).length,15);
 } finally {await pool.end();}
});
