import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const parent=path.dirname(root);
const url='http://127.0.0.1:14577';
const origin='https://lobnan-test.example';
const env={...process.env,SYNC_AUTH_MODE:'users',
  DATABASE_URL:process.env.DATABASE_URL,
  SYNC_ALLOWED_ORIGINS:origin,SYNC_PORT:'14577',SYNC_BIND_HOST:'127.0.0.1',
  SYNC_WORKSPACE:'lobnan_main'};
function execute(file,args){
  return new Promise((resolve,reject)=>{
    const run=spawn(process.execPath,[file,...args],{env,stdio:['ignore','pipe','pipe']});
    let out='';
    run.stdout.on('data',d=>{out+=d.toString()});
    run.stderr.on('data',d=>{out+=d.toString()});
    run.once('error',reject);
    run.once('exit',code=>code===0?resolve(out):reject(Error('exit '+code+': '+out.slice(-1000))));
  });
}
const fixture={
  exportedAt:'2026-11-08T00:00:00.000Z',
  roles:[
    {id:'role-admin',code:'SYS_ADMIN',permissions:{view:true,view_invoices:true,add:true,edit:true}},
    {id:'role-cashier',code:'CASHIER',permissions:{view:true,view_pos:true,add:true,edit:false}}
  ],
  users:[
    {id:'admin-id',username:'admin',password:'test-admin-only',roleId:'role-admin',
      companyId:'comp1',defaultBranchId:'b1',allowedBranchIds:['*'],status:'active',fullName:'Owner'},
    {id:'cash-id',username:'cashier',password:'test-cashier-only',roleId:'role-cashier',
      companyId:'comp1',defaultBranchId:'b1',allowedBranchIds:['b1'],status:'active',fullName:'Worker'}
  ],
  branches:[{id:'b1',name:'One',companyId:'comp1'},{id:'b2',name:'Two',companyId:'comp1'}],
  invoices:[{id:'inv1',invoiceNumber:'INV-0001',branchId:'b1',companyId:'comp1',totalAmount:6},
    {id:'inv2',invoiceNumber:'INV-0002',branchId:'b2',companyId:'comp1',totalAmount:7}]
};
async function api(route,{token,method='GET',body,Origin=origin}={}){
  const response=await fetch(url+route,{
    method,
    headers:{
      ...(Origin?{Origin}:{}),
      ...(token?{Authorization:'Bearer '+token}:{}),
      ...(body?{'Content-Type':'application/json'}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  let data=null;
  try{data=await response.json()}catch{}
  return {status:response.status,data,headers:response.headers};
}
test('isolated PostgreSQL server enforces login, branch ACL, no secret leakage, and invoice sequence', {timeout:120000},async t=>{
  if(!env.DATABASE_URL)throw Error('Test DATABASE_URL not configured');
  const temp=mkdtempSync(path.join(tmpdir(),'lobnan-test-'));
  const file=path.join(temp,'sample-snapshot.json');
  writeFileSync(file,JSON.stringify(fixture));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const importLog=await execute(path.join(parent,'import-legacy-snapshot.mjs'),
    [file,'--apply','--confirm-empty-workspace']);
  assert.match(importLog,/IMPORT_COMMITTED/);
  const server=spawn(process.execPath,[path.join(parent,'server.mjs')],{env,stdio:['ignore','pipe','pipe']});
  t.after(()=>server.kill('SIGTERM'));
  let ready=false;
  for(let i=0;i<75;i++){
    if(server.exitCode!==null)throw Error('API crashed unexpectedly');
    try{const r=await api('/api/v1/health',{Origin:''});if(r.status===200&&r.data.authMode==='users'){ready=true;break;}}
    catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'API did not bind to local port');
  assert.equal((await api('/api/v1/bootstrap?workspace=lobnan_main')).status,401);
  assert.equal((await api('/api/v1/auth/login',{method:'POST',body:{identifier:'admin',password:'wrong'}})).status,401);
  const admin=(await api('/api/v1/auth/login',{method:'POST',
    body:{identifier:'admin',password:'test-admin-only'}}));
  assert.equal(admin.status,200);
  assert.equal(admin.data.user.id,'admin-id');
  assert.equal(Object.hasOwn(admin.data.user,'password'),false);
  const worker=(await api('/api/v1/auth/login',{method:'POST',
    body:{identifier:'cashier',password:'test-cashier-only'}}));
  assert.equal(worker.status,200);
  assert.ok(worker.data.token);
  const adminSnap=(await api('/api/v1/bootstrap?workspace=lobnan_main',{token:admin.data.token}));
  assert.equal(adminSnap.status,200);
  assert.equal(adminSnap.data.records.filter(r=>r.entity==='invoices').length,2);
  const cashierSnap=(await api('/api/v1/bootstrap?workspace=lobnan_main',{token:worker.data.token}));
  assert.equal(cashierSnap.status,200);
  assert.deepEqual(cashierSnap.data.records.filter(r=>r.entity==='invoices').map(r=>r.id),['inv1']);
  assert.equal(JSON.stringify(cashierSnap.data).includes('test-admin-only'),false);
  assert.equal(JSON.stringify(cashierSnap.data).includes('test-cashier-only'),false);
  assert.equal((await api('/api/v1/bootstrap',{token:worker.data.token,Origin:'https://attacker.example'})).status,403);
  const forbidden={
    id:'command-crossbranch-0001',workspaceId:'lobnan_main',
    changes:[{entity:'invoices',id:'new2',expectedVersion:0,
      value:{id:'new2',branchId:'b2',companyId:'comp1',totalAmount:18}}]
  };
  assert.equal((await api('/api/v1/push',{method:'POST',token:worker.data.token,body:forbidden})).status,403);
  const accepted={
    id:'command-localbranch-0001',workspaceId:'lobnan_main',
    changes:[{entity:'invoices',id:'new1',expectedVersion:0,
      value:{id:'new1',branchId:'b1',companyId:'comp1',totalAmount:18,invoiceNumber:'TEMP-new1'}}]
  };
  const push=await api('/api/v1/push',{method:'POST',token:worker.data.token,body:accepted});
  assert.equal(push.status,200,'PostgreSQL push response: '+JSON.stringify(push.data));
  assert.equal(push.data.changes[0].value.invoiceNumber,'INV-0003');
  const replay=await api('/api/v1/push',{method:'POST',token:worker.data.token,body:accepted});
  assert.equal(replay.status,200);
  assert.deepEqual(replay.data,push.data);
  const otherUserReplay=await api('/api/v1/push',{
    method:'POST',token:admin.data.token,body:accepted
  });
  assert.equal(otherUserReplay.status,403,'Other users cannot replay a cashier operation');
  const o=await fetch(url+'/api/v1/bootstrap',{method:'OPTIONS',headers:{
    Origin:origin,'Access-Control-Request-Headers':'authorization,skip_zrok_interstitial',
    'Access-Control-Request-Method':'GET'
  }});
  assert.equal(o.status,204);
  assert.match(o.headers.get('access-control-allow-headers')||'',/skip_zrok_interstitial/);
  await api('/api/v1/auth/logout',{method:'POST',token:worker.data.token});
  assert.equal((await api('/api/v1/bootstrap',{token:worker.data.token})).status,401);
});
