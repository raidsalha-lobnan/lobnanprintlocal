import type {JsonObject,StoredRecord,SyncCommand,VersionedChange} from './types';
import {isRedundantRejectedInvoiceResubmit} from './invoiceEdits';
const contactKeys=new Set(['phone','mobile','email','address','notes','website','contactPerson','contactName']);
function equal(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(Array.isArray(a)||Array.isArray(b))
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  const av=a as Record<string,unknown>,bv=b as Record<string,unknown>;
  return [...new Set([...Object.keys(av),...Object.keys(bv)])].every(k=>equal(av[k],bv[k]));
 }
 return false;
}
export type ConflictPlan=
 | {kind:'already-confirmed'; authoritative:StoredRecord; reason:string}
 | {kind:'rebase'; authoritative:StoredRecord; expectedVersion:number; merged:JsonObject; reason:string}
 | {kind:'manual'; reason:string};
/** Conservative 3-way merge. Only nonfinancial contact fields may be merged,
 * and ONLY with the exact local pre-edit base recorded at enqueue time.
 */
export function planConflictResolution(cmd:SyncCommand,server:StoredRecord|null,hasDependentCommand=false):ConflictPlan {
 if(cmd.changes.length!==1||hasDependentCommand)
   return {kind:'manual',reason:'DEPENDENT_OR_MULTIRECORD_TRANSACTION'};
 const change=cmd.changes[0];
 if(!server||server.entity!==change.entity||server.id!==change.id||server.value===null)
   return {kind:'manual',reason:'AUTHORITATIVE_RECORD_MISSING'};
 if(equal(change.value,server.value))
   return {kind:'already-confirmed',authoritative:server,reason:'EXACT_SERVER_MATCH'};
 if(change.entity==='invoices' && change.value &&
   isRedundantRejectedInvoiceResubmit(server.value,change.value))
   return {kind:'already-confirmed',authoritative:server,reason:'SERVER_ASSIGNED_INVOICE_FIELDS_ONLY'};
 if(change.entity!=='parties'||!change.value||!cmd.baseRecords||
    cmd.baseRecords.length!==1||!cmd.baseRecords[0]||
    cmd.baseRecords[0].entity!==change.entity||
    cmd.baseRecords[0].id!==change.id||
    cmd.baseRecords[0].version!==change.expectedVersion||
    !cmd.baseRecords[0].value)
   return {kind:'manual',reason:'NO_VERIFIED_NONFINANCIAL_BASE'};
 const base=cmd.baseRecords[0].value, proposed=change.value, current=server.value;
 const modified=[...new Set([...Object.keys(base),...Object.keys(proposed)])]
   .filter(k=>!equal(base[k],proposed[k]));
 if(modified.length===0)return {kind:'manual',reason:'NOT_AN_EDIT'};
 if(!modified.every(k=>contactKeys.has(k)))
   return {kind:'manual',reason:'FINANCIAL_OR_IDENTITY_FIELD_CHANGED'};
 if(modified.some(k=>!equal(base[k],current[k])&&!equal(proposed[k],current[k])))
   return {kind:'manual',reason:'SAME_FIELD_CHANGED_ON_TWO_DEVICES'};
 if(server.version<change.expectedVersion)
   return {kind:'manual',reason:'INVALID_SERVER_VERSION'};
 const merged={...current};
 for(const key of modified){
   if(Object.prototype.hasOwnProperty.call(proposed,key))merged[key]=proposed[key];
   else delete merged[key];
 }
 if(equal(merged,current))
   return {kind:'already-confirmed',authoritative:server,reason:'CONTACT_EDIT_ALREADY_APPLIED'};
 return {kind:'rebase',authoritative:server,expectedVersion:server.version,merged,reason:'DISJOINT_CONTACT_FIELDS'};
}
