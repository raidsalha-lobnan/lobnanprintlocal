import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramMiniPos} from '../telegram-mini-pos.mjs';

function fixture({unlinked=false,inactive=false}={}){
 const queried=[];
 const profile={id:'admin1',name:'Admin',roleId:'role-admin',status:'active'};
 const pool={async query(sql,args){
  queried.push({sql,args});
  if(sql.includes('FROM sync_telegram_pos_links'))
   return {rows:unlinked?[]:[{app_user_id:'admin1'}]};
  if(sql.includes('FROM sync_auth_users a JOIN sync_records p'))
   return {rows:inactive?[]:[{profile}]};
  if(sql.includes("entity='roles'"))
   return {rows:[{value:{id:'role-admin',code:'SYS_ADMIN',permissions:{}}}]};
  throw Error('UNEXPECTED_AUTH_QUERY:'+sql);
 }};
 const mini=new TelegramMiniPos(pool,'lobnan_main',{},'admin1');
 mini.identity=async()=>({telegramUserId:'100500',name:'Telegram User'});
 return {mini,queried};
}
test('Ten-minute pairing-code expiry never removes a lasting linked user or demands a new pairing code',async()=>{
 const {mini,queried}=fixture();
 const first=await mini.session('signed Telegram request');
 assert.equal(first.user.id,'admin1');
 assert.equal(first.access.can('add'),true);
 // Each launch is re-verified against the SAME durable account mapping,
 // never against a stored one-time pairing-code expiry.
 const second=await mini.session('another signed Telegram request');
 assert.equal(second.user.id,first.user.id);
 assert.equal(queried.length,6);
 assert.equal(queried.filter(x=>x.sql.includes('FROM sync_telegram_pos_links')).length,2);
 assert.equal(queried.some(x=>x.sql.includes('sync_telegram_pos_pair_codes')),false);
});
test('Missing Telegram link requires initial pairing only',async()=>{
 const {mini}=fixture({unlinked:true});
 await assert.rejects(()=>mini.session('signed'),/TELEGRAM_MINI_PAIR_REQUIRED/);
});
test('An inactive account is not mistaken for an expired pairing code and cannot bypass access through relinking',async()=>{
 const {mini}=fixture({inactive:true});
 await assert.rejects(()=>mini.session('signed'),/TELEGRAM_MINI_LINKED_USER_UNAVAILABLE/);
});
