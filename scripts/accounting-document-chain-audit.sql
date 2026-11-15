-- Cross-document, READ-ONLY exception inventory for Lobnan accounting.
-- This complements accounting-integrity-audit.sql; it never posts balancing
-- entries or rewrites historic balances. Investigate every exception by source.
-- Run: psql -X -v ON_ERROR_STOP=1 -d lobnan_main -f scripts/accounting-document-chain-audit.sql
\pset pager off
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- Duplicate external numbers are not valid evidence of a single transaction.
SELECT 'DUPLICATE_DOCUMENT_NUMBER' AS finding,entity AS document_type,
       value->>'voucherNumber' AS document_id,COUNT(*)::numeric AS magnitude
FROM sync_records
WHERE workspace='lobnan_main' AND entity='vouchers'
  AND NULLIF(value->>'voucherNumber','') IS NOT NULL
GROUP BY entity,value->>'voucherNumber' HAVING COUNT(*)>1
UNION ALL
SELECT 'DUPLICATE_DOCUMENT_NUMBER',entity,value->>'invoiceNumber',COUNT(*)::numeric
FROM sync_records
WHERE workspace='lobnan_main' AND entity='invoices'
  AND NULLIF(value->>'invoiceNumber','') IS NOT NULL
GROUP BY entity,value->>'invoiceNumber' HAVING COUNT(*)>1;

-- Sales must reference existing parties, including any selected subcustomer.
SELECT 'INVOICE_MISSING_CUSTOMER' AS finding,i.record_id AS document_id,
       i.value->>'customerId' AS referenced_id
FROM sync_records i LEFT JOIN sync_records p
  ON p.workspace=i.workspace AND p.entity='parties'
 AND p.record_id=i.value->>'customerId'
WHERE i.workspace='lobnan_main' AND i.entity='invoices'
  AND p.record_id IS NULL
UNION ALL
SELECT 'INVOICE_MISSING_SUBCUSTOMER',i.record_id,i.value->>'subCustomerId'
FROM sync_records i LEFT JOIN sync_records p
  ON p.workspace=i.workspace AND p.entity='parties'
 AND p.record_id=i.value->>'subCustomerId'
WHERE i.workspace='lobnan_main' AND i.entity='invoices'
  AND NULLIF(i.value->>'subCustomerId','') IS NOT NULL
  AND p.record_id IS NULL;

-- Physical-stock transactions cannot point to a non-existent item or invoice.
SELECT 'MOVEMENT_MISSING_ITEM' AS finding,m.record_id AS document_id,
       m.value->>'itemId' AS referenced_id
FROM sync_records m LEFT JOIN sync_records i
 ON i.workspace=m.workspace AND i.entity='inventory'
 AND i.record_id=m.value->>'itemId'
WHERE m.workspace='lobnan_main' AND m.entity='stockMovements'
 AND i.record_id IS NULL
UNION ALL
SELECT 'SALE_MOVEMENT_MISSING_INVOICE',m.record_id,m.value->>'sourceInvoiceId'
FROM sync_records m LEFT JOIN sync_records i
 ON i.workspace=m.workspace AND i.entity='invoices'
 AND i.record_id=m.value->>'sourceInvoiceId'
WHERE m.workspace='lobnan_main' AND m.entity='stockMovements'
 AND m.value->>'type'='out_sale'
 AND NULLIF(m.value->>'sourceInvoiceId','') IS NOT NULL
 AND i.record_id IS NULL;

-- Duplicate movement references can indicate double posting, but need review
-- when a document legitimately has multiple item/line movements.
SELECT 'DUPLICATED_STOCK_MOVEMENT_ID' AS finding,
       value->>'id' AS movement_id,COUNT(*)::numeric AS occurrences
FROM sync_records
WHERE workspace='lobnan_main' AND entity='stockMovements'
 AND NULLIF(value->>'id','') IS NOT NULL
GROUP BY value->>'id' HAVING COUNT(*)>1;

-- Journals with an explicit voucher reference must resolve to that voucher.
-- Unknown referenceType values are intentionally not guessed at.
SELECT 'JOURNAL_ORPHAN_VOUCHER' AS finding,j.record_id AS journal_id,
       j.value->>'referenceId' AS referenced_id
FROM sync_records j LEFT JOIN sync_records v
 ON v.workspace=j.workspace AND v.entity='vouchers'
 AND v.record_id=j.value->>'referenceId'
WHERE j.workspace='lobnan_main' AND j.entity='journalEntries'
 AND j.value->>'referenceType' IN('receipt','payment')
 AND NULLIF(j.value->>'referenceId','') IS NOT NULL
 AND v.record_id IS NULL;

-- A treasury reference must exist; no assumption that all deposits are cash.
SELECT 'VOUCHER_UNKNOWN_TREASURY' AS finding,v.record_id AS voucher_id,
       v.value->>'treasuryAccountCode' AS treasury_code
FROM sync_records v LEFT JOIN sync_records t
 ON t.workspace=v.workspace AND t.entity='treasuries'
 AND t.value->>'accountCode'=v.value->>'treasuryAccountCode'
WHERE v.workspace='lobnan_main' AND v.entity='vouchers'
 AND NULLIF(v.value->>'treasuryAccountCode','') IS NOT NULL
 AND t.record_id IS NULL;

-- Cash/bank classification is derived from actual treasury type, not from
-- the voucher label alone. Return candidates for human investigation.
SELECT 'VOUCHER_PAYMENT_METHOD_ROUTING' AS finding,v.record_id AS voucher_id,
       COALESCE(v.value->>'paymentMethod','') AS stated_method,
       COALESCE(t.value->>'type','MISSING') AS treasury_type
FROM sync_records v JOIN sync_records t
 ON t.workspace=v.workspace AND t.entity='treasuries'
 AND t.value->>'accountCode'=v.value->>'treasuryAccountCode'
WHERE v.workspace='lobnan_main' AND v.entity='vouchers'
 AND (
  (v.value->>'paymentMethod'='cash' AND t.value->>'type'<>'cash_box')
  OR
  (v.value->>'paymentMethod' IN
     ('bank_transfer','e_wallet','cheque','card','pos','electronic')
   AND t.value->>'type'='cash_box')
 );

COMMIT;
