import {InputError,validateJournal} from './sync-domain.mjs';

const cents=value=>{
 if(typeof value!=='number'||!Number.isFinite(value))throw new InputError('ATOMIC_POSTING_INVALID_MONEY',422);
 const n=Math.round(value*100);
 if(!Number.isSafeInteger(n)||Math.abs(n-value*100)>0.00001)throw new InputError('ATOMIC_POSTING_INVALID_MONEY_PRECISION',422);
 return n;
};
const moneySum=lines=>(lines||[]).reduce((s,line)=>s+cents(line.debit||0),0);

/**
 * Opt-in validator for a full invoice posting bundle.
 * This does not mutate PostgreSQL and MUST run before SyncService.push writes.
 * Finalized invoice corrections require a dedicated adjustment workflow and
 * are explicitly out of scope for this new-sale bundle.
 */
export function validateAtomicInvoicePosting(command){
 const invoiceId=command?.atomicInvoiceId;
 if(!invoiceId)return;
 const changes=command.changes||[];
 const invoices=changes.filter(c=>c.entity==='invoices');
 if(invoices.length!==1||invoices[0].id!==invoiceId||invoices[0].expectedVersion!==0)
  throw new InputError('ATOMIC_POSTING_NEW_INVOICE_REQUIRED',422);
 const invoice=invoices[0].value;
 if(!invoice||invoice.id!==invoiceId||!Array.isArray(invoice.items))
  throw new InputError('ATOMIC_POSTING_INVALID_INVOICE',422);
 const journals=changes.filter(c=>c.entity==='journalEntries');
 const stock=changes.filter(c=>c.entity==='stockMovements');
 const revenue=journals.filter(c=>c.value?.referenceType==='pos_invoice'&&c.value?.referenceId===invoiceId);
 const cogs=journals.filter(c=>c.value?.referenceType==='cogs'&&c.value?.referenceId===invoiceId);
 if(invoice.isAccountingPosted===true && revenue.length!==1)
  throw new InputError('ATOMIC_POSTING_REVENUE_REQUIRED_ONCE',422);
 if(invoice.isAccountingPosted===true && !(invoice.totalAmount>=0))
  throw new InputError('ATOMIC_POSTING_TOTAL_INVALID',422);
 if(revenue.length===1){
  validateJournal(revenue[0].value);
  const total=cents(invoice.baseTotalAmount??invoice.totalAmount);
  if(moneySum(revenue[0].value.lines)!==total)
   throw new InputError('ATOMIC_POSTING_JOURNAL_TOTAL_MISMATCH',422);
 }
 if(cogs.length>1)throw new InputError('ATOMIC_POSTING_DUPLICATE_COGS',422);
 for(const entry of journals){
  if(entry.value?.referenceId!==invoiceId)
   throw new InputError('ATOMIC_POSTING_WRONG_JOURNAL_REFERENCE',422);
 }
 for(const entry of stock){
  if(entry.value?.invoiceId&&entry.value.invoiceId!==invoiceId)
   throw new InputError('ATOMIC_POSTING_WRONG_STOCK_REFERENCE',422);
  if(entry.value?.referenceType==='pos_invoice' && ![
   invoice.invoiceNumber,'TEMP-'+invoiceId,invoice.tempInvoiceNumber
  ].includes(entry.value.referenceNumber)){
   throw new InputError('ATOMIC_POSTING_WRONG_STOCK_REFERENCE',422);
  }
 }
 const qty=new Map();
 for(const item of invoice.items){
  if(!item.itemId||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0)
   throw new InputError('ATOMIC_POSTING_INVALID_QUANTITY',422);
  qty.set(item.itemId,(qty.get(item.itemId)||0)+Number(item.quantity));
 }
 const sold=new Map();
 for(const movement of stock){
  if(movement.value?.type!=='out_sale')continue;
  const value=movement.value;
  sold.set(value.itemId,(sold.get(value.itemId)||0)+Number(value.quantity));
  if(!qty.has(value.itemId))throw new InputError('ATOMIC_POSTING_STOCK_ITEM_NOT_IN_INVOICE',422);
  if(sold.get(value.itemId)>qty.get(value.itemId)+0.000001)
   throw new InputError('ATOMIC_POSTING_STOCK_QUANTITY_EXCEEDS_INVOICE',422);
 }
 // Every stock-impacting invoice item should be present in a movement.
 // Services are exempt; client must explicitly classify physical vs service.
 const physical=invoice.items.filter(it=>it.category!=='services'&&it.category!=='copy_scan'&&
  it.itemId!=='srv-delivery'&&it.itemId!=='srv-delivery-mobile');
 for(const item of physical){
  if(Math.abs((sold.get(item.itemId)||0)-qty.get(item.itemId))>0.000001)
   throw new InputError('ATOMIC_POSTING_STOCK_MOVEMENT_REQUIRED',422);
 }
 if(physical.length&&cogs.length!==1)
  throw new InputError('ATOMIC_POSTING_COST_JOURNAL_REQUIRED',422);
 if(cogs.length===1){
  validateJournal(cogs[0].value);
  const cost=Math.round(stock.reduce((sum,m)=>sum+Number(m.value?.totalValue||0),0)*100);
  if(cost!==moneySum(cogs[0].value.lines))
   throw new InputError('ATOMIC_POSTING_COGS_MISMATCH',422);
 }
 const debt=Number(invoice.remainingAmount||0)*Number(invoice.exchangeRate||1);
 if(debt>0 && !changes.some(c=>c.entity==='parties'&&c.id===(invoice.subCustomerId||invoice.customerId)))
  throw new InputError('ATOMIC_POSTING_CUSTOMER_BALANCE_REQUIRED',422);
 // Unrelated financial side-effects cannot ride on the command.
 return true;
}
