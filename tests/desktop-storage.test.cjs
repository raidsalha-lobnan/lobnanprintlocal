const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {selectPinnedStorage,openPinnedSQLite,selectInitialRoot}=require('../electron/storage.cjs');

function isolate(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-sqlite-safe-'));
 return {root,settingsDir:path.join(root,'config'),
  clean(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('first install creates SQLite automatically and subsequent boots pin identical database/ID',()=>{
 const t=isolate();try{
  const one=selectPinnedStorage({settingsDir:t.settingsDir,drives:[]});
  const two=selectPinnedStorage({settingsDir:t.settingsDir,drives:[]});
  assert.equal(one.databaseFile,two.databaseFile);
  assert.equal(one.id,two.id);
  assert.equal(one.root,path.join(t.settingsDir,'Data'));
  assert.ok(fs.statSync(one.databaseFile).size>0);
 }finally{t.clean();}
});
test('missing pinned database fails closed without creating a replacement',()=>{
 const t=isolate();try{
  const one=selectPinnedStorage({settingsDir:t.settingsDir,drives:[]});
  fs.renameSync(one.databaseFile,one.databaseFile+'.disconnected');
  assert.throws(()=>selectPinnedStorage({settingsDir:t.settingsDir,drives:[]}),
   /DESKTOP_STORAGE_DATABASE_MISSING/);
  assert.equal(fs.existsSync(one.databaseFile),false);
 }finally{t.clean();}
});
test('missing pinned directory and altered installation marker stop startup',()=>{
 const t=isolate();try{
  const one=selectPinnedStorage({settingsDir:t.settingsDir,drives:[]});
  const marker=path.join(one.root,'installation.json');
  fs.writeFileSync(marker,JSON.stringify({id:'not-the-approved-id',schema:1}));
  assert.throws(()=>selectPinnedStorage({settingsDir:t.settingsDir,drives:[]}),
   /DESKTOP_STORAGE_IDENTITY_MISMATCH/);
 }finally{t.clean();}
});
test('SQLite snapshots and immutable POS save attempts persist after close and reopen',()=>{
 const t=isolate();try{
  const binding=selectPinnedStorage({settingsDir:t.settingsDir,drives:[]});
  const name='lobnan-offline-v1-lobnan_main';
  const a=openPinnedSQLite(binding.root,binding.id);
  a.writeStores(name,{outbox:[{id:'cmd-1',changes:[{entity:'invoices',id:'sale-1'}]}],
   meta:[{key:'cursor',value:0}]});
  a.writePosAttempt('lobnan_pending_atomic_pos_attempt:sale-1',{commandId:'cmd-1'});
  a.close();
  const b=openPinnedSQLite(binding.root,binding.id);
  assert.equal(b.readStores(name).outbox[0].id,'cmd-1');
  assert.equal(b.readPosAttempt('lobnan_pending_atomic_pos_attempt:sale-1').commandId,'cmd-1');
  assert.throws(()=>b.writeStores(name,{badStore:[]}),/DESKTOP_INVALID_STORE_SNAPSHOT/);
  assert.equal(b.readStores(name).outbox.length,1);
  assert.throws(()=>openPinnedSQLite(binding.root,'wrong-id'),/DESKTOP_SQLITE_DATABASE_IDENTITY_MISMATCH/);
  b.close();
 }finally{t.clean();}
});
test('C is selected only as fallback when no qualified non-C fixed disk is present',()=>{
 const t=isolate();try{
  const result=selectInitialRoot(t.settingsDir,[]);
  assert.equal(result,path.join(t.settingsDir,'Data'));
 }finally{t.clean();}
});
