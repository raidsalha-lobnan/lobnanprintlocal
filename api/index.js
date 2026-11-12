// Vercel hosts the static application only. PostgreSQL remains on the owner's PC.
// Never acknowledge a financial write unless the real PostgreSQL sync service commits it.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET' && req.url?.split('?')[0] === '/api/app-version') {
    return res.status(200).json({
      // Each Vercel deployment exposes a different immutable build ID.
      version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '1.0.0',
      storage: 'local-postgresql',
      syncApi: 'external',
    });
  }

  // In particular, /api/sync/push, /api/sync/full-sync, and /api/sync/state
  // must NEVER return success from this stateless function.
  // The browser uses VITE_PUBLIC_SYNC_API_URL for the authenticated zrok API.
  res.setHeader('Allow', 'GET');
  return res.status(503).json({
    ok: false,
    code: 'POSTGRES_SYNC_API_REQUIRED',
    message: 'خادم Vercel لا يحفظ البيانات. يجب الاتصال بخادم PostgreSQL المحلي عبر جسر HTTPS الموثق.',
  });
}
