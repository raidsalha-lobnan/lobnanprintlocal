// Keep stockQuantity and the two historical warehouse presentation maps
// aligned when a real stock movement is committed to the ONE registered
// warehouse. No opening balance or artificial stock receipt is created.
const number=v=>{
 const n=Number(v);
 if(!Number.isFinite(n)||Math.abs(n)>1e9)
  throw new Error('SINGLE_WAREHOUSE_STOCK_INVALID');
 return Number(n.toFixed(6));
};
const oneMapKey=value=>value&&typeof value==='object'&&
 !Array.isArray(value)?Object.keys(value):[];
export function normalizeSingleWarehouseInventory({
 previous,next,warehouseId,warehouseName=null,commandId,now,atomicSale=false
}){
 if(!next||typeof next!=='object'||!warehouseId)return next;
 const hasStock=next.stockQuantity!==undefined&&next.stockQuantity!==null;
 if(!hasStock)return next;
 const nextStock=number(next.stockQuantity);
 const original=previous?.stockQuantity;
 // Changing item description or pricing must never implicitly rewrite
 // historical stock caches. A quantity-changing transaction is the trigger.
 if(original!==undefined&&original!==null&&
    number(original)===nextStock)return next;
 const legacyKeys=oneMapKey(next.warehouseStocks);
 const registeredKeys=oneMapKey(next.warehouseStock);
 const official=String(warehouseName||'').trim();
 const verifiedAliases=new Set(['المخزن الرئيسي','المستودع الرئيسي']);
 const areKnownAliases=verifiedAliases.has(official)&&legacyKeys.length===2&&
  legacyKeys.every(key=>verifiedAliases.has(key))&&
  legacyKeys.includes(official)&&registeredKeys.every(key=>key===warehouseId);
 if(areKnownAliases){
  // The directory has exactly ONE registered warehouse. These two keys are
  // alternate *presentation* labels, not two stock holdings. Trust the
  // PostgreSQL-locked stockQuantity; preserve both prior snapshots for audit,
  // and never create an opening stock or an inventory movement here.
  const alreadyProven=(next.inventoryBalanceReconciliations||[]).some(row=>
   row.reason==='Verified two historical display aliases of one registered warehouse');
  const previousCaches={...next.warehouseStocks};
  const updated={...next,stockQuantity:nextStock,
   warehouseStocks:{[official]:nextStock},
   warehouseStock:{[warehouseId]:nextStock}};
  if(!alreadyProven){
   updated.inventoryBalanceReconciliations=[
    ...(Array.isArray(next.inventoryBalanceReconciliations)?next.inventoryBalanceReconciliations:[]),
    {id:'verified-single-warehouse-alias-'+commandId+'-'+next.id,
     date:now,source:'sync-postgresql',
     reason:'Verified two historical display aliases of one registered warehouse',
     registeredWarehouseId:warehouseId,registeredWarehouseName:official,
     historicalPresentationCaches:previousCaches,
     previousStockQuantity:number(original??0),newStockQuantity:nextStock,
     stockMovementDelta:number(nextStock-number(original??0)),
     noSyntheticOpeningStock:true,noAdditionalStockMovement:true}
   ];
  }
  return updated;
 }
 if(legacyKeys.length>1||registeredKeys.some(key=>key!==warehouseId)){
  if(!atomicSale)throw new Error('SINGLE_WAREHOUSE_UNVERIFIED_LEGACY_KEYS');
  // A posted sale must not get trapped by unrelated historical warehouse
  // labels. Do not merge, delete, add or infer stock from these opaque maps.
  // The authoritative stockQuantity is already computed from the locked SQL
  // snapshot; only the registered warehouse mirror can be refreshed.
  const previousRegistered=oneMapKey(next.warehouseStock).length
    ?next.warehouseStock:{};
  const firstReview=!previous?.warehouseCacheReconciliationRequired;
  return {
   ...next,stockQuantity:nextStock,
   warehouseStock:{...previousRegistered,[warehouseId]:nextStock},
   warehouseCacheReconciliationRequired:true,
   ...(firstReview?{inventoryBalanceReconciliations:[
    ...(Array.isArray(next.inventoryBalanceReconciliations)?next.inventoryBalanceReconciliations:[]),
    {id:'legacy-warehouse-review-'+commandId+'-'+next.id,
     date:now,source:'sync-postgresql',
     reason:'Historical warehouse cache keys need independent review',
     registeredWarehouseId:warehouseId,
     unverifiedLegacyKeys:legacyKeys,unverifiedRegisteredKeys:registeredKeys.filter(k=>k!==warehouseId),
     stockMovementDelta:number(nextStock-number(original??0)),
     noSyntheticOpeningStock:true,noHistoricalCacheMerge:true}
   ]}:{})
  };
 }
 const oldCache=legacyKeys.length?number(next.warehouseStocks[legacyKeys[0]]):null;
 const oldRegisteredCache=registeredKeys.length?
  number(next.warehouseStock[warehouseId]):null;
 const nextValue={
  ...next,stockQuantity:nextStock,
  warehouseStock:{[warehouseId]:nextStock},
  ...(legacyKeys.length?{
   warehouseStocks:{[legacyKeys[0]]:nextStock}
  }:{})
 };
 // Compare the OLD mirror to the OLD authoritative quantity. Comparing
 // to nextStock would flag every legitimate sale/receipt as a reconciliation.
 const oldMismatch=[oldCache,oldRegisteredCache].some(x=>x!==null&&
  Math.abs(x-number(original??0))>0.000001);
 if(oldMismatch){
  nextValue.inventoryBalanceReconciliations=[
   ...(next.inventoryBalanceReconciliations||[]),
   {id:'single-warehouse-'+commandId+'-'+next.id,
    date:now,source:'sync-postgresql',reason:'Mirror single registered warehouse after posted stock change',
    previousLegacyCache:oldCache,previousRegisteredCache:oldRegisteredCache,
    newStockQuantity:nextStock,warehouseId,
    stockMovementDelta:number(nextStock-number(original??0)),
    noSyntheticOpeningStock:true}
  ];
 }
 return nextValue;
}
