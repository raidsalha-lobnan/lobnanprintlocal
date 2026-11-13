import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNewAtomicPosSale} from '../sync-next/atomicPosSaleBuilder';
import {buildAtomicInvoicePosting} from '../sync-next/accountingBundle';
import {validateAtomicInvoicePosting} from '../../local-server/atomic-invoice-posting.mjs';

const item=(id:string,price:number,cost:number,stockQuantity=20,category='print_raw')=>({
  id,code:id,name:id,category,purchasePrice:cost,sellingPrice:price,
  stockQuantity,barcode:id
}) as any;
const snapshot=(entity:string,thing:any,version=1)=>({
  id:thing.id,version,pending:false,value:thing
});
const parent={id:'parent-a',code:'CUST-0002',type:'customer',name:'Main A',
  phone:'',balance:40,openingBalance:0};
const builder=(overrides:Record<string,any>={})=>{
  const sheet=item('stock-A',20,5);
  const delivery=item('srv-delivery',15,0,0,'services');
  return buildNewAtomicPosSale({
    invoiceId:'inv-pos-unique-123',commandId:'command-atomic-123',
    createdAt:'2026-11-13T10:00:00.000Z',
    items:[{item:sheet,quantity:2},{item:delivery,quantity:1}],
    customerId:parent.id,customerName:parent.name,paymentMethod:'credit',
    options:{paidAmount:0,subCustomerName:'Transient Debtor',...(overrides.options||{})},
    vatRate:0,inventory:[snapshot('inventory',sheet)],parties:[snapshot('parties',parent)],
    ...Object.fromEntries(Object.entries(overrides).filter(([k])=>k!=='options'))
  });
};
const command=posting=>({
 id:posting.commandId,workspaceId:'lobnan_main',atomicInvoiceId:posting.invoiceId,
 changes:buildAtomicInvoicePosting(posting).map(change=>({
   ...change,expectedVersion:change.entity==='inventory'?1:0
 }))
});

test('credit sale with delivery, inventory, journals and transient customer is one atomic command',()=>{
  const {posting,invoice}=builder();
  assert.equal(invoice.totalAmount,55);
  assert.equal(invoice.remainingAmount,55);
  assert.equal(posting.journals.length,2);
  assert.equal(posting.stockMovements.length,1);
  assert.equal(posting.inventoryChanges.length,1);
  assert.equal(posting.partyChanges.length,1);
  assert.equal(posting.partyChanges[0].value?.balance,55);
  assert.equal(invoice.subCustomerId,posting.partyChanges[0].id);
  assert.equal(posting.partyChanges.filter(p=>p.id===invoice.subCustomerId).length,1);
  assert.equal(posting.partyChanges[0].value?.code,'SUB-0001');
  assert.equal((posting.stockMovements[0].value as any).sourceInvoiceId,invoice.id);
  assert.equal((posting.inventoryChanges[0].value as any).stockQuantity,18);
  const revenue=posting.journals.find(j=>(j.value as any).referenceType==='pos_invoice')!;
  assert.equal((revenue.value as any).lines.find((l:any)=>l.accountCode==='2104').credit,15);
  assert.equal((revenue.value as any).lines.find((l:any)=>l.accountCode==='4101').credit,40);
  assert.equal(validateAtomicInvoicePosting(command(posting)),true);
});

test('a NEW POS invoice accepts an already negative stock balance and posts all evidence atomically',()=>{
  const stock=item('PRI-00001',150,90,-1);
  const {posting,invoice}=builder({
    items:[{item:stock,quantity:1}],
    inventory:[snapshot('inventory',stock)],
    options:{subCustomerName:'',paidAmount:0}
  });
  assert.equal(invoice.invoiceNumber,'TEMP-inv-pos-unique-123');
  assert.equal(invoice.isAccountingPosted,true);
  assert.equal(posting.stockMovements.length,1);
  const movement=posting.stockMovements[0].value as any;
  assert.equal(movement.balanceBefore,-1);
  assert.equal(movement.balanceAfter,-2);
  assert.equal((posting.inventoryChanges[0].value as any).stockQuantity,-2);
  assert.equal(validateAtomicInvoicePosting(command(posting)),true);
});

test('a non-numeric prior stock still fails safely before a financial command is queued',()=>{
  const stock=item('invalid-stock',150,90,20);
  stock.stockQuantity='not-a-balance';
  assert.throws(()=>builder({
    items:[{item:stock,quantity:1}],
    inventory:[snapshot('inventory',stock)],
    options:{subCustomerName:'',paidAmount:0}
  }),/POS_INVALID_PREVIOUS_STOCK/);
});

test('retry keeps exact financial command bytes and official number stays temporary until receipt',()=>{
  const a=builder(),b=builder();
  assert.deepEqual(a,b);
  assert.equal(a.invoice.invoiceNumber,'TEMP-inv-pos-unique-123');
  assert.equal(command(a.posting).changes.length,6);
});

test('zero-cost goods require stock movement but do not fabricate COGS journal',()=>{
  const {posting}=builder({items:[{item:item('free-stock',12,0,3),quantity:1}],
    inventory:[snapshot('inventory',item('free-stock',12,0,3))],
    options:{subCustomerName:'',paidAmount:12},
  });
  assert.equal(posting.stockMovements.length,1);
  assert.equal(posting.journals.length,1);
  assert.equal(validateAtomicInvoicePosting(command(posting)),true);
});

test('different parent with identical transient customer name never reuses another debtor record',()=>{
  const a=parent,b={...parent,id:'parent-b',code:'CUST-0003',name:'Main B'};
  const other={...parent,id:'sub-a',parentPartyId:a.id,isSubCustomer:true,name:'Transient Debtor',balance:10};
  const {posting,invoice}=builder({customerId:b.id,customerName:b.name,
    parties:[snapshot('parties',a),snapshot('parties',b),snapshot('parties',other)]});
  assert.notEqual(invoice.subCustomerId,other.id);
  assert.equal(invoice.subCustomerId,'pt-sub-inv-pos-unique-123');
  assert.equal((posting.partyChanges[0].value as any).parentPartyId,b.id);
});

test('existing legitimate debtor gets updated balance instead of new party',()=>{
  const existing={...parent,id:'sub-b',parentPartyId:parent.id,isSubCustomer:true,
    name:'Transient Debtor',balance:13};
  const {posting}=builder({parties:[snapshot('parties',parent),snapshot('parties',existing)]});
  assert.equal(posting.partyChanges[0].id,'sub-b');
  assert.equal((posting.partyChanges[0].value as any).balance,68);
});

test('invalid cost, missing stock and overpayment fail before any persistent operation',()=>{
  assert.throws(()=>builder({items:[{item:item('missing',15,4),quantity:1}]}),
    /POS_STOCK_ITEM_MISSING/);
  assert.throws(()=>builder({options:{paidAmount:60}}),/POS_OVERPAYMENT/);
  assert.throws(()=>builder({items:[{item:item('bad',15,-1),quantity:1}],
    inventory:[snapshot('inventory',item('bad',15,-1))]}),/POS_INVALID_COST/);
});

test('non-posted quotation cannot create journals or deduct stock',()=>{
  const {posting,invoice}=builder({options:{workflowStatus:'quotation',paidAmount:0}});
  assert.equal(invoice.isAccountingPosted,false);
  assert.equal(posting.journals.length,0);
  assert.equal(posting.stockMovements.length,0);
  assert.equal(posting.inventoryChanges.length,0);
  assert.equal(validateAtomicInvoicePosting(command(posting)),true);
});

test('reject incomplete and tampered bundles before writing to database',()=>{
  const {posting}=builder();
  const c=command(posting);
  c.changes=c.changes.filter(c=>c.entity!=='stockMovements');
  assert.throws(()=>validateAtomicInvoicePosting(c),/ATOMIC_POSTING_INVENTORY_UPDATE_EXTRA|ATOMIC_POSTING_STOCK_MOVEMENT_REQUIRED/);
  const d=command(posting);
  const revenue=d.changes.find(x=>x.entity==='journalEntries'&&(x.value as any).referenceType==='pos_invoice')!;
  (revenue.value as any).lines.find((x:any)=>x.accountCode==='2104').credit=0;
  assert.throws(()=>validateAtomicInvoicePosting(d));
});
