import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {build} from 'vite';
const require=createRequire(import.meta.url);
const dir=fs.mkdtempSync(path.join(process.cwd(),'.print-pdf-smoke-'));
try{
 fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><body><main><aside>NOT PART OF REPORT</aside><section id="report"><h1>كشف حساب عربي</h1><p>125.50</p></section></main><script type="module" src="./fixture.ts"></script></body></html>');
 fs.writeFileSync(path.join(dir,'fixture.ts'),[
  "import {scopeOriginalPrint} from '../src/utils/reportPdfEngine';",
  "const report=document.getElementById('report')!;",
  "let active:ReturnType<typeof scopeOriginalPrint>|undefined;",
  "(window as any).prepare=(landscape:boolean)=>{",
  " active?.restore();document.getElementById('fixture-css')?.remove();",
  " const style=document.createElement('style');style.id='fixture-css';",
  " style.textContent='@page fixture { size: A4 '+(landscape?'landscape':'portrait')+'; margin: 8mm 6mm; } @media print { #report {page: fixture} }';document.head.appendChild(style);",
  " active=scopeOriginalPrint(report);",
  " return {excluded:document.querySelector('aside')?.getAttribute('data-lobnan-pdf-exclude'),title:report.querySelector('h1')?.textContent};",
  "};",
  "(window as any).restore=()=>{active?.restore();return !document.querySelector('[data-lobnan-pdf-active]')&&!document.querySelector('[data-lobnan-pdf-exclude]');};"
 ].join('\n'));
 await build({configFile:false,root:dir,base:'./',logLevel:'warn',build:{outDir:'out',target:'es2022'}});
 const main=path.join(dir,'run.cjs');
 fs.writeFileSync(main,[
 "const {app,BrowserWindow}=require('electron');",
 "const assert=require('node:assert/strict');",
 "app.whenReady().then(async()=>{",
 " const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});",
 " try{",
 "  await w.loadFile(require('node:path').join(__dirname,'out','index.html'));",
 "  for(const landscape of [false,true]){",
 "   const result=await w.webContents.executeJavaScript('window.prepare('+landscape+')');",
 "   assert.equal(result.excluded,'true');assert.equal(result.title,'كشف حساب عربي');",
 "   const pdf=await w.webContents.printToPDF({pageSize:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,scale:1});",
 "   assert.equal(pdf.subarray(0,5).toString(),'%PDF-');",
 "   const sizes=[...pdf.toString('latin1').matchAll(/\\/MediaBox\\s*\\[\\s*0\\s+0\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\]/g)];",
 "   assert.ok(sizes.length,'PDF page size missing');",
 "   for(const [,width,height] of sizes){assert.ok(Math.abs(Number(width)-(landscape?842:595))<3);assert.ok(Math.abs(Number(height)-(landscape?595:842))<3);}",
 "   assert.equal(await w.webContents.executeJavaScript('window.restore()'),true);",
 "  }",
 "  console.log('ORIGINAL_PRINT_PDF_SMOKE_OK');app.exit(0);",
 " }catch(e){console.error(e);app.exit(1);}",
 "}).catch(e=>{console.error(e);app.exit(1);});"
 ].join('\n'));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(require('electron'),[main],{stdio:'inherit',timeout:120000,env});
 if(result.error||result.status!==0)throw Error('ORIGINAL_PRINT_PDF_SMOKE_FAILED: '+(result.error||result.status));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
