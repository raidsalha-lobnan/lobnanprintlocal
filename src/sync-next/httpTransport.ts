import {VersionConflict, PermanentSyncError, type ServerCursor, type ServerEvent, type SyncCommand, type CommitReceipt, type StoredRecord} from './types';
import type {SyncTransport} from './coordinator';
import type {SettingsReceiptProof,VerifiedSettingsReceipt} from './settingsPatch';
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
      if(response.status===409&&data.code==='INVOICE_REVISION_BASELINE_NEEDS_RECONCILIATION'){
        const audit=data.detail?.diagnosis||{};
        const number=String(data.detail?.invoiceNumber||'الفاتورة المحددة');
        const sales=Number(audit.salesJournalCount??0);
        const costs=Number(audit.cogsJournalCount??0);
        const suspicious=Number(audit.stockMovementsWithUnverifiedDateOrOwner??0);
        const reason=sales===0
          ?'لا يوجد قيد مبيعات مربوط بالمعرّف الداخلي لهذه الفاتورة'
          :'السجل المحاسبي التاريخي غير متطابق مع الفاتورة المعتمدة';
        const stock=suspicious>0
          ?' وتوجد '+suspicious+' حركة مخزون لا يمكن إثبات تبعيتها للفاتورة بسبب تاريخها أو معرّفها.'
          :'';
        throw new PermanentSyncError(
          'هذه الفاتورة ('+number+') تحتاج مطابقة محاسبية قبل السماح بتعديل مالي. '+
          reason+' (قيود المبيعات: '+sales+'، قيود التكلفة: '+costs+').'+stock+
          ' لم يعتمد الخادم هذا التعديل ولم ينشئ قيدًا جديدًا. '+
          'الرجاء مراجعة القيود وحركات المخزون المرتبطة بمعرّف الفاتورة واعتماد تسوية موثّقة. '+
          'لا تكرر الحفظ ولا تعِد إنشاء الفاتورة.'
        );
      }
      if(response.status===403||response.status===422||response.status===409){
        const reviewDetail=data.detail?.manualReviewRequired
          ?'مراجعة مطلوبة للفاتورة '+String(data.detail?.invoiceNumber||'')+
           ' — القيود: '+(data.detail?.linkedJournalIds||[]).slice(0,12).join(', ')+
           ' — حركات المخزون: '+(data.detail?.linkedStockMovementIds||[]).slice(0,12).join(', ')
          :'';
        const detail=[reviewDetail,data.detail?.reason,data.detail?.legacyReason,
          data.detail?.field,data.detail?.itemId,data.detail?.id]
          .filter((value):value is string=>typeof value==='string'&&value.length>0)
          .slice(0,3).map(value=>value.slice(0,180)).join(' | ');
        throw new PermanentSyncError(`${data.code || 'REJECTED'}: ${response.status}${detail?' — '+detail:''}`);
      }
      throw new Error(`LOCAL_SYNC_HTTP_${response.status}`);
    }
    return data as T;
  }
  async checkSettingsReceipts(proofs:SettingsReceiptProof[]):Promise<VerifiedSettingsReceipt[]> {
    if(!proofs.length)return [];
    const result=await this.request<{receipts:VerifiedSettingsReceipt[]}>(
      'receipts/check?workspace='+encodeURIComponent(this.workspaceId),
      {method:'POST',body:JSON.stringify({proofs})}
    );
    return Array.isArray(result.receipts)?result.receipts:[];
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
