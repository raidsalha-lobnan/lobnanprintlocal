import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('account transfer validation identifies the actual missing field',()=>{
 const s=readFileSync(new URL('../src/components/AccountTransferModal.tsx',import.meta.url),'utf8');
 assert.match(s,/if\(!reason\.trim\(\)\)\{setError\('البيان مطلوب:/);
 assert.match(s,/account-transfer-reason/);
 assert.match(s,/aria-required=\{!reverse\}/);
 assert.match(s,/if\(!source\.id\)\{setError/);
 assert.match(s,/if\(!target\.id\)\{setError/);
 assert.match(s,/if\(!validAmount\)\{setError/);
 assert.doesNotMatch(s,/اختر حسابين مختلفين وأدخل مبلغاً صحيحاً وبيان التحويل/);
});
