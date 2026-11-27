import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getCurrentSessionProfile,AUTH_TOKEN_KEY,clearSession} from '../src/services/secureAuth';

function memorySession(){
  const map=new Map<string,string>();
  return {
    getItem:(key:string)=>map.get(key)??null,
    setItem:(key:string,value:string)=>{map.set(key,String(value));},
    removeItem:(key:string)=>{map.delete(key);},
    clear:()=>map.clear(),
  };
}
test('signed-in actor profile is selected by the server-login identity, never the cached alternate admin account',()=>{
  const previous=(globalThis as any).sessionStorage;
  const store=memorySession();
  (globalThis as any).sessionStorage=store;
  try{
    store.setItem(AUTH_TOKEN_KEY,'valid-format-session-token');
    store.setItem('lobnan_postgres_user_session_expires',String(Date.now()+60_000));
    store.setItem('lobnan_postgres_session_actor_id','usr-1');
    store.setItem('lobnan_postgres_session_profile_v1',
      JSON.stringify({id:'usr-1',email:'raid.salha@gmail.com',fullName:'م. رائد صالحة',roleId:'role-admin',status:'active'}));
    assert.equal(getCurrentSessionProfile()?.fullName,'م. رائد صالحة');
    assert.equal(getCurrentSessionProfile()?.id,'usr-1');
    // Changing a saved selector or a cached profile must not impersonate the
    // separately authenticated user. Session actor/profile mismatch fails shut.
    store.setItem('lobnan_postgres_session_profile_v1',
      JSON.stringify({id:'user-1789170883526',fullName:'مطبعة لبنان',roleId:'role-admin',status:'active'}));
    assert.equal(getCurrentSessionProfile(),null);
    store.setItem('lobnan_postgres_session_profile_v1',
      JSON.stringify({id:'usr-1',fullName:'م. رائد صالحة',roleId:'role-admin',status:'active'}));
    store.setItem('lobnan_postgres_user_session_expires',String(Date.now()-1000));
    assert.equal(getCurrentSessionProfile(),null,'expired session must not authorize even an old matching profile');
    clearSession();
    assert.equal(store.getItem('lobnan_postgres_session_profile_v1'),null);
  }finally{(globalThis as any).sessionStorage=previous;}
});
test('accounting user identity cannot fall back to the first saved user or to a UI admin switch in secure mode',()=>{
  const ctx=readFileSync(new URL('../src/context/AccountingContext.tsx',import.meta.url),'utf8');
  const navbar=readFileSync(new URL('../src/components/Navbar.tsx',import.meta.url),'utf8');
  const auth=readFileSync(new URL('../src/services/secureAuth.ts',import.meta.url),'utf8');
  const segment=ctx.split('// Helper accessors and CRUD for Multi-Company, Multi-Branch & Granular RBAC')[1]
    ?.split('  const acquireDailyEntryRowLock')[0];
  assert.ok(segment);
  assert.match(segment,/getCurrentSessionProfile\(\)/);
  assert.match(ctx,/if\(secureLoginEnabled\(\)\)return getCurrentSessionActorId\(\)/);
  assert.match(ctx,/Refused UI user switch: account identity is bound to PostgreSQL login/);
  assert.doesNotMatch(navbar,/\b(?:setCurrentUser|switchUser)\b/);
  assert.match(navbar,/currentUser\?\.fullName/);
  assert.match(auth,/bindCurrentSessionProfile\(user\)/);
});
