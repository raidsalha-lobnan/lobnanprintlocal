import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {renderReport,renderSalesReport} from './report-ssr.compiled.mjs';
import {settingsVisibleToUser} from './workspace-settings-public.mjs';

const supported=new Set(['sales_report','customer_statement','supplier_statement','customer_items',
 'treasuries_movement','purchases_report','inventory_report','expenses_report',
 'employee_statement']);
const entities=['accounts','settings','invoices','salesReturns','purchases','purchaseReturns',
 'vouchers','printOrders','parties','inventory','employees','payrollSheets','treasuries',
 'journalEntries','currencies','employeeAdvances','employeeDeductions',
 'employeeIncentives','debtClearings','expenses'];
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const project=path.resolve(import.meta.dirname,'..');
const outputCss=path.join(import.meta.dirname,'report-styles.css');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function runChrome(htmlPath,pdfPath,virtualTime=2500){
 const args=['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--disable-background-networking','--allow-file-access-from-files',
  '--user-data-dir='+path.join(path.dirname(htmlPath),'chrome-private-profile'),
  '--virtual-time-budget='+virtualTime,'--print-to-pdf='+pdfPath,'--no-pdf-header-footer',
  'file:///'+htmlPath.replaceAll('\\','/')];
 await new Promise((resolve,reject)=>{
  const p=spawn(chrome,args,{windowsHide:true,stdio:'ignore'});
  const timer=setTimeout(()=>{p.kill();reject(new Error('OFFICIAL_REPORT_CHROME_TIMEOUT'));},70000);
  p.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('OFFICIAL_REPORT_CHROME_EXIT_'+code))});
  p.once('error',error=>{clearTimeout(timer);reject(new Error('OFFICIAL_REPORT_CHROME_UNAVAILABLE'))});
 });
}
async function settingsAndRecords(pool,workspace,access){
 const client=await pool.connect();
 try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const r=await client.query('SELECT entity,record_id,value FROM sync_records WHERE workspace=$1 AND entity=ANY($2::text[])',[workspace,entities]);
  const snapshot=Object.fromEntries(entities.filter(k=>k!=='settings').map(k=>[k,[]]));
  let settings={};
  for(const record of r.rows){
   const {entity,record_id:id,value}=record;
   if(entity==='settings'){
    if(['global','workspace-settings'].includes(id))settings=settingsVisibleToUser(value,access);
    continue;
   }
   if(access.canRead(entity,value,id))snapshot[entity].push(value);
  }
  snapshot.settings=settings;
  await client.query('COMMIT');
  return snapshot;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
 finally{client.release();}
}
export async function generateOfficialReportPdf({pool,workspace,access,type,partyId,employeeId,fromDate,toDate}){
 if(!supported.has(type))throw new Error('OFFICIAL_REPORT_TYPE_UNSUPPORTED');
 if(!access?.can('view')||!access.can('view_accounting'))
  throw new Error('OFFICIAL_REPORT_PERMISSION_DENIED');
 if((fromDate&&!/^\d{4}-\d{2}-\d{2}$/.test(fromDate))||
    (toDate&&!/^\d{4}-\d{2}-\d{2}$/.test(toDate))||
    (fromDate&&toDate&&fromDate>toDate))
  throw new Error('OFFICIAL_REPORT_INVALID_PERIOD');
 const snapshot=await settingsAndRecords(pool,workspace,access);
 if(['customer_statement','supplier_statement','customer_items'].includes(type)){
  const party=snapshot.parties.find(p=>p.id===partyId);
  if(!party)throw new Error('OFFICIAL_REPORT_PARTY_NOT_AUTHORIZED');
  if(type==='supplier_statement'&&party.type!=='supplier'&&party.type!=='both')
   throw new Error('OFFICIAL_REPORT_PARTY_INVALID_TYPE');
  if(type!=='supplier_statement'&&!['customer','both'].includes(party.type))
   throw new Error('OFFICIAL_REPORT_PARTY_INVALID_TYPE');
 }
 if(type==='employee_statement'&&!snapshot.employees.some(p=>p.id===employeeId))
  throw new Error('OFFICIAL_REPORT_EMPLOYEE_NOT_AUTHORIZED');
 const result=type==='sales_report'
  ?{html:renderSalesReport(snapshot,{fromDate,toDate,periodLabel:fromDate||toDate?(fromDate||'')+' - '+(toDate||''):'كامل الفترة'}),hasReport:true}
  :renderReport(snapshot,{type,partyId,employeeId,fromDate,toDate});
 if(!result.hasReport)throw new Error('OFFICIAL_REPORT_MARKUP_NOT_FOUND');
 const css=await fs.readFile(outputCss,'utf8').catch(()=>{throw new Error('OFFICIAL_REPORT_STYLESHEET_MISSING')});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobnan-official-report-'));
 const htmlPath=path.join(dir,'report.html'),pdfPath=path.join(dir,'report.pdf');
 try{
  const document=type==='sales_report'?result.html:`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>${css}</style>
   <style>@page{size:A4 portrait;margin:6mm}html,body{background:#fff!important;color:#111!important;margin:0!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
   .report-a4-container{box-shadow:none!important;max-width:none!important;width:100%!important;margin:0!important;padding:0!important;break-inside:auto!important}
   img{max-width:100%}</style></head><body><main id="reportRoot">${result.html}</main>
   <script>const report=document.querySelector('.report-a4-container');
     if(report){document.body.replaceChildren(report);document.documentElement.dataset.printReady='true';}</script></body></html>`;
  await fs.writeFile(htmlPath,document,'utf8');
  await runChrome(htmlPath,pdfPath,type==='sales_report'?12000:2500);
  const pdf=await fs.readFile(pdfPath);
  if(pdf.length<500||pdf.length>20_000_000||pdf.toString('ascii',0,5)!=='%PDF-')
    throw new Error('OFFICIAL_REPORT_PDF_INVALID');
  return {pdf,filename:type+'_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf'};
 }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
