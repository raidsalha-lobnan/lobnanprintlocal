// Google Drive Integration Service for 100% Original Quality Attachments
// Exclusively standalone Google Drive sync without secondary cloud authentication.

const DRIVE_FOLDER_NAME = 'Lobnan_Print_Attachments';
const STORAGE_KEY_TOKEN = 'lobnan_drive_access_token';
const STORAGE_KEY_TOKEN_EXP = 'lobnan_drive_token_expires_at';
const STORAGE_KEY_SHARED_EMAILS = 'lobnan_drive_shared_emails';

export interface DriveUploadResult {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

export function getSavedDriveToken(): string | null {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const expiresAt = localStorage.getItem(STORAGE_KEY_TOKEN_EXP);
  if (!token || !expiresAt) return null;
  if (Date.now() > parseInt(expiresAt, 10)) {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_TOKEN_EXP);
    return null;
  }
  return token;
}

export function saveDriveToken(token: string, expiresInSeconds: number = 3600) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  localStorage.setItem(STORAGE_KEY_TOKEN_EXP, expiresAt.toString());
}

import { authenticateWithGoogleDrive } from './googleDriveAuth';

export async function requestDriveAccessToken(): Promise<string> {
  const existing = getSavedDriveToken();
  if (existing) {
    return existing;
  }

  try {
    const authRes = await authenticateWithGoogleDrive();
    if (!authRes.token) {
      throw new Error('لم يتم استلام رمز صلاحية الوصول إلى Google Drive من جوجل');
    }

    saveDriveToken(authRes.token, 3600);
    return authRes.token;
  } catch (error: any) {
    console.error('Google Drive authorization error:', error);
    throw error;
  }
}

export async function getOrCreateDriveFolder(accessToken: string): Promise<string | null> {
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      )}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'مجلد مرفقات وتصاميم فواتير مطبعة ومكتبة لبنان'
      })
    });

    if (!createRes.ok) return null;
    const folderData = await createRes.json();
    return folderData.id;
  } catch (err) {
    console.error('Error creating drive folder:', err);
    return null;
  }
}

import {authHeaders,publicSyncApiUrl,secureLoginEnabled} from './secureAuth';

/** Application users access private Drive files through the authenticated
 * PostgreSQL server. No Google OAuth token is ever given to a browser. */
export async function getProgramDriveStatus():Promise<{configured:boolean;backup?:{ok:boolean;remoteVerified:boolean;lastCompletedAt:number;error?:string|null}}> {
  if(!secureLoginEnabled())return {configured:false};
  const base=publicSyncApiUrl();
  const response=await fetch(base+'/api/v1/drive/status',{headers:authHeaders(base),cache:'no-store'});
  if(!response.ok)return {configured:false};
  return response.json();
}

export async function downloadProgramDriveAttachment(fileId:string):Promise<Blob>{
  if(!secureLoginEnabled())throw new Error('SESSION_LOGIN_REQUIRED');
  const base=publicSyncApiUrl();
  const response=await fetch(base+'/api/v1/attachments/content/'+encodeURIComponent(fileId),{
    headers:authHeaders(base),cache:'no-store'
  });
  if(!response.ok)throw new Error('ATTACHMENT_DOWNLOAD_FAILED_'+response.status);
  return response.blob();
}

export async function uploadFileToGoogleDrive(
  file:File,customName?:string,onProgress?:(percent:number)=>void
):Promise<DriveUploadResult>{
  if(!secureLoginEnabled())throw new Error('SERVER_AUTH_REQUIRED_FOR_PRIVATE_DRIVE');
  const base=publicSyncApiUrl();
  const name=customName?.trim()||file.name;
  if(file.size>50*1024*1024)throw new Error('ATTACHMENT_MAX_50_MB');
  onProgress?.(10);
  const params=new URLSearchParams({name,mime:file.type||'application/octet-stream'});
  const response=await fetch(base+'/api/v1/attachments/upload?'+params,{
    method:'POST',
    headers:{...authHeaders(base),'Content-Type':'application/octet-stream'},
    body:file
  });
  if(!response.ok){
    const body=await response.json().catch(()=>({}));
    throw new Error(body.code||'ATTACHMENT_UPLOAD_FAILED_'+response.status);
  }
  const uploaded=await response.json();
  if(!uploaded.fileId)throw new Error('ATTACHMENT_RECEIPT_MISSING');
  onProgress?.(100);
  return {fileId:uploaded.fileId,name:uploaded.name,size:uploaded.size,
    mimeType:uploaded.mimeType};
}

export async function deleteFileFromGoogleDrive(fileId: string): Promise<boolean> {
  try {
    const token = await requestDriveAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updateDriveFileName(fileId: string, newName: string): Promise<boolean> {
  try {
    const token = await requestDriveAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getSavedSharedDriveEmails(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SHARED_EMAILS);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveSharedDriveEmail(email: string): string[] {
  const emails = getSavedSharedDriveEmails();
  if (!emails.includes(email)) {
    emails.push(email);
    localStorage.setItem(STORAGE_KEY_SHARED_EMAILS, JSON.stringify(emails));
  }
  return emails;
}

export function removeSharedDriveEmail(email: string): string[] {
  let emails = getSavedSharedDriveEmails();
  emails = emails.filter(e => e !== email);
  localStorage.setItem(STORAGE_KEY_SHARED_EMAILS, JSON.stringify(emails));
  return emails;
}

export async function shareDriveFolderWithEmail(
  email: string,
  role: string = 'writer'
): Promise<{ success: boolean; message?: string }> {
  try {
    const token = await requestDriveAccessToken();
    const folderId = await getOrCreateDriveFolder(token);
    if (!folderId) return { success: false, message: 'لم يتم العثور على المجلد' };

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role,
        type: 'user',
        emailAddress: email
      })
    });

    if (res.ok) {
      saveSharedDriveEmail(email);
      return { success: true, message: 'تم مشاركة المجلد بنجاح' };
    }
    const errJson = await res.json().catch(() => ({}));
    return { success: false, message: errJson.error?.message || 'فشل مشاركة المجلد' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'خطأ في الاتصال' };
  }
}

export async function getDriveFolderUrl(): Promise<string> {
  const token = getSavedDriveToken();
  if (token) {
    try {
      const folderId = await getOrCreateDriveFolder(token);
      if (folderId) {
        return `https://drive.google.com/drive/folders/${folderId}`;
      }
    } catch {
      // fallback
    }
  }
  return `https://drive.google.com/drive/u/0/search?q=${encodeURIComponent(DRIVE_FOLDER_NAME)}`;
}
