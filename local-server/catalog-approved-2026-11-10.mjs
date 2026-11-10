/* One-off administrative catalog change plan, anchored to permanent item record IDs.
   This is intentionally pure; only the controlled PostgreSQL maintenance command writes. */
export const APPROVED_CATEGORIES = Object.freeze([
  {id:'print_raw',name:'مطبعة',nameEn:'Printing',prefix:'PRI',
   description:'أصناف المطبعة',defaultUnit:'حبة',color:'bg-sky-50 text-sky-700'},
  {id:'stationery',name:'مكتبة وقرطاسية',nameEn:'Library & Stationery',prefix:'BOK',
   description:'المكتبة والقرطاسية',defaultUnit:'حبة',color:'bg-violet-50 text-violet-700'},
  {id:'office_supplies',name:'أصناف متنوعة واكسسوارات',nameEn:'Accessories & Miscellaneous',prefix:'ACC',
   description:'أصناف متنوعة واكسسوارات',defaultUnit:'حبة',color:'bg-amber-50 text-amber-700'},
]);
const BOOK_IDS=new Set(['inv-1791550155857-d334m','inv-1791550182684-sy5s0']);
const ACC_IDS=new Set(['inv-1793524893878-q0w4b']);
const EXPECTED_DUP_IDS=['inv-1793517199296-r472u','inv-1793642210292-e79n2'].sort();
const norm=s=>String(s??'').trim().toUpperCase();
const natural=(a,b)=>String(a).localeCompare(String(b),'en',{numeric:true,sensitivity:'base'});
const sortPress=(a,b)=>{
 const rank=it=>it.code.startsWith('PRI-')?0:it.code.startsWith('TEX-')?1:2;
 return rank(a)-rank(b)||natural(a.code,b.code)||natural(a.id,b.id);
};
export function makeApprovedCatalogPlan(items){
 if (!Array.isArray(items)||items.length!==28)throw Error('EXPECTED_EXACTLY_28_CATALOG_RECORDS');
 const idIndex=new Map();
 const codeOwners=new Map();
 for(const item of items){
  if(!item?.id||idIndex.has(item.id)||!item.code)throw Error('INVALID_OR_DUPLICATE_ITEM_ID');
  idIndex.set(item.id,item);
  const old=norm(item.code);
  codeOwners.set(old,[...(codeOwners.get(old)||[]),item.id]);
 }
 for(const id of [...BOOK_IDS,...ACC_IDS])if(!idIndex.has(id))throw Error('APPROVED_ID_MISSING_'+id);
 const duplicates=[...codeOwners].filter(([,owners])=>owners.length>1);
 if(duplicates.length!==1||duplicates[0][0]!=='PRI-0015'
 ||JSON.stringify([...duplicates[0][1]].sort())!==JSON.stringify(EXPECTED_DUP_IDS))
  throw Error('UNREVIEWED_LEGACY_DUPLICATE_CODES');
 const press=items.filter(it=>!BOOK_IDS.has(it.id)&&!ACC_IDS.has(it.id)).sort(sortPress);
 const books=[...BOOK_IDS].map(id=>idIndex.get(id)).sort((a,b)=>natural(a.code,b.code));
 const acc=[...ACC_IDS].map(id=>idIndex.get(id));
 if(press.length!==25||books.length!==2||acc.length!==1)throw Error('APPROVED_GROUP_COUNTS_CHANGED');
 const entries=[];
 for(const [itemsInGroup,category,prefix] of [
  [press,'print_raw','PRI'],[books,'stationery','BOK'],[acc,'office_supplies','ACC']
 ])itemsInGroup.forEach((item,index)=>{
  entries.push({id:item.id,name:item.name,oldCode:item.code,
    oldCategory:item.category,newCode:prefix+'-'+String(index+1).padStart(5,'0'),
    newCategory:category});
 });
 const used=new Set();
 for(const e of entries){
  const key=norm(e.newCode);
  if(used.has(key))throw Error('NEW_CODE_DUPLICATE_'+key);
  used.add(key);
  const previous=codeOwners.get(key)||[];
  if(previous.some(id=>id!==e.id))throw Error('NEW_CODE_REUSES_OTHER_HISTORY_'+key);
 }
 return entries;
}
/** Only change display code and classification when the stable item ID matches.
    Never modify price, quantity, tax, payments, totals, or journal account lines. */
export function relabelItemReferences(value, planById){
 let mutated=false;
 const visit=node=>{
  if(Array.isArray(node)){
   const values=node.map(visit);
   return values;
  }
  if(node===null||typeof node!=='object')return node;
  let out=node;
  const id=node.itemId||node.inventoryItemId;
  const target=planById.get(id);
  if(target){
   for(const field of ['itemCode','code','category']){
    if(!Object.hasOwn(node,field))continue;
    const desired=field==='category'?target.newCategory:target.newCode;
    const old=node[field];
    if(old!==desired){
      if(out===node)out={...node};
      out[field]=desired;
      mutated=true;
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
 const next=visit(value);
 return {changed:mutated,value:next};
}