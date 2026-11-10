import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {GoogleDriveAuthorization,encryptToken,decryptToken} from '../drive-oauth.mjs';

const key=crypto.randomBytes(32).toString('base64');
const env={
  GOOGLE_OAUTH_CLIENT_ID:'web-client-test',
  GOOGLE_OAUTH_CLIENT_SECRET:'web-secret',
  GOOGLE_OAUTH_REDIRECT_URI:'https://example.test/api/v1/drive/oauth/callback',
  GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY:key,
  RESEND_API_KEY:'delivery-test-key',
  GOOGLE_DRIVE_LINK_FROM:'Drive Admin <noreply@example.test>'
};
function fakePool(){
  const issued=new Map();
  let connection=null;
  return {
    issued,get connection(){return connection;},
    async query(sql,args){
      if(sql.startsWith('CREATE TABLE'))return {rows:[]};
      if(sql.startsWith('INSERT INTO sync_google_drive_oauth_requests')){
        issued.set(args[1],{email:args[2],actor_id:args[3],used:false});
        return {rows:[]};
      }
      if(sql.startsWith('DELETE FROM sync_google_drive_oauth_requests')){
        issued.delete(args[1]);return {rows:[]};
      }
      if(sql.startsWith('UPDATE sync_google_drive_oauth_requests')){
        const issuedState=issued.get(args[1]);
        if(!issuedState||issuedState.used)return {rows:[]};
        issuedState.used=true;
        return {rows:[{email:issuedState.email,actor_id:issuedState.actor_id}]};
      }
      if(sql.startsWith('INSERT INTO sync_google_drive_connections')){
        connection={workspace:args[0],email:args[1],encrypted_refresh_token:args[2],connected_by:args[3]};
        return {rows:[]};
      }
      if(sql.startsWith('SELECT email,connected_at'))return {rows:connection?[{email:connection.email,connected_at:new Date()}]:[]};
      if(sql.startsWith('SELECT encrypted_refresh_token'))return {rows:connection?[connection]:[]};
      throw new Error('Unexpected query: '+sql);
    }
  };
}
test('refresh token is encrypted with authenticated AES-GCM',()=>{
  const encrypted=encryptToken('private-refresh',key);
  assert.notEqual(encrypted,'private-refresh');
  assert.equal(decryptToken(encrypted,key),'private-refresh');
  assert.throws(()=>decryptToken(encrypted,crypto.randomBytes(32).toString('base64')));
});
test('sending email uses single-use state, verified account and server-only refresh token',async()=>{
  const pool=fakePool();
  let link='',emails=0;
  const fetcher=async(url,opts={})=>{
    if(url.includes('api.resend.com')){
      emails++;
      const payload=JSON.parse(opts.body);
      assert.deepEqual(payload.to,['owner@example.test']);
      link=payload.text.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[^\s]+/)[0];
      return new Response(JSON.stringify({id:'email-1'}),{status:200});
    }
    if(url.endsWith('/token'))return new Response(JSON.stringify({
      access_token:'access-only-server',refresh_token:'refresh-only-server'
    }),{status:200});
    if(url.includes('userinfo'))return new Response(JSON.stringify({
      email:'owner@example.test',email_verified:true
    }),{status:200});
    throw new Error('Unknown '+url);
  };
  const auth=new GoogleDriveAuthorization({pool,workspace:'lobnan_main',env,fetcher});
  const sent=await auth.sendLink('Owner@Example.Test','admin1');
  assert.equal(sent.sent,true);assert.equal(emails,1);
  const parsed=new URL(link);
  assert.equal(parsed.searchParams.get('login_hint'),'owner@example.test');
  assert.equal(parsed.searchParams.get('access_type'),'offline');
  const state=parsed.searchParams.get('state');
  const result=await auth.callback({state,code:'authorization-code'});
  assert.equal(result.email,'owner@example.test');
  assert.equal(await auth.refreshToken(),'refresh-only-server');
  assert.notEqual(pool.connection.encrypted_refresh_token,'refresh-only-server');
  await assert.rejects(auth.callback({state,code:'replayed-code'}),/STATE_EXPIRED/);
});
test('wrong Google account is never linked',async()=>{
  const pool=fakePool();
  let state='';
  const fetcher=async(url,opts={})=>{
    if(url.includes('api.resend.com')){
      const body=JSON.parse(opts.body);
      state=new URL(body.text.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[^\s]+/)[0]).searchParams.get('state');
      return new Response('{}',{status:200});
    }
    if(url.endsWith('/token'))return new Response(JSON.stringify({
      access_token:'access',refresh_token:'refresh'
    }),{status:200});
    if(url.includes('userinfo'))return new Response(JSON.stringify({
      email:'impostor@example.test',email_verified:true
    }),{status:200});
    throw new Error('Unexpected URL');
  };
  const auth=new GoogleDriveAuthorization({pool,workspace:'main',env,fetcher});
  await auth.sendLink('owner@example.test','admin2');
  await assert.rejects(auth.callback({state,code:'code'}),/ACCOUNT_MISMATCH/);
  assert.equal((await auth.status()).connected,false);
});
test('lack of configured client or mail rejects and does not create invitations',async()=>{
  const pool=fakePool();
  const missingOAuth=new GoogleDriveAuthorization({pool,workspace:'main',env:{}});
  await assert.rejects(missingOAuth.sendLink('owner@example.test','admin'),/OAUTH_APP_NOT_CONFIGURED/);
  const noMail=new GoogleDriveAuthorization({pool,workspace:'main',env:{...env,RESEND_API_KEY:''}});
  await assert.rejects(noMail.sendLink('owner@example.test','admin'),/EMAIL_DELIVERY_NOT_CONFIGURED/);
  assert.equal(pool.issued.size,0);
});
