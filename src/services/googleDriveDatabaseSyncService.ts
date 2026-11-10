// Google Drive Database Sync Engine for Lobnan Press Accounting App
// Exclusively syncs the database with the user's Google Drive (the PostgreSQL sync engine kept separate).

export const DATABASE_DRIVE_FOLDER = 'Lobnan_Accounting_Cloud_Database';
export const MASTER_DATABASE_FILENAME = 'The Start Data';

const STORAGE_KEY_TOKEN = 'lobnan_drive_access_token';
const STORAGE_KEY_TOKEN_EXP = 'lobnan_drive_token_expires_at';

let cachedAccessToken: string | null = null;

export function getCachedSyncToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken;
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const exp = localStorage.getItem(STORAGE_KEY_TOKEN_EXP);
  if (token && exp && Date.now() < parseInt(exp, 10)) {
    cachedAccessToken = token;
    return token;
  }
  return null;
}

export function saveSyncToken(token: string, expiresInSeconds: number = 3600) {
  cachedAccessToken = token;
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  localStorage.setItem(STORAGE_KEY_TOKEN_EXP, (Date.now() + expiresInSeconds * 1000).toString());
}

import { authenticateWithGoogleDrive } from './googleDriveAuth';

export async function requestGoogleDriveToken(promptUser: boolean = false): Promise<string | null> {
  const existing = getCachedSyncToken();
  if (existing) return existing;
  if (!promptUser) return null;

  try {
    const authRes = await authenticateWithGoogleDrive();
    if (authRes && authRes.token) {
      saveSyncToken(authRes.token, 3600);
      return authRes.token;
    }
  } catch (err) {
    console.error('Failed to request Google Drive token:', err);
  }
  return null;
}

export async function getOrCreateCloudDatabaseFolder(token: string): Promise<string> {
  const q = `name='${DATABASE_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
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
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: DATABASE_DRIVE_FOLDER,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'مجلد قاعدة البيانات الموحدة لقوقل درايف - برنامج الأيهم المحاسبي'
    })
  });

  if (!createRes.ok) {
    throw new Error(`فشل إنشاء مجلد قاعدة بيانات قوقل درايف (${createRes.status})`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

export async function findMasterDatabaseFile(token: string, folderId: string): Promise<{ id: string; name: string } | null> {
  const q = `'${folderId}' in parents and (name='The Start Data' or name='The Start Data.json' or name='Lobnan_Accounting_Master_Database.json') and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
  }
  return null;
}

export async function fetchMasterDatabaseFromDrive(token: string): Promise<any | null> {
  try {
    const folderId = await getOrCreateCloudDatabaseFolder(token);
    const file = await findMasterDatabaseFile(token, folderId);
    if (!file) return null;

    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      if (fileRes.status === 401) {
        cachedAccessToken = null;
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
      return null;
    }

    const json = await fileRes.json();
    return json;
  } catch (err) {
    console.error('Error fetching master database from Google Drive:', err);
    return null;
  }
}

export async function saveMasterDatabaseToDrive(token: string, payload: any): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const folderId = await getOrCreateCloudDatabaseFolder(token);
    const existingFile = await findMasterDatabaseFile(token, folderId);

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const arrayBuffer = await blob.arrayBuffer();

    if (existingFile) {
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: blob
      });

      if (!updateRes.ok) {
        if (updateRes.status === 401) {
          cachedAccessToken = null;
          localStorage.removeItem(STORAGE_KEY_TOKEN);
        }
        throw new Error(`فشل تحديث قاعدة البيانات في قوقل درايف (${updateRes.status})`);
      }

      return { success: true, fileId: existingFile.id };
    } else {
      const metadata = {
        name: MASTER_DATABASE_FILENAME,
        description: 'قاعدة البيانات المركزية الموحدة لبرنامج الأيهم المحاسبي',
        parents: [folderId]
      };

      const boundary = '-------LobnanDbSyncBoundary' + Date.now();
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

      if (!uploadRes.ok) {
        if (uploadRes.status === 401) {
          cachedAccessToken = null;
          localStorage.removeItem(STORAGE_KEY_TOKEN);
        }
        throw new Error(`فشل رفع قاعدة البيانات إلى قوقل درايف (${uploadRes.status})`);
      }

      const resJson = await uploadRes.json();
      return { success: true, fileId: resJson.id };
    }
  } catch (error: any) {
    console.error('Error saving master database to Google Drive:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

export function isTestSyncProbeItem(item: any): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const code = String(item.code || '');
  const name = String(item.name || '');
  return id === 'inv-probe-sync-1' || id === 'inv-test-full-1' || code === 'ITEM-9999' || name === 'صنف تجربة المزامنة' || name === 'صنف فحص المزامنة الشاملة';
}

export function mergeEntityLists(localList: any[], remoteList: any[], customDelSet?: Set<string>, entityName?: string): any[] {
  const map = new Map<string, any>();

  // Load persistent deleted tombstones from localStorage
  const delSet = customDelSet || (() => {
    const set = new Set<string>();
    try {
      const delList = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
      if (Array.isArray(delList)) {
        delList.forEach((d: any) => {
          if (d && d.id) {
            set.add(String(d.id));
            if (d.col) set.add(`${d.col}_${d.id}`);
          }
        });
      }
    } catch {}
    return set;
  })();

  if (Array.isArray(localList)) {
    for (const item of localList) {
      if (!item || !item.id || isTestSyncProbeItem(item)) continue;
      const key = String(item.id);
      if (delSet.has(key) || (entityName && delSet.has(`${entityName}_${key}`)) || item._deleted || item.deletedAt) continue;
      map.set(key, item);
    }
  }

  if (Array.isArray(remoteList)) {
    for (const item of remoteList) {
      if (!item || !item.id || isTestSyncProbeItem(item)) continue;
      const key = String(item.id);
      if (delSet.has(key) || (entityName && delSet.has(`${entityName}_${key}`)) || item._deleted || item.deletedAt) {
        map.delete(key);
        continue;
      }

      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
      } else {
        // ID exists: compare timestamps so local edits win if tExist >= tRemote
        const tExist = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const tRemote = new Date(item.updatedAt || item.createdAt || 0).getTime();

        const localWins = tExist > tRemote || Boolean((existing as any)._unsyncedLocal);
        const primary = localWins ? existing : item;
        const secondary = localWins ? item : existing;

        map.set(key, {
          ...secondary,
          ...primary,
          code: primary.code || secondary.code,
          items: (Array.isArray(primary.items) && primary.items.length > 0) ? primary.items : (secondary.items || []),
          payments: (Array.isArray(primary.payments) && primary.payments.length > 0) ? primary.payments : (secondary.payments || []),
          updatedAt: new Date(Math.max(tExist, tRemote, Date.now())).toISOString()
        });
      }
    }
  }
  return Array.from(map.values());
}
