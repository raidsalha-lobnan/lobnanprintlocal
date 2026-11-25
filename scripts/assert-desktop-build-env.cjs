'use strict';
const assert=require('node:assert/strict');
assert.equal(process.env.VITE_SYNC_LOGIN_MODE,'users',
 'Windows installer must use authenticated PostgreSQL login');
assert.equal(process.env.VITE_SYNC_BACKEND,'local-postgres',
 'Windows installer must use the existing PostgreSQL sync transport');
assert.equal(String(process.env.VITE_PUBLIC_SYNC_API_URL||'').replace(/\/+$/,''),
 'https://lobnan-api.shares.zrok.io',
 'Windows native HTTPS bridge must match the configured API origin');
console.log('DESKTOP_SECURE_API_ENV_VERIFIED');
