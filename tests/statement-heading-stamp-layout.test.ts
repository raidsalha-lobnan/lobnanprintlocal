import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const document = readFileSync(new URL('../src/components/UnifiedPartyStatementDocument.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('invoice header row has dark print shading with readable white text', () => {
  assert.match(document, /statement-invoice-title font-bold/);
  assert.match(css, /tr\.statement-invoice-title[\s\S]*?background-color:\s*#315779\s*!important/);
  assert.match(css, /tr\.statement-invoice-title[\s\S]*?color:\s*#ffffff\s*!important/);
  assert.match(css, /-webkit-print-color-adjust:\s*exact\s*!important/);
});

test('customer stamp is on the left with label beneath the stamped ink area', () => {
  const start = document.indexOf('statement-stamp-only flex justify-start');
  const end = document.indexOf('Official Signatures Section', start);
  assert.ok(start > 0 && end > start, 'customer stamp section missing');
  const section = document.slice(start, end);
  assert.match(section, /dir="ltr"/);
  assert.match(section, /absolute inset-x-0 bottom-\[0\.85cm\]/);
  assert.match(section, /الختم والتوقيع/);
  assert.match(section, /OfficialStamp size="3\.5cm"/);
  assert.doesNotMatch(section, /الختم والتوقيع المعتمد/);
});
