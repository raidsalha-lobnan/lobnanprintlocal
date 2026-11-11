import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {isSafeAutoCodeRetryCandidate} from '../src/sync-next/catalogAutoRecovery';
import type {SyncCommand} from '../src/sync-next/types';

function catalogCommand(overrides:Partial<SyncCommand>={}):SyncCommand{
 return {
  id:'accepted-id-0001',workspaceId:'lobnan_main',createdAt:1,attempts:1,
  status:'rejected',retryAt:0,error:'PermanentSyncError: ENTITY_SERIAL_ALREADY_USED',
  changes:[{entity:'inventory',id:'inv-new-record',expectedVersion:0,
   value:{id:'inv-new-record',code:'PRI-00045',name:'New Paper',_serverAutoCode:true}}],
  ...overrides
 };
}
test('retry original command only for absent auto-coded NEW item',()=>{
 const c=catalogCommand();
 assert.equal(isSafeAutoCodeRetryCandidate(c,false,false),true);
 assert.equal(c.id,'accepted-id-0001');
 assert.equal(isSafeAutoCodeRetryCandidate(c,true,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(c,false,true),false);
});
test('never retry manual codes or errors unrelated to server allocation',()=>{
 const base=catalogCommand();
 const changes=base.changes.map(c=>({...c,value:{id:c.id,code:'PRI-00045'}}));
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({changes}),false,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({error:'ENTITY_SERIAL_IMMUTABLE'}),false,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({error:'COMMAND_OWNER_MISMATCH'}),false,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({error:'ENTITY_PERMISSION_DENIED'}),false,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({status:'pending'}),false,false),false);
});
test('never retry financial entities, existing records, dependent operations or runaway attempts',()=>{
 const baseline=catalogCommand();
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({attempts:3}),false,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({changes:[
  {...baseline.changes[0],entity:'invoices'}]}),false,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({changes:[
  {...baseline.changes[0],expectedVersion:2}]}),false,false),false);
 assert.equal(isSafeAutoCodeRetryCandidate(catalogCommand({changes:[
  baseline.changes[0],{...baseline.changes[0],id:'inv-two'}]}),false,false),false);
});

test('both read-only item entry screens explicitly mark generated SKUs as automatic',()=>{
 const inventory=readFileSync(new URL('../src/components/InventoryView.tsx',import.meta.url),'utf8');
 const quick=readFileSync(new URL('../src/components/pos/QuickAddItemModal.tsx',import.meta.url),'utf8');
 assert.match(inventory,/readOnly\s*\n\s*title="كود الصنف/);
 assert.match(inventory,/_serverAutoCode:\s*true/);
 assert.match(quick,/readOnly\s*\n\s*title="الكود التسلسلي/);
 assert.match(quick,/\(newItem as any\)\._serverAutoCode = true/);
});
test('quick POS item creation never fabricates ten units of opening stock',()=>{
 const quick=readFileSync(new URL('../src/components/pos/QuickAddItemModal.tsx',import.meta.url),'utf8');
 assert.match(quick,/stockQuantity, setStockQuantity\] = useState<number>\(0\)/);
 assert.match(quick,/setStockQuantity\(0\)/);
 assert.doesNotMatch(quick,/setStockQuantity\(10\)/);
});
