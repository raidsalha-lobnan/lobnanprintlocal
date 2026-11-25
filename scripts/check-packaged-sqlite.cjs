'use strict';
/**
 * SQLite persistence integration test with the Node 24 engine on the Windows
 * CI runner. Packaged Electron deliberately is not placed into runAsNode mode,
 * which is unsafe or unsupported for some secured production builds.
 * Uses a disposable SQLite file and never touches production ledgers.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-native-sqlite-'));
const databaseFile=path.join(directory,'test-'+crypto.randomUUID()+'.db');
let db;
try{
 db=new DatabaseSync(databaseFile);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE t (id TEXT PRIMARY KEY, value TEXT NOT NULL);');
 db.prepare('INSERT INTO t (id,value) VALUES (?,?)').run('native-electron','sqlite-connected');
 const quick=db.prepare('PRAGMA quick_check').get();
 if(quick?.quick_check!=='ok')throw Error('SQLITE_QUICK_CHECK_FAILED');
 db.close();db=null;
 db=new DatabaseSync(databaseFile,{readOnly:true});
 const row=db.prepare('SELECT value FROM t WHERE id=?').get('native-electron');
 if(row?.value!=='sqlite-connected')throw Error('SQLITE_PERSISTENT_REOPEN_FAILED');
 db.close();db=null;
 console.log('SQLITE_PERSISTENCE_UNIT_OK Node '+process.versions.node);
 fs.rmSync(directory,{recursive:true,force:true});
 process.exit(0);
}catch(error){
 try{db?.close();}catch{}
 console.error('SQLITE_PERSISTENCE_UNIT_FAILED',error);
 try{fs.rmSync(directory,{recursive:true,force:true});}catch{}
 process.exit(2);
}
