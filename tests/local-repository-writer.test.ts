import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {
  localRecordRef,registerLocalRepositoryWriter,persistLocalRecord,
  removeLocalRecord,readDisabledCollection,disabledUnsafeBatch
} from '../src/services/localRepositoryWrites';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('canonical local writer always persists through the registered PostgreSQL/IndexedDB queue',async()=>{
  const ref=localRecordRef('employees','emp-008');
  await assert.rejects(()=>persistLocalRecord(ref,{name:'ثمانية'}),/DURABLE_REPOSITORY_NOT_INITIALIZED/);
  const saved:Array<{operation:string;path:string;name?:string}>=[];
  const stop=registerLocalRepositoryWriter(async(operation,reference,payload)=>{
    saved.push({operation,path:reference.path,name:(payload as any)?.name});
    return true;
  });
  try{
    await persistLocalRecord(ref,{id:'emp-008',name:'ثمانية'});
    await removeLocalRecord(ref);
    assert.deepEqual(saved.map(x=>[x.operation,x.path]),[
      ['set','employees/emp-008'],['delete','employees/emp-008']
    ]);
    assert.equal(saved[0].name,'ثمانية');
  }finally{stop();}
  await assert.rejects(()=>persistLocalRecord(ref,{id:'emp-008'}),/DURABLE_REPOSITORY_NOT_INITIALIZED/);
});

test('old cloud-style mass reads and batch writes remain blocked',async()=>{
  await assert.rejects(()=>readDisabledCollection({path:'employees'}),/READ_REQUIRES_CANONICAL_POSTGRES_REPOSITORY/);
  assert.throws(()=>disabledUnsafeBatch(),/BATCH_REQUIRES_ATOMIC_POSTGRES_COMMAND/);
});

test('active source no longer imports the retired Firebase-shaped bridge',()=>{
  assert.equal(existsSync(path.join(root,'src/services/durableLegacyBridge.ts')),false);
  const required=['src/context/AccountingContext.tsx','src/sync-next/boot.ts',
    'src/services/dailyEntryService.ts'];
  for(const file of required){
    const code=readFileSync(path.join(root,file),'utf8');
    assert.match(code,/localRepositoryWrites/);
    assert.doesNotMatch(code,/durableLegacyBridge|firebase\/|firebase\.app|FirestoreSyncTransport/);
  }
  const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(Object.keys({...pkg.dependencies,...pkg.devDependencies})
    .some(name=>name==='firebase'||name.startsWith('@firebase/')),false);
});
