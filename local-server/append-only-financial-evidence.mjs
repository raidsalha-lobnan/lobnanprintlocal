import {InputError} from './sync-domain.mjs';

const APPEND_ONLY_ENTITIES=new Set(['journalEntries','stockMovements']);

function equalJson(a,b){
  if(a===b)return true;
  if(a===null||b===null||typeof a!==typeof b)return false;
  if(typeof a!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&
    a.length===b.length&&a.every((v,i)=>equalJson(v,b[i]));
  const aKeys=Object.keys(a),bKeys=Object.keys(b);
  return aKeys.length===bKeys.length&&
    aKeys.every(key=>Object.prototype.hasOwnProperty.call(b,key)&&equalJson(a[key],b[key]));
}

/**
 * Ledger evidence is append-only. Existing journal entries and stock movements
 * cannot be silently replaced from a legacy browser/device sync command.
 * A correction must use a distinct, authorized reversal/adjustment record.
 * Reject before UPDATE inside the same PostgreSQL transaction.
 *
 * An exact same-value retry may proceed (the command-level idempotency and
 * record-version checks still apply); no accounting evidence is changed.
 */
export function assertAppendOnlyAccountingEvidence(entity,previous,proposed,recordId){
  if(!APPEND_ONLY_ENTITIES.has(entity)||!previous)return;
  if(equalJson(previous,proposed))return;
  throw new InputError('POSTED_ACCOUNTING_EVIDENCE_IMMUTABLE',409,{
    entity,id:recordId,reason:'Use a documented adjusting/reversing entry; never overwrite existing journal or stock evidence.'
  });
}
