import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readCachedUsers, cacheSavedUsers, findSavedUser,
  fetchUsersFromLocalServer, getCurrentWorkspace, isTrustedOfflineCache,
  USERS_STORAGE_KEY
} from '../src/services/savedUserDirectory.ts';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const user = (id, username, password, status='active') =>
  ({id,username,password,status,fullName:username,companyId:'test',roleId:'role-cashier'});
const reset = () => { globalThis.localStorage = new MemoryStorage(); };

test('saved passwords match exactly, no default passwords, no owner alias, disabled denied', () => {
  reset();
  const users=[user('u1','worker@example.test','real-secret'),user('u2','disabled','secret','inactive'),
    user('u3','admin','')];
  assert.equal(findSavedUser(users,'WORKER@example.test','real-secret')?.id,'u1');
  assert.equal(findSavedUser(users,'worker@example.test','wrong'),undefined);
  assert.equal(findSavedUser(users,'raid','real-secret'),undefined);
  assert.equal(findSavedUser(users,'disabled','secret'),undefined);
  assert.equal(findSavedUser(users,'admin',''),undefined);
  assert.equal(findSavedUser(users,'admin','123456'),undefined);
});

test('cached users are validated and corrupt cache is ignored', () => {
  reset();
  localStorage.setItem(USERS_STORAGE_KEY,'{not-json');
  assert.deepEqual(readCachedUsers(),[]);
  localStorage.setItem(USERS_STORAGE_KEY,JSON.stringify([{},null,user('a','employee','test-pass')]));
  assert.equal(readCachedUsers().length,1);
  cacheSavedUsers([user('b','saved','password')],'lobnan_main');
  assert.equal(readCachedUsers()[0].id,'b');
  assert.equal(isTrustedOfflineCache(),true);
  localStorage.setItem('lobnan_local_sync_workspace','another_workspace');
  assert.equal(isTrustedOfflineCache(),false);
});

test('PostgreSQL directory reads only users in paired workspace, no invented admin', async () => {
  reset();
  localStorage.setItem('lobnan_local_sync_server_url','https://test-host.invalid/');
  localStorage.setItem('lobnan_local_sync_device_token','x'.repeat(40));
  localStorage.setItem('lobnan_local_sync_workspace','lobnan_main');
  const oldFetch=globalThis.fetch;
  let seen;
  globalThis.fetch=async (url, opts) => {
    seen={url,opts};
    return {ok:true,json:async()=>({records:[
      {entity:'invoices',value:{id:'invoice'}},
      {entity:'users',value:user('real','member@example.test','private')},
      {entity:'users',value:null}
    ]})};
  };
  try{
    const users=await fetchUsersFromLocalServer(1000);
    assert.equal(users.length,1);
    assert.equal(users[0].id,'real');
    assert.equal(seen.url,'https://test-host.invalid/api/v1/bootstrap?workspace=lobnan_main');
    assert.equal(seen.opts.headers.Authorization,'Bearer '+'x'.repeat(40));
    globalThis.fetch=async()=>({ok:true,json:async()=>({records:[]})});
    assert.deepEqual(await fetchUsersFromLocalServer(1000),[]);
  }finally{globalThis.fetch=oldFetch;}
});

test('remote errors do not fabricate any saved account', async () => {
  reset();
  await assert.rejects(fetchUsersFromLocalServer(100),/LOCAL_SERVER_NOT_CONFIGURED/);
  localStorage.setItem('lobnan_local_sync_server_url','https://test-host.invalid');
  localStorage.setItem('lobnan_local_sync_device_token','x'.repeat(40));
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:401});
  try { await assert.rejects(fetchUsersFromLocalServer(100),/LOCAL_SERVER_HTTP_401/); }
  finally {globalThis.fetch=oldFetch;}
});
