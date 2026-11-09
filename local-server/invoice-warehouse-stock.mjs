// A warehouse-specific quantity is the authoritative physical balance when
// the legacy aggregate stockQuantity is out of sync with warehouseStocks.
// Never manufacture an opening movement to reconcile the presentation cache.
const round=v=>Number(Number(v).toFixed(6));
const qty=(v,field)=>{
 const n=Number(v);
 if(!Number.isFinite(n)||n<0||n>1e9)throw new Error('REVISION_INVALID_WAREHOUSE_QUANTITY:'+field);
 return round(n);
};
export function resolveStockWarehouseKey(stocks,label){
 if(Object.hasOwn(stocks||{},label))return label;
 const prefix=String(label||'').trim().split(/\s*[-–—]\s*/)[0];
 const matches=Object.keys(stocks||{}).filter(k=>k.trim()===prefix);
 if(matches.length!==1)
  throw new Error('REVISION_WAREHOUSE_MISSING_OR_AMBIGUOUS:'+label);
 return matches[0];
}

/**
 * Single-source quantity calculation. All returned values are derived from
 * the same record version locked by PostgreSQL for the invoice transaction.
 * A mismatching legacy stockQuantity is explicitly flagged for audit; stock
 * is neither silently added nor allowed to go below zero.
 */
export function computeInvoiceStockRevision({
 itemId,inventoryValue,invoiceWarehouse,nextWarehouse,originalQuantity,newQuantity
}){
 const oldQty=qty(originalQuantity,itemId+'.original');
 const newQty=qty(newQuantity,itemId+'.proposed');
 const originalAggregate=Number(inventoryValue?.stockQuantity);
 if(!Number.isFinite(originalAggregate)||originalAggregate<0)
  throw new Error('REVISION_INVENTORY_STOCK_BALANCE_REQUIRED:'+itemId);
 const aggregateDelta=round(oldQty-newQty);
 const map=inventoryValue?.warehouseStocks;
 const hasWarehouses=map&&typeof map==='object'&&!Array.isArray(map)&&Object.keys(map).length>0;
 if(!hasWarehouses){
  if(invoiceWarehouse!==nextWarehouse)
   throw new Error('REVISION_WAREHOUSE_STOCK_NOT_PROVEN:'+itemId);
  const next=round(originalAggregate+aggregateDelta);
  if(next<0)throw new Error('REVISION_WOULD_NEGATE_STOCK:'+itemId);
  return {
   previousTotal:round(originalAggregate),nextTotal:next,
   aggregateDelta,normalized:false,warehouseStocks:undefined,
   oldWarehouseKey:invoiceWarehouse,newWarehouseKey:nextWarehouse,
   transferred:false
  };
 }
 const stocks={...map};
 for(const [warehouse,value] of Object.entries(stocks)){
  stocks[warehouse]=qty(value,itemId+'.'+warehouse);
 }
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
 if(Object.entries(stocks).some(([,value])=>value<0))
  throw new Error('REVISION_WOULD_NEGATE_WAREHOUSE:'+itemId);
 const nextTotal=round(Object.values(stocks).reduce((sum,stock)=>sum+Number(stock),0));
 if(Math.abs(nextTotal-previousTotal-aggregateDelta)>0.000001)
  throw new Error('REVISION_STOCK_DELTA_MISMATCH:'+itemId);
 return {
  previousTotal,nextTotal,aggregateDelta,normalized:Math.abs(originalAggregate-previousTotal)>0.000001,
  originalAggregate:round(originalAggregate),
  warehouseStocks:stocks,
  oldWarehouseKey:oldKey,newWarehouseKey:newKey,transferred
 };
}
