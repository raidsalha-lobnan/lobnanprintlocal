import fs from 'node:fs';
import pg from 'pg';
import {hashPassword,normalizeLogin,stripUserSecrets} from './user-auth.mjs';

const file=process.argv[2];
const apply=process.argv.includes('--apply');
const workspace=process.env.SYNC_WORKSPACE||'lobnan_main';
if(!file||!fs.existsSync(file)){
  console.error('Usage: DATABASE_URL=<private> node import-users.mjs path/to/users.json [--apply]');
  process.exit(2);
}
if(!process.env.DATABASE_URL){console.error('DATABASE_URL missing (keep it private)');process.exit(2);}
let records=JSON.parse(fs.readFileSync(file,'utf8'));
if(!Array.isArray(records)){
  if(Array.isArray(records.users))records=records.users;
  else throw Error('FILE_HAS_NO_USERS_ARRAY');
}
const users=[];
const usernames=new Set(), emails=new Set(), ids=new Set();
for(const user of records){
  if(!user||typeof user!=='object'||Array.isArray(user)||
      typeof user.id!=='string'||!user.id||typeof user.username!=='string'||
      !user.username.trim()||typeof user.password!=='string'||!user.password||
      !['active','inactive'].includes(user.status)){
    throw Error('INCOMPLETE_USER_RECORD — preserve original input and verify exported accounts');
  }
  if(typeof user.roleId!=='string'||!user.roleId||typeof user.companyId!=='string'||
     typeof user.defaultBranchId!=='string'||!Array.isArray(user.allowedBranchIds)){
    throw Error('USER_PROFILE_REQUIRED_FIELDS_MISSING');
  }
  const name=normalizeLogin(user.username),email=normalizeLogin(user.email)||null;
  if(ids.has(user.id)||usernames.has(name)||(email&&emails.has(email)))throw Error('DUPLICATE_LEGACY_LOGIN_OR_ID');
  ids.add(user.id);usernames.add(name);if(email)emails.add(email);
  users.push({id:user.id,username:name,email,profile:stripUserSecrets(user),password:user.password});
}
console.log('Validated '+users.length+' existing user accounts. IDs and roles will be preserved.');
if(!apply){console.log('DRY RUN: no database writes. Pass --apply when prepared.');process.exit(0);}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const client=await pool.connect();
try{
  await client.query('BEGIN');
  await client.query('INSERT INTO sync_workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING',[workspace]);
  const count=await client.query('SELECT COUNT(*)::int AS total FROM sync_auth_users WHERE workspace=$1',[workspace]);
  if(count.rows[0].total>0)throw Error('AUTH_USERS_ALREADY_PRESENT — stop to avoid overwriting current accounts');
  for(const user of users){
    const passwordHash=await hashPassword(user.password);
    const profile=user.profile;
    await client.query(
      `INSERT INTO sync_auth_users(workspace,user_id,username_normalized,email_normalized,display_name,role_id,status,password_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [workspace,user.id,user.username,user.email,String(profile.fullName||user.username),
        String(profile.roleId||''),profile.status,passwordHash]);
    const existing=await client.query('SELECT version FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',
      [workspace,'users',user.id]);
    if(existing.rows.length){
      // Strip plaintext credentials if the account already existed in legacy records.
      await client.query(`UPDATE sync_records SET value=$4,updated_at=now()
        WHERE workspace=$1 AND entity=$2 AND record_id=$3`,
        [workspace,'users',user.id,JSON.stringify(profile)]);
    }else{
      await client.query('INSERT INTO sync_records(workspace,entity,record_id,version,value) VALUES($1,$2,$3,1,$4)',
        [workspace,'users',user.id,JSON.stringify(profile)]);
    }
  }
  await client.query('COMMIT');
  console.log('SUCCESS: imported '+users.length+' accounts with scrypt password hashes; no plaintext passwords uploaded.');
}catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  console.error('IMPORT FAILED:',error.message);
  process.exitCode=1;
}finally{
  client.release();await pool.end();
}
