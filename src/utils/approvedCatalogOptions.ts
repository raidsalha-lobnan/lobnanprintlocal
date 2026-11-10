import type { CategoryDefinition, InventoryItem } from '../types';

/**
 * Approved permanent catalog identities. Never infer selectable groups from
 * historical SKU prefixes, legacy settings rows or inventory usage.
 */
export const APPROVED_CATALOG_GROUPS: readonly CategoryDefinition[] = Object.freeze([
  Object.freeze({
    id: 'print_raw', name: 'مطبعة', nameEn: 'Printing', prefix: 'PRI',
    description: 'أصناف المطبعة', defaultUnit: 'حبة', color: 'bg-sky-50 text-sky-700',
  }),
  Object.freeze({
    id: 'stationery', name: 'قرطاسية', nameEn: 'Stationery', prefix: 'BOK',
    description: 'المكتبة والقرطاسية', defaultUnit: 'حبة', color: 'bg-indigo-50 text-indigo-700',
  }),
  Object.freeze({
    id: 'office_supplies', name: 'إكسسوارات', nameEn: 'Accessories', prefix: 'ACC',
    description: 'الأصناف المتنوعة والإكسسوارات', defaultUnit: 'حبة', color: 'bg-amber-50 text-amber-700',
  }),
]);

// Old settings contained these retired classifications, no longer valid for
// new items. A new distinct prefix can be added later through an approved
// settings change, without rewriting the three historical permanent IDs.
const LEGACY_PREFIXES = new Set([
  'TEX', 'STA', 'STAT', 'CAT', 'PRA', 'ITM', 'COPY', 'SVC',
]);
const known = new Set(APPROVED_CATALOG_GROUPS.map(c => c.id));

export function approvedCatalogCategories(
  configured: readonly CategoryDefinition[] = [],
): CategoryDefinition[] {
  const chosen: CategoryDefinition[] = [...APPROVED_CATALOG_GROUPS];
  const prefixes = new Set(chosen.map(c => c.prefix));
  for (const entry of configured) {
    if (!entry || known.has(entry.id) || !entry.id?.trim() || !entry.name?.trim()) continue;
    const prefix = String(entry.prefix || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix)) continue;
    if (prefixes.has(prefix) || LEGACY_PREFIXES.has(prefix)) continue;
    if (entry.id.startsWith('cat_') && /^cat_\d{10,}$/.test(entry.id)) continue; // retired generated categories
    if (chosen.some(c => c.id === entry.id)) continue;
    prefixes.add(prefix);
    chosen.push({...entry, prefix});
  }
  return chosen;
}

export function approvedCatalogCounts(
  inventory: readonly Pick<InventoryItem,'category'>[],
  categories: readonly Pick<CategoryDefinition,'id'|'name'>[],
): Array<{id: string; name: string; count: number}> {
  return categories.map(c => ({
    id: c.id, name: c.name,
    count: inventory.filter(item => item.category === c.id).length,
  }));
}
