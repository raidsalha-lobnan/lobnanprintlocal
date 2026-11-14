import type {BusinessSettings} from '../types';
import {getLocalSyncConfig} from '../sync-next/httpTransport';
import {authHeaders,getCurrentSessionToken,secureLoginEnabled} from './secureAuth';

let pollingTimeout:ReturnType<typeof setTimeout>|null=null;
let isPollingActive=false;
let activeLease:{chatId:string;updateId:number;leaseToken:string}|null=null;
const currentTabId=typeof window!=='undefined'?
  (window.name||(window.name='tg_tab_'+Date.now()+'_'+Math.random().toString(36).slice(2,8))):'server';
export interface TelegramInlineButton {
 text:string;callback_data?:string;url?:string;
}
export interface TelegramSendMessageOptions {
 chatId?:string;parseMode?:'HTML'|'Markdown'|'MarkdownV2';progress?:boolean;
 replyMarkup?:{inline_keyboard?:TelegramInlineButton[][];keyboard?:{text:string}[][];resize_keyboard?:boolean;one_time_keyboard?:boolean;};
}
export interface TelegramIncomingAction {
 type:'message'|'callback';text:string;data?:string;chatId:string;
 callbackQueryId?:string;messageId?:number;fromName?:string;token:string;
}

function getHeaders(url:string):Record<string,string>{
 const config=getLocalSyncConfig();
 return {
  ...authHeaders(url,secureLoginEnabled()?getCurrentSessionToken():config.token),
  'content-type':'application/json'
 };
}
async function postToCentral(path:string,body:Record<string,unknown>):Promise<void>{
 const config=getLocalSyncConfig();
 const reply=await fetch(config.url+'/api/v1/telegram/'+path+'?workspace='+encodeURIComponent(config.workspace),{
  method:'POST',headers:getHeaders(config.url),
  body:JSON.stringify(body),cache:'no-store',
  signal:AbortSignal.timeout(path==='report/send-document'?100000:16000)
 });
 if(!reply.ok)throw new Error('TELEGRAM_SERVER_'+path.toUpperCase().replaceAll('/','_')+'_HTTP_'+reply.status);
 const outcome=await reply.json().catch(()=>null);
 if(!outcome?.ok)throw new Error('TELEGRAM_DELIVERY_NOT_CONFIRMED');
}
function authorizedLease(chatId:string){
 if(!activeLease||String(chatId)!==activeLease.chatId)
   throw new Error('TELEGRAM_INBOX_LEASE_REQUIRED');
 return {...activeLease};
}
async function pdfToBase64(blob:Blob):Promise<string>{
 if(blob.size<=0||blob.size>20_000_000)throw new Error('TELEGRAM_PDF_SIZE_INVALID');
 const bytes=await blob.arrayBuffer();
 const values=new Uint8Array(bytes);
 if(values[0]!==37||values[1]!==80||values[2]!==68||values[3]!==70)
   throw new Error('TELEGRAM_REPORT_NOT_PDF');
 return new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.onerror=()=>reject(reader.error||new Error('TELEGRAM_PDF_ENCODING_FAILED'));
  reader.readAsDataURL(blob);
 });
}

export const TelegramService={
 sendMessage:async(text:string,settings:BusinessSettings,options?:TelegramSendMessageOptions):Promise<boolean>=>{
  if(!settings.telegramConfig?.enabled)throw new Error('TELEGRAM_DISABLED');
  const chatId=String(options?.chatId||settings.telegramConfig?.defaultChatId||'');
  await postToCentral('report/send-message',{
   ...authorizedLease(chatId),text,replyMarkup:options?.replyMarkup,progress:options?.progress===true
  });
  return true;
 },
 answerCallbackQuery:async(callbackQueryId:string,_token:string,text?:string):Promise<boolean>=>{
  if(!callbackQueryId)return false;
  if(!activeLease)throw new Error('TELEGRAM_CALLBACK_LEASE_REQUIRED');
  await postToCentral('report/answer-callback',{
   ...activeLease,callbackQueryId,text:text||''
  });
  return true;
 },
 sendDocument:async(blob:Blob,filename:string,caption:string,chatId?:string,_botToken?:string):Promise<boolean>=>{
  const target=String(chatId||'');
  const lease=authorizedLease(target);
  await postToCentral('report/send-document',{
   ...lease,filename,caption,base64:await pdfToBase64(blob)
  });
  return true;
 },
 startPolling:(settings:BusinessSettings,onAction:(action:TelegramIncomingAction)=>void|Promise<void>)=>{
  // Secret botToken is retained ONLY on PostgreSQL. It is intentionally
  // removed from all browser snapshots, including the administrator's.
  if(!settings.telegramConfig?.enabled){TelegramService.stopPolling();return;}
  TelegramService.stopPolling();isPollingActive=true;
  const schedule=(delay:number)=>{if(isPollingActive)pollingTimeout=setTimeout(poll,delay);};
  const tabLeader=()=>{
   try{
    const raw=localStorage.getItem('telegram_polling_leader');
    if(!raw)return true;
    const value=JSON.parse(raw);
    return !value.tabId||Date.now()-value.time>15000||value.tabId===currentTabId;
   }catch{return true;}
  };
  const claimLeadership=()=>{
   try{localStorage.setItem('telegram_polling_leader',JSON.stringify({tabId:currentTabId,time:Date.now()}));}catch{}
  };
  let inFlight=false;
  const poll=async()=>{
   if(!isPollingActive||inFlight)return;
   if(!navigator.onLine||!tabLeader()){schedule(10000);return;}
   inFlight=true;claimLeadership();
   try{
    const config=getLocalSyncConfig();
    const endpoint=config.url+'/api/v1/telegram/';
    const headers=getHeaders(config.url);
    const response=await fetch(endpoint+'inbox/claim?workspace='+encodeURIComponent(config.workspace),{
     method:'POST',headers,body:'{}',cache:'no-store'
    });
    if(!response.ok){schedule(response.status===401?20000:10000);return;}
    const payload=await response.json() as {item?:{
      updateId:number;leaseToken:string;action:Omit<TelegramIncomingAction,'token'>;
      attempts?:number;documentDelivered?:boolean
    }|null};
    // A claim already waited for Telegram; immediately re-arm the next wait.
    if(!payload.item){schedule(60);return;}
    const {updateId,leaseToken,action}=payload.item;
    activeLease={updateId,leaseToken,chatId:String(action.chatId)};
    try{
     if(!payload.item.documentDelivered){
       if(action.type==='callback'&&action.callbackQueryId)
         await TelegramService.answerCallbackQuery(action.callbackQueryId,'');
       await onAction({...action,token:''});
     } // A previously confirmed PDF must never be regenerated on an ACK retry.
     const ack=await fetch(endpoint+'inbox/ack?workspace='+encodeURIComponent(config.workspace),{
      method:'POST',headers,body:JSON.stringify({updateId,leaseToken}),cache:'no-store'
     });
     if(!ack.ok)throw new Error('TELEGRAM_INBOX_ACK_FAILED_'+ack.status);
     schedule(70);
    }catch(error){
     console.warn('Telegram report operation failed; recording bounded retry',error);
     const raw=error instanceof Error?error.message:String(error);
     const code=/^[A-Z0-9_]{3,100}$/.test(raw)?raw:'REPORT_PROCESSING_FAILED';
     const failed=await fetch(endpoint+'inbox/fail?workspace='+encodeURIComponent(config.workspace),{
      method:'POST',headers,body:JSON.stringify({updateId,leaseToken,code}),
      cache:'no-store',signal:AbortSignal.timeout(18000)
     }).catch(()=>null);
     if(!failed?.ok){
       // Never delete a financial report request just because diagnostics failed.
       await fetch(endpoint+'inbox/release?workspace='+encodeURIComponent(config.workspace),{
        method:'POST',headers,body:JSON.stringify({updateId,leaseToken}),cache:'no-store'
       }).catch(()=>{});
     }
     schedule(400);
    }finally{activeLease=null;}
   }catch(error){
    console.warn('Telegram central report queue temporarily unavailable',error);
    schedule(15000);
   }finally{inFlight=false;}
  };
  schedule(1200);
 },
 stopPolling:()=>{
  isPollingActive=false;
  if(pollingTimeout){clearTimeout(pollingTimeout);pollingTimeout=null;}
  try{
   const raw=localStorage.getItem('telegram_polling_leader');
   if(raw&&JSON.parse(raw)?.tabId===currentTabId)localStorage.removeItem('telegram_polling_leader');
  }catch{}
 }
};
