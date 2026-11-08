import {InputError} from './sync-domain.mjs';

/** Immutable, workspace-scoped human-visible serials.
 * Internal record_id is the primary reference used by all linked documents.
 * Names and descriptions are never identity keys.
 */
const serials={
  parties:['code'],
  inventory:['code'],
  treasuries:['code','accountCode']
};
const normalized=v=>String(v??'').trim().toLocaleLowerCase('en-US');
const requiredSerial={parties:'code',inventory:'code',treasuries:'accountCode'};
export async function assertStableEntitySerial(client,workspace,entity,recordId,oldValue,newValue){
 if(!newValue||typeof newValue!=='object')return;
 const required=requiredSerial[entity];
 if(!oldValue&&required&&!normalized(newValue[required]))
  throw new InputError('ENTITY_SERIAL_REQUIRED',422,{entity,id:recordId,field:required});
 const fields=serials[entity]||[];
 for(const field of fields){
  const oldCode=oldValue?.[field],newCode=newValue[field];
  if(oldValue && String(oldCode??'')!==String(newCode??'')){
   throw new InputError('ENTITY_SERIAL_IMMUTABLE',409,{entity,id:recordId,field});
  }
  if(!oldValue&&normalized(newCode)){
   const match=await client.query(
    "SELECT record_id FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id<>$3 AND lower(btrim(value->>$4))=lower(btrim($5)) LIMIT 1",
    [workspace,entity,recordId,field,String(newCode)]
   );
   if(match.rows.length)throw new InputError('ENTITY_SERIAL_ALREADY_USED',409,{
     entity,id:recordId,field,existingId:match.rows[0].record_id
   });
  }
 }
}
