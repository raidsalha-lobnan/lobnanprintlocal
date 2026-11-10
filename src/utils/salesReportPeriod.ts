import {formatDateDisplay} from './dateUtils';
import type {Invoice} from '../types';

export type SalesReportDateMode = 'all' | 'single' | 'range';
export interface SalesReportDateSelection {
  mode: SalesReportDateMode;
  singleDate?: string;
  dateFrom?: string;
  dateTo?: string;
}

const key = (raw?: string): string => {
  if(!raw)return '';
  const value=String(raw).trim().split('T')[0].replace(/\./g,'/');
  const iso=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if(iso)return iso[1]+'-'+iso[2].padStart(2,'0')+'-'+iso[3].padStart(2,'0');
  const legacy=/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
  return legacy?legacy[3]+'-'+legacy[2].padStart(2,'0')+'-'+legacy[1].padStart(2,'0'):'';
};

/** The report always shows an explicit From–To interval, even for one day.
 * "All dates" uses actual invoice dates, never creation or import timestamps. */
export function salesReportPeriod(
  invoices: readonly Pick<Invoice,'date'>[],
  selection: SalesReportDateSelection,
): string {
  const dates=invoices.map(i=>key(i.date)).filter(Boolean).sort();
  const earliest=dates[0]||'';
  const latest=dates[dates.length-1]||'';
  const from=selection.mode==='single' ? key(selection.singleDate) :
    selection.mode==='range' ? key(selection.dateFrom)||earliest : earliest;
  const to=selection.mode==='single' ? key(selection.singleDate) :
    selection.mode==='range' ? key(selection.dateTo)||latest : latest;
  return 'من '+(from?formatDateDisplay(from):'—')+
    ' إلى '+(to?formatDateDisplay(to):'—');
}
