import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {build} from 'vite';
const require=createRequire(import.meta.url);
const dir=fs.mkdtempSync(path.join(process.cwd(),'.typst-smoke-'));
try{
 fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body><section id="report"></section><script type="module" src="./fixture.ts"></script></body></html>');
 fs.writeFileSync(path.join(dir,'fixture.ts'),`
 import {renderReportPdf,buildReportPdfDocument} from '../src/utils/reportPdfEngine';
 (async()=>{
  const root=document.getElementById('report')!;
  root.innerHTML='<h1>كشف حساب تجريبي</h1><p>العميل: أحمد محمد</p><table><thead><tr><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead><tbody>'+Array.from({length:140},(_,i)=>'<tr><td>فاتورة رقم '+(i+1)+'</td><td>125.50</td><td>0.00</td></tr>').join('')+'</tbody></table>';
  const canvas=document.createElement('canvas');canvas.width=100;canvas.height=50;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#123456';ctx.fillRect(0,0,100,50);
  const img=document.createElement('img');img.src=canvas.toDataURL('image/png');root.prepend(img);await img.decode();
  const options={filename:'smoke',paper:'a4' as const,numberPages:true};
  const doc=await buildReportPdfDocument(root,options);
  if(!doc.source.includes('125.50')||!doc.source.includes('أحمد محمد')||doc.assets.length!==1)throw Error('SOURCE_CONTENT_MISSING');
  const pdf=await renderReportPdf(root,options);
  if(pdf.type!=='application/pdf'||pdf.size<1000)throw Error('INVALID_PDF');
  (window as any).__typstSmokeResult={ok:true,bytes:pdf.size};
 })().catch(e=>{(window as any).__typstSmokeResult={ok:false,error:String(e?.stack||e)};});
 `);
 await build({configFile:false,root:dir,base:'./',logLevel:'warn',build:{outDir:'out',target:'es2022'}});
 const main=path.join(dir,'run.cjs');
 fs.writeFileSync(main,`
 const {app,BrowserWindow}=require('electron');
 app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});
  try{
   await w.loadFile(require('node:path').join(__dirname,'out','index.html'));
   const until=Date.now()+90000;
   while(Date.now()<until){
    const result=await w.webContents.executeJavaScript('window.__typstSmokeResult||null');
    if(result){console.log(JSON.stringify(result));app.exit(result.ok?0:1);return;}
    await new Promise(r=>setTimeout(r,250));
   }
   throw Error('TYPST_SMOKE_TIMEOUT');
  }catch(e){console.error(e);app.exit(1);}
 }).catch(e=>{console.error(e);app.exit(1);});
 `);
 const result=spawnSync(require('electron'),[main],{stdio:'inherit',timeout:120000,env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 if(result.error||result.status!==0)throw Error('TYPST_PDF_SMOKE_FAILED: '+(result.error||result.status));
 console.log('LOCAL_ARABIC_TYPST_PDF_SMOKE_OK');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
