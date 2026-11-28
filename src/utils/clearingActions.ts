import type {DebtClearingRecord,AccountTransferPartyType} from '../types';
export type ClearingSaveAction='save'|'print'|'pdf';
export function clearingShortcut(e:{code?:string;key:string;ctrlKey:boolean;altKey:boolean;shiftKey:boolean;metaKey:boolean}):ClearingSaveAction|null{
 if(e.shiftKey||e.metaKey||(e.code!=='KeyS'&&e.key.toLowerCase()!=='s'))return null;
 return e.ctrlKey?(e.altKey?'pdf':'save'):e.altKey?'print':null;
}
const label=(t?:AccountTransferPartyType)=>t==='employee'?'موظف':t==='supplier'?'مورد':'عميل';
const clean=(v:unknown)=>String(v??'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,' - ').replace(/\s+/g,' ').trim().replace(/[ .]+$/g,'');
export function clearingPdfFilename(r:DebtClearingRecord):string{
 const debit=r.balanceSide!=='credit';
 const fromType=r.sourceType||(debit?r.creditPartyType||'customer':r.debitPartyType||'supplier');
 const toType=r.targetType||(debit?r.debitPartyType||'supplier':r.creditPartyType||'customer');
 const from=r.sourceName||(debit?r.customerName:r.supplierName);
 const to=r.targetName||(debit?r.supplierName:r.customerName);
 const fromSub=r.sourceSubCustomerName||(debit?r.creditSubCustomerName:r.debitSubCustomerName);
 const toSub=r.targetSubCustomerName||(debit?r.debitSubCustomerName:r.creditSubCustomerName);
 const party=(name:string,sub?:string)=>clean(name+(sub?' - '+sub:'')).slice(0,72).trim();
 const date=clean(/^\d{4}-\d{2}-\d{2}$/.test(r.date)?r.date.split('-').reverse().join('-'):r.date);
 return 'مقاصة '+label(fromType)+' '+party(from,fromSub)+' إلى '+label(toType)+' '+party(to,toSub)+' - '+date+' - '+clean(r.clearingNumber)+'.pdf';
}
