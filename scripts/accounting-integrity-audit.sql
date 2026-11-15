-- Lobnan accounting cross-ledger integrity audit.
-- Non-destructive: every statement executes inside READ ONLY transaction.
-- Usage: psql -X -v ON_ERROR_STOP=1 -d lobnan_main -f scripts/accounting-integrity-audit.sql
-- A balanced trial balance does NOT prove subsidiary balances or account routing.
\pset pager off
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT 'AS_OF' AS check_type, NOW()::text AS detail, NULL::numeric AS discrepancy;

-- Record counts show which workflows actually have evidence to audit.
SELECT 'COUNT_' || entity,COUNT(*)::text,NULL::numeric FROM sync_records
 WHERE workspace='lobnan_main' AND entity IN
 ('invoices','purchases','purchaseReturns','salesReturns','vouchers','expenses',
 'payrollSheets','employeeAdvances','employeeDeductions','employeeIncentives',
 'journalEntries','stockMovements','inventory','parties','treasuries','accounts')
 GROUP BY entity ORDER BY entity;

-- No posted journal may be unbalanced, and all account codes must exist in COA.
WITH lines AS (
 SELECT j.record_id AS id,l->>'accountCode' AS account_code,
 COALESCE((l->>'debit')::numeric,0) AS dr,
 COALESCE((l->>'credit')::numeric,0) AS cr
 FROM sync_records j CROSS JOIN LATERAL jsonb_array_elements(j.value->'lines') l
 WHERE j.workspace='lobnan_main' AND j.entity='journalEntries'
)
SELECT 'UNBALANCED_JOURNALS',COUNT(*)::text,SUM(ABS(delta))
 FROM (SELECT id,SUM(dr-cr) AS delta FROM lines GROUP BY id
 HAVING ABS(SUM(dr-cr))>0.005) x;
WITH lines AS (
 SELECT j.record_id,l->>'accountCode' AS account_code
 FROM sync_records j CROSS JOIN LATERAL jsonb_array_elements(j.value->'lines') l
 WHERE j.workspace='lobnan_main' AND j.entity='journalEntries'
)
SELECT 'JOURNAL_UNKNOWN_GL_CODES',COALESCE(string_agg(DISTINCT l.account_code,','),'none'),
 COUNT(*)::numeric FROM lines l LEFT JOIN sync_records a
 ON a.workspace='lobnan_main' AND a.entity='accounts' AND a.value->>'code'=l.account_code
 WHERE a.record_id IS NULL;

-- Account cards: stored amounts must be a projection of general ledger, not an independent truth.
WITH posted AS (
 SELECT l->>'accountCode' AS code,
 SUM(COALESCE((l->>'debit')::numeric,0)-COALESCE((l->>'credit')::numeric,0)) AS delta
 FROM sync_records j CROSS JOIN LATERAL jsonb_array_elements(j.value->'lines') l
 WHERE j.workspace='lobnan_main' AND j.entity='journalEntries' GROUP BY 1
), diffs AS (
 SELECT a.value->>'code' AS code,
 COALESCE((a.value->>'balance')::numeric,0) -
 CASE WHEN a.value->>'type' IN('asset','expense') THEN COALESCE(p.delta,0)
 ELSE -COALESCE(p.delta,0) END AS d
 FROM sync_records a LEFT JOIN posted p ON p.code=a.value->>'code'
 WHERE a.workspace='lobnan_main' AND a.entity='accounts'
)
SELECT 'GENERAL_LEDGER_CARD_DISCREPANCY',COUNT(*) FILTER(WHERE ABS(d)>0.005)::text,
 COALESCE(SUM(ABS(d)),0) FROM diffs;

-- Sale revenue reconciliation includes delivery liability and output VAT.
WITH journal_amount AS (
 SELECT j.value->>'referenceId' AS id,
 SUM(CASE WHEN l->>'accountCode' IN('4101','4102','4103','4201','2103','2104')
 THEN COALESCE((l->>'credit')::numeric,0)-COALESCE((l->>'debit')::numeric,0) ELSE 0 END) AS posted
 FROM sync_records j CROSS JOIN LATERAL jsonb_array_elements(j.value->'lines') l
 WHERE j.workspace='lobnan_main' AND j.entity='journalEntries'
 AND j.value->>'referenceType' IN('pos_invoice','invoice_correction') GROUP BY 1
)
SELECT 'INVOICES_VS_REVENUE',
 COUNT(*) FILTER(WHERE ABS(COALESCE((i.value->>'baseTotalAmount')::numeric,(i.value->>'totalAmount')::numeric)-COALESCE(j.posted,0))>0.005)::text,
 SUM(COALESCE((i.value->>'baseTotalAmount')::numeric,(i.value->>'totalAmount')::numeric)-COALESCE(j.posted,0))
 FROM sync_records i LEFT JOIN journal_amount j ON j.id=i.record_id
 WHERE i.workspace='lobnan_main' AND i.entity='invoices';

-- Voucher journal multiplicity: exactly one voucher reference with balanced journal.
WITH voucher_evidence AS (
 SELECT v.record_id,v.value->>'voucherNumber' voucher_number,
 v.value->>'type' voucher_type,
 (SELECT COUNT(*) FROM sync_records j WHERE j.workspace=v.workspace AND j.entity='journalEntries'
  AND j.value->>'referenceId'=v.record_id AND j.value->>'referenceType'=v.value->>'type') AS journals,
 (SELECT COUNT(*) FROM sync_records t CROSS JOIN LATERAL
  jsonb_array_elements(COALESCE(t.value->'transactions','[]'::jsonb)) x
  WHERE t.workspace=v.workspace AND t.entity='treasuries'
  AND x->>'referenceId'=v.record_id) AS movements
 FROM sync_records v WHERE v.workspace='lobnan_main' AND v.entity='vouchers'
)
SELECT 'VOUCHER_POSTING_MISMATCH',COUNT(*) FILTER(WHERE journals<>1 OR movements<>1)::text,
 COALESCE(SUM(ABS(journals-1)+ABS(movements-1)),0)::numeric FROM voucher_evidence;

-- Critical cross-ledger assertion: AR parent/subcustomer balances vs general ledger.
-- Do not make an automatic balancing entry for this difference.
WITH ar AS (
 SELECT COALESCE(SUM(COALESCE((l->>'debit')::numeric,0)-COALESCE((l->>'credit')::numeric,0)),0) total
 FROM sync_records j CROSS JOIN LATERAL jsonb_array_elements(j.value->'lines') l
 WHERE j.workspace='lobnan_main' AND j.entity='journalEntries' AND l->>'accountCode'='1201'
), parties AS (
 SELECT COALESCE(SUM(COALESCE((value->>'balance')::numeric,0)),0) AS total
 FROM sync_records WHERE workspace='lobnan_main' AND entity='parties'
 AND value->>'type' IN('customer','both')
)
SELECT 'AR_VS_CUSTOMER_SUBLEDGERS',ar.total::text || ' vs ' || parties.total::text,
 ar.total-parties.total FROM ar CROSS JOIN parties;

-- Per-customer explanation, not an automatic update. Openings need independent evidence.
WITH invoice_debt AS(
 SELECT value->>'customerId' id,
 SUM(COALESCE((value->>'baseTotalAmount')::numeric,(value->>'totalAmount')::numeric,0)) value
 FROM sync_records WHERE workspace='lobnan_main' AND entity='invoices' GROUP BY 1
), receipts AS (
 SELECT value->>'partyId' id,SUM(COALESCE((value->>'baseAmount')::numeric,0)) paid
 FROM sync_records WHERE workspace='lobnan_main' AND entity='vouchers'
 AND value->>'type'='receipt' GROUP BY 1
)
SELECT 'CUSTOMER_DETAIL_DIFF_' || p.value->>'code',
 COALESCE(p.value->>'name','') || ' (invoices minus receipts vs card)',
 ROUND(COALESCE(i.value,0)-COALESCE(v.paid,0)-
 COALESCE((p.value->>'balance')::numeric,0),2)
FROM sync_records p LEFT JOIN invoice_debt i ON i.id=p.record_id
 LEFT JOIN receipts v ON v.id=p.record_id
WHERE p.workspace='lobnan_main' AND p.entity='parties'
AND ABS(COALESCE(i.value,0)-COALESCE(v.paid,0)-
 COALESCE((p.value->>'balance')::numeric,0))>0.005
ORDER BY ABS(COALESCE(i.value,0)-COALESCE(v.paid,0)-
 COALESCE((p.value->>'balance')::numeric,0)) DESC;

-- Stock cross-check, negative inventory is allowed; quantity mismatches aren't.
WITH ledger_qty AS (
 SELECT value->>'itemId' item_id,
 SUM(CASE WHEN value->>'type' LIKE 'in_%' THEN COALESCE((value->>'quantity')::numeric,0)
 WHEN value->>'type' LIKE 'out_%' THEN -COALESCE((value->>'quantity')::numeric,0)
 ELSE 0 END) qty
 FROM sync_records WHERE workspace='lobnan_main' AND entity='stockMovements' GROUP BY 1
)
SELECT 'STOCK_QTY_DIFF_' || COALESCE(i.value->>'code',i.record_id),
 COALESCE(i.value->>'name',''),ROUND(COALESCE((i.value->>'stockQuantity')::numeric,0)-COALESCE(q.qty,0),6)
FROM sync_records i LEFT JOIN ledger_qty q ON q.item_id=i.record_id
WHERE i.workspace='lobnan_main' AND i.entity='inventory'
AND ABS(COALESCE((i.value->>'stockQuantity')::numeric,0)-COALESCE(q.qty,0))>0.000001;

SELECT 'OPENING_STOCK_MOVEMENTS',COUNT(*)::text,NULL::numeric FROM sync_records
WHERE workspace='lobnan_main' AND entity='stockMovements' AND value->>'type'='in_opening';

SELECT 'INVENTORY_NEGATIVE_GL',
 COALESCE(value->>'name',''),COALESCE((value->>'balance')::numeric,0)
FROM sync_records WHERE workspace='lobnan_main' AND entity='accounts'
AND value->>'code' IN('1301','1302') AND COALESCE((value->>'balance')::numeric,0)<0;

COMMIT;