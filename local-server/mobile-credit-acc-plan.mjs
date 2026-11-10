/* A narrow, immutable catalog correction for one item only.
 * Relabel SKU/group by permanent ID without touching values, prices, quantities,
 * balances, tax, ledger, invoice numbers, or financial reference identities.
 */
import {financiallyComparable,relabelItemReferences} from './catalog-approved-2026-11-10.mjs';

export const ONE_ITEM_RECLASSIFY = Object.freeze({
  id: 'inv-1794294589279-upscd',
  name: 'رصيد جوال',
  fromCode: 'PRI-00025',
  fromCategory: 'print_raw',
  toCode: 'ACC-00002',
  toCategory: 'office_supplies',
  migrationId: 'catalog-mobile-credit-pri-to-acc-2026-11-10-v2-release-pri25',
});

const normalize = v => String(v ?? '').trim().toLowerCase();

export function planMobileCreditReclassification(records){
  if(!Array.isArray(records)) throw Error('INVALID_RECORDS_INPUT');
  const active = records.filter(r=>r?.entity==='inventory' && r.value!==null);
  const item = active.find(r=>r.record_id===ONE_ITEM_RECLASSIFY.id);
  if(!item || item.value?.name?.trim()!==ONE_ITEM_RECLASSIFY.name ||
      item.value?.code!==ONE_ITEM_RECLASSIFY.fromCode ||
      item.value?.category!==ONE_ITEM_RECLASSIFY.fromCategory)
    throw Error('TARGET_ID_NAME_CODE_OR_GROUP_CHANGED');
  if(active.filter(r=>r.record_id===item.record_id).length!==1)
    throw Error('AMBIGUOUS_TARGET_ID');
  if(active.length!==28) throw Error('EXPECTED_28_ACTIVE_ITEMS');
  const prefixes = Object.fromEntries(['PRI','BOK','ACC'].map(k=>[k,0]));
  for(const row of active){
    if(typeof row.value?.code!=='string')throw Error('INVALID_CATALOG_CODE');
    const prefix=row.value.code.split('-')[0];
    if(!Object.hasOwn(prefixes,prefix))throw Error('UNEXPECTED_CATALOG_PREFIX_'+prefix);
    ++prefixes[prefix];
    if(row.record_id!==item.record_id) {
      const assigned=[
        row.value.code,
        row.value.barcode,
        ...(Array.isArray(row.value.legacyCodes)?row.value.legacyCodes:[]),
        ...(Array.isArray(row.value.additionalBarcodes)?row.value.additionalBarcodes:[]),
        ...(Array.isArray(row.value.barcodeEntries)?row.value.barcodeEntries.map(b=>b?.barcode):[])
      ];
      if(assigned.some(code=>normalize(code)===normalize(ONE_ITEM_RECLASSIFY.toCode)))
        throw Error('TARGET_CODE_ALREADY_RESERVED');
      if(assigned.some(code=>normalize(code)===normalize(ONE_ITEM_RECLASSIFY.fromCode)))
        throw Error('RELEASED_PRI_CODE_ALREADY_USED_BY_ANOTHER_ITEM');
    }
  }
  if(prefixes.PRI!==25||prefixes.BOK!==2||prefixes.ACC!==1)
    throw Error('UNEXPECTED_ORIGINAL_CATALOG_DISTRIBUTION');
  const existingAcc = active.filter(r=>r.value.category===ONE_ITEM_RECLASSIFY.toCategory);
  if(existingAcc.length!==1 || existingAcc[0].value.code!=='ACC-00001')
    throw Error('EXISTING_ACC_CATEGORY_UNEXPECTED');
  // This specific PRI serial is intentionally released for a NEW printing
  // item. Never keep it as an alternate barcode/SKU of the ACC item.
  const oldCodes = [
    ...(Array.isArray(item.value.legacyCodes)?item.value.legacyCodes:[]),
  ].filter(code=>code && normalize(code)!==normalize(ONE_ITEM_RECLASSIFY.fromCode));
  const previousCodes = [...new Set(oldCodes)];
  const updatedItem={...item.value,
    code:ONE_ITEM_RECLASSIFY.toCode,
    category:ONE_ITEM_RECLASSIFY.toCategory,
    legacyCodes:previousCodes,
  };
  // If the original SKU was used as a barcode, detach it from the moved
  // product; a new PRI item must be the unique owner of that scan code.
  if(normalize(item.value.barcode)===normalize(ONE_ITEM_RECLASSIFY.fromCode))
    updatedItem.barcode=ONE_ITEM_RECLASSIFY.toCode;
  if(Array.isArray(item.value.additionalBarcodes))
    updatedItem.additionalBarcodes=item.value.additionalBarcodes.filter(
      code=>normalize(code)!==normalize(ONE_ITEM_RECLASSIFY.fromCode));
  if(Array.isArray(item.value.barcodeEntries))
    updatedItem.barcodeEntries=item.value.barcodeEntries.filter(
      entry=>normalize(entry?.barcode)!==normalize(ONE_ITEM_RECLASSIFY.fromCode));
  const targetMap = new Map([[item.record_id,{
    newCode:ONE_ITEM_RECLASSIFY.toCode,
    newCategory:ONE_ITEM_RECLASSIFY.toCategory,
  }]]);
  const modifications = [{entity:'inventory',record_id:item.record_id,oldValue:item.value,newValue:updatedItem,version:item.version}];
  let refs=0;
  const referencedEntities={};
  for(const record of records){
    if(record.value===null || record.entity==='inventory')continue;
    const {value:newValue,changed}=relabelItemReferences(record.value,targetMap);
    if(!changed)continue;
    if(JSON.stringify(financiallyComparable(record.value))!==JSON.stringify(financiallyComparable(newValue)))
      throw Error('NON_CATALOG_FIELDS_WOULD_CHANGE_'+record.entity+'_'+record.record_id);
    modifications.push({
      entity:record.entity,record_id:record.record_id,
      oldValue:record.value,newValue,version:record.version,
    });
    refs++;
    referencedEntities[record.entity]=(referencedEntities[record.entity]||0)+1;
  }
  return {
    id:item.record_id,fromCode:ONE_ITEM_RECLASSIFY.fromCode,
    toCode:ONE_ITEM_RECLASSIFY.toCode,
    fromCategory:ONE_ITEM_RECLASSIFY.fromCategory,
    toCategory:ONE_ITEM_RECLASSIFY.toCategory,
    beforeCounts:prefixes,afterCounts:{PRI:24,BOK:2,ACC:2},
    releasedCode:ONE_ITEM_RECLASSIFY.fromCode,
    linkedRecordsUpdated:refs,referencedEntities,modifications,
  };
}
