import test from 'node:test';
import assert from 'node:assert/strict';
import {printStatementWithNativeBrowser} from '../src/utils/nativeStatementPrint';
import {accountStatementPdfFilename} from '../src/utils/accountStatementPdf';

test('Chrome sees the full Arabic customer filename when native print opens, then title restores',()=>{
 const originalDoc=(globalThis as any).document;
 const originalWindow=(globalThis as any).window;
 const listeners=new Map<string,Function>();
 const documentMock={title:'برنامج محاسبة - مطبعة لبنان'};
 const actualFilename=accountStatementPdfFilename({
   primaryName:'زبون نقدي',secondaryName:'الجمعية الإسلامية - مدينة سبت لأها',
   fromDate:'2026-11-01',toDate:'2026-11-17',today:'2026-11-17'
 });
 let printedTitle='';
 let printCalls=0;
 try{
   (globalThis as any).document=documentMock;
   (globalThis as any).window={
     addEventListener:(key:string,fn:Function)=>listeners.set(key,fn),
     removeEventListener:(key:string,fn:Function)=>{
       if(listeners.get(key)===fn)listeners.delete(key);
     }
   };
   printStatementWithNativeBrowser(actualFilename,()=>{
     printCalls++;
     printedTitle=documentMock.title;
   });
   assert.equal(printCalls,1);
   assert.equal(printedTitle,actualFilename.replace(/\.pdf$/,''));
   assert.equal(documentMock.title,printedTitle,'Keep the filename during Chrome print preview');
   listeners.get('afterprint')?.();
   assert.equal(documentMock.title,'برنامج محاسبة - مطبعة لبنان');
   assert.equal(listeners.has('afterprint'),false);
 }finally{
   if(originalDoc===undefined)delete (globalThis as any).document;
   else (globalThis as any).document=originalDoc;
   if(originalWindow===undefined)delete (globalThis as any).window;
   else (globalThis as any).window=originalWindow;
 }
});

test('failed native print immediately restores the application title',()=>{
 const originalDoc=(globalThis as any).document;
 const originalWindow=(globalThis as any).window;
 const listeners=new Map<string,Function>();
 const documentMock={title:'برنامج محاسبة'};
 try{
   (globalThis as any).document=documentMock;
   (globalThis as any).window={
     addEventListener:(key:string,fn:Function)=>listeners.set(key,fn),
     removeEventListener:(key:string)=>listeners.delete(key)
   };
   assert.throws(()=>printStatementWithNativeBrowser('كشف حساب.pdf',()=>{
     throw new Error('PRINT_PERMISSION_DENIED');
   }),/PRINT_PERMISSION_DENIED/);
   assert.equal(documentMock.title,'برنامج محاسبة');
   assert.equal(listeners.has('afterprint'),false);
 }finally{
   if(originalDoc===undefined)delete (globalThis as any).document;
   else (globalThis as any).document=originalDoc;
   if(originalWindow===undefined)delete (globalThis as any).window;
   else (globalThis as any).window=originalWindow;
 }
});

test('print callback stays synchronous with the button press and requires a filename',()=>{
 const originalDoc=(globalThis as any).document;
 const originalWindow=(globalThis as any).window;
 try{
   (globalThis as any).document={title:'Title'};
   (globalThis as any).window={
     addEventListener:()=>{},removeEventListener:()=>{}
   };
   let fired=false;
   printStatementWithNativeBrowser('تفصيلي.pdf',()=>{fired=true;});
   assert.equal(fired,true);
   assert.throws(()=>printStatementWithNativeBrowser('.pdf',()=>{}),
     /STATEMENT_PDF_FILENAME_REQUIRED/);
 }finally{
   if(originalDoc===undefined)delete (globalThis as any).document;
   else (globalThis as any).document=originalDoc;
   if(originalWindow===undefined)delete (globalThis as any).window;
   else (globalThis as any).window=originalWindow;
 }
});
