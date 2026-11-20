import crypto from 'node:crypto';
import {InputError} from './sync-domain.mjs';

/**
 * Transport-only fragments of ONE immutable accounting command. A fragment
 * never changes financial records. Reassemble the original bytes, validate,
 * authorize and submit via the same atomic PostgreSQL service.push().
 */
export const PUSH_PART_BYTES=192*1024;
export const PUSH_MAX_PARTS=128;
export const PUSH_TOTAL_MAX_BYTES=24_000_000;
const MAX_ACTOR_STAGING_BYTES=72_000_000;
const VALID_ID=/^[A-Za-z0-9_-]{8,128}$/;
const VALID_ACTOR=/^[A-Za-z0-9_-]{1,180}$/;
const VALID_SHA=/^[a-f0-9]{64}$/;
const reject=(code,status=422)=>new InputError(code,status);
function metadata(input) {
  const commandId=String(input?.commandId||'');
  const sha256=String(input?.sha256||'');
  const totalParts=input?.totalParts;
  if(!VALID_ID.test(commandId)||!VALID_SHA.test(sha256)||
     !Number.isSafeInteger(totalParts)||totalParts<1||totalParts>PUSH_MAX_PARTS)
    throw reject('SYNC_PART_METADATA_INVALID');
  return {commandId,sha256,totalParts};
}
export function decodeSyncPart(input){
  const meta=metadata(input);
  const index=input?.index;
  if(!Number.isSafeInteger(index)||index<0||index>=meta.totalParts)
    throw reject('SYNC_PART_INDEX_INVALID');
  const encoded=input?.dataBase64;
  if(typeof encoded!=='string'||encoded.length<1||
     encoded.length>Math.ceil(PUSH_PART_BYTES/3)*4+4||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw reject('SYNC_PART_ENCODING_INVALID');
  const payload=Buffer.from(encoded,'base64');
  if(payload.length<1||payload.length>PUSH_PART_BYTES||
     payload.toString('base64')!==encoded)
    throw reject('SYNC_PART_BYTES_INVALID',413);
  return {...meta,index,payload};
}
export async function stageSyncPart(pool,workspace,actorId,input){
  if(!VALID_ACTOR.test(String(actorId||'')))throw reject('SYNC_PART_OWNER_REQUIRED',403);
  const {commandId,sha256,totalParts,index,payload}=decodeSyncPart(input);
  // Abandoned uploads expire, while the original IndexedDB queue does NOT.
  if(index===0)await pool.query(
    "DELETE FROM sync_ingest_chunks WHERE workspace=$1 AND created_at<now()-interval '48 hours'",
    [workspace]);
  const params=[workspace,actorId,commandId,index];
  const existing=await pool.query(
    'SELECT sha256,total_parts,part_bytes FROM sync_ingest_chunks WHERE workspace=$1 AND owner_id=$2 AND command_id=$3 AND part_index=$4',params);
  if(existing.rows.length){
    const old=existing.rows[0];
    if(old.sha256!==sha256||Number(old.total_parts)!==totalParts||
       !Buffer.from(old.part_bytes).equals(payload))
      throw reject('SYNC_PART_MISMATCH',409);
    return {ok:true,index,duplicate:true};
  }
  const meta=await pool.query(
    'SELECT COALESCE(SUM(octet_length(part_bytes)),0) AS bytes,COUNT(DISTINCT command_id) AS commands FROM sync_ingest_chunks WHERE workspace=$1 AND owner_id=$2',
    [workspace,actorId]);
  if(Number(meta.rows[0]?.bytes||0)+payload.length>MAX_ACTOR_STAGING_BYTES||
     Number(meta.rows[0]?.commands||0)>40)
    throw reject('SYNC_PART_STAGING_QUOTA_EXCEEDED',429);
  const inserted=await pool.query(
    'INSERT INTO sync_ingest_chunks (workspace,owner_id,command_id,sha256,total_parts,part_index,part_bytes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
    [workspace,actorId,commandId,sha256,totalParts,index,payload]);
  if(!inserted.rowCount){
    // Concurrent uploads are acceptable only if they contain identical bytes.
    const actual=await pool.query(
      'SELECT sha256,total_parts,part_bytes FROM sync_ingest_chunks WHERE workspace=$1 AND owner_id=$2 AND command_id=$3 AND part_index=$4',params);
    const row=actual.rows[0];
    if(!row||row.sha256!==sha256||Number(row.total_parts)!==totalParts||
       !Buffer.from(row.part_bytes).equals(payload))
      throw reject('SYNC_PART_MISMATCH',409);
  }
  return {ok:true,index,duplicate:!inserted.rowCount};
}
export async function commitSyncParts(pool,workspace,actorId,input,authorize,commit){
  if(!VALID_ACTOR.test(String(actorId||'')))throw reject('SYNC_PART_OWNER_REQUIRED',403);
  const {commandId,sha256,totalParts}=metadata(input);
  const rows=await pool.query(
    'SELECT part_index,sha256,total_parts,part_bytes FROM sync_ingest_chunks WHERE workspace=$1 AND owner_id=$2 AND command_id=$3 ORDER BY part_index',
    [workspace,actorId,commandId]);
  if(rows.rows.length!==totalParts)throw reject('SYNC_PARTS_INCOMPLETE',409);
  let size=0;
  const parts=[];
  for(let i=0;i<totalParts;i++){
    const row=rows.rows[i];
    if(Number(row.part_index)!==i||row.sha256!==sha256||
       Number(row.total_parts)!==totalParts)
      throw reject('SYNC_PARTS_INCONSISTENT',409);
    const part=Buffer.from(row.part_bytes);
    if(!part.length||part.length>PUSH_PART_BYTES)throw reject('SYNC_PART_BYTES_INVALID');
    size+=part.length;
    if(size>PUSH_TOTAL_MAX_BYTES)throw reject('SYNC_PARTS_TOO_LARGE',413);
    parts.push(part);
  }
  const bytes=Buffer.concat(parts,size);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)
    throw reject('SYNC_PART_CHECKSUM_MISMATCH',409);
  let command;
  try{command=JSON.parse(bytes.toString('utf8'));}
  catch{throw reject('SYNC_PART_COMMAND_JSON_INVALID',400);}
  if(command?.id!==commandId||command?.workspaceId!==workspace)
    throw reject('SYNC_PART_COMMAND_IDENTITY_MISMATCH',409);
  await authorize(command);
  const receipt=await commit(command);
  if(!receipt||receipt.commandId!==commandId)
    throw new Error('SYNC_PART_COMMIT_RECEIPT_MISMATCH');
  await pool.query(
    'DELETE FROM sync_ingest_chunks WHERE workspace=$1 AND owner_id=$2 AND command_id=$3',
    [workspace,actorId,commandId]).catch(error=>{
      // A committed financial receipt remains valid even if cleanup fails.
      console.warn('Committed sync chunk cleanup postponed',error.message);
    });
  return receipt;
}
