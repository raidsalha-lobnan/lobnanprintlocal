import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLegacySnapshot,stripPrivateFields,fileChecksum}
  from '../legacy-snapshot.mjs';
const fixture=()=>({
  exportedAt:'2026-11-07T00:00:00Z',
  users:[{
    id:'u1',username:'owner',password:'PRIVATE_OWNER_PASSWORD',roleId:'role-admin',
    companyId:'c1',allowedBranchIds:['*'],status:'active',fullName:'Owner'
  }],
  roles:[{id:'role-admin',code:'SYS_ADMIN',permissions:{view:true,add:true}}],
  companies:[{id:'c1',name:'Company',password:'COMPANY_PRIVATE'}],
  invoices:[{id:'inv1',invoiceNumber:'INV-0066',totalAmount:33,branchId:'br1'}],
  journalEntries:[{id:'j1',lines:[{debit:33,credit:33}]}],
  settings:{activeBranchId:'br1',refreshToken:'SENSITIVE'},
  dailyEntrySheets:{'2026-11-07':{date:'2026-11-07',rows:[]}}
});
test('preserves source identities and official invoice sequence',()=>{
  const got=prepareLegacySnapshot(fixture());
  assert.equal(got.records.length,7);
  assert.equal(got.counts.roles,1);
  assert.equal(got.counts.users,1);
  assert.equal(got.maxInvoice,66);
  assert.deepEqual(got.invoiceNumbers,['INV-0066']);
  assert.equal(got.records.find(x=>x.entity==='users').value.password,undefined);
  assert.equal(got.records.find(x=>x.entity==='companies').value.password,undefined);
  assert.equal(got.records.find(x=>x.entity==='settings').value.refreshToken,undefined);
  assert.equal(got.records.find(x=>x.entity==='dailyEntrySheets').id,'2026-11-07');
});
test('rejects missing user credentials, role, duplicate ids and duplicate invoices',()=>{
  const one=fixture();delete one.users[0].password;
  assert.throws(()=>prepareLegacySnapshot(one),/INCOMPLETE_LEGACY_USER/);
  const two=fixture();two.users[0].roleId='unknown';
  assert.throws(()=>prepareLegacySnapshot(two),/INCOMPLETE_LEGACY_USER/);
  const three=fixture();three.invoices.push({...three.invoices[0]});
  assert.throws(()=>prepareLegacySnapshot(three),/DUPLICATE_RECORD_ID/);
  const four=fixture();four.invoices.push({id:'inv2',invoiceNumber:'INV-0066'});
  assert.throws(()=>prepareLegacySnapshot(four),/DUPLICATE_INVOICE_NUMBER/);
});
test('strip private fields recursively, preserve accounting amounts and checksum',()=>{
  assert.deepEqual(stripPrivateFields({id:'i',items:[{value:100,accessToken:'TOKEN'}]}),
    {id:'i',items:[{value:100}]});
  assert.equal(fileChecksum(Buffer.from('abc')).length,64);
});

test('same user may have username equal to their own email; cross-account aliases stay rejected',()=>{
  const self=fixture();
  self.users[0].email='owner';
  assert.equal(prepareLegacySnapshot(self).users.length,1);
  const cross=fixture();
  cross.users.push({id:'u2',username:'other',email:'owner',password:'SECOND_PRIVATE_PASSWORD',
    roleId:'role-admin',companyId:'c1',allowedBranchIds:['*'],status:'active'});
  assert.throws(()=>prepareLegacySnapshot(cross),/AMBIGUOUS_USERNAME_EMAIL/);
});
