import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForStatementPrintPhotos} from '../src/utils/statementPrintReadiness';

test('ordinary old thumbnail-only invoices are still printable',async()=>{
 const old=(globalThis as any).document;
 try{
   (globalThis as any).document={
     querySelector:()=>null,
     querySelectorAll:()=>[]
   };
   assert.equal(await waitForStatementPrintPhotos(1),true);
 }finally{
   if(old===undefined)delete (globalThis as any).document;
   else (globalThis as any).document=old;
 }
});

test('browser printing refuses an incomplete uploaded original without consent',async()=>{
 const old=(globalThis as any).document;
 try{
   (globalThis as any).document={
     querySelector:(q:string)=>q.includes('original-expected')?{}:null,
     querySelectorAll:()=>[]
   };
   assert.equal(await waitForStatementPrintPhotos(1),false);
 }finally{
   if(old===undefined)delete (globalThis as any).document;
   else (globalThis as any).document=old;
 }
});
