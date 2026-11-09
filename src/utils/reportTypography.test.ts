import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPORT_TYPOGRAPHY_CSS } from './reportTypography';

test('report print windows use Helvetica Roman and Bold with a safe fallback', () => {
  assert.match(REPORT_TYPOGRAPHY_CSS, /HelveticaNeueLTArabic-Roman/);
  assert.match(REPORT_TYPOGRAPHY_CSS, /HelveticaNeueLTArabic-Bold/);
  assert.match(REPORT_TYPOGRAPHY_CSS, /IBM Plex Sans Arabic/);
  assert.match(REPORT_TYPOGRAPHY_CSS, /th,button,b,strong\{font-weight:700/);
  assert.doesNotMatch(REPORT_TYPOGRAPHY_CSS, /url\(/);
});

test('global typography uses Roman for data and Bold for headings', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url),'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url),'utf8');
  assert.match(css, /--accounting-font-family/);
  assert.match(css, /font-weight: 400 !important/);
  assert.match(css, /font-weight: 700 !important/);
  assert.doesNotMatch(html, /font-weight: 600 !important/);
});

test('all independent list and invoice reports apply shared typography', () => {
  for (const name of ['customerPeriodReport.ts','otherPartyPeriodReports.ts','printDetailedSalesInvoiceRegister.ts']) {
    const source = readFileSync(new URL(name, import.meta.url),'utf8');
    assert.match(source,/REPORT_TYPOGRAPHY_CSS/);
  }
});