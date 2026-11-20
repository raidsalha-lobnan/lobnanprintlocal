import {authHeaders,getCurrentSessionToken,publicSyncApiUrl,secureLoginEnabled} from './secureAuth';
import {fetchWithSyncDeadline} from '../sync-next/requestDeadline';

export type HeldPosKind='desktop'|'mobile';
async function heldRequest<T>(method:'GET'|'POST'|'DELETE',path:string,body?:unknown):Promise<T>{
  if(!secureLoginEnabled())throw new Error('HELD_INVOICES_REQUIRE_POSTGRES_LOGIN');
  const base=publicSyncApiUrl();
  const token=getCurrentSessionToken();
  if(!token)throw new Error('SESSION_LOGIN_REQUIRED');
  const response=await fetchWithSyncDeadline(base+'/api/v1/pos/held'+path,{
    method,headers:{...authHeaders(base,token),'Content-Type':'application/json'},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store'
  },25_000);
  const result=await response.json().catch(()=>({code:'HELD_INVOICE_INVALID_SERVER_REPLY'}));
  if(!response.ok)throw new Error(String(result.code||'HELD_INVOICE_HTTP_'+response.status));
  return result as T;
}
export async function listCentralHeldInvoices<T>(kind:HeldPosKind):Promise<T[]>{
  const result=await heldRequest<{items:T[]}>('GET','?kind='+kind);
  if(!Array.isArray(result.items))throw new Error('HELD_INVOICE_INVALID_LIST');
  return result.items;
}
export async function saveCentralHeldInvoice<T extends {id:string}>(kind:HeldPosKind,held:T):Promise<void>{
  const receipt=await heldRequest<{id:string;saved:boolean}>('POST','',{kind,held});
  if(receipt.id!==held.id||receipt.saved!==true)throw new Error('HELD_INVOICE_RECEIPT_MISMATCH');
}
export async function deleteCentralHeldInvoice(id:string):Promise<void>{
  const receipt=await heldRequest<{id:string;deleted:boolean}>('DELETE','/'+encodeURIComponent(id));
  if(receipt.id!==id||typeof receipt.deleted!=='boolean')throw new Error('HELD_INVOICE_DELETE_REPLY_INVALID');
}
