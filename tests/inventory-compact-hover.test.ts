import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/components/InventoryView.tsx',import.meta.url),'utf8');
const sales=readFileSync(new URL('../src/components/InvoicesView.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
const row=source.slice(source.indexOf('<tr key={item.id}'),source.indexOf('</tr>',source.indexOf('<tr key={item.id}')));

test('inventory table keeps every filtered item on a single scrollable list',()=>{
  assert.match(source,/inventoryPageSize=viewMode==='table'\?Math\.max\(1,filteredItems\.length\):4/);
  assert.match(source,/data-testid="inventory-all-rows-scroll"/);
  assert.match(source,/overflow-auto overscroll-contain/);
  assert.match(source,/data-testid="inventory-all-items-count"/);
  assert.doesNotMatch(source,/fittingRows|setFittingRows/);
});

test('inventory matches the 30px invoice row height instead of the old 48px CSS override',()=>{
  assert.match(sales,/className="h-\[30px\] hover:bg-slate-50\/80/);
  assert.match(source,/inventory-one-row-table[^"]*\[&_td\]:h-\[30px\]/);
  assert.match(row,/className="h-\[30px\] whitespace-nowrap/);
  assert.match(css,/\.inventory-one-row-table tbody tr\s*\{[^}]*height:\s*30px/);
  assert.match(css,/\.inventory-one-row-table tbody td\s*\{[^}]*padding:\s*2px 8px/);
  assert.doesNotMatch(css,/\.inventory-one-row-table tbody tr\s*\{[^}]*height:\s*48px/);
});

test('same panel and header language as sales invoices, without changing inventory columns',()=>{
  assert.match(source,/data-testid="inventory-table-panel"/);
  assert.match(source,/rounded-lg border border-slate-200 bg-white shadow-xs/);
  assert.match(source,/sticky top-0 z-10 bg-slate-50 text-slate-700 font-bold/);
  assert.match(source,/>اسم الصنف \/ الخامة<\/th>/);
  assert.match(source,/>سعر الشراء<\/th>/);
  assert.match(source,/>سعر البيع<\/th>/);
  assert.match(source,/>الرصيد المتاح<\/th>/);
});

test('hover over the entire item row, not a thumbnail',()=>{
  assert.match(source,/if\(!item\.imageUrl\)return;/);
  assert.match(row,/onMouseEnter=\{event=>showItemImagePreview\(event,item\)\}/);
  assert.match(row,/onMouseLeave=\{\(\)=>setHoveredItemImage\(null\)\}/);
  assert.doesNotMatch(row,/<img\s/);
  assert.doesNotMatch(row,/<ImageIcon\s/);
  assert.match(source,/createPortal\(/);
  assert.match(source,/role="tooltip"/);
  assert.match(source,/document\.body/);
});
