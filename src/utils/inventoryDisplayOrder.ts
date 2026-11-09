import type {CategoryDefinition, InventoryItem} from '../types';

type InventoryRow = Pick<InventoryItem, 'id' | 'code' | 'category' | 'name'>;
type InventoryGroup = Pick<CategoryDefinition, 'id' | 'name'>;

/** Immutable grouping by the configured category order and natural SKU order. */
export function sortInventoryForDisplay<T extends InventoryRow>(
  items: readonly T[],
  categories: readonly InventoryGroup[],
): T[] {
  const order = new Map(categories.map((category, index) => [category.id, index]));
  const compare = (a: string, b: string) =>
    a.localeCompare(b, 'en', {numeric: true, sensitivity: 'base'});
  return [...items].sort((a, b) => {
    const aRank = order.get(a.category) ?? Number.MAX_SAFE_INTEGER;
    const bRank = order.get(b.category) ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank
      || compare(a.category || '', b.category || '')
      || compare(a.code || '', b.code || '')
      || compare(a.name || '', b.name || '')
      || compare(a.id || '', b.id || '');
  });
}

/** Include categories actually referenced by stock, including legacy/custom categories. */
export function inventoryCategoryOptions<T extends {category: string}>(
  items: readonly T[],
  configured: readonly InventoryGroup[],
  fallbackNames: Readonly<Record<string, {name: string}>> = {},
): Array<{id: string; name: string; count: number}> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.category) continue;
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  }
  const known = new Set<string>();
  const result: Array<{id: string; name: string; count: number}> = [];
  for (const group of configured) {
    if (known.has(group.id)) continue;
    known.add(group.id);
    result.push({id: group.id, name: group.name, count: counts.get(group.id) || 0});
  }
  for (const id of [...counts.keys()].filter(id => !known.has(id)).sort((a,b)=>a.localeCompare(b,'ar'))) {
    result.push({id, name: fallbackNames[id]?.name || id, count: counts.get(id) || 0});
  }
  return result;
}