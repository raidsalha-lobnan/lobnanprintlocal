/* Pure, read-only planning of permanent catalog classification and SKU changes.
   This module never connects to a database or writes accounting records. */
const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLocaleUpperCase('en-US');

export function buildCatalogReclassificationPreview({items, categories, assignments}) {
  if (!Array.isArray(items) || !Array.isArray(categories) || !Array.isArray(assignments))
    throw new TypeError('INVALID_CATALOG_PREVIEW_INPUT');

  const warnings = [];
  const errors = [];
  const itemMap = new Map();
  const categoryIds = new Set();
  const oldCodeOwners = new Map();
  const newCodeOwners = new Map();
  const assignmentMap = new Map();

  for (const category of categories) {
    const id = clean(category?.id);
    if (!id || categoryIds.has(id)) errors.push({kind:'CATEGORY_ID_INVALID_OR_DUPLICATE',id});
    categoryIds.add(id);
  }
  for (const item of items) {
    const id = clean(item?.id);
    if (!id || itemMap.has(id)) {
      errors.push({kind:'ITEM_ID_INVALID_OR_DUPLICATE',id});
      continue;
    }
    itemMap.set(id,item);
    const code = key(item?.code);
    if (!code) errors.push({kind:'OLD_ITEM_CODE_MISSING',id});
    else {
      const owners = oldCodeOwners.get(code) || [];
      owners.push(id);
      oldCodeOwners.set(code,owners);
    }
  }
  for (const row of assignments) {
    const id=clean(row?.id);
    if (!id || assignmentMap.has(id)) {
      errors.push({kind:'ASSIGNMENT_ID_INVALID_OR_DUPLICATE',id});
      continue;
    }
    if (!itemMap.has(id)) errors.push({kind:'ASSIGNMENT_UNKNOWN_ITEM_ID',id});
    assignmentMap.set(id,row);
  }
  const changes=[];
  for (const [id,item] of itemMap) {
    const row=assignmentMap.get(id);
    if (!row) {
      errors.push({kind:'ITEM_MISSING_FROM_PLAN',id});
      continue;
    }
    const code=clean(row.code);
    const category=clean(row.category);
    if (!code || code.length>48) errors.push({kind:'NEW_CODE_INVALID',id,code});
    if (!categoryIds.has(category)) errors.push({kind:'NEW_CATEGORY_NOT_DEFINED',id,category});
    const codeKey=key(code);
    if (codeKey) {
      const prior=newCodeOwners.get(codeKey);
      if (prior && prior!==id) errors.push({kind:'NEW_CODE_COLLISION',id,otherId:prior,code});
      else newCodeOwners.set(codeKey,id);
      const oldOwners=oldCodeOwners.get(codeKey)||[];
      const other=oldOwners.find(oldId=>oldId!==id);
      if (other) errors.push({kind:'REUSES_ANOTHER_ITEMS_HISTORIC_CODE',id,otherId:other,code});
    }
    changes.push({
      id,oldCode:clean(item.code),newCode:code,
      oldCategory:clean(item.category),newCategory:category,
      codeChanged:key(item.code)!==codeKey,
      categoryChanged:clean(item.category)!==category,
    });
  }
  for (const [code,ids] of oldCodeOwners) {
    if (ids.length>1) errors.push({kind:'LEGACY_CODE_AMBIGUOUS',code,itemIds:ids});
  }
  if (changes.some(change=>change.categoryChanged))
    warnings.push('CATEGORY_CHANGE_MAY_REQUIRE_ACCOUNT_MAPPING_REVIEW');
  warnings.push('DRAFT_INVOICES_AND_OFFLINE_DEVICE_QUEUES_MUST_BE_DRAINED_BEFORE_COMMIT');
  return {
    safeToApply:errors.length===0,
    errors,warnings,changes,
    changedCodeCount:changes.filter(change=>change.codeChanged).length,
    changedCategoryCount:changes.filter(change=>change.categoryChanged).length,
  };
}
