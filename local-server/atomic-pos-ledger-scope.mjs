import {InputError} from './sync-domain.mjs';
const fail=(msg,code=422)=>{throw new InputError(msg,code);};
const rounded=(v,scale=100)=>Math.round(v*scale)/scale;
const allowedExcept=(proposal,authoritative,ignored)=>{
  for(const [key,value] of Object.entries(proposal||{})){
    if(ignored.includes(key)||value===undefined||!(key in authoritative))continue;
    if(JSON.stringify(value)!==JSON.stringify(authoritative[key]))
      return false;
  }
  return true;
};
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
    const newQty=rounded(Number(oldValue.stockQuantity||0)-qty,1000000);
    if(!Number.isFinite(newQty) ||
       Math.abs(Number(change.value?.stockQuantity)-newQty)>0.00001)
      fail('ATOMIC_POS_STOCK_DELTA_INCONSISTENT',409);
    if(!allowedExcept(change.value,oldValue,['stockQuantity','lastMovementDate']))
      fail('ATOMIC_POS_STOCK_METADATA_CHANGE_FORBIDDEN');
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
  const oldBalance=Number(oldValue.balance||0);
  const newBalance=rounded(oldBalance+due);
  if(!Number.isFinite(newBalance) ||
     Math.abs(Number(change.value?.balance)-newBalance)>0.01)
    fail('ATOMIC_POS_DEBTOR_DELTA_INCONSISTENT',409);
  if(!allowedExcept(change.value,oldValue,['balance']))
    fail('ATOMIC_POS_DEBTOR_METADATA_CHANGE_FORBIDDEN');
  return {...oldValue,balance:newBalance};
}
