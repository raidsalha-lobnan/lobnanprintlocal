'use strict';
const {app,BrowserWindow,Menu,shell,ipcMain,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {selectPinnedStorage,openPinnedSQLite}=require('./storage.cjs');

const API_ORIGIN='https://lobnan-api.shares.zrok.io';
const MAX_API_BYTES=48*1024*1024;
let mainWindow=null,storage=null,nativeDb=null,startupError=null;
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
function createWindow(){
 mainWindow=new BrowserWindow({
  width:1366,height:768,minWidth:1024,minHeight:600,
  title:'مطبعة ومكتبة لبنان',
  webPreferences:{
   preload:path.join(__dirname,'preload.cjs'),
   nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true
  }
 });
 Menu.setApplicationMenu(null);
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
app.whenReady().then(()=>{
 if(startupError||!nativeDb||!storage){
  dialog.showErrorBox('قاعدة البيانات المحلية غير متاحة',
   'توقف البرنامج لحماية بياناتك. لم يتم إنشاء قاعدة بديلة أو تغيير القرص تلقائيًا.\n\n'+
   String(startupError));
  app.quit();
  return;
 }
 registerIpc();
 createWindow();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(!mainWindow&&!startupError)createWindow();});
app.on('before-quit',()=>{if(nativeDb){nativeDb.close();nativeDb=null;}});
