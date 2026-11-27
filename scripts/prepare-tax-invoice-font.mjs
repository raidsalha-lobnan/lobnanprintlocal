import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../public/fonts/tax-invoice/', import.meta.url));
await mkdir(dir, { recursive: true });
const base = 'https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/arefruqaa/';
const casualBase = 'https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/lemonada/';
const assets = [
  ['ArefRuqaa-Regular.ttf','49e2c4e29ee2e24c4e36a8857f45a24d13d103f3',base+'ArefRuqaa-Regular.ttf'],
  ['OFL.txt','f89db8233df5ee80af5f86b74ade558305ee13aa',base+'OFL.txt'],
  ['Lemonada.ttf','7049e67062201a8fe2c45465ae1f6c7ecccb3d78',casualBase+'Lemonada%5Bwght%5D.ttf'],
  ['Lemonada-OFL.txt','720cfd1cd78a066bcd7e46a56aa87acdd79fc30a',casualBase+'OFL.txt']
];
const gitHash = bytes => createHash('sha1').update('blob '+bytes.length+'\\0'.replace('\\0','\0')).update(bytes).digest('hex');
for (const [name, expected, url] of assets) {
  const path = dir+'/'+name;
  let bytes;
  try { bytes = await readFile(path); } catch {}
  if (!bytes || gitHash(bytes) !== expected) {
    const response = await fetch(url,{signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error('Cannot prepare invoice font: '+response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    if (gitHash(bytes) !== expected) throw new Error('Invoice font asset hash mismatch: '+name);
    await writeFile(path,bytes);
  }
}
console.log('Tax invoice font and OFL license ready');
