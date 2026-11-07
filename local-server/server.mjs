import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {SyncService} from './sync-service.mjs';
import {InputError} from './sync-domain.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.SYNC_PORT||4577);
const TOKEN=process.env.SYNC_DEVICE_TOKEN||'';
const DATABASE_URL=process.env.DATABASE_URL||'';
const WORKSPACE=process.env.SYNC_WORKSPACE||'lobnan_main';
if(TOKEN.length<32||!DATABASE_URL) throw new Error('SYNC_DEVICE_TOKEN (32+ characters) and DATABASE_URL are mandatory');
const allowedOrigins = new Set((process.env.SYNC_ALLOWED_ORIGINS||'http://localhost:3000,http://127.0.0.1:3000,null').split(',').map(s=>s.trim()));
const pool=new pg.Pool({connectionString:DATABASE_URL,max:12});
const schema=fs.readFileSync(path.join(dir,'schema.sql'),'utf8');
await pool.query(schema);
const service=new SyncService(pool);
const safeEq=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && crypto.timingSafeEqual(x,y);};
function json(res,status,data,origin){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':origin||'','vary':'Origin','access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'GET, POST, OPTIONS','content-length':Buffer.byteLength(body)});res.end(body);}
const srv=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const cors=origin&&allowedOrigins.has(origin)?origin:undefined;
  if(req.method==='OPTIONS'){res.writeHead(cors?204:403,cors?{'access-control-allow-origin':cors,'access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'GET,POST,OPTIONS'}:{});res.end();return;}
  if(origin && !cors) {json(res,403,{code:'ORIGIN_NOT_ALLOWED'});return;}
  const bearer=(req.headers.authorization||'').replace(/^Bearer /i,'');
  if(!safeEq(bearer,TOKEN)){json(res,401,{code:'UNAUTHORIZED'},cors);return;}
  try {
    const url=new URL(req.url||'/', 'http://localhost');
    const workspace=url.searchParams.get('workspace')||WORKSPACE;
    if(workspace!==WORKSPACE) throw new InputError('WRONG_WORKSPACE',403);
    if(req.method==='GET' && url.pathname==='/api/v1/health') return json(res,200,{ok:true,workspace},cors);
    if(req.method==='GET' && url.pathname==='/api/v1/head') return json(res,200,{sequence:await service.head(workspace)},cors);
    if(req.method==='GET' && url.pathname==='/api/v1/bootstrap') return json(res,200,await service.bootstrap(workspace),cors);
    if(req.method==='GET' && url.pathname==='/api/v1/events') return json(res,200,{events:await service.pull(workspace,Number(url.searchParams.get('after')||0),Math.min(500,Number(url.searchParams.get('limit')||100)))},cors);
    if(req.method==='POST' && url.pathname==='/api/v1/push') {
      let bytes=0; const chunks=[];
      for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024)throw new InputError('PAYLOAD_TOO_LARGE',413);chunks.push(chunk);}
      let command;try{command=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new InputError('INVALID_JSON',400);}
      return json(res,200,await service.push(workspace,command),cors);
    }
    json(res,404,{code:'NOT_FOUND'},cors);
  }catch(e){const err=e;console.error('sync request',err?.message);json(res,err instanceof InputError?err.status:500,{code:err instanceof InputError?err.message:'SERVER_ERROR',detail:err instanceof InputError?err.detail:undefined},cors);}
});
srv.listen(PORT,'0.0.0.0',()=>console.log(`Lobnan local sync server listening on :${PORT}`));
process.on('SIGTERM',()=>{srv.close();pool.end().finally(()=>process.exit(0));});
