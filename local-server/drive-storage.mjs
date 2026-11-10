import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';

const DRIVE_API='https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const MAX_ATTACHMENT_BYTES=50*1024*1024;
const BACKUP_INTERVAL_MS=60*60*1000;
const BACKUP_RETRY_MS=5*60*1000;
const safeName=(name)=>String(name||'attachment').replace(/[\\/\x00-\x1f]/g,'_').slice(0,180)||'attachment';
const safeMime=(value)=>/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(value||''))?String(value):'application/octet-stream';
const withError=(code,status=503)=>Object.assign(new Error(code),{status});

export async function readAttachmentBody(req,maxBytes=MAX_ATTACHMENT_BYTES){
  let bytes=0;const chunks=[];
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes)throw withError('ATTACHMENT_TOO_LARGE',413);
    chunks.push(chunk);
  }
  if(!bytes)throw withError('ATTACHMENT_EMPTY',400);
  return Buffer.concat(chunks);
}

export class DriveStorage {
  constructor({env=process.env,fetcher=fetch,clock=()=>Date.now()}={}){
    this.env=env;this.fetcher=fetcher;this.clock=clock;
    this.token=null;this.tokenUntil=0;this.folders=new Map();
  }
  configured(){
    return Boolean(this.env.GOOGLE_OAUTH_CLIENT_ID&&this.env.GOOGLE_OAUTH_CLIENT_SECRET&&this.env.GOOGLE_OAUTH_REFRESH_TOKEN);
  }
  async tokenForDrive(){
    if(!this.configured())throw withError('DRIVE_OAUTH_NOT_CONFIGURED');
    if(this.token&&this.tokenUntil>this.clock()+60000)return this.token;
    const response=await this.fetcher('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        client_id:this.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret:this.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token:this.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        grant_type:'refresh_token'
      })
    });
    if(!response.ok)throw withError('DRIVE_OAUTH_REFRESH_FAILED');
    const payload=await response.json();
    if(typeof payload.access_token!=='string'||!payload.access_token)throw withError('DRIVE_OAUTH_TOKEN_MISSING');
    this.token=payload.access_token;
    this.tokenUntil=this.clock()+Math.max(60,Number(payload.expires_in)||3600)*1000;
    return this.token;
  }
  async driveJson(url,options={}){
    const token=await this.tokenForDrive();
    const res=await this.fetcher(url,{
      ...options,headers:{Authorization:'Bearer '+token,...options.headers}
    });
    if(!res.ok)throw withError('DRIVE_API_HTTP_'+res.status);
    return res.json();
  }
  async folder(kind){
    const explicit=kind==='attachments'?this.env.GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID:this.env.GOOGLE_DRIVE_BACKUPS_FOLDER_ID;
    if(explicit)return explicit;
    if(this.folders.has(kind))return this.folders.get(kind);
    const name=kind==='attachments'?'Lobnan_Print_Attachments':'Lobnan_Accounting_Hourly_Backups';
    const q="name='"+name+"' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const listing=await this.driveJson(DRIVE_API+'?q='+encodeURIComponent(q)+'&fields=files(id,name)&pageSize=100');
    let id=listing.files?.find(row=>row?.name===name)?.id;
    if(!id){
      const folder=await this.driveJson(DRIVE_API+'?fields=id',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder'})
      });
      id=folder.id;
    }
    if(!id)throw withError('DRIVE_FOLDER_UNAVAILABLE');
    this.folders.set(kind,id);
    return id;
  }
  async initiateUpload(name,mime,size,parent){
    const token=await this.tokenForDrive();
    const response=await this.fetcher(DRIVE_UPLOAD+'?uploadType=resumable&fields=id,name,size,mimeType,md5Checksum',{
      method:'POST',
      headers:{
        Authorization:'Bearer '+token,
        'Content-Type':'application/json; charset=UTF-8',
        'X-Upload-Content-Type':mime,
        'X-Upload-Content-Length':String(size)
      },
      body:JSON.stringify({name:safeName(name),parents:[parent]})
    });
    const location=response.headers?.get('location');
    if(!response.ok||!location||!/^https:\/\/([a-z0-9-]+\.)*googleapis\.com\//i.test(location))
      throw withError('DRIVE_UPLOAD_SESSION_FAILED');
    return location;
  }
  async uploadBuffer(buffer,name,mime='application/octet-stream',kind='attachments'){
    if(!Buffer.isBuffer(buffer)||!buffer.length)throw withError('ATTACHMENT_EMPTY',400);
    const folderId=await this.folder(kind);
    const uri=await this.initiateUpload(name,safeMime(mime),buffer.length,folderId);
    const res=await this.fetcher(uri,{method:'PUT',headers:{
      'Content-Type':safeMime(mime),'Content-Length':String(buffer.length)
    },body:buffer});
    if(!res.ok)throw withError('DRIVE_UPLOAD_FAILED_'+res.status);
    const uploaded=await res.json();
    if(!uploaded.id)throw withError('DRIVE_UPLOAD_RECEIPT_MISSING');
    return uploaded;
  }
  async uploadBackup(file,name){
    const stat=await fsp.stat(file);
    const folderId=await this.folder('backups');
    const uri=await this.initiateUpload(name,'application/octet-stream',stat.size,folderId);
    const res=await this.fetcher(uri,{
      method:'PUT',headers:{'Content-Type':'application/octet-stream','Content-Length':String(stat.size)},
      body:createReadStream(file),duplex:'half'
    });
    if(!res.ok)throw withError('BACKUP_DRIVE_UPLOAD_FAILED_'+res.status);
    const uploaded=await res.json();
    if(!uploaded.id||Number(uploaded.size)!==stat.size)throw withError('BACKUP_DRIVE_SIZE_MISMATCH');
    // Verify server-side checksum before reporting a successful remote backup.
    const md5=await fileHash(file,'md5');
    const verified=await this.driveJson(DRIVE_API+'/'+encodeURIComponent(uploaded.id)+'?fields=id,size,md5Checksum');
    if(Number(verified.size)!==stat.size||!verified.md5Checksum||verified.md5Checksum.toLowerCase()!==md5)
      throw withError('BACKUP_DRIVE_CHECKSUM_MISMATCH');
    return {id:uploaded.id,size:stat.size,md5};
  }
  async download(fileId,maxBytes=MAX_ATTACHMENT_BYTES){
    const token=await this.tokenForDrive();
    const res=await this.fetcher(DRIVE_API+'/'+encodeURIComponent(fileId)+'?alt=media',{
      headers:{Authorization:'Bearer '+token}
    });
    if(!res.ok)throw withError('DRIVE_DOWNLOAD_FAILED_'+res.status);
    const length=Number(res.headers.get('content-length')||0);
    if(length>maxBytes)throw withError('ATTACHMENT_TOO_LARGE',413);
    const bytes=Buffer.from(await res.arrayBuffer());
    if(bytes.length>maxBytes)throw withError('ATTACHMENT_TOO_LARGE',413);
    return bytes;
  }
}
async function fileHash(file,algorithm){
  const hash=crypto.createHash(algorithm);
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
export async function prepareAttachmentTable(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS sync_drive_attachments (
    workspace TEXT NOT NULL,
    file_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace,file_id)
  )`);
}
export async function recordUploadedAttachment(pool,workspace,upload,owner){
  await pool.query(
    'INSERT INTO sync_drive_attachments(workspace,file_id,original_name,mime_type,file_size,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [workspace,upload.id,upload.name,upload.mime,upload.size,String(owner||'')]
  );
}
export async function findUploadedAttachment(pool,workspace,fileId){
  const r=await pool.query('SELECT file_id,original_name,mime_type,file_size FROM sync_drive_attachments WHERE workspace=$1 AND file_id=$2 LIMIT 1',[workspace,fileId]);
  return r.rows[0]||null;
}
export async function runPgDump({env=process.env,now=()=>new Date(),spawnProcess=spawn}={}){
  if(!env.DATABASE_URL)throw withError('BACKUP_DATABASE_URL_MISSING');
  const destination=path.resolve(env.LOBNAN_BACKUP_DIR||path.join(os.homedir(),'LobnanData','private','backups'));
  await fsp.mkdir(destination,{recursive:true,mode:0o700});
  const uri=new URL(env.DATABASE_URL);
  const password=decodeURIComponent(uri.password||'');
  uri.password='';
  const stamp=now().toISOString().replace(/[:.]/g,'-');
  const file=path.join(destination,'lobnan-postgres-'+stamp+'-'+crypto.randomBytes(4).toString('hex')+'.dump');
  const dump=env.PG_DUMP_PATH||'pg_dump';
  let stderr='';
  try{
    await new Promise((resolve,reject)=>{
      const child=spawnProcess(dump,['--format=custom','--no-owner','--no-acl','--file',file,'--dbname',uri.toString()],{
        env:{...env,PGPASSWORD:password},windowsHide:true,stdio:['ignore','ignore','pipe']
      });
      child.stderr?.on('data',chunk=>{stderr+=String(chunk).slice(0,1024);});
      child.on('error',reject);
      child.on('exit',code=>code===0?resolve():reject(new Error('PG_DUMP_EXIT_'+code)));
    });
    const stat=await fsp.stat(file);
    if(stat.size<100)throw new Error('BACKUP_TOO_SMALL');
    return {file,bytes:stat.size,sha256:await fileHash(file,'sha256'),createdAt:now().toISOString()};
  }catch(err){
    await fsp.rm(file,{force:true}).catch(()=>{});
    throw err;
  }
}
export function startBackupScheduler({drive,env=process.env,logger=console,onResult=()=>{}}={}){
  let running=false,closed=false,lastCompletedAt=0;
  const interval=Math.max(15,Number(env.LOBNAN_BACKUP_INTERVAL_MINUTES)||60)*60000;
  const retention=Math.max(7,Number(env.LOBNAN_BACKUP_RETENTION_DAYS)||30)*86400000;
  const job=async()=>{
    if(running||closed)return;
    running=true;
    try{
      const dump=await runPgDump({env});
      let upload=null,remoteVerified=false;
      try{
        if(drive.configured()){
          upload=await drive.uploadBackup(dump.file,path.basename(dump.file));
          remoteVerified=true;
        }
      }catch(error){logger.error('backup drive upload failed:',error.message);}
      // Never delete the last three local copies or any unverified backup solely
      // because a remote upload has not yet been acknowledged.
      if(remoteVerified){
        const entries=(await fsp.readdir(path.dirname(dump.file))).filter(x=>/^lobnan-postgres-.*\.dump$/.test(x)).sort();
        for(const old of entries.slice(0,Math.max(0,entries.length-3))){
          const full=path.join(path.dirname(dump.file),old);
          const stat=await fsp.stat(full);
          if(Date.now()-stat.mtimeMs>retention)await fsp.rm(full,{force:true});
        }
      }
      lastCompletedAt=Date.now();
      onResult({ok:true,localFile:dump.file,bytes:dump.bytes,sha256:dump.sha256,remoteVerified,driveFileId:upload?.id||null});
    }catch(error){
      logger.error('scheduled PostgreSQL backup failed:',error.message);
      onResult({ok:false,error:error.message});
    }finally{running=false;}
  };
  const timer=setInterval(()=>{void job();},interval);
  timer.unref?.();
  // A full first backup is scheduled immediately, never on import/test.
  const boot=setTimeout(()=>{void job();},10000);
  boot.unref?.();
  return {runOnce:job,stop:()=>{closed=true;clearInterval(timer);clearTimeout(boot);},getStatus:()=>({running,lastCompletedAt})};
}
export {MAX_ATTACHMENT_BYTES,BACKUP_INTERVAL_MS,BACKUP_RETRY_MS,safeName,safeMime};
