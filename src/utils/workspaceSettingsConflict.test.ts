import test from 'node:test';
import assert from 'node:assert/strict';
import type {StoredRecord,SyncCommand,JsonObject} from '../sync-next/types';
import {planConflictResolution} from '../sync-next/conflictResolution';

const base={id:'global',businessName:'مطبعة لبنان',headerImageUrl:'data:image/png;base64,OLD',
  phone:'0590000000',currency:'₪'};
const currentRecord=(value:JsonObject,version=2):StoredRecord=>({
 key:'settings\u001fglobal',entity:'settings',id:'global',version,value
});
const cmd=(proposed:JsonObject):SyncCommand=>({
 id:'workspace-settings-1',workspaceId:'lobnan_main',changes:[{
 entity:'settings',id:'global',value:proposed,expectedVersion:1,
 }],
 baseRecords:[currentRecord(base,1)],createdAt:0,attempts:0,retryAt:0,status:'conflict'
});
test('two devices editing phone and company letterhead independently converge without overwriting either',()=>{
 const proposed={...base,headerImageUrl:'data:image/png;base64,NEW'};
 const authoritative=currentRecord({...base,phone:'0599999999'});
 const resolution=planConflictResolution(cmd(proposed),authoritative);
 assert.equal(resolution.kind,'rebase');
 if(resolution.kind!=='rebase')throw Error('Expected rebase');
 assert.equal(resolution.merged.headerImageUrl,'data:image/png;base64,NEW');
 assert.equal(resolution.merged.phone,'0599999999');
 assert.equal(resolution.expectedVersion,2);
});
test('two conflicting letterhead edits remain manual (no last-writer-wins)',()=>{
 const proposed={...base,headerImageUrl:'data:image/png;base64,A'};
 const authoritative=currentRecord({...base,headerImageUrl:'data:image/png;base64,B'});
 const resolution=planConflictResolution(cmd(proposed),authoritative);
 assert.equal(resolution.kind,'manual');
});
test('concurrent VAT and currency settings never auto-merge, protecting financial semantics',()=>{
 const proposed={...base,currency:'$'};
 const authoritative=currentRecord({...base,phone:'0599999999'});
 const resolution=planConflictResolution(cmd(proposed),authoritative);
 assert.equal(resolution.kind,'manual');
});
