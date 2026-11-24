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
  assert.match(source,/<tr key=\{item\.id\} className="h-6 whitespace-nowrap/);
  assert.match(source,/sticky top-0 z-10 bg-slate-50/);
  assert.match(source,/h-\[18px\] w-\[18px\]/);
});

test('hover preview is restricted to items with images and displayed above scroll clipping',()=>{
  assert.match(source,/if\(!item\.imageUrl\)return;/);
  assert.match(source,/onMouseEnter=\{event=>showItemImagePreview\(event,item\)\}/);
  assert.match(source,/onMouseLeave=\{\(\)=>setHoveredItemImage\(null\)\}/);
  assert.match(source,/createPortal\(/);
  assert.match(source,/role="tooltip"/);
  assert.match(source,/pointer-events-none fixed z-\[400\]/);
  assert.match(source,/object-contain/);
  assert.match(source,/document\.body/);
});
