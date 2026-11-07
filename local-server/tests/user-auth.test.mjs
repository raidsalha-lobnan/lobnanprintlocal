import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,checkPassword,normalizeLogin,stripUserSecrets,UserAuth
} from '../user-auth.mjs';

test('password hashes are salted, verifiable, and never equal the input',async()=>{
  const a=await hashPassword('very-strong-private-passphrase');
  const b=await hashPassword('very-strong-private-passphrase');
  assert.notEqual(a,b);
  assert.notEqual(a,'very-strong-private-passphrase');
  assert.equal(await checkPassword('very-strong-private-passphrase',a),true);
  assert.equal(await checkPassword('wrong-password',a),false);
  assert.equal(await checkPassword('very-strong-private-passphrase','plain'),false);
  assert.equal(await checkPassword('',a),false);
});
test('legacy account identifiers normalize and secret fields never reach clients',()=>{
  assert.equal(normalizeLogin('  ADMIN@TEST.EXAMPLE  '),'admin@test.example');
  const profile={id:'u1',username:'admin',status:'active',password:'PRIVATE',
    passwordHash:'hash',password_hash:'hash',sessionToken:'SESSION',token:'PRIVATE'};
  assert.deepEqual(stripUserSecrets(profile),{id:'u1',username:'admin',status:'active'});
});
test('login issues a server session only after verifying an active imported profile',async()=>{
  const p=await hashPassword('real-secret');
  const queries=[];
  const user={user_id:'u1',username_normalized:'employee',email_normalized:'user@test.example',
    display_name:'Staff',role_id:'role-cashier',status:'active',password_hash:p,
    profile:{id:'u1',companyId:'c1',username:'employee',fullName:'Staff',roleId:'role-cashier',
      defaultBranchId:'b1',allowedBranchIds:['b1'],status:'active',password:'LEAK'}};
  const pool={query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.includes('SELECT u.user_id'))return {rows:[user]};
    if(sql.includes('INSERT INTO sync_auth_sessions'))return {rows:[]};
    throw Error('UNEXPECTED_QUERY');
  }};
  const auth=new UserAuth(pool,'lobnan_main');
  assert.equal(await auth.login('employee','wrong'),null);
  const result=await auth.login('EMPLOYEE','real-secret');
  assert.equal(result.user.id,'u1');
  assert.equal('password' in result.user,false);
  assert.ok(result.token.length>=40);
  assert.equal(result.expiresInSeconds,7*24*3600);
  assert.equal(queries.some(q=>q.sql.includes('INSERT INTO sync_auth_sessions')),true);
});
test('unknown, inactive or unimported users do not authenticate',async()=>{
  const auth=new UserAuth({query:async()=>({rows:[]})},'lobnan_main');
  assert.equal(await auth.login('missing','any'),null);
  assert.equal(await auth.authenticate('invalid'),null);
});
