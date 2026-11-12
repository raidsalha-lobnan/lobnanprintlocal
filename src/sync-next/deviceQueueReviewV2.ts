import type {StoredRecord,SyncCommand} from './types';
import {isProtectedRejectedBulkPartySnapshot} from './rejectedBulkBystanders';

const same=(a:unknown,b:unknown):boolean=>{
 if(Object.is(a,b))return true;
 if(Array.isArray(a)||Array.isArray(b))
   return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
   const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;
   const keys=Object.keys(aa);
   return keys.length===Object.keys(bb).length&&keys.every(k=>
     Object.prototype.hasOwnProperty.call(bb,k)&&same(aa[k],bb[k]));
 }
 return false;
};
const safeFields=(a:unknown,b:unknown):string[]=>{
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))
   return ['record'];
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
 return [...new Set([...Object.keys(x),...Object.keys(y)])]
   .filter(k=>!same(x[k],y[k]))
   .filter(k=>!/password|secret|token|credential|session|auth|hash|key/i.test(k))
   .sort();
};
const norm=(x:unknown)=>String(x??'').trim().toLowerCase();
const isFinancialField=(field:string)=>
 /balance|amount|total|price|quantity|stock|discount|tax|cost|currency|paid|payment|lineitem|item|delivery|receipt|journal/i.test(field);
export type DeviceQueueReviewV2=ReturnType<typeof compareDeviceQueueWithPostgresV2>;
/** Read-only server-vs-browser queue diagnosis. No bearer tokens, personal contact
 * details, invoice line items, or monetary amounts are exported. It NEVER
 * retries, acknowledges, archives, or rewrites an operation.
 */
export function compareDeviceQueueWithPostgresV2(
 queued:readonly SyncCommand[],records:readonly StoredRecord[],
 savedAt=new Date().toISOString()
){
 const idx=new Map(records.map(r=>[r.entity+'\u001f'+r.id,r]));
 const inventories=records.filter(r=>r.entity==='inventory'&&r.value!==null);
 const bulk=queued.filter(isProtectedRejectedBulkPartySnapshot).map(cmd=>{
   const changed:{id:string;serverVersion:number|null;expectedVersion:number;fields:string[]}[]=[];
   let identical=0,missing=0,older=0;
   for(const change of cmd.changes){
     const row=idx.get('parties\u001f'+change.id);
     if(!row||row.value===null){missing++;continue;}
     if(row.version<change.expectedVersion){older++;continue;}
     if(same(row.value,change.value)){identical++;continue;}
     changed.push({id:change.id,serverVersion:row.version,
       expectedVersion:change.expectedVersion,fields:safeFields(change.value,row.value)});
   }
   return {commandId:cmd.id,records:cmd.changes.length,identical,missing,
     olderServerVersion:older,different:changed.length,
     differentRecords:changed};
 });
 const rejectedInvoices=queued.filter(cmd=>cmd.status==='rejected'
   &&cmd.changes.length===1&&cmd.changes[0].entity==='invoices'
   &&/ENTITY_PERMISSION_DENIED/.test(cmd.error||'')).map(cmd=>{
   const change=cmd.changes[0],server=idx.get('invoices\u001f'+change.id);
   const fields=server?.value?safeFields(change.value,server.value):[];
   return {commandId:cmd.id,id:change.id,
     number:server?.value?.invoiceNumber??null,
     expectedVersion:change.expectedVersion,serverVersion:server?.version??null,
     exists:!!server,identical:!!server&&same(change.value,server.value),
     changedFields:fields,
     financialFieldsDiffer:fields.some(isFinancialField),
     decision:'KEEP_QUEUED_UNTIL_AUTHORIZED_COMPARISON'};
 });
 const rejectedInventory=queued.filter(cmd=>cmd.status==='rejected'
   &&cmd.changes.length===1&&cmd.changes[0].entity==='inventory'
   &&cmd.changes[0].expectedVersion===0
   &&/ENTITY_SERIAL_ALREADY_USED/.test(cmd.error||'')).map(cmd=>{
   const change=cmd.changes[0],value=change.value||{};
   const code=String(value.code||'');
   const server=idx.get('inventory\u001f'+change.id);
   const collisions=inventories.filter(row=>norm(row.value?.code)===norm(code)&&row.id!==change.id);
   const dependent=queued.filter(other=>other.id!==cmd.id&&other.changes.some(c=>
     c.entity==='inventory'&&c.id===change.id));
   return {commandId:cmd.id,id:change.id,
     itemName:String(value.name||value.itemName||''),requestedCode:code,
     automaticCodeRequested:value._serverAutoCode===true,
     serverSameIdExists:!!server,serverVersion:server?.version??null,
     duplicateCodeOwners:collisions.map(row=>({id:row.id,code:String(row.value?.code||''),
       name:String(row.value?.name||row.value?.itemName||'')})),
     dependentCommands:dependent.map(x=>({id:x.id,status:x.status,
       expectedVersion:x.changes.find(y=>y.id===change.id)?.expectedVersion??null})),
     decision:collisions.length
       ?'REVIEW_DIFFERENT_ITEM_OR_SAME_PRODUCT_BEFORE_NEW_SERIAL'
       :'INSPECT_SERVER_CODE_AND_LOCAL_OPERATION_NO_AUTOMATIC_REPLAY'};
 });
 return {
   kind:'LOBNA_AUTHORITATIVE_QUEUE_TRIAGE_V2',
   savedAt,
   warning:'Read-only. Internal references and product names/codes are private. No amounts, customer names, passwords, tokens or invoice lines are included.',
   totals:{all:queued.length,pending:queued.filter(x=>x.status==='pending').length,
     conflict:queued.filter(x=>x.status==='conflict').length,
     rejected:queued.filter(x=>x.status==='rejected').length},
   bulk, rejectedInvoices,rejectedInventory, financialWrites:0,stockWrites:0,
   reviewRequired:true
 };
}
