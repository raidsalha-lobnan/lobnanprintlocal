import type {StoredRecord, SyncCommand} from './types';

export const rejectedBulkBystanderKey=(commandId:string,recordId:string):string=>
  'bulk-party-bystander:' + commandId + ':' + recordId;

export function isProtectedRejectedBulkPartySnapshot(command:SyncCommand):boolean {
  return command.status==='rejected' &&
    /BULK_PARTY_SNAPSHOT_REJECTED_USE_LEDGER_RECONCILIATION/.test(command.error||'') &&
    command.changes.length>10 && command.changes.every(c=>c.entity==='parties');
}

function jsonEquals(a:unknown,b:unknown):boolean{
  if(Object.is(a,b))return true;
  if(Array.isArray(a)||Array.isArray(b))
    return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>jsonEquals(x,b[i]));
  if(a&&b&&typeof a==='object'&&typeof b==='object') {
    const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;
    const ak=Object.keys(aa),bk=Object.keys(bb);
    return ak.length===bk.length&&ak.every(k=>Object.prototype.hasOwnProperty.call(bb,k)&&jsonEquals(aa[k],bb[k]));
  }
  return false;
}

/** Evidence, NOT a retry or approval. The rejected bulk command is preserved.
 * A matching PARTY record was already present in an authenticated PostgreSQL
 * snapshot, so that one historical full-list entry need not block subsequent
 * independent modifications of the same stable record.
 */
export function isVerifiedRejectedBulkBystander(
  command:SyncCommand,recordId:string,authoritative:StoredRecord|null
):boolean {
  if(!isProtectedRejectedBulkPartySnapshot(command)||!authoritative||
    authoritative.entity!=='parties'||authoritative.id!==recordId||
    authoritative.value===null)return false;
  const change=command.changes.find(c=>c.entity==='parties'&&c.id===recordId);
  if(!change||change.value===null||authoritative.version<change.expectedVersion)return false;
  return jsonEquals(change.value,authoritative.value);
}
