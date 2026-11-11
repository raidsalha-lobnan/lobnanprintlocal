import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayProcessForCurrentActor} from '../src/sync-next/actorAffinity';
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
