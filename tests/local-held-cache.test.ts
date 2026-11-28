import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {readLocalHeldCache,checkpointLocalHeld,reconcileLocalHeld,confirmLocalHeld,removeLocalHeld} from '../src/services/localHeldCache';
test('offline hold persists every field across fresh database connections and a server mismatch',async()=>{
 const key='pos_held_private_cache_v1_'+crypto.randomUUID();
 const a={id:'held-a',localOnly:true,lines:[{quantity:3,width:2,unitPrice:17,notes:'نص'}],fullDraft:{paid:0,currency:'USD'}};
 await checkpointLocalHeld(key,a);
 assert.deepEqual(await readLocalHeldCache(key),[a]);
 assert.deepEqual(await reconcileLocalHeld(key,[{...a,localOnly:false,lines:[]}]),[a]);
 const confirmed={...a,localOnly:false};
 assert.deepEqual(await confirmLocalHeld(key,a,confirmed),[confirmed]);
 assert.deepEqual(await removeLocalHeld(key,a.id),[]);
});
test('concurrent checkpoints keep both local-only holds when older remote snapshot arrives',async()=>{
 const key='pos_mobile_held_private_cache_v1_'+crypto.randomUUID();
 const a={id:'a',localOnly:true},b={id:'b',localOnly:true};
 await Promise.all([checkpointLocalHeld(key,a),checkpointLocalHeld(key,b)]);
 const rows=await reconcileLocalHeld(key,[]);
 assert.deepEqual(rows.map(x=>x.id).sort(),['a','b']);
});
