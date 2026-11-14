import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TelegramMiniPos} from '../telegram-mini-pos.mjs';

const active=(id,accountCode,type,name)=>({
 entity:'treasuries',record_id:id,value:{id,accountCode,type,name,status:'active'}
});
const data=[
 active('treasury-cash-main','CASH-1101','cash_box','Main Cash'),
 active('bank-1','CASH-1102','bank_account','Bank'),
 active('wallet-1','CASH-1106','digital_wallet','Wallet'),
 {...active('disabled-1','CASH-1108','bank_account','Disabled'),value:{
   ...active('disabled-1','CASH-1108','bank_account','Disabled').value,status:'inactive'}},
 active('secret-1','CASH-1109','bank_account','Restricted')
];
function fixture(){
 const mini=new TelegramMiniPos({query:async(sql)=>{
  if(sql.includes("entity IN ('settings','parties','treasuries','warehouses')"))
   return {rows:data};
  if(sql.includes("entity IN ('accounts','employees')"))return {rows:[]};
  if(sql.includes('FROM sync_telegram_pos_drafts'))return {rows:[]};
  throw Error('UNEXPECTED_QUERY '+sql);
 }},'lobnan_main',{});
 mini.session=async()=>({
  user:{id:'user-1',name:'Allowed'},telegramUserId:'12345',
  access:{can:()=>true,canRead:(entity,value,id)=>id!=='secret-1'}
 });
 return mini;
}
test('bootstrap exposes status active on authorized bank accounts and wallets so the Telegram selector does not disable itself',async()=>{
 const res=await fixture().bootstrap('mock-signed');
 assert.deepEqual(res.treasuries.map(t=>t.accountCode),
   ['CASH-1101','CASH-1102','CASH-1106']);
 assert.ok(res.treasuries.every(t=>t.status==='active'));
 const choices=res.treasuries.filter(t=>
   t.type!=='cash_box'&&t.status==='active'&&t.accountCode!=='CASH-1101'&&
   /^CASH-\d{4,}$/.test(t.accountCode||''));
 assert.deepEqual(choices.map(t=>t.accountCode),['CASH-1102','CASH-1106']);
 assert.equal(choices.length>0,true);
});
test('browser uses the authorized bank choices and keeps CASH-1101 out of its noncash list',()=>{
 const js=readFileSync(new URL('../../public/telegram-pos.js',import.meta.url),'utf8');
 assert.ok(js.includes('const nonCashOptions=state.treasuries.filter'));
 assert.ok(js.includes("t.status==='active'"));
 assert.ok(js.includes("t.accountCode!=='CASH-1101'"));
 assert.ok(js.includes('bankBox.appendChild(new Option(t.name,t.accountCode))'));
 assert.ok(js.includes('bankBox.disabled=nonCashOptions.length===0'));
 assert.ok(js.includes("bankTreasuryCode:bankLeg>0?el('bankTreasury').value:''"));
});