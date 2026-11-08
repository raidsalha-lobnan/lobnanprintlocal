/**
 * Business-facing stock ledger projection.
 *
 * The underlying accounting correction entries remain immutable in the
 * protected audit ledger. Business stock cards show ONE effective sale for an
 * approved invoice revision, never intermediate reverse/repost steps.
 * A revision is consolidated only where the original sale can be identified
 * uniquely by immutable invoice identity + original invoice date.
 */
export interface MovementProjectionRow {
  id:string;
  itemId:string;
  type:string;
  quantity:number;
  date?:string;
  unitPrice?:number;
  totalValue?:number;
  balanceAfter?:number;
  referenceNumber?:string;
  sourceInvoiceId?:string;
  internalCorrection?:boolean;
  correctionGroupId?:string;
  approvedRevision?:boolean;
}
export interface InvoiceProjectionRef {
  id:string;
  invoiceNumber:string;
  date:string;
  tempInvoiceNumber?:string;
}
const key=(invoice:string,item:string)=>invoice+'\u001f'+item;

export function projectBusinessStockMovements<T extends MovementProjectionRow>(
  rows:readonly T[],
  invoices:readonly InvoiceProjectionRef[]=[]
):T[] {
  const invoiceById=new Map(invoices.map(i=>[i.id,i]));
  const corrections=new Map<string,{delta:number;ids:Set<string>;lastBalance?:number}>();
  for(const row of rows){
    if(!row.internalCorrection||row.approvedRevision!==true||
      !row.sourceInvoiceId||!row.correctionGroupId||
      !['in_adjustment','out_adjustment'].includes(row.type))continue;
    const invoice=invoiceById.get(row.sourceInvoiceId);
    if(!invoice)continue;
    const k=key(invoice.id,row.itemId);
    const group=corrections.get(k)||{delta:0,ids:new Set<string>()};
    // A restock reduces effective quantity sold. An additional issue adds it.
    group.delta+=row.type==='in_adjustment'?-row.quantity:row.quantity;
    group.ids.add(row.id);
    if(Number.isFinite(row.balanceAfter))group.lastBalance=row.balanceAfter;
    corrections.set(k,group);
  }
  const originals=new Map<string,T[]>();
  for(const row of rows){
    if(row.type!=='out_sale'||row.internalCorrection)continue;
    const invoice=row.sourceInvoiceId?invoiceById.get(row.sourceInvoiceId):
      invoices.find(i=>row.date===i.date && [
       i.invoiceNumber,i.tempInvoiceNumber,'TEMP-'+i.id
      ].filter(Boolean).includes(row.referenceNumber||''));
    if(!invoice)continue;
    const k=key(invoice.id,row.itemId);
    const matching=originals.get(k)||[];
    matching.push(row);
    originals.set(k,matching);
  }
  const effective=new Map<string,T>();
  const hidden=new Set<string>();
  for(const [k,correction] of corrections){
    const source=originals.get(k);
    // Do not erase unverified corrections or merge an ambiguous legacy sale.
    if(!source||source.length!==1)continue;
    const sale=source[0],quantity=Math.round((sale.quantity+correction.delta)*1e6)/1e6;
    if(!Number.isFinite(quantity)||quantity<0)continue;
    for(const id of correction.ids)hidden.add(id);
    if(quantity===0)hidden.add(sale.id);
    else effective.set(sale.id,{
      ...sale,quantity,
      ...(Number.isFinite(sale.unitPrice)
        ? {totalValue:Math.round(quantity*Number(sale.unitPrice)*100)/100}:{}),
      ...(correction.lastBalance!==undefined?{balanceAfter:correction.lastBalance}:{})
    });
  }
  return rows.filter(row=>!hidden.has(row.id)).map(row=>effective.get(row.id)||row);
}

export function committedStockBalance(stockQuantity:number):number{
  if(!Number.isFinite(stockQuantity))throw new Error('INVALID_COMMITTED_STOCK_BALANCE');
  return stockQuantity;
}
