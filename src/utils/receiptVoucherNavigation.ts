import type {PaymentVoucher} from '../types';

/** Stable chronological receipt register, independent of the current table filters. */
export function orderedReceiptVouchers(vouchers:readonly PaymentVoucher[]):PaymentVoucher[]{
 return vouchers.filter(v=>v.type==='receipt').sort((a,b)=>
  String(a.date||'').localeCompare(String(b.date||''))||
  String(a.voucherNumber||'').localeCompare(String(b.voucherNumber||''),'en',{numeric:true})||
  String(a.id).localeCompare(String(b.id)));
}

export function receiptVoucherPosition(receipts:readonly PaymentVoucher[],id:string|null){
 const index=id?receipts.findIndex(v=>v.id===id):-1;
 return {
  position:index>=0?index+1:0,
  total:receipts.length,
  previous:index>=0?receipts[index-1]||null:receipts[receipts.length-1]||null,
  next:index>=0?receipts[index+1]||null:null
 };
}

export function receiptVoucherShortcut(
 event:Pick<KeyboardEvent,'ctrlKey'|'metaKey'|'altKey'|'key'>
):'new'|'save'|null{
 if(!(event.ctrlKey||event.metaKey)||event.altKey)return null;
 const key=event.key.toLowerCase();
 if(key==='n')return 'new';
 if(key==='s')return 'save';
 return null;
}
