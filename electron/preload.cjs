'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Strictly scoped storage and API bridge; no shell, arbitrary filesystem,
// arbitrary SQL or developer tools are exposed to the React renderer.
contextBridge.exposeInMainWorld('electronAPI',{
 isElectron:true,
 sqliteLocalStorage:true,
 platform:process.platform,
 getStorageInfo:()=>ipcRenderer.invoke('lobnan:storage-info'),
 readStores:(name)=>ipcRenderer.invoke('lobnan:read-stores',name),
 writeStores:(name,rows)=>ipcRenderer.invoke('lobnan:write-stores',name,rows),
 readPosAttempt:(key)=>ipcRenderer.invoke('lobnan:read-pos-attempt',key),
 savePosAttempt:(key,value)=>ipcRenderer.invoke('lobnan:save-pos-attempt',key,value),
 deletePosAttempt:(key)=>ipcRenderer.invoke('lobnan:delete-pos-attempt',key),
 syncApiFetch:(request)=>ipcRenderer.invoke('lobnan:sync-api-fetch',request)
});
