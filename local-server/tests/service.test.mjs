import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncService } from '../sync-service.mjs';
import { InputError } from '../sync-domain.mjs';

const empty=()=>({workspaces:new Map(),records:new Map(),commands:new Map(),events:[],claims:new Map()});
const key=(...parts)=>parts.join(':');
class FakePostgres {
  state=empty();
  async connect() {
    const owner=this;
    let tx=null;
    return {
      release(){},
      async query(sql,params=[]) {
        if(sql.startsWith('BEGIN')){tx=structuredClone(owner.state);return {rows:[]};}
        if(sql==='COMMIT'){owner.state=tx;tx=null;return {rows:[]};}
        if(sql==='ROLLBACK'){tx=null;return {rows:[]};}
        return owner.execute(sql,params,tx);
      }
    };
  }
  async query(sql,params=[]) {return this.execute(sql,params,this.state);}
  execute(sql,p,s) {
    const rows=[];
    if(sql.startsWith('INSERT INTO sync_workspaces')){
      if(!s.workspaces.has(p[0]))s.workspaces.set(p[0],{next_sequence:0,next_invoice:0});
    } else if(sql.startsWith('SELECT next_sequence,next_invoice')){
      rows.push({...s.workspaces.get(p[0])});
    } else if(sql.startsWith('SELECT next_sequence FROM sync_workspaces')){
      const v=s.workspaces.get(p[0]);if(v)rows.push({next_sequence:v.next_sequence});
    } else if(sql.startsWith('SELECT fingerprint,receipt')){
      const v=s.commands.get(key(p[0],p[1]));if(v)rows.push(v);
    } else if(sql.startsWith('SELECT version,value FROM sync_records')) {
      const v=s.records.get(key(p[0],p[1],p[2]));if(v)rows.push({...v});
    } else if(sql.startsWith('SELECT record_id FROM sync_records')) {
      const found=Array.from(s.records.values()).find(v=>v.workspace===p[0]&&v.entity==='journalEntries'&&v.value?.referenceId===p[1]&&v.value?.referenceType===p[2]);
      if(found)rows.push({record_id:found.record_id});
    } else if(sql.startsWith('INSERT INTO sync_records')) {
      const k=key(p[0],p[1],p[2]);if(s.records.has(k))throw new Error('UNIQUE_RECORD');s.records.set(k,{workspace:p[0],entity:p[1],record_id:p[2],version:p[3],value:p[4]});
    } else if(sql.startsWith('UPDATE sync_records SET')) {
      const v=s.records.get(key(p[0],p[1],p[2]));v.version=p[3];v.value=p[4];
    } else if(sql.startsWith('INSERT INTO invoice_claims')) {
      const k=key(p[0],p[1]);if(s.claims.has(k))throw new Error('DUPLICATE_NUMBER');s.claims.set(k,p[2]);
    } else if(sql.startsWith('UPDATE sync_workspaces SET')) {
      s.workspaces.get(p[0]).next_sequence=p[1];s.workspaces.get(p[0]).next_invoice=p[2];
    } else if(sql.startsWith('INSERT INTO sync_commands')) {
      s.commands.set(key(p[0],p[1]),{fingerprint:p[2],receipt:JSON.parse(p[3])});
    } else if(sql.startsWith('INSERT INTO sync_telegram_outbox')) {
      // Side-effect notification queue is committed in the same PostgreSQL transaction.
      // The in-memory fake deliberately does not send any Telegram messages.
    } else if(sql.startsWith('INSERT INTO sync_events')) {
      s.events.push({workspace:p[0],sequence:p[1],command_id:p[2],changes:JSON.parse(p[3])});
    } else if(sql.startsWith('SELECT sequence,command_id,changes FROM sync_events')) {
      rows.push(...s.events.filter(v=>v.workspace===p[0]&&v.sequence>p[1]).sort((a,b)=>a.sequence-b.sequence).slice(0,p[2]));
    } else if(sql.startsWith('SELECT entity,record_id,version,value FROM sync_records')) {
      rows.push(...Array.from(s.records.values()).filter(v=>v.workspace===p[0]));
    } else {throw new Error('Unhandled mock SQL: '+sql);}
    return {rows};
  }
}
const make=(id,changes)=>({id,workspaceId:'lobnan_main',changes});
const record=(entity,id,value,expectedVersion=0)=>({entity,id,value,expectedVersion});
test('two invoices are allocated globally once and retransmission is idempotent',async()=>{
 const pool=new FakePostgres(),svc=new SyncService(pool);
 const a=make('testcmd-a',[record('invoices','a',{id:'a',invoiceNumber:'TEMP-a',customer:'A'})]);
 const b=make('testcmd-b',[record('invoices','b',{id:'b',invoiceNumber:'TEMP-b',customer:'B'})]);
 const ar=await svc.push('lobnan_main',a);const br=await svc.push('lobnan_main',b);const again=await svc.push('lobnan_main',a);
 assert.equal(ar.changes[0].value.invoiceNumber,'INV-0001');assert.equal(br.changes[0].value.invoiceNumber,'INV-0002');
 assert.deepEqual(ar,again);assert.equal((await svc.pull('lobnan_main',0)).length,2);assert.equal(await svc.head('lobnan_main'),2);
});
test('conflicting update does not overwrite existing invoice or advance cursor',async()=>{
 const pool=new FakePostgres(),svc=new SyncService(pool);
 await svc.push('lobnan_main',make('initialinvoice',[record('invoices','invoice-1',{id:'invoice-1',invoiceNumber:'TEMP-a'})]));
 await assert.rejects(svc.push('lobnan_main',make('bad-version',[record('invoices','invoice-1',{id:'invoice-1',invoiceNumber:'TEMP-wrong',customer:'Changed'},0)])),e=>e instanceof InputError&&e.message==='VERSION_CONFLICT');
 assert.equal(await svc.head('lobnan_main'),1);assert.equal((await svc.bootstrap('lobnan_main')).records[0].value.customer,undefined);
});
test('transaction rolls back all changes if any record fails version validation',async()=>{
 const pool=new FakePostgres(),svc=new SyncService(pool);
 await svc.push('lobnan_main',make('seed-cash',[record('treasuries','cash',{id:'cash',accountCode:'1101',balance:500})]));
 const cmd=make('transaction-reject',[record('parties','new-customer',{id:'new-customer',code:'CUST-NEW',name:'New'}),record('treasuries','cash',{id:'cash',balance:0},0)]);
 await assert.rejects(svc.push('lobnan_main',cmd),/VERSION_CONFLICT/);
 assert.equal((await svc.bootstrap('lobnan_main')).records.some(r=>r.id==='new-customer'),false);
});
test('legacy 71-customer balance snapshot is rejected atomically without touching records',async()=>{
 const pool=new FakePostgres(),svc=new SyncService(pool);
 const all=Array.from({length:71},(_,i)=>record('parties','party-'+i,{id:'party-'+i,balance:100+i}));
 await assert.rejects(svc.push('lobnan_main',make('stale-bulk-party-recalc',all)),
   e=>e instanceof InputError&&e.message==='BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION');
 assert.equal((await svc.bootstrap('lobnan_main')).records.length,0);
 assert.equal(await svc.head('lobnan_main'),0);
});

test('bootstrap cursor and change feed preserve versions with pagination',async()=>{
 const pool=new FakePostgres(),svc=new SyncService(pool);
 for(let i=0;i<205;i++) await svc.push('lobnan_main',make('command-'+String(i),[record('parties','cust-'+i,{id:'cust-'+i,code:'CUST-'+i,name:'Customer '+i})]));
 const snap=await svc.bootstrap('lobnan_main');assert.equal(snap.records.length,205);assert.equal(snap.cursor.sequence,205);
 let after=0,total=0;
 while(true){const page=await svc.pull('lobnan_main',after,100); if(!page.length)break;after=page.at(-1).cursor.sequence;total+=page.length;}
 assert.equal(total,205);assert.equal(after,205);
});

test('replayed invoice posting with different journal ids is rejected, not doubled',async()=>{
 const pool=new FakePostgres(),svc=new SyncService(pool);
 const id='inv-protect';
 const revenue=(id)=>record('journalEntries',id,{id,referenceType:'pos_invoice',referenceId:'inv-protect',
  lines:[{accountCode:'1201',debit:8,credit:0},{accountCode:'4101',debit:0,credit:8}]});
 await svc.push('lobnan_main',make('sale-first',[
  record('invoices',id,{id,invoiceNumber:'TEMP-'+id,totalAmount:8}),
  revenue('journal-1')
 ]));
 await assert.rejects(svc.push('lobnan_main',make('sale-replay-different-id',[
  revenue('journal-2')
 ])),e=>e instanceof InputError&&e.message==='DUPLICATE_INVOICE_JOURNAL_REJECTED');
 assert.equal((await svc.bootstrap('lobnan_main')).records.filter(x=>x.entity==='journalEntries').length,1);
 assert.equal(await svc.head('lobnan_main'),1);
});
test('ordinary browser cannot forge internal accounting correction entries',async()=>{
 const pool=new FakePostgres(),svc=new SyncService(pool);
 const illegal=make('fake-adjustment',[record('journalEntries','journal-internal',{
  id:'journal-internal',referenceType:'invoice_correction',referenceId:'inv-1',
  internalCorrection:true,approvedRevision:true,lines:[
    {accountCode:'1201',debit:8,credit:0},{accountCode:'4101',debit:0,credit:8}]
  })]);
 await assert.rejects(svc.push('lobnan_main',illegal),
   e=>e instanceof InputError&&e.message==='INVOICE_CORRECTION_REQUIRES_SERVER_REVISION');
 assert.equal(await svc.head('lobnan_main'),0);
});
