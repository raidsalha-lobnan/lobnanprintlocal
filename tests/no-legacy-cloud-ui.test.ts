import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

test('production write bridge never initializes a Firebase client', () => {
  assert.equal(existsSync(path.join(root, 'src/firebase.ts')), false);
  const bridge = source('src/services/durableLegacyBridge.ts');
  assert.doesNotMatch(bridge, /from\s*['"]firebase\//);
  assert.match(bridge, /DURABLE_REPOSITORY_NOT_INITIALIZED/);
  assert.match(bridge, /BATCH_REQUIRES_ATOMIC_POSTGRES_COMMAND/);
});

test('all manual sync shortcuts use canonical coordinator rather than a full database overwrite', () => {
  const context = source('src/context/AccountingContext.tsx');
  const settings = source('src/components/SettingsView.tsx');
  const navigation = source('src/components/Navbar.tsx');
  assert.match(context, /const forceSyncNow = async/);
  assert.match(context, /coordinator\.syncNow\(30000\)/);
  assert.match(settings, /const res = await forceSyncNow\(\)/);
  assert.doesNotMatch(settings, /syncCurrentDataToFirestore|FirebaseQuotaModal|isQuotaModalOpen/);
  assert.match(navigation, /onClick=\{handleManualSync\}/);
  assert.doesNotMatch(navigation, /FirebaseQuotaModal|action_firebase_quota/);
});

test('POS has no secondary cloud invoice poster and keeps a recoverable local draft', () => {
  const service = source('src/services/onlineInvoicePostingService.ts');
  assert.doesNotMatch(service, /firestore|firebase|\/api\/sync\/delta/i);
  assert.match(service, /stageInvoiceDraft/);
  assert.match(service, /getStagedInvoiceDraft/);
  assert.match(service, /clearStagedInvoiceDraft/);
});

test('Google Drive authentication is independent of Firebase', () => {
  assert.equal(existsSync(path.join(root, 'src/services/firebaseDriveAuth.ts')), false);
  const auth = source('src/services/googleDriveAuth.ts');
  assert.match(auth, /accounts\.google\.com\/gsi\/client/);
  assert.match(auth, /VITE_GOOGLE_OAUTH_CLIENT_ID/);
  assert.doesNotMatch(auth, /firebase/i);
});

test('quota and diagnostics Firebase UI is absent from desktop and mobile', () => {
  for (const file of [
    'src/components/FirebaseQuotaModal.tsx',
    'src/components/FirebaseConnectionDiagnostic.tsx',
    'src/services/firebaseQuotaTracker.ts'
  ]) assert.equal(existsSync(path.join(root, file)), false, file);
  assert.doesNotMatch(source('src/components/MobileNavigationModal.tsx'),
    /action_firebase_quota|onOpenLegacyDiagnostic/);
});
