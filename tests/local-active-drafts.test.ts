import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {activeDraftStorage,flushActiveDraft,initializeActiveDrafts,mobileDraftRecovery} from '../src/services/localActiveDrafts';
test('active drafts survive localStorage quota failure, preserve fields, and support tombstones',async()=>{
 const key='pos_active_full_draft:owner:'+crypto.randomUUID();
 const raw=JSON.stringify({ownerId:'owner',tableLines:[{quantity:4,unitPrice:22,notes:'تجربة'}],timestamp:Date.now()});
 activeDraftStorage.setItem(key,raw);await flushActiveDraft(key);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('lobnan-active-pos-drafts-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const get=()=>new Promise<any>((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 assert.equal((await get()).raw,raw);
 activeDraftStorage.removeItem(key);await flushActiveDraft(key);
 assert.equal((await get()).raw,null);assert.equal(activeDraftStorage.getItem(key),null);db.close();
});
test('mobile draft recovery lists only the same owner and keeps payment and treasury information',async()=>{
 const owner=crypto.randomUUID(),key='mobile_pos_active_draft:'+owner+':old';
 const raw=JSON.stringify({cart:[{quantity:2}],selectedBankTreasuryCode:'CASH-1102',paidAmountInput:'50',timestamp:Date.now()});
 activeDraftStorage.setItem(key,raw);await flushActiveDraft(key);await initializeActiveDrafts();
 assert.equal(mobileDraftRecovery(owner,'mobile_pos_active_draft:'+owner+':new')[0].raw,raw);
 assert.equal(mobileDraftRecovery('other','').length,0);
});
