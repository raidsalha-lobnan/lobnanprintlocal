import {authHeaders,getCurrentSessionToken,publicSyncApiUrl} from './secureAuth';
export type DirectoryAction='user.upsert'|'user.disable'|'role.upsert'|'role.delete';
export async function sendAdminDirectoryAction(action:DirectoryAction,
  details:{id?:string,profile?:Record<string,any>,password?:string}={}){
  const token=getCurrentSessionToken();
  if(!token)throw new Error('SESSION_LOGIN_REQUIRED');
  const url=publicSyncApiUrl();
  if(!crypto?.randomUUID)throw new Error('SECURE_RANDOM_UNAVAILABLE');
  const response=await fetch(url+'/api/v1/admin/directory',{
    method:'POST',
    headers:{'Content-Type':'application/json',...authHeaders(url,token)},
    body:JSON.stringify({action,requestId:crypto.randomUUID(),...details}),
    cache:'no-store'
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.ok!==true){
    throw new Error(String(result?.code||'ADMIN_API_HTTP_'+response.status));
  }
  return result as {ok:true,entity:'users'|'roles',id:string,value:unknown,version:number,sequence:number};
}
