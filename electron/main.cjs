'use strict';
const {app,BrowserWindow,Menu,shell,ipcMain,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {selectPinnedStorage,openPinnedSQLite}=require('./storage.cjs');
const {createDesktopUpdateService}=require('./update-manager.cjs');

const API_ORIGIN='https://lobnan-api.shares.zrok.io';
const MAX_API_BYTES=48*1024*1024;
let mainWindow=null,storage=null,nativeDb=null,startupError=null,desktopUpdater=null;
let startupWindow=null, startupFinished=false;
const startupBegin=Date.now();
function startupMark(stage){
 const entry=new Date().toISOString()+' '+stage+' '+(Date.now()-startupBegin)+'ms\n';
 console.info('DESKTOP_STARTUP',entry.trim());
 try{
  if(storage?.profileDir)fs.appendFileSync(path.join(storage.profileDir,'startup-timing.log'),entry);
 }catch{}
}
function focusStartupOrMain(){
 const window=mainWindow&&!mainWindow.isDestroyed()?mainWindow:startupWindow;
 if(window&&!window.isDestroyed()){
  if(window.isMinimized())window.restore();
  window.show();window.focus();
 }
}

// Never run two desktop sessions on the same pinned SQLite profile. In
// particular, an update cannot begin while a second POS window stays open.
const ownsSingleInstance=app.requestSingleInstanceLock();
app.on('second-instance',focusStartupOrMain);
// A duplicate click never opens or checks the shared database.
if(!ownsSingleInstance)app.quit();
if(ownsSingleInstance)try{
 storage=selectPinnedStorage();
 fs.mkdirSync(storage.profileDir,{recursive:true});
 // Chromium's IndexedDB, drafts, cache and service-worker state all reside
 // alongside the pinned SQLite database, never in the default C: profile.
 app.setPath('userData',storage.profileDir);
 const sessionDir=path.join(storage.root,'ChromiumSession');
 fs.mkdirSync(sessionDir,{recursive:true});
 app.setPath('sessionData',sessionDir);
 // Only the user-visible name changes. Keep package identity, installation
 // directory, AppUserModelID and pinned data/profile paths compatible.
 app.setName('برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان');
 if(process.platform==='win32')app.setAppUserModelId('com.lobnanprint.accounting.desktop');
 startupMark('storage-binding-ready');
}catch(error){
 startupError=error;
 console.error('DESKTOP_STORAGE_STARTUP_BLOCKED',String(error));
}

function trusted(event){
 const sender=event.senderFrame;
 if(!mainWindow||event.sender!==mainWindow.webContents||
  !sender||!sender.url.startsWith('file://'))
  throw Error('DESKTOP_UNTRUSTED_RENDERER');
}
function registerIpc(){
 let generatingReportPdf=false;
 ipcMain.handle('lobnan:report-a4-preview',async event=>{
  trusted(event);
  if(generatingReportPdf)throw Error('REPORT_PREVIEW_BUSY');
  generatingReportPdf=true;
  try{
   const data=await mainWindow.webContents.printToPDF({pageSize:'A4',preferCSSPageSize:true,printBackground:true,scale:1});
   if(!data.length||data.length>60_000_000)throw Error('REPORT_PREVIEW_SIZE_INVALID');
   return new Uint8Array(data);
  }finally{generatingReportPdf=false;}
 });
 ipcMain.handle('lobnan:window-state',event=>{
  trusted(event);
  return {maximized:mainWindow.isMaximized()};
 });
 let closePromptOpen=false;
 ipcMain.handle('lobnan:window-control',async(event,action)=>{
  trusted(event);
  const window=mainWindow;
  if(process.platform!=='win32')return false;
  switch(action){
   case 'minimize':window.minimize();return true;
   case 'toggle-maximize':
    if(window.isFullScreen())window.setFullScreen(false);
    if(window.isMaximized())window.unmaximize();else window.maximize();
    return true;
   case 'close':
    if(closePromptOpen)return false;
    closePromptOpen=true;
    try{
     const answer=await dialog.showMessageBox(window,{
      type:'question',title:'إغلاق البرنامج',message:'هل تريد إغلاق برنامج الأيهم المحاسبي؟',
      detail:'احفظ أي فاتورة أو سند مفتوح قبل الإغلاق. العمليات المحفوظة محليًا تبقى على الجهاز.',
      buttons:['إلغاء','إغلاق البرنامج'],defaultId:0,cancelId:0,noLink:true
     });
     if(answer.response!==1||window.isDestroyed())return false;
     // Respect existing renderer beforeunload guards; never destroy or force-kill.
     setImmediate(()=>{if(!window.isDestroyed())window.close();});
     return true;
    }finally{closePromptOpen=false;}
   default:throw Error('INVALID_WINDOW_ACTION');
  }
 });

 ipcMain.handle('lobnan:display-menu',event=>{
  trusted(event);
  Menu.buildFromTemplate(displayMenuItems()).popup({window:mainWindow});
  return true;
 });
 // Opt-in credentials are protected by the Windows user account via DPAPI.
 const credentialFile=path.join(storage.profileDir,'remembered-login.bin');
 const safeStorage=require('electron').safeStorage;
 ipcMain.handle('lobnan:remember-login', (event,credentials)=>{
  trusted(event);
  if(process.platform!=='win32'||!safeStorage.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
  if(!credentials||typeof credentials.identifier!=='string'||typeof credentials.password!=='string'||
   !credentials.identifier.trim()||!credentials.password||credentials.identifier.length>512||credentials.password.length>4096)
   throw Error('INVALID_REMEMBERED_LOGIN');
  const encrypted=safeStorage.encryptString(JSON.stringify({identifier:credentials.identifier,password:credentials.password}));
  fs.writeFileSync(credentialFile+'.tmp',encrypted);
  fs.renameSync(credentialFile+'.tmp',credentialFile);
  return true;
 });
 ipcMain.handle('lobnan:read-remembered-login',event=>{
  trusted(event);
  if(!fs.existsSync(credentialFile))return null;
  if(process.platform!=='win32'||!safeStorage.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
  const value=JSON.parse(safeStorage.decryptString(fs.readFileSync(credentialFile)));
  if(typeof value.identifier!=='string'||typeof value.password!=='string')throw Error('INVALID_REMEMBERED_LOGIN');
  return value;
 });
 ipcMain.handle('lobnan:forget-login',event=>{
  trusted(event);
  fs.rmSync(credentialFile,{force:true});
  fs.rmSync(credentialFile+'.tmp',{force:true});
  return true;
 });

 ipcMain.handle('lobnan:desktop-update-status',event=>{
  trusted(event);
  return desktopUpdater?.getStatus()||{phase:'disabled'};
 });
 ipcMain.handle('lobnan:desktop-update-check',event=>{
  trusted(event);
  return desktopUpdater?.checkNow()||{phase:'disabled'};
 });
 let restartRequested=false;
 ipcMain.handle('lobnan:desktop-update-restart',async event=>{
  trusted(event);
  const phase=desktopUpdater?.getStatus().phase;
  if(restartRequested||!['ready','install-error'].includes(phase))return false;
  const window=mainWindow;
  const recovery=phase==='install-error';
  restartRequested=true;
  try{
   const answer=await dialog.showMessageBox(window,{
    type:'question',title:recovery?'استرداد التحديث':'تحديث وإعادة تشغيل',
    message:recovery?'فشل التثبيت الصامت. هل تريد فتح المثبّت الرسمي بعد إغلاق البرنامج؟':'هل تريد إعادة تشغيل البرنامج لتثبيت التحديث؟',
    detail:'احفظ الفاتورة أو السند الجاري وأغلق أي عمليات غير محفوظة قبل المتابعة. لن يتم حذف قاعدة البيانات أو العمليات المحفوظة محليًا.',
    buttons:['إلغاء',recovery?'حفظت عملي — استرداد التحديث':'حفظت عملي — تحديث وإعادة تشغيل'],defaultId:0,cancelId:0,noLink:true
   });
   if(answer.response!==1||!window||window.isDestroyed()||desktopUpdater?.getStatus().phase!==phase){
    restartRequested=false;return false;
   }
   if(recovery&&!(await desktopUpdater.prepareInteractiveRetry())){
    restartRequested=false;return false;
   }
   const relaunch=()=>app.relaunch();
   const canceled=()=>{
    restartRequested=false;
    window.removeListener('closed',relaunch);
   };
   window.once('closed',relaunch);
   window.webContents.once('will-prevent-unload',canceled);
   setImmediate(()=>{if(!window.isDestroyed())window.close();});
   return true;
  }catch(error){restartRequested=false;throw error;}
 });
 ipcMain.handle('lobnan:storage-info',event=>{
  trusted(event);
  return {installed:true,pinned:true,persistent:true,root:storage.root,
   databasePath:storage.databaseFile};
 });
 ipcMain.handle('lobnan:read-stores',(event,name)=>{
  trusted(event);return nativeDb.readStores(name);
 });
 ipcMain.handle('lobnan:write-stores',(event,name,rows)=>{
  trusted(event);return nativeDb.writeStores(name,rows);
 });
 ipcMain.handle('lobnan:read-pos-attempt',(event,key)=>{
  trusted(event);return nativeDb.readPosAttempt(key);
 });
 ipcMain.handle('lobnan:save-pos-attempt',(event,key,value)=>{
  trusted(event);return nativeDb.writePosAttempt(key,value);
 });
 ipcMain.handle('lobnan:delete-pos-attempt',(event,key)=>{
  trusted(event);return nativeDb.deletePosAttempt(key);
 });
 // The private API's strict CORS allowlist rejects file:// origins.
 // This narrow main-process gateway does not change the server's CORS policy.
 ipcMain.handle('lobnan:sync-api-fetch',async(event,request)=>{
  trusted(event);
  if(!request||typeof request.url!=='string')throw Error('DESKTOP_API_INVALID');
  const url=new URL(request.url);
  if(url.origin!==API_ORIGIN||!url.pathname.startsWith('/api/v1/'))
   throw Error('DESKTOP_API_ORIGIN_DENIED');
  const method=String(request.method||'GET').toUpperCase();
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))
   throw Error('DESKTOP_API_METHOD_DENIED');
  const headers=new Headers();
  const allowedHeaders=new Set(['authorization','content-type','accept',
   'skip_zrok_interstitial','x-requested-with']);
  for(const [key,value] of Object.entries(request.headers||{}))
   if(allowedHeaders.has(key.toLowerCase())&&typeof value==='string'&&value.length<16000)
    headers.set(key,value);
  if(request.body!=null&&!(request.body instanceof Uint8Array))
   throw Error('DESKTOP_API_INVALID_BODY');
  if(request.body?.byteLength>MAX_API_BYTES)throw Error('DESKTOP_API_BODY_TOO_LARGE');
  const response=await fetch(url,{
   method,headers,body:['GET','HEAD'].includes(method)?undefined:request.body,
   redirect:'error',signal:AbortSignal.timeout(60000)
  });
  const body=new Uint8Array(await response.arrayBuffer());
  if(body.byteLength>MAX_API_BYTES)throw Error('DESKTOP_API_RESPONSE_TOO_LARGE');
  const responseHeaders={};
  for(const [key,value] of response.headers)
   if(['content-type','content-disposition','etag','cache-control'].includes(key.toLowerCase()))
    responseHeaders[key]=value;
  return {status:response.status,statusText:response.statusText,
   headers:responseHeaders,body};
 });
}
// Display preferences are device-local and never touch accounting data.
const DISPLAY_ZOOM_PERCENTAGES=[75,80,85,90,95,100,105,110,115,120,125,130,135,140,145,150];
function readDisplaySettings(){
 try{
  const v=JSON.parse(fs.readFileSync(path.join(storage.profileDir,'display-settings.json'),'utf8'));
  return {width:Math.max(800,Math.min(7680,Number(v.width)||1366)),
   height:Math.max(480,Math.min(4320,Number(v.height)||768)),
   zoom:DISPLAY_ZOOM_PERCENTAGES.some(percent=>Math.abs(percent/100-Number(v.zoom))<0.0001)?Number(v.zoom):1,
   maximized:v.maximized===true};
 }catch{return {width:1366,height:768,zoom:1,maximized:false};}
}
function saveDisplaySettings(){
 if(!mainWindow||mainWindow.isDestroyed())return;
 const [width,height]=mainWindow.getNormalBounds ? [mainWindow.getNormalBounds().width,mainWindow.getNormalBounds().height] : mainWindow.getSize();
 try{
  const file=path.join(storage.profileDir,'display-settings.json');
  fs.writeFileSync(file+'.tmp',JSON.stringify({width,height,zoom:mainWindow.webContents.getZoomFactor(),maximized:mainWindow.isMaximized()}));
  fs.renameSync(file+'.tmp',file);
 }catch(error){console.warn('DISPLAY_SETTINGS_SAVE_FAILED',String(error));}
}
function displayMenuItems(){
 const current=Math.round(mainWindow.webContents.getZoomFactor()*100);
 return [
  {label:'مقياس عرض عناصر البرنامج: '+current+'%',enabled:false},
  {type:'separator'},
  ...DISPLAY_ZOOM_PERCENTAGES.map(percent=>({
   label:percent+'%'+(percent===100?' — الحجم الطبيعي':''),
   type:'radio',checked:current===percent,click:()=>{
    if(!mainWindow||mainWindow.isDestroyed())return;
    mainWindow.webContents.setZoomFactor(percent/100);
    saveDisplaySettings();
   }
  })),
  {type:'separator'},
  {label:'استعادة العرض الافتراضي (100%)',click:()=>{
   if(!mainWindow||mainWindow.isDestroyed())return;
   mainWindow.webContents.setZoomFactor(1);
   saveDisplaySettings();
  }}
 ];
}
function installDisplayMenu(){
 Menu.setApplicationMenu(null);
}
function showStartupWindow(){
 if(process.platform!=='win32')return Promise.resolve();
 startupWindow=new BrowserWindow({
  width:420,height:176,center:true,frame:false,resizable:false,
  show:false,backgroundColor:'#f0f5ff',
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}
 });
 const w=startupWindow;
 const html='<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body style="background:#f0f5ff;color:#123985;font:16px Tahoma,Arial;display:grid;place-content:center;text-align:center;height:100vh;margin:0"><strong style="font-size:21px">برنامج الأيهم المحاسبي</strong><p>جارٍ تجهيز البرنامج والتحقق من البيانات...</p><small>مطبعة ومكتبة لبنان</small></body></html>';
 w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 w.webContents.on('will-navigate',event=>event.preventDefault());
 return new Promise(resolve=>{
  let done=false;
  const finish=()=>{
   if(done)return;done=true;
   if(!w.isDestroyed())w.show();
   setTimeout(resolve,60);
  };
  w.once('ready-to-show',finish);
  void w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html)).catch(finish);
  setTimeout(finish,1000);
 });
}
function dismissStartupWindow(){
 const w=startupWindow;startupWindow=null;
 if(w&&!w.isDestroyed())w.close();
}
function createWindow(){
 const display=readDisplaySettings();
 const workArea=require('electron').screen.getPrimaryDisplay().workArea;
 mainWindow=new BrowserWindow({
  width:Math.min(display.width,workArea.width),height:Math.min(display.height,workArea.height),minWidth:Math.min(800,workArea.width),minHeight:Math.min(480,workArea.height),
  frame:process.platform!=='win32',
  title:'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان',
  webPreferences:{
   preload:path.join(__dirname,'preload.cjs'),
   nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true
  }
 });
 installDisplayMenu();
 const publishWindowState=()=>{
  if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('lobnan:window-state',{maximized:mainWindow.isMaximized()});
 };
 mainWindow.on('maximize',publishWindowState);
 mainWindow.on('unmaximize',publishWindowState);
 mainWindow.webContents.on('did-finish-load',()=>mainWindow?.webContents.setZoomFactor(display.zoom));
 if(display.maximized)mainWindow.maximize();
 mainWindow.on('close',saveDisplaySettings);
 const file=path.join(__dirname,'../dist/index.html');
 void mainWindow.loadFile(file).catch(error=>{
  console.error('DESKTOP_PAGE_LOAD_FAILED',String(error));
  dialog.showErrorBox('تعذر تشغيل واجهة البرنامج',String(error));
 });
 mainWindow.webContents.setWindowOpenHandler(({url,frameName})=>{
  if(url==='about:blank'&&/^lobnan-print-[a-z0-9]+-[a-z0-9]+$/.test(frameName||'')){
   return {action:'allow',overrideBrowserWindowOptions:{
    width:1100,height:850,frame:true,autoHideMenuBar:true,
    title:'معاينة الطباعة - برنامج الأيهم المحاسبي',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
   }};
  }
  if(/^https:\/\//i.test(url))void shell.openExternal(url);
  return {action:'deny'};
 });
 mainWindow.webContents.on('did-create-window',(child)=>{
  // Keep locally generated print windows isolated from external navigation.
  // All privileged IPC still checks the original main window sender.
  child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  child.webContents.on('will-navigate',(event,url)=>{
   if(url!=='about:blank')event.preventDefault();
  });
  child.webContents.on('will-redirect',event=>event.preventDefault());
 });
 mainWindow.webContents.on('will-navigate',(event,url)=>{
  // Navigation away from the pinned application bundle is not allowed.
  const expected='file://'+file.replace(/\\/g,'/');
  if(url.split(/[?#]/)[0]===expected)return;
  event.preventDefault();
  if(/^https:\/\//i.test(url))void shell.openExternal(url);
 });
 mainWindow.on('closed',()=>{mainWindow=null;});
}
app.whenReady().then(async()=>{
 if(!ownsSingleInstance){app.quit();return;}
 await showStartupWindow();
 startupMark('startup-window-ready');
 if(!startupError&&storage){
  try{nativeDb=openPinnedSQLite(storage.root,storage.id);startupMark('sqlite-integrity-ready');}
  catch(error){startupError=error;console.error('DESKTOP_STORAGE_STARTUP_BLOCKED',String(error));}
 }
 if(startupError||!nativeDb||!storage){
  dialog.showErrorBox('قاعدة البيانات المحلية غير متاحة',
   'توقف البرنامج لحماية بياناتك. لم يتم إنشاء قاعدة بديلة أو تغيير القرص تلقائيًا.\n\n'+
   String(startupError));
  dismissStartupWindow();
  app.quit();
  return;
 }
 // The verified update can be installed ONLY here, on a fresh launch BEFORE
 // any invoice view, IndexedDB transaction or POS draft screen is opened.
 // Never force-close an active browser or desktop cashier session.
 desktopUpdater=createDesktopUpdateService({
  app,storage,getWindow:()=>mainWindow
 });
 try{
  if(await desktopUpdater.applyOnNextLaunch()){
   startupMark('verified-update-install-start');
   dismissStartupWindow();
   app.quit(); // The installer helper waits until the app process exits.
   return;
  }
 }catch(error){
  console.warn('DESKTOP_UPDATE_STARTUP_NONFATAL',String(error));
  // The installed accounting app always remains usable if updates fail.
 }
 startupMark('startup-update-check-complete');
 registerIpc();
 createWindow();
 startupFinished=true;
 const window=mainWindow;
 window.webContents.once('did-finish-load',()=>{
  startupMark('main-interface-loaded');
  dismissStartupWindow();
  if(!window.isDestroyed()){window.show();window.focus();}
 });
 window.webContents.once('did-fail-load',()=>dismissStartupWindow());
 window.once('closed',()=>dismissStartupWindow());
 desktopUpdater.start(); // Check and download only. NEVER install mid-session.
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(startupFinished&&!mainWindow&&!startupError&&nativeDb)createWindow();});
app.on('before-quit',()=>{
 desktopUpdater?.stop();
 if(nativeDb){nativeDb.close();nativeDb=null;}
});
