import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInvoiceRevisionBaseline} from '../invoice-revision-baseline.mjs';

// Historic INV-0091 structure: 535.40 ILS, 391.30 ILS of proven
// TEMP-id stock movements, and a same-day unrelated public-number movement.
// Do not change the production invoice or its historical movement in tests.
const id='inv-pos-1794225843663-up9x0',date='2026-11-01',invoiceNumber='INV-0091';
const lines=[
 ['envelopes',15,2,30],['leather',1,120,120],['a4',15,3,45],
 ['a3',2,10,20],['leather',1.8,120,216],['sticker',0.87,120,104.4]
];
const original=()=>({
 id,invoiceNumber,date,isOfficial:true,isAccountingPosted:true,
 warehouse:'main',customerId:'customer-1',counterpartyType:'customer',
 paymentMethod:'credit',exchangeRate:1,currency:'ILS',
 totalAmount:535.4,baseTotalAmount:535.4,subtotal:535.4,
 paidAmount:0,basePaidAmount:0,
 items:lines.map(([itemId,quantity,unitPrice,total])=>
  ({itemId,category:'print_raw',quantity,unitPrice,total}))
});
const changed=()=>({
 ...original(),totalAmount:539,baseTotalAmount:539,subtotal:539,
 items:original().items.map((item,i)=>i===5?
  {...item,quantity:0.90,total:108}:item)
});
const journals=()=>[
 {value:{referenceType:'pos_invoice',referenceId:id,
  lines:[{accountCode:'1201',debit:535.4,credit:0},
         {accountCode:'4101',debit:0,credit:535.4}]}},
 {value:{referenceType:'cogs',referenceId:id,
  lines:[{accountCode:'5101',debit:391.3,credit:0},
         {accountCode:'1301',debit:0,credit:391.3}]}}
];
const movement=(name,itemId,quantity,price,referenceNumber='TEMP-'+id)=>
 ({value:{id:name,date,referenceNumber,type:'out_sale',
   itemId,quantity,unitPrice:price,totalValue:
   Math.round(quantity*price*100)/100}});
const stock=()=>[
 movement('temp-leather','leather',2.8,90),
 movement('temp-sticker','sticker',0.87,90),
 movement('temp-envelopes','envelopes',15,1),
 movement('temp-a4','a4',15,2),
 movement('temp-a3','a3',2,8),
 movement('legacy-other-invoice','cardboard',4,1,invoiceNumber)
];
const run=(movements=stock(),jj=journals())=>verifyInvoiceRevisionBaseline({
 invoice:original(),proposed:changed(),journals:jj,movements
});

test('INV-0091 price/quantity edit proceeds when immutable TEMP stock exactly proves COGS',()=>{
 const result=run();
 assert.equal(result.currentCOGSMinor,39130);
 assert.equal(result.expectedNextCOGSMinor,39400);
 assert.equal(result.totalDeltaMinor,360);
 assert.equal(result.stockDeltas.length,1);
 assert.equal(result.stockDeltas[0].itemId,'sticker');
 assert.ok(Math.abs(result.stockDeltas[0].inventoryChange+0.03)<0.000001);
 assert.deepEqual(result.legacyForeignPublicNumberMovementIds,['legacy-other-invoice']);
 assert.equal(result.verifiedMovementIds.length,5);
 assert.equal(result.verifiedMovementIds.includes('legacy-other-invoice'),false);
 assert.deepEqual(result.accountDeltas,{'1201':360,'4101':-360});
});

test('same-day unrelated public-number stock remains excluded only with complete proof',()=>{
 assert.throws(()=>run(stock().filter(x=>x.value.id!=='temp-a3')),
  /REVISION_(?:STOCK_BASELINE_MISMATCH|COST_BASELINE_MISMATCH|EXTRA_STOCK_MOVEMENT)/);
 const j=journals();j[1].value.lines[0].debit=392;
 j[1].value.lines[1].credit=392;
 assert.throws(()=>run(stock(),j),
  /REVISION_(?:STOCK_BASELINE_MISMATCH|COST_BASELINE_MISMATCH|EXTRA_STOCK_MOVEMENT)/);
});

test('conflicting same-item public-number movement still fails closed',()=>{
 const movements=stock().filter(x=>x.value.id!=='legacy-other-invoice');
 movements.push(movement('public-same-item-different-quantity','sticker',0.5,90,invoiceNumber));
 assert.throws(()=>run(movements),/REVISION_STOCK_BASELINE_MISMATCH/);
});

test('same-item exact duplicate remains quarantined for quantity edits',()=>{
 const movements=stock().filter(x=>x.value.id!=='legacy-other-invoice');
 movements.push(movement('public-same-issue','sticker',0.87,90,invoiceNumber));
 assert.throws(()=>run(movements),/REVISION_LEGACY_DOUBLE_STOCK_REQUIRES_INVENTORY_AUDIT/);
});
