-- PREVIEW ONLY: no permanent data changes. Requires a verified PostgreSQL backup.
-- Historical stock source is a documentary reconstruction (not a real stock movement).
-- For production, apply only after isolated-database tests and coordinated server upgrade.
\pset pager off
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='12s';
SET LOCAL statement_timeout='120s';
SELECT next_sequence FROM sync_workspaces WHERE id='lobnan_main' FOR UPDATE;
CREATE TEMP TABLE baseline_invoices ON COMMIT DROP AS
SELECT i.record_id id,i.version,i.value,i.value->>'invoiceNumber' num,
 i.value->>'date' invoice_date
FROM sync_records i
WHERE i.workspace='lobnan_main' AND i.entity='invoices'
 AND EXISTS(
  SELECT 1 FROM sync_records j
  WHERE j.workspace='lobnan_main' AND j.entity='journalEntries'
  AND j.value->>'referenceType'='cogs' AND j.value->>'referenceId'=i.record_id
 )
 AND NOT EXISTS(
  SELECT 1 FROM sync_records m WHERE m.workspace='lobnan_main'
  AND m.entity='stockMovements'
  AND (m.value->>'sourceInvoiceId'=i.record_id
   OR m.value->>'referenceId'=i.record_id
   OR m.value->>'referenceNumber'='TEMP-'||i.record_id)
 );
CREATE TEMP TABLE journal_anchors ON COMMIT DROP AS
SELECT i.id,
 COUNT(*) FILTER(WHERE j.value->>'referenceType'='pos_invoice') sales_n,
 COUNT(*) FILTER(WHERE j.value->>'referenceType'='cogs') cost_n,
 COUNT(*) FILTER(WHERE j.value->>'referenceType'='invoice_correction') correction_n,
 MAX(j.record_id) FILTER(WHERE j.value->>'referenceType'='cogs') cost_journal_id,
 ROUND(SUM(CASE WHEN j.value->>'referenceType'='cogs' THEN
  COALESCE((SELECT SUM(CASE WHEN l->>'accountCode'='5101'
    THEN COALESCE((l->>'debit')::numeric,0)-COALESCE((l->>'credit')::numeric,0)
    ELSE 0 END) FROM jsonb_array_elements(j.value->'lines') l),0)
  ELSE 0 END),2) cost_5101,
 ROUND(SUM(CASE WHEN j.value->>'referenceType'='cogs' THEN
  COALESCE((SELECT SUM(CASE WHEN l->>'accountCode'='1301'
    THEN COALESCE((l->>'credit')::numeric,0)-COALESCE((l->>'debit')::numeric,0)
    ELSE 0 END) FROM jsonb_array_elements(j.value->'lines') l),0)
  ELSE 0 END),2) inventory_1301
FROM baseline_invoices i
LEFT JOIN sync_records j ON j.workspace='lobnan_main' AND j.entity='journalEntries'
 AND j.value->>'referenceId'=i.id
GROUP BY i.id;
CREATE TEMP TABLE source_items ON COMMIT DROP AS
SELECT i.id,it.ordinality pos,it.line->>'itemId' item_id,
 COALESCE(it.line->>'category','') category,
 (it.line->>'quantity')::numeric qty,
 p.record_id inventory_id,
 (p.value->>'purchasePrice')::numeric unit_cost,
 ROUND((it.line->>'quantity')::numeric*(p.value->>'purchasePrice')::numeric,2) line_cost
FROM baseline_invoices i CROSS JOIN LATERAL
 jsonb_array_elements(COALESCE(i.value->'items','[]'::jsonb))
 WITH ORDINALITY AS it(line,ordinality)
LEFT JOIN sync_records p ON p.workspace='lobnan_main' AND p.entity='inventory'
 AND p.record_id=it.line->>'itemId'
WHERE COALESCE(it.line->>'category','') NOT IN('services','copy_scan')
 AND (it.line->>'itemId') NOT IN('srv-delivery','srv-delivery-mobile');
CREATE TEMP TABLE grouped_lines ON COMMIT DROP AS
SELECT id,jsonb_agg(jsonb_build_object(
 'itemId',item_id,'quantity',qty,'unitPrice',unit_cost,'totalCost',line_cost)
 ORDER BY pos) lines,
 ROUND(SUM(line_cost),2) cost_total,COUNT(*) item_count
FROM source_items GROUP BY id;
DO $pre$
DECLARE n int; exception_count int;
BEGIN
 IF (SELECT COUNT(*) FROM baseline_invoices)<>32
 THEN RAISE EXCEPTION 'STOP_APPROVED_INVOICE_SET_CHANGED:%',(SELECT COUNT(*) FROM baseline_invoices);
 END IF;
 IF (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='invoices')<356
 THEN RAISE EXCEPTION 'STOP_INVOICE_POPULATION_SHRANK';END IF;
 IF (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='journalEntries')<723
 THEN RAISE EXCEPTION 'STOP_JOURNAL_POPULATION_SHRANK';END IF;
 IF EXISTS(SELECT 1 FROM baseline_invoices WHERE
    value->'legacyStockBasis' IS NOT NULL OR
    COALESCE(value->>'isAccountingPosted','false')<>'true' OR
    num!~'^INV-[0-9]+$' OR
    NOT (COALESCE(value->>'isOfficial','false')='true' OR
      NULLIF(value->>'postedAt','') IS NOT NULL))
 THEN RAISE EXCEPTION 'STOP_UNVERIFIED_APPROVAL_OR_PREEXISTING_BASIS';END IF;
 IF EXISTS(SELECT num FROM baseline_invoices GROUP BY num HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'STOP_DUPLICATE_INVOICE_NUMBER';END IF;
 IF EXISTS(SELECT 1 FROM journal_anchors WHERE sales_n<>1 OR cost_n<>1 OR
    correction_n<>0 OR cost_5101<0 OR cost_5101<>inventory_1301)
 THEN RAISE EXCEPTION 'STOP_INCOMPLETE_OR_UNBALANCED_JOURNAL_LINK';END IF;
 IF (SELECT COUNT(*) FROM grouped_lines)<>32
 THEN RAISE EXCEPTION 'STOP_INVOICE_WITHOUT_PHYSICAL_LINES';END IF;
 IF EXISTS(SELECT 1 FROM source_items WHERE
    item_id IS NULL OR inventory_id IS NULL OR qty<=0 OR unit_cost<0 OR
    unit_cost IS NULL OR line_cost IS NULL OR
    ABS(qty*unit_cost-line_cost)>0.00001)
 THEN RAISE EXCEPTION 'STOP_INVOICE_LINE_COST_NOT_RECONCILABLE';END IF;
 IF EXISTS(SELECT 1 FROM journal_anchors a JOIN grouped_lines l ON l.id=a.id
   WHERE a.cost_5101<>l.cost_total)
 THEN RAISE EXCEPTION 'STOP_POSTED_COST_DOES_NOT_MATCH_APPROVED_LINES';END IF;
 IF EXISTS(SELECT 1 FROM sync_commands WHERE workspace='lobnan_main'
    AND command_id='legacy-documentary-stock-bases-20261115-v1')
 THEN RAISE EXCEPTION 'STOP_MIGRATION_ALREADY_APPLIED';END IF;
 RAISE NOTICE 'READY 32 approved sales, 32 posted COGS, all item costs match; no new financial postings';
END $pre$;
CREATE TEMP TABLE baseline_updates ON COMMIT DROP AS
SELECT i.id,i.version,
 jsonb_set(i.value,'{legacyStockBasis}',jsonb_build_object(
   'version',1,'kind','approved_invoice_cost_basis',
   'invoiceId',i.id,'invoiceNumber',i.num,'invoiceDate',i.invoice_date,
   'costJournalId',a.cost_journal_id,'totalCost',a.cost_5101,
   'evidenceLevel','document_reconstruction_not_physical_movement',
   'stockMovementBackfilled',false,
   'retainedHistoricMovementIds',jsonb_build_array(),
   'documentedAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'lines',l.lines
 ),true) new_value
FROM baseline_invoices i
JOIN journal_anchors a ON a.id=i.id
JOIN grouped_lines l ON l.id=i.id;
DO $write$
DECLARE c integer;
BEGIN
 UPDATE sync_records r SET value=u.new_value,
 version=u.version+1,updated_at=now()
 FROM baseline_updates u
 WHERE r.workspace='lobnan_main' AND r.entity='invoices'
 AND r.record_id=u.id AND r.version=u.version;
 GET DIAGNOSTICS c=ROW_COUNT;
 IF c<>32 THEN RAISE EXCEPTION 'STOP_VERSION_CONFLICT_UPDATING_BASES:%',c;END IF;
END $write$;
CREATE TEMP TABLE event_payload ON COMMIT DROP AS
SELECT jsonb_agg(jsonb_build_object('entity','invoices',
 'id',id,'value',new_value,'version',version+1) ORDER BY id) changes
FROM baseline_updates;
INSERT INTO sync_events(workspace,sequence,command_id,changes)
SELECT 'lobnan_main',next_sequence+1,
 'legacy-documentary-stock-bases-20261115-v1',
 (SELECT changes FROM event_payload)
FROM sync_workspaces WHERE id='lobnan_main';
INSERT INTO sync_commands(workspace,command_id,fingerprint,receipt,actor_id)
SELECT 'lobnan_main','legacy-documentary-stock-bases-20261115-v1',
 md5(changes::text),
 jsonb_build_object('commandId','legacy-documentary-stock-bases-20261115-v1',
 'changes',changes,'purpose',
 'Immutable historical cost provenance reconstructed from approved invoices and posted journals; no stock movement or ledger effect'),NULL
FROM event_payload;
UPDATE sync_workspaces SET next_sequence=next_sequence+1 WHERE id='lobnan_main';
DO $verify$
DECLARE actual_count integer;
BEGIN
 SELECT count(*) INTO actual_count FROM sync_records
 WHERE workspace='lobnan_main' AND entity='invoices'
 AND value->'legacyStockBasis'->>'kind'='approved_invoice_cost_basis';
 IF actual_count<>32 THEN RAISE EXCEPTION 'STOP_BASIS_POST_COUNT:%',actual_count;END IF;
 IF EXISTS(SELECT 1 FROM baseline_updates u JOIN sync_records r ON r.workspace='lobnan_main'
 AND r.entity='invoices' AND r.record_id=u.id
 WHERE r.value<>u.new_value OR r.version<>u.version+1)
 THEN RAISE EXCEPTION 'STOP_BASIS_VERSION_OR_CONTENT_MISMATCH';END IF;
 IF (SELECT jsonb_array_length(changes) FROM sync_events WHERE workspace='lobnan_main'
 AND command_id='legacy-documentary-stock-bases-20261115-v1')<>32
 THEN RAISE EXCEPTION 'STOP_SYNC_EVENT_MISSING';END IF;
 RAISE NOTICE 'VERIFIED 32 invoice documentary cost bases linked to original cost journals; no journals or stock movements changed';
END $verify$;
SELECT 'PREVIEW_DOCUMENTARY_LINKS',count(*),
 ROUND(sum((new_value->'legacyStockBasis'->>'totalCost')::numeric),2) cost_total,
 SUM(jsonb_array_length(new_value->'legacyStockBasis'->'lines')) item_lines
FROM baseline_updates;
SELECT 'PREVIEW_INVOICE',i.value->>'invoiceNumber',i.version,
 i.value->'legacyStockBasis'->>'costJournalId',
 i.value->'legacyStockBasis'->>'totalCost'
FROM sync_records i WHERE i.workspace='lobnan_main' AND i.entity='invoices'
 AND i.value->'legacyStockBasis'->>'kind'='approved_invoice_cost_basis'
ORDER BY i.value->>'invoiceNumber';
SELECT 'PREVIEW_RECORD_COUNTS',entity,COUNT(*) FROM sync_records
WHERE workspace='lobnan_main' AND entity IN('invoices','journalEntries','stockMovements','inventory','accounts')
GROUP BY entity ORDER BY entity;
ROLLBACK;
