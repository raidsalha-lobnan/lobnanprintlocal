import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountStatementPdfFilename,pdfStatementDate,explainStatementPdfError} from '../src/utils/accountStatementPdf';

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

test('Modal Save PDF directly downloads via the authorized Chrome report endpoint without print preview',()=>{
 const component=readFileSync(
   new URL('../src/components/AccountStatementModal.tsx',import.meta.url),'utf8');
 const helper=readFileSync(
   new URL('../src/utils/serverOfficialStatementPdf.ts',import.meta.url),'utf8');
 assert.ok(component.includes('حفظ PDF مباشر'));
 assert.ok(component.includes('accountStatementPdfFilename({'));
 assert.ok(component.includes('await downloadServerOfficialStatementPdf({'));
 assert.ok(component.includes('showImages:showImageThumbnailsInStatement'));
 assert.ok(component.includes('const handlePrint = () => {'));
 assert.ok(component.includes('window.print()'),'Normal A4 printing must remain available');
 assert.ok(!component.includes('downloadAccountStatementPdf('));
 assert.ok(helper.includes('/api/v1/reports/official-pdf'));
 assert.ok(helper.includes("anchor.download=filename"));
 assert.ok(!helper.includes("window.print()"));
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
 assert.ok(helper.includes('position:fixed;left:0;top:0;width:748px'));
 assert.equal(helper.includes('left:-12000px;top:0;width:794px'),false);
 assert.ok(helper.includes("holder.dir='rtl'"));
 assert.ok(helper.includes("copy.dir='rtl'"));
 assert.ok(helper.includes('scopedStatementPrintCss()'));
 assert.ok(helper.includes('copyLoadedReportImages(report,copy)'));
 assert.ok(helper.includes("copy.dataset.statementPdf='true'"));
 assert.ok(helper.includes('STATEMENT_PDF_IMAGE_CORS_BLOCKED'));
 assert.ok(helper.includes('STATEMENT_PDF_IMAGE_UNAVAILABLE'));

});

test('PDF export never silently saves a report with missing letterhead or thumbnails',()=>{
 const helper=readFileSync(new URL('../src/utils/accountStatementPdf.ts',import.meta.url),'utf8');
 assert.ok(helper.includes('copyLoadedReportImages(report,copy)'));
 assert.ok(helper.includes('image.naturalWidth<1'));
 assert.ok(helper.includes('context.drawImage(image'));
 assert.ok(helper.includes('bitmap.toDataURL'));
 assert.ok(helper.includes('clone.decode()'));
 assert.ok(helper.includes('scopedStatementPrintCss()'));
 assert.ok(helper.includes('copy.dataset.statementPdf'));
 const message=explainStatementPdfError(new Error('STATEMENT_PDF_IMAGE_CORS_BLOCKED'));
 assert.ok(message.includes('صور'));
 assert.ok(message.includes('طباعة التقرير'));
});

test('PDF pagination keeps invoice title attached to the next item/photo row when it fits',()=>{
 const capture=readFileSync(new URL('../src/utils/captureOfficialPrintSurface.ts',import.meta.url),'utf8');
 assert.ok(capture.includes('statement-invoice-title'));
 assert.ok(capture.includes("row.classList.contains('invoice-heading')"));
 assert.ok(capture.includes('majorBreaks'));
 assert.ok(capture.includes('minorBreaks'));
 assert.ok(capture.includes('if(completed)end=completed'));
});
