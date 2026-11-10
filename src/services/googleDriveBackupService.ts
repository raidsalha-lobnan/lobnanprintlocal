// Google Drive Automated Backup Service for Lobnan Press & Library
// Exclusively standalone Google Drive sync without secondary cloud authentication.

export const BACKUP_DRIVE_FOLDER_NAME = 'Lobnan_Accounting_Hourly_Backups';
export const BACKUP_DRIVE_FOLDER_DESC = 'مجلد النسخ الاحتياطية التلقائية كل ساعة - برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان';

export interface DriveBackupFileItem {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  isOlderThan7Days: boolean;
  ageInDays: number;
  formattedDate: string;
}

export interface BackupExecutionResult {
  success: boolean;
  timestamp: string;
  fileName: string;
  fileId?: string;
  fileSize?: number;
  driveLink?: string;
  deletedOldBackupsCount: number;
  deletedOldFiles: Array<{ id: string; name: string; createdTime: string }>;
  totalBackupsInDrive: number;
  error?: string;
}

const STORAGE_KEY_TOKEN = 'lobnan_drive_access_token';
let cachedAccessToken: string | null = localStorage.getItem(STORAGE_KEY_TOKEN);
let isSigningIn = false;

export function getCachedDriveToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken;
  return localStorage.getItem(STORAGE_KEY_TOKEN);
}

export function setCachedDriveToken(token: string | null): void {
  cachedAccessToken = token;
  if (token) {
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
  } else {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
  }
}

export function initDriveAuthListener(
  onSuccess?: (user: { email: string; displayName?: string }, token: string) => void,
  onSignedOut?: () => void
) {
  const token = getCachedDriveToken();
  if (token && onSuccess) {
    onSuccess({ email: 'admin@example.invalid', displayName: 'رائد صالحة' }, token);
  }
  return () => {};
}

import { authenticateWithGoogleDrive } from './googleDriveAuth';

export async function connectGoogleDrive(): Promise<{ user: { email: string; displayName: string }; accessToken: string }> {
  try {
    isSigningIn = true;
    const authRes = await authenticateWithGoogleDrive();
    if (!authRes.token) {
      throw new Error('لم يتم استلام رمز صلاحية الوصول إلى Google Drive من جوجل.');
    }

    setCachedDriveToken(authRes.token);
    return {
      user: authRes.user,
      accessToken: authRes.token
    };
  } catch (err: any) {
    console.error('Google Drive sign-in error:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export async function disconnectGoogleDrive(): Promise<void> {
  setCachedDriveToken(null);
}

export async function getOrCreateBackupFolder(token: string): Promise<string> {
  const q = `name='${BACKUP_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (searchRes.status === 401) {
    setCachedDriveToken(null);
    throw new Error('انتهت صلاحية رمز الوصول لـ Google Drive (401). يرجى المزامنة وإعادة الاتصال.');
  }

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: BACKUP_DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: BACKUP_DRIVE_FOLDER_DESC
    })
  });

  if (createRes.status === 401) {
    setCachedDriveToken(null);
    throw new Error('انتهت صلاحية رمز الوصول لـ Google Drive (401). يرجى المزامنة وإعادة الاتصال.');
  }

  if (!createRes.ok) {
    throw new Error(`فشل إنشاء مجلد النسخ الاحتياطي (${createRes.status})`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

export async function getOrCreateTodayFolder(token: string, parentFolderId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayFolderName = `${year}-${month}-${day}`;

  const q = `name='${todayFolderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (searchRes.status === 401) {
    setCachedDriveToken(null);
    throw new Error('انتهت صلاحية رمز الوصول لـ Google Drive (401).');
  }

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: todayFolderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
      description: `مجلد النسخ الاحتياطية لتاريخ ${todayFolderName} - برنامج الأيهم المحاسبي`
    })
  });

  if (!createRes.ok) {
    throw new Error(`فشل إنشاء مجلد تاريخ اليوم (${createRes.status})`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

export async function uploadBackupJsonToDrive(token: string, payload: any): Promise<{ success: boolean; fileId?: string; fileName?: string; error?: string }> {
  try {
    const parentFolderId = await getOrCreateBackupFolder(token);
    const todayFolderId = await getOrCreateTodayFolder(token, parentFolderId);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    // Naming convention: لبنان_YYYY-MM-DD_HH-mm-ss.json
    const fileName = `لبنان_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.json`;

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const arrayBuffer = await blob.arrayBuffer();

    const metadata = {
      name: fileName,
      description: 'نسخة احتياطية تلقائية كل نصف ساعة - برنامج الأيهم المحاسبي',
      parents: [todayFolderId]
    };

    const boundary = '-------LobnanBackupBoundary' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const mediaHeaderPart = `${delimiter}Content-Type: application/json\r\n\r\n`;

    const metaEncoder = new TextEncoder();
    const metaBytes = metaEncoder.encode(metadataPart);
    const mediaHeaderBytes = metaEncoder.encode(mediaHeaderPart);
    const closeBytes = metaEncoder.encode(closeDelimiter);

    const fullBody = new Uint8Array(metaBytes.length + mediaHeaderBytes.length + arrayBuffer.byteLength + closeBytes.length);
    fullBody.set(metaBytes, 0);
    fullBody.set(mediaHeaderBytes, metaBytes.length);
    fullBody.set(new Uint8Array(arrayBuffer), metaBytes.length + mediaHeaderBytes.length);
    fullBody.set(closeBytes, metaBytes.length + mediaHeaderBytes.length + arrayBuffer.byteLength);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: fullBody
    });

    if (uploadRes.status === 401) {
      setCachedDriveToken(null);
      return { success: false, error: 'انتهت صلاحية رمز الوصول لـ Google Drive (401).' };
    }

    if (!uploadRes.ok) {
      throw new Error(`فشل رفع النسخة الاحتياطية (${uploadRes.status})`);
    }

    const resJson = await uploadRes.json();
    return { success: true, fileId: resJson.id, fileName: resJson.name };
  } catch (error: any) {
    if (error?.message?.includes('401')) {
      setCachedDriveToken(null);
    }
    console.warn('Error uploading backup to Google Drive:', error?.message || error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

export async function listDriveBackupFiles(token: string): Promise<DriveBackupFileItem[]> {
  try {
    const folderId = await getOrCreateBackupFolder(token);
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,createdTime,modifiedTime,webViewLink,webContentLink)&orderBy=createdTime desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 401) {
      setCachedDriveToken(null);
      return [];
    }

    if (!res.ok) return [];

    const data = await res.json();
    const files = data.files || [];
    const now = Date.now();

    return files.map((file: any) => {
      const createdTime = file.createdTime || new Date().toISOString();
      const ageMs = now - new Date(createdTime).getTime();
      const ageInDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      const isOlderThan7Days = ageInDays > 7;

      return {
        id: file.id,
        name: file.name,
        size: parseInt(file.size || '0', 10),
        createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        isOlderThan7Days,
        ageInDays,
        formattedDate: new Date(createdTime).toLocaleString('ar-PS')
      };
    });
  } catch (err: any) {
    if (err?.message?.includes('401')) {
      setCachedDriveToken(null);
    }
    console.warn('Error listing backup files:', err?.message || err);
    return [];
  }
}

export async function deleteSingleBackupFile(token: string, fileId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) {
      setCachedDriveToken(null);
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
}

export async function cleanOldBackupsFromDrive(token: string, retentionDays: number = 7): Promise<{ deletedCount: number; deletedFiles: Array<{ id: string; name: string; createdTime: string }> }> {
  const files = await listDriveBackupFiles(token);
  const deletedFiles: Array<{ id: string; name: string; createdTime: string }> = [];

  for (const file of files) {
    if (file.ageInDays > retentionDays) {
      const ok = await deleteSingleBackupFile(token, file.id);
      if (ok) {
        deletedFiles.push({ id: file.id, name: file.name, createdTime: file.createdTime });
      }
    }
  }

  return { deletedCount: deletedFiles.length, deletedFiles };
}

export async function executeHourlyDriveBackupFlow(
  token: string,
  fullPayload: any,
  options?: { retentionDays?: number; autoCleanOld?: boolean }
): Promise<BackupExecutionResult> {
  const uploadRes = await uploadBackupJsonToDrive(token, fullPayload);
  if (!uploadRes.success) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      fileName: '',
      deletedOldBackupsCount: 0,
      deletedOldFiles: [],
      totalBackupsInDrive: 0,
      error: uploadRes.error
    };
  }

  let deletedOldFiles: Array<{ id: string; name: string; createdTime: string }> = [];
  if (options?.autoCleanOld === true) {
    const cleanRes = await cleanOldBackupsFromDrive(token, options?.retentionDays || 7);
    deletedOldFiles = cleanRes.deletedFiles;
  }

  const allFiles = await listDriveBackupFiles(token);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    fileName: uploadRes.fileName || '',
    fileId: uploadRes.fileId,
    deletedOldBackupsCount: deletedOldFiles.length,
    deletedOldFiles,
    totalBackupsInDrive: allFiles.length
  };
}
