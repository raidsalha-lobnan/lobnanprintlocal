import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountStatementPdfFilename,pdfStatementDate} from '../src/utils/accountStatementPdf';

test('principal and subsidiary customer appear without a subsidiary label in the suggested PDF filename',()=>{
 const filename=accountStatementPdfFilename({
   primaryName:'أحمد محمد',secondaryName:'محمد أحمد',
   fromDate:'2026-11-01',toDate:'2026-11-17',today:'2026-11-17'
 });
 assert.equal(filename,
   'كشف حساب تفصيلي - أحمد محمد - محمد أحمد - من 01-11-2026 إلى 17-11-2026.pdf');
 assert.equal(filename.includes('فرعي'),false);
});

test('main customer with no subsidiary shows only their name',()=>{
 const filename=accountStatementPdfFilename({
   primaryName:'أحمد محمد',fromDate:'2026-11-01',toDate:'2026-11-17',
   today:'2026-11-17'
 });
 assert.equal(filename,'كشف حساب تفصيلي - أحمد محمد - من 01-11-2026 إلى 17-11-2026.pdf');
});

test('unfiltered statements are named from the beginning of dealings through today',()=>{
 const filename=accountStatementPdfFilename({primaryName:'مكتبة لبنان',today:'2026-11-17'});
 assert.equal(filename,
   'كشف حساب تفصيلي - مكتبة لبنان - من بداية التعامل إلى 17-11-2026.pdf');
});

test('parent / subsidiary and forbidden Windows filename characters are safe',()=>{
 const filename=accountStatementPdfFilename({
   primaryName:'العائلة/أحمد:محمد',
   secondaryName:'الفرع\\الشرقي*',
   fromDate:'2026-11-01',toDate:'2026-11-17',today:'2026-11-17'
 });
 assert.equal(filename,
   'كشف حساب تفصيلي - العائلة أحمد محمد - الفرع الشرقي - من 01-11-2026 إلى 17-11-2026.pdf');
 assert.ok(!/[\\/:*?"<>|]/.test(filename));
});

test('employee accounts can use the same direct PDF button with their own label',()=>{
 const filename=accountStatementPdfFilename({
   primaryName:'علي حسين',kind:'employee',
   fromDate:'2026-11-15',toDate:'2026-11-17',today:'2026-11-17'
 });
 assert.equal(filename,
   'كشف مالي تفصيلي - علي حسين - من 15-11-2026 إلى 17-11-2026.pdf');
});

test('ISO date formatting and same-name redundancy are safe',()=>{
 assert.equal(pdfStatementDate('2026-11-17'),'17-11-2026');
 const name=accountStatementPdfFilename({
   primaryName:'سليم',secondaryName:'سليم',today:'2026-11-17'
 });
 assert.equal(name,
   'كشف حساب تفصيلي - سليم - من بداية التعامل إلى 17-11-2026.pdf');
});

test('PDF button uses actual existing report markup and direct blob download without printing',()=>{
 const component=readFileSync(
   new URL('../src/components/AccountStatementModal.tsx',import.meta.url),'utf8');
 const helper=readFileSync(
   new URL('../src/utils/accountStatementPdf.ts',import.meta.url),'utf8');
 assert.ok(component.includes('حفظ PDF'));
 assert.ok(component.includes('accountStatementPdfFilename({'));
 assert.ok(component.includes('downloadAccountStatementPdf(statementSurfaceRef.current,filename)'));
 assert.ok(component.includes('ref={statementSurfaceRef}'));
 assert.ok(helper.includes("captureOfficialPrintSurface(copy)"));
 assert.ok(helper.includes('anchor.download=safeName;'));
 assert.ok(!helper.includes('window.print()'));
 assert.ok(helper.includes('holder.remove()'));
});

test('PDF renderer supports Tailwind CSS4 color functions and keeps capture in the viewport',()=>{
 const capture=readFileSync(
   new URL('../src/utils/captureOfficialPrintSurface.ts',import.meta.url),'utf8');
 const helper=readFileSync(
   new URL('../src/utils/accountStatementPdf.ts',import.meta.url),'utf8');
 const pkg=JSON.parse(readFileSync(
   new URL('../package.json',import.meta.url),'utf8'));
 const lock=JSON.parse(readFileSync(
   new URL('../package-lock.json',import.meta.url),'utf8'));
 assert.equal(pkg.dependencies['html2canvas-pro'],'2.4.3');
 assert.equal(lock.packages[''].dependencies['html2canvas-pro'],'2.4.3');
 assert.equal(lock.packages['node_modules/html2canvas-pro'].version,'2.4.3');
 assert.ok(capture.includes("import html2canvas from 'html2canvas-pro'"));
 assert.ok(capture.includes('OFFICIAL_REPORT_EMPTY_CAPTURE'));
 assert.ok(helper.includes('position:fixed;left:0;top:0;width:794px'));
 assert.equal(helper.includes('left:-12000px;top:0;width:794px'),false);
 assert.ok(helper.includes("holder.dir='rtl'"));
 assert.ok(helper.includes("copy.dir='rtl'"));
});
