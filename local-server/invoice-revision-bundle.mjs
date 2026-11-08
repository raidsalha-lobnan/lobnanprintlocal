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
 partyRecords,inventoryRecords,treasuryRecords=[],commandId,now
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
 const treasuryByCode=new Map();
 for(const row of treasuryRecords){
  const code=row.value?.accountCode;
  if(!code||treasuryByCode.has(code))
   throw new Error('REVISION_TREASURY_ACCOUNT_AMBIGUOUS:'+code);
  treasuryByCode.set(code,row);
 }
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
 const accountDeltas=plan.accountDeltas||{
  '1201':plan.totalDeltaMinor,'4101':-plan.totalDeltaMinor
 };
 const lines=Object.entries(accountDeltas).filter(([,amount])=>amount!==0)
  .map(([accountCode,amount])=>({
   accountCode,debit:amount>0?money(amount):0,
   credit:amount<0?money(-amount):0,
   description:'تسوية الفاتورة '+invoice.invoiceNumber
  }));
 if(lines.length){
  const financial={id:'je-'+commandId+'-financial',
   date:String(now).slice(0,10),createdAt:now,
   description:'تصحيح مالي معتمد للفاتورة '+invoice.invoiceNumber,
   referenceType:'invoice_correction',referenceId:invoice.id,
   correctionGroupId:group,correctionKind:'financial',
   internalCorrection:true,approvedRevision:true,lines};
  validateJournal(financial);
  changes.push({entity:'journalEntries',id:financial.id,
   expectedVersion:0,value:financial});
 }
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
 // Record settlement differences without rewriting original receipts.
 // A negative delta is a refund/reallocation, never an unrecorded cash disappearance.
 for(const [accountCode,amountMinor] of Object.entries(plan.paymentDeltas||{})){
  if(!amountMinor)continue;
  const treasury=treasuryByCode.get(accountCode);
  if(!treasury||!Number.isSafeInteger(treasury.version)||treasury.version<1||
    !Number.isFinite(Number(treasury.value?.balance)))
   throw new Error('REVISION_TREASURY_AUTHORITATIVE_RECORD_REQUIRED:'+accountCode);
  const current=minor(treasury.value.balance);
  const updated=current+amountMinor;
  if(updated<0)throw new Error('REVISION_TREASURY_INSUFFICIENT_BALANCE:'+accountCode);
  const currency=treasury.value.currency||'ILS';
  if(currency!=='ILS' && Object.keys(treasury.value.currencyBalances||{}).length)
   throw new Error('REVISION_MULTICURRENCY_SETTLEMENT_NEEDS_CURRENCY_RECONCILIATION');
  const currencyBalances=treasury.value.currencyBalances?
   {...treasury.value.currencyBalances,
    ILS:money(minor(treasury.value.currencyBalances.ILS||0)+amountMinor)}:undefined;
  if(currencyBalances&&currencyBalances.ILS<0)
   throw new Error('REVISION_TREASURY_CURRENCY_INSUFFICIENT:'+accountCode);
  const id='tt-'+commandId+'-'+accountCode;
  const movement={
   id,treasuryId:treasury.id,treasuryName:treasury.value.name,
   date:String(now).slice(0,10),type:amountMinor>0?'deposit':'withdrawal',
   amount:money(Math.abs(amountMinor)),currency:'ILS',currencySymbol:'₪',
   exchangeRate:1,baseCurrency:'ILS',baseAmount:money(Math.abs(amountMinor)),
   balanceAfter:money(updated),referenceType:'invoice',referenceId:invoice.id,
   voucherNumber:invoice.invoiceNumber,partyName:proposed.customerName,
   description:'تسوية تحصيل فاتورة معتمدة '+invoice.invoiceNumber,
   contraAccountCode:'1201',paymentMethod:proposed.paymentMethod,
   notes:'revision-'+commandId
  };
  changes.push({entity:'treasuryTransactions',id,expectedVersion:0,value:movement});
  changes.push({entity:'treasuries',id:treasury.id,
   expectedVersion:treasury.version,value:{
    ...treasury.value,balance:money(updated),
    ...(currencyBalances?{currencyBalances}:{}),
    transactions:[...(treasury.value.transactions||[]),movement]
   }});
  const voucherId='vch-revision-'+commandId+'-'+accountCode;
  changes.push({entity:'vouchers',id:voucherId,expectedVersion:0,value:{
   id:voucherId,voucherNumber:'REV-'+commandId.slice(0,12)+'-'+accountCode,
   type:amountMinor>0?'receipt':'payment',
   date:String(now).slice(0,10),partyId:proposed.customerId||'',
   partyName:proposed.customerName||'',amount:money(Math.abs(amountMinor)),
   paymentMethod:'cash',accountCode:'1201',
   treasuryAccountCode:accountCode,
   referenceInvoiceId:invoice.id,relatedDocType:'invoice_revision',
   relatedDocId:invoice.id,description:'سند تسوية تحصيل الفاتورة '+invoice.invoiceNumber,
   currency:'ILS',currencySymbol:'₪',exchangeRate:1,
   baseAmount:money(Math.abs(amountMinor))
  }});
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
