import type {SystemUser} from '../types';

const STORED_LOGIN_KEY='lobnan_offline_encrypted_login_v1';
export const AUTH_TOKEN_KEY='lobnan_postgres_user_session';
const TOKEN_EXPIRY_KEY='lobnan_postgres_user_session_expires';
const FALLBACK_API='https://lobnan-print.shares.zrok.io';
const LOCAL_CREDENTIAL_MAX_AGE=7*24*60*60*1000;
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

export function secureLoginEnabled():boolean {
  return import.meta.env?.VITE_SYNC_LOGIN_MODE==='users';
}
export function publicSyncApiUrl():string {
  const configured=String(import.meta.env?.VITE_PUBLIC_SYNC_API_URL||'').trim();
  const url=(configured||FALLBACK_API).replace(/\/+$/,'');
  if(!/^https:\/\//.test(url))throw new Error('SECURE_SYNC_API_MUST_USE_HTTPS');
  return url;
}
export function getCurrentSessionToken():string {
  try {
    const expiry=Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY)||0);
    if(Date.now()>=expiry){sessionStorage.removeItem(AUTH_TOKEN_KEY);return '';}
    return sessionStorage.getItem(AUTH_TOKEN_KEY)||'';
  }catch{return '';}
}
export function isZrokApi(url:string):boolean{
  try{return new URL(url).hostname.endsWith('.shares.zrok.io');}catch{return false;}
}
export function authHeaders(url:string,token=getCurrentSessionToken()):Record<string,string> {
  return {
    ...(token?{Authorization:'Bearer '+token}:{}),
    ...(isZrokApi(url)?{'skip_zrok_interstitial':'1'}:{})
  };
}
function storeSession(token:string,expiresInSeconds:number) {
  if(!token||!Number.isFinite(expiresInSeconds)||expiresInSeconds<=0)throw Error('INVALID_AUTH_SESSION');
  sessionStorage.setItem(AUTH_TOKEN_KEY,token);
  sessionStorage.setItem(TOKEN_EXPIRY_KEY,String(Date.now()+expiresInSeconds*1000));
}
async function makeAesKey(password:string,salt:Uint8Array){
  const imported=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),
    'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},
    imported,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function cacheOfflineLogin(password:string,user:SystemUser,token:string,expiresInSeconds:number){
  if(!crypto?.subtle || !password)return;
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await makeAesKey(password,salt);
  const expiresAt=Date.now()+Math.min(LOCAL_CREDENTIAL_MAX_AGE,expiresInSeconds*1000);
  const body=JSON.stringify({user,token,expiresAt});
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,
    new TextEncoder().encode(body));
  localStorage.setItem(STORED_LOGIN_KEY,JSON.stringify({
    salt:encode(salt),iv:encode(iv),data:encode(encrypted),lastVerified:Date.now()
  }));
}
export async function loginOnline(identifier:string,password:string):Promise<SystemUser>{
  const base=publicSyncApiUrl();
  const response=await fetch(base+'/api/v1/auth/login',{
    method:'POST',
    headers:{'Content-Type':'application/json',...authHeaders(base,'')},
    body:JSON.stringify({identifier,password}),
    cache:'no-store'
  });
  if(!response.ok){
    if(response.status===429)throw Error('AUTH_RATE_LIMIT');
    if(response.status===401)throw Error('BAD_USERNAME_OR_PASSWORD');
    throw Error('AUTH_HTTP_'+response.status);
  }
  const payload=await response.json();
  if(!payload?.user?.id||typeof payload.token!=='string')throw Error('INVALID_AUTH_REPLY');
  const user=payload.user as SystemUser;
  const expires=Number(payload.expiresInSeconds||0);
  storeSession(payload.token,expires);
  // Offline unlock is available only AFTER this successful server login.
  // The opaque server token is encrypted at rest using this device's password.
  try{await cacheOfflineLogin(password,user,payload.token,expires);}
  catch(err){console.warn('Secure offline sign-in unavailable on this device',err);}
  return user;
}
export async function loginOffline(identifier:string,password:string):Promise<SystemUser>{
  const serialized=localStorage.getItem(STORED_LOGIN_KEY);
  if(!serialized)throw Error('OFFLINE_LOGIN_NOT_ENROLLED');
  const cached=JSON.parse(serialized);
  if(!Number.isFinite(cached.lastVerified)||Date.now()-cached.lastVerified>LOCAL_CREDENTIAL_MAX_AGE)
    throw Error('OFFLINE_LOGIN_EXPIRED');
  if(!crypto?.subtle)throw Error('OFFLINE_CRYPTO_UNAVAILABLE');
  let decrypted;
  try{
    const key=await makeAesKey(password,decode(cached.salt));
    decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(cached.iv)},key,
      decode(cached.data));
  }catch{throw Error('BAD_USERNAME_OR_PASSWORD');}
  const payload=JSON.parse(new TextDecoder().decode(decrypted));
  const user=payload.user as SystemUser;
  const identities=[user.username,user.email].filter(Boolean).map(x=>String(x).trim().toLowerCase());
  if(user.status!=='active'||!identities.includes(identifier.trim().toLowerCase()))
    throw Error('BAD_USERNAME_OR_PASSWORD');
  if(Date.now()>=payload.expiresAt)throw Error('OFFLINE_LOGIN_EXPIRED');
  const seconds=Math.floor((payload.expiresAt-Date.now())/1000);
  if(seconds>0 && payload.token)storeSession(payload.token,seconds);
  return user;
}
export function clearSession(){
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
}
