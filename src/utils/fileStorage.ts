// Local High-Capacity Binary Storage using IndexedDB for 100% Original Quality Files
const DB_NAME = 'LobnanPrintFileStorage';
const DB_VERSION = 1;
const STORE_NAME = 'original_attachments';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface StoredBinaryFile {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: string;
}

export async function saveBinaryAttachment(id: string, file: File | Blob, name: string, type: string): Promise<string> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: StoredBinaryFile = {
        id,
        name,
        type,
        size: file.size,
        blob: file,
        createdAt: new Date().toISOString()
      };

      const req = store.put(record);
      req.onsuccess = () => resolve(id);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to save binary file to IndexedDB:', err);
    return id;
  }
}

export async function getBinaryAttachment(id: string): Promise<StoredBinaryFile | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to retrieve binary file from IndexedDB:', err);
    return null;
  }
}

export async function deleteBinaryAttachment(id: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to delete binary file from IndexedDB:', err);
    return false;
  }
}

// Download or view a file directly in original format
export function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
