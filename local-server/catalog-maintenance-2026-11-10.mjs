import pg from 'pg';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {existsSync,statSync} from 'node:fs';
import {makeApprovedCatalogPlan,APPROVED_CATEGORIES,relabelItemReferences,financiallyComparable} from './catalog-approved-2026-11-10.mjs';
import {planPhantomPrintOrderCleanup} from './print-order-cleanup-plan.mjs';

const WORKSPACE='lobnan_main';
const MIGRATION='catalog-pri-bok-acc-2026-11-10-v2-105';
const backup=process.env.CATALOG_BACKUP_FILE||'';
const apply=process.argv.includes('--apply');
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL_REQUIRED');
if(apply && (process.env.CATALOG_APPLY_AUTH!=='APPROVED_PRI_BOK_ACC_AND_102_ARCHIVE'
  ||!backup||!existsSync(backup)||statSync(backup).size<100000))
 throw Error('VERIFIED_BACKUP_AND_EXPLICIT_MAINTENANCE_MODE_REQUIRED');

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const sha=obj=>createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pickFinancial=(value,aliases=new Map())=>financiallyComparable(value,aliases);
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
CREATE TABLE IF NOT EXISTS sync_archived_catalog_item_merges (
 workspace text NOT NULL, from_id text NOT NULL, into_id text NOT NULL,
 original_version bigint NOT NULL, original_value jsonb NOT NULL,
 migration_id text NOT NULL, archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace,from_id)
);
CREATE TABLE IF NOT EXISTS sync_catalog_old_code_aliases (
 workspace text NOT NULL, normalized_code text NOT NULL,
 canonical_item_id text NOT NULL, archived_code text NOT NULL,
 PRIMARY KEY(workspace,normalized_code)
);
CREATE OR REPLACE FUNCTION sync_catalog_protect_permanent_identity()
RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE old_code text; new_code text; old_group text; new_group text;
BEGIN
 IF NEW.entity='inventory' AND NEW.value IS NOT NULL THEN
   IF EXISTS (SELECT 1 FROM sync_archived_catalog_item_merges m
     WHERE m.workspace=NEW.workspace AND m.from_id=NEW.record_id) THEN
     RAISE EXCEPTION 'MERGED_CATALOG_ID_CANNOT_BE_RESURRECTED';
   END IF;
   new_code:=nullif(btrim(NEW.value->>'code'),'');
   new_group:=nullif(btrim(NEW.value->>'category'),'');
   IF new_code IS NULL OR new_group IS NULL THEN
     RAISE EXCEPTION 'CATALOG_CODE_AND_CATEGORY_REQUIRED';
   END IF;
   IF coalesce(current_setting('lobnan.catalog_admin_migration',true),'')<>'approved'
     AND EXISTS (SELECT 1 FROM sync_catalog_admin_migrations
       WHERE workspace=NEW.workspace AND migration_id='catalog-pri-bok-acc-2026-11-10-v2-105') THEN
     IF NOT (
       (new_group='print_raw' AND new_code ~ '^PRI-[0-9]{5}$') OR
       (new_group='stationery' AND new_code ~ '^BOK-[0-9]{5}$') OR
       (new_group='office_supplies' AND new_code ~ '^ACC-[0-9]{5}$')
     ) THEN
       RAISE EXCEPTION 'CATALOG_ONLY_APPROVED_GROUPS_AND_FIVE_DIGIT_SKUS_ALLOWED';
     END IF;
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
      WHERE workspace=NEW.workspace AND migration_id='catalog-pri-bok-acc-2026-11-10-v2-105') THEN
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
  if(inv.length!==29||inv.some(x=>!x.value))throw Error('CATALOG_29_RECORD_PRECONDITION_FAILED');
  if(invoices.length!==105||invoices.some(x=>x.value?.isAccountingPosted!==true))
    throw Error('APPROVED_105_INVOICES_CHANGED');
  if(moves.length!==318)throw Error('EXPECTED_318_STOCK_MOVEMENTS');
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
  if(cleanup.authorizedInvoiceCount!==105 || cleanup.linkedOrderCount!==0 ||
    cleanup.eligibleOrderCount!==102 || cleanup.reversalCount!==48 ||
    cleanup.debitMinorReversed!==131100)
    throw Error('PRINT_ORDER_LINKS_OR_REVERSAL_TOTAL_CHANGED');
  // All 4102 ledger lines belong to the fake orders. Reversing them returns
  // ledger-derived revenue to zero. Reconcile the known stale display balance
  // (1300 versus 1311) against that full journal rather than subtracting 1311
  // blindly from the cached balance.
  const revenueAccount=accounts.find(r=>r.record_id==='4102');
  const savedRevenueBalance=Number(revenueAccount?.value?.balance);
  const revenueLines=journals.flatMap(j=>j.value?.lines||[])
    .filter(line=>line.accountCode==='4102');
  const revenueLedgerNet=revenueLines.reduce((n,line)=>
    n+Number(line.credit||0)-Number(line.debit||0),0);
  if(!revenueAccount || Math.abs(savedRevenueBalance-1300)>0.005 ||
    Math.abs(revenueLedgerNet-1311)>0.005 ||
    Math.abs(revenueLedgerNet-cleanup.debitMinorReversed/100)>0.005)
    throw Error('REVENUE_4102_BASELINE_CANNOT_BE_RECONCILED');
  const revenueAfter=Math.round((revenueLedgerNet-cleanup.debitMinorReversed/100)*100)/100;
  if(revenueAfter!==0)throw Error('REVENUE_4102_POST_REVERSAL_NOT_ZERO');
  const plan=makeApprovedCatalogPlan(inv.map(x=>({id:x.record_id,...x.value})));
  const planMap=new Map(plan.entries.map(x=>[x.id,x]));
  const aliases=plan.aliases;
  const financialBefore=new Map([...invoices,...journals,...moves].map(x=>
    [x.entity+'::'+x.record_id,sha(pickFinancial(x.value,aliases))]));
  const originalInvoiceTotals=new Map(invoices.map(x=>[x.record_id,{
    total:x.value?.total,subtotal:x.value?.subtotal,
    paidAmount:x.value?.paidAmount,totalAmount:x.value?.totalAmount,
    items:(x.value?.items||[]).map(it=>({
      itemId:aliases.get(it.itemId)||it.itemId,
      quantity:it.quantity,total:it.total,unitPrice:it.unitPrice,tax:it.tax,
      discount:it.discount,
    }))
  }]));
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
  // Use the invoice-linked duplicate as canonical: its customerSpecialPrices
  // and tiered selling prices are preserved without recalculation.
  const updated=[];
  for(const item of inv){
    const p=planMap.get(item.record_id);
    if(!p)continue; // retired duplicate is archived below
    const legacyCodes=[...new Set([
      ...(Array.isArray(item.value.legacyCodes)?item.value.legacyCodes:[]),
      item.value.code,
      ...(item.record_id===plan.merge.intoId?[plan.merge.originalFrom.code]:[])
    ].filter(Boolean))];
    updated.push({...item,newValue:{
      ...item.value,code:p.newCode,category:p.newCategory,legacyCodes
    }});
  }
  for(const s of settings){
    updated.push({...s,newValue:{...s.value,categories:APPROVED_CATEGORIES}});
  }
  updated.push({...revenueAccount,newValue:{...revenueAccount.value,balance:revenueAfter}});
  const linkedByEntity={};
  for(const rec of rows){
    if(['inventory','settings','printOrders'].includes(rec.entity)||!rec.value)continue;
    const {value:newValue,changed}=relabelItemReferences(rec.value,planMap,aliases);
    if(!changed)continue;
    if(!same(pickFinancial(rec.value,aliases),pickFinancial(newValue,aliases)))
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
  // Retire the duplicate ID as a synchronized tombstone while preserving its
  // complete original record and all references in a permanent audit table.
  const retired=inv.find(x=>x.record_id===plan.merge.fromId);
  if(!retired)throw Error('DUPLICATE_SOURCE_MISSING');
  await c.query('INSERT INTO sync_archived_catalog_item_merges(workspace,from_id,into_id,original_version,original_value,migration_id) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
    [WORKSPACE,retired.record_id,plan.merge.intoId,retired.version,
      JSON.stringify(retired.value),MIGRATION]);
  const retiredWrite=await c.query('UPDATE sync_records SET value=NULL,version=$1,updated_at=now() WHERE workspace=$2 AND entity=$3 AND record_id=$4 AND version=$5',
    [Number(retired.version)+1,WORKSPACE,'inventory',retired.record_id,retired.version]);
  if(retiredWrite.rowCount!==1)throw Error('DUPLICATE_TOMBSTONE_FAILED');
  eventChanges.push({entity:'inventory',id:retired.record_id,value:null,version:Number(retired.version)+1});
  // Codes that existed historically remain searchable aliases, never reused.
  // Both historical PRI-0015 rows now resolve to the same retained product ID.
  for(const item of inv){
    const canonical=aliases.get(item.record_id)||item.record_id;
    const historicCode=String(item.value.code).trim();
    await c.query('INSERT INTO sync_catalog_old_code_aliases(workspace,normalized_code,canonical_item_id,archived_code) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [WORKSPACE,historicCode.toLowerCase(),canonical,historicCode]);
    const aliasCheck=await c.query('SELECT canonical_item_id FROM sync_catalog_old_code_aliases WHERE workspace=$1 AND normalized_code=$2',
      [WORKSPACE,historicCode.toLowerCase()]);
    if(aliasCheck.rows[0]?.canonical_item_id!==canonical)
      throw Error('OLD_CODE_ALIAS_POINTS_TO_DIFFERENT_ITEM_'+historicCode);
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
    sourceCatalogRows:inv.length,catalogItems:plan.entries.length,groups:plan.groups,
    retainedMergedItem:plan.merge.intoId,retiredMergedItem:plan.merge.fromId,
    invoiceRecords:invoices.length,stockMovements:moves.length,
    rewrittenByEntity:linkedByEntity,unchangedJournalRecords:journals.length,
    archivedPrintOrders:orders.length,printOrderJournalCount:48,printOrderJournalDebitsILS:journalDebit,
    reversingJournalEntries:cleanup.reversalCount,reversalAmountILS:cleanup.debitMinorReversed/100,
    savedRevenueAccountBalanceILS:savedRevenueBalance,
    revenueLedgerBeforeILS:revenueLedgerNet,reconciledRevenueBalanceILS:revenueAfter,
    syncEventsEmitted:seq-sequenceStart,fromCursor:sequenceStart,toCursor:seq,
    invoiceNumberBefore:invoiceNumberStart,
    mappings:plan.entries.map(p=>({id:p.id,oldCode:p.oldCode,newCode:p.newCode,oldCategory:p.oldCategory,newCategory:p.newCategory}))
  };
  // Re-query and fail closed unless all invoices and accounting fields are identical.
  const recheck=await c.query('SELECT entity,record_id,version,value FROM sync_records WHERE workspace=$1 AND entity=ANY($2::text[]) ORDER BY entity,record_id',[WORKSPACE,['invoices','journalEntries','stockMovements']]);
  for(const row of recheck.rows){
    const k=row.entity+'::'+row.record_id;
    if(reversalById.has(row.record_id) && row.entity==='journalEntries'){
      if(!isDeepStrictEqual(row.value,reversalById.get(row.record_id)))throw Error('REVERSING_JOURNAL_CHANGED_'+k);
      continue;
    }
    if(financialBefore.get(k)!==sha(pickFinancial(row.value,aliases)))throw Error('FINANCIAL_FINGERPRINT_CHANGED_'+k);
    if(row.entity==='invoices'){
      const old=originalInvoiceTotals.get(row.record_id);
      const next={total:row.value?.total,subtotal:row.value?.subtotal,paidAmount:row.value?.paidAmount,
        totalAmount:row.value?.totalAmount,items:(row.value?.items||[]).map(it=>({
          itemId:aliases.get(it.itemId)||it.itemId,quantity:it.quantity,total:it.total,unitPrice:it.unitPrice,tax:it.tax,discount:it.discount,
        }))};
      if(!same(old,next))throw Error('INVOICE_NUMERIC_FIELDS_CHANGED_'+row.record_id);
    }
  }
  const active=await c.query("SELECT COUNT(*)::int AS n FROM sync_records WHERE workspace=$1 AND entity='printOrders' AND value IS NOT NULL",[WORKSPACE]);
  if(active.rows[0].n!==0)throw Error('ACTIVE_PRINT_ORDERS_REMAIN');
  const counts=await c.query("SELECT COUNT(*)::int AS n FROM sync_records WHERE workspace=$1 AND entity='inventory' AND value IS NOT NULL",[WORKSPACE]);
  if(counts.rows[0].n!==28)throw Error('INVENTORY_COUNT_CHANGED');
  const groupRows=await c.query("SELECT split_part(value->>'code','-',1) AS prefix,count(*)::int AS n FROM sync_records WHERE workspace=$1 AND entity='inventory' AND value IS NOT NULL GROUP BY 1",[WORKSPACE]);
  const finalGroups=Object.fromEntries(groupRows.rows.map(row=>[row.prefix,row.n]));
  if(Object.keys(finalGroups).length!==3 ||
    Object.entries(plan.groups).some(([prefix,count])=>finalGroups[prefix]!==count))
    throw Error('FINAL_GROUP_COUNTS_CHANGED');
  const confirmedInvoices=await c.query("SELECT count(*)::int AS n FROM sync_records WHERE workspace=$1 AND entity='invoices' AND value IS NOT NULL",[WORKSPACE]);
  if(confirmedInvoices.rows[0].n!==105)throw Error('APPROVED_105_INVOICE_COUNT_CHANGED');
  const mergedArchived=await c.query('SELECT into_id FROM sync_archived_catalog_item_merges WHERE workspace=$1 AND from_id=$2',[WORKSPACE,plan.merge.fromId]);
  if(mergedArchived.rows[0]?.into_id!==plan.merge.intoId)throw Error('MERGED_ID_ARCHIVE_MISSING');
  const revenueCheck=await c.query("SELECT value->>'balance' AS balance FROM sync_records WHERE workspace=$1 AND entity='accounts' AND record_id='4102'",[WORKSPACE]);
  if(Number(revenueCheck.rows[0]?.balance)!==revenueAfter)throw Error('REVENUE_4102_RECONCILIATION_FAILED');
  const invnums=await c.query('SELECT next_invoice,next_sequence FROM sync_workspaces WHERE id=$1',[WORKSPACE]);
  if(Number(invnums.rows[0].next_invoice)!==invoiceNumberStart||Number(invnums.rows[0].next_sequence)!==seq)
    throw Error('INVOICE_COUNTER_OR_SYNC_CURSOR_WRONG');
  await c.query('INSERT INTO sync_catalog_admin_migrations(workspace,migration_id,backup_file,summary) VALUES($1,$2,$3,$4::jsonb)',
    [WORKSPACE,MIGRATION,apply?backup:'DRY_RUN',JSON.stringify(summary)]);

  if(apply){
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