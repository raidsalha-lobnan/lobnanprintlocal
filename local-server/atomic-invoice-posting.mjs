import {InputError,validateJournal} from './sync-domain.mjs';

const fail=(code,status=422)=>{throw new InputError(code,status);};
const cents=(value,label='AMOUNT')=>{
  if(typeof value!=='number'||!Number.isFinite(value))fail('ATOMIC_POSTING_INVALID_'+label);
  const minor=Math.round(value*100);
  if(!Number.isSafeInteger(minor)||Math.abs(minor-value*100)>0.00001)
    fail('ATOMIC_POSTING_INVALID_MONEY_PRECISION');
  return minor;
};
const qty=(value,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)
    fail('ATOMIC_POSTING_INVALID_'+label);
  return value;
};
/** Full, opt-in accounting sale protocol. Validates *before* PostgreSQL writes
 * and before granting narrow POS-only permission for the generated evidence.
 * All changes are applied in SyncService.pushInTx within one SQL transaction.
 */
export function validateAtomicInvoicePosting(command){
  const invoiceId=command?.atomicInvoiceId;
  if(!invoiceId)return false; // Legacy commands use their existing guardrails.
  const changes=command.changes||[];
  const allowed=new Set(['invoices','journalEntries','stockMovements','inventory','parties']);
  if(changes.some(c=>!allowed.has(c?.entity)))fail('ATOMIC_POSTING_UNRELATED_EFFECT');
  const invoices=changes.filter(c=>c.entity==='invoices');
  if(invoices.length!==1||invoices[0].id!==invoiceId||invoices[0].expectedVersion!==0)
    fail('ATOMIC_POSTING_NEW_INVOICE_REQUIRED');
  const invoice=invoices[0].value;
  if(!invoice||invoice.id!==invoiceId||!Array.isArray(invoice.items)||!invoice.items.length)
    fail('ATOMIC_POSTING_INVALID_INVOICE');
  const posted=invoice.isAccountingPosted===true;
  const journals=changes.filter(c=>c.entity==='journalEntries');
  const stock=changes.filter(c=>c.entity==='stockMovements');
  const invUpdates=changes.filter(c=>c.entity==='inventory');
  const partyUpdates=changes.filter(c=>c.entity==='parties');
  if(!posted){
    if(journals.length||stock.length||invUpdates.length||partyUpdates.length)
      fail('ATOMIC_POSTING_UNPOSTED_CANNOT_CHANGE_LEDGER');
    return true;
  }
  const total=cents(invoice.baseTotalAmount??invoice.totalAmount,'TOTAL');
  if(total<=0||cents(invoice.totalAmount,'INVOICE_TOTAL')<=0)
    fail('ATOMIC_POSTING_TOTAL_INVALID');
  const baseRate=Number(invoice.exchangeRate||1);
  if(!Number.isFinite(baseRate)||baseRate<=0)fail('ATOMIC_POSTING_EXCHANGE_RATE_INVALID');
  if(Math.abs(Math.round(Number(invoice.totalAmount)*baseRate*100)-total)>1)
    fail('ATOMIC_POSTING_BASE_TOTAL_EXCHANGE_MISMATCH');
  const subtotal=cents(invoice.subtotal,'SUBTOTAL');
  const discount=cents(invoice.discountTotal??0,'DISCOUNT');
  const tax=cents(invoice.taxAmount??0,'TAX');
  const charges=cents(invoice.additionalCharges??0,'CHARGES');
  if(subtotal<discount||subtotal-discount+tax+charges!==cents(invoice.totalAmount,'TOTAL'))
    fail('ATOMIC_POSTING_INVOICE_TOTAL_COMPONENTS_MISMATCH');

  const expectedPhysical=new Map(),deliveryProducts=new Set(['srv-delivery','srv-delivery-mobile']);
  for(const line of invoice.items){
    const id=line?.itemId;
    if(typeof id!=='string'||!id)fail('ATOMIC_POSTING_MISSING_ITEM_ID');
    const quantity=qty(line.quantity,'QUANTITY');
    if(quantity<=0)fail('ATOMIC_POSTING_INVALID_QUANTITY');
    const price=qty(line.unitPrice,'UNIT_PRICE');
    const lineDiscount=cents(line.discount??0,'LINE_DISCOUNT');
    if(lineDiscount>Math.round(quantity*price*100))
      fail('ATOMIC_POSTING_INVALID_LINE_DISCOUNT');
    if(line.category!=='services'&&line.category!=='copy_scan'&&!deliveryProducts.has(id)){
      expectedPhysical.set(id,(expectedPhysical.get(id)||0)+quantity);
    }
  }
  const revenue=journals.filter(c=>c.value?.referenceType==='pos_invoice'&&c.value?.referenceId===invoiceId);
  const cogs=journals.filter(c=>c.value?.referenceType==='cogs'&&c.value?.referenceId===invoiceId);
  if(revenue.length!==1)fail('ATOMIC_POSTING_REVENUE_REQUIRED_ONCE');
  if(cogs.length>1||journals.length!==revenue.length+cogs.length)
    fail('ATOMIC_POSTING_UNEXPECTED_JOURNAL');
  for(const entry of journals){
    if(entry.expectedVersion!==0||entry.value?.referenceId!==invoiceId)
      fail('ATOMIC_POSTING_WRONG_JOURNAL_REFERENCE');
    validateJournal(entry.value);
  }
  const revenueLines=revenue[0].value.lines;
  let credited=0,debited=0,arDebited=0;
  const credits={revenue:0,delivery:0,tax:0};
  for(const line of revenueLines){
    const d=cents(line.debit??0),c=cents(line.credit??0);
    debited+=d;credited+=c;
    if(line.accountCode==='1201')arDebited+=d-c;
    if(c){
      if(line.accountCode==='4101') credits.revenue+=c;
      else if(line.accountCode==='2104') credits.delivery+=c;
      else if(line.accountCode==='2103') credits.tax+=c;
      else fail('ATOMIC_POSTING_UNEXPECTED_REVENUE_CREDIT_ACCOUNT');
    }
  }
  if(debited!==total||credited!==total)
    fail('ATOMIC_POSTING_JOURNAL_TOTAL_MISMATCH');
  const baseTax=cents(invoice.taxAmount*baseRate,'BASE_TAX_COMPUTED');
  if(Math.abs(baseTax-credits.tax)>1)
    fail('ATOMIC_POSTING_TAX_LIABILITY_MISMATCH');
  const calculatedDelivery=Math.round(invoice.items.reduce((sum,line)=>{
    if(deliveryProducts.has(line.itemId)||line.itemCode==='DELIVERY')
      return sum+Math.max(0,Number(line.quantity)*Number(line.unitPrice)-Number(line.discount||0));
    return sum;
  },0)*baseRate*100);
  if(Math.abs(calculatedDelivery-credits.delivery)>1)
    fail('ATOMIC_POSTING_DELIVERY_LIABILITY_MISMATCH');
  const paid=cents(invoice.basePaidAmount??0,'BASE_PAID');
  if(paid<0||paid>total||arDebited!==total-paid)
    fail('ATOMIC_POSTING_RECEIVABLE_MISMATCH');
  const remainder=Number(invoice.remainingAmount||0);
  if(Math.abs(Math.round(remainder*baseRate*100)-arDebited)>1)
    fail('ATOMIC_POSTING_OUTSTANDING_MISMATCH');

  const physical=expectedPhysical;
  const aggregated=new Map();
  let cost=0;
  for(const movement of stock){
    const m=movement.value;
    if(movement.expectedVersion!==0||m?.type!=='out_sale'||m?.referenceType!=='pos_invoice'||
       !m.itemId||m.sourceInvoiceId!==invoiceId ||
       ![invoice.invoiceNumber,'TEMP-'+invoiceId,invoice.tempInvoiceNumber].includes(m.referenceNumber))
      fail('ATOMIC_POSTING_WRONG_STOCK_REFERENCE');
    const amount=qty(m.quantity,'STOCK_QUANTITY');
    if(amount<=0||!physical.has(m.itemId))
      fail('ATOMIC_POSTING_STOCK_ITEM_NOT_IN_INVOICE');
    aggregated.set(m.itemId,(aggregated.get(m.itemId)||0)+amount);
    cost+=cents(m.totalValue??0,'STOCK_COST');
    if(!Number.isFinite(m.balanceBefore)||!Number.isFinite(m.balanceAfter)||
       Math.abs((m.balanceBefore-m.balanceAfter)-amount)>0.00001)
      fail('ATOMIC_POSTING_STOCK_BALANCE_DELTA_INVALID');
    const updated=invUpdates.filter(c=>c.id===m.itemId);
    if(updated.length!==1||Math.abs(Number(updated[0].value?.stockQuantity)-m.balanceAfter)>0.00001)
      fail('ATOMIC_POSTING_INVENTORY_UPDATE_MISSING');
  }
  if(invUpdates.length!==physical.size)fail('ATOMIC_POSTING_INVENTORY_UPDATE_EXTRA');
  for(const [id,quantity] of physical){
    if(Math.abs((aggregated.get(id)||0)-quantity)>0.000001)
      fail('ATOMIC_POSTING_STOCK_MOVEMENT_REQUIRED');
    if(stock.filter(s=>s.value?.itemId===id).length!==1)
      fail('ATOMIC_POSTING_STOCK_MOVEMENT_MUST_BE_AGGREGATED');
  }
  if(cost>0&&cogs.length!==1)fail('ATOMIC_POSTING_COST_JOURNAL_REQUIRED');
  if(cost===0&&cogs.length)fail('ATOMIC_POSTING_ZERO_COST_JOURNAL_UNEXPECTED');
  if(cogs.length){
    const l=cogs[0].value.lines;
    if(l.length!==2||l[0].accountCode!=='5101'||l[1].accountCode!=='1301'||
       cents(l[0].debit??0)!==cost||cents(l[1].credit??0)!==cost)
      fail('ATOMIC_POSTING_COGS_MISMATCH');
  }
  const type=invoice.counterpartyType||'customer';
  const debtor=invoice.subCustomerId||invoice.customerId;
  if(partyUpdates.length>1)fail('ATOMIC_POSTING_UNRELATED_PARTY_UPDATE');
  if(partyUpdates.length&&(!partyUpdates[0].value||partyUpdates[0].id!==debtor))
    fail('ATOMIC_POSTING_UNRELATED_PARTY_UPDATE');
  if(arDebited>0&&type!=='employee'&&!partyUpdates.some(c=>c.id===debtor))
    fail('ATOMIC_POSTING_CUSTOMER_BALANCE_REQUIRED');
  if(type==='employee'&&partyUpdates.length)fail('ATOMIC_POSTING_EMPLOYEE_PARTY_MISMATCH');
  return true;
}
