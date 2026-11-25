import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayNavigateAwayFromPos,POS_LEAVE_INTENT_EVENT} from '../src/utils/posLeaveNavigation';

test('leaving cashier dispatches cancelable navigation request',()=>{
  const previousWindow=(globalThis as any).window,previousCustom=(globalThis as any).CustomEvent;
  const events:any[]=[];
  (globalThis as any).window={dispatchEvent:(event:any)=>{events.push(event);return false;}};
  (globalThis as any).CustomEvent=class {
    type:string;cancelable:boolean;detail:any;
    constructor(type:string,o:any){this.type=type;this.cancelable=o.cancelable;this.detail=o.detail;}
  };
  try {
    assert.equal(mayNavigateAwayFromPos('pos','inventory'),false);
    assert.equal(events[0].type,POS_LEAVE_INTENT_EVENT);
    assert.equal(events[0].cancelable,true);
    assert.equal(events[0].detail.targetTab,'inventory');
    assert.equal(mayNavigateAwayFromPos('pos','pos'),true);
    assert.equal(mayNavigateAwayFromPos('inventory','pos'),true);
    assert.equal(events.length,1);
  } finally {(globalThis as any).window=previousWindow;(globalThis as any).CustomEvent=previousCustom;}
});

test('central tab and back navigation pass through cashier guard',()=>{
  const source=readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');
  assert.match(source,/if \(!mayNavigateAwayFromPos\(activeTab,tab\)\) return;/);
  assert.match(source,/if \(!mayNavigateAwayFromPos\(activeTab,previous\)\) return;/);
  assert.match(source,/if \(!mayNavigateAwayFromPos\(activeTab,'home'\)\) return;/);
});

test('desktop and mobile intercept departure until a deliberate resolution',()=>{
  for(const file of ['../src/components/PosView.tsx','../src/components/pos/MobilePosView.tsx']){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(source,/POS_LEAVE_INTENT_EVENT/);
    assert.match(source,/event\.preventDefault\(\)/);
    assert.match(source,/PosLeaveDialog/);
    assert.match(source,/leaveApprovedRef\.current\s*=\s*true/);
    assert.match(source,/complete(Mobile|Cashier)Departure/);
  }
});
