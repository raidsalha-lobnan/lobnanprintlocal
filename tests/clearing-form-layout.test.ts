import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('transfer modal has a compact viewport-safe layout and independent footer',()=>{
 const s=readFileSync(new URL('../src/components/AccountTransferModal.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/components/AccountTransferModal.css',import.meta.url),'utf8');
 assert.match(s,/data-no-modal-expand className="account-transfer-form/);
 assert.match(s,/createPortal\(/);
 assert.match(s,/transfer-amount-row/);
 assert.match(s,/transfer-description-row/);
 assert.match(s,/transfer-footer/);
 assert.match(css,/\.account-transfer-form \.transfer-footer\{flex:none/);
 assert.match(css,/\.account-transfer-form \.transfer-body\{[^}]*overflow:auto/);
 assert.match(css,/max-width:480px/);
 for(const action of ['save','print','pdf'])assert.ok(s.includes('data-clearing-action="'+action+'"'));
});