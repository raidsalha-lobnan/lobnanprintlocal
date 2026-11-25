'use strict';
/**
 * Actual packaged Electron runtime test. Uses the Node engine built into
 * LobnanPrint.exe (ELECTRON_RUN_AS_NODE=1), not the CI host's node.exe.
 * A disposable SQLite file is used; production ledgers are untouched.
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
 console.log('PACKAGED_ELECTRON_SQLITE_OK '+process.versions.electron+' / Node '+process.versions.node);
 fs.rmSync(directory,{recursive:true,force:true});
 process.exit(0);
}catch(error){
 try{db?.close();}catch{}
 console.error('PACKAGED_ELECTRON_SQLITE_FAILED',error);
 try{fs.rmSync(directory,{recursive:true,force:true});}catch{}
 process.exit(2);
}
