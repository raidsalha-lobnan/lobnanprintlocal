import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Windows native installer cannot be hidden by the clipped third toolbar',()=>{
  const navbar=read('src/components/Navbar.tsx');
  const title=navbar.split('{/* Left (in RTL): Classic Windows Window Controls')[1]
    ?.split('{/* Back Button */}')[0]||'';
  assert.match(title,/<DesktopDownloadButton \/>/);
  assert.match(title,/<PWAInstallButton \/>/);
  assert.match(title,/<DesktopStorageStatus \/>/);
  const thirdToolbar=navbar.split('Tier 3: Classic Desktop ToolStrip')[1]||'';
  assert.doesNotMatch(thirdToolbar,/<DesktopDownloadButton \/>/);
});

test('verified native installer link exists even if GitHub API is unavailable',()=>{
  const button=read('src/components/DesktopDownloadButton.tsx');
  assert.match(button,/VERIFIED_FALLBACK_WINDOWS_INSTALLER/);
  assert.match(button,/releases\/download\/desktop-v1\.1\.7\/LobnanPrint-Setup-1\.1\.7\.exe/);
  assert.match(button,/<a href=\{download\}/);
  assert.doesNotMatch(button,/if\(status==='ready'/);
});

test('browser install button remains operable with no install prompt',()=>{
  const source=read('src/components/PWAInstallButton.tsx');
  assert.match(source,/if\(!prompt\)\{setShowGuide\(true\);return;\}/);
  assert.match(source,/IndexedDB/);
  assert.match(source,/onClick=\{\(\)=>\{void install\(\);\}\}/);
});

test('installed desktop shows the SQLite file provided by native main process',()=>{
  const status=read('src/components/DesktopStorageStatus.tsx');
  assert.match(status,/bridge\.getStorageInfo\(\)/);
  assert.match(status,/info\.databasePath/);
  assert.match(status,/SQLite: متصلة/);
  const main=read('electron/main.cjs');
  assert.match(main,/lobnan:storage-info/);
  assert.match(main,/databasePath:storage\.databaseFile/);
});

test('installer choices are available even before PostgreSQL login',()=>{
  const login=read('src/components/LoginView.tsx');
  assert.match(login,/خيارات تثبيت البرنامج/);
  assert.match(login,/<DesktopDownloadButton \/>/);
  assert.match(login,/<PWAInstallButton \/>/);
  assert.match(login,/<DesktopStorageStatus \/>/);
});
