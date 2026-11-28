import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('accounting font fallback is packaged in the same-origin stylesheet',()=>{
 const html=read('index.html');
 const script=read('scripts/prepare-tax-invoice-font.mjs');
 assert.ok(html.includes('%BASE_URL%fonts/tax-invoice/accounting-fonts.css'));
 assert.ok(!html.includes('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic'));
 for(const name of ['Light','Regular','Medium','SemiBold','Bold']) assert.ok(script.includes('IBMPlexSansArabic-'+name+'.ttf'));
 assert.ok(script.includes('data:font/ttf;base64,'));
 assert.ok(script.includes('IBM-Plex-Sans-Arabic-OFL.txt'));
});
test('PDF snapshot ignores inaccessible extension CSS but retains explicit failure for application styles',()=>{
 const source=read('src/utils/browserPrintSurfacePdf.ts');
 assert.ok(source.includes('chrome-extension|moz-extension|safari-web-extension'));
 assert.ok(source.includes('Array.from(sheet.cssRules)'));
 assert.ok(source.includes('تعذّر قراءة تنسيق الطباعة الأصلي'));
});
