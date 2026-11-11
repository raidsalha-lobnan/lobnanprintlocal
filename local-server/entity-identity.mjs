import {InputError} from './sync-domain.mjs';

/** Immutable, workspace-scoped human-visible serials.
 * Internal record_id is the primary reference used by all linked documents.
 * Names and descriptions are never identity keys.
 */
const uniqueSerials={
  parties:['code'],
  inventory:['code'],
  treasuries:['code','accountCode']
};
// Category is immutable on an existing item but deliberately NOT unique:
// every warehouse category can contain any number of different products.
const immutableOnly={inventory:['category']};
const normalized=v=>String(v??'').trim().toLocaleLowerCase('en-US');
const requiredSerial={parties:'code',inventory:'code',treasuries:'accountCode'};
export async function assertStableEntitySerial(client,workspace,entity,recordId,oldValue,newValue){
 if(!newValue||typeof newValue!=='object')return;
 const required=requiredSerial[entity];
 if(!oldValue&&required&&!normalized(newValue[required]))
  throw new InputError('ENTITY_SERIAL_REQUIRED',422,{entity,id:recordId,field:required});
 // CUST-0001 is the unique cash-customer identity, not an available number
 // for an ordinary customer when a device has not yet loaded that record.
 if(entity==='parties'&&!oldValue&&normalized(newValue.code)==='cust-0001' &&
    !['pt-cust-1','cust-0001','c-0001','1'].includes(String(recordId).toLowerCase())){
  throw new InputError('CASH_CUSTOMER_CODE_RESERVED',409,{entity,id:recordId,field:'code'});
 }
 const fields=uniqueSerials[entity]||[];
 for(const field of immutableOnly[entity]||[]){
  if(oldValue && String(oldValue[field]??'')!==String(newValue[field]??''))
   throw new InputError('ENTITY_SERIAL_IMMUTABLE',409,{entity,id:recordId,field});
 }
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

/**
 * Assign a fresh sequential code only for NEW customer or inventory records
 * that explicitly opted into automatic coding. This executes under the
 * workspace's PostgreSQL FOR UPDATE lock, so concurrent devices cannot claim
 * the same visible code. Stable internal IDs never change.
 *
 * Manually entered codes are NEVER silently renamed.
 */
export async function allocateAutomaticEntityCode(client,workspace,entity,recordId,oldValue,newValue){
 if(oldValue||!newValue||newValue._serverAutoCode!==true||
    !['parties','inventory'].includes(entity))return newValue;
 const requested=String(newValue.code||'').trim().toUpperCase();
 const parsed=requested.match(/^([A-Z]{2,12})[-_](\d{1,8})$/);
 if(!parsed)throw new InputError('AUTO_SERIAL_FORMAT_INVALID',422,{entity,id:recordId});
 const prefix=parsed[1];
 const width=Math.max(parsed[2].length,['PRI','BOK','ACC'].includes(prefix)?5:4);
 const result=await client.query(
   "SELECT value->>'code' AS code FROM sync_records WHERE workspace=$1 AND entity=$2 AND value IS NOT NULL",
   [workspace,entity]
 );
 const existingCodes=result.rows.map(row=>String(row.code||'').trim());
 if(entity==='parties'&&prefix==='CUST'){
  // The cash-customer permanent display number is never auto-allocated.
  existingCodes.push('CUST-0001');
 }
 const used=new Set(existingCodes.map(x=>normalized(x)));
 let code=requested;
 if(used.has(normalized(code))){
   const pattern=new RegExp('^'+prefix+'[-_]?(\\d+)$','i');
   const highest=existingCodes.reduce((max,c)=>{
     const match=c.match(pattern);
     return match?Math.max(max,Number(match[1])):max;
   },0);
   let next=highest+1;
   code=prefix+'-'+String(next).padStart(width,'0');
   while(used.has(normalized(code))){
     next++;
     code=prefix+'-'+String(next).padStart(width,'0');
   }
 }
 const {_serverAutoCode:marker,...clean}=newValue;
 return {...clean,code};
}
