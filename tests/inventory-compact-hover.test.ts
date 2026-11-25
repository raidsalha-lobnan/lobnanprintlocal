import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/components/InventoryView.tsx',import.meta.url),'utf8');

test('table shows every filtered inventory item without pagination and scrolls internally',()=>{
  assert.match(source,/inventoryPageSize=viewMode==='table'\?Math\.max\(1,filteredItems\.length\):4/);
  assert.match(source,/visibleItems=useMemo\(\(\)=>filteredItems\.slice\(/);
  assert.match(source,/data-testid="inventory-all-rows-scroll"/);
  assert.match(source,/overflow-auto overscroll-contain/);
  assert.match(source,/viewMode === 'cards' \? \(<nav/);
  assert.match(source,/data-testid="inventory-all-items-count"/);
  assert.doesNotMatch(source,/fittingRows|setFittingRows/);
});

test('compact table keeps one horizontal line with smaller 24px rows and sticky headings',()=>{
  assert.match(source,/inventory-one-row-table[^"]*\[&_td\]:h-6/);
  assert.match(source,/<tr key=\{item\.id\}[\s\S]*?className="h-6 whitespace-nowrap/);
  assert.match(source,/sticky top-0 z-10 bg-slate-50/);
  const row=source.slice(source.indexOf('<tr key={item.id}'),source.indexOf('</tr>',source.indexOf('<tr key={item.id}')));
  assert.doesNotMatch(row,/h-\[18px\] w-\[18px\]/);
  assert.doesNotMatch(row,/<img\s/);
  assert.doesNotMatch(row,/<ImageIcon\s/);
});

test('hover preview is restricted to items with images and displayed above scroll clipping',()=>{
  assert.match(source,/if\(!item\.imageUrl\)return;/);
  const row=source.slice(source.indexOf('<tr key={item.id}'),source.indexOf('</tr>',source.indexOf('<tr key={item.id}')));
  assert.match(row,/onMouseEnter=\{event=>showItemImagePreview\(event,item\)\}/);
  assert.match(row,/onMouseLeave=\{\(\)=>setHoveredItemImage\(null\)\}/);
  assert.doesNotMatch(row,/<td onMouseEnter/);
  assert.doesNotMatch(row,/<img\s/);
  assert.match(source,/event\.clientY/);
  assert.match(source,/event\.clientX/);
  assert.match(source,/createPortal\(/);
  assert.match(source,/role="tooltip"/);
  assert.match(source,/pointer-events-none fixed z-\[400\]/);
  assert.match(source,/object-contain/);
  assert.match(source,/document\.body/);
});
