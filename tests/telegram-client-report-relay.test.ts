import test from 'node:test';
import assert from 'node:assert/strict';
import type {BusinessSettings} from '../src/types';

const store=new Map<string,string>([
 ['lobnan_local_sync_server_url','https://example.test'],
 ['lobnan_local_sync_device_token','x'.repeat(64)],
 ['lobnan_local_sync_workspace','lobnan_main']
]);
(globalThis as any).localStorage={
 getItem:(key:string)=>store.get(key)||null,
 setItem:(key:string,value:string)=>store.set(key,value),
 removeItem:(key:string)=>store.delete(key)
};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
(globalThis as any).window={name:'telegram-relay-integration-test'};
(globalThis as any).FileReader=class {
 result:string|null=null;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsDataURL(blob:Blob){
  blob.arrayBuffer().then(bytes=>{
   this.result='data:application/pdf;base64,'+Buffer.from(bytes).toString('base64');
   this.onload?.();
  }).catch(()=>this.onerror?.());
 }
};
const {TelegramService}=await import('../src/services/TelegramService');
const settings={telegramConfig:{enabled:true}} as BusinessSettings;
const lease='cb1dc30c-efcb-4147-bb61-125efddcda99';
const response=(body:unknown)=>({ok:true,status:200,json:async()=>body});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('client claims a report without the bot token, relays message and PDF, then acknowledges',async()=>{
 const paths:string[]=[];let claimed=false;let done!:()=>void;
 const completed=new Promise<void>(resolve=>{done=resolve;});
 (globalThis as any).fetch=async(url:string,options:RequestInit)=>{
  const path=new URL(url).pathname;paths.push(path);
  if(path.endsWith('/inbox/claim')){
   if(claimed)return response({item:null});
   claimed=true;
   return response({item:{updateId:91,leaseToken:lease,action:{type:'message',text:'/start',chatId:'12345'}}});
  }
  if(path.endsWith('/report/send-message')||path.endsWith('/report/send-document')){
   const payload=JSON.parse(String(options.body));
   assert.equal(payload.chatId,'12345');
   assert.equal(payload.leaseToken,lease);
   assert.equal(payload.updateId,91);
   if(path.endsWith('send-document'))assert.ok(Buffer.from(payload.base64,'base64').toString().startsWith('%PDF-'));
   return response({ok:true});
  }
  if(path.endsWith('/inbox/ack')){done();return response({ok:true});}
  throw new Error('unexpected endpoint '+path);
 };
 TelegramService.startPolling(settings,async action=>{
  assert.equal(action.token,'');
  await TelegramService.sendMessage('تم استلام الطلب',settings,{chatId:action.chatId});
  await TelegramService.sendDocument(new Blob(['%PDF-1.7\n'+'x'.repeat(70)]),'test.pdf','تقرير تجريبي',action.chatId);
 });
 await Promise.race([completed,sleep(2600).then(()=>{throw new Error('ACK_NOT_RECEIVED')})]);
 TelegramService.stopPolling();
 assert.ok(paths.some(x=>x.endsWith('/report/send-message')));
 assert.ok(paths.some(x=>x.endsWith('/report/send-document')));
 assert.ok(paths.some(x=>x.endsWith('/inbox/ack')));
 assert.ok(!paths.some(x=>x.includes('api.telegram.org')));
});

test('failed report records bounded retry and never acknowledges an unsent report',async()=>{
 const paths:string[]=[];let released!:()=>void;
 const finished=new Promise<void>(resolve=>{released=resolve;});let claimed=false;
 (globalThis as any).fetch=async(url:string)=>{
  const path=new URL(url).pathname;paths.push(path);
  if(path.endsWith('/inbox/claim')){
   if(claimed)return response({item:null});
   claimed=true;
   return response({item:{updateId:92,leaseToken:lease,action:{type:'message',text:'test',chatId:'12345'}}});
  }
  if(path.endsWith('/report/send-message'))return {ok:false,status:502,json:async()=>({code:'TELEGRAM_FAIL'})};
  if(path.endsWith('/inbox/fail')){released();return response({ok:true,terminal:false});}
  throw new Error('unexpected endpoint '+path);
 };
 TelegramService.startPolling(settings,async action=>{
  await TelegramService.sendMessage('فحص',settings,{chatId:action.chatId});
 });
 await Promise.race([finished,sleep(2600).then(()=>{throw new Error('RELEASE_NOT_RECEIVED')})]);
 TelegramService.stopPolling();
 assert.ok(paths.some(x=>x.endsWith('/inbox/fail')));
 assert.ok(!paths.some(x=>x.endsWith('/inbox/ack')));
});
