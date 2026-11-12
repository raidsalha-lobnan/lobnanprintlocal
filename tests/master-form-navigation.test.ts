import test from 'node:test';
import assert from 'node:assert/strict';
import {requestMasterForm, peekMasterFormRequest, claimMasterForm, finishMasterForm, consumeMasterResult, MASTER_OPEN_EVENT, MASTER_DONE_EVENT} from '../src/utils/masterFormNavigation';

test('one master form request preserves customer parent and returns its canonical ID', () => {
  const store = new Map<string,string>();
  const session = {
    getItem: (k:string) => store.get(k) ?? null,
    setItem: (k:string,v:string) => {store.set(k,v);},
    removeItem: (k:string) => {store.delete(k);}
  };
  const events = new EventTarget();
  const opened:string[] = [], done:string[] = [];
  events.addEventListener(MASTER_OPEN_EVENT, () => opened.push('open'));
  events.addEventListener(MASTER_DONE_EVENT, () => done.push('done'));
  Object.assign(globalThis,{sessionStorage:session,window:events});
  try {
    requestMasterForm({kind:'party',source:'pos',initialName:'مؤمن الدرفيل',isSubCustomer:true,parentPartyId:'cash'});
    assert.equal(opened.length,1);
    assert.equal(peekMasterFormRequest()?.parentPartyId,'cash');
    assert.equal(claimMasterForm('item'),null);
    const request=claimMasterForm('party');
    assert.equal(request?.initialName,'مؤمن الدرفيل');
    assert.equal(request?.isSubCustomer,true);
    finishMasterForm('party','pt-fixed-uuid');
    assert.equal(done.length,1);
    assert.deepEqual(consumeMasterResult(),{kind:'party',id:'pt-fixed-uuid',isSubCustomer:true});
    assert.equal(consumeMasterResult(),null);
  } finally {
    delete (globalThis as Record<string,unknown>).sessionStorage;
    delete (globalThis as Record<string,unknown>).window;
  }
});
