import {InputError} from './sync-domain.mjs';
/**
 * Invoices may be issued to customer, supplier OR employee.
 * This is an identity validation, not a mutation of balances.
 * The display name is intentionally NOT used to locate a recipient.
 */
export async function validateInvoiceCounterparty(client,workspace,invoice){
 if(!invoice||typeof invoice!=='object'||!invoice.counterpartyType)return;
 const type=invoice.counterpartyType;
 if(!['customer','supplier','employee'].includes(type))
  throw new InputError('INVOICE_UNKNOWN_COUNTERPARTY_TYPE',422);
 const id=invoice.counterpartyId||invoice.customerId;
 if(!id||invoice.customerId!==id||
   (invoice.counterpartyId&&invoice.counterpartyId!==id)||
   (type==='employee'&&invoice.employeeId&&invoice.employeeId!==id))
  throw new InputError('INVOICE_COUNTERPARTY_ID_MISMATCH',422);
 const entity=type==='employee'?'employees':'parties';
 const result=await client.query(
  'SELECT value FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',
  [workspace,entity,id]
 );
 const recipient=result.rows[0]?.value;
 if(!recipient)throw new InputError('INVOICE_COUNTERPARTY_NOT_FOUND',409,{type,id});
 if(type!=='employee'&&recipient.type!==type&&recipient.type!=='both')
  throw new InputError('INVOICE_COUNTERPARTY_WRONG_TYPE',409,{type,id});
 // Do not rewrite invoice.customerName here: it is a historical display snapshot.
 return {type,id,entity};
}
