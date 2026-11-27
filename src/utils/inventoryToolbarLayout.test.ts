import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const view=readFileSync(new URL('../components/InventoryView.tsx',import.meta.url),'utf8');
const toolbar=view.slice(
  view.indexOf('{/* Single-line accounting totals'),
  view.indexOf('{/* Inventory Items Display: Cards Grid or Table View */}')
);

test('inventory summary preserves all four live KPI calculations and low-stock action',()=>{
  assert.match(toolbar,/totalCostValue\.toLocaleString/);
  assert.match(toolbar,/totalSaleValue\.toLocaleString/);
  assert.match(toolbar,/rawMaterialsValue\.toLocaleString/);
  assert.match(toolbar,/lowStockCount/);
  assert.match(toolbar,/onClick=\{\(\)\s*=>\s*handleOpenStockCard\(undefined,\s*'alerts'\)\}/);
  assert.match(toolbar,/grid-cols-4/);
});

test('search, category and warehouse controls are grouped with connected state',()=>{
  assert.match(toolbar,/id="inventory-list-search"/);
  assert.match(toolbar,/value=\{searchQuery\}/);
  assert.match(toolbar,/onChange=\{e\s*=>\s*setSearchQuery\(e\.target\.value\)\}/);
  assert.match(toolbar,/id="inventory-list-category"/);
  assert.match(toolbar,/value=\{categoryFilter\}/);
  assert.match(toolbar,/categoryFilterOptions\.map/);
  assert.match(toolbar,/id="inventory-list-warehouse"/);
  assert.match(toolbar,/value=\{selectedWarehouseFilter\}/);
  assert.match(toolbar,/warehouses\.map/);
});

test('quick filters, view switch and currency continue to use prior handlers',()=>{
  assert.match(toolbar,/setFilterOnlyFavorites\(prev\s*=>\s*!prev\)/);
  assert.match(toolbar,/setFilterOnlyLowStock\(prev\s*=>\s*!prev\)/);
  assert.match(toolbar,/setViewMode\('table'\)/);
  assert.match(toolbar,/setViewMode\('cards'\)/);
  assert.match(toolbar,/setSelectedCurrencyCode\(e\.target\.value\)/);
  assert.match(toolbar,/setDailyExchangeRate/);
  assert.match(toolbar,/مسح التصفية/);
});

test('all existing inventory actions remain wired up',()=>{
  assert.match(toolbar,/handleOpenAdd\(\)/);
  assert.match(toolbar,/setShowCategoriesModal\(true\)/);
  assert.match(toolbar,/handleOpenStockCard\(undefined,\s*'card'\)/);
  assert.match(toolbar,/setActiveTab\('warehouses'\)/);
  assert.match(toolbar,/handleOpenBarcodeBank\(\)/);
  assert.match(toolbar,/setShowBarcodeScanner/);
});
