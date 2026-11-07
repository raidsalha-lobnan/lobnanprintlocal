import crypto from 'node:crypto';
import {promisify} from 'node:util';
const scrypt = promisify(crypto.scrypt);
const KDF_OPTIONS = {N:32768,r:8,p:1,maxmem:64*1024*1024};
const SESSION_HOURS=24*7;
export const normalizeLogin = value => String(value||'').trim().toLocaleLowerCase('en-US');
export const stripUserSecrets = user => {
  if(!user||typeof user!=='object'||Array.isArray(user))return user;
  const {password,passwordHash,password_hash,salt,sessionToken,token,...safe}=user;
  return safe;
};
export async function hashPassword(password) {
  if(typeof password!=='string'||!password||password.length>1024)throw new Error('INVALID_PASSWORD');
  const salt=crypto.randomBytes(16).toString('hex');
  const output=await scrypt(password,Buffer.from(salt,'hex'),64,KDF_OPTIONS);
  return 'scrypt.v1.'+salt+'.'+output.toString('hex');
}
export async function checkPassword(password,encoded) {
  if(typeof password!=='string'||password.length>1024 || typeof encoded!=='string')return false;
  const fields=encoded.split('.');
  if(fields.length!==4||fields[0]!=='scrypt'||fields[1]!=='v1'||
     !/^[a-f0-9]{32}$/.test(fields[2])||!/^[a-f0-9]{128}$/.test(fields[3]))return false;
  const original=Buffer.from(fields[3],'hex');
  const attempted=await scrypt(password,Buffer.from(fields[2],'hex'),64,KDF_OPTIONS);
  return crypto.timingSafeEqual(original,attempted);
}
const secretHash=value=>crypto.createHash('sha256').update(value).digest('hex');

export class UserAuth {
  constructor(pool,workspace){this.pool=pool;this.workspace=workspace;}
  async login(identifier,password){
    const normalized=normalizeLogin(identifier);
    if(!normalized||normalized.length>254||typeof password!=='string'||!password||password.length>1024)
      return null;
    const q=await this.pool.query(
      'SELECT user_id, username_normalized, email_normalized, display_name, role_id, status, password_hash FROM sync_auth_users WHERE workspace=$1 AND (username_normalized=$2 OR email_normalized=$2) LIMIT 1',
      [this.workspace,normalized]);
    const user=q.rows[0];
    // Never reveal which usernames exist, and never accept inactive accounts.
    if(!user||user.status!=='active')return null;
    if(!(await checkPassword(password,user.password_hash)))return null;
    const secret=crypto.randomBytes(32).toString('base64url');
    await this.pool.query('INSERT INTO sync_auth_sessions(workspace,session_hash,user_id,expires_at) VALUES ($1,$2,$3,now()+$4::interval)',
      [this.workspace,secretHash(secret),user.user_id,SESSION_HOURS+' hours']);
    return {
      token:secret,
      expiresInSeconds:SESSION_HOURS*3600,
      user:{id:user.user_id,username:user.username_normalized,email:user.email_normalized,
        fullName:user.display_name,roleId:user.role_id,status:user.status}
    };
  }
  async authenticate(secret){
    if(typeof secret!=='string'||secret.length<40||secret.length>256)return null;
    const q=await this.pool.query(
      `SELECT u.user_id,u.username_normalized,u.email_normalized,u.display_name,u.role_id,u.status
       FROM sync_auth_sessions s JOIN sync_auth_users u
         ON u.user_id=s.user_id AND u.workspace=s.workspace
       WHERE s.workspace=$1 AND s.session_hash=$2 AND s.expires_at>now() AND u.status='active' LIMIT 1`,
      [this.workspace,secretHash(secret)]);
    const u=q.rows[0];
    return u?{id:u.user_id,username:u.username_normalized,email:u.email_normalized,
      fullName:u.display_name,roleId:u.role_id,status:u.status}:null;
  }
  async logout(secret){
    if(typeof secret==='string'&&secret.length>=40&&secret.length<=256)
      await this.pool.query('DELETE FROM sync_auth_sessions WHERE workspace=$1 AND session_hash=$2',
        [this.workspace,secretHash(secret)]);
  }
}
