import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramMiniPos} from '../telegram-mini-pos.mjs';

test('Telegram cashier retains the explicit system administrator identity after pairing',async()=>{
 const profile={id:'owner-1',status:'active',roleId:'legacy-owner',name:'Owner'};
 const calls=[];
 const pool={query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.includes('SELECT l.app_user_id'))return {rows:[{app_user_id:profile.id,profile}]};
   if(sql.includes("entity='roles'"))return {rows:[]};
   throw Error('UNEXPECTED_SQL');
 }};
 const mini=new TelegramMiniPos(pool,'lobnan_main',{},'owner-1');
 mini.identity=async()=>({telegramUserId:'123456',name:'Telegram owner'});
 const session=await mini.session('SIGNED_DATA');
 assert.equal(session.access.admin,true);
 assert.equal(session.user.id,'owner-1');
 assert.equal(session.access.can('view_pos'),true);
 const guest=new TelegramMiniPos(pool,'lobnan_main',{},'other-1');
 guest.identity=mini.identity;
 await assert.rejects(guest.session('SIGNED_DATA'),/ROLE_NOT_IMPORTED/);
});
