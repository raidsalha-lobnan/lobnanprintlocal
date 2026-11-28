import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {saveTaxPrintRecord,readTaxPrintRecord,listTaxPrintRecords,type TaxPrintRecord} from '../src/services/taxPrintArchive';
test('print archive preserves full document without using accounting storage, rejects duplicate serials and stale edits',async()=>{
 const id=crypto.randomUUID();const serial=String(Date.now());
 const r={id,serial,createdAt:'2026-11-28',updatedAt:'2026-11-28',data:{serial,date:'2026-11-28',customer:'عميل',lines:[{item:'طباعة',qty:'2',price:'5',fontSize:30}],style:'playpen',applyStamp:true},stampData:'data:image/png;base64,AAA',totalCents:1000,renderedPng:new Blob(['test'],{type:'image/png'})} as TaxPrintRecord;
 await saveTaxPrintRecord(r);
 const saved=await readTaxPrintRecord(id);assert.deepEqual(saved?.data,r.data);assert.equal(saved?.stampData,r.stampData);assert.equal(saved?.renderedPng.size,4);
 assert.ok((await listTaxPrintRecords()).some(x=>x.id===id&&x.customer==='عميل'));
 await assert.rejects(saveTaxPrintRecord({...r,id:crypto.randomUUID()}),/ARCHIVE_SERIAL_EXISTS/);
 await assert.rejects(saveTaxPrintRecord({...r,updatedAt:'later'},'wrong'),/ARCHIVE_RECORD_CHANGED/);
 await saveTaxPrintRecord({...r,updatedAt:'later'},r.updatedAt);
 assert.equal((await readTaxPrintRecord(id))?.updatedAt,'later');
});
