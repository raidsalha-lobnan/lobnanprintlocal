import crypto from 'node:crypto';

/**
 * Fail-closed Cloudflare Access JWT verification at the PRIVATE origin.
 * Only intended to protect a temporary single-administrator staging system.
 * Does not replace server-side per-employee roles and financial authorization.
 */
export function createAccessVerifier({teamDomain, audience, fetcher = fetch, now = () => Date.now()}) {
  if (typeof teamDomain !== 'string' || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(teamDomain)) {
    throw new Error('CF_ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com');
  }
  if (typeof audience !== 'string' || !/^[a-zA-Z0-9_-]{12,180}$/.test(audience)) {
    throw new Error('CF_ACCESS_AUD is required');
  }
  let cached = null;
  let cachedUntil = 0;
  const keyUrl = teamDomain + '/cdn-cgi/access/certs';

  async function loadKeys(force = false) {
    if (!force && cached && now() < cachedUntil) return cached;
    const response = await fetcher(keyUrl, { signal: AbortSignal.timeout(6000) });
    if (!response?.ok) throw new Error('ACCESS_JWKS_UNAVAILABLE');
    const document = await response.json();
    if (!Array.isArray(document?.keys) || !document.keys.length) throw new Error('ACCESS_JWKS_INVALID');
    const keys = new Map();
    for (const jwk of document.keys) {
      if (jwk && jwk.kty === 'RSA' && typeof jwk.kid === 'string' && jwk.n && jwk.e) {
        keys.set(jwk.kid, crypto.createPublicKey({key: jwk, format:'jwk'}));
      }
    }
    if (!keys.size) throw new Error('ACCESS_JWKS_EMPTY');
    cached = keys;
    cachedUntil = now() + 5 * 60 * 1000;
    return keys;
  }

  return async token => {
    if (typeof token !== 'string' || !token || token.length > 12000) throw new Error('ACCESS_JWT_MISSING');
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every(Boolean)) throw new Error('ACCESS_JWT_INVALID');
    let header, payload;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch { throw new Error('ACCESS_JWT_INVALID'); }
    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('ACCESS_ALG_REJECTED');
    const nowSeconds = Math.floor(now() / 1000);
    if (payload?.iss !== teamDomain ||
        !(Array.isArray(payload.aud) ? payload.aud.includes(audience) : payload.aud === audience) ||
        !Number.isFinite(payload.exp) || payload.exp <= nowSeconds ||
        (payload.nbf != null && (!Number.isFinite(payload.nbf) || payload.nbf > nowSeconds))) {
      throw new Error('ACCESS_CLAIMS_REJECTED');
    }
    let keys = await loadKeys();
    if (!keys.has(header.kid)) keys = await loadKeys(true);
    const key = keys.get(header.kid);
    if (!key || !crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key,
      Buffer.from(parts[2], 'base64url'))) {
      throw new Error('ACCESS_SIGNATURE_REJECTED');
    }
    return {sub: payload.sub, email: payload.email, aud: payload.aud};
  };
}
