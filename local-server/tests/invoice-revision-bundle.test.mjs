import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVerifiedInvoiceRevisionBundle} from '../invoice-revision-bundle.mjs';
const paper=(quantity,price,total)=>({
 itemId:'paper',quantity,unitPrice:price,total,category:'print_raw'
});
const card={itemId:'card',quantity:12,unitPrice:2,total:24,category:'print_raw'};
const invoice={
 id:'i66',invoiceNumber:'INV-0066',isOfficial:true,isAccountingPosted:true,
 date:'2026-11-04',warehouse:'المستودع الرئيسي',
 statusHistory:[],totalAmount:50.4,subtotal:50.4,baseTotalAmount:50.4,
 paidAmount:0,basePaidAmount:0,remainingAmount:50.4,customerId:'cust',
 items:[paper(132,.2,26.4),card]
};
const plan={
 totalDeltaMinor:60,currentCOGSMinor:14400,expectedNextCOGSMinor:1400,
 stockDeltas:[{itemId:'paper',inventoryChange:130}],
 costByItem:{paper:1,card:1},
 customerBalanceChanges:[{partyId:'cust',amountMinor:60}]
};
const setup=()=>({
 invoice,
 proposed:{...invoice,subtotal:51,totalAmount:51,remainingAmount:51,
  baseTotalAmount:51,items:[paper(2,13.5,27),card]},
 invoiceVersion:2,plan:structuredClone(plan),
 partyRecords:[{id:'cust',version:31,value:{id:'cust',balance:1246.4}}],
 inventoryRecords:[{id:'paper',version:10,value:{
  id:'paper',stockQuantity:400,
  warehouseStocks:{'المستودع الرئيسي':400}
 }}],
 registeredWarehouseCount:1,singleWarehouseId:'wh-1',
 commandId:'amendment0066',now:'2026-11-08T17:40:00Z'
});
test('atomic command balances invoice corrections and keeps one stock source',()=>{
 const cmd=buildVerifiedInvoiceRevisionBundle(setup());
 assert.deepEqual(cmd.changes.map(c=>c.entity),
  ['invoices','journalEntries','journalEntries','stockMovements','inventory','parties']);
 assert.equal(cmd.changes[1].value.lines[0].debit,.6);
 assert.equal(cmd.changes[2].value.lines[0].accountCode,'1301');
 assert.equal(cmd.changes[2].value.lines[0].debit,130);
 assert.equal(cmd.changes[3].value.quantity,130);
 assert.equal(cmd.changes[3].value.internalCorrection,true);
 assert.equal(cmd.changes[4].value.stockQuantity,530);
 assert.equal(cmd.changes[4].value.warehouseStocks['المستودع الرئيسي'],530);
 assert.equal(cmd.changes[4].value.warehouseStock['wh-1'],530);
 assert.equal(cmd.changes[5].value.balance,1247);
 assert.equal(cmd.changes[0].value.invoiceNumber,'INV-0066');
 assert.equal(cmd.changes[0].value.totalAmount,51);
 assert.equal(cmd.changes[0].expectedVersion,2);
});
test('a single registered warehouse does not silently merge multiple cached warehouse keys',()=>{
 const data=setup();
 data.inventoryRecords[0].value.warehouseStocks={
  'المستودع الرئيسي':756,'المخزن الرئيسي':4
 };
 assert.throws(()=>buildVerifiedInvoiceRevisionBundle(data),
  /REVISION_SINGLE_WAREHOUSE_HAS_AMBIGUOUS_LEGACY_KEYS/);
});
test('negative inventory remains a valid sale with no opening stock',()=>{
 const data=setup();
 data.proposed.items[0]=paper(1000,.027,27);
 const cmd=buildVerifiedInvoiceRevisionBundle(data);
 const inv=cmd.changes.find(r=>r.entity==='inventory').value;
 assert.equal(inv.stockQuantity,-468);
 assert.equal(inv.warehouseStock['wh-1'],-468);
 assert.equal(inv.warehouseStocks['المستودع الرئيسي'],-468);
});
test('missing customer record is blocked rather than silently dropping debt delta',()=>{
 const data=setup();data.partyRecords=[];
 assert.throws(()=>buildVerifiedInvoiceRevisionBundle(data),
  /PARTY_AUTHORITATIVE_BALANCE_REQUIRED/);
});
test('legacy single warehouse cache is reconciled and traceable on next real amendment',()=>{
 const data=setup();
 data.inventoryRecords[0].value.warehouseStocks={'المستودع الرئيسي':756};
 const cmd=buildVerifiedInvoiceRevisionBundle(data);
 const value=cmd.changes.find(row=>row.entity==='inventory').value;
 assert.equal(value.stockQuantity,530);
 assert.equal(value.warehouseStocks['المستودع الرئيسي'],530);
 assert.equal(value.warehouseStock['wh-1'],530);
 assert.equal(value.inventoryBalanceReconciliations[0].priorWarehouseCache,756);
 assert.equal(value.inventoryBalanceReconciliations[0].priorAggregate,400);
});
