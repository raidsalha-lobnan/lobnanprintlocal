import {validateJournal} from './sync-domain.mjs';
import {computeInvoiceStockRevision} from './invoice-warehouse-stock.mjs';
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
 partyRecords,inventoryRecords,treasuryRecords=[],registeredWarehouseCount=0,
  singleWarehouseId=null,singleWarehouseName=null,commandId,now
}){
 if(!commandId||!now||!invoice?.id||!Number.isSafeInteger(invoiceVersion)||invoiceVersion<1)
  throw new Error('REVISION_MISSING_IDENTIFIERS_OR_VERSION');
 const group='revision-'+commandId;
 const partyIndex=new Map(partyRecords.map(r=>[r.id,r]));
 const inventoryIndex=new Map(inventoryRecords.map(r=>[r.id,r]));
 const treasuryByCode=new Map();
 for(const row of treasuryRecords){
  const code=row.value?.accountCode;
  if(!code||treasuryByCode.has(code))
   throw new Error('REVISION_TREASURY_ACCOUNT_AMBIGUOUS:'+code);
  treasuryByCode.set(code,row);
 }
 const changes=[];
 const changedDimensions={};
 for(const field of ['date','warehouse','exchangeRate','currency']){
  if(JSON.stringify(invoice[field]??null)!==JSON.stringify(proposed[field]??null))
   changedDimensions[field]={previous:invoice[field]??null,current:proposed[field]??null};
 }
 const amended={...invoice,...proposed,id:invoice.id,invoiceNumber:invoice.invoiceNumber,
  isOfficial:true,isAccountingPosted:true,postedAt:invoice.postedAt,
  updatedAt:now,
  statusHistory:[...(invoice.statusHistory||[]),{
   id:group,userName:'معالجة مركزية',
   date:String(now).slice(0,10),createdAt:now,
   previousStatus:invoice.workflowStatus||'new',
   newStatus:proposed.workflowStatus||invoice.workflowStatus||'new',
   notes:'اعتماد تعديل الفاتورة محاسبيًا - '+group,
   // Visible only in the invoice audit trail, not as a separate sale
   // or a second invoice on operational reports.
   revisionChanges:changedDimensions
  }],
  baseRemainingAmount:money(
   minor(proposed.baseTotalAmount??proposed.totalAmount*Number(proposed.exchangeRate||1))-
   minor(proposed.basePaidAmount??proposed.paidAmount*Number(proposed.exchangeRate||1))
  )};
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
 // A warehouse correction restocks the wrong source and issues from the
 // correct warehouse. Overall stock changes only by the quantity difference.
 const warehouseChanged=invoice.warehouse!==proposed.warehouse;
 const quantities=(lines)=>{
  const map=new Map();
  for(const line of lines||[]){
   if(['services','copy_scan'].includes(line.category)||
      ['srv-delivery','srv-delivery-mobile'].includes(line.itemId))continue;
   map.set(line.itemId,(map.get(line.itemId)||0)+Number(line.quantity));
  }
  return map;
 };
 const originalQuantities=quantities(invoice.items);
 const proposedQuantities=quantities(proposed.items);
 const affectedIds=warehouseChanged
  ?[...new Set([...originalQuantities.keys(),...proposedQuantities.keys()])]
  :plan.stockDeltas.map(row=>row.itemId);
 for(const itemId of affectedIds){
  const item=inventoryIndex.get(itemId);
  if(!item||!Number.isSafeInteger(item.version)||item.version<1)
   throw new Error('REVISION_INVENTORY_AUTHORITATIVE_RECORD_REQUIRED:'+itemId);
  const oldQty=originalQuantities.get(itemId)||0;
  const newQty=proposedQuantities.get(itemId)||0;
  const stock=computeInvoiceStockRevision({
   itemId,inventoryValue:item.value,
   invoiceWarehouse:invoice.warehouse,nextWarehouse:proposed.warehouse,
   originalQuantity:oldQty,newQuantity:newQty,
    registeredWarehouseCount,singleWarehouseName
   });
  const current=stock.previousTotal,next=stock.nextTotal;
  const globalDelta=stock.aggregateDelta;
  const stocks=stock.warehouseStocks;
  const oldKey=stock.oldWarehouseKey,newKey=stock.newWarehouseKey;
  const transfer=stock.transferred;
  if(!transfer&&Math.abs(globalDelta)<0.000001&&!stock.normalized)continue;
  const unitPrice=Number(plan.costByItem[itemId]);
  if(!Number.isFinite(unitPrice)||unitPrice<0)
   throw new Error('REVISION_COST_UNAVAILABLE:'+itemId);
  const emitMovement=(kind,qty,warehouseKey,before,after,suffix)=>{
   if(qty<=0)return;
   const id='sm-'+commandId+'-'+itemId+'-'+suffix;
   changes.push({entity:'stockMovements',id,expectedVersion:0,value:{
    id,date:String(now).slice(0,10),type:kind,itemId,
    quantity:qty,unitPrice,totalValue:money(minor(unitPrice*qty)),
    referenceType:'invoice_correction',referenceNumber:invoice.invoiceNumber,
    sourceInvoiceId:invoice.id,correctionGroupId:group,
    internalCorrection:true,approvedRevision:true,
    warehouse:warehouseKey,warehouseKey,
    reason:transfer?'تصحيح مخزن الفاتورة '+invoice.invoiceNumber:
      'تصحيح كمية الفاتورة '+invoice.invoiceNumber,
    balanceBefore:before,balanceAfter:after
   }});
  };
  if(transfer){
   emitMovement('in_adjustment',oldQty,oldKey,current,
    Number((current+oldQty).toFixed(6)),'return');
   emitMovement('out_adjustment',newQty,newKey,
    Number((current+oldQty).toFixed(6)),next,'issue');
  }else{
   emitMovement(globalDelta>0?'in_adjustment':'out_adjustment',
    Math.abs(globalDelta),oldKey||invoice.warehouse,current,next,'difference');
  }
  changes.push({entity:'inventory',id:itemId,expectedVersion:item.version,
   value:{
    ...item.value,stockQuantity:next,...(stocks?{warehouseStocks:stocks}:{}),
    ...(registeredWarehouseCount===1&&singleWarehouseId?
     {warehouseStock:{[singleWarehouseId]:next}}:{}),
    ...(stock.normalized?{inventoryBalanceReconciliations:[
     ...(item.value.inventoryBalanceReconciliations||[]),
     {
      id:'stock-balance-'+commandId+'-'+itemId,
      date:now,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,
      reason:registeredWarehouseCount===1
       ?'Single registered warehouse: legacy warehouse cache disagreed with stockQuantity'
       :'Legacy aggregate quantity disagreed with the separate warehouse balances',
      priorAggregate:stock.originalAggregate,
       priorWarehouseCache:stock.previousWarehouseCache,
       ...(stock.priorWarehouseCaches?{
        priorWarehouseCaches:stock.priorWarehouseCaches,
        canonicalWarehouseName:singleWarehouseName,
        legacyAliasReconciliation:true,
        noSyntheticOpeningStock:true
       }:{}),
      authoritativeQuantityBefore:stock.previousTotal,
      authoritativeQuantityAfter:stock.nextTotal,
      stockMovementDelta:globalDelta,
      singleRegisteredWarehouse:registeredWarehouseCount===1,
      requiresStockValuationReview:true
     }
    ]}:{})
   }});
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
  if(currency!=='ILS')
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
   date:String(now).slice(0,10),
   partyId:(amountMinor>0?proposed.customerId:invoice.customerId)||'',
   partyName:amountMinor>0?(proposed.customerName||''):(invoice.customerName||''),
   amount:money(Math.abs(amountMinor)),
   paymentMethod:treasury.value.type==='cash_box'?'cash':'bank_transfer',
   accountCode:'1201',
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
  const recorded=minor(balance(party));
  const proven=plan.verifiedPartyBalances?.[row.partyId];
  const starting=proven?.balanceMinor??recorded;
  if(!Number.isSafeInteger(starting))throw new Error('REVISION_UNVERIFIED_CUSTOMER_BALANCE:'+row.partyId);
  const next=starting+row.amountMinor;
  changes.push({entity:'parties',id:row.partyId,expectedVersion:party.version,
   value:{
    ...party.value,balance:money(next),
    ...(proven&&starting!==recorded?{
     partyBalanceReconciliations:[
      ...(party.value.partyBalanceReconciliations||[]),
      {
       id:'party-balance-'+commandId+'-'+row.partyId,
       date:now,invoiceId:invoice.id,
       priorCachedBalance:money(recorded),
       provenInvoiceOnlyBalanceBefore:money(starting),
       verifiedInvoiceCount:proven.sourceInvoiceCount,
       invoiceAmendmentDelta:money(row.amountMinor),
       correctedCachedBalance:money(next),
       reason:'Prior cached balance omitted verified unpaid invoices; all linked account-1201 postings reconciled'
      }
     ]
    }: {})
   }});
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
