import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('login entrypoint never imports legacy Firebase or Google credentials', () => {
  const login = source('src/components/LoginView.tsx');
  assert.doesNotMatch(login, /from\s+['"][^'"]*firebase['"]/i);
  assert.doesNotMatch(login, /signInWithPopup|GoogleAuthProvider|handleGoogleSignIn/);
  assert.match(login, /fetchUsersFromLocalServer/);
  assert.match(login, /finally\s*\{\s*setLoading\(false\)/);
  assert.match(login, /إعادة إعداد الاتصال بالخادم/);
});

test('app requires PostgreSQL pairing and never authorizes from localStorage ID', () => {
  const app = source('src/App.tsx');
  assert.match(app, /!localStorage\.getItem\('lobnan_local_sync_server_url'\)/);
  // Restoring an unexpired, server-issued session is safe. An arbitrary
  // localStorage user ID must never be accepted as authentication.
  assert.match(app, /secureLoginEnabled\(\)\s*\?\s*getCurrentSessionProfile\(\)\?\.id/);
  assert.doesNotMatch(app, /localStorage\.getItem\(['"]alnoor_press_accounting_v1_current_user/);
  assert.doesNotMatch(app, /<GoogleDriveAutoBackupWorker\s*\/>/);
});

test('frontend build is locked to PostgreSQL mode rather than a missing env fallback', () => {
  const config = source('vite.config.ts');
  assert.match(config, /const localMode = true/);
  assert.match(config, /'import\.meta\.env\.VITE_SYNC_BACKEND': JSON\.stringify\('local-postgres'\)/);
});
