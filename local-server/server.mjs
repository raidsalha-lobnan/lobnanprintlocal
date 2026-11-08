import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {SyncService} from './sync-service.mjs';
import {revisePostedInvoice} from './invoice-revision-service.mjs';
import {TelegramDelivery} from './telegram-delivery.mjs';
import {InputError} from './sync-domain.mjs';
import {UserAuth,stripUserSecrets} from './user-auth.mjs';
import {resolveAccess,filterSnapshot,filterEvents,authorizeCommand} from './access-policy.mjs';
import {stripPrivateFields} from './legacy-snapshot.mjs';
import {createAccessVerifier} from './access-verifier.mjs';
import {adminDirectoryCommand} from './admin-directory.mjs';
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
const telegramDelivery=new TelegramDelivery(pool,WORKSPACE);
const telegramTimer=setInterval(()=>{void telegramDelivery.drainOnce().catch(e=>console.error('telegram worker',e.message));},10000);
telegramTimer.unref?.();
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
function safeSnapshot(snapshot){
  return {...snapshot,records:snapshot.records.map(row=>({
    ...row,value:stripPrivateFields(
      row.entity==='users'?stripUserSecrets(row.value):row.value)
  }))};
}
function safeEvent(event){
  return {...event,changes:event.changes.map(change=>({
    ...change,value:stripPrivateFields(
      change.entity==='users'?stripUserSecrets(change.value):change.value)
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
  if (verifyAccess) {
    try { await verifyAccess(req.headers['cf-access-jwt-assertion']); }
    catch (error) { return json(res,403,{code:'CLOUDFLARE_ACCESS_REQUIRED'},cors); }
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
    if(req.method==='GET' && url.pathname==='/api/v1/head')
      return json(res,200,{sequence:await service.head(workspace)},cors);
    if(req.method==='GET' && url.pathname==='/api/v1/bootstrap'){
      const snapshot=await service.bootstrap(workspace);
      return json(res,200,STRICT_AUTH?safeSnapshot(filterSnapshot(snapshot,access)):snapshot,cors);
    }
    if(req.method==='GET' && url.pathname==='/api/v1/events'){
      const pulled=await service.pull(workspace,Number(url.searchParams.get('after')||0),
        Math.min(500,Number(url.searchParams.get('limit')||100)));
      return json(res,200,{events:STRICT_AUTH?filterEvents(pulled,access).map(safeEvent):pulled},cors);
    }
    if(req.method==='POST' && url.pathname==='/api/v1/invoices/revise'){
      if(process.env.SYNC_ENABLE_INVOICE_REVISIONS!=='1')
        throw new InputError('INVOICE_REVISION_NOT_YET_ENABLED',503);
      if(!STRICT_AUTH)throw new InputError('SESSION_LOGIN_REQUIRED',401);
      const request=await parseBody(req,350000);
      const receipt=await revisePostedInvoice(service,workspace,request,user.id,access);
      return json(res,200,receipt,cors);
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
    const err=e;
    console.error('sync request',err?.message);
    const safeStatus=err instanceof InputError?err.status:err?.status===403?403:500;
    json(res,safeStatus,
      {code:safeStatus===500?'SERVER_ERROR':err.message,
       detail:err instanceof InputError?err.detail:undefined},cors);
  }
});
const BIND_HOST=process.env.SYNC_BIND_HOST||(STRICT_AUTH?'127.0.0.1':'0.0.0.0');
if(STRICT_AUTH && BIND_HOST!=='127.0.0.1' && BIND_HOST!=='::1')
  throw new Error('Strict authentication API must bind to loopback; access it through zrok instead');
srv.listen(PORT,BIND_HOST,()=>console.log(`Lobnan private sync API listening on ${BIND_HOST}:${PORT}`));
process.on('SIGTERM',()=>{clearInterval(telegramTimer);srv.close();pool.end().finally(()=>process.exit(0));});
