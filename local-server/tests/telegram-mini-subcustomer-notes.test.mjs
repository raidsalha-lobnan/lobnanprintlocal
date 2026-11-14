import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeMiniSaleBody,TelegramMiniPos} from '../telegram-mini-pos.mjs';
import {buildNewAtomicPosSale} from '../atomic-pos-builder.compiled.mjs';
import {validateAtomicInvoicePosting} from '../atomic-invoice-posting.mjs';
import {invoiceTelegramReceipt} from '../telegram-invoice-format.mjs';

const main={id:'pt-main',name:'مؤسسة 4TDK',type:'customer',code:'CUST-0020',
 balance:0,openingBalance:0};
const other={id:'pt-other',name:'عميل مختلف',type:'customer',code:'CUST-0021',
 balance:0,openingBalance:0};
const child={id:'pt-sub',parentPartyId:main.id,name:'فرع المؤسسة',type:'customer',
 code:'SUB-0020',isSubCustomer:true,balance:0,openingBalance:0};
const foreign={id:'pt-foreign',parentPartyId:other.id,name:'فرع عميل آخر',type:'customer',
 code:'SUB-0021',isSubCustomer:true,balance:0,openingBalance:0};
const item={id:'item-paper',code:'PRI-00001',name:'مطبوعات جلدية',category:'printing',
 stockQuantity:300,purchasePrice:1,sellingPrice:10,unit:'م²'};
const date='2026-11-14';
const sample={
 customerId:main.id,subCustomerId:child.id,subCustomerName:child.name,date,
 paymentMethod:'credit',notes:'ملاحظات الفاتورة العامة',
 paymentNotes:'ملاحظات السداد حتى عندما يكون آجلًا',
 items:[{itemId:item.id,quantity:2,unitPrice:10,
  notes:'ملاحظات البند الأول'},
  {itemId:item.id,quantity:1,unitPrice:11,notes:'ملاحظات البند الثاني'}]
};

test('Mini cashier draft retains four optional fields and individual item notes',()=>{
 const cleaned=normalizeMiniSaleBody(sample);
 assert.equal(cleaned.customerId,main.id);
 assert.equal(cleaned.subCustomerId,child.id);
 assert.equal(cleaned.subCustomerName,child.name);
 assert.equal(cleaned.notes,sample.notes);
 assert.equal(cleaned.paymentNotes,sample.paymentNotes);
 assert.deepEqual(cleaned.items.map(i=>i.notes),
  ['ملاحظات البند الأول','ملاحظات البند الثاني']);
 assert.equal(cleaned.date,date);
 assert.throws(()=>normalizeMiniSaleBody({...sample,subCustomerId:'../../foreign'}),
  /MINI_POS_SUBCUSTOMER_ID_INVALID/);
 const old=normalizeMiniSaleBody({...sample,subCustomerId:undefined,subCustomerName:undefined,
  paymentNotes:undefined});
 assert.equal(old.subCustomerId,'');
 assert.equal(old.subCustomerName,'');
 assert.equal(old.paymentNotes,'');
});

test('shared atomic builder stores linked sub-customer + all three note levels and invoice notices read them',()=>{
 const uuid='76b3c87c-a05c-4f25-9cab-ce82289a1223';
 const {posting,invoice}=buildNewAtomicPosSale({
  invoiceId:'inv-pos-'+uuid,commandId:uuid,createdAt:date+'T12:00:00Z',
  items:sample.items.map(line=>({item,quantity:line.quantity,unitPrice:line.unitPrice,
    notes:line.notes})),
  customerId:main.id,customerName:main.name,notes:sample.notes,
  paymentMethod:'credit',
  options:{date,currency:'ILS',currencySymbol:'₪',warehouse:'الرئيسي',
   exchangeRate:1,subCustomerId:child.id,subCustomerName:child.name,
   paymentNotes:sample.paymentNotes},
  vatRate:0,inventory:[{id:item.id,value:item,version:2}],
  parties:[{id:main.id,value:main,version:2},{id:child.id,value:child,version:1}]
 });
 assert.equal(invoice.customerId,main.id);
 assert.equal(invoice.subCustomerId,child.id);
 assert.equal(invoice.subCustomerName,child.name);
 assert.equal(invoice.notes,sample.notes);
 assert.equal(invoice.paymentNotes,sample.paymentNotes);
 assert.deepEqual(invoice.items.map(i=>i.notes),sample.items.map(i=>i.notes));
 assert.equal(invoice.totalAmount,31);
 assert.equal(invoice.paidAmount,0);
 assert.ok(posting.partyChanges.every(p=>!p.id.startsWith('pt-sub-inv-pos-')));
 const versions=new Map([[item.id,2],[main.id,2],[child.id,1]]);
 const changes=[posting.invoice,...posting.journals,...posting.stockMovements,
  ...posting.inventoryChanges,...posting.partyChanges]
  .map(change=>({...change,expectedVersion:versions.get(change.id)||0}));
 assert.equal(validateAtomicInvoicePosting({
  workspaceId:'lobnan_main',id:uuid,atomicInvoiceId:'inv-pos-'+uuid,changes
 }),true);
 const receipt=invoiceTelegramReceipt({...invoice,invoiceNumber:'INV-9999'},
  {mainCustomer:main,subCustomer:child});
 for(const note of [sample.notes,sample.paymentNotes,...sample.items.map(i=>i.notes)])
  assert.ok(receipt.includes(note),'Missing Telegram receipt note '+note);
 assert.match(receipt,/فرع المؤسسة/);
});

test('typed new subcustomer is created inside the same atomic posting on unpaid invoices',()=>{
 const uuid='640dc5b0-74fd-4fae-b993-a9315995a140';
 const {invoice,posting}=buildNewAtomicPosSale({
  invoiceId:'inv-pos-'+uuid,commandId:uuid,createdAt:date+'T12:00:00Z',
  items:[{item,quantity:1,unitPrice:10,notes:'أمر خاص'}],
  customerId:main.id,customerName:main.name,paymentMethod:'credit',
  notes:'فاتورة جديدة',vatRate:0,
  options:{currency:'ILS',currencySymbol:'₪',exchangeRate:1,
   subCustomerName:'فرع جديد من الهاتف',paymentNotes:'يُسدّد خلال أسبوع'},
  inventory:[{id:item.id,value:item,version:1}],
  parties:[{id:main.id,value:main,version:1}]
 });
 assert.equal(invoice.subCustomerName,'فرع جديد من الهاتف');
 const created=posting.partyChanges.find(p=>p.value?.isSubCustomer===true);
 assert.ok(created);
 assert.equal(created.value.parentPartyId,main.id);
 assert.equal(created.value.name,'فرع جديد من الهاتف');
 assert.equal(invoice.subCustomerId,created.id);
});

test('bootstrap exposes only authorized subcustomers with visible parent accounts',async()=>{
 const rows=[
  {entity:'parties',record_id:main.id,value:main},
  {entity:'parties',record_id:child.id,value:child},
  {entity:'parties',record_id:other.id,value:other},
  {entity:'parties',record_id:foreign.id,value:foreign},
  {entity:'settings',record_id:'global',value:{vatRate:0}}
 ];
 const mini=new TelegramMiniPos({query:async sql=>{
  if(sql.includes("entity IN ('settings','parties','treasuries','warehouses')"))return {rows};
  if(sql.includes("entity IN ('accounts','employees')"))return {rows:[]};
  if(sql.includes('FROM sync_telegram_pos_drafts'))return {rows:[]};
  throw Error('UNEXPECTED_BOOTSTRAP_QUERY');
 }},'lobnan_main',{});
 mini.session=async()=>({user:{name:'Authorized user'},access:{
  can:()=>true,canRead:(entity,record,id)=>id!==other.id&&id!==foreign.id
 }});
 const b=await mini.bootstrap('SIGNED');
 assert.deepEqual(b.parties.map(p=>p.id),[main.id]);
 assert.deepEqual(b.subCustomers.map(p=>p.id),[child.id]);
 assert.equal(b.subCustomers[0].parentPartyId,main.id);
});

test('Mini cashier HTML and browser payload expose linked customer and all three notes',()=>{
 const html=readFileSync(new URL('../../public/telegram-pos.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../../public/telegram-pos.js',import.meta.url),'utf8');
 for(const id of ['customer','subCustomer','subCustomerNewName',
  'paymentNotes','notes']){
  assert.match(html,new RegExp('id="'+id+'"'),'Missing form field '+id);
 }
 assert.match(html,/id="items"/);
 assert.match(js,/subCustomerId:sub\?\.id/);
 assert.match(js,/paymentNotes:el\('paymentNotes'\)\.value/);
 assert.match(js,/count:Number\(l\.count\),notes:l\.notes/);
 assert.match(js,/renderSubCustomers\(b\.subCustomerId/);
});

test('server rejects a subcustomer id from a different parent before any accounting transaction',async()=>{
 const draftId='90afbd2b-c680-42bb-9ae5-c954dbecc750';
 const stock=[{record_id:item.id,value:item,version:1}];
 const miniDb={
  query:async sql=>{throw Error('UNEXPECTED_ROOT_SQL: '+sql)},
 };
 let pushCalls=0;
 const pgClient={
  query:async sql=>{
   if(sql.startsWith('INSERT INTO sync_workspaces'))return {rows:[]};
   if(sql.startsWith('SELECT next_sequence'))return {rows:[{next_sequence:1}]};
   if(sql.includes('FROM sync_telegram_pos_drafts')&&sql.includes('FOR UPDATE'))return{
    rows:[{status:'draft',body:{...sample,subCustomerId:foreign.id,
     subCustomerName:foreign.name},created_at:new Date(date+'T08:00:00Z')}]
   };
   if(sql.includes("entity='inventory'"))return {rows:stock};
   if(sql.includes("entity='parties'"))return{rows:[
    {entity:'parties',record_id:main.id,value:main,version:1},
    {entity:'parties',record_id:child.id,value:child,version:1}
   ]};
   if(sql.includes("entity='settings'"))return{rows:[{value:{vatRate:0}}]};
   if(sql.includes("entity='treasuries'"))return{rows:[]};
   if(sql.includes("entity='accounts'"))return{rows:[]};
   if(sql.includes("entity='warehouses'"))return{rows:[{
    record_id:'warehouse-main',value:{name:'الرئيسي'}}]};
   throw Error('UNEXPECTED_COMMIT_SQL');
  }
 };
 const mini=new TelegramMiniPos(miniDb,'lobnan_main',{
  withTx:async operation=>operation(pgClient),
  pushInTx:async()=>{pushCalls++;throw Error('MUST_NOT_COMMIT')}
 });
 mini.session=async()=>({user:{id:'owner-1',name:'Owner'},access:{
  can:()=>true,canRead:()=>true
 }});
 await assert.rejects(()=>mini.commit('signed',draftId),
  /MINI_POS_SUBCUSTOMER_PARENT_INVALID/);
 assert.equal(pushCalls,0,'No invoice or journal write must occur');
});
