import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyTelegramMiniInitData,normalizeMiniSaleBody,TelegramMiniPos} from '../telegram-mini-pos.mjs';
import {buildNewAtomicPosSale} from '../atomic-pos-builder.compiled.mjs';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';
import {telegramReportsInlineMenu,telegramPersistentMainMenuKeyboard,isTelegramQuickInvoiceMessage,telegramQuickInvoiceUrl} from '../telegram-bot-menu.mjs';

const token='123456789:XYZABCDEFGHIJKLMNOPQRSTUVabcdefghijklmnopqrst';
function signedData(userId=12345,when=Date.now(),extra={}){
 const params=new URLSearchParams({auth_date:String(Math.floor(when/1000)),
  query_id:'AAEAAAE',user:JSON.stringify({id:userId,first_name:'Test'}),...extra});
 const sorted=[...params.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
  .map(([k,v])=>k+'='+v).join('\n');
 const key=crypto.createHmac('sha256','WebAppData').update(token).digest();
 params.set('hash',crypto.createHmac('sha256',key).update(sorted).digest('hex'));
 return params.toString();
}
test('Telegram signed initData grants only the verified Telegram user identity',()=>{
 const data=signedData(13579);
 assert.deepEqual(verifyTelegramMiniInitData(data,token),{telegramUserId:'13579',name:'Test'});
 assert.throws(()=>verifyTelegramMiniInitData(data.replace('13579','13578'),token),/TELEGRAM_MINI_INVALID_SIGNATURE/);
 assert.throws(()=>verifyTelegramMiniInitData(data,'wrong:'+token),/TELEGRAM_MINI_INVALID_SIGNATURE/);
 assert.throws(()=>verifyTelegramMiniInitData(signedData(1,Date.now()-24*3600000),token),
  /TELEGRAM_MINI_SESSION_EXPIRED/);
 assert.throws(()=>verifyTelegramMiniInitData('',token),/TELEGRAM_MINI_AUTH_REQUIRED/);
});
test('Mini App HMAC supports signed launch params without trusting client user ID',()=>{
 const data=signedData(112233,Date.now(),{start_param:'quick','chat_type':'private'});
 assert.equal(verifyTelegramMiniInitData(data,token).telegramUserId,'112233');
});
test('Mini POS draft schema refuses invalid amounts and unknown item IDs',()=>{
 const draft={customerId:'customer-1',
  paymentMethod:'credit',items:[{itemId:'item-1',quantity:2,unitPrice:3.5}],
  overallDiscount:1,notes:'A'};
 const clean=normalizeMiniSaleBody(draft);
 assert.equal(clean.paymentMethod,'credit');assert.equal(clean.paidAmount,null);
 assert.equal(clean.items[0].quantity,2);
 assert.equal(clean.items[0].unitPrice,3.5);
 assert.equal(clean.overallDiscount,1);
 assert.equal(clean.items.length,1);
 assert.equal(clean.createdByAdmin,undefined);
 assert.throws(()=>normalizeMiniSaleBody({...draft,items:[]}),/MINI_POS_INVALID_ITEMS/);
 assert.throws(()=>normalizeMiniSaleBody({...draft,items:[{itemId:'../../secret',quantity:1,unitPrice:1}]}),/MINI_POS_INVALID_ITEM_ID/);
 assert.throws(()=>normalizeMiniSaleBody({...draft,items:[{itemId:'item-1',quantity:-1,unitPrice:1}]}),/MINI_POS_INVALID_QUANTITY/);
 assert.throws(()=>normalizeMiniSaleBody({...draft,items:[{itemId:'item-1',quantity:1,unitPrice:Infinity}]}),/MINI_POS_INVALID_PRICE/);
});
test('one authoritative POS builder generates balanced invoice, COGS and stock from Mini App values',()=>{
 const uid='inv-pos-80ae8510-d3fc-4392-beb6-90e559ca4938';
 const item={id:'item-1',code:'PRI-00001',name:'Printed paper',category:'printing',
  unit:'sheet',stockQuantity:10,purchasePrice:2,sellingPrice:7,barcode:'001'};
 const customer={id:'customer-1',code:'CUST-0002',name:'Test',type:'customer',balance:0};
 const model=buildNewAtomicPosSale({
  invoiceId:uid,commandId:'80ae8510-d3fc-4392-beb6-90e559ca4938',
  createdAt:'2026-11-14T12:00:00.000Z',
  items:[{item,quantity:2,unitPrice:7}],
  customerId:customer.id,customerName:customer.name,paymentMethod:'cash',
  notes:'',options:{currency:'ILS',currencySymbol:'₪'},
  vatRate:0,
  inventory:[{id:item.id,value:item,version:2,pending:false}],
  parties:[{id:customer.id,value:customer,version:3,pending:false}]
 });
 const changes=[model.posting.invoice,...model.posting.journals,
  ...model.posting.stockMovements,...model.posting.partyChanges,
  ...model.posting.inventoryChanges].map(c=>({
   ...c,expectedVersion:c.entity==='inventory'?2:c.entity==='parties'?3:0
  }));
 const command={id:model.posting.commandId,workspaceId:'lobnan_main',
  atomicInvoiceId:uid,changes};
 assert.equal(validateAtomicInvoicePosting(command),true);
 assert.equal(model.invoice.totalAmount,14);
 assert.equal(model.invoice.isAccountingPosted,true);
 assert.equal(model.posting.journals.length,2);
 assert.equal(model.posting.stockMovements.length,1);
 assert.equal(model.posting.stockMovements[0].value.balanceAfter,8);
 assert.equal(model.posting.inventoryChanges[0].value.stockQuantity,8);
});
test('pairing code is random, short-lived and stored only as SHA-256 hash',async()=>{
 const calls=[];
 const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:[]}}};
 const service=new TelegramMiniPos(db,'lobnan_main',{});
 const result=await service.pairStart({id:'usr-1'},{can:key=>true});
 assert.match(result.code,/^[A-F0-9]{20}$/);
 assert.equal(result.expiresInSeconds,600);
 assert.ok(calls.some(x=>x.sql.includes('DELETE FROM sync_telegram_pos_pair_codes')));
 const write=calls.find(x=>x.sql.includes('INSERT INTO sync_telegram_pos_pair_codes'));
 assert.ok(write);
 assert.equal(write.args[2],'usr-1');
 assert.notEqual(write.args[1],result.code);
 assert.equal(write.args[1].length,64);
});
test('bot has Mini App entry and quick-message opener but not public financial privileges',()=>{
 const menu=telegramReportsInlineMenu();
 assert.equal(menu.inline_keyboard[0][0].web_app.url,'https://lobnanprintlocal.vercel.app/telegram-pos');
 assert.equal(telegramPersistentMainMenuKeyboard().keyboard[1][0].text,'➕ فاتورة جديدة');
 assert.equal(isTelegramQuickInvoiceMessage('/invoice'),true);
 assert.equal(isTelegramQuickInvoiceMessage('➕ فاتورة جديدة'),true);
 assert.equal(isTelegramQuickInvoiceMessage('بيع مقوى A4 عدد 2 سعر 5 نقدي'),true);
 assert.match(telegramQuickInvoiceUrl('بيع مقوى A4 عدد 2 سعر 5 نقدي'),/\?quick=/);
});
