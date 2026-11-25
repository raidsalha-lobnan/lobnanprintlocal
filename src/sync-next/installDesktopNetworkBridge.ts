/**
 * Windows Electron only: HTTPS transport to the private Node API.
 * Browser fetch is untouched. The server's strict Origin policy stays enabled
 * and only the approved API origin/path can be requested over native IPC.
 */
type DesktopResponse={
 status:number;statusText?:string;headers:Record<string,string>;body:Uint8Array;
};
type DesktopBridge={
 sqliteLocalStorage?:boolean;
 syncApiFetch:(request:{
  url:string;method:string;headers:Record<string,string>;body:Uint8Array|null
 })=>Promise<DesktopResponse>;
};
const bridge=(globalThis as unknown as {electronAPI?:DesktopBridge}).electronAPI;
const allowedApi=String(import.meta.env.VITE_PUBLIC_SYNC_API_URL||'').replace(/\/+$/,'');
if(bridge?.sqliteLocalStorage && typeof bridge.syncApiFetch==='function' &&
   allowedApi==='https://lobnan-api.shares.zrok.io'){
 const originalFetch=globalThis.fetch.bind(globalThis);
 globalThis.fetch=async (input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  let target:string;
  try{
   target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,
    location.href).href;
  }catch{return originalFetch(input,init);}
  if(!target.startsWith(allowedApi+'/api/v1/'))return originalFetch(input,init);
  const request=new Request(input,init);
  if(request.signal.aborted)
   throw request.signal.reason||new DOMException('Aborted','AbortError');
  const outgoing={
   url:request.url,
   method:request.method,
   headers:Object.fromEntries(request.headers.entries()),
   body:['GET','HEAD'].includes(request.method)?null:
    new Uint8Array(await request.arrayBuffer())
  };
  let rejectAbort:(reason:unknown)=>void=()=>{};
  const abort=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const onAbort=()=>rejectAbort(request.signal.reason||
   new DOMException('Aborted','AbortError'));
  request.signal.addEventListener('abort',onAbort,{once:true});
  try{
   const result=await Promise.race([bridge.syncApiFetch(outgoing),abort]);
   const bytes=result.body instanceof Uint8Array?result.body:new Uint8Array(result.body||[]);
   return new Response([204,205,304].includes(result.status)?null:bytes as unknown as BodyInit,{
    status:result.status,statusText:result.statusText||'',headers:result.headers
   });
  }finally{
   request.signal.removeEventListener('abort',onAbort);
  }
 };
}
