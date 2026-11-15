import {proveInvoiceOnlyPartyBalance} from './invoice-party-balance.mjs';

const money=x=>{
 const n=Number(x);
 if(!Number.isFinite(n)||Math.abs(n)>1e12||Math.abs(n*100-Math.round(n*100))>0.00001)return null;
 return Math.round(n*100);
};

/** The receipt is already in sync_records when this executes: exclude its id.
 * Only re-project a customer card if every earlier invoice, receipt GL and
 * treasury movement proves the exact net receivable. For all other complex
 * accounts preserve existing behavior and do not invent historical payments.
 */
export async function proveCustomerBalanceBeforeReceipt(client,workspace,partyRow,currentVoucherId){
 const party=partyRow?.value,id=partyRow?.record_id;
 if(!id||!party||party.type!=='customer'||party.isSubCustomer||
    party.code==='CUST-0001'||Number(party.openingBalance||0)!==0||
    party.payments?.length||party.receiptHistory?.length||party.paymentHistory?.length)return null;
 const child=(await client.query(
  "SELECT COUNT(*)::int n FROM sync_records WHERE workspace=$1 AND entity='parties' AND (value->>'parentPartyId'=$2 OR value->>'parentCustomerId'=$2)",[workspace,id])).rows[0]?.n;
 if(child)return null;
 const invoices=(await client.query(
  "SELECT value FROM sync_records WHERE workspace=$1 AND entity='invoices' AND value->>'customerId'=$2",
  [workspace,id])).rows;
 if(!invoices.length)return null;
 const invIds=invoices.map(r=>r.value.id);
 const other=(await client.query(
  "SELECT COUNT(*)::int n FROM sync_records WHERE workspace=$1 AND entity=ANY($2::text[]) AND (value->>'partyId'=$3 OR value->>'customerId'=$3 OR value->>'supplierId'=$3 OR value->>'counterpartyId'=$3 OR value->>'referenceInvoiceId'=ANY($4::text[]) OR value->>'relatedDocId'=ANY($4::text[]))",
  [workspace,['purchases','purchaseReturns','salesReturns','printOrders','debtClearings','treasuryTransactions'],id,invIds])).rows[0]?.n;
 if(other)return null;
 const journals=(await client.query(
  "SELECT value FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND value->>'referenceId'=ANY($2::text[])",
  [workspace,invIds])).rows;
 const proof=proveInvoiceOnlyPartyBalance({
  partyId:id,party,invoices,journals,hasOtherPartyDocuments:false
 });
 if(!proof)return null;
 const receipts=(await client.query(
  "SELECT record_id,value FROM sync_records WHERE workspace=$1 AND entity='vouchers' AND value->>'partyId'=$2 AND record_id<>$3",
  [workspace,id,currentVoucherId])).rows;
 let total=0;
 for(const {record_id, value:v} of receipts){
  if(v.type!=='receipt'||v.referenceInvoiceId||v.relatedDocId||
     v.subCustomerId||(v.currency&&v.currency!=='ILS')||
     Number(v.exchangeRate||1)!==1)return null;
  const amount=money(v.baseAmount??v.amount);
  if(amount===null||amount<=0)return null;
  const journalRows=(await client.query(
   "SELECT value FROM sync_records WHERE workspace=$1 AND entity='journalEntries' AND value->>'referenceId'=$2 AND value->>'referenceType'='receipt'",
   [workspace,record_id])).rows;
  if(journalRows.length!==1)return null;
  const lines=journalRows[0].value.lines||[];
  const debit=lines.reduce((s,l)=>s+(money(l.debit)||0),0);
  const credit=lines.reduce((s,l)=>s+(money(l.credit)||0),0);
  const ar=lines.filter(l=>l.accountCode==='1201')
   .reduce((s,l)=>s+(money(l.credit)||0)-(money(l.debit)||0),0);
  if(debit!==credit||ar!==amount)return null;
  const movements=(await client.query(
   "SELECT t.value AS treasury,x FROM sync_records t CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.value->'transactions','[]'::jsonb)) x WHERE t.workspace=$1 AND t.entity='treasuries' AND x->>'referenceId'=$2",
   [workspace,record_id])).rows;
  if(movements.length!==1||movements[0].treasury.accountCode!==v.treasuryAccountCode||
    money(movements[0].x.baseAmount??movements[0].x.amount)!==amount)return null;
  total+=amount;
 }
 return (proof.balanceMinor-total)/100;
}
