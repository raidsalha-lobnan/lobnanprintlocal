import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareQueueWithAuthoritativeRecords} from '../src/sync-next/queueDiagnostics';
const cmd=(changes,status='conflict')=>({
  id:'conflict-queued-0001',workspaceId:'lobnan_main',createdAt:1,
  attempts:1,retryAt:0,status,changes
});
test('conflicting customer update does not automatically overwrite authoritative version 3',()=>{
  const c=cmd([{entity:'parties',id:'pt-1791702392550',expectedVersion:1,
    value:{id:'pt-1791702392550',name:'Local name',balance:50}}]);
  const rows=[{key:'parties\u001fpt-1791702392550',entity:'parties',
    id:'pt-1791702392550',version:3,
    value:{id:'pt-1791702392550',name:'Server name',balance:50}}];
  const result=compareQueueWithAuthoritativeRecords([c],rows);
  assert.equal(result.length,1);
  assert.equal(result[0].allIdentical,false);
  assert.equal(result[0].changes[0].status,'different');
  assert.equal(result[0].changes[0].serverVersion,3);
  assert.deepEqual(result[0].changes[0].differentFields,['name']);
});
test('bulk queue counts identical, changed and server-missing parties without any mutation',()=>{
 const changes=[
  {entity:'parties',id:'a',expectedVersion:1,value:{id:'a',name:'Same'}},
  {entity:'parties',id:'b',expectedVersion:1,value:{id:'b',name:'Different'}},
  {entity:'parties',id:'c',expectedVersion:0,value:{id:'c',name:'Absent'}}
 ];
 const rows=[
  {key:'parties\u001fa',entity:'parties',id:'a',version:3,value:{name:'Same',id:'a'}},
  {key:'parties\u001fb',entity:'parties',id:'b',version:2,value:{id:'b',name:'Server'}}
 ];
 const copy=JSON.stringify({changes,rows});
 const result=compareQueueWithAuthoritativeRecords([cmd(changes,'pending')],rows);
 assert.deepEqual(result[0].changes.map(x=>x.status),['identical','different','absent']);
 assert.equal(JSON.stringify({changes,rows}),copy);
 assert.equal(result[0].allIdentical,false);
});
