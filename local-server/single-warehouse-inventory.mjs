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
 previous,next,warehouseId,commandId,now
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
 if(legacyKeys.length>1||registeredKeys.some(key=>key!==warehouseId))
  throw new Error('SINGLE_WAREHOUSE_UNVERIFIED_LEGACY_KEYS');
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
 const oldMismatch=[oldCache,oldRegisteredCache].some(x=>x!==null&&
  Math.abs(x-nextStock)>0.000001);
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
