/* Approved catalog relabeling, with the audited PRI-0015 identity merge.
   Pure functions only: production writes remain an independently guarded operation. */
export const APPROVED_CATEGORIES=Object.freeze([
 {id:'print_raw',name:'مطبعة',nameEn:'Printing',prefix:'PRI',description:'أصناف المطبعة',defaultUnit:'حبة',color:'bg-sky-50 text-sky-700'},
 {id:'stationery',name:'مكتبة وقرطاسية',nameEn:'Library & Stationery',prefix:'BOK',description:'أصناف المكتبة والقرطاسية',defaultUnit:'حبة',color:'bg-violet-50 text-violet-700'},
 {id:'office_supplies',name:'أصناف متنوعة واكسسوارات',nameEn:'Accessories & Miscellaneous',prefix:'ACC',description:'أصناف متنوعة واكسسوارات',defaultUnit:'حبة',color:'bg-amber-50 text-amber-700'},
]);
const BOOK_IDS=new Set(['inv-1791550155857-d334m','inv-1791550182684-sy5s0']);
const ACC_IDS=new Set(['inv-1793524893878-q0w4b']);
export const PRI_0015_MERGE=Object.freeze({
  fromId:'inv-1793517199296-r472u',
  intoId:'inv-1793642210292-e79n2',
  code:'PRI-0015',
});
const norm=s=>String(s??'').trim().toUpperCase();
const natural=(a,b)=>String(a).localeCompare(String(b),'en',{numeric:true,sensitivity:'base'});
const sortPress=(a,b)=>{
 const rank=i=>i.code.startsWith('PRI-')?0:i.code.startsWith('TEX-')?1:2;
 return rank(a)-rank(b)||natural(a.code,b.code)||natural(a.id,b.id);
};
const sameJson=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function makeApprovedCatalogPlan(items){
 if(!Array.isArray(items)||items.length!==29)throw Error('EXPECTED_EXACTLY_29_CURRENT_ITEM_RECORDS');
 const idIndex=new Map(),codeOwners=new Map();
 for(const item of items){
  if(!item?.id||idIndex.has(item.id)||!item.code)throw Error('INVALID_OR_DUPLICATE_ITEM_ID');
  idIndex.set(item.id,item);
  const code=norm(item.code);
  codeOwners.set(code,[...(codeOwners.get(code)||[]),item.id]);
 }
 for(const id of [...BOOK_IDS,...ACC_IDS,PRI_0015_MERGE.fromId,PRI_0015_MERGE.intoId])
  if(!idIndex.has(id))throw Error('APPROVED_ID_MISSING_'+id);
 const dup=[...codeOwners].filter(([,owners])=>owners.length>1);
 if(dup.length!==1||dup[0][0]!==PRI_0015_MERGE.code ||
  !sameJson(dup[0][1].sort(),[PRI_0015_MERGE.fromId,PRI_0015_MERGE.intoId].sort()))
  throw Error('UNREVIEWED_LEGACY_DUPLICATE_CODES');
 const old=idIndex.get(PRI_0015_MERGE.fromId),canonical=idIndex.get(PRI_0015_MERGE.intoId);
 for(const field of ['name','category','code','stockQuantity','purchasePrice','sellingPrice','unit']){
  if(!sameJson(old[field],canonical[field]))throw Error('DUPLICATE_PRODUCT_FIELD_MISMATCH_'+field);
 }
 if(old.stockQuantity!==0)throw Error('DUPLICATE_SOURCE_NONZERO_STOCK_REQUIRES_WAREHOUSE_MERGE');
 if(old.warehouseStock && Object.values(old.warehouseStock).some(q=>!Number.isFinite(Number(q))||Number(q)!==0))
  throw Error('DUPLICATE_SOURCE_WAREHOUSE_BALANCE_REQUIRES_RECONCILIATION');
 if(old.customerSpecialPrices?.length||old.sellingPrice2||old.sellingPrice3)
  throw Error('DUPLICATE_SOURCE_PRICING_REQUIRES_MANUAL_REVIEW');
 if(old.barcode && canonical.barcode && old.barcode!==canonical.barcode)
  throw Error('DUPLICATE_SOURCE_BARCODE_CONFLICT');
 if(old.unitId && canonical.unitId && old.unitId!==canonical.unitId)
  throw Error('DUPLICATE_SOURCE_UNIT_ID_CONFLICT');
 const survivors=items.filter(it=>it.id!==PRI_0015_MERGE.fromId);
 const printers=survivors.filter(it=>!BOOK_IDS.has(it.id)&&!ACC_IDS.has(it.id)).sort(sortPress);
 const books=[...BOOK_IDS].map(id=>idIndex.get(id)).sort((a,b)=>natural(a.code,b.code));
 const accessories=[...ACC_IDS].map(id=>idIndex.get(id));
 if(printers.length!==25||books.length!==2||accessories.length!==1)
  throw Error('EXPECTED_25_PRI_2_BOK_1_ACC_AFTER_MERGE');
 const entries=[];
 for(const [group,category,prefix] of [
  [printers,'print_raw','PRI'],[books,'stationery','BOK'],[accessories,'office_supplies','ACC']
 ])group.forEach((it,idx)=>{
  entries.push({id:it.id,name:it.name,oldCode:it.code,
   oldCategory:it.category,newCode:prefix+'-'+String(idx+1).padStart(5,'0'),
   newCategory:category});
 });
 const assigned=new Set();
 for(const item of entries){
  const code=norm(item.newCode);
  if(assigned.has(code))throw Error('NEW_CODE_DUPLICATE_'+code);
  assigned.add(code);
  if((codeOwners.get(code)||[]).some(otherId=>otherId!==item.id))
   throw Error('NEW_CODE_REUSES_OTHER_ITEMS_HISTORY_'+code);
 }
 return {
  entries,
  merge:{...PRI_0015_MERGE,originalFrom:old,originalInto:canonical},
  aliases:new Map([[PRI_0015_MERGE.fromId,PRI_0015_MERGE.intoId]]),
  groups:{PRI:25,BOK:2,ACC:1},
 };
}
/* Only update catalog pointers and labels. Every monetary and quantity field is
   returned untouched. The archived alias remains recoverable for audit. */
export function relabelItemReferences(value,byId,idAliases=new Map()){
 let changed=false;
 const visit=node=>{
  if(Array.isArray(node))return node.map(visit);
  if(node===null||typeof node!=='object')return node;
  let out=node;
  const oldId=node.itemId??node.inventoryItemId;
  const canonicalId=idAliases.get(oldId)??oldId;
  const target=byId.get(canonicalId);
  if(target){
   for(const field of ['itemId','inventoryItemId','itemCode','code','category']){
    if(!Object.hasOwn(node,field))continue;
    const desired=field==='itemId'||field==='inventoryItemId'?canonicalId:
       field==='category'?target.newCategory:target.newCode;
    if(node[field]!==desired){
     if(out===node)out={...node};
     out[field]=desired;
     changed=true;
    }
   }
  }
  for(const [k,child] of Object.entries(node)){
   if(child&&typeof child==='object'){
    const next=visit(child);
    if(next!==child){
     if(out===node)out={...node};
     out[k]=next;
    }
   }
  }
  return out;
 };
 return {value:visit(value),changed};
}
/* Financial equality excludes only approved catalog identity and label changes.
   All numeric values (including totals and line quantities) remain compared. */
export function financiallyComparable(value,idAliases=new Map()){
 const visit=node=>{
  if(Array.isArray(node))return node.map(visit);
  if(!node||typeof node!=='object')return node;
  const out={};
  const hasProductReference=typeof (node.itemId??node.inventoryItemId)==='string';
  for(const [k,v] of Object.entries(node)){
   if(hasProductReference && ['itemCode','code','category'].includes(k))continue;
   out[k]=(['itemId','inventoryItemId'].includes(k) && hasProductReference)
     ? (idAliases.get(v)??v) : visit(v);
  }
  return out;
 };
 return visit(value);
}
