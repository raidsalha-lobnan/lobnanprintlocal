import type {SyncCommand} from './types';

/**
 * Exact, narrow guard for retrying previously refused auto-generated catalog
 * codes after the server allocator becomes available. The command ID and
 * payload never change; no manual SKU or financial document is retried.
 */
export function isSafeAutoCodeRetryCandidate(
  cmd: SyncCommand,
  authoritativeRecordExists: boolean,
  hasDependents: boolean
): boolean {
  if(cmd.status!=='rejected'||authoritativeRecordExists||hasDependents||
     cmd.changes.length!==1||cmd.attempts>2)return false;
  const change=cmd.changes[0];
  if(!change||!['inventory','parties'].includes(change.entity)||
     change.expectedVersion!==0||change.value?._serverAutoCode!==true)
    return false;
  return /ENTITY_SERIAL_ALREADY_USED|CASH_CUSTOMER_CODE_RESERVED/.test(cmd.error||'');
}
