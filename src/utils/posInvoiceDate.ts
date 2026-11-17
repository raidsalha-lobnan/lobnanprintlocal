import type {PosLayoutConfig} from '../types/posLayoutCustomizer';

/** The calendar day at the cashier, not the UTC day (which can differ after midnight). */
export function localPosToday(now:Date=new Date()):string{
  const year=now.getFullYear();
  const month=String(now.getMonth()+1).padStart(2,'0');
  const day=String(now.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

export function isValidPosInvoiceDate(value:unknown):value is string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day;
}

/**
 * Only new cash-register invoices inherit the pinned date. The date of a
 * previously posted invoice is restored from its own record when it is opened;
 * returning to New uses the persisted pin, never that invoice's historical date.
 */
export function dateForNewPosInvoice(
  config:Pick<PosLayoutConfig,'isDateLocked'|'lockedDate'>|null|undefined,
  now:Date=new Date()
):string{
  return config?.isDateLocked&&isValidPosInvoiceDate(config.lockedDate)
    ? config.lockedDate
    : localPosToday(now);
}
