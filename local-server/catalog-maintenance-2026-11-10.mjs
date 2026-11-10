import pg from 'pg';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {existsSync,statSync} from 'node:fs';
import {makeApprovedCatalogPlan,APPROVED_CATEGORIES,relabelItemReferences} from './catalog-approved-2026-11-10.mjs';
import {planPhantomPrintOrderCleanup} from './print-order-cleanup-plan.mjs';

const WORKSPACE='lobnan_main';
const MIGRATION='catalog-pri-bok-acc-2026-11-10-v1';
const backup=process.env.CATALOG_BACKUP_FILE||'';
const apply=process.argv.includes('--apply');
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL_REQUIRED');
if(apply && (process.env.CATALOG_APPLY_AUTH!=='APPROVED_PRI_BOK_ACC_AND_102_ARCHIVE'
  ||!backup||!existsSync(backup)||statSync(backup).size<100000))
 throw Error('VERIFIED_BACKUP_AND_EXPLICIT_MAINTENANCE_MODE_REQUIRED');

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const sha=obj=>createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pickFinancial=value=>{
  // Audit every financial field by comparing the full record except ONLY the
  // item label/code/category fields on nodes linked to a permanent itemId.
  const strip=node=>{
    if(Array.isArray(node))return node.map(strip);
    if(!node||typeof node!=='object')return node;
    const out={};
    for(const [k,v] of Object.entries(node)){
      if((node.itemId||node.inventoryItemId) && ['itemCode','code','category'].includes(k))continue;
      out[k]=strip(v);
    }
    return out;
  };
  return strip(value);
};
const ddl = `
CREATE TABLE IF NOT EXISTS sync_catalog_admin_migrations (
 workspace text NOT NULL, migration_id text NOT NULL,
 executed_at timestamptz NOT NULL DEFAULT now(),
 backup_file text NOT NULL, summary jsonb NOT NULL,
 PRIMARY KEY(workspace,migration_id)
);
CREATE TABLE IF NOT EXISTS sync_catalog_code_history (
 workspace text NOT NULL, normalized_code text NOT NULL,
 record_id text NOT NULL, code text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace,normalized_code,record_id)
);
CREATE TABLE IF NOT EXISTS sync_archived_print_orders (
 workspace text NOT NULL, record_id text NOT NULL, original_version bigint NOT NULL,
 original_value jsonb NOT NULL, migration_id text NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace,record_id)
);
CREATE OR REPLACE FUNCTION sync_catalog_protect_permanent_identity()
RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE old_code text; new_code text; old_group text; new_group text;
BEGIN
 IF NEW.entity='inventory' AND NEW.value IS NOT NULL THEN
   new_code:=nullif(btrim(NEW.value->>'code'),'');
   new_group:=nullif(btrim(NEW.value->>'category'),'');
   IF new_code IS NULL OR new_group IS NULL THEN
     RAISE EXCEPTION 'CATALOG_CODE_AND_CATEGORY_REQUIRED';
   END IF;
   IF TG_OP='UPDATE' AND OLD.value IS NOT NULL THEN
     old_code:=nullif(btrim(OLD.value->>'code'),'');
     old_group:=nullif(btrim(OLD.value->>'category'),'');
     IF (old_code IS DISTINCT FROM new_code OR old_group IS DISTINCT FROM new_group)
         AND coalesce(current_setting('lobnan.catalog_admin_migration',true),'')<>'approved' THEN
       RAISE EXCEPTION 'PERMANENT_CATALOG_CODE_OR_CATEGORY_CHANGE_BLOCKED';
     END IF;
   END IF;
   IF TG_OP='INSERT' OR old_code IS DISTINCT FROM new_code THEN
     IF EXISTS (SELECT 1 FROM sync_catalog_code_history h
       WHERE h.workspace=NEW.workspace AND h.normalized_code=lower(new_code)
       AND h.record_id<>NEW.record_id)
        OR EXISTS (SELECT 1 FROM sync_records r
       WHERE r.workspace=NEW.workspace AND r.entity='inventory'
       AND r.record_id<>NEW.record_id AND lower(btrim(r.value->>'code'))=lower(new_code)) THEN
       RAISE EXCEPTION 'CATALOG_CODE_ALREADY_RESERVED_FOR_OTHER_ITEM';
     END IF;
   END IF;
   INSERT INTO sync_catalog_code_history(workspace,normalized_code,record_id,code)
     VALUES(NEW.workspace,lower(new_code),NEW.record_id,new_code)
     ON CONFLICT DO NOTHING;
 END IF;
 IF NEW.entity='settings' AND TG_OP='UPDATE'
    AND OLD.value->'categories' IS DISTINCT FROM NEW.value->'categories'
    AND coalesce(current_setting('lobnan.catalog_admin_migration',true),'')<>'approved'
    AND EXISTS (SELECT 1 FROM sync_catalog_admin_migrations
      WHERE workspace=NEW.workspace AND migration_id='catalog-pri-bok-acc-2026-11-10-v1') THEN
    RAISE EXCEPTION 'APPROVED_CATEGORY_DEFINITIONS_IMMUTABLE';
 END IF;
 IF NEW.entity='printOrders' AND NEW.value IS NOT NULL
   AND EXISTS (SELECT 1 FROM sync_archived_print_orders a
     WHERE a.workspace=NEW.workspace AND (
       a.record_id=NEW.record_id
       OR (nullif(NEW.value->>'orderNumber','') IS NOT NULL
         AND a.original_value->>'orderNumber'=NEW.value->>'orderNumber')
     )) THEN
   RAISE EXCEPTION 'ARCHIVED_PRINT_ORDER_CANNOT_BE_RESURRECTED';
 END IF;
 RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS sync_catalog_permanent_identity_guard ON sync_records;
CREATE TRIGGER sync_catalog_permanent_identity_guard
 BEFORE INSERT OR UPDATE OF value ON sync_records
 FOR EACH ROW EXECUTE FUNCTION sync_catalog_protect_permanent_identity();
`;

async function execute() {
 const c=await pool.connect();
 let committed=false;
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await c.query("SET LOCAL lock_timeout='8s'");
  // Serialize with every ordinary SyncService commit in this workspace.
  const lock=await c.query('SELECT next_sequence,next_invoice FROM sync_workspaces WHERE id=$1 FOR UPDATE',[WORKSPACE]);
  if(lock.rowCount!==1)throw Error('WORKSPACE_NOT_FOUND');
  const sequenceStart=Number(lock.rows[0].next_sequence);
  const invoiceNumberStart=Number(lock.rows[0].next_invoice);
  const r=await c.query('SELECT entity,record_id,version,value FROM sync_records WHERE workspace=$1 ORDER BY entity,record_id FOR UPDATE',[WORKSPACE]);
  const rows=r.rows;
  const byEntity=entity=>rows.filter(x=>x.entity===entity);
  const inv=byEntity('inventory');
  const orders=byEntity('printOrders');
  const settings=byEntity('settings');
  const invoices=byEntity('invoices');
  const journals=byEntity('journalEntries');
  const moves=byEntity('stockMovements');
  const accounts=byEntity('accounts');
  const identicalPri0015=inv.filter(r=>r.value?.code==='PRI-0015');
  const approvedIdentityMergePending=identicalPri0015.length===2;
  if(inv.length!==28||inv.some(x=>!x.value))throw Error('CATALOG_28_RECORD_PRECONDITION_FAILED');
  if(orders.length!==102||orders.some(x=>!x.value))throw Error('PRINT_ORDERS_102_RECORD_PRECONDITION_FAILED');
  if(settings.length!==2||settings.some(x=>!x.value))throw Error('SETTINGS_2_RECORD_PRECONDITION_FAILED');
  if(journals.filter(x=>x.value?.referenceType==='print_order').length!==48)
    throw Error('EXPECTED_48_PRINT_ORDER_JOURNALS');
  const journalDebit=journals.filter(x=>x.value?.referenceType==='print_order')
    .flatMap(x=>x.value.lines||[]).reduce((n,l)=>n+Number(l.debit||0),0);
  if(Math.abs(journalDebit-1311)>0.01)throw Error('PRINT_ORDER_JOURNAL_BALANCE_CHANGED');
  const cleanup=planPhantomPrintOrderCleanup({
    orders:orders.map(r=>({...r.value,id:r.record_id})),
    invoices:invoices.map(r=>({...r.value,id:r.record_id})),
    journals:journals.map(r=>({...r.value,id:r.record_id})),
  });
  if(cleanup.authorizedInvoiceCount!==98 || cleanup.linkedOrderCount!==0 ||
    cleanup.eligibleOrderCount!==102 || cleanup.reversalCount!==48 ||
    cleanup.debitMinorReversed!==131100)
    throw Error('PRINT_ORDER_LINKS_OR_REVERSAL_TOTAL_CHANGED');
  // The persisted account balance is not aligned with journal 4102 (1300 vs 1311).
  // Never invent a correction to a cached financial balance.
  const revenueAccount=accounts.find(r=>r.record_id==='4102');
  const savedRevenueBalance=Number(revenueAccount?.value?.balance);
  const accountBalanceRequiresReconciliation=!
    Number.isFinite(savedRevenueBalance) || Math.abs(savedRevenueBalance-journalDebit)>0.005;
  const financialBefore=new Map([...invoices,...journals,...moves].map(x=>[x.entity+'::'+x.record_id,sha(pickFinancial(x.value))]));
  const originalInvoiceTotals=new Map(invoices.map(x=>[x.record_id,{total:x.value?.total,subtotal:x.value?.subtotal,
   paidAmount:x.value?.paidAmount,totalAmount:x.value?.totalAmount,items:(x.value?.items||[]).map(it=>({
    itemId:it.itemId,quantity:it.quantity,total:it.total,unitPrice:it.unitPrice,tax:it.tax,discount:it.discount,
   }))}]));
  const plan=makeApprovedCatalogPlan(inv.map(x=>({id:x.record_id,...x.value})));
  const planMap=new Map(plan.map(x=>[x.id,x]));
  const currentCodes=new Map(inv.map(x=>[x.record_id,x.value.code]));
  for(const [idx,record] of inv.entries()){
    if(record.record_id!==plan[idx]?.id){} // mapping is ID-based, never array-position-based.
  }
  // No unknown monetary/item ownership links: only the designated delivery service may lack an inventory record.
  const knownIds=new Set(inv.map(x=>x.record_id));
  for(const invoice of invoices)for(const line of invoice.value?.items||[]){
   if(!knownIds.has(line.itemId)&&line.itemId!=='srv-delivery'&&line.itemId!=='srv-delivery-mobile')
    throw Error('UNRESOLVED_INVOICE_ITEM_ID_'+invoice.record_id);
  }
  for(const move of moves)if(!knownIds.has(move.value?.itemId))
   throw Error('UNRESOLVED_STOCK_MOVEMENT_ITEM_ID_'+move.record_id);
  await c.query(ddl);
  const previously=await c.query('SELECT 1 FROM sync_catalog_admin_migrations WHERE workspace=$1 AND migration_id=$2',[WORKSPACE,MIGRATION]);
  if(previously.rowCount)throw Error('MIGRATION_ALREADY_APPLIED');

  await c.query("SELECT set_config('lobnan.catalog_admin_migration','approved',true)");
  for(const item of inv){
    await c.query('INSERT INTO sync_catalog_code_history(workspace,normalized_code,record_id,code) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
       [WORKSPACE,String(item.value.code).trim().toLowerCase(),item.record_id,item.value.code]);
  }
  const updated=[];
  for(const item of inv){
    const p=planMap.get(item.record_id);
    const newValue={...item.value,code:p.newCode,category:p.newCategory};
    updated.push({...item,newValue});
  }
  for(const s of settings){
    updated.push({...s,newValue:{...s.value,categories:APPROVED_CATEGORIES}});
  }
  const linkedByEntity={};
  for(const rec of rows){
    if(['inventory','settings','printOrders'].includes(rec.entity)||!rec.value)continue;
    const {value:newValue,changed}=relabelItemReferences(rec.value,planMap);
    if(!changed)continue;
    if(!same(pickFinancial(rec.value),pickFinancial(newValue)))
      throw Error('FINANCIAL_OR_UNRELATED_FIELD_WOULD_CHANGE_'+rec.entity+'_'+rec.record_id);
    updated.push({...rec,newValue});
    linkedByEntity[rec.entity]=(linkedByEntity[rec.entity]||0)+1;
  }
  const eventChanges=[];
  for(const rec of updated){
    const nextVersion=Number(rec.version)+1;
    const changed=await c.query('UPDATE sync_records SET value=$1::jsonb,version=$2,updated_at=now() WHERE workspace=$3 AND entity=$4 AND record_id=$5 AND version=$6',
      [JSON.stringify(rec.newValue),nextVersion,WORKSPACE,rec.entity,rec.record_id,rec.version]);
    if(changed.rowCount!==1)throw Error('OPTIMISTIC_VERSION_FAILED_'+rec.entity+'_'+rec.record_id);
    eventChanges.push({entity:rec.entity,id:rec.record_id,value:rec.newValue,version:nextVersion});
  }
  // Archive only verified unlinked phantom orders. Preserve original 48 journals
  // and add balanced reversal journals so the original history remains auditable.
  for(const order of orders){
    await c.query('INSERT INTO sync_archived_print_orders(workspace,record_id,original_version,original_value,migration_id) VALUES($1,$2,$3,$4::jsonb,$5)',
      [WORKSPACE,order.record_id,order.version,JSON.stringify(order.value),MIGRATION]);
    const result=await c.query('UPDATE sync_records SET value=NULL,version=$1,updated_at=now() WHERE workspace=$2 AND entity=$3 AND record_id=$4 AND version=$5',
      [Number(order.version)+1,WORKSPACE,'printOrders',order.record_id,order.version]);
    if(result.rowCount!==1)throw Error('ORDER_TOMBSTONE_VERSION_FAILED_'+order.record_id);
    eventChanges.push({entity:'printOrders',id:order.record_id,value:null,version:Number(order.version)+1});
  }
  const reversalById=new Map(cleanup.reversalEntries.map(entry=>[entry.id,entry]));
  for(const entry of cleanup.reversalEntries){
    await c.query('INSERT INTO sync_records(workspace,entity,record_id,version,value) VALUES($1,$2,$3,$4,$5::jsonb)',
      [WORKSPACE,'journalEntries',entry.id,1,JSON.stringify(entry)]);
    eventChanges.push({entity:'journalEntries',id:entry.id,value:entry,version:1});
  }
  let seq=sequenceStart;
  const batchSize=35;
  for(let pos=0;pos<eventChanges.length;pos+=batchSize){
    const batch=eventChanges.slice(pos,pos+batchSize);
    const commandId=MIGRATION+'-'+String(Math.floor(pos/batchSize)+1).padStart(3,'0');
    const receipt={commandId,changes:batch};
    ++seq;
    await c.query('INSERT INTO sync_events(workspace,sequence,command_id,changes) VALUES ($1,$2,$3,$4::jsonb)',
      [WORKSPACE,seq,commandId,JSON.stringify(batch)]);
    await c.query('INSERT INTO sync_commands(workspace,command_id,fingerprint,receipt,actor_id) VALUES($1,$2,$3,$4::jsonb,$5)',
      [WORKSPACE,commandId,sha(batch),JSON.stringify(receipt),'catalog-admin-migration']);
  }
  await c.query('UPDATE sync_workspaces SET next_sequence=$2 WHERE id=$1',[WORKSPACE,seq]);
  const summary={
    catalogItems:plan.length,groups:{PRI:25,BOK:2,ACC:1},
    invoiceRecords:invoices.length,stockMovements:moves.length,
    rewrittenByEntity:linkedByEntity,unchangedJournalRecords:journals.length,
    archivedPrintOrders:orders.length,printOrderJournalCount:48,printOrderJournalDebitsILS:journalDebit,
    reversingJournalEntries:cleanup.reversalCount,reversalAmountILS:cleanup.debitMinorReversed/100,
    savedRevenueAccountBalanceILS:savedRevenueBalance,
    requiresRevenueAccountBalanceReconciliation:accountBalanceRequiresReconciliation,
    requiresDuplicatePRI0015IdentityMerge:approvedIdentityMergePending,
    syncEventsEmitted:seq-sequenceStart,fromCursor:sequenceStart,toCursor:seq,
    invoiceNumberBefore:invoiceNumberStart,
    mappings:plan.map(p=>({id:p.id,oldCode:p.oldCode,newCode:p.newCode,oldCategory:p.oldCategory,newCategory:p.newCategory}))
  };
  // Re-query and fail closed unless all invoices and accounting fields are identical.
  const recheck=await c.query('SELECT entity,record_id,version,value FROM sync_records WHERE workspace=$1 AND entity=ANY($2::text[]) ORDER BY entity,record_id',[WORKSPACE,['invoices','journalEntries','stockMovements']]);
  for(const row of recheck.rows){
    const k=row.entity+'::'+row.record_id;
    if(reversalById.has(row.record_id) && row.entity==='journalEntries'){
      if(!isDeepStrictEqual(row.value,reversalById.get(row.record_id)))throw Error('REVERSING_JOURNAL_CHANGED_'+k);
      continue;
    }
    if(financialBefore.get(k)!==sha(pickFinancial(row.value)))throw Error('FINANCIAL_FINGERPRINT_CHANGED_'+k);
    if(row.entity==='invoices'){
      const old=originalInvoiceTotals.get(row.record_id);
      const next={total:row.value?.total,subtotal:row.value?.subtotal,paidAmount:row.value?.paidAmount,
        totalAmount:row.value?.totalAmount,items:(row.value?.items||[]).map(it=>({
          itemId:it.itemId,quantity:it.quantity,total:it.total,unitPrice:it.unitPrice,tax:it.tax,discount:it.discount,
        }))};
      if(!same(old,next))throw Error('INVOICE_NUMERIC_FIELDS_CHANGED_'+row.record_id);
    }
  }
  const active=await c.query("SELECT COUNT(*)::int AS n FROM sync_records WHERE workspace=$1 AND entity='printOrders' AND value IS NOT NULL",[WORKSPACE]);
  if(active.rows[0].n!==0)throw Error('ACTIVE_PRINT_ORDERS_REMAIN');
  const counts=await c.query("SELECT COUNT(*)::int AS n FROM sync_records WHERE workspace=$1 AND entity='inventory' AND value IS NOT NULL",[WORKSPACE]);
  if(counts.rows[0].n!==28)throw Error('INVENTORY_COUNT_CHANGED');
  const invnums=await c.query('SELECT next_invoice,next_sequence FROM sync_workspaces WHERE id=$1',[WORKSPACE]);
  if(Number(invnums.rows[0].next_invoice)!==invoiceNumberStart||Number(invnums.rows[0].next_sequence)!==seq)
    throw Error('INVOICE_COUNTER_OR_SYNC_CURSOR_WRONG');
  await c.query('INSERT INTO sync_catalog_admin_migrations(workspace,migration_id,backup_file,summary) VALUES($1,$2,$3,$4::jsonb)',
    [WORKSPACE,MIGRATION,apply?backup:'DRY_RUN',JSON.stringify(summary)]);

  if(apply){
    // Two PRI-0015 IDs were already approved as one real product. Never assign
    // two permanent catalog serials to that same item as a shortcut.
    if(approvedIdentityMergePending)
      throw Error('DUPLICATE_PRI_0015_REQUIRES_ID_PRESERVING_MERGE');
    // The journal's real net and the persisted account balance disagree.
    // This historical discrepancy must be reconciled separately, not guessed.
    if(accountBalanceRequiresReconciliation)
      throw Error('ACCOUNT_4102_SNAPSHOT_AND_JOURNAL_DISAGREE_RECONCILIATION_REQUIRED');
    await c.query('COMMIT');
    committed=true;
    console.log('CATALOG_MIGRATION_COMMITTED '+JSON.stringify(summary));
  }else{
    await c.query('ROLLBACK');
    console.log('CATALOG_MIGRATION_REHEARSED_AND_ROLLED_BACK '+JSON.stringify(summary));
  }
 }catch(e){
   if(!committed)await c.query('ROLLBACK').catch(()=>{});
   console.error('CATALOG_MIGRATION_BLOCKED '+e.message);
   process.exitCode=1;
 }finally{
   c.release();
   await pool.end();
 }
}
await execute();