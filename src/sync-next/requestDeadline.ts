/**
 * A failed tunnel or stalled mobile network must not hold the offline queue
 * indefinitely. A timeout NEVER changes the command ID or discards a write:
 * PostgreSQL remains the authority and a later retry uses the same ID.
 */
export async function fetchWithSyncDeadline(
  url:string,options:RequestInit,timeoutMs:number,
  request:typeof fetch=fetch
):Promise<Response>{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)
    throw new Error('INVALID_SYNC_NETWORK_TIMEOUT');
  const controller=new AbortController();
  let timedOut=false;
  const sourceSignal=options.signal;
  const forwardAbort=()=>controller.abort(sourceSignal?.reason);
  if(sourceSignal?.aborted)forwardAbort();
  else sourceSignal?.addEventListener('abort',forwardAbort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  try {
    return await request(url,{...options,signal:controller.signal});
  }catch(error){
    if(timedOut)throw new Error('LOCAL_SYNC_HTTP_TIMEOUT',{cause:error});
    throw error;
  }finally{
    clearTimeout(timer);
    sourceSignal?.removeEventListener('abort',forwardAbort);
  }
}

/** Longer window for full snapshots, shorter for inexpensive head polling.
 * Explicit requests that mutate records are never cancelled by a short poll
 * timeout; retries remain idempotent via the original command ID.
 */
export function deadlineForSyncPath(path:string):number{
  if(path.startsWith('bootstrap?'))return 45_000;
  if(path.startsWith('push?')||path.startsWith('invoices/revise?'))return 35_000;
  if(path.startsWith('events?'))return 20_000;
  return 12_000;
}
