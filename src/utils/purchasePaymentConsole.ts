import {purchaseLineAmounts,type PurchaseLineDraft} from './purchaseLineMath';

export const purchaseMoney=(amount:number):number=>
 Number(Number(amount).toFixed(2));

export interface PurchaseBreakdown {
 lines:Array<{net:number;discount:number;tax:number;total:number}>;
 gross:number;
 lineDiscount:number;
 overallDiscount:number;
 additionalCharges:number;
 subtotal:number;
 tax:number;
 total:number;
}

export function calculatePurchaseBreakdown(
 rows:PurchaseLineDraft[],taxRate:number,overallPercent:number,extra:number
):PurchaseBreakdown {
 if(!Number.isFinite(overallPercent)||overallPercent<0||overallPercent>100)
  throw new Error('PURCHASE_GLOBAL_DISCOUNT_PERCENT_INVALID');
 if(!Number.isFinite(extra)||extra<0)
  throw new Error('PURCHASE_ADDITIONAL_CHARGES_INVALID');
 const source=rows.map(row=>purchaseLineAmounts(row,taxRate));
 const netBefore=source.reduce((sum,row)=>sum+row.net,0);
 const globalDiscount=purchaseMoney(netBefore*overallPercent/100);
 let allocated=0;
 const lines=source.map((base,index)=>{
  const share=index===source.length-1
   ?purchaseMoney(globalDiscount-allocated)
   :netBefore?purchaseMoney(globalDiscount*base.net/netBefore):0;
  allocated=purchaseMoney(allocated+share);
  const net=purchaseMoney(base.net-share);
  const tax=purchaseMoney(net*taxRate/100);
  return {
   net,discount:purchaseMoney(base.discount+share),
   tax,total:purchaseMoney(net+tax)
  };
 });
 const subtotal=purchaseMoney(lines.reduce((n,line)=>n+line.net,0)+extra);
 const tax=purchaseMoney(lines.reduce((n,line)=>n+line.tax,0));
 return {
  lines,gross:purchaseMoney(source.reduce((n,r)=>n+r.gross,0)),
  lineDiscount:purchaseMoney(source.reduce((n,r)=>n+r.discount,0)),
  overallDiscount:globalDiscount,additionalCharges:purchaseMoney(extra),
  subtotal,tax,total:purchaseMoney(subtotal+tax)
 };
}

export interface PurchasePaymentLeg {
 amount:number;
 currency:string;
 rate:number;
 treasuryCode:string;
}
export function calculatePurchaseSettlement(
 total:number,invoiceRate:number,cash:PurchasePaymentLeg,bank:PurchasePaymentLeg
){
 const baseTotal=purchaseMoney(total*invoiceRate);
 const all=[cash,bank];
 if(!Number.isFinite(baseTotal)||!Number.isFinite(invoiceRate)||invoiceRate<=0||
  !all.every(p=>Number.isFinite(p.amount)&&p.amount>=0&&
   Number.isFinite(p.rate)&&p.rate>0))
  throw new Error('PURCHASE_PAYMENT_INPUT_INVALID');
 const cashBase=purchaseMoney(cash.amount*cash.rate);
 const bankBase=purchaseMoney(bank.amount*bank.rate);
 const paidBase=purchaseMoney(cashBase+bankBase);
 if(paidBase>baseTotal+0.005)
  throw new Error('PURCHASE_PAYMENT_EXCEEDS_TOTAL');
 const remainingBase=purchaseMoney(baseTotal-paidBase);
 const paidInvoice=purchaseMoney(paidBase/invoiceRate);
 return {baseTotal,cashBase,bankBase,paidBase,remainingBase,
  paidInvoice:Math.min(total,paidInvoice),
  remainingInvoice:purchaseMoney(remainingBase/invoiceRate),
  status:baseTotal>0&&remainingBase<0.005?'paid':paidBase>0?'partial':'unpaid'};
}
