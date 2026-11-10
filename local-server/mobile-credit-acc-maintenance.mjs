/* Single-item approved catalog maintenance. Operator-only; no automatic UI action.
   Preserves item identity, warehouse quantities, invoice monetary values, and
   historic sync evidence. Deliberately releases PRI-00025 for a DIFFERENT item.
*/
import pg from 'pg';
import {createHash} from 'node:crypto';
import {existsSync, statSync} from 'node:fs';
import {planMobileCreditReclassification,mobileCreditComparable,ONE_ITEM_RECLASSIFY as TARGET}
  from './mobile-credit-acc-plan.mjs';


const workspace='lobnan_main';
const apply=process.argv.includes('--apply');
const backup=process.env.CATALOG_BACKUP_FILE||'';
const authorized=process.env.CATALOG_APPLY_AUTH==='MOVE_MOBILE_CREDIT_AND_RELEASE_PRI00025';
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw Error('DATABASE_URL_REQUIRED');
if(apply&&(!authorized||!backup||!existsSync(backup)||statSync(backup).size<100000))
  throw Error('OPERATOR_AUTHORIZATION_AND_FRESH_BACKUP_REQUIRED');
const pool=new pg.Pool({connectionString,max:1});
const hash=obj=>createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const norm=v=>String(v??'').trim().toLowerCase();
const codeFields=new Set(['code','itemCode','sku','itemSku','productCode','inventoryCode','barcode']);
function stillHasReleasedCode(value){
  const walk=(node)=>{
    if(!node||typeof node!=='object')return false;
    if(Array.isArray(node))return node.some(walk);
    for(const [key,v] of Object.entries(node)){
      if(norm(key)===norm(TARGET.fromCode))return true;
      if(typeof v==='string' && codeFields.has(key) && norm(v)===norm(TARGET.fromCode))
        return true;
      if(v && typeof v==='object' && walk(v))return true;
    }
    return false;
  };
  return walk(value);
}
async function run(){
 const c=await pool.connect();
 let committed=false;
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await c.query("SET LOCAL lock_timeout='8s'");
  const ws=await c.query('SELECT next_sequence,next_invoice FROM sync_workspaces WHERE id=$1 FOR UPDATE',[workspace]);
  if(ws.rowCount!==1)throw Error('ACCOUNTING_WORKSPACE_UNAVAILABLE');
  const startSequence=Number(ws.rows[0].next_sequence);
  const startInvoiceNumber=Number(ws.rows[0].next_invoice);
  const original=await c.query(
    'SELECT entity,record_id,version,value FROM sync_records WHERE workspace=$1 ORDER BY entity,record_id FOR UPDATE',
    [workspace]
  );
  const records=original.rows;
  const plan=planMobileCreditReclassification(records);
  const liveInvoices=records.filter(r=>r.entity==='invoices'&&r.value!==null);
  const originalMoves=records.filter(r=>r.entity==='stockMovements'&&r.value!==null);
  if(liveInvoices.length<105)throw Error('INVOICE_COUNT_BELOW_LAST_APPROVED_BASELINE');
  if(!records.some(r=>r.entity==='inventory'&&r.record_id===plan.id&&r.value))
    throw Error('TARGET_CATALOG_RECORD_NOT_ACTIVE');
  const invoiceFingerprint=new Map(liveInvoices.map(r=>[r.record_id,hash(mobileCreditComparable(r.value))]));
  const stockFingerprint=new Map(originalMoves.map(r=>[r.record_id,hash(mobileCreditComparable(r.value))]));
  const baseVersions=new Map(records.map(r=>[r.entity+'::'+r.record_id,r.version]));
  const changed=new Map(plan.modifications.map(r=>[r.entity+'::'+r.record_id,r]));
  // The former SKU must not remain active anywhere as a SKU or barcode.
  // Names/notes containing the historical text are kept for their audit value.
  for(const record of records){
    if(record.value===null)continue;
    const revised=changed.get(record.entity+'::'+record.record_id);
    if(stillHasReleasedCode(revised?.newValue??record.value))
      throw Error('UNRESOLVED_OLD_SKU_OR_BARCODE_REFERENCE_'+record.entity+'_'+record.record_id);
  }
  const ddl=`
CREATE TABLE IF NOT EXISTS sync_catalog_serial_release_audit (
 workspace text NOT NULL,
 migration_id text NOT NULL,
 item_id text NOT NULL,
 from_code text NOT NULL,
 to_code text NOT NULL,
 from_category text NOT NULL,
 to_category text NOT NULL,
 source_snapshot jsonb NOT NULL,
 modified_snapshots jsonb NOT NULL,
 released_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (workspace,migration_id)
);`;
  await c.query(ddl);
  const prior=await c.query(
   'SELECT 1 FROM sync_catalog_serial_release_audit WHERE workspace=$1 AND migration_id=$2',
   [workspace,TARGET.migrationId]
  );
  if(prior.rowCount)throw Error('MIGRATION_ALREADY_COMPLETED');
  const priorMigration=await c.query(
    "SELECT 1 FROM sync_catalog_admin_migrations WHERE workspace=$1 AND migration_id=$2",
    [workspace,'catalog-pri-bok-acc-2026-11-10-v2-105']
  );
  if(!priorMigration.rowCount)throw Error('ORIGINAL_PRI_BOK_ACC_MIGRATION_NOT_APPLIED');
  const reservations=await c.query(
    'SELECT normalized_code,record_id FROM sync_catalog_code_history WHERE workspace=$1 AND normalized_code=ANY($2::text[]) FOR UPDATE',
    [workspace,[norm(TARGET.fromCode),norm(TARGET.toCode)]]
  );
  if(reservations.rows.some(r=>r.normalized_code===norm(TARGET.toCode)&&r.record_id!==TARGET.id))
    throw Error('ACC_00002_PREVIOUSLY_RESERVED_FOR_OTHER_ITEM');
  if(reservations.rows.some(r=>r.normalized_code===norm(TARGET.fromCode)&&r.record_id!==TARGET.id))
    throw Error('PRI_00025_RESERVED_FOR_OTHER_ITEM');
  if(!reservations.rows.some(r=>r.normalized_code===norm(TARGET.fromCode)&&r.record_id===TARGET.id))
    throw Error('EXPECTED_PRI_00025_HISTORY_RESERVATION_NOT_FOUND');
  const aliases=await c.query(
    'SELECT canonical_item_id FROM sync_catalog_old_code_aliases WHERE workspace=$1 AND normalized_code=$2 FOR UPDATE',
    [workspace,norm(TARGET.fromCode)]
  );
  if(aliases.rows.some(r=>r.canonical_item_id!==TARGET.id))
    throw Error('PRI_00025_OWNERSHIP_AMBIGUOUS');
  await c.query("SELECT set_config('lobnan.catalog_admin_migration','approved',true)");
  const releaseAudit={
    workspace,migrationId:TARGET.migrationId,fromCode:TARGET.fromCode,toCode:TARGET.toCode,
    reason:'User-approved transfer of mobile credit to ACC, with PRI-00025 available for a new printing item',
  };
  const currentTarget=records.find(r=>r.entity==='inventory'&&r.record_id===TARGET.id);
  await c.query(
    'INSERT INTO sync_catalog_serial_release_audit(workspace,migration_id,item_id,from_code,to_code,from_category,to_category,source_snapshot,modified_snapshots) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)',
    [workspace,TARGET.migrationId,TARGET.id,TARGET.fromCode,TARGET.toCode,
      TARGET.fromCategory,TARGET.toCategory,JSON.stringify(currentTarget.value),
      JSON.stringify(plan.modifications.map(m=>({
        entity:m.entity,id:m.record_id,version:m.version,oldValue:m.oldValue,
      })))]
  );
  const updates=[];
  for(const mod of plan.modifications){
    const nextVersion=Number(mod.version)+1;
    const result=await c.query(
      'UPDATE sync_records SET value=$1::jsonb,version=$2,updated_at=now() WHERE workspace=$3 AND entity=$4 AND record_id=$5 AND version=$6',
      [JSON.stringify(mod.newValue),nextVersion,workspace,mod.entity,mod.record_id,mod.version]
    );
    if(result.rowCount!==1)throw Error('VERSION_CONFLICT_'+mod.entity+'_'+mod.record_id);
    updates.push({entity:mod.entity,id:mod.record_id,value:mod.newValue,version:nextVersion});
  }
  // The original item retains all old financial and warehouse references by ID.
  // PRI-00025 is a releasable number, NOT an alias on the moved ACC item.
  const released=await c.query(
    'DELETE FROM sync_catalog_code_history WHERE workspace=$1 AND normalized_code=$2 AND record_id=$3',
    [workspace,norm(TARGET.fromCode),TARGET.id]
  );
  if(released.rowCount!==1)throw Error('OLD_PRI_RESERVATION_RELEASE_COUNT_NOT_ONE');
  await c.query('DELETE FROM sync_catalog_old_code_aliases WHERE workspace=$1 AND normalized_code=$2 AND canonical_item_id=$3',
    [workspace,norm(TARGET.fromCode),TARGET.id]);
  const activeReserv=await c.query(
    'SELECT COUNT(*)::int AS n FROM sync_catalog_code_history WHERE workspace=$1 AND normalized_code=$2',
    [workspace,norm(TARGET.fromCode)]
  );
  if(activeReserv.rows[0].n!==0)throw Error('PRI_00025_STILL_RESERVED');
  const chunkSize=35;
  let lastSequence=startSequence;
  for(let pos=0;pos<updates.length;pos+=chunkSize){
    const batch=updates.slice(pos,pos+chunkSize);
    const commandId=TARGET.migrationId+'-'+String(Math.floor(pos/chunkSize)+1).padStart(3,'0');
    lastSequence++;
    await c.query(
      'INSERT INTO sync_events(workspace,sequence,command_id,changes) VALUES($1,$2,$3,$4::jsonb)',
      [workspace,lastSequence,commandId,JSON.stringify(batch)]
    );
    const receipt={commandId,changes:batch};
    await c.query(
      'INSERT INTO sync_commands(workspace,command_id,fingerprint,receipt,actor_id) VALUES($1,$2,$3,$4::jsonb,$5)',
      [workspace,commandId,hash(batch),JSON.stringify(receipt),'catalog-admin-operator']
    );
  }
  await c.query('UPDATE sync_workspaces SET next_sequence=$2 WHERE id=$1',
    [workspace,lastSequence]);
  const post=await c.query(
    "SELECT entity,record_id,version,value FROM sync_records WHERE workspace=$1 AND entity=ANY($2::text[])",
    [workspace,['invoices','stockMovements','inventory']]
  );
  const liveAfterInvoices=post.rows.filter(r=>r.entity==='invoices'&&r.value!==null);
  const liveAfterMoves=post.rows.filter(r=>r.entity==='stockMovements'&&r.value!==null);
  const afterInventory=post.rows.filter(r=>r.entity==='inventory'&&r.value!==null);
  if(liveAfterInvoices.length!==liveInvoices.length || liveAfterMoves.length!==originalMoves.length)
    throw Error('FINANCIAL_OR_WAREHOUSE_DOCUMENT_COUNT_CHANGED');
  for(const row of [...liveAfterInvoices,...liveAfterMoves]){
    const old=(row.entity==='invoices'?invoiceFingerprint:stockFingerprint).get(row.record_id);
    if(!old || old!==hash(mobileCreditComparable(row.value)))
      throw Error('INVOICE_OR_STOCK_FINANCIAL_FINGERPRINT_CHANGED_'+row.entity+'_'+row.record_id);
  }
  const target=afterInventory.find(r=>r.record_id===TARGET.id);
  if(!target||target.value?.code!==TARGET.toCode||
    target.value?.category!==TARGET.toCategory ||
    target.value.legacyCodes?.some(code=>norm(code)===norm(TARGET.fromCode)))
    throw Error('MOVED_ITEM_VALIDATION_FAILED');
  const distribution={PRI:0,BOK:0,ACC:0};
  for(const row of afterInventory){
    const p=String(row.value.code||'').split('-')[0];
    if(!Object.hasOwn(distribution,p))throw Error('UNEXPECTED_CATALOG_PREFIX_'+p);
    distribution[p]++;
  }
  if(JSON.stringify(distribution)!==JSON.stringify(plan.afterCounts))
    throw Error('FINAL_CATEGORY_COUNTS_MISMATCH');
  const afterWorkspace=await c.query('SELECT next_invoice,next_sequence FROM sync_workspaces WHERE id=$1',[workspace]);
  if(Number(afterWorkspace.rows[0].next_invoice)!==startInvoiceNumber ||
    Number(afterWorkspace.rows[0].next_sequence)!==lastSequence)
    throw Error('INVOICE_COUNTER_OR_SYNC_SEQUENCE_CHANGED');
  const summary={
    migrationId:TARGET.migrationId,fromCode:TARGET.fromCode,toCode:TARGET.toCode,
    targetItemId:TARGET.id,originalWarehouseMovementCount:originalMoves.length,
    verifiedInvoiceCount:liveInvoices.length,activeInventory:afterInventory.length,
    inventoryCounts:distribution,linkedRecordsUpdated:plan.linkedRecordsUpdated,
    linkedEntities:plan.referencedEntities,syncEventsEmitted:lastSequence-startSequence,
    nextInvoiceUnchanged:true,releasedCodeAvailable:TARGET.fromCode,
    backup:apply?'verified':'dry-run',
  };
  if(apply){
    await c.query('COMMIT');
    committed=true;
    console.log('MOBILE_CREDIT_ACC_MIGRATION_COMMITTED '+JSON.stringify(summary));
  }else{
    await c.query('ROLLBACK');
    console.log('MOBILE_CREDIT_ACC_MIGRATION_REHEARSED_AND_ROLLED_BACK '+JSON.stringify(summary));
  }
 }catch(error){
  if(!committed)await c.query('ROLLBACK').catch(()=>{});
  console.error('MOBILE_CREDIT_ACC_MIGRATION_BLOCKED '+error.message);
  process.exitCode=1;
 }finally{
  c.release();
  await pool.end();
 }
}
await run();
