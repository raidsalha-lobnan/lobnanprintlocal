\pset pager off
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='12s';
SET LOCAL statement_timeout='150s';
SELECT next_sequence FROM sync_workspaces WHERE id='lobnan_main' FOR UPDATE;

CREATE TEMP TABLE retired_stock_candidates ON COMMIT DROP AS
SELECT record_id id,version,value,
 CASE
  WHEN value->>'type'='in_opening' THEN 'obsolete_zero_opening_stock_movement'
  ELSE 'unowned_recycled_public_invoice_number'
 END reason
FROM sync_records
WHERE workspace='lobnan_main' AND entity='stockMovements'
AND value IS NOT NULL AND (
  (value->>'type'='out_sale'
   AND value->>'referenceNumber' ~ '^INV-[0-9]+$'
   AND NULLIF(value->>'sourceInvoiceId','') IS NULL
   AND NULLIF(value->>'referenceId','') IS NULL)
 OR (value->>'type'='in_opening'
   AND NULLIF(value->>'sourceInvoiceId','') IS NULL
   AND NULLIF(value->>'referenceId','') IS NULL)
);

CREATE TEMP TABLE active_stock_before ON COMMIT DROP AS
SELECT record_id,value,version FROM sync_records
WHERE workspace='lobnan_main' AND entity='stockMovements'
AND value IS NOT NULL;

CREATE TEMP TABLE inventory_before ON COMMIT DROP AS
SELECT record_id,version,value
FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory';

CREATE TABLE IF NOT EXISTS sync_archived_legacy_stock_history (
 workspace text NOT NULL,
 record_id text NOT NULL,
 original_version bigint NOT NULL,
 original_value jsonb NOT NULL,
 original_value_md5 text NOT NULL,
 archive_reason text NOT NULL,
 migration_id text NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (workspace,record_id)
);
CREATE INDEX IF NOT EXISTS archived_legacy_stock_history_migration_idx
ON sync_archived_legacy_stock_history(workspace,migration_id);

DO $guard$
DECLARE reference_count int;
BEGIN
 IF (SELECT COUNT(*) FROM retired_stock_candidates)<>251
 OR (SELECT COUNT(*) FROM retired_stock_candidates
      WHERE reason='unowned_recycled_public_invoice_number')<>243
 OR (SELECT COUNT(*) FROM retired_stock_candidates
      WHERE reason='obsolete_zero_opening_stock_movement')<>8
 THEN RAISE EXCEPTION 'STOP_RETIREMENT_CANDIDATES_CHANGED'; END IF;
 IF (SELECT COUNT(*) FROM active_stock_before)<>741
 OR (SELECT COUNT(*) FROM sync_records
   WHERE workspace='lobnan_main' AND entity='invoices')<>356
 OR (SELECT COUNT(*) FROM sync_records
   WHERE workspace='lobnan_main' AND entity='journalEntries')<>756
 OR (SELECT COUNT(*) FROM inventory_before)<>35
 THEN RAISE EXCEPTION 'STOP_FINANCIAL_OR_STOCK_SOURCE_POPULATION_CHANGED';END IF;
 IF (SELECT COUNT(*) FROM sync_records
   WHERE workspace='lobnan_main' AND entity='invoices'
   AND value->>'isAccountingPosted'='true')<>356
 THEN RAISE EXCEPTION 'STOP_APPROVED_INVOICES_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM sync_archived_legacy_stock_history
   WHERE workspace='lobnan_main')
 OR EXISTS(SELECT 1 FROM sync_commands WHERE workspace='lobnan_main'
   AND command_id LIKE 'retire-legacy-stock-history-20261115-%')
 THEN RAISE EXCEPTION 'STOP_ARCHIVE_ALREADY_EXISTS_OR_COMPLETED';END IF;
 IF EXISTS(SELECT 1 FROM retired_stock_candidates
   WHERE version<1 OR value->>'referenceType'='invoice_correction'
   OR value->>'approvedRevision'='true'
   OR COALESCE(NULLIF(value->>'sourceInvoiceId',''),NULLIF(value->>'referenceId','')) IS NOT NULL)
 THEN RAISE EXCEPTION 'STOP_TRUSTED_STOCK_EVIDENCE_INCLUDED';END IF;
 IF EXISTS(SELECT 1 FROM sync_records i WHERE i.workspace='lobnan_main'
  AND i.entity='invoices' AND i.value->>'isAccountingPosted'='true'
  AND NOT EXISTS (
    SELECT 1 FROM active_stock_before s WHERE s.value->>'sourceInvoiceId'=i.record_id
    OR s.value->>'referenceId'=i.record_id
    OR s.value->>'referenceNumber'='TEMP-'||i.record_id
  ) AND NOT (i.value->'legacyStockBasis'->>'kind'='approved_invoice_cost_basis'))
 THEN RAISE EXCEPTION 'STOP_INVOICE_REQUIRES_UNOWNED_DISPLAY_STOCK_SOURCE';END IF;
 IF EXISTS(SELECT 1 FROM sync_records i WHERE i.workspace='lobnan_main'
 AND i.entity='invoices' AND
 i.value->'costPostingEvidence'->>'kind'='verified_zero_cost'
 AND EXISTS(SELECT 1 FROM retired_stock_candidates c
  WHERE (i.value->'costPostingEvidence')::text LIKE '%"'||c.id||'"%'))
 THEN RAISE EXCEPTION 'STOP_ARCHIVE_USED_BY_VERIFIED_ZERO_COST_INVOICE';END IF;
 IF EXISTS(SELECT 1 FROM sync_records r
 JOIN retired_stock_candidates c ON
  r.workspace='lobnan_main' AND r.value IS NOT NULL
  AND NOT(r.entity='stockMovements' AND r.record_id=c.id)
  AND r.value::text LIKE '%"'||c.id||'"%'
 WHERE r.entity<>'invoices' OR
  COALESCE((r.value->'legacyRepair')::text,'') NOT LIKE '%"'||c.id||'"%')
 THEN RAISE EXCEPTION 'STOP_ARCHIVE_TARGET_REFERENCED_BY_UNRELATED_RECORD';END IF;
 SELECT COUNT(*) INTO reference_count FROM sync_records i
 JOIN retired_stock_candidates c ON i.workspace='lobnan_main'
 AND i.entity='invoices' AND
 (i.value->'legacyRepair')::text LIKE '%"'||c.id||'"%';
 IF reference_count<>11
 THEN RAISE EXCEPTION 'STOP_LEGACY_REPAIR_AUDIT_REFERENCES_CHANGED:%',reference_count;END IF;
 IF (SELECT COUNT(*) FROM inventory_before
 WHERE value->'inventorySalesReconciliation'->>'reconciliationId'=
  'approved-sales-only-inventory-reprojection-20261115-v1')<>34
 THEN RAISE EXCEPTION 'STOP_INVENTORY_NOT_APPROVED_SALES_RECONCILED';END IF;
 RAISE NOTICE 'READY 243 unowned stock movements + 8 obsolete openings; 11 legacyRepair references remain resolvable in permanent archive';
END $guard$;

INSERT INTO sync_archived_legacy_stock_history(
 workspace,record_id,original_version,original_value,
 original_value_md5,archive_reason,migration_id)
SELECT 'lobnan_main',id,version,value,md5(value::text),
 reason,'retire-legacy-stock-history-20261115-v1'
FROM retired_stock_candidates;

DO $tombstones$
DECLARE retired_count integer;
BEGIN
 UPDATE sync_records r SET value=NULL,version=r.version+1,updated_at=now()
 FROM retired_stock_candidates t
 WHERE r.workspace='lobnan_main' AND r.entity='stockMovements'
 AND r.record_id=t.id AND r.version=t.version
 AND r.value=t.value;
 GET DIAGNOSTICS retired_count=ROW_COUNT;
 IF retired_count<>251
 THEN RAISE EXCEPTION 'STOP_TOMBSTONE_VERSION_OR_DATA_CONFLICT:%',retired_count;END IF;
END $tombstones$;

CREATE TEMP TABLE batched_tombstones ON COMMIT DROP AS
SELECT row_idx / 35 AS batch_no,
 jsonb_agg(jsonb_build_object(
 'entity','stockMovements','id',id,'version',version+1,'value',NULL::jsonb)
 ORDER BY id) changes
FROM (
 SELECT id,version,
 (ROW_NUMBER() OVER(ORDER BY id)-1)::int row_idx
 FROM retired_stock_candidates
) indexed
GROUP BY row_idx / 35;

INSERT INTO sync_events(workspace,sequence,command_id,changes)
SELECT 'lobnan_main',ws.next_sequence+b.batch_no+1,
 'retire-legacy-stock-history-20261115-'||
 LPAD((b.batch_no+1)::text,3,'0'),b.changes
FROM batched_tombstones b
CROSS JOIN sync_workspaces ws WHERE ws.id='lobnan_main'
ORDER BY b.batch_no;

INSERT INTO sync_commands(workspace,command_id,fingerprint,receipt,actor_id)
SELECT 'lobnan_main',
 'retire-legacy-stock-history-20261115-'||
 LPAD((b.batch_no+1)::text,3,'0'),
 md5(b.changes::text),
 jsonb_build_object(
 'commandId','retire-legacy-stock-history-20261115-'||
 LPAD((b.batch_no+1)::text,3,'0'),
 'changes',b.changes,
 'purpose','Versioned tombstones for old display-only stock movement and obsolete opening; archived originals retained; no journal or true stock changes'),
 'accounting-archive-admin'
FROM batched_tombstones b ORDER BY b.batch_no;

UPDATE sync_workspaces
SET next_sequence=next_sequence+(SELECT COUNT(*) FROM batched_tombstones)
WHERE id='lobnan_main';

DO $verify$
DECLARE event_count int;event_changes int;
BEGIN
 IF (SELECT COUNT(*) FROM sync_archived_legacy_stock_history
  WHERE workspace='lobnan_main' AND
  migration_id='retire-legacy-stock-history-20261115-v1')<>251
 THEN RAISE EXCEPTION 'STOP_ARCHIVE_CONTENT_INCOMPLETE';END IF;
 IF EXISTS(SELECT 1 FROM retired_stock_candidates c
  LEFT JOIN sync_archived_legacy_stock_history a
   ON a.workspace='lobnan_main' AND a.record_id=c.id
  WHERE a.original_version<>c.version
  OR a.original_value<>c.value
  OR a.original_value_md5<>md5(c.value::text)
  OR a.archive_reason<>c.reason)
 THEN RAISE EXCEPTION 'STOP_ARCHIVE_VERIFICATION_MISMATCH';END IF;
 IF (SELECT COUNT(*) FROM sync_records
  WHERE workspace='lobnan_main' AND entity='stockMovements'
  AND value IS NOT NULL)<>490
 OR (SELECT COUNT(*) FROM sync_records
  WHERE workspace='lobnan_main' AND entity='stockMovements'
  AND value IS NULL)<>251
 THEN RAISE EXCEPTION 'STOP_ACTIVE_STOCK_HISTORY_NOT_CLEAN';END IF;
 IF EXISTS(SELECT 1 FROM retired_stock_candidates c
  JOIN sync_records r ON r.workspace='lobnan_main'
  AND r.entity='stockMovements' AND r.record_id=c.id
  WHERE r.value IS NOT NULL OR r.version<>c.version+1)
 THEN RAISE EXCEPTION 'STOP_TOMBSTONE_CONTENT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM sync_records
  WHERE workspace='lobnan_main' AND entity='stockMovements'
  AND value IS NOT NULL AND (
   (value->>'type'='out_sale' AND value->>'referenceNumber'~'^INV-[0-9]+$'
    AND NULLIF(value->>'sourceInvoiceId','') IS NULL
    AND NULLIF(value->>'referenceId','') IS NULL)
   OR value->>'type'='in_opening'))
 THEN RAISE EXCEPTION 'STOP_LEGACY_UNOWNED_MOVEMENTS_STILL_ACTIVE';END IF;
 IF EXISTS(SELECT 1 FROM inventory_before i
  JOIN sync_records r ON r.workspace='lobnan_main'
  AND r.entity='inventory' AND r.record_id=i.record_id
  WHERE r.version<>i.version OR r.value<>i.value)
 THEN RAISE EXCEPTION 'STOP_AUTHORITATIVE_INVENTORY_CHANGED';END IF;
 IF (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main'
  AND entity='invoices')<>356 OR
 (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main'
  AND entity='journalEntries')<>756
 THEN RAISE EXCEPTION 'STOP_INVOICE_OR_JOURNAL_COUNT_CHANGED';END IF;
 SELECT COUNT(*),COALESCE(SUM(jsonb_array_length(changes)),0)
 INTO event_count,event_changes FROM sync_events
 WHERE workspace='lobnan_main'
 AND command_id LIKE 'retire-legacy-stock-history-20261115-%';
 IF event_count<>8 OR event_changes<>251
 THEN RAISE EXCEPTION 'STOP_CROSS_DEVICE_TOMBSTONES_MISSING:%:%',
  event_count,event_changes;END IF;
 RAISE NOTICE 'VERIFIED 251 archived originals + 251 synced tombstones, 490 active verified stock rows, all 356 invoices / 756 journals / 35 inventory cards unchanged';
END $verify$;

SELECT 'ARCHIVE_PREVIEW',
 (SELECT COUNT(*) FROM sync_archived_legacy_stock_history WHERE workspace='lobnan_main') archived,
 (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='stockMovements' AND value IS NOT NULL) active_stock,
 (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='stockMovements' AND value IS NULL) tombstones,
 (SELECT COUNT(*) FROM batched_tombstones) sync_batches,
 (SELECT COALESCE(SUM(jsonb_array_length(changes)),0) FROM batched_tombstones) sync_removed;
SELECT 'ARCHIVE_REASONS',archive_reason,COUNT(*) FROM sync_archived_legacy_stock_history
 WHERE workspace='lobnan_main' GROUP BY archive_reason ORDER BY archive_reason;
ROLLBACK;