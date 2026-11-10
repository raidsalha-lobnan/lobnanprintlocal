import {InputError} from './sync-domain.mjs';
export const APPROVED_CATALOG_MIGRATION_ID='catalog-pri-bok-acc-2026-11-10-v2-105';

/** This SQL safety trigger is a permanent business-rule rejection (409),
 * never a transient HTTP 500 eligible for infinite retries. */
export function classifyApprovedCatalogError(error){
  if(error?.message==='APPROVED_CATEGORY_DEFINITIONS_IMMUTABLE')
    return new InputError('APPROVED_CATEGORY_DEFINITIONS_IMMUTABLE',409);
  return error;
}

/** PostgreSQL enforces three approved category identities after the audited
 * catalog migration. A legacy browser may still carry four obsolete categories
 * inside a full settings snapshot. Do not let that obsolete part block unrelated
 * logo, letterhead, currency and unit edits. Do not relax the database trigger:
 * replace only categories with the authoritative stored definitions.
 *
 * Future category changes must use a separate audited administrative migration.
 */
export function preserveApprovedCatalogSettings(existing,proposed,approved){
  if(!approved)return {value:proposed,guarded:false};
  if(!existing || !Array.isArray(existing.categories))
    throw new InputError('APPROVED_CATEGORY_BASELINE_MISSING',409);
  const current=JSON.stringify(existing.categories);
  const requested=JSON.stringify(proposed?.categories);
  return {
    value:{...proposed,categories:existing.categories},
    guarded:current!==requested
  };
}
