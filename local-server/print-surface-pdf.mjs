import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

// Accept only a bounded, inert document tree. No script, frames, links,
// credentials, local files or external network requests are needed.
const tags=new Set('html body main section article header footer aside div span p h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr th td colgroup col br hr b strong i em small label ul ol li dl dt dd figure figcaption address pre code sup sub input textarea select option img svg g path rect circle ellipse line polyline polygon text tspan defs clipPath linearGradient radialGradient stop use symbol title desc'.split(' ').map(x=>x.toLowerCase()));
const voids=new Set(['img','input','br','hr','col']);
const svgNames={clippath:'clipPath',lineargradient:'linearGradient',radialgradient:'radialGradient'};
const attrs=/^(?:id|class|style|dir|lang|role|title|alt|width|height|colspan|rowspan|span|type|value|checked|selected|disabled|readonly|hidden|name|xmlns|viewbox|preserveaspectratio|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|d|points|fill|fill-rule|fill-opacity|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-opacity|opacity|transform|clip-path|offset|stop-color|stop-opacity|gradientunits|gradienttransform|font-size|text-anchor|dominant-baseline|data-[a-z0-9_-]+|aria-[a-z0-9_-]+)$/i;
const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const imageData=/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/i;
export function buildInertPrintHtml(payload){
 if(!payload||typeof payload.css!=='string'||payload.css.length>5_000_000||/<\/style/i.test(payload.css))throw Error('PRINT_CSS_INVALID');
 let count=0;
 const render=(n,depth=0)=>{
  if(++count>150000||depth>100)throw Error('PRINT_TREE_LIMIT');
  if(typeof n==='string')return esc(n);
  if(!n||typeof n!=='object'||typeof n.tag!=='string'||!Array.isArray(n.children)||!n.attrs||typeof n.attrs!=='object')throw Error('PRINT_TREE_INVALID');
  const t=n.tag.toLowerCase();
  if(!tags.has(t))throw Error('PRINT_TAG_INVALID');
  const tag=svgNames[t]||t;
  const pairs=[];
  for(const [k,v] of Object.entries(n.attrs)){
   if(typeof v!=='string')throw Error('PRINT_ATTRIBUTE_INVALID');
   if(k.toLowerCase()==='src'){
    if(t!=='img'||!imageData.test(v))throw Error('PRINT_IMAGE_INVALID');
   }else if(k==='href'||k==='xlink:href'){
    if(t!=='use'||!/^#[\w:.-]+$/.test(v))throw Error('PRINT_REFERENCE_INVALID');
   }else if(!attrs.test(k))continue;
   if(v.length>32_000_000)throw Error('PRINT_ATTRIBUTE_LIMIT');
   pairs.push(' '+k+'="'+esc(v)+'"');
  }
  if(voids.has(t))return '<'+tag+pairs.join('')+'>';
  return '<'+tag+pairs.join('')+'>'+n.children.map(c=>render(c,depth+1)).join('')+'</'+tag+'>';
 };
 const tree=payload.tree;
 if(tree?.tag?.toLowerCase()!=='body')throw Error('PRINT_BODY_REQUIRED');
 const csp="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><style>'+payload.css+'</style></head>'+render(tree)+'</html>';
}
export async function renderPrintSurfacePdf(payload){
 const html=buildInertPrintHtml(payload);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobnan-print-surface-'));
 let child;
 try{
  const chrome=process.env.LOBNAN_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
  child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-component-update','--remote-debugging-pipe','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
  const pending=new Map();let id=0,buffer='';
  let failure=null;
  const fail=err=>{failure=err;for(const p of pending.values()){clearTimeout(p.timer);p.reject(err);}pending.clear();};
  child.once('error',()=>fail(Error('PRINT_CHROME_UNAVAILABLE')));
  child.once('exit',()=>fail(Error('PRINT_CHROME_EXITED')));
  child.stdio[3].on('error',()=>fail(Error('PRINT_CHROME_PIPE_FAILED')));
  child.stdio[4].on('error',()=>fail(Error('PRINT_CHROME_PIPE_FAILED')));
  child.stdio[4].setEncoding('utf8');
  child.stdio[4].on('data',chunk=>{
   buffer+=chunk;
   let boundary;
   while((boundary=buffer.indexOf('\0'))!==-1){
    const raw=buffer.slice(0,boundary);buffer=buffer.slice(boundary+1);
    let msg;try{msg=JSON.parse(raw);}catch{continue;}
    const p=pending.get(msg.id);
    if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error('PRINT_CDP_'+p.method)):p.resolve(msg.result);}
   }
  });
  const send=(method,params={},sessionId)=>{
   if(failure)return Promise.reject(failure);
   return new Promise((resolve,reject)=>{
    const key=++id;
    const timer=setTimeout(()=>{pending.delete(key);reject(Error('PRINT_CDP_TIMEOUT_'+method));},method==='Page.printToPDF'?60000:15000);
    pending.set(key,{resolve,reject,timer,method});
    child.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');
   });
  };
  const {targetInfos}=await send('Target.getTargets');
  const target=targetInfos.find(t=>t.type==='page');
  if(!target)throw Error('PRINT_CHROME_TARGET_MISSING');
  const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const call=(method,params)=>send(method,params,sessionId);
  await call('Page.enable',{});
  await call('Network.enable',{});
  await call('Network.setBlockedURLs',{urls:['http://*','https://*','file://*','ftp://*','ws://*','wss://*']});
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await call('Emulation.setEmulatedMedia',{media:'print'});
  const {frameTree}=await call('Page.getFrameTree',{});
  await call('Page.setDocumentContent',{frameId:frameTree.frame.id,html});
  const result=await call('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,scale:1,paperWidth:210/25.4,paperHeight:297/25.4,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0});
  const pdf=Buffer.from(result.data||'','base64');
  if(pdf.length<100||pdf.length>150_000_000||pdf.subarray(0,5).toString()!=='%PDF-')throw Error('PRINT_PDF_INVALID');
  return pdf;
 }finally{
  if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
 }
}
