import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('tax invoice tabs and output controls share a fixed bottom toolbar',()=>{
 const s=readFileSync(new URL('../src/components/TaxInvoicePrintView.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(s,/<header className="tax-print-header"/);
 const footer=s.slice(s.indexOf('<footer className="tax-editor-footer">'));
 assert.match(footer,/<nav className="tax-print-tabs">/);
 assert.match(footer,/tax-output-actions/);
 assert.match(footer,/onClick=\{reset\}/);
 assert.match(footer,/onClick=\{print\}/);
 assert.match(footer,/onClick=\{exportPdf\}/);
 assert.ok(s.indexOf('<footer className="tax-editor-footer">')>s.indexOf('tax-print-preview border'));
});
