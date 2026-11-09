import React,{useMemo} from 'react';
import {Plus,Trash2,Ruler,Image as ImageIcon,ScanBarcode} from 'lucide-react';
import type {InventoryItem} from '../../types';
import {AutocompleteCombobox} from '../common/AutocompleteCombobox';

import {
  precision,purchaseLineQuantity,purchaseLineValid,purchaseLineAmounts,
  purchaseLineSummary,emptyPurchaseLine,purchaseDraftForItem,
  type PurchaseLineDraft
} from '../../utils/purchaseLineMath';
export {purchaseLineQuantity,purchaseLineValid,purchaseLineAmounts,
  purchaseLineSummary,emptyPurchaseLine,purchaseDraftForItem};
export type {PurchaseLineDraft};


interface Props{
 rows:PurchaseLineDraft[];
 setRows:React.Dispatch<React.SetStateAction<PurchaseLineDraft[]>>;
 inventory:InventoryItem[];
 taxRate:number;
 currency:string;
 onQuickAdd:(name:string,rowIndex:number,currentPrice:number)=>Promise<void>;
}
const numberCss='w-full min-w-0 rounded border border-slate-300 bg-white px-1 py-1 text-center text-[11px] font-semibold tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200';
const thCss='border-l border-b border-slate-400 px-1 py-1.5 text-center text-[11px] font-bold whitespace-nowrap';
const tdCss='border-l border-slate-200 px-1 py-1.5 align-middle';
export const PurchaseInvoiceLinesTable:React.FC<Props>=({
 rows,setRows,inventory,taxRate,currency,onQuickAdd
})=>{
 const inventoryOptions=useMemo(()=>inventory.map(item=>({
  id:item.id,name:item.name,code:item.code,
  subText:'الوحدة: '+(item.unit||'قطعة')+' | الرصيد: '+item.stockQuantity,
  badge:String(item.purchasePrice||0)+' '+currency,
  extraSearchCorpus:[item.barcode,...(item.additionalBarcodes||[]),item.category||''].join(' '),
  raw:item
 })),[inventory,currency]);
 const set=(index:number,patch:Partial<PurchaseLineDraft>)=>setRows(prev=>prev.map((r,i)=>{
  if(i!==index)return r;
  const next={...r,...patch};
  if(next.hasDimensions&&(['length','width','count','hasDimensions'].some(k=>Object.prototype.hasOwnProperty.call(patch,k))))
   next.quantity=precision(next.length*(next.unitCalculationType==='linear'?1:next.width)*next.count);
  return next;
 }));
 const header=['م','رقم الصنف','الصنف','صورة','البيان / ملاحظات الصنف','الطول','العرض',
  'العدد','الكمية','الوحدة','سعر الشراء','الخصم','الضريبة','الإجمالي','حذف'];
 const summary=purchaseLineSummary(rows,taxRate);
 return <section className="flex h-full min-h-0 min-w-0 flex-col gap-1" dir="rtl">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <span className="text-[12px] font-black text-slate-800">بنود فاتورة الشراء وتوريد الأصناف</span>
   <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
    <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">عدد البنود: {rows.filter(r=>r.itemId).length}</span>
    <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">إجمالي الكميات: {summary.quantity}</span>
    <button type="button" onClick={()=>setRows(prev=>[...prev,emptyPurchaseLine()])}
     className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-blue-700">
     <Plus className="h-3.5 w-3.5"/> إضافة صنف جديد
    </button>
   </div>
  </div>
  <div className="min-h-0 w-full flex-1 overflow-auto rounded-md border border-slate-300 bg-white">
   <table className="w-full min-w-[1190px] table-fixed border-collapse text-right">
    <colgroup>
     {[31,80,204,38,152,54,54,52,68,58,78,66,62,93,38].map((width,i)=>
      <col key={i} style={{width}}/>)}
    </colgroup>
    <thead className="sticky top-0 z-10 bg-[#b3cbe3] text-slate-900">
     <tr>{header.map(t=><th key={t} scope="col" className={thCss}>{t}</th>)}</tr>
    </thead>
    <tbody className="divide-y divide-slate-200">
     {rows.map((row,index)=>{
      const item=inventory.find(it=>it.id===row.itemId);
      const money=purchaseLineAmounts(row,taxRate);
      const bad=!purchaseLineValid(row,taxRate);
      return <tr key={row.key} className={'hover:bg-blue-50/60 '+(index%2?'bg-slate-50/60':'bg-white')}>
       <td className={tdCss+' text-center font-bold'}>{index+1}</td>
       <td className={tdCss+' text-center font-mono text-[10px] font-bold text-blue-800'} title={row.itemCode}>{row.itemCode||'—'}</td>
       <td className={tdCss}>
        <AutocompleteCombobox
         items={inventoryOptions}
         selectedId={row.itemId}
         entityType="item"
         placeholder="اسم الصنف / الكود / الباركود..."
         onSelect={option=>{
          if(!option.id)return;
          const found=inventory.find(it=>it.id===option.id);
          if(found)set(index,purchaseDraftForItem(found,row));
         }}
         onQuickAdd={async name=>onQuickAdd(name,index,row.unitPrice)}
        />
       </td>
       <td className={tdCss+' text-center'}>
        {item?.imageUrl?
         <img src={item.imageUrl} alt={'صورة '+item.name} className="mx-auto h-8 w-8 rounded border object-cover"/>:
         <ImageIcon className="mx-auto h-4 w-4 text-slate-300"/>}
       </td>
       <td className={tdCss}>
        <input type="text" value={row.notes} onChange={e=>set(index,{notes:e.target.value})}
         title="بيان خاص بهذا الصنف في فاتورة الشراء" placeholder="ملاحظات الصنف..."
         className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-200"/>
       </td>
       <td className={tdCss}><input type="number" min="0.001" step="any" value={row.length}
         disabled={!row.hasDimensions} onChange={e=>set(index,{length:Number(e.target.value)})}
         title="الطول" aria-label={'طول البند '+(index+1)}
         className={numberCss+' disabled:bg-slate-100 disabled:text-slate-400'}/></td>
       <td className={tdCss}><input type="number" min="0.001" step="any" value={row.width}
         disabled={!row.hasDimensions||row.unitCalculationType==='linear'}
         onChange={e=>set(index,{width:Number(e.target.value)})}
         title="العرض" aria-label={'عرض البند '+(index+1)}
         className={numberCss+' disabled:bg-slate-100 disabled:text-slate-400'}/></td>
       <td className={tdCss}><input type="number" min="1" step="1" value={row.count}
         disabled={!row.hasDimensions} onChange={e=>set(index,{count:Number(e.target.value)})}
         title="العدد" aria-label={'عدد البند '+(index+1)}
         className={numberCss+' disabled:bg-slate-100 disabled:text-slate-400'}/></td>
       <td className={tdCss}><input type="number" min="0.001" step="any" value={row.hasDimensions?money.quantity:row.quantity}
         readOnly={row.hasDimensions}
         onChange={e=>set(index,{quantity:Number(e.target.value)})}
         aria-label={'كمية البند '+(index+1)}
         title={row.hasDimensions?'الكمية محسوبة تلقائياً من الأبعاد':'أدخل الكمية مباشرة'}
         className={numberCss+' '+(row.hasDimensions?'bg-blue-50 text-blue-800':'')}/></td>
       <td className={tdCss+' text-center'}>
        <div className="flex items-center justify-center gap-0.5">
         <span className="block max-w-[47px] truncate text-[10px]" title={row.unit}>{row.unit||'—'}</span>
         <button type="button" title={row.hasDimensions?'العودة للكمية المباشرة':'تفعيل حساب الطول × العرض × العدد'}
          onClick={()=>set(index,{hasDimensions:!row.hasDimensions,length:1,width:1,count:1})}
          className={'rounded p-0.5 '+(row.hasDimensions?'text-blue-700':'text-slate-400 hover:text-blue-700')}>
          <Ruler className="h-3.5 w-3.5"/>
         </button>
        </div>
       </td>
       <td className={tdCss}><input type="number" min="0" step="any" value={row.unitPrice}
         onChange={e=>set(index,{unitPrice:Number(e.target.value)})}
         aria-label={'سعر شراء البند '+(index+1)} title="سعر شراء الوحدة (وليس سعر البيع)"
         className={numberCss}/></td>
       <td className={tdCss}><input type="number" min="0" step="any" value={row.discount}
         onChange={e=>set(index,{discount:Number(e.target.value)})}
         aria-label={'خصم البند '+(index+1)} title="خصم نقدي على هذا البند"
         className={numberCss}/></td>
       <td className={tdCss+' text-left text-[11px] font-bold tabular-nums'} dir="ltr">{money.tax.toFixed(2)}</td>
       <td className={tdCss+' text-left text-[11px] font-black tabular-nums '+(bad?'text-rose-700':'text-blue-900')}
        dir="ltr" title="إجمالي البند شامل ضريبة المدخلات">{money.total.toFixed(2)}</td>
       <td className={tdCss+' text-center'}>
        <button type="button" onClick={()=>setRows(prev=>prev.filter(r=>r.key!==row.key))}
         disabled={rows.length===1} aria-label={'حذف البند '+(index+1)}
         className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30">
         <Trash2 className="mx-auto h-4 w-4"/>
        </button>
       </td>
      </tr>;
     })}
    </tbody>
   </table>
  </div>
  {!summary.valid&&<span className="shrink-0 text-[10px] font-bold text-amber-700">
   <ScanBarcode className="inline h-3 w-3"/> اختر الصنف والكمية والسعر والخصم لكل بند للحفظ.
  </span>}
 </section>;
};
