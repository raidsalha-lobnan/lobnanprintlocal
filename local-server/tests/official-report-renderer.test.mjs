import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateOfficialReportPdf} from '../official-report-renderer.mjs';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const fixtureRows=[
 // Deleted legacy print orders remain as JSON null tombstones in the real database.
 {entity:'printOrders',record_id:'deleted-order-1',value:null},
 {entity:'inventory',record_id:'deleted-item-1',value:null},
 {entity:'settings',record_id:'global',value:{businessName:'Preview Only',currency:'ILS'}},
 {entity:'parties',record_id:'customer-1',value:{
  id:'customer-1',code:'CUST-0002',name:'Test Customer',type:'customer',balance:0,openingBalance:0
 }}
];
const pool={connect:async()=>({
 query:async sql=>{
  if(sql.startsWith('SELECT entity,record_id,value'))return {rows:fixtureRows};
  if(sql.startsWith('BEGIN')||sql.startsWith('COMMIT')||sql.startsWith('ROLLBACK'))return {rows:[]};
  throw Error('UNEXPECTED_READ_ONLY_REPORT_SQL');
 },release:()=>{}
})};
const access={can:()=>true,canRead:()=>true};
test('Official customer statement uses original React report template and creates valid standalone PDF',
 {skip:process.platform!=='win32'||!fs.existsSync(chrome)},async()=>{
 const report=await generateOfficialReportPdf({
  pool,workspace:'lobnan_main',access,type:'customer_statement',
  partyId:'customer-1',fromDate:'2026-11-01',toDate:'2026-11-14'
 });
 assert.equal(report.pdf.toString('ascii',0,5),'%PDF-');
 assert.ok(report.pdf.length>2000);
 assert.match(report.filename,/customer_statement/);
});
test('Official sales register HTML is exported without opening browser accounting dashboard',
 {skip:process.platform!=='win32'||!fs.existsSync(chrome)},async()=>{
 const report=await generateOfficialReportPdf({
  pool,workspace:'lobnan_main',access,type:'sales_report',
  fromDate:'2026-11-01',toDate:'2026-11-14'
 });
 assert.equal(report.pdf.toString('ascii',0,5),'%PDF-');
 assert.ok(report.pdf.length>2000);
 assert.match(report.filename,/sales_report/);
});
test('Missing or unauthorized customer is rejected before any PDF generation',async()=>{
 await assert.rejects(generateOfficialReportPdf({
  pool,workspace:'lobnan_main',access,type:'customer_statement',partyId:'unknown'
 }),/OFFICIAL_REPORT_PARTY_NOT_AUTHORIZED/);
});
test('Security gate denies official PDF generation without accounting privilege',async()=>{
 await assert.rejects(generateOfficialReportPdf({
  pool,workspace:'lobnan_main',access:{can:key=>key==='view',canRead:()=>true},
  type:'inventory_report'
 }),/OFFICIAL_REPORT_PERMISSION_DENIED/);
});
