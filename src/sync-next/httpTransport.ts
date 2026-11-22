import {VersionConflict, PermanentSyncError, type ServerCursor, type ServerEvent, type SyncCommand, type CommitReceipt, type StoredRecord, type RecordVersion} from './types';
import type {Invoice} from '../types';
import {verifyPosEditReceipt} from '../utils/posEditReceiptVerification';
import type {SyncTransport} from './coordinator';
import type {SettingsReceiptProof,VerifiedSettingsReceipt} from './settingsPatch';
import {secureLoginEnabled,publicSyncApiUrl,getCurrentSessionToken,authHeaders} from '../services/secureAuth';
import {fetchWithSyncDeadline,deadlineForSyncPath} from './requestDeadline';

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
    const response=await fetchWithSyncDeadline(`${this.url}/api/v1/${path}`,{
      ...options, headers:{...authHeaders(this.url,secureLoginEnabled()?getCurrentSessionToken():this.token),'Content-Type':'application/json',...options.headers},cache:'no-store'
    },deadlineForSyncPath(path));
    // A tunnel/proxy can return HTML instead of JSON for HTTP 413.
    // Preserve that exact status so push() can choose chunked transport
    // rather than mislabeling the error as INVALID_SERVER_REPLY.
    if(!response.ok&&response.status===413)throw new Error('LOCAL_SYNC_HTTP_413');
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
        const hasCounts=Number.isSafeInteger(audit.salesJournalCount)&&Number.isSafeInteger(audit.cogsJournalCount);
        const sales=hasCounts?audit.salesJournalCount:0;
        const costs=hasCounts?audit.cogsJournalCount:0;
        const suspicious=Number(audit.stockMovementsWithUnverifiedDateOrOwner??0);
        const reason=hasCounts&&sales===0
          ?'لا يوجد قيد مبيعات مربوط بالمعرّف الداخلي لهذه الفاتورة'
          :'السجل المحاسبي التاريخي غير متطابق مع الفاتورة المعتمدة';
        const counts=hasCounts?' (قيود المبيعات: '+sales+'، قيود التكلفة: '+costs+').':'.';
        const stock=suspicious>0
          ?' وتوجد '+suspicious+' حركة مخزون لا يمكن إثبات تبعيتها للفاتورة بسبب تاريخها أو معرّفها.'
          :'';
        throw new PermanentSyncError(
          'هذه الفاتورة ('+number+') تحتاج مطابقة محاسبية قبل السماح بتعديل مالي. '+
          reason+counts+stock+
          ' لم يعتمد الخادم هذا التعديل ولم ينشئ قيدًا جديدًا. '+
          'الرجاء مراجعة القيود وحركات المخزون المرتبطة بمعرّف الفاتورة واعتماد تسوية موثّقة. '+
          'لا تكرر الحفظ ولا تعِد إنشاء الفاتورة.'
        );
      }
      // These errors describe different problems. In particular, a posted
      // invoice's accounting safeguard is not an employee permission problem.
      if(data.code==='ENTITY_PERMISSION_DENIED'){
        const d=data.detail||{};
        const section=String(d.entity||'السجل');
        const operation=d.operation==='add'?'الإضافة':'التعديل';
        const role=String(d.roleId||'غير محدد');
        const needed=String(d.requiredPermission||'غير معروف');
        throw new PermanentSyncError(
          'ENTITY_PERMISSION_DENIED: رفض خادم PostgreSQL '+operation+
          ' في '+section+'. حساب المستخدم الحالي لا يملك الصلاحية المطلوبة ('+
          needed+') ضمن الدور '+role+
          '. يجب أن يحدّث مدير النظام صلاحيات هذا الحساب أو القسم من شاشة الإدارة؛ لا تُكرّر العملية بحساب آخر.'
        );
      }
      if(data.code==='OFFICIAL_INVOICE_REQUIRES_FINANCIAL_REVISION'){
        throw new PermanentSyncError(
          'OFFICIAL_INVOICE_REQUIRES_FINANCIAL_REVISION: هذه فاتورة معتمدة، '+
          'وتعديل مبلغها أو أصنافها يحتاج أمر تصحيح محاسبي مركزي بدلاً من حفظ نسخة فاتورة مباشرة. '+
          'لم يُكتب أي قيد جديد، ولا يجب إعادة إنشاء الفاتورة.'
        );
      }
      if(data.code==='ENTITY_SERIAL_ALREADY_USED'){
        const d=data.detail||{};
        throw new PermanentSyncError(
          'ENTITY_SERIAL_ALREADY_USED: كود السجل ('+String(d.field||'code')+
          ') مستخدم بالفعل في PostgreSQL للسجل '+String(d.existingId||'آخر')+
          '. إذا كان الكود مقترحًا تلقائيًا، يجب أن يخصص الخادم كودًا جديدًا، '+
          'ولا تُغيّر المعرّف الداخلي للسجل أو ترسل نسخة أخرى قبل مراجعة طابور الجهاز.'
        );
      }
      if(data.code==='ENTITY_SERIAL_IMMUTABLE'){
        throw new PermanentSyncError(
          'ENTITY_SERIAL_IMMUTABLE: معرّف أو كود أو فئة السجل المعتمد لا يمكن تغييرها '+
          'أثناء التعديل العادي. يجب الاحتفاظ برقم السجل الداخلي ومطابقة النسخة المعتمدة مع طابور الجهاز.'
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
  async supportsAtomicPosRebase():Promise<boolean>{
    const state=await this.request<{ok?:boolean;features?:{atomicPosRebaseV1?:boolean}}>('health');
    return state.ok===true && state.features?.atomicPosRebaseV1===true;
  }
  async checkSettingsReceipts(proofs:SettingsReceiptProof[]):Promise<VerifiedSettingsReceipt[]> {
    if(!proofs.length)return [];
    const result=await this.request<{receipts:VerifiedSettingsReceipt[]}>(
      'receipts/check?workspace='+encodeURIComponent(this.workspaceId),
      {method:'POST',body:JSON.stringify({proofs})}
    );
    return Array.isArray(result.receipts)?result.receipts:[];
  }
  async checkAtomicPosReceipts(proofs:SettingsReceiptProof[]):Promise<CommitReceipt[]> {
    if(!proofs.length)return [];
    const result=await this.request<{receipts:CommitReceipt[]}>(
      'pos/receipts/check?workspace='+encodeURIComponent(this.workspaceId),
      {method:'POST',body:JSON.stringify({proofs})}
    );
    return Array.isArray(result.receipts)?result.receipts:[];
  }
  private async supportsChunkedPush():Promise<boolean>{
    const state=await this.request<{ok?:boolean;features?:{pushChunksV1?:boolean}}>('health');
    return state.ok===true&&state.features?.pushChunksV1===true;
  }
  private async pushChunked(cmd:SyncCommand,raw:string):Promise<CommitReceipt>{
    const bytes=new TextEncoder().encode(raw);
    const partBytes=192*1024;
    const totalParts=Math.ceil(bytes.length/partBytes);
    if(bytes.length>24_000_000||totalParts<1||totalParts>128)
      throw new Error('SYNC_CHUNKED_TRANSACTION_EXCEEDS_SAFE_LIMIT: العملية محفوظة محليًا وتحتاج مراجعة حجم الصور، دون حذف أو تقسيم القيود.');
    if(!crypto?.subtle)throw new Error('SYNC_CHUNKED_CRYPTO_UNAVAILABLE');
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    const sha256=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
    const workspace=encodeURIComponent(this.workspaceId);
    for(let index=0;index<totalParts;index++){
      const slice=bytes.subarray(index*partBytes,Math.min(bytes.length,(index+1)*partBytes));
      // btoa requires a binary string; process in small blocks to avoid
      // stack limits on mobile browsers. No data is altered or removed.
      let binary='';
      for(let offset=0;offset<slice.length;offset+=0x8000)
        binary+=String.fromCharCode(...slice.subarray(offset,offset+0x8000));
      await this.request('push/chunks?workspace='+workspace,{
        method:'POST',body:JSON.stringify({
          commandId:cmd.id,sha256,totalParts,index,dataBase64:btoa(binary)
        })
      });
    }
    return this.request<CommitReceipt>('push/chunks/commit?workspace='+workspace,{
      method:'POST',body:JSON.stringify({commandId:cmd.id,sha256,totalParts})
    });
  }
  async push(cmd:SyncCommand):Promise<CommitReceipt>{
    if (cmd.invoiceRevision) {
      const [change] = cmd.changes;
      if (cmd.changes.length !== 1 || change.entity !== 'invoices' || !change.value ||
          change.value.id !== change.id || change.expectedVersion < 1) {
        throw new PermanentSyncError('INVALID_INVOICE_REVISION_REQUEST');
      }
      const proposed = change.value as unknown as Invoice;
      const receipt = await this.reviseInvoice({commandId: cmd.id, invoiceId: change.id,
        expectedVersion: change.expectedVersion, proposed: change.value});
      const row = receipt.changes?.find(entry => entry.entity === 'invoices' && entry.id === change.id);
      if (receipt.commandId !== cmd.id || !row?.value || !(row.version >= change.expectedVersion) ||
          verifyPosEditReceipt(row.value as unknown as Invoice, change.id,
            proposed.items.map(item => ({...item, inventoryItemId: item.itemId})),
            proposed.notes || '', proposed.paymentNotes || '', proposed.date)) {
        throw new PermanentSyncError('INVOICE_REVISION_RECEIPT_MISMATCH');
      }
      return receipt;
    }
    const raw=JSON.stringify(cmd);
    const length=new TextEncoder().encode(raw).length;
    const useChunks=async():Promise<CommitReceipt>=>{
      if(!(await this.supportsChunkedPush()))
        throw new Error('SYNC_HTTP_413_CHUNKED_SERVER_UPDATE_REQUIRED: يحتاج خادم PostgreSQL المحلي إلى تحديث خدمة المزامنة وإعادة تشغيلها. بقي الأمر الأصلي محفوظًا في IndexedDB دون تعديل.');
      return this.pushChunked(cmd,raw);
    };
    // Avoid the HTTP proxy/request-body cap proactively, then fall back to
    // EXACT-SAME-BYTES chunk transport on a definite 413 response.
    if(length>800_000){
      const available=await this.supportsChunkedPush();
      if(available)return this.pushChunked(cmd,raw);
    }
    try{
      return await this.request('push?workspace='+encodeURIComponent(this.workspaceId),{
        method:'POST',body:raw
      });
    }catch(error){
      if(error instanceof Error && /LOCAL_SYNC_HTTP_413|PAYLOAD_TOO_LARGE: 413/.test(error.message))
        return useChunks();
      throw error;
    }
  }
  /** A posted invoice revision is calculated, validated and committed by PostgreSQL.
   * This method is deliberately separate from the ordinary local invoice put.
   */
  async reviseInvoice(request:{commandId:string;invoiceId:string;expectedVersion:number;proposed:Record<string,unknown>}):Promise<CommitReceipt>{
    const body=JSON.stringify(request);
    const bytes=new TextEncoder().encode(body).length;
    if(bytes>2_800_000){
      throw new Error('POSTGRES_INVOICE_REVISION_TOO_LARGE: حجم تعديل الفاتورة '+
        Math.ceil(bytes/1024)+' كيلوبايت. تحقق من حجم وعدد الصور المصغرة دون حذف المرفقات أو إعادة إنشاء الفاتورة.');
    }
    return this.request('invoices/revise?workspace='+encodeURIComponent(this.workspaceId),{
      method:'POST',body
    });
  }
  async pull(cursor:ServerCursor|null,pageSize=100):Promise<ServerEvent[]> {
    const after=cursor?.sequence??0;
    if(!Number.isSafeInteger(after) || after<0)throw new Error('INVALID_LOCAL_SERVER_CURSOR');
    const r=await this.request<{events:ServerEvent[]}>(`events?workspace=${encodeURIComponent(this.workspaceId)}&after=${after}&limit=${pageSize}`);
    return r.events;
  }
  /** Read the single versioned invoice before an edit; no full ledger snapshot. */
  async fetchAuthoritativeInvoiceRecord(invoiceId:string):Promise<StoredRecord>{
    const data=await this.request<{record:StoredRecord}>(
      'invoices/record?workspace='+encodeURIComponent(this.workspaceId)+'&id='+encodeURIComponent(invoiceId)
    );
    if(!data.record||data.record.entity!=='invoices'||data.record.id!==invoiceId)
      throw new Error('INVALID_AUTHORITATIVE_INVOICE_REPLY');
    return data.record;
  }
  async fetchAuthoritativeBootstrap():Promise<{records:StoredRecord[];cursor:ServerCursor}> {
    return this.request(`bootstrap?workspace=${encodeURIComponent(this.workspaceId)}`);
  }
  /** Identity/version catalogue only: a missing local record is recovered by
   * exact ID, not by re-downloading every invoice or financial movement.
   */
  async fetchRecordManifest():Promise<{records:RecordVersion[];cursor:ServerCursor}>{
    const data=await this.request<{records:RecordVersion[];cursor:ServerCursor}>(
      'records/manifest?workspace='+encodeURIComponent(this.workspaceId));
    if(!Array.isArray(data?.records)||!data.cursor||
      data.records.some(r=>!r||typeof r.entity!=='string'||typeof r.id!=='string'||
        !Number.isSafeInteger(r.version)||r.version<1))
      throw new Error('INVALID_POSTGRES_RECORD_MANIFEST');
    return data;
  }
  async fetchRecordsById(keys:readonly RecordVersion[]):Promise<StoredRecord[]>{
    const data=await this.request<{records:StoredRecord[]}>(
      'records/resolve?workspace='+encodeURIComponent(this.workspaceId),
      {method:'POST',body:JSON.stringify({keys:keys.map(({entity,id})=>({entity,id}))})}
    );
    if(!Array.isArray(data?.records)||data.records.some(r=>
      !r||typeof r.entity!=='string'||typeof r.id!=='string'||
      !Number.isSafeInteger(r.version)||r.version<1||
      r.key!==r.entity+'\u001f'+r.id))
      throw new Error('INVALID_POSTGRES_TARGETED_RECORDS');
    return data.records;
  }
  /** Lightweight permission-filtered directory: no complete accounting download. */
  async fetchAuthorizedDirectory():Promise<{records:StoredRecord[]}>{
    const payload=await this.request<{records:StoredRecord[]}>(
      'auth/directory?workspace='+encodeURIComponent(this.workspaceId));
    if(!Array.isArray(payload?.records))throw new Error('INVALID_POSTGRES_DIRECTORY');
    return payload;
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
      try {
        const head=await this.head();
        // Coordinator.start() already performs the first incremental catch-up.
        // Sampling the initial head is not a new remote change; do not schedule
        // a second overlapping catch-up when the browser is first opened.
        if(lastSeen<0){lastSeen=head;return;}
        if(head!==lastSeen){lastSeen=head;onChanged();}
      }
      catch(err){onError(err);}
      finally{busy=false;}
    };
    // Check for newly committed PostgreSQL events frequently without
    // reloading full tables when nothing changed across devices.
    const interval=setInterval(()=>{void probe();},2500);
    void probe();
    return ()=>{this.stopped=true;clearInterval(interval);};
  }
}
