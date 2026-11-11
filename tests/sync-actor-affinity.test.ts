import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayProcessForCurrentActor} from '../src/sync-next/actorAffinity';
import {explainSyncFailure} from '../src/sync-next/syncFailureGuide';
import {classifyQueueSafety} from '../src/sync-next/queueSafety';
import {getCurrentSessionActorId,clearSession} from '../src/services/secureAuth';
import {fingerprint} from '../local-server/sync-domain.mjs';

test('a cached operation remains owned by the original program user',()=>{
 assert.equal(mayProcessForCurrentActor({actorId:'employee-one'},'employee-one',true),true);
 assert.equal(mayProcessForCurrentActor({actorId:'employee-one'},'employee-two',true),false);
 assert.equal(mayProcessForCurrentActor({actorId:'employee-one'},'',true),false);
 assert.equal(mayProcessForCurrentActor({actorId:'employee-one'},'',false),true);
 // Untagged historical commands are not deleted or re-attributed by this patch.
 assert.equal(mayProcessForCurrentActor({},'employee-two',true),true);
});
test('actor metadata does not alter server idempotency fingerprints',()=>{
 const command={id:'saved-command',workspaceId:'lobnan_main',
  changes:[{entity:'inventory',id:'inv-abc',expectedVersion:0,value:{id:'inv-abc',code:'PRI-00018'}}]};
 assert.equal(fingerprint({...command,actorId:'employee-one'}),
   fingerprint({...command,actorId:'employee-two'}));
});
test('login session actor key is cleared explicitly on logout',()=>{
 const source=readFileSync(new URL('../src/services/secureAuth.ts',import.meta.url),'utf8');
 assert.match(source,/sessionStorage\.setItem\(SESSION_ACTOR_KEY,user\.id\)/);
 assert.match(source,/export function clearSession\(\)\{\s*sessionStorage\.removeItem\(SESSION_ACTOR_KEY\)/);
});
test('outbox persists creator before sync, and coordinator filters both retry and reconciliation',()=>{
 const local=readFileSync(new URL('../src/sync-next/localDb.ts',import.meta.url),'utf8');
 const coord=readFileSync(new URL('../src/sync-next/coordinator.ts',import.meta.url),'utf8');
 assert.match(local,/actorId:getCurrentSessionActorId\(\)/);
 const appearances=(coord.match(/mayProcessForCurrentActor\(/g)||[]).length;
 assert.equal(appearances,2);
});

test('old cross-user rejection clearly identifies the owner rather than an accounting duplicate',()=>{
 const guide=explainSyncFailure('PermanentSyncError: COMMAND_OWNER_MISMATCH','inventory');
 assert.equal(guide.kind,'fix-permissions');
 assert.match(guide.title,/مستخدم/);
 assert.equal(guide.safeToRetry,false);
 const sample={id:'command-one',workspaceId:'lobnan_main',status:'rejected' as const,
  createdAt:1,attempts:1,retryAt:0,error:'COMMAND_OWNER_MISMATCH',
  changes:[{entity:'inventory' as const,id:'inv-one',expectedVersion:0,
   value:{id:'inv-one',code:'PRI-00045'}}]};
 const safety=classifyQueueSafety(sample);
 assert.equal(safety.code,'owner');
 assert.equal(safety.allowDiscard,false);
 assert.equal(safety.allowRetry,false);
});
