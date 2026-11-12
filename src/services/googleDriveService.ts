// Compatibility facade for app UI. The accounting server owns the single
// Google Drive authorization and all cloud storage; browsers never hold OAuth.
import {authHeaders, publicSyncApiUrl, secureLoginEnabled} from './secureAuth';
import {uploadCentralAttachment, isCentralAttachmentId} from './centralAttachmentApi';

export interface DriveUploadResult {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
}

export interface ProgramDriveStatus {
  configured: boolean;
  backend?: string;
  backup?: {ok: boolean; remoteVerified: boolean; lastCompletedAt: number; error?: string | null};
}

export async function getProgramDriveStatus(): Promise<ProgramDriveStatus> {
  if (!secureLoginEnabled()) return {configured: false};
  const base = publicSyncApiUrl();
  try {
    const response = await fetch(base + '/api/v1/drive/status', {
      headers: authHeaders(base), cache: 'no-store'
    });
    if (!response.ok) return {configured: false};
    const status = await response.json();
    return {configured: status?.configured === true, backend: status?.backend, backup: status?.backup};
  } catch {
    return {configured: false};
  }
}

export async function uploadFileToGoogleDrive(
  file: File, _customName?: string, onProgress?: (percent: number) => void
): Promise<DriveUploadResult> {
  onProgress?.(10);
  // The canonical upload path preserves the original browser file bytes.
  const receipt = await uploadCentralAttachment(file);
  onProgress?.(100);
  return receipt;
}

export async function downloadProgramDriveAttachment(fileId: string): Promise<Blob> {
  if (!isCentralAttachmentId(fileId) || !secureLoginEnabled())
    throw new Error('CENTRAL_ATTACHMENT_REQUIRED');
  const base = publicSyncApiUrl();
  const response = await fetch(
    base + '/api/v1/attachments/content/' + encodeURIComponent(fileId), {
      headers: authHeaders(base), cache: 'no-store'
    });
  if (!response.ok) throw new Error('ATTACHMENT_DOWNLOAD_FAILED_' + response.status);
  return response.blob();
}
