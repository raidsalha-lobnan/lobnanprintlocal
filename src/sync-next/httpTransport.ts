import {VersionConflict, PermanentSyncError, type ServerCursor, type ServerEvent, type SyncCommand, type CommitReceipt, type StoredRecord} from './types';
import type {SyncTransport} from './coordinator';
import {secureLoginEnabled,publicSyncApiUrl,getCurrentSessionToken,authHeaders} from '../services/secureAuth';

export const URL_KEY='lobnan_local_sync_server_url';
export const TOKEN_KEY='lobnan_local_sync_device_token';
export const WORKSPACE_KEY='lobnan_local_sync_workspace';
export function getLocalSyncConfig() {
  if (secureLoginEnabled()) {
    return { url:publicSyncApiUrl(), token:'', workspace:'lobnan_main' };
  }
  if (import.meta.env?.VITE_SYNC_GATEWAY_MODE === 'true') {
    if (typeof window === 'undefined' || window.location.protocol !== 'https:') {
      throw new Error('CLOUD_GATEWAY_REQUIRES_HTTPS');
    }
    return { url: window.location.origin, token: '', workspace: 'lobnan_main' };
  }
  const url=(localStorage.getItem(URL_KEY)||'').replace(/\/+$/,'');
  const token=localStorage.getItem(TOKEN_KEY)||'';
  const workspace=localStorage.getItem(WORKSPACE_KEY)||'lobnan_main';
  if (!/^https?:\/\//.test(url) || token.length<32) throw new Error('LOCAL_SYNC_NOT_CONFIGURED');
  return {url,token,workspace};
}
export class LocalHttpSyncTransport implements SyncTransport {
  private stopped=false;
  constructor(private url:string, private token:string, private workspaceId:string){}
  private async request<T>(path:string, options:RequestInit={}):Promise<T> {
    const response=await fetch(`${this.url}/api/v1/${path}`,{
      ...options, headers:{...authHeaders(this.url,secureLoginEnabled()?getCurrentSessionToken():this.token),'Content-Type':'application/json',...options.headers},cache:'no-store'
    });
    let data:any;
    try {data=await response.json();} catch {throw new Error('INVALID_SERVER_REPLY');}
    if(!response.ok){
      if(response.status===409 && data.code==='VERSION_CONFLICT' && data.detail){
        const d=data.detail;
        throw new VersionConflict(d.entity,d.id,d.expectedVersion,d.actualVersion);
      }
      if(response.status===401){
        // Token expiry requires re-login, NOT permanent rejection of offline work.
        throw new Error('SESSION_LOGIN_REQUIRED');
      }
      if(response.status===403||response.status===422||response.status===409){
        throw new PermanentSyncError(`${data.code || 'REJECTED'}: ${response.status}`);
      }
      throw new Error(`LOCAL_SYNC_HTTP_${response.status}`);
    }
    return data as T;
  }
  async push(cmd:SyncCommand):Promise<CommitReceipt> {
    return this.request('push?workspace='+encodeURIComponent(this.workspaceId),{method:'POST',body:JSON.stringify(cmd)});
  }
  /** A posted invoice revision is calculated, validated and committed by PostgreSQL.
   * This method is deliberately separate from the ordinary local invoice put.
   */
  async reviseInvoice(request:{commandId:string;invoiceId:string;expectedVersion:number;proposed:Record<string,unknown>}):Promise<CommitReceipt>{
    return this.request('invoices/revise?workspace='+encodeURIComponent(this.workspaceId),{
      method:'POST',body:JSON.stringify(request)
    });
  }
  async pull(cursor:ServerCursor|null,pageSize=100):Promise<ServerEvent[]> {
    const after=cursor?.sequence??0;
    if(!Number.isSafeInteger(after) || after<0)throw new Error('INVALID_LOCAL_SERVER_CURSOR');
    const r=await this.request<{events:ServerEvent[]}>(`events?workspace=${encodeURIComponent(this.workspaceId)}&after=${after}&limit=${pageSize}`);
    return r.events;
  }
  async fetchAuthoritativeBootstrap():Promise<{records:StoredRecord[];cursor:ServerCursor}> {
    return this.request(`bootstrap?workspace=${encodeURIComponent(this.workspaceId)}`);
  }
  async fetchCloudSnapshot():Promise<Record<string,any[]>>{
    const data=await this.fetchAuthoritativeBootstrap();
    const grouped:Record<string,any[]>={};
    for(const row of data.records){ if(row.value===null)continue;(grouped[row.entity]??=[]).push(row.value); }
    return grouped;
  }
  async head():Promise<number>{
    const head=await this.request<{sequence:number}>(`head?workspace=${encodeURIComponent(this.workspaceId)}`);
    return head.sequence;
  }
  watchLatest(onChanged:()=>void,onError:(error:unknown)=>void):()=>void{
    this.stopped=false;
    let lastSeen=-1;
    let busy=false;
    const probe=async()=>{
      if(busy||this.stopped)return;
      busy=true;
      try {const head=await this.head();if(head!==lastSeen){lastSeen=head;onChanged();}}
      catch(err){onError(err);}
      finally{busy=false;}
    };
    const interval=setInterval(()=>{void probe();},15000);
    void probe();
    return ()=>{this.stopped=true;clearInterval(interval);};
  }
}
