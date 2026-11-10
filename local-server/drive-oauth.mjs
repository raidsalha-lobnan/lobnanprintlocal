import crypto from 'node:crypto';
import {URLSearchParams} from 'node:url';

// One OAuth grant belongs to the workspace, not to every POS employee.
// Never expose a refresh token to a browser, log, or synchronization record.
const REQUEST_TTL_MS=15*60*1000;
const encoder=value=>Buffer.from(String(value),'utf8');
const securityError=(code,status=400)=>Object.assign(new Error(code),{status});
const emailValid=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254;
const normalEmail=email=>String(email||'').trim().toLowerCase();
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

export function encryptToken(token,secret){
  const key=Buffer.from(String(secret||''),'base64');
  if(key.length!==32)throw securityError('DRIVE_ENCRYPTION_KEY_REQUIRED',503);
  const nonce=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
  const body=Buffer.concat([cipher.update(encoder(token)),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),body]).toString('base64');
}
export function decryptToken(value,secret){
  const key=Buffer.from(String(secret||''),'base64');
  if(key.length!==32)throw securityError('DRIVE_ENCRYPTION_KEY_REQUIRED',503);
  const raw=Buffer.from(value,'base64');
  if(raw.length<29)throw securityError('ENCRYPTED_TOKEN_INVALID');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));
  decipher.setAuthTag(raw.subarray(12,28));
  return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8');
}
export class GoogleDriveAuthorization {
  constructor({pool,workspace,env=process.env,fetcher=fetch,now=()=>Date.now()}){
    this.pool=pool;this.workspace=workspace;this.env=env;this.fetcher=fetcher;this.now=now;
  }
  ready(){
    try{
      return !!(this.env.GOOGLE_OAUTH_CLIENT_ID&&this.env.GOOGLE_OAUTH_CLIENT_SECRET&&
        this.env.GOOGLE_OAUTH_REDIRECT_URI&&this.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY&&
        Buffer.from(this.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,'base64').length===32);
    }catch{return false;}
  }
  mailReady(){return !!(this.env.RESEND_API_KEY&&this.env.GOOGLE_DRIVE_LINK_FROM);}
  async prepare(){
    await this.pool.query(`CREATE TABLE IF NOT EXISTS sync_google_drive_connections(
      workspace TEXT PRIMARY KEY, email TEXT NOT NULL, encrypted_refresh_token TEXT NOT NULL,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(), connected_by TEXT NOT NULL
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS sync_google_drive_oauth_requests(
      workspace TEXT NOT NULL, state_hash TEXT NOT NULL, email TEXT NOT NULL,
      actor_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
      PRIMARY KEY(workspace,state_hash)
    )`);
  }
  async status(){
    const result=await this.pool.query(
      'SELECT email,connected_at FROM sync_google_drive_connections WHERE workspace=$1 LIMIT 1',
      [this.workspace]);
    return {connected:result.rows.length===1,email:result.rows[0]?.email||null,
      connectedAt:result.rows[0]?.connected_at||null,oauthReady:this.ready(),mailReady:this.mailReady()};
  }
  async refreshToken(){
    const result=await this.pool.query(
      'SELECT encrypted_refresh_token FROM sync_google_drive_connections WHERE workspace=$1 LIMIT 1',
      [this.workspace]);
    if(!result.rows.length)throw securityError('DRIVE_ADMIN_CONSENT_REQUIRED',503);
    return decryptToken(result.rows[0].encrypted_refresh_token,this.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY);
  }
  authorizeUrl(state,email){
    const q=new URLSearchParams({
      client_id:this.env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri:this.env.GOOGLE_OAUTH_REDIRECT_URI,
      response_type:'code',
      access_type:'offline',
      prompt:'consent select_account',
      scope:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      login_hint:email,
      state
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?'+q;
  }
  async sendLink(email,actorId){
    if(!this.ready())throw securityError('GOOGLE_DRIVE_OAUTH_APP_NOT_CONFIGURED',503);
    if(!this.mailReady())throw securityError('GOOGLE_DRIVE_EMAIL_DELIVERY_NOT_CONFIGURED',503);
    email=normalEmail(email);
    if(!emailValid(email))throw securityError('GOOGLE_DRIVE_EMAIL_INVALID',400);
    const state=crypto.randomBytes(32).toString('base64url');
    const hash=digest(state);
    const expires=new Date(this.now()+REQUEST_TTL_MS);
    await this.pool.query(
      `INSERT INTO sync_google_drive_oauth_requests(workspace,state_hash,email,actor_id,expires_at)
       VALUES($1,$2,$3,$4,$5)`,[this.workspace,hash,email,actorId,expires]);
    const url=this.authorizeUrl(state,email);
    try{
      const response=await this.fetcher('https://api.resend.com/emails',{
        method:'POST',
        headers:{'Authorization':'Bearer '+this.env.RESEND_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({
          from:this.env.GOOGLE_DRIVE_LINK_FROM,to:[email],
          subject:'تفويض Google Drive لبرنامج مطبعة لبنان',
          text:'تم طلب ربط هذا الحساب بخدمة النسخ الاحتياطي والمرفقات. افتح الرابط فقط إذا كنت المسؤول عن الربط. صلاحية الرابط 15 دقيقة.\n\n'+url
        })
      });
      if(!response.ok)throw securityError('GOOGLE_DRIVE_AUTH_EMAIL_SEND_FAILED',502);
    }catch(e){
      // Revoke unused state if sending failed; never return link to unauthorized browser.
      await this.pool.query(
        'DELETE FROM sync_google_drive_oauth_requests WHERE workspace=$1 AND state_hash=$2',
        [this.workspace,hash]).catch(()=>{});
      throw e;
    }
    return {sent:true,email,expiresAt:expires.toISOString()};
  }
  async callback({state,code}){
    if(!this.ready())throw securityError('GOOGLE_DRIVE_OAUTH_APP_NOT_CONFIGURED',503);
    if(typeof state!=='string'||!/^[-_a-zA-Z0-9]{30,100}$/.test(state)||
      typeof code!=='string'||!code||code.length>4096)throw securityError('GOOGLE_DRIVE_OAUTH_INVALID');
    // Consume the state atomically before making external requests: single use.
    const result=await this.pool.query(
      `UPDATE sync_google_drive_oauth_requests SET used_at=now()
       WHERE workspace=$1 AND state_hash=$2 AND used_at IS NULL AND expires_at>now()
       RETURNING email,actor_id`,
      [this.workspace,digest(state)]);
    if(result.rows.length!==1)throw securityError('GOOGLE_DRIVE_OAUTH_STATE_EXPIRED',403);
    const target=result.rows[0];
    const tokenRes=await this.fetcher('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        client_id:this.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret:this.env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri:this.env.GOOGLE_OAUTH_REDIRECT_URI,
        grant_type:'authorization_code',code
      })
    });
    if(!tokenRes.ok)throw securityError('GOOGLE_DRIVE_OAUTH_EXCHANGE_FAILED',502);
    const tokens=await tokenRes.json();
    if(!tokens.refresh_token||!tokens.access_token)throw securityError('GOOGLE_DRIVE_REFRESH_TOKEN_MISSING',502);
    const identityRes=await this.fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{
      headers:{Authorization:'Bearer '+tokens.access_token}
    });
    if(!identityRes.ok)throw securityError('GOOGLE_DRIVE_IDENTITY_CHECK_FAILED',502);
    const user=await identityRes.json();
    if(!user.email_verified||normalEmail(user.email)!==normalEmail(target.email))
      throw securityError('GOOGLE_DRIVE_AUTH_ACCOUNT_MISMATCH',403);
    const encrypted=encryptToken(tokens.refresh_token,this.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY);
    await this.pool.query(
      `INSERT INTO sync_google_drive_connections(workspace,email,encrypted_refresh_token,connected_by)
       VALUES($1,$2,$3,$4) ON CONFLICT(workspace) DO UPDATE SET
       email=EXCLUDED.email,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,
       connected_at=now(),connected_by=EXCLUDED.connected_by`,
      [this.workspace,normalEmail(user.email),encrypted,target.actor_id]);
    return {ok:true,email:normalEmail(user.email)};
  }
}
