import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileUnexpectedEmployeeLoss} from '../src/sync-next/employeeProjectionGuard';

type Staff={id:string;name:string};
const employees=(n:number):Staff[]=>Array.from({length:n},(_,i)=>({
  id:'emp-'+String(i+1).padStart(3,'0'),name:'موظف '+(i+1)
}));

test('unchanged employee directory does not re-download PostgreSQL snapshot',async()=>{
 const previous=employees(8);
 const repo={checkEmployeeDirectory:async()=>{throw Error('Unexpected full scan');},
  getAllVisibleGrouped:async()=>{throw Error('Unexpected IDB scan');}};
 const result=await reconcileUnexpectedEmployeeLoss(repo,previous,[...previous]);
 assert.equal(result.reason,'unchanged');
 assert.equal(result.employees.length,8);
});

test('an unexpected eight-to-seven employee drop triggers central repair',async()=>{
 const before=employees(8);let checks=0;
 const repo={
  checkEmployeeDirectory:async()=>{checks++;return {centralIds:before.map(x=>x.id),stillMissing:[]};},
  getAllVisibleGrouped:async()=>({employees:[...before]})
 };
 const result=await reconcileUnexpectedEmployeeLoss(repo,before,before.slice(0,7));
 assert.equal(checks,1);
 assert.equal(result.reason,'repaired');
 assert.equal(result.employees.length,8);
 assert.deepEqual(result.missingIds,['emp-008']);
});

test('a verified actual PostgreSQL deletion is not silently recreated',async()=>{
 const before=employees(8);
 const repo={
  checkEmployeeDirectory:async()=>({centralIds:before.slice(0,7).map(x=>x.id),stillMissing:[]}),
  getAllVisibleGrouped:async()=>({employees:before.slice(0,7)})
 };
 const result=await reconcileUnexpectedEmployeeLoss(repo,before,before.slice(0,7));
 assert.equal(result.reason,'verified-server-absence');
 assert.equal(result.employees.length,7);
});

test('offline verification preserves last visible employees and other newly saved entries',async()=>{
 const before=employees(8);
 const repo={
  checkEmployeeDirectory:async()=>{throw Error('NETWORK_OFFLINE');},
  getAllVisibleGrouped:async()=>({employees:[] as Staff[]})
 };
 const result=await reconcileUnexpectedEmployeeLoss(repo,before,[
  ...before.slice(0,7),{id:'emp-009',name:'جديد'}
 ]);
 assert.equal(result.reason,'offline-retained');
 assert.equal(result.employees.length,9);
 assert.equal(result.employees.some(e=>e.id==='emp-008'),true);
});

test('an unresolved local employee tombstone never overwrites PostgreSQL in the repair path',async()=>{
 const before=employees(8);
 const repo={
  checkEmployeeDirectory:async()=>({
    centralIds:before.map(x=>x.id),stillMissing:[{id:'emp-008'}]
  }),
  getAllVisibleGrouped:async()=>({employees:before.slice(0,7)})
 };
 const result=await reconcileUnexpectedEmployeeLoss(repo,before,before.slice(0,7));
 assert.equal(result.reason,'pending-local-conflict');
 assert.equal(result.employees.length,8);
});
