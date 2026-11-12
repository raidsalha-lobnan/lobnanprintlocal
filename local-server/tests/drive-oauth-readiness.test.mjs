import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {GoogleDriveAuthorization} from '../drive-oauth.mjs';
const fakePool={query:async()=>({rows:[]})};
test('admin-only readiness status reports missing variable names, never values or secrets',async()=>{
 const service=new GoogleDriveAuthorization({pool:fakePool,workspace:'lobnan_main',env:{}});
 const state=await service.status();
 assert.equal(state.connected,false);
 assert.equal(state.oauthReady,false);
 assert.equal(state.mailReady,false);
 assert.deepEqual(state.missingOAuthSettings,[
   'GOOGLE_OAUTH_CLIENT_ID',
   'GOOGLE_OAUTH_CLIENT_SECRET',
   'GOOGLE_OAUTH_REDIRECT_URI',
   'GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY'
 ]);
 assert.deepEqual(state.missingMailSettings,['RESEND_API_KEY','GOOGLE_DRIVE_LINK_FROM']);
});
test('fully configured OAuth shows no missing settings',async()=>{
 const env={
   GOOGLE_OAUTH_CLIENT_ID:'example-client-id',
   GOOGLE_OAUTH_CLIENT_SECRET:'private-secret-not-exposed',
   GOOGLE_OAUTH_REDIRECT_URI:'https://example.test/api/v1/drive/oauth/callback',
   GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),
   RESEND_API_KEY:'private-mail-key-not-exposed',
   GOOGLE_DRIVE_LINK_FROM:'noreply@example.test'
 };
 const service=new GoogleDriveAuthorization({pool:fakePool,workspace:'lobnan_main',env});
 const status=await service.status();
 assert.equal(status.oauthReady,true);
 assert.equal(status.mailReady,true);
 assert.deepEqual(status.missingOAuthSettings,[]);
 assert.deepEqual(status.missingMailSettings,[]);
 assert.ok(!JSON.stringify(status).includes(env.GOOGLE_OAUTH_CLIENT_SECRET));
 assert.ok(!JSON.stringify(status).includes(env.RESEND_API_KEY));
});
