import { isSquareMeterUnit } from './unitsOfMeasure';

/** A POS line uses dimensional inputs only for square-area items.
 * Explicit false wins over legacy dummy length/width/count values.
 * Older dimension invoices without a flag are recognised by their area unit.
 */
export function isDimensionalInvoiceItem(item: {
  hasDimensions?: boolean;
  unit?: string;
  unitCalculationType?: string;
  length?: number;
  width?: number;
  count?: number;
}): boolean {
  if (item.hasDimensions === false) return false;
  if (item.hasDimensions === true) return true;
  return isSquareMeterUnit(item.unit, item.unitCalculationType as any);
}

export function displayDimension(value: number | undefined, isDimensional: boolean): string {
  return isDimensional && value != null && Number(value) > 0 ? String(value) : '-';
}
