/**
 * Explicit read-only audit of the main PostgreSQL workspace.
 * Does not change invoices, journals, balances, sync events or inventory.
 * Run locally with the secure DATABASE_URL environment:
 *   node local-server/audit-revenue-net-readonly.mjs
 */
import pg from 'pg';
import {runReadOnlyInvoiceNetAudit} from './invoice-net-reconciliation.mjs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL_MISSING: launch with the secure local database environment.');
  process.exitCode = 2;
} else {
  const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
  try {
    const result = await runReadOnlyInvoiceNetAudit(pool,process.env.LOBNAN_WORKSPACE || 'lobnan_main');
    console.log(JSON.stringify(result,null,2));
  } catch(error) {
    console.error('READ_ONLY_AUDIT_FAILED: '+(error instanceof Error ? error.message : 'unknown'));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
