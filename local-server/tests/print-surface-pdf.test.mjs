import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInertPrintHtml} from '../print-surface-pdf.mjs';
const node=(tag,attrs={},children=[])=>({tag,attrs,children});
const payload=children=>({tree:node('body',{'data-lobnan-pdf-active':'true'},children),css:'@page invoice { size: A4 landscape; margin: 0; }',htmlAttrs:{dir:'rtl'}});
test('original CSS, Arabic, inline styles and live control values survive',()=>{
 const html=buildInertPrintHtml(payload([node('section',{class:'sales-invoice-landscape',style:'padding:6mm',onclick:'bad()'},['فاتورة INV-0697',node('input',{value:'240.00'}),node('img',{src:'data:image/png;base64,AAAA'})])]));
 assert.match(html,/A4 landscape/);assert.match(html,/فاتورة INV-0697/);assert.match(html,/padding:6mm/);assert.match(html,/value="240.00"/);assert.match(html,/data:image\/png;base64,AAAA/);assert.doesNotMatch(html,/onclick/);
});
test('reject executable markup, remote images, and local files',()=>{
 for(const child of [node('script',{},['bad()']),node('iframe'),node('img',{src:'https://example.com/a.png'}),node('img',{src:'file:///C:/secret'})])assert.throws(()=>buildInertPrintHtml(payload([child])));
 assert.throws(()=>buildInertPrintHtml({...payload([]),css:'</style><script>bad()</script>'}));
 const html=buildInertPrintHtml(payload(['<script>bad()</script>']));
 assert.match(html,/&lt;script&gt;/);assert.match(html,/script-src 'none'/);
});
