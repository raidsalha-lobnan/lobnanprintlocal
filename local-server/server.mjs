import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {SyncService} from './sync-service.mjs';
import {revisePostedInvoice} from './invoice-revision-service.mjs';
import {TelegramDelivery} from './telegram-delivery.mjs';
import {TelegramHub} from './telegram-hub.mjs';
import {InputError} from './sync-domain.mjs';
import {UserAuth,stripUserSecrets} from './user-auth.mjs';
import {resolveAccess,filterSnapshot,filterEvents,authorizeCommand} from './access-policy.mjs';
import {stripPrivateFields} from './legacy-snapshot.mjs';
import {classifyApprovedCatalogError} from './approved-settings-guard.mjs';
import {settingsVisibleToUser} from './workspace-settings-public.mjs';
import {findVerifiedSettingsReceipts} from './settings-field-patch.mjs';
import {createAccessVerifier} from './access-verifier.mjs';
import {adminDirectoryCommand} from './admin-directory.mjs';
import {auditLegacyInvoicesReadOnly} from './legacy-invoice-reconciliation.mjs';
import {runWorkspaceReadOnlyAudit} from './operational-health-audit.mjs';
import {DriveStorage,readAttachmentBody,prepareAttachmentTable,recordUploadedAttachment,findUploadedAttachment,startBackupScheduler,safeName,safeMime} from './drive-storage.mjs';
import {RcloneDriveStorage,useRcloneDrive} from './rclone-drive-storage.mjs';
import {GoogleDriveAuthorization} from './drive-oauth.mjs';
import {sanitizedDriveHttpError} from './drive-error-response.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.SYNC_PORT||4577);
const TOKEN=process.env.SYNC_DEVICE_TOKEN||'';
const DATABASE_URL=process.env.DATABASE_URL||'';
const WORKSPACE=process.env.SYNC_WORKSPACE||'lobnan_main';
const STRICT_AUTH=process.env.SYNC_AUTH_MODE==='users';
const ADMIN_USER_ID=process.env.SYNC_ADMIN_USER_ID||'';
const authAttempts=new Map();

if(!DATABASE_URL || (!STRICT_AUTH && TOKEN.length<32))
  throw new Error('DATABASE_URL and legacy SYNC_DEVICE_TOKEN (32+ characters) are mandatory');
const enforceCloudflareAccess = process.env.CF_ACCESS_REQUIRED === '1';
const verifyAccess = enforceCloudflareAccess ? createAccessVerifier({
  teamDomain: process.env.CF_ACCESS_TEAM_DOMAIN,
  audience: process.env.CF_ACCESS_AUD
}) : null;

if(STRICT_AUTH && !process.env.SYNC_ALLOWED_ORIGINS)
  throw new Error('SYNC_ALLOWED_ORIGINS must explicitly list the HTTPS application origin in users auth mode');
const allowedOrigins = new Set((process.env.SYNC_ALLOWED_ORIGINS||
  'http://localhost:3000,http://127.0.0.1:3000,null').split(',').map(s=>s.trim()).filter(Boolean));
if(STRICT_AUTH && (allowedOrigins.has('*')||allowedOrigins.has('null')))
  throw new Error('Wildcard and null origins are prohibited in strict mode');
const pool=new pg.Pool({connectionString:DATABASE_URL,max:12});
const schema=fs.readFileSync(path.join(dir,'schema.sql'),'utf8');
await pool.query(schema);
const service=new SyncService(pool);
await prepareAttachmentTable(pool);
const driveAuthorization=new GoogleDriveAuthorization({pool,workspace:WORKSPACE});
await driveAuthorization.prepare();
const driveStorage=driveAuthorization.ready()
  ?new DriveStorage({refreshTokenProvider:()=>driveAuthorization.refreshToken()})
  :useRcloneDrive()?new RcloneDriveStorage():new DriveStorage();
let lastBackupResult={ok:false,remoteVerified:false,error:'NOT_YET_RUN'};
let backupScheduler=null;
// The Windows hourly task remains untouched. A second, encrypted Google
// backup worker starts only after the admin has authorized this OAuth app.
async function enableVerifiedCloudBackups(){
  if(backupScheduler||process.env.LOBNAN_ENABLE_SERVER_BACKUPS==='0'||
     !driveAuthorization.ready())return false;
  if(!(await driveAuthorization.status()).connected)return false;
  backupScheduler=startBackupScheduler({
    drive:driveStorage,onResult:result=>{lastBackupResult=result;}
  });
  return true;
}
await enableVerifiedCloudBackups();
const currentBackupScheduler=()=>backupScheduler||{
  runOnce:async()=>{throw new InputError('DRIVE_ADMIN_CONSENT_REQUIRED',503);},
  stop:()=>{},getStatus:()=>({running:false,lastCompletedAt:0})
};
const telegramDelivery=new TelegramDelivery(pool,WORKSPACE);
const telegramHub=new TelegramHub(pool,WORKSPACE);
const telegramTimer=setInterval(()=>{void telegramDelivery.drainOnce().catch(e=>console.error('telegram worker',e.message));},10000);
telegramTimer.unref?.();
// The private PostgreSQL server is the sole Telegram update consumer;
// the browser receives claimed commands, not a competing getUpdates stream.
const telegramPollingTimer=setInterval(()=>{
 void telegramHub.pollOnce().catch(e=>console.error('telegram hub',e.message));
},3500);
telegramPollingTimer.unref?.();
const userAuth=new UserAuth(pool,WORKSPACE);
function loginBlocked(key){
  const now=Date.now();
  const state=authAttempts.get(key);
  if(!state || now-state.started > 15*60_000)return false;
  return state.count >= 10;
}
function failedLogin(key){
  const now=Date.now();
  const state=authAttempts.get(key);
  authAttempts.set(key,!state||now-state.started>15*60_000?{started:now,count:1}:
    {started:state.started,count:state.count+1});
  if(authAttempts.size>20000)authAttempts.clear();
}
async function parseBody(req,maxBytes){
  let bytes=0;const chunks=[];
  for await (const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes)throw new InputError('PAYLOAD_TOO_LARGE',413);
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new InputError('INVALID_JSON',400);}
}
function safeSnapshot(snapshot,access){
  return {...snapshot,records:snapshot.records.map(row=>({
    ...row,value:row.entity==='settings'
      ? settingsVisibleToUser(row.value,access)
      : stripPrivateFields(row.entity==='users'?stripUserSecrets(row.value):row.value)
  }))};
}
function safeEvent(event,access){
  return {...event,changes:event.changes.map(change=>({
    ...change,value:change.entity==='settings'
      ? settingsVisibleToUser(change.value,access)
      : stripPrivateFields(change.entity==='users'?stripUserSecrets(change.value):change.value)
  }))};
}

const safeEq=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && crypto.timingSafeEqual(x,y);};
function json(res,status,data,origin){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':origin||'','vary':'Origin','access-control-allow-headers':'Authorization, Content-Type, skip_zrok_interstitial','access-control-allow-methods':'GET, POST, OPTIONS','content-length':Buffer.byteLength(body)});res.end(body);}
const srv=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const cors=origin&&allowedOrigins.has(origin)?origin:undefined;
  if(req.method==='OPTIONS'){res.writeHead(cors?204:403,cors?{'access-control-allow-origin':cors,'access-control-allow-headers':'Authorization, Content-Type, skip_zrok_interstitial','access-control-allow-methods':'GET,POST,OPTIONS'}:{});res.end();return;}
  if(origin && !cors) {json(res,403,{code:'ORIGIN_NOT_ALLOWED'});return;}
  // Origin-side signature validation means a publicly misconfigured Tunnel
  // cannot leak data solely by adding an untrusted request header.
  // Google's redirect is a browser GET without the staff's API bearer token.
  // A single-use, expiring server-side OAuth state and verified email are required.
  // Cloudflare Access is bypassed ONLY for this exact callback route.
  const oauthCallbackPath='/api/v1/drive/oauth/callback';
  const isOauthCallback=req.method==='GET' &&
    new URL(req.url||'/','http://localhost').pathname===oauthCallbackPath;
  if (verifyAccess && !isOauthCallback) {
    try { await verifyAccess(req.headers['cf-access-jwt-assertion']); }
    catch (error) { return json(res,403,{code:'CLOUDFLARE_ACCESS_REQUIRED'},cors); }
  }
  if(isOauthCallback){
    try{
      const callbackUrl=new URL(req.url,'http://localhost');
      if(callbackUrl.searchParams.get('error'))throw new Error('GOOGLE_ACCESS_DENIED');
      await driveAuthorization.callback({
        state:callbackUrl.searchParams.get('state'),
        code:callbackUrl.searchParams.get('code')
      });
      await enableVerifiedCloudBackups();
      res.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end('<!doctype html><meta charset="utf-8"><title>تم ربط Google Drive</title><p dir="rtl">تم ربط حساب Google Drive بالبرنامج. يمكنك إغلاق هذه الصفحة والعودة إلى إعدادات البرنامج.</p>');
    }catch(error){
      res.writeHead(400,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end('<!doctype html><meta charset="utf-8"><p dir="rtl">تعذر إتمام التفويض. أعد إرسال رابط تفويض جديد من إعدادات البرنامج.</p>');
    }
    return;
  }
  try {
    const url=new URL(req.url||'/', 'http://localhost');
    const workspace=url.searchParams.get('workspace')||WORKSPACE;
    if(workspace!==WORKSPACE)throw new InputError('WRONG_WORKSPACE',403);
    if(req.method==='GET' && url.pathname==='/api/v1/health')
      return json(res,200,{ok:true,workspace,authMode:STRICT_AUTH?'users':'legacy'},cors);
    const bearer=(req.headers.authorization||'').replace(/^Bearer /i,'');
    if(STRICT_AUTH && req.method==='POST' && url.pathname==='/api/v1/auth/login'){
      const payload=await parseBody(req,4096);
      const key=String(req.socket.remoteAddress||'unknown')+':'+String(payload?.identifier||'').toLocaleLowerCase();
      if(loginBlocked(key))return json(res,429,{code:'LOGIN_RATE_LIMIT'},cors);
      const session=await userAuth.login(payload?.identifier,payload?.password);
      if(!session){failedLogin(key);return json(res,401,{code:'LOGIN_DENIED'},cors);}
      authAttempts.delete(key);
      return json(res,200,session,cors);
    }
    const user=STRICT_AUTH?await userAuth.authenticate(bearer):null;
    if(STRICT_AUTH&&!user)return json(res,401,{code:'LOGIN_REQUIRED'},cors);
    const access=STRICT_AUTH?await resolveAccess(pool,workspace,user,ADMIN_USER_ID):null;
    if(!STRICT_AUTH&&!safeEq(bearer,TOKEN))return json(res,401,{code:'UNAUTHORIZED'},cors);
    // Drive is never public. Every file request is authenticated as a program user;
    // no OAuth token, shareable public link or actual file bytes enter PostgreSQL.
    if(url.pathname==='/api/v1/drive/status' && req.method==='GET'){
      if(!STRICT_AUTH)throw new InputError('SECURE_LOGIN_REQUIRED',403);
      return json(res,200,{
        configured:driveAuthorization.ready()
          ?(await driveAuthorization.status()).connected
          :driveStorage.configured() && (typeof driveStorage.ready!=='function'||await driveStorage.ready()),
        backend:driveStorage instanceof RcloneDriveStorage?'encrypted-rclone':'google-oauth',
        backup:{ok:lastBackupResult.ok,remoteVerified:lastBackupResult.remoteVerified,
          lastCompletedAt:currentBackupScheduler().getStatus().lastCompletedAt,
          error:lastBackupResult.error||null}
      },cors);
    }
    if(url.pathname==='/api/v1/drive/oauth/status'&&req.method==='GET'){
      if(!STRICT_AUTH||!access?.admin)throw new InputError('ADMIN_REQUIRED',403);
      return json(res,200,await driveAuthorization.status(),cors);
    }
    if(url.pathname==='/api/v1/drive/oauth/send'&&req.method==='POST'){
      if(!STRICT_AUTH||!access?.admin)throw new InputError('ADMIN_REQUIRED',403);
      const payload=await parseBody(req,1024);
      const result=await driveAuthorization.sendLink(payload?.email,user.id);
      return json(res,202,result,cors);
    }
    if(url.pathname==='/api/v1/backups/run' && req.method==='POST'){
      if(!STRICT_AUTH || !access?.admin)throw new InputError('ADMIN_REQUIRED',403);
      // Do not hold a browser request open while PostgreSQL is being dumped.
      void currentBackupScheduler().runOnce().catch(error=>{lastBackupResult={ok:false,error:error.message};});
      return json(res,202,{accepted:true,operation:'postgresql-backup'},cors);
    }
    if(url.pathname==='/api/v1/attachments/upload' && req.method==='POST'){
      if(!STRICT_AUTH)throw new InputError('SECURE_LOGIN_REQUIRED',403);
      if(!access?.can('view')||
         !['view_invoices','view_print_orders','view_pos'].some(key=>access.can(key)))
        throw new InputError('ATTACHMENT_PERMISSION_DENIED',403);
      if(!driveStorage.configured())throw new InputError('DRIVE_OAUTH_NOT_CONFIGURED',503);
      const filename=safeName(url.searchParams.get('name'));
      const mime=safeMime(url.searchParams.get('mime'));
      const content=await readAttachmentBody(req);
      const receipt=await driveStorage.uploadBuffer(content,filename,mime,'attachments');
      await recordUploadedAttachment(pool,workspace,{
        id:receipt.id,name:filename,mime,size:content.length
      },user.id);
      return json(res,201,{fileId:receipt.id,name:filename,size:content.length,
        mimeType:mime,storageType:'drive'},cors);
    }
    if(req.method==='GET'&&url.pathname.startsWith('/api/v1/attachments/content/')){
      if(!STRICT_AUTH)throw new InputError('SECURE_LOGIN_REQUIRED',403);
      if(!access?.can('view')||
         !['view_invoices','view_print_orders','view_pos'].some(key=>access.can(key)))
        throw new InputError('ATTACHMENT_PERMISSION_DENIED',403);
      const id=decodeURIComponent(url.pathname.slice('/api/v1/attachments/content/'.length));
      if(!/^[a-zA-Z0-9_-]{8,200}$/.test(id))throw new InputError('INVALID_ATTACHMENT_ID',400);
      const row=await findUploadedAttachment(pool,workspace,id);
      if(!row)throw new InputError('ATTACHMENT_NOT_FOUND',404);
      const bytes=await driveStorage.download(id);
      res.writeHead(200,{
        'content-type':safeMime(row.mime_type),
        'content-length':bytes.length,
        'cache-control':'no-store',
        'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(safeName(row.original_name)),
        'x-content-type-options':'nosniff',
        'access-control-allow-origin':cors||'',
        'vary':'Origin'
      });
      return res.end(bytes);
    }
    if(STRICT_AUTH&&req.method==='GET'&&url.pathname==='/api/v1/admin/operational-health'){
      if(!access?.admin)throw new InputError('ADMIN_REQUIRED',403);
      const report=await runWorkspaceReadOnlyAudit(pool,workspace);
      return json(res,200,report,cors);
    }
    if(STRICT_AUTH&&req.method==='GET'&&url.pathname==='/api/v1/admin/invoices/reconciliation'){
      if(!access?.admin)throw new InputError('ADMIN_REQUIRED',403);
      const report=await auditLegacyInvoicesReadOnly(pool,workspace);
      return json(res,200,report,cors);
    }
    if(STRICT_AUTH && req.method==='POST' && url.pathname==='/api/v1/admin/directory'){
      const command=await parseBody(req,32768);
      const receipt=await adminDirectoryCommand(pool,workspace,access,command);
      return json(res,200,receipt,cors);
    }
    if(STRICT_AUTH && req.method==='GET' && url.pathname==='/api/v1/auth/me')
      return json(res,200,{user},cors);
    if(STRICT_AUTH && req.method==='POST' && url.pathname==='/api/v1/auth/logout'){
      await userAuth.logout(bearer);
      return json(res,200,{ok:true},cors);
    }
    if(req.method==='POST' && url.pathname==='/api/v1/telegram/inbox/claim'){
      if(!STRICT_AUTH)throw new InputError('SESSION_LOGIN_REQUIRED',401);
      return json(res,200,{item:await telegramHub.claimInbox()},cors);
    }
    if(req.method==='POST' && url.pathname==='/api/v1/telegram/inbox/ack'){
      if(!STRICT_AUTH)throw new InputError('SESSION_LOGIN_REQUIRED',401);
      const payload=await parseBody(req,2048);
      const ok=await telegramHub.ackInbox(payload?.updateId,payload?.leaseToken);
      if(!ok)throw new InputError('TELEGRAM_INBOX_LEASE_EXPIRED',409);
      return json(res,200,{ok:true},cors);
    }
    if(req.method==='GET' && url.pathname==='/api/v1/head')
      return json(res,200,{sequence:await service.head(workspace)},cors);
    if(req.method==='GET' && url.pathname==='/api/v1/bootstrap'){
      const snapshot=await service.bootstrap(workspace);
      return json(res,200,STRICT_AUTH?safeSnapshot(filterSnapshot(snapshot,access),access):snapshot,cors);
    }
    if(req.method==='GET' && url.pathname==='/api/v1/events'){
      const pulled=await service.pull(workspace,Number(url.searchParams.get('after')||0),
        Math.min(500,Number(url.searchParams.get('limit')||100)));
      return json(res,200,{events:STRICT_AUTH?filterEvents(pulled,access).map(event=>safeEvent(event,access)):pulled},cors);
    }
    if(req.method==='POST' && url.pathname==='/api/v1/invoices/revise'){
      // Financial amendments are routed through the authenticated, auditable
      // PostgreSQL correction engine instead of the legacy browser repost.
      // Operators can explicitly disable revisions during emergency recovery.
      if(process.env.SYNC_ENABLE_INVOICE_REVISIONS==='0')
        throw new InputError('INVOICE_REVISION_MAINTENANCE_MODE',503);
      if(!STRICT_AUTH)throw new InputError('SESSION_LOGIN_REQUIRED',401);
      const request=await parseBody(req,350000);
      const receipt=await revisePostedInvoice(service,workspace,request,user.id,access);
      return json(res,200,receipt,cors);
    }
    if(STRICT_AUTH && req.method==='POST' && url.pathname==='/api/v1/receipts/check'){
      // Verify an already-committed SETTINGS command by owner and exact payload
      // fingerprint. Read-only: never reapply a posting or expose record values.
      const input=await parseBody(req,12000);
      const receipts=await findVerifiedSettingsReceipts(pool,workspace,user.id,input?.proofs);
      return json(res,200,{receipts},cors);
    }
    if(req.method==='POST' && url.pathname==='/api/v1/push'){
      const command=await parseBody(req,1024*1024);
      if(STRICT_AUTH){
        if(command?.changes?.some(change=>change?.entity==='users'||
           change?.entity==='roles')){
          // Admin-managed user and role changes need separate credential-aware APIs.
          throw new InputError('AUTH_ADMIN_WRITE_REQUIRES_SECURE_API',403);
        }
        await authorizeCommand(pool,workspace,access,command);
        // Role permissions do NOT replace domain-specific accounting validation.
        // Finalized financial operations need further end-to-end validation.
      }
      const receipt=await service.push(workspace,command,STRICT_AUTH?user.id:null);
      return json(res,200,STRICT_AUTH?{...receipt,changes:receipt.changes.map(c=>({
        ...c,value:stripPrivateFields(c.entity==='users'?stripUserSecrets(c.value):c.value)
      }))}:receipt,cors);
    }
    json(res,404,{code:'NOT_FOUND'},cors);
  }catch(e){
    const err=classifyApprovedCatalogError(e);
    console.error('sync request',err?.message);
    const driveProblem=sanitizedDriveHttpError(err);
    // Expected OAuth configuration failures are actionable errors, not generic
    // SERVER_ERROR 500. Only explicitly allowlisted codes can be returned.
    const safeStatus=driveProblem?.status||
      (err instanceof InputError?err.status:err?.status===403?403:500);
    json(res,safeStatus,
      {code:driveProblem?.code||(safeStatus===500?'SERVER_ERROR':err.message),
       detail:err instanceof InputError?err.detail:undefined},cors);
  }
});
const BIND_HOST=process.env.SYNC_BIND_HOST||(STRICT_AUTH?'127.0.0.1':'0.0.0.0');
if(STRICT_AUTH && BIND_HOST!=='127.0.0.1' && BIND_HOST!=='::1')
  throw new Error('Strict authentication API must bind to loopback; access it through zrok instead');
srv.listen(PORT,BIND_HOST,()=>console.log(`Lobnan private sync API listening on ${BIND_HOST}:${PORT}`));
process.on('SIGTERM',()=>{currentBackupScheduler().stop();clearInterval(telegramTimer);clearInterval(telegramPollingTimer);srv.close();pool.end().finally(()=>process.exit(0));});
