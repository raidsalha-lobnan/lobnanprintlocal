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

test('Windows uses one custom title bar with real native window controls and safe close',()=>{
 const main=read('electron/main.cjs');
 const preload=read('electron/preload.cjs');
 const controls=read('src/components/DesktopWindowControls.tsx');
 const navbar=read('src/components/Navbar.tsx');
 const login=read('src/components/LoginView.tsx');
 assert.match(main,/frame:process\.platform!=='win32'/);
 assert.match(main,/case 'minimize':window\.minimize\(\)/);
 assert.match(main,/window\.unmaximize\(\);else window\.maximize\(\)/);
 assert.match(main,/window\.close\(\)/);
 assert.match(preload,/controlWindow:\(action\)=>ipcRenderer\.invoke\('lobnan:window-control',action\)/);
 assert.match(controls,/WebkitAppRegion:'drag'/);
 assert.match(controls,/action\('close'\)/);
 assert.match(navbar,/<DesktopWindowControls \/>/);
 assert.match(login,/<DesktopLoginTitleBar \/>/);
});

test('duplicate desktop launches do not open SQLite and startup reports progress',()=>{
 const main=read('electron/main.cjs');
 const updater=read('electron/update-manager.cjs');
 assert.match(main,/if\(!ownsSingleInstance\)app\.quit\(\);/);
 assert.match(main,/if\(ownsSingleInstance\)try\{/);
 assert.match(main,/app\.on\('second-instance',focusStartupOrMain\)/);
 assert.ok(main.indexOf('await showStartupWindow()')<main.indexOf('nativeDb=openPinnedSQLite(storage.root,storage.id)'));
 assert.match(main,/startupMark\('sqlite-integrity-ready'\)/);
 assert.match(main,/startupMark\('main-interface-loaded'\)/);
 const startup=updater.split('async function applyOnNextLaunch()')[1].split('function start()')[0];
 assert.ok(startup.indexOf('previous>=MAX_INSTALL_ATTEMPTS')<startup.indexOf('await checkStaged()'));
});

test('visible application branding changes without moving existing installation or storage',()=>{
 const main=read('electron/main.cjs');
 const pkg=JSON.parse(read('package.json'));
 assert.match(main,/app\.setName\('برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان'\)/);
 assert.match(main,/app\.setPath\('userData',storage\.profileDir\)/);
 assert.equal(pkg.name,'alnoor-accounting-desktop');
 assert.equal(pkg.build.appId,'com.lobnanprint.accounting.desktop');
 assert.equal(pkg.build.productName,'LobnanPrint');
});

test('only explicitly marked local print windows are allowed and report preview uses actual A4 PDF pages',()=>{
 const main=read('electron/main.cjs');
 const preload=read('electron/preload.cjs');
 assert.match(main,/url==='about:blank'&&\/\^lobnan-print-/);
 assert.match(main,/child\.webContents\.setWindowOpenHandler\(\(\)=>\(\{action:'deny'\}\)\)/);
 assert.match(main,/printToPDF\(\{pageSize:'A4',preferCSSPageSize:true,printBackground:true,scale:1\}\)/);
 assert.match(preload,/getReportA4Preview:\(\)=>ipcRenderer\.invoke\('lobnan:report-a4-preview'\)/);
 for(const file of ['customerPeriodReport','otherPartyPeriodReports','printReceiptRegister','printDetailedSalesInvoiceRegister']){
  assert.match(read('src/utils/'+file+'.ts'),/openReportPrintWindow\(\)/);
 }
 assert.match(read('src/components/ReportsView.tsx'),/<ReportA4PreviewButton /);
 assert.match(read('src/index.css'),/@page lobnanReportA4 \{ size: A4 portrait;/);
});
