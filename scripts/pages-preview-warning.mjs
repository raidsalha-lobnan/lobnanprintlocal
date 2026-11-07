import fs from 'node:fs';
import path from 'node:path';
const indexPath = path.join(process.cwd(), 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('</body>')) throw new Error('Missing closing body tag in built HTML');
const warning = `<div dir="rtl" role="alert" style="position:fixed;top:0;right:0;left:0;z-index:2147483647;padding:9px 12px;background:#841c1c;color:white;font:700 14px Tahoma,Arial,sans-serif;text-align:center;box-shadow:0 2px 8px #0004">معاينة تجريبية فقط — غير متصلة بقاعدة PostgreSQL المعتمدة. لا تدخل فواتير أو بيانات مالية حقيقية هنا.</div>`;
html = html.replace('</body>', warning + '</body>');
fs.writeFileSync(indexPath, html, 'utf8');
console.log('Preview-only warning injected');
