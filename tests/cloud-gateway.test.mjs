import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('cloud preview removes per-device pairing in same-origin mode', () => {
  const app=read('src/App.tsx');
  const transport=read('src/sync-next/httpTransport.ts');
  const users=read('src/services/savedUserDirectory.ts');
  assert.match(app,/VITE_SYNC_GATEWAY_MODE !== 'true'/);
  assert.match(transport,/window\.location\.origin/);
  assert.match(users,/gateway \? window\.location\.origin/);
  assert.match(transport,/authHeaders\(this\.url/);
  assert.match(users,/headers: token \? /);
});

test('browser never receives staging shared server token from Docker build', () => {
  const docker=read('Dockerfile.cloud-preview');
  const nginx=read('cloud/nginx-preview.conf.template');
  assert.doesNotMatch(docker,/ENV SYNC_DEVICE_TOKEN|ARG SYNC_DEVICE_TOKEN/);
  assert.match(nginx,/proxy_set_header Authorization "Bearer \$\{SYNC_DEVICE_TOKEN\}"/);
  assert.match(nginx,/proxy_set_header Origin ""/);
  assert.match(nginx,/listen 8080/);
  assert.match(docker,/VITE_SYNC_GATEWAY_MODE=true/);
});

test('database and API have no public Docker host-port mapping', () => {
  const compose=read('docker-compose.cloud-preview.yml');
  assert.doesNotMatch(compose,/\n\s+ports:/);
  assert.match(compose,/CLOUDFLARE_TUNNEL_TOKEN/);
  assert.match(compose,/postgres:17-alpine/);
  assert.match(compose,/lobnan_preview/);
  assert.match(compose,/expose: \["4577"\]/);
});
