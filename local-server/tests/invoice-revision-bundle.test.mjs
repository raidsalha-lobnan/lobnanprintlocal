import test from 'node:test';import assert from 'node:assert/strict';
import {buildVerifiedInvoiceRevisionBundle} from '../invoice-revision-bundle.mjs';
const invoice={id:'i66',invoiceNumber:'INV-0066',isOfficial:true,isAccountingPosted:true,
 date:'2026-11-04',warehouse:'المستودع الرئيسي',
 statusHistory:[],totalAmount:50.4,items:[]};
const plan={totalDeltaMinor:60,currentCOGSMinor:14400,expectedNextCOGSMinor:1400,
 stockDeltas:[{itemId:'paper',inventoryChange:130}],
 costByItem:{paper:1},customerBalanceChanges:[{partyId:'cust',amountMinor:60}]};
const setup=()=>({
 invoice,proposed:{...invoice,totalAmount:51},invoiceVersion:2,plan:structuredClone(plan),
 partyRecords:[{id:'cust',version:31,value:{id:'cust',balance:1246.4}}],
 inventoryRecords:[{id:'paper',version:10,value:{id:'paper',stockQuantity:400,
  warehouseStocks:{'المستودع الرئيسي':400}}}],
 commandId:'amendment0066',now:'2026-11-08T17:40:00Z'
});
test('single versioned command contains invoice, sale delta, COGS delta, stock and party effects',()=>{
 const cmd=buildVerifiedInvoiceRevisionBundle(setup());
 assert.equal(cmd.changes.length,6);
 assert.deepEqual(cmd.changes.map(c=>c.entity),
  ['invoices','journalEntries','journalEntries','stockMovements','inventory','parties']);
 assert.equal(cmd.changes[1].value.lines[0].debit,.6);
 assert.equal(cmd.changes[2].value.lines[0].accountCode,'1301');
 assert.equal(cmd.changes[2].value.lines[0].debit,130);
 assert.equal(cmd.changes[3].value.quantity,130);
 assert.equal(cmd.changes[3].value.internalCorrection,true);
 assert.equal(cmd.changes[4].value.stockQuantity,530);
 assert.equal(cmd.changes[4].value.warehouseStocks['المستودع الرئيسي'],530);
 assert.equal(cmd.changes[5].value.balance,1247);
 assert.equal(cmd.changes[0].value.invoiceNumber,'INV-0066');
 assert.equal(cmd.changes[0].value.totalAmount,51);
 assert.equal(cmd.changes[0].expectedVersion,2);
});
test('ambiguous warehouse totals stop amendment without writing a command',()=>{
 const data=setup();
 data.inventoryRecords[0].value.warehouseStocks={'المستودع الرئيسي':756,'المخزن الرئيسي':4};
 assert.throws(()=>buildVerifiedInvoiceRevisionBundle(data),/WAREHOUSE_STOCK_SOURCE_AMBIGUOUS/);
});
test('future stock-negative amendment is blocked',()=>{
 const data=setup();data.plan.stockDeltas[0].inventoryChange=-405;
 assert.throws(()=>buildVerifiedInvoiceRevisionBundle(data),/WOULD_NEGATE_STOCK/);
});
test('missing customer record is blocked instead of silently dropping debt delta',()=>{
 const data=setup();data.partyRecords=[];
 assert.throws(()=>buildVerifiedInvoiceRevisionBundle(data),/PARTY_AUTHORITATIVE_BALANCE_REQUIRED/);
});
