import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../../public/telegram-pos.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../../public/telegram-pos.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../public/telegram-pos-v2.css',import.meta.url),'utf8');

test('cashier deletes unnecessary settlement status row and the entire footer line',()=>{
 assert.doesNotMatch(html,/id="paymentStatus"/);
 assert.doesNotMatch(js,/paymentStatus/);
 assert.doesNotMatch(html,/<footer(?:\s|>)/);
 assert.match(css,/main\{padding-bottom:14px\}/);
});
test('all four labels and numbers share one horizontal line on mobile',()=>{
 const row=html.match(/<div class="summary-row"[^>]*>([\s\S]*?)<\/div>\s*<div class="hidden">/);
 assert.ok(row,'summary row exists');
 const content=row[1];
 assert.match(content,/id="totalLabel"/);
 assert.match(content,/id="grand"/);
 assert.match(content,/id="discount"/);
 assert.match(content,/id="paidSummary"/);
 assert.match(content,/id="remainingSummary"/);
 assert.match(css,/#cashier \.summary-row\{display:flex;flex-wrap:nowrap;/);
 assert.match(css,/#cashier \.summary-field\{display:inline-flex;flex:1 0 auto;/);
 assert.match(css,/white-space:nowrap/);
 assert.match(css,/font-size:clamp\(9px,2\.5vw,12px\)/);
 assert.match(js,/el\('grand'\)\.textContent=format\(total\)/);
 assert.match(js,/el\('paidSummary'\)\.textContent=format\(paid\)/);
 assert.match(js,/el\('remainingSummary'\)\.textContent=format\(remaining\)/);
});
