import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('browser persistence advisory only warns on close with unresolved sync work',()=>{
 const s=read('src/components/OfflineIndicator.tsx');
 assert.match(s,/storageHealth\?\.persistent!==false/);
 assert.match(s,/pendingSyncCount<=0/);
 assert.match(s,/addEventListener\('beforeunload',warn\)/);
 assert.doesNotMatch(s,/storageLow\|\|storageHealth\.persistent===false/);
});
test('transfer route missing keeps immutable recovery request and identifies server update requirement',()=>{
 const s=read('src/components/AccountTransferModal.tsx');
 assert.match(s,/response\.status===404&&result\.code==='NOT_FOUND'/);
 assert.match(s,/ACCOUNT_TRANSFER_ROUTE_UNAVAILABLE/);
 assert.match(s,/يلزم تحديث خدمة الخادم/);
 assert.match(s,/const request:Request=pending\|\|/);
 const receipt=s.indexOf('ACCOUNT_TRANSFER_RECEIPT_MISMATCH');
 assert.ok(s.indexOf('localStorage.removeItem(pendingKey)')>receipt);
});
