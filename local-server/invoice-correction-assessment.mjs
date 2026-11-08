/**
 * Read-only, fail-closed correction assessment.
 * Returns verified accounting deltas. Does not modify records or PostgreSQL.
 * The future commit endpoint MUST require an admin, a fresh server snapshot,
 * a single SERIALIZABLE transaction and a durable correction idempotency key.
 */
const cents=(n)=>Number.isFinite(Number(n))?Math.round(Number(n)*100):NaN;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function assessInvoiceCorrection({invoice,proposed,sourceJournals,stockMovements,party}){
 const fail=(reason)=>({ready:false,reason});
 if(!invoice?.id||!invoice?.isOfficial||!invoice?.invoiceNumber||
   !proposed||proposed.id!==invoice.id||proposed.invoiceNumber!==invoice.invoiceNumber)
   return fail('INVOICE_IDENTITY_MISMATCH');
 if(!Array.isArray(invoice.items)||invoice.items.length!==1||
   !Array.isArray(proposed.items)||proposed.items.length!==1)
   return fail('ONLY_SINGLE_ITEM_SUPPORTED');
 const before=invoice.items[0],after=proposed.items[0];
 if(before.itemId!==after.itemId||before.unitPrice!==after.unitPrice)
   return fail('ITEM_PRICE_OR_ID_CHANGED');
 if(!Number.isSafeInteger(before.quantity)||!Number.isSafeInteger(after.quantity)||
   after.quantity<=0||after.quantity>before.quantity)return fail('UNVERIFIED_QUANTITY');
 if(invoice.paidAmount!==0||proposed.paidAmount!==0||
   invoice.paymentMethod!=='credit'||party?.id!==invoice.customerId)
   return fail('UNVERIFIED_PAYMENT_OR_CUSTOMER');
 const oldTotal=cents(invoice.totalAmount),newTotal=cents(proposed.totalAmount);
 if(cents(before.total)!==oldTotal||cents(after.total)!==newTotal||
   cents(after.unitPrice*after.quantity)!==newTotal||
   cents(before.unitPrice*before.quantity)!==oldTotal)
   return fail('INCONSISTENT_TOTAL');
 if(!Array.isArray(sourceJournals)||!Array.isArray(stockMovements))
   return fail('MISSING_LEDGER_EVIDENCE');
 const originalSale=sourceJournals.filter(j=>j.referenceType==='pos_invoice'&&
   j.lines?.length===2&&cents(j.lines[0].debit)===oldTotal&&
   cents(j.lines[1].credit)===oldTotal);
 const revisedSale=sourceJournals.filter(j=>j.referenceType==='pos_invoice'&&
   j.lines?.length===2&&cents(j.lines[0].debit)===newTotal&&
   cents(j.lines[1].credit)===newTotal);
 const originalCOGS=sourceJournals.filter(j=>j.referenceType==='cogs'&&
   j.lines?.length===2&&cents(j.lines[0].debit)===cents(before.quantity*(stockMovements.find(m=>m.quantity===before.quantity)?.unitPrice??NaN)));
 const correctedCOGS=sourceJournals.filter(j=>j.referenceType==='cogs'&&
   j.lines?.length===2&&cents(j.lines[0].debit)===cents(after.quantity*(stockMovements.find(m=>m.quantity===after.quantity)?.unitPrice??NaN)));
 if([originalSale,revisedSale,originalCOGS,correctedCOGS].some(x=>x.length!==1))
   return fail('DUPLICATE_OR_MISSING_REVENUE_COGS_ENTRIES');
 const originalMovement=stockMovements.filter(x=>x.type==='out_sale'&&x.itemId===before.itemId&&x.quantity===before.quantity);
 const correctedMovement=stockMovements.filter(x=>x.type==='out_sale'&&x.itemId===after.itemId&&x.quantity===after.quantity);
 if(originalMovement.length!==1||correctedMovement.length!==1)
   return fail('DUPLICATE_OR_MISSING_STOCK_MOVEMENT');
 if(sourceJournals.length!==4||stockMovements.length!==2)
   return fail('UNEXPECTED_LINKED_ENTRY_COUNT');
 const delta=(oldTotal-newTotal)/100;
 return {
   ready:true,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,
   invoiceVersionMustMatch:true,
   revenueReversal:oldTotal/100,cogsReversal:originalCOGS[0].lines[0].debit,
   stockReturnQuantity:before.quantity,correctFinalQuantity:after.quantity,
   customerBalanceDelta:-delta,
   originalEntryIds:[originalSale[0].id,originalCOGS[0].id],
   preservedEntryIds:[revisedSale[0].id,correctedCOGS[0].id],
   originalStockMovementId:originalMovement[0].id,
   correctedStockMovementId:correctedMovement[0].id,
   requiredTransactionElements:['invoice','party-balance-recompute','journal-reversal-sales','journal-reversal-cogs','stock-reversal','audit-event','telegram-after-commit'],
   warning:'MUST_NOT_APPLY_INDIVIDUAL_WRITES'
 };
}
