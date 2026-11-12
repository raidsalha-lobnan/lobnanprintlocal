import {authHeaders, getCurrentSessionToken, publicSyncApiUrl, secureLoginEnabled} from './secureAuth';
import {downloadBlobFile} from '../utils/fileStorage';

// One private, authenticated attachment API for every program device.
// Google OAuth and encryption keys live on the server, never in a browser.
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const VALID_ID = /^att_[0-9a-f-]{36}$/;

function connection() {
  if (!secureLoginEnabled()) throw new Error('ATTACHMENTS_REQUIRE_SECURE_LOGIN');
  const token = getCurrentSessionToken();
  if (!token) throw new Error('SESSION_LOGIN_REQUIRED');
  const base = publicSyncApiUrl();
  return {base, headers: authHeaders(base, token)};
}

async function failure(response: Response): Promise<Error> {
  const result = await response.json().catch(() => ({}));
  const code = typeof result?.code === 'string' ? result.code : 'ATTACHMENT_HTTP_' + response.status;
  return new Error(code);
}

export async function centralAttachmentStatus(): Promise<boolean> {
  const {base, headers} = connection();
  const response = await fetch(base + '/api/v1/drive/status', {
    headers, cache: 'no-store'
  });
  if (!response.ok) throw await failure(response);
  const status = await response.json();
  return status?.configured === true;
}

export interface CentralAttachmentReceipt {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  storageType: 'drive';
}

export async function uploadCentralAttachment(file: File): Promise<CentralAttachmentReceipt> {
  if (!file.size) throw new Error('ATTACHMENT_EMPTY');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('ATTACHMENT_TOO_LARGE');
  const {base, headers} = connection();
  const params = new URLSearchParams({
    name: file.name,
    mime: file.type || 'application/octet-stream'
  });
  const response = await fetch(base + '/api/v1/attachments/upload?' + params.toString(), {
    method: 'POST',
    headers: {...headers, 'Content-Type': file.type || 'application/octet-stream'},
    body: file,
    cache: 'no-store'
  });
  if (!response.ok) throw await failure(response);
  const result = await response.json();
  if (!VALID_ID.test(String(result?.fileId || '')) || result?.storageType !== 'drive' ||
      Number(result?.size) !== file.size) throw new Error('INVALID_CLOUD_ATTACHMENT_RECEIPT');
  return result as CentralAttachmentReceipt;
}

export function isCentralAttachmentId(id: string | undefined): boolean {
  return VALID_ID.test(id || '');
}

export async function downloadCentralAttachment(fileId: string, filename: string): Promise<void> {
  if (!VALID_ID.test(fileId)) throw new Error('INVALID_CLOUD_ATTACHMENT_ID');
  const {base, headers} = connection();
  const response = await fetch(base + '/api/v1/attachments/content/' + encodeURIComponent(fileId), {
    headers, cache: 'no-store'
  });
  if (!response.ok) throw await failure(response);
  const blob = await response.blob();
  downloadBlobFile(blob, filename);
}
