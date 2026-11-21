import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import 'fake-indexeddb/auto';
import {LocalSyncDb} from '../src/sync-next/localDb';
import type {StoredRecord} from '../src/sync-next/types';
import {recordKey} from '../src/sync-next/types';

const record=(entity:'users'|'roles'|'invoices',id:string,extra:Record<string,unknown>={}):StoredRecord=>({
  key:recordKey(entity,id),entity,id,version:1,value:{id,...extra} as any
});
const cursor={seconds:0,nanoseconds:0,eventId:'seed',sequence:10};
test('accounting-local directory expands from one cached user to five authorized PostgreSQL profiles without touching invoices or outbox',async()=>{
  const workspace='roster-'+crypto.randomUUID();
  const db=new LocalSyncDb(workspace,'roster-repair-'+crypto.randomUUID());
  try{
    await db.initializeAuthoritativeSnapshot([
      record('users','usr-1',{fullName:'Current user'}),
      record('roles','role-admin',{code:'SYS_ADMIN'}),
      record('invoices','inv-1',{invoiceNumber:'INV-0001',totalAmount:120})
    ],cursor);
    const unsent=await db.enqueue([{entity:'invoices',id:'offline-original',
      value:{id:'offline-original',invoiceNumber:'TEMP-offline-original',totalAmount:1495}}]);
    const directory=[
      record('roles','role-admin',{code:'SYS_ADMIN'}),
      record('roles','role-cashier',{code:'CASHIER'}),
      ...Array.from({length:5},(_,i)=>record('users','usr-'+(i+1),
        {fullName:'User '+(i+1),roleId:i===0?'role-admin':'role-cashier'}))
    ];
    const changed=await db.refreshAuthorizedDirectory(directory,'usr-1');
    assert.ok(changed>=5);
    assert.equal((await db.listVisible('users')).length,5);
    assert.equal((await db.listVisible('roles')).length,2);
    assert.equal((await db.listVisible('invoices')).length,2);
    const pending=await db.pending();
    assert.equal(pending.length,1);
    assert.equal(pending[0].id,unsent.id);
    assert.deepEqual(pending[0].changes,unsent.changes);
    assert.deepEqual(await db.cursor(),cursor);
  }finally{await db.close();}
});
test('a login under narrower access hides earlier admin directory without touching financial outbox',async()=>{
  const workspace='scope-'+crypto.randomUUID();
  const db=new LocalSyncDb(workspace,'scope-repair-'+crypto.randomUUID());
  try{
    await db.initializeAuthoritativeSnapshot([
      record('users','usr-1'),record('users','usr-2'),
      record('roles','role-admin'),record('roles','role-cashier')
    ],cursor);
    await db.refreshAuthorizedDirectory([
      record('users','usr-2'),record('roles','role-cashier')
    ],'usr-2');
    assert.deepEqual((await db.listVisible('users')).map(x=>x.id),['usr-2']);
    assert.deepEqual((await db.listVisible('roles')).map(x=>x.id),['role-cashier']);
  }finally{await db.close();}
});
test('directory reply missing authenticated actor fails before changing local users',async()=>{
  const workspace='invalid-'+crypto.randomUUID();
  const db=new LocalSyncDb(workspace,'invalid-repair-'+crypto.randomUUID());
  try{
    await db.initializeAuthoritativeSnapshot([
      record('users','usr-1'),record('roles','role-admin')
    ],cursor);
    await assert.rejects(
      ()=>db.refreshAuthorizedDirectory([record('users','usr-2'),record('roles','role-cashier')],'usr-1'),
      /POSTGRES_DIRECTORY_MISSING_CURRENT_ACTOR/
    );
    assert.equal((await db.listVisible('users'))[0].id,'usr-1');
  }finally{await db.close();}
});
test('secure login never overwrites the complete user list with only the authenticated profile',()=>{
  const login=readFileSync(new URL('../src/components/LoginView.tsx',import.meta.url),'utf8');
  const secure=login.split('if(secureLoginEnabled()){')[2]?.split('// Legacy paired-server login')[0]||login;
  assert.ok(!secure.includes('cacheSavedUsers([matched]'));
  const boot=readFileSync(new URL('../src/sync-next/boot.ts',import.meta.url),'utf8');
  const server=readFileSync(new URL('../local-server/server.mjs',import.meta.url),'utf8');
  assert.match(boot,/remote\.fetchAuthorizedDirectory\(\)/);
  assert.match(boot,/local\.refreshAuthorizedDirectory\(directory\.records,getCurrentSessionActorId\(\)\)/);
  assert.equal(boot.split('await remote.fetchAuthoritativeBootstrap()').length-1,1);
  assert.match(server,/\/api\/v1\/auth\/directory/);
  assert.match(server,/filterSnapshot\(\{records:all\},access\)/);
  assert.match(server,/safeSnapshot\(authorized,access\)/);
});
