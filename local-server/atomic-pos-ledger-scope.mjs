import {InputError} from './sync-domain.mjs';
const fail=(msg,code=422)=>{throw new InputError(msg,code);};
const rounded=(v,scale=100)=>Math.round(v*scale)/scale;
/**
 * A POS bundle may adjust only stock quantities and debtor balances.
 * Other metadata remains PostgreSQL-authoritative, even if the client
 * browser had stale cached names, codes or purchase prices.
 */
export function authoritativeAtomicSaleEffect(command,change,oldValue){
  if(!command?.atomicInvoiceId || !['parties','inventory'].includes(change?.entity))
    return change.value;
  const invoice=command.changes.find(c=>
    c.entity==='invoices'&&c.id===command.atomicInvoiceId)?.value;
  if(!invoice||!invoice.isAccountingPosted)fail('ATOMIC_POS_INVOICE_REQUIRED');
  if(change.entity==='inventory'){
    if(!oldValue)fail('ATOMIC_POS_STOCK_ITEM_NOT_FOUND',409);
    const movements=command.changes.filter(c=>c.entity==='stockMovements'&&
      c.value?.type==='out_sale'&&c.value?.sourceInvoiceId===command.atomicInvoiceId&&
      c.value?.itemId===change.id);
    if(movements.length!==1)fail('ATOMIC_POS_STOCK_MOVEMENT_NOT_UNIQUE');
    const movement=movements[0].value, qty=Number(movement.quantity);
    if(!Number.isFinite(qty)||qty<=0)fail('ATOMIC_POS_STOCK_QTY_INVALID');
    const cost=Number(oldValue.purchasePrice||0);
    if(!Number.isFinite(cost)||Math.abs(cost-Number(movement.unitPrice||0))>0.000001)
      fail('ATOMIC_POS_COST_CHANGED_REFRESH_SALE',409);
    const before=Number(oldValue.stockQuantity??0);
    if(!Number.isFinite(before))fail('ATOMIC_POS_SERVER_STOCK_BALANCE_INVALID',409);
    const newQty=rounded(before-qty,1000000);
    if(!Number.isFinite(newQty))fail('ATOMIC_POS_SERVER_STOCK_BALANCE_INVALID',409);
    // Only authoritative PostgreSQL metadata is persisted; browser item snapshots
    // may have changed while an offline invoice was waiting for sync.
    return {...oldValue,stockQuantity:newQty,
      ...(invoice.date?{lastMovementDate:invoice.date}:{})};
  }
  const due=rounded(Number(invoice.baseTotalAmount)-Number(invoice.basePaidAmount||0));
  if(!Number.isFinite(due)||due<=0)fail('ATOMIC_POS_INVALID_DEBT_BALANCE');
  const debtor=invoice.subCustomerId||invoice.customerId;
  if(change.id!==debtor)fail('ATOMIC_POS_DEBTOR_REFERENCE_MISMATCH');
  if(!oldValue){
    if(change.value?.isSubCustomer!==true ||
       change.value?.parentPartyId!==invoice.customerId ||
       Math.abs(Number(change.value?.balance)-due)>0.01)
      fail('ATOMIC_POS_NEW_SUBCUSTOMER_INVALID');
    return change.value;
  }
  if(invoice.subCustomerId && (
    oldValue.isSubCustomer!==true ||
    (oldValue.parentPartyId||oldValue.parentCustomerId)!==invoice.customerId))
    fail('ATOMIC_POS_SUBCUSTOMER_PARENT_MISMATCH');
  const oldBalance=Number(oldValue.balance??0);
  if(!Number.isFinite(oldBalance))fail('ATOMIC_POS_SERVER_DEBT_BALANCE_INVALID',409);
  const newBalance=rounded(oldBalance+due);
  if(!Number.isFinite(newBalance))fail('ATOMIC_POS_SERVER_DEBT_BALANCE_INVALID',409);
  // An older device may have cached an obsolete customer balance or metadata.
  // Never persist these proposed fields; only add the proven receivable to the
  // authoritative balance within the same transaction as the invoice.
  return {...oldValue,balance:newBalance};
}

/** Evidence must describe the stock balance at the actual PostgreSQL commit,
 * not the outdated value cached when the customer opened the invoice.
 * Rebase inside the locked SQL transaction, without changing the original
 * signed command/fingerprint or posting a second movement.
 */
export function authoritativeAtomicStockMovement(command,change,authoritativeItem){
  if(!command?.atomicInvoiceId || change?.entity!=='stockMovements')
    return change.value;
  const movement=change.value;
  if(!authoritativeItem || !movement ||
     movement.sourceInvoiceId!==command.atomicInvoiceId ||
     movement.referenceType!=='pos_invoice' || movement.type!=='out_sale')
    fail('ATOMIC_POS_STOCK_MOVEMENT_AUTHORITY_INVALID',409);
  const before=Number(authoritativeItem.stockQuantity??0);
  const qty=Number(movement.quantity);
  const cost=Number(authoritativeItem.purchasePrice??0);
  if(!Number.isFinite(before)||!Number.isFinite(qty)||qty<=0)
    fail('ATOMIC_POS_SERVER_STOCK_BALANCE_INVALID',409);
  if(!Number.isFinite(cost)||Math.abs(cost-Number(movement.unitPrice))>0.000001)
    fail('ATOMIC_POS_COST_CHANGED_REFRESH_SALE',409);
  const after=rounded(before-qty,1000000);
  if(!Number.isFinite(after))fail('ATOMIC_POS_SERVER_STOCK_BALANCE_INVALID',409);
  const sourceIsService=['services','copy_scan'].includes(String(movement.category||''));
  const actualIsService=['services','copy_scan'].includes(String(authoritativeItem.category||''));
  if(sourceIsService!==actualIsService)
    fail('ATOMIC_POS_STOCK_CLASSIFICATION_CHANGED_REFRESH_SALE',409);
  return {...movement,balanceBefore:before,balanceAfter:after,
    ...(authoritativeItem.code!=null?{itemCode:authoritativeItem.code}:{}),
    ...(authoritativeItem.name!=null?{itemName:authoritativeItem.name}:{}),
    ...(authoritativeItem.category!=null?{category:authoritativeItem.category}:{})};
}
