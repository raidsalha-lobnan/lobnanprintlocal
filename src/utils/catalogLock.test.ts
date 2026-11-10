import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('existing inventory codes and category selectors are locked in the editor',()=>{
 const view=readFileSync(new URL('../components/InventoryView.tsx',import.meta.url),'utf8');
 const context=readFileSync(new URL('../context/AccountingContext.tsx',import.meta.url),'utf8');
 assert.match(view,/value=\{formCode\}[\s\S]{0,120}disabled=\{Boolean\(editingItem\)\}/);
 assert.match(view,/value=\{formCategory\}[\s\S]{0,120}disabled=\{Boolean\(editingItem\)\}/);
 assert.match(context,/category: _ignoredCategory/);
 assert.match(context,/code: existing\.code, category: existing\.category/);
});
test('categories management is view-only and no longer writes definitions',()=>{
 const modal=readFileSync(new URL('../components/ManageCategoriesModal.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(modal,/updateSettings\(/);
 assert.match(modal,/تصنيفات الأصناف/);
 assert.match(modal,/LockKeyhole/);
});
