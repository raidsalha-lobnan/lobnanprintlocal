'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const DB_FILE='accounting.db';
const MARKER='installation.json';
const POINTER='storage-binding.json';
const MIN_FREE_BYTES=1024*1024*1024;
const STORE_NAMES=['records','outbox','meta','receipts'];

function atomicWrite(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 const fd=fs.openSync(temp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value),'utf8');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 try{fs.renameSync(temp,file);}
 catch(error){try{fs.rmSync(temp,{force:true});}catch{}throw error;}
}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function writable(dir){
 fs.mkdirSync(dir,{recursive:true});
 const probe=path.join(dir,'.write-test-'+crypto.randomBytes(8).toString('hex'));
 const fd=fs.openSync(probe,'wx',0o600);
 try{fs.writeSync(fd,Buffer.from('ok'));fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);fs.rmSync(probe,{force:true});}
}
function fixedDrives(){
 if(process.platform!=='win32')return [];
 const script="Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 -and $_.FreeSpace -ne $null } | Select-Object DeviceID,DriveType,FreeSpace | ConvertTo-Json -Compress";
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],
  {encoding:'utf8',windowsHide:true,timeout:12000,maxBuffer:65536}).trim();
 const data=output?JSON.parse(output):[];
 return (Array.isArray(data)?data:[data])
  .filter(x=>x&&x.DriveType===3&&/^[A-Z]:$/i.test(x.DeviceID))
  .map(x=>({root:x.DeviceID.toUpperCase()+'\\',freeBytes:Number(x.FreeSpace)||0}));
}
function selectInitialRoot(settingsDir,drives,minFree=MIN_FREE_BYTES){
 const candidates=drives.filter(x=>x.freeBytes>=minFree&&
  /^[A-Z]:\\$/i.test(x.root)&&!/^C:\\$/i.test(x.root))
  .sort((a,b)=>b.freeBytes-a.freeBytes)
  .map(x=>path.join(x.root,'LobnanPrint','Data'));
 // An existing identity on a non-C: drive must never be silently bypassed.
 const existing=candidates.filter(x=>fs.existsSync(path.join(x,MARKER))||
  fs.existsSync(path.join(x,DB_FILE)));
 if(existing.length>1)throw Error('DESKTOP_MULTIPLE_EXISTING_DATABASES_REVIEW_REQUIRED');
 if(existing.length)throw Error('DESKTOP_EXISTING_DATABASE_REQUIRES_RECOVERY:'+existing[0]);
 for(const root of candidates){
  try{writable(root);return root;}catch(error){console.warn('DESKTOP_DISK_NOT_WRITABLE',root,String(error));}
 }
 const fallback=path.join(settingsDir,'Data');
 if(fs.existsSync(path.join(fallback,MARKER))||fs.existsSync(path.join(fallback,DB_FILE)))
  throw Error('DESKTOP_FALLBACK_EXISTING_DATABASE_REQUIRES_RECOVERY');
 writable(fallback);
 return fallback;
}
function validateBinding(binding){
 if(!binding||binding.schema!==1||typeof binding.id!=='string'||
   !/^[a-f0-9-]{36}$/i.test(binding.id)||
   typeof binding.root!=='string'||!path.isAbsolute(binding.root))
  throw Error('DESKTOP_STORAGE_BINDING_INVALID');
 if(!fs.existsSync(binding.root))throw Error('DESKTOP_BOUND_DRIVE_UNAVAILABLE');
 const markerFile=path.join(binding.root,MARKER);
 if(!fs.existsSync(markerFile))throw Error('DESKTOP_STORAGE_MARKER_MISSING');
 const marker=readJson(markerFile);
 if(marker.schema!==1||marker.id!==binding.id)
  throw Error('DESKTOP_STORAGE_IDENTITY_MISMATCH');
 const databaseFile=path.join(binding.root,DB_FILE);
 if(!fs.existsSync(databaseFile)||fs.statSync(databaseFile).size===0)
  throw Error('DESKTOP_STORAGE_DATABASE_MISSING');
 writable(binding.root);
 return {...binding,databaseFile,profileDir:path.join(binding.root,'ElectronProfile')};
}
function selectPinnedStorage(options={}){
 const settingsDir=options.settingsDir||path.join(process.env.LOCALAPPDATA||os.homedir(),'LobnanPrint');
 const pointer=path.join(settingsDir,POINTER);
 // Existing installation ALWAYS reopens the same disk and database;
 // unavailable disks halt startup rather than creating an empty replacement.
 if(fs.existsSync(pointer)){
  let binding;
  try{binding=readJson(pointer);}catch{throw Error('DESKTOP_STORAGE_POINTER_UNREADABLE');}
  return validateBinding(binding);
 }
 const drives=options.drives||fixedDrives();
 const root=selectInitialRoot(settingsDir,drives,options.minFreeBytes||MIN_FREE_BYTES);
 const binding={schema:1,id:crypto.randomUUID(),root,createdAt:new Date().toISOString()};
 const markerFile=path.join(root,MARKER);
 atomicWrite(markerFile,{schema:1,id:binding.id,createdAt:binding.createdAt});
 // Never commit the pointer before the actual SQLite database exists.
 // An interrupted first creation leaves a marker requiring recovery.
 const database=openPinnedSQLite(root,binding.id);
 database.close();
 atomicWrite(pointer,binding);
 return validateBinding(binding);
}
function requireWorkspace(name){
 if(typeof name!=='string'||!/^(?:lobnan-offline-v1|lobnan-offline-postgres-v1)-[a-zA-Z0-9_-]{1,128}$/.test(name))
  throw Error('DESKTOP_INVALID_WORKSPACE');
}
class NativeStore{
 constructor(db){
  this.db=db;
  this.write=db.prepare('INSERT INTO idb_store_snapshots(database_name,store_name,data_json,saved_at) VALUES(?,?,?,?) ON CONFLICT(database_name,store_name) DO UPDATE SET data_json=excluded.data_json,saved_at=excluded.saved_at');
  this.list=db.prepare('SELECT store_name,data_json FROM idb_store_snapshots WHERE database_name=?');
  this.attemptRead=db.prepare('SELECT data_json FROM pos_attempts WHERE key=?');
  this.attemptWrite=db.prepare('INSERT INTO pos_attempts(key,data_json,saved_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data_json=excluded.data_json,saved_at=excluded.saved_at');
  this.attemptRemove=db.prepare('DELETE FROM pos_attempts WHERE key=?');
 }
 readStores(name){
  requireWorkspace(name);
  const result={};
  for(const row of this.list.all(name))
   if(STORE_NAMES.includes(row.store_name))result[row.store_name]=JSON.parse(row.data_json);
  return result;
 }
 writeStores(name,stores){
  requireWorkspace(name);
  if(!stores||typeof stores!=='object'||!Object.keys(stores).length||
    Object.entries(stores).some(([key,rows])=>!STORE_NAMES.includes(key)||!Array.isArray(rows)))
   throw Error('DESKTOP_INVALID_STORE_SNAPSHOT');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const stamp=new Date().toISOString();
   for(const [key,rows] of Object.entries(stores))
    this.write.run(name,key,JSON.stringify(rows),stamp);
   this.db.exec('COMMIT');
   return true;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 validAttempt(key){
  if(typeof key!=='string'||!key.startsWith('lobnan_pending_atomic_pos_attempt'))
   throw Error('DESKTOP_INVALID_POS_ATTEMPT_KEY');
 }
 readPosAttempt(key){
  this.validAttempt(key);
  const row=this.attemptRead.get(key);
  return row?JSON.parse(row.data_json):null;
 }
 writePosAttempt(key,value){
  this.validAttempt(key);
  this.attemptWrite.run(key,JSON.stringify(value),new Date().toISOString());
  return true;
 }
 deletePosAttempt(key){
  this.validAttempt(key);
  this.attemptRemove.run(key);
  return true;
 }
 close(){this.db.close();}
}
function openPinnedSQLite(root,identity,Driver){
 const DatabaseSync=Driver||require('node:sqlite').DatabaseSync;
 const file=path.join(root,DB_FILE);
 const existing=fs.existsSync(file);
 const db=new DatabaseSync(file);
 try{
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  if(db.prepare('PRAGMA quick_check').all().some(x=>x.quick_check!=='ok'))
   throw Error('DESKTOP_SQLITE_INTEGRITY_FAILED');
  const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='desktop_identity'").get();
  if(existing&&!table)throw Error('DESKTOP_SQLITE_UNRECOGNIZED_EXISTING_FILE');
  db.exec([
   'CREATE TABLE IF NOT EXISTS desktop_identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1),installation_id TEXT NOT NULL,schema_version INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS idb_store_snapshots (database_name TEXT NOT NULL,store_name TEXT NOT NULL,data_json TEXT NOT NULL,saved_at TEXT NOT NULL,PRIMARY KEY(database_name,store_name));',
   'CREATE TABLE IF NOT EXISTS pos_attempts (key TEXT PRIMARY KEY,data_json TEXT NOT NULL,saved_at TEXT NOT NULL);'
  ].join('\n'));
  const current=db.prepare('SELECT installation_id,schema_version FROM desktop_identity WHERE singleton=1').get();
  if(current&&(current.installation_id!==identity||current.schema_version!==1))
   throw Error('DESKTOP_SQLITE_DATABASE_IDENTITY_MISMATCH');
  if(!current){
   if(existing)throw Error('DESKTOP_SQLITE_EXISTING_IDENTITY_MISSING');
   db.prepare('INSERT INTO desktop_identity(singleton,installation_id,schema_version) VALUES(1,?,1)').run(identity);
  }
  return new NativeStore(db);
 }catch(error){db.close();throw error;}
}
module.exports={DB_FILE,MARKER,MIN_FREE_BYTES,STORE_NAMES,fixedDrives,
 selectInitialRoot,validateBinding,selectPinnedStorage,openPinnedSQLite};
