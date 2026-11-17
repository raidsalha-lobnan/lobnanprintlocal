import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountStatementPdfFilename} from '../src/utils/accountStatementPdf';

const reports=readFileSync(new URL('../src/components/ReportsView.tsx',import.meta.url),'utf8');

test('Reports Center itself has a visible PDF button next to the report print button',()=>{
  const headerStart=reports.indexOf('مركز التقارير المحاسبية والتفصيلية');
  const button=reports.indexOf("<span>{serverPdfDownloading?'جاري إنشاء PDF...':'حفظ PDF مباشر'}</span>",headerStart);
  const print=reports.indexOf('<span>طباعة التقرير</span>',headerStart);
  assert.ok(headerStart>=0,'Must target the actual Reports Center');
  assert.ok(button>headerStart&&print>button,'Save PDF must be visible before Print button');
  assert.ok(reports.includes("activeReport==='customer_statement'"));
  assert.ok(reports.includes("activeReport==='supplier_statement'"));
  assert.ok(reports.includes("activeReport==='employee_statement'"));
});

test('Reports Center Save PDF downloads via authorized headless Chrome without opening print preview',()=>{
  assert.ok(reports.includes('await downloadServerOfficialStatementPdf({'));
  assert.ok(reports.includes('subPartyId=selectedSubCustomerId;'));
  assert.ok(reports.includes('subPartyId=selectedSubSupplierId;'));
  assert.ok(reports.includes('showImages:showStatementImageThumbnails'));
  assert.ok(reports.includes('showItemDetails:showStatementItemDetails'));
  assert.ok(!reports.includes('downloadAccountStatementPdf('),
    'Canvas snapshots cause Arabic corruption and missing images in long reports');
  assert.ok(reports.includes('const handlePrint = () => {'));
  assert.ok(reports.includes('window.print();'),'Original Print remains an independent fallback');
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
