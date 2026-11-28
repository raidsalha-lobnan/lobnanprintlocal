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
  ['Lemonada-OFL.txt','720cfd1cd78a066bcd7e46a56aa87acdd79fc30a',casualBase+'OFL.txt'],
  ['Katibeh-Regular.ttf','b073fab20efe9f5657d52120f559bd3c5dd8b489','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/katibeh/Katibeh-Regular.ttf'],
  ['Katibeh-OFL.txt','6642b740190e560e61f48dabe15deaec31c7075b','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/katibeh/OFL.txt'],
  ['Lateef-Regular.ttf','a81a714200f8afe903aa0a9b53fd3aed1c700174','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/lateef/Lateef-Regular.ttf'],
  ['Lateef-OFL.txt','4799a032ad91e0351c94ffc3795b6a5945e9b5c9','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/lateef/OFL.txt'],
  ['PlaypenSansArabic.ttf','4f807c64e77fef2dd45b8b3c26b5d867fcd86d5c','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/playpensansarabic/PlaypenSansArabic%5Bwght%5D.ttf'],
  ['PlaypenSansArabic-OFL.txt','b4b34da590f5717c2c2d9c00ef63574bcc0bf31e','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/playpensansarabic/OFL.txt'],
  ['Mikhak-Light.ttf','f0e85eb928f9719402159435546407827e149a11','https://raw.githubusercontent.com/aminabedi68/Mikhak/9dea055eb3dfc752879442224460c6e5d6ebe232/fonts/ttf/Mikhak-Light.ttf'],
  ['Mikhak-OFL.txt','fd34f9640eefffa6cd629d09115ac310745d0c39','https://raw.githubusercontent.com/aminabedi68/Mikhak/9dea055eb3dfc752879442224460c6e5d6ebe232/OFL.txt'],
  ['Marhey.ttf','b54afeaefdac874cae1952efe3a9e47906907179','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/marhey/Marhey%5Bwght%5D.ttf'],
  ['Marhey-OFL.txt','d4683065ab49e7067d25d48e5cd2ddc27b3aa193','https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl/marhey/OFL.txt']
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
