'use strict';
const {app,BrowserWindow,Menu,shell,ipcMain,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {selectPinnedStorage,openPinnedSQLite}=require('./storage.cjs');
const {createDesktopUpdateService}=require('./update-manager.cjs');

const API_ORIGIN='https://lobnan-api.shares.zrok.io';
const MAX_API_BYTES=48*1024*1024;
let mainWindow=null,storage=null,nativeDb=null,startupError=null,desktopUpdater=null;
// Never run two desktop sessions on the same pinned SQLite profile. In
// particular, an update cannot begin while a second POS window stays open.
const ownsSingleInstance=app.requestSingleInstanceLock();
app.on('second-instance',()=>{
 if(mainWindow&&!mainWindow.isDestroyed()){
  if(mainWindow.isMinimized())mainWindow.restore();
  mainWindow.show();mainWindow.focus();
 }
});
try{
 storage=selectPinnedStorage();
 fs.mkdirSync(storage.profileDir,{recursive:true});
 // Chromium's IndexedDB, drafts, cache and service-worker state all reside
 // alongside the pinned SQLite database, never in the default C: profile.
 app.setPath('userData',storage.profileDir);
 const sessionDir=path.join(storage.root,'ChromiumSession');
 fs.mkdirSync(sessionDir,{recursive:true});
 app.setPath('sessionData',sessionDir);
 nativeDb=openPinnedSQLite(storage.root,storage.id);
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
 ipcMain.handle('lobnan:desktop-update-status',event=>{
  trusted(event);
  return desktopUpdater?.getStatus()||{phase:'disabled'};
 });
 ipcMain.handle('lobnan:desktop-update-check',event=>{
  trusted(event);
  return desktopUpdater?.checkNow()||{phase:'disabled'};
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
function readDisplaySettings(){
 try{
  const v=JSON.parse(fs.readFileSync(path.join(storage.profileDir,'display-settings.json'),'utf8'));
  return {width:Math.max(800,Math.min(7680,Number(v.width)||1366)),
   height:Math.max(480,Math.min(4320,Number(v.height)||768)),
   zoom:[0.8,0.9,1,1.1,1.25,1.5].includes(v.zoom)?v.zoom:1,
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
function installDisplayMenu(){
 const sizes=[[1024,600],[1280,720],[1366,768],[1600,900],[1920,1080]];
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'إعدادات الشاشة',submenu:[
  ...sizes.map(([width,height])=>({label:width+' × '+height,click:()=>{
   if(!mainWindow)return;
   if(mainWindow.isMaximized())mainWindow.unmaximize();
   const {width:availableWidth,height:availableHeight}=require('electron').screen.getDisplayMatching(mainWindow.getBounds()).workArea;
   mainWindow.setSize(Math.min(width,availableWidth),Math.min(height,availableHeight));mainWindow.center();saveDisplaySettings();
  }})),
  {type:'separator'},
  {label:'تكبير الواجهة',submenu:[0.8,0.9,1,1.1,1.25,1.5].map(zoom=>({label:Math.round(zoom*100)+'%',click:()=>{
   if(mainWindow){mainWindow.webContents.setZoomFactor(zoom);saveDisplaySettings();}
  }}))},
  {label:'ملء مساحة الشاشة',click:()=>{if(mainWindow){mainWindow.maximize();saveDisplaySettings();}}},
  {label:'حفظ المقاس الحالي',click:saveDisplaySettings},
  {label:'استعادة الافتراضي',click:()=>{if(mainWindow){mainWindow.unmaximize();const a=require('electron').screen.getDisplayMatching(mainWindow.getBounds()).workArea;mainWindow.setSize(Math.min(1366,a.width),Math.min(768,a.height));mainWindow.center();mainWindow.webContents.setZoomFactor(1);saveDisplaySettings();}}}
 ]}]));
}
function createWindow(){
 const display=readDisplaySettings();
 const workArea=require('electron').screen.getPrimaryDisplay().workArea;
 mainWindow=new BrowserWindow({
  width:Math.min(display.width,workArea.width),height:Math.min(display.height,workArea.height),minWidth:Math.min(800,workArea.width),minHeight:Math.min(480,workArea.height),
  title:'مطبعة ومكتبة لبنان',
  webPreferences:{
   preload:path.join(__dirname,'preload.cjs'),
   nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true
  }
 });
 installDisplayMenu();
 mainWindow.webContents.on('did-finish-load',()=>mainWindow?.webContents.setZoomFactor(display.zoom));
 if(display.maximized)mainWindow.maximize();
 mainWindow.on('close',saveDisplaySettings);
 const file=path.join(__dirname,'../dist/index.html');
 void mainWindow.loadFile(file).catch(error=>{
  console.error('DESKTOP_PAGE_LOAD_FAILED',String(error));
  dialog.showErrorBox('تعذر تشغيل واجهة البرنامج',String(error));
 });
 mainWindow.webContents.setWindowOpenHandler(({url})=>{
  if(/^https:\/\//i.test(url))void shell.openExternal(url);
  return {action:'deny'};
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
 if(startupError||!nativeDb||!storage){
  dialog.showErrorBox('قاعدة البيانات المحلية غير متاحة',
   'توقف البرنامج لحماية بياناتك. لم يتم إنشاء قاعدة بديلة أو تغيير القرص تلقائيًا.\n\n'+
   String(startupError));
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
   app.quit(); // The installer helper waits until the app process exits.
   return;
  }
 }catch(error){
  console.warn('DESKTOP_UPDATE_STARTUP_NONFATAL',String(error));
  // The installed accounting app always remains usable if updates fail.
 }
 registerIpc();
 createWindow();
 desktopUpdater.start(); // Check and download only. NEVER install mid-session.
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(!mainWindow&&!startupError)createWindow();});
app.on('before-quit',()=>{
 desktopUpdater?.stop();
 if(nativeDb){nativeDb.close();nativeDb=null;}
});
