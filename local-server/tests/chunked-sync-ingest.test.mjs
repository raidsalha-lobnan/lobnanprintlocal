import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PUSH_PART_BYTES,PUSH_MAX_PARTS,decodeSyncPart,stageSyncPart,commitSyncParts} from '../chunked-sync-ingest.mjs';

class MemoryChunkPool {
  records=new Map();
  key(workspace,owner,command,index){return [workspace,owner,command,index].join('|')}
  async query(sql,params=[]){
    if(sql.startsWith('DELETE FROM sync_ingest_chunks')&&sql.includes('created_at'))
      return {rows:[],rowCount:0};
    if(sql.startsWith('SELECT sha256,total_parts,part_bytes')){
      const [ws,owner,id,index]=params;
      const r=this.records.get(this.key(ws,owner,id,index));
      return {rows:r?[r]:[]};
    }
    if(sql.startsWith('SELECT COALESCE(SUM(')){
      const [ws,owner]=params;
      const all=[...this.records.values()].filter(r=>r.workspace===ws&&r.owner===owner);
      return {rows:[{bytes:all.reduce((n,r)=>n+r.part_bytes.length,0),
        commands:new Set(all.map(r=>r.command_id)).size}]};
    }
    if(sql.startsWith('INSERT INTO sync_ingest_chunks')){
      const [ws,owner,id,sha,total,index,payload]=params;
      const key=this.key(ws,owner,id,index);
      if(this.records.has(key))return {rows:[],rowCount:0};
      this.records.set(key,{workspace:ws,owner,command_id:id,part_index:index,
        sha256:sha,total_parts:total,part_bytes:payload});
      return {rows:[],rowCount:1};
    }
    if(sql.startsWith('SELECT part_index,sha256,total_parts,part_bytes')){
      const [ws,owner,id]=params;
      return {rows:[...this.records.values()].filter(r=>
        r.workspace===ws&&r.owner===owner&&r.command_id===id
      ).sort((a,b)=>a.part_index-b.part_index)};
    }
    if(sql.startsWith('DELETE FROM sync_ingest_chunks')){
      const [ws,owner,id]=params;
      let deleted=0;
      for(const [key,row] of this.records)
        if(row.workspace===ws&&row.owner===owner&&row.command_id===id){
          this.records.delete(key);deleted++;
        }
      return {rows:[],rowCount:deleted};
    }
    throw Error('Unexpected SQL in test: '+sql);
  }
}
function sample(){
  const commandId=crypto.randomUUID();
  const command={id:commandId,workspaceId:'lobnan_main',createdAt:1763800000000,
    attempts:1,retryAt:0,status:'pending',atomicInvoiceId:'inv-pos-unique-123',
    changes:[
      {entity:'invoices',id:'inv-pos-unique-123',expectedVersion:0,
        value:{id:'inv-pos-unique-123',invoiceNumber:'TEMP-inv-pos-unique-123',
          totalAmount:1495,notes:'فاتورة بها صور كبيرة',imageThumbnail:'a'.repeat(900000)}},
      {entity:'parties',id:'pt-a',expectedVersion:2,value:{id:'pt-a',balance:1495}},
      {entity:'inventory',id:'inv-item',expectedVersion:4,value:{id:'inv-item',stockQuantity:-2}},
      {entity:'stockMovements',id:'sm-a',expectedVersion:0,value:{id:'sm-a',quantity:2}},
      {entity:'journalEntries',id:'journal-a',expectedVersion:0,
        value:{id:'journal-a',lines:[{accountCode:'1201',debit:1495,credit:0},
          {accountCode:'4101',debit:0,credit:1495}]}},
      {entity:'journalEntries',id:'journal-b',expectedVersion:0,
        value:{id:'journal-b',lines:[{accountCode:'5101',debit:10,credit:0},
          {accountCode:'1302',debit:0,credit:10}]}}
    ]};
  const bytes=Buffer.from(JSON.stringify(command));
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const totalParts=Math.ceil(bytes.length/PUSH_PART_BYTES);
  const manifest={commandId,sha256,totalParts};
  const part=index=>({...manifest,index,
    dataBase64:bytes.subarray(index*PUSH_PART_BYTES,(index+1)*PUSH_PART_BYTES).toString('base64')});
  return {command,bytes,manifest,part};
}
test('transport fragments reassemble exact original six-effect financial command; no part is posted',async()=>{
  const pool=new MemoryChunkPool(),actor='usr-1';
  const {command,bytes,manifest,part}=sample();
  assert.ok(bytes.length>800000&&manifest.totalParts<PUSH_MAX_PARTS);
  for(let i=0;i<manifest.totalParts;i++){
    const saved=await stageSyncPart(pool,'lobnan_main',actor,part(i));
    assert.equal(saved.ok,true);
  }
  assert.equal(pool.records.size,manifest.totalParts);
  // Resending identical chunks is idempotent.
  const repeated=await stageSyncPart(pool,'lobnan_main',actor,part(0));
  assert.equal(repeated.duplicate,true);
  let posts=0,authorized=0;
  const receipt=await commitSyncParts(pool,'lobnan_main',actor,manifest,
    async received=>{authorized++;assert.deepEqual(received,command)},
    async received=>{
      posts++;assert.deepEqual(received,command);
      return {commandId:received.id,changes:received.changes};
    });
  assert.equal(receipt.commandId,command.id);
  assert.equal(receipt.changes.length,6);
  assert.equal(posts,1);
  assert.equal(authorized,1);
  assert.equal(pool.records.size,0);
});
test('partial/inconsistent fragments and a different actor cannot commit',async()=>{
  const pool=new MemoryChunkPool(),{manifest,part}=sample();
  await stageSyncPart(pool,'lobnan_main','usr-1',part(0));
  await assert.rejects(()=>commitSyncParts(pool,'lobnan_main','usr-1',manifest,
    async()=>{},async()=>{throw Error('NEVER_POST');}),e=>e.message==='SYNC_PARTS_INCOMPLETE');
  await assert.rejects(()=>commitSyncParts(pool,'lobnan_main','usr-2',manifest,
    async()=>{},async()=>{throw Error('NEVER_POST');}),e=>e.message==='SYNC_PARTS_INCOMPLETE');
  const tampered=part(0);
  const changed=Buffer.from(tampered.dataBase64,'base64');
  changed[0]^=1;
  tampered.dataBase64=changed.toString('base64');
  await assert.rejects(()=>stageSyncPart(pool,'lobnan_main','usr-1',tampered),
    e=>e.message==='SYNC_PART_MISMATCH');
});
test('checksum mismatch and authorization failure never call the financial commit',async()=>{
  const pool=new MemoryChunkPool(),{manifest,part}=sample();
  for(let i=0;i<manifest.totalParts;i++)await stageSyncPart(pool,'lobnan_main','usr-1',part(i));
  let calls=0;
  await assert.rejects(()=>commitSyncParts(pool,'lobnan_main','usr-1',
    {...manifest,sha256:'0'.repeat(64)},async()=>{},async()=>{calls++;}),
    e=>e.message==='SYNC_PARTS_INCONSISTENT');
  await assert.rejects(()=>commitSyncParts(pool,'lobnan_main','usr-1',
    manifest,async()=>{throw Error('NO_PERMISSION')},async()=>{calls++;}),
    /NO_PERMISSION/);
  assert.equal(calls,0);
  assert.equal(pool.records.size,manifest.totalParts);
});
test('reject invalid part sizes and indices before any PostgreSQL write',()=>{
  const {manifest,part}=sample();
  assert.throws(()=>decodeSyncPart({...part(0),index:-1}),/SYNC_PART_INDEX_INVALID/);
  assert.throws(()=>decodeSyncPart({...part(0),dataBase64:'%%%'}),/SYNC_PART_ENCODING_INVALID/);
  assert.throws(()=>decodeSyncPart({...part(0),totalParts:129}),/SYNC_PART_METADATA_INVALID/);
  assert.equal(manifest.totalParts,5);
});
