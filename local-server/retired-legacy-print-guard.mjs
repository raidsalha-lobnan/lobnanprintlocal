import {InputError} from './sync-domain.mjs';

/**
 * The original 2026-10 printing demo records were never approved.
 * They were retired with both original and reversal journals removed.
 * Prevent an old offline device from silently repopulating the ledger
 * after a hard purge. The retired ID registry is technical sync metadata,
 * not an accounting transaction.
 */
const legacyPrintJournalTypes=new Set(['print_order','print_order_void_reversal']);

export async function forbidRetiredLegacyPrintResurrection(client,workspace,change){
 if(!['printOrders','journalEntries','debtClearings','employeeAdvances','employeeDeductions','employeeIncentives'].includes(change.entity))return;
 if(change.entity==='debtClearings'&&change.value?.clearingNumber==='CLR-2026-001')
  throw new InputError('RETIRED_FAKE_CLEARING_NUMBER_RESERVED',409);
 if(change.entity==='journalEntries'&&
    legacyPrintJournalTypes.has(change.value?.referenceType)){
  throw new InputError('RETIRED_FAKE_PRINT_JOURNAL_FORBIDDEN',409,{
   entity:change.entity,id:change.id
  });
 }
 const retiredSource=change.entity==='journalEntries'&&change.value?.referenceId
  ?'source:'+String(change.value.referenceId):'';
 const matching=await client.query(
  "SELECT 1 FROM sync_retired_legacy_records WHERE workspace=$1 AND entity=$2 AND (record_id=$3 OR ($4<>'' AND record_id=$4)) LIMIT 1",
  [workspace,change.entity,change.id,retiredSource]
 );
 if(matching.rows.length)throw new InputError('RETIRED_LEGACY_PRINT_RECORD_CANNOT_RESURRECT',409,{
  entity:change.entity,id:change.id
 });
}
