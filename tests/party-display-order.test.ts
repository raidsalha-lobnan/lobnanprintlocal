import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPartiesByCode } from '../src/utils/partyUtils';

test('CUST-0034 never appears before CUST-0001 just because PostgreSQL returned it first', () => {
  const dbRows = [
    {id: 'pt-0034', code: 'CUST-0034', name: 'كرم مسلم'},
    {id: 'cash', code: 'CUST-0001', name: 'زبون نقدي'},
    {id: 'cust2', code: 'CUST-0002', name: 'عميل ثان'},
    {id: 'cust10', code: 'CUST-0010', name: 'عميل عاشر'}
  ];
  const ordered = sortPartiesByCode(dbRows);
  assert.deepEqual(ordered.map(x => x.code),
    ['CUST-0001', 'CUST-0002', 'CUST-0010', 'CUST-0034']);
  assert.equal(ordered[3].id, 'pt-0034', 'customer identity is unchanged');
  assert.equal(dbRows[0].code, 'CUST-0034', 'persisted source array must not be reordered');
});

test('suppliers also sort by their numeric code, and missing codes come last', () => {
  const ordered = sortPartiesByCode([
    {code: 'SUPP-0012',name:'A'},
    {name:'No code'},
    {code: 'SUPP-0003',name:'B'}
  ]);
  assert.deepEqual(ordered.map(x=>x.code), ['SUPP-0003','SUPP-0012',undefined]);
});
