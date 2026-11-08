import {validateJournal} from './sync-domain.mjs';
const minor=v=>{
 const n=Number(v);if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>0.00001)
  throw new Error('REVISION_INVALID_MONETARY_VALUE');
 return Math.round(n*100);
};
const money=c=>Math.round(c)/100;
const balance=(record)=>Number(record?.value?.balance);
const journal=(id,invoice,group,kind,from,to,amountMinor,description,now)=>{
 if(amountMinor===0)return null;
 const debitAccount=amountMinor>0?from:to;
 const creditAccount=amountMinor>0?to:from;
 const magnitude=money(Math.abs(amountMinor));
 const v={id,date:invoice.date,createdAt:now,
  description,referenceType:'invoice_correction',referenceId:invoice.id,
  correctionGroupId:group,internalCorrection:true,approvedRevision:true,
  correctionKind:kind,lines:[
   {accountCode:debitAccount,debit:magnitude,credit:0,description},
   {accountCode:creditAccount,debit:0,credit:magnitude,description}
  ]};
 validateJournal(v);return {entity:'journalEntries',id,value:v};
};
/** Pure command builder; it NEVER executes or authorizes changes.
 * Input snapshots and versions must be read and locked by the server.
 * The original journal entries and movement history are never overwritten.
 */
export function buildVerifiedInvoiceRevisionBundle({
 invoice,proposed,invoiceVersion,plan,
 partyRecords,inventoryRecords,commandId,now
}){
 if(!commandId||!now||!invoice?.id||!Number.isSafeInteger(invoiceVersion)||invoiceVersion<1)
  throw new Error('REVISION_MISSING_IDENTIFIERS_OR_VERSION');
 const group='revision-'+commandId;
 const partyIndex=new Map(partyRecords.map(r=>[r.id,r]));
 const inventoryIndex=new Map(inventoryRecords.map(r=>[r.id,r]));
 const resolveWarehouseKey=(stocks,label)=>{
  const keys=Object.keys(stocks||{});
  if(Object.hasOwn(stocks||{},label))return label;
  // Historical invoices stored a descriptive warehouse name while inventory
  // saved its short canonical label. Accept a unique exact prefix only.
  const prefix=String(label||'').trim().split(/\s*[-–—]\s*/)[0];
  const matches=keys.filter(k=>k.trim()===prefix);
  if(matches.length===1)return matches[0];
  throw new Error('REVISION_WAREHOUSE_MISSING_OR_AMBIGUOUS:'+label);
 };
 const changes=[];
 const amended={...invoice,...proposed,id:invoice.id,invoiceNumber:invoice.invoiceNumber,
  isOfficial:true,isAccountingPosted:true,postedAt:invoice.postedAt,
  updatedAt:now,
  statusHistory:[...(invoice.statusHistory||[]),{
   id:group,userName:'معالجة مركزية',
   date:String(now).slice(0,10),createdAt:now,
   previousStatus:invoice.workflowStatus||'new',
   newStatus:proposed.workflowStatus||invoice.workflowStatus||'new',
   notes:'اعتماد تعديل الفاتورة محاسبيًا - '+group
  }]};
 changes.push({entity:'invoices',id:invoice.id,expectedVersion:invoiceVersion,value:amended});
 const revenue=journal('je-'+commandId+'-revenue',invoice,group,'revenue',
  '1201','4101',plan.totalDeltaMinor,
  'صافي تعديل مبيعات '+invoice.invoiceNumber,now);
 if(revenue)changes.push({...revenue,expectedVersion:0});
 const costDelta=plan.expectedNextCOGSMinor-plan.currentCOGSMinor;
 const cogs=journal('je-'+commandId+'-cogs',invoice,group,'cogs',
  '5101','1301',costDelta,
  'صافي تعديل تكلفة المبيعات '+invoice.invoiceNumber,now);
 if(cogs)changes.push({...cogs,expectedVersion:0});
 for(const row of plan.stockDeltas){
  const item=inventoryIndex.get(row.itemId);
  if(!item||!Number.isSafeInteger(item.version)||item.version<1)
   throw new Error('REVISION_INVENTORY_AUTHORITATIVE_RECORD_REQUIRED:'+row.itemId);
  if(!Number.isFinite(Number(item.value?.stockQuantity)))
   throw new Error('REVISION_INVENTORY_STOCK_BALANCE_REQUIRED:'+row.itemId);
  const warehouseKey=item.value?.warehouseStocks&&Object.keys(item.value.warehouseStocks).length
    ? resolveWarehouseKey(item.value.warehouseStocks,invoice.warehouse):undefined;
  if(warehouseKey){
   const warehouses=Object.values(item.value.warehouseStocks);
   const aggregate=warehouses.reduce((s,v)=>s+Number(v),0);
   if(!warehouses.every(v=>Number.isFinite(Number(v))))
    throw new Error('REVISION_WAREHOUSE_STOCK_INVALID:'+row.itemId);
  // Legacy imports may have a stale global stock and a separately tracked
  // warehouse quantity. Do NOT rewrite either to the other's value. Apply
  // only the same verified invoice delta to both and retain their original
  // discrepancy for an independent inventory reconciliation audit.
   if(!Object.hasOwn(item.value.warehouseStocks,warehouseKey))
    throw new Error('REVISION_WAREHOUSE_MISSING:'+row.itemId);
  }
  const next=Number(item.value.stockQuantity)+row.inventoryChange;
  if(next<0)throw new Error('REVISION_WOULD_NEGATE_STOCK:'+row.itemId);
  const warehouseStocks=warehouseKey?{
   ...item.value.warehouseStocks,
   [warehouseKey]:Number(item.value.warehouseStocks[warehouseKey])+row.inventoryChange
  }:undefined;
  if(warehouseStocks&&warehouseStocks[warehouseKey]<0)
   throw new Error('REVISION_WOULD_NEGATE_WAREHOUSE:'+row.itemId);
  const moveId='sm-'+commandId+'-'+row.itemId;
  const unitPrice=Number(plan.costByItem[row.itemId]);
  if(!Number.isFinite(unitPrice)||unitPrice<0)throw new Error('REVISION_COST_UNAVAILABLE');
  changes.push({entity:'stockMovements',id:moveId,expectedVersion:0,value:{
   id:moveId,date:String(now).slice(0,10),
   type:row.inventoryChange>0?'in_adjustment':'out_adjustment',
   itemId:row.itemId,quantity:Math.abs(row.inventoryChange),
   unitPrice,totalValue:money(minor(unitPrice*Math.abs(row.inventoryChange))),
   referenceType:'invoice_correction',referenceNumber:invoice.invoiceNumber,
   sourceInvoiceId:invoice.id,correctionGroupId:group,
   internalCorrection:true,approvedRevision:true,
   reason:'تصحيح فرق كمية الفاتورة المعتمدة '+invoice.invoiceNumber,
   balanceBefore:Number(item.value.stockQuantity),balanceAfter:next
  }});
  changes.push({entity:'inventory',id:row.itemId,expectedVersion:item.version,
   value:{...item.value,stockQuantity:next,...(warehouseStocks?{warehouseStocks}:{})}});
 }
 for(const row of plan.customerBalanceChanges){
  const party=partyIndex.get(row.partyId);
  if(!party||!Number.isSafeInteger(party.version)||party.version<1||
    !Number.isFinite(balance(party)))
   throw new Error('REVISION_PARTY_AUTHORITATIVE_BALANCE_REQUIRED:'+row.partyId);
  const current=minor(balance(party)),next=current+row.amountMinor;
  changes.push({entity:'parties',id:row.partyId,expectedVersion:party.version,
   value:{...party.value,balance:money(next)}});
 }
 if(changes.length>80)throw new Error('REVISION_BUNDLE_TOO_LARGE');
 const keys=new Set();
 for(const change of changes){
  const key=change.entity+'\u001f'+change.id;
  if(keys.has(key))throw new Error('REVISION_DUPLICATE_RECORD');
  keys.add(key);
 }
 return {id:commandId,workspaceId:'lobnan_main',changes,
  revisionInvoiceId:invoice.id,revisionGroupId:group};
}
