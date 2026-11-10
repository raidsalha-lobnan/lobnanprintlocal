import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const view=readFileSync(new URL('../components/InvoicesView.tsx',import.meta.url),'utf8');
const marker='      {/* One compact, responsive sales register command bar. */}';
const tableMarker='      {/* Invoices Table - Single line per invoice */}';
const start=view.indexOf(marker);
const end=view.indexOf(tableMarker);
assert.ok(start>=0 && end>start,'Sale invoice register toolbar boundaries must exist');
const toolbar=view.slice(start,end);
const table=view.slice(end);

test('remove screenshot cascade banner and non-operational 100% posting claim',()=>{
  assert.doesNotMatch(view,/Single Entry Cascading Flow/);
  assert.doesNotMatch(view,/ترحيل فوري متوازي 100%/);
  assert.doesNotMatch(view,/دورة الإدخال الواحد المؤتمتة/);
});

test('remove manual recovery-and-merge and destructive delete-all controls from sales register only',()=>{
  assert.doesNotMatch(view,/استرجاع ودمج الفواتير/);
  assert.doesNotMatch(view,/حذف كل فواتير المبيعات/);
  assert.doesNotMatch(view,/handleRecoverInvoices|recoverInvoicesFromAllBackups/);
  assert.doesNotMatch(view,/DeleteAllSalesInvoicesModal|setIsDeleteAllModalOpen/);
});

test('sales register is compact, one responsive bar, with no subtitle under title',()=>{
  assert.match(toolbar,/flex flex-wrap items-center gap-2 rounded-xl/);
  assert.match(toolbar,/سجل فواتير المبيعات/);
  assert.doesNotMatch(toolbar,/فواتير نقاط البيع السريعة، وأوامر مطبوعات المطبعة المعتمدة/);
  assert.equal((toolbar.match(/<section\b/g)||[]).length,1);
});

test('filter and date state continue to filter existing invoice list, not invoice data',()=>{
  assert.match(toolbar,/value=\{searchQuery\}/);
  assert.match(toolbar,/setSearchQuery\(event\.target\.value\)/);
  assert.match(toolbar,/value=\{filterType\}/);
  assert.match(toolbar,/setFilterType\(event\.target\.value\)/);
  assert.match(toolbar,/value=\{dateFilterMode\}/);
  assert.match(toolbar,/setDateFilterMode\(event\.target\.value as InvoiceDateFilterMode\)/);
  assert.match(toolbar,/value=\{singleDate\}/);
  assert.match(toolbar,/value=\{dateFrom\}/);
  assert.match(toolbar,/value=\{dateTo\}/);
  assert.match(view,/const filteredInvoices = invoices/);
  assert.match(view,/const totalInvoiced = filteredInvoices\.reduce/);
});

test('invoice details, export, deleted basket, audit and daily entry remain functional',()=>{
  assert.match(toolbar,/onClick=\{handlePrintDetailedInvoices\}/);
  assert.match(toolbar,/setIsDeletedInvoicesOpen\(true\)/);
  assert.match(toolbar,/setIsAuditLogOpen\(true\)/);
  assert.match(toolbar,/setActiveTab\('daily_entry_sheet'\)/);
  assert.match(toolbar,/setActiveTab\('excel_drafts'\)/);
  assert.match(view,/<DeletedInvoicesModal/);
  assert.match(view,/<InvoiceAuditLogModal/);
  assert.match(table,/filteredInvoices\.map\(/);
  assert.match(table,/setSelectedInvoiceForPrint\(inv\)/);
  assert.match(table,/setEditingPosInvoiceId\(inv\.id\)/);
  assert.match(table,/deleteInvoice\(inv\.id\)/);
});
