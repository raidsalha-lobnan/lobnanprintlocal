import type {InventoryItem} from '../types';

export interface PurchaseLineDraft{
 key:string;
 itemId:string;itemName:string;itemCode:string;barcode:string;
 notes:string;unit:string;unitCalculationType:'area'|'linear'|'unit'|'custom';
 hasDimensions:boolean;length:number;width:number;count:number;
 quantity:number;unitPrice:number;discount:number;
}
export const precision=(n:number,p=3)=>Number(Number(n).toFixed(p));
export const emptyPurchaseLine=():PurchaseLineDraft=>({
 key:'purchase-row-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
 itemId:'',itemName:'',itemCode:'',barcode:'',notes:'',unit:'',
 unitCalculationType:'unit',hasDimensions:false,length:1,width:1,
 count:1,quantity:1,unitPrice:0,discount:0
});
export const purchaseLineQuantity=(r:PurchaseLineDraft):number=>r.hasDimensions?
 precision(r.length*(r.unitCalculationType==='linear'?1:r.width)*r.count):
 precision(r.quantity);
export function purchaseLineAmounts(r:PurchaseLineDraft,taxRate:number){
 const quantity=purchaseLineQuantity(r);
 const gross=precision(quantity*r.unitPrice,2);
 const discount=precision(r.discount,2);
 const net=precision(gross-discount,2);
 const tax=precision(Math.max(0,net)*taxRate/100,2);
 return {quantity,gross,discount,net,tax,total:precision(net+tax,2)};
}
export const purchaseLineValid=(r:PurchaseLineDraft,taxRate:number)=>{
 const a=purchaseLineAmounts(r,taxRate);
 return !!r.itemId&&Number.isFinite(a.quantity)&&a.quantity>0&&
 Number.isFinite(r.unitPrice)&&r.unitPrice>=0&&
 Number.isFinite(r.discount)&&r.discount>=0&&
 r.discount<=a.gross&&Number.isFinite(taxRate)&&taxRate>=0&&taxRate<=100&&
 (!r.hasDimensions||(r.length>0&&r.width>0&&r.count>0));
};
export const purchaseLineSummary=(rows:PurchaseLineDraft[],taxRate:number)=>{
 const sum=(key:'gross'|'discount'|'net'|'tax'|'total')=>
  precision(rows.reduce((acc,row)=>acc+purchaseLineAmounts(row,taxRate)[key],0),2);
 return {gross:sum('gross'),discount:sum('discount'),subtotal:sum('net'),
  tax:sum('tax'),total:sum('total'),
  quantity:precision(rows.reduce((acc,row)=>acc+purchaseLineQuantity(row),0),3),
  valid:rows.length>0&&rows.every(r=>purchaseLineValid(r,taxRate))};
};
export function purchaseDraftForItem(item:InventoryItem,old?:PurchaseLineDraft):PurchaseLineDraft{
 const base=old||emptyPurchaseLine();
 const unit=String(item.unit||'قطعة');
 const calculationType=(item.unitCalculationType||
  (/متر مربع|م²|m²|sqm|m2/i.test(unit)?'area':
   /متر طولي|linear/i.test(unit)?'linear':'unit'));
 const hasDimensions=calculationType==='area'||calculationType==='linear';
 const length=base.hasDimensions?base.length:1;
 const width=calculationType==='linear'?1:base.hasDimensions?base.width:1;
 const count=base.hasDimensions?base.count:1;
 const quantity=hasDimensions?precision(length*(calculationType==='linear'?1:width)*count):
  base.itemId?base.quantity:1;
 return {...base,itemId:item.id,itemName:item.name,itemCode:item.code,
  barcode:item.barcode||'',unit,unitCalculationType:calculationType,
  hasDimensions,length,width,count,quantity,unitPrice:Number(item.purchasePrice)||0};
}

