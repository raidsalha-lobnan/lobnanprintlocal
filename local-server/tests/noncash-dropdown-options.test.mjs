import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
const source=(path)=>fs.readFileSync(new URL(path,root),'utf8');
test('Telegram noncash picker shows active real treasuries, without a placeholder or CASH-1101',()=>{
 const js=source('public/telegram-pos.js');
 const html=source('public/telegram-pos.html');
 assert.match(js,/bankBox\.replaceChildren\(\)/);
 assert.match(js,/nonCashOptions=state\.treasuries\.filter\(t=>t\.type!=='cash_box'/);
 assert.match(js,/t\.accountCode!=='CASH-1101'/);
 assert.match(js,/t\.status==='active'/);
 assert.match(js,/bankBox\.value=selected\.accountCode/);
 assert.match(js,/nonCashOptions\.find\(t=>t\.accountCode===previousBank\)\|\|nonCashOptions\[0\]/);
 assert.match(js,/bankBox\.disabled=nonCashOptions\.length===0/);
 assert.doesNotMatch(html,/<select id="bankTreasury"[^>]*>\s*<option[^>]*>/);
 assert.doesNotMatch(js,/bankBox\.replaceChildren\(new Option/);
});
test('desktop and mobile cashier show real noncash accounts only, with no fake selection',()=>{
 const main=source('src/components/pos/PosBottomPaymentConsole.tsx');
 const desktop=source('src/components/PosView.tsx');
 const mobile=source('src/components/pos/MobilePosView.tsx');
 for(const text of [main,mobile]){
  assert.match(text,/t\.type !== 'cash_box'/);
  assert.match(text,/t\.accountCode !== 'CASH-1101'/);
  assert.doesNotMatch(text,/<option value="">اختر الصندوق غير النقدي<\/option>/);
 }
 assert.match(main,/bankTreasuryOptions\.map\(t => \(/);
 assert.match(desktop,/setBankTreasuryCode\(nonCash\[0\]\?\.accountCode\|\|''\)/);
 assert.match(mobile,/setSelectedBankTreasuryCode\(bankTreasuries\[0\]\?\.accountCode\|\|''\)/);
});
