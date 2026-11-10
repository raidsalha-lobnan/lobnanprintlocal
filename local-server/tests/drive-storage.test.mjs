import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {
  DriveStorage,readAttachmentBody,runPgDump,recordUploadedAttachment,findUploadedAttachment
} from '../drive-storage.mjs';

const env={
  GOOGLE_OAUTH_CLIENT_ID:'test-client',
  GOOGLE_OAUTH_CLIENT_SECRET:'test-secret',
  GOOGLE_OAUTH_REFRESH_TOKEN:'test-refresh'
};
test('missing owner credentials fail closed instead of using browser identity',async()=>{
  const storage=new DriveStorage({env:{}});
  assert.equal(storage.configured(),false);
  await assert.rejects(storage.tokenForDrive(),/DRIVE_OAUTH_NOT_CONFIGURED/);
});
test('private upload refreshes server OAuth, caches token and verifies an upload receipt',async()=>{
  const requests=[];
  const fetcher=async(url,options={})=>{
    requests.push({url,options});
    if(url.endsWith('/token'))return new Response(JSON.stringify({access_token:'opaque',expires_in:3600}),{status:200});
    if(url.includes('drive/v3/files?q='))return new Response(JSON.stringify({files:[{id:'private-app-folder',name:'Lobnan_Print_Attachments'}]}),{status:200});
    if(url.includes('uploadType=resumable'))return new Response('',{status:200,headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=sample'}});
    if(url.includes('upload_id=sample'))return new Response(JSON.stringify({id:'drive_file_123456',name:'design.pdf',size:'7'}),{status:200});
    throw new Error('unexpected '+url);
  };
  const storage=new DriveStorage({env,fetcher,clock:()=>1000});
  const saved=await storage.uploadBuffer(Buffer.from('payload'),'design.pdf','application/pdf');
  assert.equal(saved.id,'drive_file_123456');
  assert.equal(requests.filter(x=>x.url.endsWith('/token')).length,1);
  assert.equal(requests.find(x=>x.url.includes('upload_id=sample')).options.body.toString(),'payload');
  const tokenRequest=requests[0].options.body;
  assert.equal(tokenRequest.get('grant_type'),'refresh_token');
  assert.equal(tokenRequest.get('refresh_token'),'test-refresh');
});
test('uploads reject empty binary and reject paths in file names',async()=>{
  const storage=new DriveStorage({env});
  await assert.rejects(storage.uploadBuffer(Buffer.alloc(0),'../../bad'),/ATTACHMENT_EMPTY/);
  const fake=Readable.from([Buffer.alloc(3),Buffer.alloc(5)]);
  await assert.rejects(readAttachmentBody(fake,6),/ATTACHMENT_TOO_LARGE/);
});
test('attachment registration contains metadata, not binary; private download checks registry',async()=>{
  let inserted=null;
  const pool={query:async(sql,args)=>{
    if(sql.startsWith('INSERT')){inserted=args;return {rows:[]};}
    if(sql.startsWith('SELECT'))return {rows:args[1]==='known_file_123'?[
      {file_id:args[1],original_name:'sample.pdf',mime_type:'application/pdf',file_size:4}
    ]:[]};
    return {rows:[]};
  }};
  await recordUploadedAttachment(pool,'lobnan_main',
    {id:'known_file_123',name:'sample.pdf',mime:'application/pdf',size:4},'user-1');
  assert.deepEqual(inserted,['lobnan_main','known_file_123','sample.pdf','application/pdf',4,'user-1']);
  assert.equal((await findUploadedAttachment(pool,'lobnan_main','known_file_123')).file_id,'known_file_123');
  assert.equal(await findUploadedAttachment(pool,'lobnan_main','unknown_file'),null);
});
test('pg_dump never puts database password in process arguments and produces a private file',async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'lobnan-backup-unit-'));
  let commandArgs,spawnEnv;
  try{
    const spawnProcess=(cmd,args,opts)=>{
      commandArgs=args;spawnEnv=opts.env;
      const child=new EventEmitter();
      child.stderr=new EventEmitter();
      const output=args[args.indexOf('--file')+1];
      fs.writeFileSync(output,Buffer.alloc(256,0x32));
      setImmediate(()=>child.emit('exit',0));
      return child;
    };
    const result=await runPgDump({
      env:{DATABASE_URL:'postgresql://reporter:p%40ssword@127.0.0.1:5432/ledger',
        LOBNAN_BACKUP_DIR:dir},spawnProcess,now:()=>new Date('2026-11-10T12:00:00Z')
    });
    assert.equal(spawnEnv.PGPASSWORD,'p@ssword');
    assert.doesNotMatch(commandArgs.join(' '),/p%40ssword|p@ssword/);
    assert.equal(result.bytes,256);
    assert.match(result.sha256,/^[0-9a-f]{64}$/);
  }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
