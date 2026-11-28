import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CLEARING_PRINT_CSS,CLEARING_PREVIEW_CSS} from '../src/utils/clearingPrintDocument';
test('clearing preview opts out of global modal sizing and measures paper inside a scroll viewport',()=>{
 const s=readFileSync(new URL('../src/components/DebtClearingView.tsx',import.meta.url),'utf8');
 assert.match(s,/role="dialog"[^>]*data-no-modal-expand/);
 assert.match(s,/ref=\{viewportRef\} className="clearing-preview-viewport"/);
 assert.match(s,/ref=\{paperRef\} id="clearing-print-document"/);
 assert.match(s,/Math.min\(1,widthFit,heightFit\)/);
 assert.match(s,/ResizeObserver/);
 assert.match(CLEARING_PREVIEW_CSS,/overflow:auto/);
 assert.match(CLEARING_PREVIEW_CSS,/@media print[\s\S]*zoom:1!important/);
 assert.match(CLEARING_PREVIEW_CSS,/@page clearingA4\{size:A4 portrait/);
});
test('stamp remains inside the reserved signature section',()=>{
 assert.match(CLEARING_PRINT_CSS,/min-height:43mm/);
 assert.match(CLEARING_PRINT_CSS,/\.clr-sign \.clr-stamp\{position:absolute;top:5mm/);
 assert.doesNotMatch(CLEARING_PRINT_CSS,/\.clr-sign div\{/);
});
