import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../../public/telegram-pos.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../../public/telegram-pos.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../public/telegram-pos-v2.css',import.meta.url),'utf8');
const h=(id)=>[...html.matchAll(new RegExp('id="'+id+'"','g'))].length;
test('party type, searchable selected party, add and optional sub toggle are one row',()=>{
 const block=html.match(/<div class="invoice-party one-line-party">([\s\S]*?)<\/div>\s*<div id="subCustomerArea"/);
 assert.ok(block,'single-line party picker');
 for(const id of ['partyType','customerSearch','customer','partyResults','addCustomerButton','subCustomerToggle'])
  assert.equal(h(id),1,'unique '+id);
 assert.match(block[1],/id="partyType"/);
 assert.match(block[1],/id="customerSearch"/);
 assert.match(block[1],/id="subCustomerToggle"/);
 assert.match(html,/id="customer" class="hidden"/);
 assert.match(html,/id="subCustomerArea" class="party-subrow hidden"/);
 assert.match(js,/el\('customerSearch'\)\.value=person\?\.name\|\|''/);
 assert.match(js,/el\('customer'\)\.value=person\.id/);
 assert.match(js,/state\.subOpen=false/);
 assert.match(js,/el\('subCustomerToggle'\)\.addEventListener\('click'/);
 assert.match(js,/state\.subOpen&&state\.partyType==='customer'/);
 assert.match(css,/#cashier \.one-line-party\{[^}]*grid-template-columns:/);
});
test('each item has notes and dimensions by its name; add appears only on last line',()=>{
 assert.equal(h('itemSearch'),1);
 assert.equal(h('results'),1);
 assert.equal(h('emptyItemAdd'),1);
 assert.match(html,/id="itemPicker" class="item-picker hidden"/);
 assert.ok(html.indexOf('id="items"')<html.indexOf('class="item-search-row"'),
  'search input is below the items inside the on-demand picker');
 assert.match(js,/index===state\.lines\.length-1\?'<button type="button" class="line-add" data-add-line="true"/);
 assert.match(js,/data-prop="hasDimensions"/);
 assert.match(js,/class="line-notes"/);
 assert.match(js,/openItemPicker/);
 assert.match(js,/el\('items'\)\.addEventListener\('click'/);
 assert.match(js,/const add=event\.target\.closest\('\[data-add-line\]'\)/);
 assert.match(js,/closeItemPicker\(\);\s*renderLines\(\)/);
 assert.match(css,/#cashier \.line-tools\{display:inline-flex/);
});
test('cash amount, bank amount and selected noncash treasury all fit one payment row',()=>{
 const block=html.match(/<div class="payment-inline">([\s\S]*?)<\/div>/);
 assert.ok(block);
 for(const id of ['cashPaid','bankPaid','bankTreasury'])assert.ok(block[1].includes('id="'+id+'"'));
 assert.match(html,/id="cashTreasury" type="hidden"/);
 assert.match(css,/#cashier \.payment-inline\{\s*display:grid;\s*grid-template-columns:/);
 assert.match(js,/const nonCashOptions=state\.treasuries\.filter\(t=>t\.type!=='cash_box'/);
 assert.match(js,/t\.accountCode!=='CASH-1101'/);
 assert.match(js,/bankTreasuryCode:bankLeg>0\?el\('bankTreasury'\)\.value:''/);
 assert.match(html,/id="paymentNotes"/);
 assert.doesNotMatch(html,/<label for="paymentNotes">/);
});
test('compact notes, accurate financial body, existing totals and actions are preserved',()=>{
 assert.match(html,/id="notes"/);
 assert.doesNotMatch(html,/<label for="notes">/);
 for(const id of ['grand','discount','paidSummary','remainingSummary','saveButton','draftButton'])
  assert.equal(h(id),1);
 assert.match(js,/documentType:state\.kind/);
 assert.match(js,/counterpartyKind:state\.partyType/);
 assert.match(js,/notes:el\('notes'\)\.value,paymentNotes:el\('paymentNotes'\)\.value/);
 assert.match(js,/notes:l\.notes/);
 assert.match(html,/telegram-pos-v2\.css\?v=compact-unified-20261114/);
 assert.match(html,/telegram-pos\.js\?v=compact-unified-20261114/);
});
