/**
 * Optional Google Drive OAuth via Google Identity Services.
 * Uses the standard Google Identity Services token flow.
 * Requires a Web OAuth client ID configured by the deployment administrator.
 */
type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};
type GoogleTokenClient = { requestAccessToken: (options?: {prompt?: string}) => void };
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: {
      initTokenClient: (settings: {
        client_id: string;
        scope: string;
        callback: (result: GoogleTokenResponse) => void;
        error_callback?: (result: { type?: string }) => void;
      }) => GoogleTokenClient;
    } } };
  }
}
let scriptLoad: Promise<void> | null = null;
function loadIdentityService(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptLoad) {
    scriptLoad = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => window.google?.accounts?.oauth2
        ? resolve()
        : reject(new Error('GOOGLE_IDENTITY_SERVICE_UNAVAILABLE'));
      script.onerror = () => reject(new Error('GOOGLE_IDENTITY_SERVICE_LOAD_FAILED'));
      document.head.appendChild(script);
    }).catch(error => {
      scriptLoad = null;
      throw error;
    });
  }
  return scriptLoad;
}
export async function authenticateWithGoogleDrive():
Promise<{ token: string; user: { email: string; displayName: string } }> {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId || typeof clientId !== 'string') {
    throw new Error('Google Drive OAuth requires a configured VITE_GOOGLE_OAUTH_CLIENT_ID.');
  }
  if (typeof window === 'undefined') throw new Error('GOOGLE_OAUTH_REQUIRES_BROWSER');
  await loadIdentityService();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('GOOGLE_IDENTITY_SERVICE_UNAVAILABLE');
  const token = await new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: result => {
        if (result.error || !result.access_token) reject(
          new Error(result.error_description || result.error || 'GOOGLE_OAUTH_NO_ACCESS_TOKEN')
        );
        else resolve(result.access_token);
      },
      error_callback: result => reject(
        new Error('GOOGLE_OAUTH_' + (result.type || 'POPUP_ERROR'))
      )
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
  return { token, user: { email: '', displayName: '' } };
}
