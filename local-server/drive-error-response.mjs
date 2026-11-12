/** Public HTTP error classification. Never return raw unexpected stack/errors,
 * database details, OAuth codes, bearer credentials, or refresh tokens.
 */
const DRIVE_CODES=new Set([
 'GOOGLE_DRIVE_OAUTH_APP_NOT_CONFIGURED',
 'GOOGLE_DRIVE_EMAIL_DELIVERY_NOT_CONFIGURED',
 'GOOGLE_DRIVE_EMAIL_INVALID',
 'GOOGLE_DRIVE_AUTH_EMAIL_SEND_FAILED',
 'GOOGLE_DRIVE_OAUTH_STATE_EXPIRED',
 'GOOGLE_DRIVE_OAUTH_EXCHANGE_FAILED',
 'GOOGLE_DRIVE_OAUTH_INVALID',
 'GOOGLE_DRIVE_REFRESH_TOKEN_MISSING',
 'GOOGLE_DRIVE_IDENTITY_CHECK_FAILED',
 'GOOGLE_DRIVE_AUTH_ACCOUNT_MISMATCH',
 'DRIVE_ENCRYPTION_KEY_REQUIRED',
 'DRIVE_ADMIN_CONSENT_REQUIRED'
]);
export function sanitizedDriveHttpError(err) {
 const status=Number(err?.status);
 const message=String(err?.message||'');
 if(DRIVE_CODES.has(message)&&[400,403,502,503].includes(status))
   return {status,code:message};
 return null;
}
