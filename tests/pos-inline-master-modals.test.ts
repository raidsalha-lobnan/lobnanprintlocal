import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const desktop = readFileSync(new URL('../src/components/PosView.tsx', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../src/components/pos/MobilePosView.tsx', import.meta.url), 'utf8');
const partyModal = readFileSync(new URL('../src/components/pos/QuickAddPartyModal.tsx', import.meta.url), 'utf8');

test('cashier create/edit actions use in-place dialogs instead of master screen navigation', () => {
  assert.doesNotMatch(desktop, /\brequestMasterForm\s*\(/);
  assert.match(desktop, /<QuickAddPartyModal\b/);
  assert.match(desktop, /<QuickAddItemModal\b/);
  assert.match(desktop, /setPartyDialog\(\{initialType: posTargetType/);
  assert.match(desktop, /setIsQuickAddOpen\(true\)/);
  assert.match(desktop, /setQuickAddTargetLineId\(line\.id\)/);
});

test('subcustomer creation stays attached to its parent and does not add opening debt', () => {
  assert.match(desktop, /isSubCustomer: true, parentPartyId: selectedCustomerId/);
  assert.match(partyModal, /registeredSubCustomer\(parties, parentPartyId \|\| '', trimmedName\)/);
  assert.match(partyModal, /parentPartyId: isSubCustomer \? parentPartyId : undefined/);
  assert.match(partyModal, /openingBalance: isSubCustomer \? 0 :/);
  assert.match(partyModal, /!parentPartyId \|\| !parties\.some/);
});

test('mobile quick-add uses a dialog without dropping the current basket', () => {
  assert.doesNotMatch(mobile, /\brequestMasterForm\s*\(/);
  assert.match(mobile, /<QuickAddPartyModal\b/);
  assert.match(mobile, /setSelectedCustomerId\(party\.id\)/);
  assert.match(mobile, /setQuickPartyDialog\(\{initialType: partyTypeMode/);
});

test('Excel and OneDrive open the already embedded drafts modal', () => {
  assert.doesNotMatch(desktop, /setActiveTab\('excel_drafts'\)/);
  assert.match(desktop, /onClick=\{\(\) => setIsDraftQueueOpen\(true\)\}/);
  assert.match(desktop, /<DraftInvoicesQueueModal/);
});

test('cashier shortcuts cannot clear or post invoices behind creation dialogs', () => {
  assert.match(desktop, /if \(partyDialog \|\| isQuickAddOpen \|\| isDraftQueueOpen\)/);
  assert.match(desktop, /e\.key\.toLowerCase\(\) === 's'/);
});

test('cashier locks entity classification while creating a master record', () => {
  assert.match(desktop, /initialType=\{partyDialog\?\.initialType \|\| 'customer'\}\s+lockType/);
  assert.match(mobile, /initialType=\{quickPartyDialog\?\.initialType \|\| 'customer'\}\s+lockType/);
  assert.match(partyModal, /!partyToEdit && !isSubCustomer && !lockType/);
});
