import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {MAX_ATTACHMENT_BYTES,safeName,safeMime} from './drive-storage.mjs';

// The rclone crypt remote is private to the accounting server, not a shared
// Drive folder. Only this app's authenticated API can download attachments.
export class RcloneDriveStorage {
  constructor({env=process.env,spawnProcess=spawn}={}){
    this.env=env;
    this.spawnProcess=spawnProcess;
    this.executable=env.LOBNAN_RCLONE_PATH||
      (process.platform==='win32'?'D:\\LobnanData\\tools\\rclone\\rclone.exe':'rclone');
    const root=env.LOBNAN_RCLONE_REMOTE||'lobnan-encrypted:';
    this.remote=/[:/]$/.test(root)?root:root+'/';
  }
  configured(){
    return this.executable==='rclone' || fs.existsSync(this.executable);
  }
  target(relative){
    if(!/^(?:attachments|backups)\/[A-Za-z0-9._-]{1,200}$/.test(relative))
      throw new Error('INVALID_RCLONE_TARGET');
    return this.remote+relative;
  }
  async run(args,{input=null,maxBytes=256*1024}={}){
    return new Promise((resolve,reject)=>{
      const child=this.spawnProcess(this.executable,[...args,'--log-level','ERROR'],{
        stdio:['pipe','pipe','pipe'],windowsHide:true
      });
      let size=0,errors='',completed=false;
      const chunks=[];
      const fail=error=>{
        if(completed)return;
        completed=true;
        child.kill?.();
        reject(error);
      };
      child.stdout.on('data',buffer=>{
        size+=buffer.length;
        if(size>maxBytes)return fail(new Error('RCLONE_OUTPUT_TOO_LARGE'));
        chunks.push(buffer);
      });
      child.stderr.on('data',buffer=>{errors+=(String(buffer)).slice(0,500);});
      child.on('error',fail);
      child.on('close',code=>{
        if(completed)return;
        completed=true;
        if(code!==0)reject(new Error('RCLONE_OPERATION_FAILED'));
        else resolve(Buffer.concat(chunks));
      });
      if(input)child.stdin.end(input);
      else child.stdin.end();
    });
  }
  async ready(){
    if(!this.configured())return false;
    try{await this.run(['lsf',this.remote,'--max-depth','1'],{maxBytes:1024*1024});return true;}
    catch{return false;}
  }
  async uploadBuffer(buffer,name,mime='application/octet-stream'){
    if(!Buffer.isBuffer(buffer)||!buffer.length)throw new Error('ATTACHMENT_EMPTY');
    if(buffer.length>MAX_ATTACHMENT_BYTES)throw new Error('ATTACHMENT_TOO_LARGE');
    const id='att_'+crypto.randomUUID();
    const destination=this.target('attachments/'+id);
    await this.run(['rcat',destination],{input:buffer,maxBytes:4096});
    const check=await this.run(['cat',destination],{maxBytes:MAX_ATTACHMENT_BYTES});
    const checksum=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
    if(check.length!==buffer.length||checksum(check)!==checksum(buffer))
      throw new Error('RCLONE_UPLOAD_VERIFICATION_FAILED');
    return {id,name:safeName(name),mimeType:safeMime(mime),size:buffer.length};
  }
  async download(id,maxBytes=MAX_ATTACHMENT_BYTES){
    if(!/^att_[0-9a-f-]{36}$/.test(id))throw new Error('INVALID_ATTACHMENT_ID');
    return this.run(['cat',this.target('attachments/'+id)],{maxBytes});
  }
  async uploadBackup(file,name){
    const cleaned=safeName(name);
    const stat=fs.statSync(file);
    const destination=this.target('backups/'+cleaned);
    await this.run(['copyto',file,destination],{maxBytes:8192});
    // Read back the encrypted remote through crypt to validate plaintext.
    const digest=await this.remoteHash(destination);
    const local=await this.localHash(file);
    if(digest.bytes!==stat.size||digest.sha256!==local)
      throw new Error('RCLONE_BACKUP_CHECKSUM_MISMATCH');
    return {id:'backups/'+cleaned,size:stat.size,sha256:local};
  }
  async remoteHash(target){
    return new Promise((resolve,reject)=>{
      const child=this.spawnProcess(this.executable,['cat',target,'--log-level','ERROR'],{
        stdio:['ignore','pipe','pipe'],windowsHide:true
      });
      let bytes=0,closed=false;
      const hash=crypto.createHash('sha256');
      child.stdout.on('data',chunk=>{bytes+=chunk.length;hash.update(chunk);});
      child.stderr.on('data',()=>{});
      child.on('error',err=>{if(!closed){closed=true;reject(err);}});
      child.on('close',code=>{
        if(closed)return;
        closed=true;
        if(code!==0)reject(new Error('RCLONE_REMOTE_CHECK_FAILED'));
        else resolve({bytes,sha256:hash.digest('hex')});
      });
    });
  }
  async localHash(file){
    const hash=crypto.createHash('sha256');
    for await(const chunk of createReadStream(file))hash.update(chunk);
    return hash.digest('hex');
  }
}
export function useRcloneDrive(env=process.env){
  const pathFromEnv=env.LOBNAN_RCLONE_PATH;
  if(pathFromEnv)return fs.existsSync(pathFromEnv);
  return process.platform==='win32' && fs.existsSync('D:\\LobnanData\\tools\\rclone\\rclone.exe');
}
