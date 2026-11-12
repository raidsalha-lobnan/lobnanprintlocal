import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizedDriveHttpError} from '../drive-error-response.mjs';

test('missing server OAuth client has an actionable HTTP 503 rather than a generic 500',()=>{
 const error=Object.assign(new Error('GOOGLE_DRIVE_OAUTH_APP_NOT_CONFIGURED'),{status:503});
 assert.deepEqual(sanitizedDriveHttpError(error),{
   status:503,code:'GOOGLE_DRIVE_OAUTH_APP_NOT_CONFIGURED'
 });
});
test('missing email sender has a safe HTTP 503 error',()=>{
 const error=Object.assign(new Error('GOOGLE_DRIVE_EMAIL_DELIVERY_NOT_CONFIGURED'),{status:503});
 assert.deepEqual(sanitizedDriveHttpError(error),{
   status:503,code:'GOOGLE_DRIVE_EMAIL_DELIVERY_NOT_CONFIGURED'
 });
});
test('invalid Google settings and unexpected OAuth errors cannot leak secrets',()=>{
 assert.equal(sanitizedDriveHttpError(
   Object.assign(new Error('DATABASE_URL=postgresql://user:SECRET@localhost'),{status:503})),null);
 assert.equal(sanitizedDriveHttpError(
   Object.assign(new Error('GOOGLE_DRIVE_OAUTH_APP_NOT_CONFIGURED'),{status:500})),null);
 assert.equal(sanitizedDriveHttpError(
   Object.assign(new Error('client_secret=EXPOSED'),{status:403})),null);
});
