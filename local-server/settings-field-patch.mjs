import crypto from 'node:crypto';
import {InputError} from './sync-domain.mjs';

export const SETTINGS_PATCH_MARKER='_settingsPatchV1';
const APPROVED_KEYS=new Set([
 'appTitle','businessName','businessNameEn','activityType','taxNumber','crNumber',
 'showTaxNumberInPrints','showCrNumberInPrints','phone','email','address','logoUrl',
 'headerImageUrl','stampUrl','signatureUrl','addresses','phones','name','description',
 'invoiceFooter','currency','baseCurrencyCode','vatRate','invoiceFooterNote',
 'logoText','currencies','unitsOfMeasure','defaultPosLayout','defaultPosButtons',
 'defaultPosColumnWidths','userScreenConfigs','homeShortcuts','categories',
 'telegramConfig',
]);
export const isSettingsFieldPatch=value=>value?._settingsPatchV1===true;
export function stableJson(value){
  if(value===undefined)return '__undefined__';
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
  return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(
    key=>JSON.stringify(key)+':'+stableJson(value[key])).join(',')+'}';
}
const digest=value=>crypto.createHash('sha256').update(stableJson(value)).digest('hex');
export function applySettingsFieldPatch(oldValue,patch,actualVersion,expectedVersion){
  if(!isSettingsFieldPatch(patch))return patch;
  if(!patch.changes||typeof patch.changes!=='object'||Array.isArray(patch.changes)||
     !patch.before||typeof patch.before!=='object'||Array.isArray(patch.before))
    throw new InputError('SETTINGS_PATCH_INVALID',422);
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>actualVersion)
    throw new InputError('SETTINGS_VERSION_IN_FUTURE',409);
  const keys=Object.keys(patch.changes);
  if(!keys.length||keys.length>APPROVED_KEYS.size||keys.some(k=>!APPROVED_KEYS.has(k)))
    throw new InputError('SETTINGS_FIELD_NOT_ALLOWED',422);
  const next={...(oldValue||{}),id:patch.id};
  const conflicting=[];
  for(const key of keys){
    const expectedHash=patch.before[key];
    if(typeof expectedHash!=='string'||!/^[0-9a-f]{64}$/.test(expectedHash))
      throw new InputError('SETTINGS_BASE_HASH_REQUIRED',422);
    const currentHash=digest(oldValue?.[key]);
    // Same-field newer changes are rejected unless the desired value was
    // independently committed already. Unrelated fields always merge.
    if(currentHash!==expectedHash&&
       digest(patch.changes[key])!==currentHash){
      conflicting.push(key);
      continue;
    }
    next[key]=patch.changes[key];
  }
  if(conflicting.length)throw new InputError(
    'SETTINGS_FIELD_CONFLICT',409,{fields:conflicting}
  );
  return next;
}
export async function findVerifiedSettingsReceipts(pool,workspace,actorId,proofs){
  if(!Array.isArray(proofs)||!proofs.length||proofs.length>32||
     proofs.some(p=>!p||typeof p.id!=='string'||p.id.length>180||
       !/^[a-f0-9-]{10,180}$/i.test(p.id)||
       typeof p.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(p.fingerprint)))
    throw new InputError('INVALID_RECEIPT_CHECK',422);
  const wanted=new Map(proofs.map(p=>[p.id,p.fingerprint]));
  if(wanted.size!==proofs.length)throw new InputError('DUPLICATE_RECEIPT_CHECK',422);
  const result=await pool.query(
    'SELECT command_id,fingerprint,receipt FROM sync_commands WHERE workspace=$1 AND actor_id=$2 AND command_id=ANY($3::text[])',
    [workspace,actorId,[...wanted.keys()]]
  );
  const receipts=[];
  for(const row of result.rows){
    if(row.fingerprint!==wanted.get(row.command_id))continue;
    const changes=row.receipt?.changes||[];
    if(changes.length!==1||changes[0]?.entity!=='settings'||
       !['global','workspace-settings'].includes(changes[0]?.id)||
       !Number.isSafeInteger(changes[0]?.version)||changes[0].version<1)continue;
    receipts.push({id:row.command_id,changes:[{
      entity:'settings',id:changes[0].id,version:changes[0].version,
    }]});
  }
  return receipts;
}
