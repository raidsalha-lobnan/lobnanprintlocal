import type {PaymentVoucher} from '../types';

/**
 * The visible current party balance already includes every posted receipt.
 * When editing an existing receipt for the same party, undo its ORIGINAL
 * base-currency impact for the preview only, then apply the draft exactly
 * once. Nothing is written to the journal, treasury or customer card here.
 *
 * Changing the selected party must NOT add the old receipt to the new party.
 */
type ExistingReceipt = Pick<PaymentVoucher,
 'partyId'|'amount'|'baseAmount'|'exchangeRate'|'discountAmount'|'baseDiscountAmount'|'type'>;

type ReceiptSettlementInput={
 currentBalance:number|null;
 selectedPartyId:string;
 existingReceipt?:ExistingReceipt|null;
 amount:number;
 exchangeRate:number;
 discount?:number;
};

export type ReceiptSettlementPreview={
 currentBalance:number;
 before:number;
 after:number;
 priorReceiptBase:number;
 draftReceiptBase:number;
 deltaFromCurrent:number;
};

const cents=(value:unknown):number|null=>{
 if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>=1e12)return null;
 const valueCents=value*100;
 const rounded=Math.round(valueCents);
 if(!Number.isSafeInteger(rounded)||Math.abs(valueCents-rounded)>0.00001)return null;
 return rounded;
};

export function receiptSettlementPreview({
 currentBalance,selectedPartyId,existingReceipt,amount,exchangeRate,discount=0
}:ReceiptSettlementInput):ReceiptSettlementPreview|null {
 if(!selectedPartyId||currentBalance===null||!Number.isFinite(exchangeRate)||
   exchangeRate<=0)return null;
 if(!Number.isFinite(discount)||discount<0)return null;
 const current=cents(currentBalance);
 const entered=cents(amount);
 const draftBase=cents(amount*exchangeRate);
 const draftDiscountBase=cents(discount*exchangeRate);
 if(current===null||entered===null||entered<0||draftBase===null||draftDiscountBase===null)return null;

 let priorBase=0;
 if(existingReceipt&&existingReceipt.type==='receipt'&&
    existingReceipt.partyId===selectedPartyId){
  const previous=existingReceipt.baseAmount===undefined?
    existingReceipt.amount*Number(existingReceipt.exchangeRate??1):
    Number(existingReceipt.baseAmount);
  const original=cents(previous);
  if(original===null||original<0)return null;
  const oldDiscount=cents(existingReceipt.baseDiscountAmount??
   (Number(existingReceipt.discountAmount||0)*Number(existingReceipt.exchangeRate??1)));
  if(oldDiscount===null||oldDiscount<0)return null;
  priorBase=original+oldDiscount;
 }
 const before=current+priorBase;
 const after=before-draftBase-draftDiscountBase;
 if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after))return null;
 return {
  currentBalance:current/100,
  before:before/100,
  after:after/100,
  priorReceiptBase:priorBase/100,
  draftReceiptBase:(draftBase+draftDiscountBase)/100,
  deltaFromCurrent:(after-current)/100
 };
}
