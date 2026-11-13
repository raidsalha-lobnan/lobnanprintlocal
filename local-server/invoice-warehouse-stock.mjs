// Quantity below zero is a legitimate sale without an opening stock entry.
// No opening inventory, receipt or warehouse is synthesized by this module.
const round=v=>Number(Number(v).toFixed(6));
const qty=(v,field,{allowNegative=false}={})=>{
 const n=Number(v);
 if(!Number.isFinite(n)||Math.abs(n)>1e9||(!allowNegative&&n<0))
  throw new Error('REVISION_INVALID_WAREHOUSE_QUANTITY:'+field);
 return round(n);
};
export function resolveStockWarehouseKey(stocks,label){
 if(Object.hasOwn(stocks||{},label))return label;
 const prefix=String(label||'').trim().split(/\\s*[-–—]\\s*/)[0];
 const matches=Object.keys(stocks||{}).filter(k=>k.trim()===prefix);
 if(matches.length!==1)
  throw new Error('REVISION_WAREHOUSE_MISSING_OR_AMBIGUOUS:'+label);
 return matches[0];
}
/**
 * The registered warehouse directory, not duplicate cached inventory fields,
 * determines whether the business has one or several actual warehouses.
 * With one registered warehouse, stockQuantity is the single aggregate source
 * and its lone warehouse stock cache mirrors it (including negative balances).
 * Previously mismatched warehouse cache values are returned for auditing.
 * With multiple registered warehouses, the recorded per-warehouse balances
 * remain the canonical breakdown and are allowed to become negative.
 */
export function computeInvoiceStockRevision({
 itemId,inventoryValue,invoiceWarehouse,nextWarehouse,
  originalQuantity,newQuantity,registeredWarehouseCount,singleWarehouseName=null
}){
 const oldQty=qty(originalQuantity,itemId+'.original');
 const newQty=qty(newQuantity,itemId+'.proposed');
 const originalAggregate=qty(inventoryValue?.stockQuantity,itemId+'.aggregate',{allowNegative:true});
 const aggregateDelta=round(oldQty-newQty);
 const map=inventoryValue?.warehouseStocks;
 const hasMap=map&&typeof map==='object'&&!Array.isArray(map)&&Object.keys(map).length>0;
 const singleWarehouse=registeredWarehouseCount===1;
 if(singleWarehouse){
  const entries=hasMap?Object.entries(map):[];
   if(entries.length>1){
    // Historically duplicated presentation caches are not stock movements.
    // A single registered warehouse must use stockQuantity as authority.
    // Only the documented two aliases of the *registered* warehouse qualify.
    const names=new Set(['المخزن الرئيسي','المستودع الرئيسي']);
    const official=String(singleWarehouseName||'').trim();
    const aliases=new Set(entries.map(([key])=>String(key).trim()));
    if(!names.has(official)||aliases.size!==2||
       ![...aliases].every(key=>names.has(key))||!aliases.has(official))
      throw new Error('REVISION_SINGLE_WAREHOUSE_HAS_AMBIGUOUS_LEGACY_KEYS:'+itemId);
    const cache={};
    for(const [key,value] of entries)
      cache[key]=qty(value,itemId+'.'+key,{allowNegative:true});
    const next=round(originalAggregate+aggregateDelta);
    return {
      previousTotal:originalAggregate,nextTotal:next,aggregateDelta,
      originalAggregate,normalized:true,legacyAliasReconciliation:true,
      priorWarehouseCaches:cache,previousWarehouseCache:cache[official],
      warehouseStocks:{[official]:next},
      oldWarehouseKey:official,newWarehouseKey:official,
      transferred:false,singleWarehouse:true
    };
   }
  const existingKey=entries[0]?.[0];
  const recorded=existingKey===undefined?undefined:
   qty(entries[0][1],itemId+'.'+existingKey,{allowNegative:true});
  const next=round(originalAggregate+aggregateDelta);
  return {
   previousTotal:originalAggregate,nextTotal:next,aggregateDelta,
   originalAggregate,normalized:recorded!==undefined&&Math.abs(recorded-originalAggregate)>0.000001,
   previousWarehouseCache:recorded,
   warehouseStocks:existingKey===undefined?undefined:{[existingKey]:next},
   oldWarehouseKey:existingKey||invoiceWarehouse,newWarehouseKey:existingKey||nextWarehouse,
   transferred:false,singleWarehouse:true
  };
 }
 if(!hasMap){
  if(registeredWarehouseCount>1&&invoiceWarehouse!==nextWarehouse)
   throw new Error('REVISION_WAREHOUSE_STOCK_NOT_PROVEN:'+itemId);
  const next=round(originalAggregate+aggregateDelta);
  return {previousTotal:originalAggregate,nextTotal:next,
   aggregateDelta,normalized:false,warehouseStocks:undefined,
   oldWarehouseKey:invoiceWarehouse,newWarehouseKey:nextWarehouse,
   transferred:false,singleWarehouse:false};
 }
 const stocks={...map};
 for(const [warehouse,value] of Object.entries(stocks))
  stocks[warehouse]=qty(value,itemId+'.'+warehouse,{allowNegative:true});
 const oldKey=resolveStockWarehouseKey(stocks,invoiceWarehouse);
 const newKey=resolveStockWarehouseKey(stocks,nextWarehouse);
 const transferred=oldKey!==newKey;
 const previousTotal=round(Object.values(stocks).reduce((sum,stock)=>sum+Number(stock),0));
 if(transferred){
  stocks[oldKey]=round(stocks[oldKey]+oldQty);
  stocks[newKey]=round(stocks[newKey]-newQty);
 }else{
  stocks[oldKey]=round(stocks[oldKey]+aggregateDelta);
 }
 const nextTotal=round(Object.values(stocks).reduce((sum,stock)=>sum+Number(stock),0));
 if(Math.abs(nextTotal-previousTotal-aggregateDelta)>0.000001)
  throw new Error('REVISION_STOCK_DELTA_MISMATCH:'+itemId);
 return {previousTotal,nextTotal,aggregateDelta,
  normalized:Math.abs(originalAggregate-previousTotal)>0.000001,
  originalAggregate,warehouseStocks:stocks,
  oldWarehouseKey:oldKey,newWarehouseKey:newKey,transferred,
  singleWarehouse:false};
}
