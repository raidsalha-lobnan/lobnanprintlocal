import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoLegacyStockResurrection} from '../legacy-stock-history-guard.mjs';

const check=(o)=>assertNoLegacyStockResurrection({entity:'stockMovements',
 oldRecord:null,proposed:{type:'out_sale',...o},recordId:'sm-new',
 actualVersion:0});

test('a newly posted sale must be owned by an immutable invoice id',()=>{
 assert.throws(()=>check({referenceNumber:'INV-0091'}),
  /STOCK_SALE_REQUIRES_IMMUTABLE_INVOICE_ID/);
 assert.throws(()=>check({referenceNumber:'TEMP-inv-123'}),
  /STOCK_SALE_REQUIRES_IMMUTABLE_INVOICE_ID/);
 assert.doesNotThrow(()=>check({sourceInvoiceId:'inv-stable-id',referenceNumber:'INV-0091'}));
 assert.doesNotThrow(()=>check({referenceId:'inv-stable-id'}));
});

test('opening stock is forbidden under the zero opening stock policy',()=>{
 assert.throws(()=>assertNoLegacyStockResurrection({
  entity:'stockMovements',oldRecord:null,proposed:{type:'in_opening'},
  actualVersion:0,recordId:'opening-123'
 }),/OPENING_STOCK_MOVEMENT_NOT_ALLOWED/);
 assert.throws(()=>assertNoLegacyStockResurrection({
  entity:'stockMovements',oldRecord:null,
  proposed:{type:'in_adjustment',referenceType:'opening'},
  actualVersion:0,recordId:'opening-456'
 }),/OPENING_STOCK_MOVEMENT_NOT_ALLOWED/);
});

test('retired stock tombstones cannot be resurrected from stale devices',()=>{
 assert.throws(()=>assertNoLegacyStockResurrection({
  entity:'stockMovements',oldRecord:{version:6,value:null},
  proposed:{type:'out_sale',sourceInvoiceId:'inv-1'},
  actualVersion:6,recordId:'sm-old-public'
 }),/RETIRED_LEGACY_STOCK_MOVEMENT_IMMUTABLE/);
});

test('existing immutable accounting movement can retry only through existing append-only checks',()=>{
 assert.doesNotThrow(()=>assertNoLegacyStockResurrection({
  entity:'stockMovements',
  oldRecord:{version:5,value:{id:'sm-1',type:'out_sale',sourceInvoiceId:'invoice-1'}},
  proposed:{id:'sm-1',type:'out_sale',sourceInvoiceId:'invoice-1'},
  actualVersion:5,recordId:'sm-1'
 }));
});

test('other nonstock entities are unaffected',()=>{
 assert.doesNotThrow(()=>assertNoLegacyStockResurrection({
  entity:'invoices',oldRecord:null,
  proposed:{id:'inv-1',type:'out_sale'},actualVersion:0,recordId:'inv-1'
 }));
});

test('new documented invoice adjustment retains its normal posting path',()=>{
 assert.doesNotThrow(()=>assertNoLegacyStockResurrection({
  entity:'stockMovements',oldRecord:null,actualVersion:0,
  proposed:{type:'out_adjustment',sourceInvoiceId:'inv-1',
   referenceType:'invoice_correction'},recordId:'adjustment-1'
 }));
});
