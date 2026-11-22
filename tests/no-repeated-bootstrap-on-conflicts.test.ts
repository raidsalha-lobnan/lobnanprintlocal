import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalSyncDb } from '../src/sync-next/localDb';
import { SyncCoordinator, type SyncTransport } from '../src/sync-next/coordinator';
import type { ServerCursor, SyncCommand, ServerEvent } from '../src/sync-next/types';

const cursor = (n:number):ServerCursor => ({sequence:n,eventId:'event-'+n,seconds:0,nanoseconds:0});

test('unchanged rejected command does not download PostgreSQL bootstrap on every ordinary sync poll',async()=>{
  const db = new LocalSyncDb('incremental-conflict-'+crypto.randomUUID());
  await db.initializeAuthoritativeSnapshot([],cursor(1));
  const blocked=await db.enqueue([{entity:'parties',id:'uncommitted-party',value:{
    id:'uncommitted-party',name:'Uncommitted',code:'CUST-0912'}}]);
  await db.markError(blocked.id,'rejected','ENTITY_PERMISSION_DENIED');
  let fullDownloads=0;
  const remote:SyncTransport={
    async push(_command:SyncCommand){throw new Error('rejected commands must not be pushed');},
    async pull(){return [];},
    async fetchAuthoritativeBootstrap(){fullDownloads++;return {records:[],cursor:cursor(1)};},
    watchLatest(){return ()=>{};}
  };
  const coordinator=new SyncCoordinator(db,remote,'test-incremental');
  try{
    await coordinator.start();
    await coordinator.waitUntilIdle();
    assert.equal(fullDownloads,1,'first authoritative conflict examination is allowed');
    for(let n=0;n<4;n++){
      coordinator.requestSync();
      await coordinator.waitUntilIdle();
    }
    assert.equal(fullDownloads,1,'ordinary 30-second-style checks must not re-download unchanged database');
    assert.equal((await db.pending())[0].status,'rejected','protected command must stay in outbox');
    await db.applyEvent({commandId:'other-device-update',changes:[{
      entity:'inventory',id:'new-stock',version:1,value:{id:'new-stock',code:'PRI-02000',name:'Stock'}
    }],cursor:cursor(2)} as ServerEvent);
    coordinator.requestSync();
    await coordinator.waitUntilIdle();
    assert.equal(fullDownloads,2,'an advanced server event cursor permits a new review');
  }finally{coordinator.stop();await db.close();}
});
