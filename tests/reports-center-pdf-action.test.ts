import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountStatementPdfFilename} from '../src/utils/accountStatementPdf';

const reports=readFileSync(new URL('../src/components/ReportsView.tsx',import.meta.url),'utf8');

test('Reports Center itself has a visible PDF button next to the report print button',()=>{
  const headerStart=reports.indexOf('مركز التقارير المحاسبية والتفصيلية');
  const button=reports.indexOf('<span>حفظ PDF عبر Chrome</span>',headerStart);
  const print=reports.indexOf('<span>طباعة التقرير</span>',headerStart);
  assert.ok(headerStart>=0,'Must target the actual Reports Center');
  assert.ok(button>headerStart&&print>button,'Save PDF must be visible before Print button');
  assert.ok(reports.includes("activeReport==='customer_statement'"));
  assert.ok(reports.includes("activeReport==='supplier_statement'"));
  assert.ok(reports.includes("activeReport==='employee_statement'"));
});

test('Reports Center PDF uses the EXACT original browser print path for bidi text and images',()=>{
  assert.ok(reports.includes('printStatementWithNativeBrowser(filename,handlePrint);'));
  assert.ok(reports.includes('const handlePrint = () => {'));
  assert.ok(reports.includes('window.print();'));
  assert.ok(!reports.includes('downloadAccountStatementPdf('),
    'Old canvas snapshots cause RTL corruption and missing photos in long reports');
  assert.ok(reports.includes('Save as PDF'),
    'The browser printer selection remains under the operator control');
});

test('Customer PDF includes main then selected child customer name without adding فرعي',()=>{
  assert.ok(reports.includes('primaryName:customerStatementData.party.name,'));
  assert.ok(reports.includes('secondaryName:selectedSubCustObj?.name,'));
  assert.equal(accountStatementPdfFilename({
    primaryName:'زبون نقدي',secondaryName:'أحمد محمد',fromDate:'2026-11-01',
    toDate:'2026-11-17',today:'2026-11-17'
  }),'كشف حساب تفصيلي - زبون نقدي - أحمد محمد - من 01-11-2026 إلى 17-11-2026.pdf');
});

test('No secondary name appears when all subcustomers are shown',()=>{
  assert.equal(accountStatementPdfFilename({
    primaryName:'زبون نقدي',today:'2026-11-17'
  }),'كشف حساب تفصيلي - زبون نقدي - من بداية التعامل إلى 17-11-2026.pdf');
});

test('Supplier and employee detailed statements reuse the same PDF export',()=>{
  assert.ok(reports.includes('primaryName:supplierStatementData.party.name,'));
  assert.ok(reports.includes('secondaryName:selectedSubSuppObj?.name,'));
  assert.ok(reports.includes("kind:'employee'"));
});
