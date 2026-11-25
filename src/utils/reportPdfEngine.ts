/**
 * Central local Typst PDF exporter. The DOM supplies already-calculated,
 * filtered document values. No financial mutations, server call, screenshot of
 * the document, browser print dialog or second set of accounting calculations.
 */
export type PdfPaper='a4'|'a4-landscape'|'a5-landscape'|'thermal';
export type ReportPdfOptions={filename:string;paper?:PdfPaper;compact?:boolean;numberPages?:boolean;includeFormValues?:boolean};
export type PdfAsset={path:string;bytes:Uint8Array};
export type PdfDocument={source:string;assets:PdfAsset[]};
const quote=(value:string)=>JSON.stringify(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''));
const text=(value:string)=>'#text('+quote(value)+')';
const skip='script,style,template,button,.print\\:hidden,.no-print,.books-no-print,.books-screen-only,.print-controls,.actions,.toolbar,[data-pdf-ignore],[aria-hidden="true"]';
const blockTags=new Set(['DIV','SECTION','ARTICLE','HEADER','FOOTER','P','H1','H2','H3','H4','H5','H6','MAIN','LI','UL','OL','FIGURE','FIGCAPTION','ADDRESS']);
function css(el:Element){return el.ownerDocument.defaultView?.getComputedStyle(el);}
function excluded(el:Element){
 if(el.matches(skip))return true;
 if(el.matches('.sales-preview-page-hidden,[data-receipt-print-copy],.print-only,.books-print-only,.print\\:block'))return false;
 // Ignore explicitly hidden elements, not descendants of a print-only page.
 return el.hasAttribute('hidden')||css(el)?.display==='none';
}
function styleText(value:string,el:Element){
 const style=css(el);const weight=Number(style?.fontWeight)||0;
 const bold=/^(B|STRONG|TH|H[1-6])$/.test(el.tagName)||weight>=600;
 const size=/^H[1-2]$/.test(el.tagName)?'13pt':/^H[3-6]$/.test(el.tagName)?'11pt':null;
 if(!bold&&!size)return value;
 return '#text('+(bold?'weight: "bold", ':'')+(size?'size: '+size+', ':'')+')['+value+']';
}
async function imageBytes(el:HTMLImageElement):Promise<{bytes:Uint8Array;ext:string}>{
 if(!el.complete||!el.naturalWidth){
  await Promise.race([el.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,10000))]);
 }
 if(!el.complete||!el.naturalWidth)throw Error('تعذّر تحميل إحدى صور التقرير. أعد المحاولة بعد اكتمال الصور.');
 const url=el.currentSrc||el.src;
 // Embed original encoded bytes where possible (no whole-document raster).
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(response.ok){
   const b=new Uint8Array(await response.arrayBuffer());
   if(b.length>30_000_000)throw Error('IMAGE_TOO_LARGE');
   if(b[0]===0xff&&b[1]===0xd8)return {bytes:b,ext:'jpg'};
   if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return {bytes:b,ext:'png'};
   if(b[0]===71&&b[1]===73&&b[2]===70)return {bytes:b,ext:'gif'};
   if(b[0]===82&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80)return {bytes:b,ext:'webp'};
  }
 }catch{}
 // Unsupported image encoding or a loaded image with no fetch access:
 // normalize the individual image only, never text or entire pages.
 const c=el.ownerDocument.createElement('canvas');
 c.width=el.naturalWidth;c.height=el.naturalHeight;
 if(c.width*c.height>40_000_000)throw Error('صورة كبيرة جدًا للحفظ الآمن.');
 const ctx=c.getContext('2d');if(!ctx)throw Error('PDF_IMAGE_CONTEXT_UNAVAILABLE');
 ctx.drawImage(el,0,0);
 const blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/png'));
 c.width=0;c.height=0;
 if(!blob)throw Error('PDF_IMAGE_ENCODING_FAILED');
 return {bytes:new Uint8Array(await blob.arrayBuffer()),ext:'png'};
}
function paperSetup(options:ReportPdfOptions){
 const size=options.paper||'a4';
 const dims=size==='a4-landscape'?'width: 297mm, height: 210mm':size==='a5-landscape'?'width: 210mm, height: 148mm':size==='thermal'?'width: 80mm, height: auto':'width: 210mm, height: 297mm';
 const margin=size==='thermal'?3:options.compact?5:8;
 return '#set page('+dims+', margin: '+margin+'mm'+(options.numberPages&&size!=='thermal'?', numbering: "1"':'')+')\n'+
 '#set text(font: ("Noto Sans Arabic", "Noto Sans"), lang: "ar", dir: rtl, size: '+(size==='thermal'?8:9)+'pt)\n'+
 '#set par(leading: 0.4em, spacing: 0.6em)\n#set align(right)\n';
}
export async function buildReportPdfDocument(root:HTMLElement,options:ReportPdfOptions,signal?:AbortSignal):Promise<PdfDocument>{
 if(!root.isConnected)throw Error('لا يوجد مستند مفتوح للحفظ.');
 const assets:PdfAsset[]=[];
 const cached=new Map<string,PdfAsset>();
 let totalBytes=0,semanticCount=0;
 const active=()=>{if(signal?.aborted)throw Error('PDF_EXPORT_CANCELLED');};
 const asset=(bytes:Uint8Array,ext:string,key?:string)=>{
  if(key&&cached.has(key))return cached.get(key)!;
  totalBytes+=bytes.length;
  if(totalBytes>100_000_000||assets.length>=1500)throw Error('حجم صور المستند يتجاوز الحد الآمن.');
  const result={path:'/report-asset-'+assets.length+'.'+ext,bytes};
  assets.push(result);if(key)cached.set(key,result);return result;
 };
 const children=async(el:Element,insideCell=false)=>{
  let result='';
  for(const child of Array.from(el.childNodes))result+=await render(child,insideCell);
  return result;
 };
 const renderTable=async(table:HTMLTableElement)=>{
  const rows=Array.from(table.rows).filter(row=>!excluded(row)&&!excluded(row.parentElement!));
  const entries=rows.map(row=>({row,cells:Array.from(row.cells).filter(c=>!excluded(c))})).filter(x=>x.cells.length);
  if(!entries.length)return '';
  const columns=Math.max(...entries.map(x=>x.cells.reduce((n,c)=>n+c.colSpan,0)));
  if(columns>40)throw Error('PDF_TABLE_TOO_WIDE');
  const weights=Array.from({length:columns},()=>1);
  const full=entries.find(x=>x.cells.length===columns&&x.cells.every(c=>c.colSpan===1));
  if(full){
   const widths=full.cells.map(c=>c.offsetWidth);
   const sum=widths.reduce((a,b)=>a+b,0);
   if(sum>0)widths.forEach((w,i)=>{weights[i]=Math.max(.35,w/sum*columns);});
  }
  const head:string[]=[],body:string[]=[];
  for(const {row,cells} of entries){
   active();
   const isHeader=row.parentElement?.tagName==='THEAD';
   const dest=isHeader?head:body;
   for(const cell of cells){
    const value=(await children(cell,true)).trim();
    const align=css(cell)?.textAlign;
    const a=align==='center'?'center':align==='left'?'left':'right';
    const hasDetails=!!cell.querySelector('table,img');
    const opts='colspan: '+cell.colSpan+', rowspan: '+Math.max(1,cell.rowSpan)+', align: '+a+', breakable: '+(hasDetails?'true':'false');
    dest.push('table.cell('+opts+(isHeader?', fill: rgb("#e7edf4")':'')+')['+(isHeader?'#text(weight: "bold")['+value+']':value)+']');
   }
  }
  const args=[...(head.length?['table.header('+head.join(',')+')']:[]),...body];
  return '\n\n#table(columns: ('+weights.map(w=>w.toFixed(3)+'fr').join(',')+',), inset: 2.4pt, stroke: 0.35pt + rgb("#bac6d3"), '+args.join(',\n')+')\n\n';
 };
 async function render(node:Node,insideCell=false):Promise<string>{
  active();
  if(node.nodeType===3){
   const raw=node.nodeValue||'';
   const preserve=node.parentElement&&['pre','pre-wrap','break-spaces','pre-line'].includes(css(node.parentElement)?.whiteSpace||'');
   const value=preserve?raw:raw.replace(/[ \t\r\n]+/g,' ');
   if(value.trim())semanticCount++;
   return value?text(value):'';
  }
  if(node.nodeType!==1)return '';
  const el=node as HTMLElement;
  if(excluded(el))return '';
  const tag=el.tagName.toUpperCase();
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'){
   if(!options.includeFormValues)return '';
   if(tag==='SELECT'){
    const control=el as HTMLSelectElement;
    const value=Array.from(control.selectedOptions).map(o=>o.textContent||'').join(' / ');
    if(value.trim())semanticCount++;
    return text(value);
   }
   const control=el as HTMLInputElement|HTMLTextAreaElement;
   if(tag==='INPUT'&&['hidden','password','file','button','submit','reset'].includes((control as HTMLInputElement).type))return '';
   const input=control as HTMLInputElement;
   const value=tag==='INPUT'&&['checkbox','radio'].includes(input.type)?(input.checked?'✓':''):control.value;
   if(value.trim())semanticCount++;
   return text(value);
  }
  if(tag==='BR')return '#linebreak()';
  if(tag==='TABLE')return renderTable(el as HTMLTableElement);
  if(tag==='IMG'){
   const img=el as HTMLImageElement;const key=img.currentSrc||img.src;
   if(!key)throw Error('PDF_IMAGE_SOURCE_MISSING');
   let file=cached.get(key);
   if(!file){const data=await imageBytes(img);file=asset(data.bytes,data.ext,key);}
   const width=img.offsetWidth||img.naturalWidth;
   const parentWidth=img.parentElement?.clientWidth||root.clientWidth||760;
   const percent=Math.round(Math.max(12,Math.min(100,width/parentWidth*100)));
   return '#image('+quote(file.path)+', width: '+percent+'%, height: auto, fit: "contain")';
  }
  if(tag==='SVG'){
   // Ignore decorative UI icons; retain document barcodes and QR images.
   if(el.classList.contains('lucide')||el.getAttribute('aria-hidden')==='true')return '';
   const clone=el.cloneNode(true) as Element;
   clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
   const file=asset(new TextEncoder().encode(new XMLSerializer().serializeToString(clone)),'svg');
   return '#image('+quote(file.path)+', width: 25mm)';
  }
  if(tag==='CANVAS'){
   const c=el as HTMLCanvasElement;
   const blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/png'));
   if(!blob)throw Error('PDF_BARCODE_ENCODING_FAILED');
   const file=asset(new Uint8Array(await blob.arrayBuffer()),'png');
   return '#image('+quote(file.path)+', width: 30mm)';
  }
  let value='';
  const computed=css(el);
  const elems=Array.from(el.children).filter(child=>!excluded(child));
  const onlyElements=Array.from(el.childNodes).every(child=>child.nodeType!==3||!child.nodeValue?.trim());
  // Preserve compact horizontal metadata/total bands and the title/date/number
  // row, rather than placing every label on its own line. Large tables stay in
  // the normal paginated flow.
  const grid=onlyElements&&elems.length>=2&&elems.length<=6&&!elems.some(c=>c.matches('table')||c.querySelector('table'))&&
    (computed?.display==='grid'||(computed?.display==='flex'&&computed.flexDirection==='row'&&computed.flexWrap!=='wrap'));
  if(grid){
   const parts:string[]=[];const widths:number[]=[];
   for(const child of elems){
    const part=(await render(child,insideCell)).trim();
    if(part){parts.push(part);widths.push(Math.max(1,(child as HTMLElement).offsetWidth||1));}
   }
   if(parts.length>=2){
    const total=widths.reduce((n,w)=>n+w,0);
    value='#grid(columns: ('+widths.map(w=>Math.max(.5,w/total*parts.length).toFixed(3)+'fr').join(',')+',), gutter: 3pt, '+parts.map(part=>'['+part+']').join(',')+')';
   }else value=parts.join(' ');
  }else value=await children(el,insideCell);
  if(!value.trim())return '';
  value=styleText(value,el);
  if(el.classList.contains('sales-invoice-print-wrap')||el.classList.contains('break-after-page')){
   // Explicit invoice sheets still contain all stored lines, including pages
   // hidden in the current on-screen pager.
   if(el.nextElementSibling)value+='\n#pagebreak()\n';
  }
  if(blockTags.has(tag))return '\n\n'+value+'\n\n';
  return value;
 }
 const source=paperSetup(options)+await children(root);
 if(!semanticCount&&!assets.length)throw Error('المستند فارغ؛ لم يتم إنشاء PDF.');
 if(source.length>12_000_000)throw Error('PDF_DOCUMENT_TOO_LARGE');
 return {source,assets};
}
let queue:Promise<unknown>=Promise.resolve();
export function renderReportPdf(root:HTMLElement,options:ReportPdfOptions,signal?:AbortSignal):Promise<Blob>{
 const work=queue.catch(()=>{}).then(async()=>{
  const doc=await buildReportPdfDocument(root,options,signal);
  if(signal?.aborted)throw Error('PDF_EXPORT_CANCELLED');
  const {compileTypstPdf}=await import('./typstPdfCompiler');
  return compileTypstPdf(doc,signal);
 });
 queue=work;return work;
}
type NativePrintApi={renderPrintPdf?:(request:{windowName?:string})=>Promise<Uint8Array>;isElectron?:boolean};
const nativePrintApi=()=> (globalThis as unknown as {electronAPI?:NativePrintApi}).electronAPI;
let savingPrintDocument=false;

/** Keep the actual mounted print DOM and stylesheet cascade. Only unrelated
 * siblings are removed from print flow. Never flatten or recreate the document. */
function scopeOriginalPrint(root:HTMLElement){
 const doc=root.ownerDocument;
 const surface=root.closest<HTMLElement>('.reports-dashboard,.print-area,.print-modal-container')||root;
 const changes:Array<{el:Element;name:string;old:string|null}>=[];
 const mark=(el:Element,name:string)=>{
  changes.push({el,name,old:el.getAttribute(name)});el.setAttribute(name,'true');
 };
 mark(surface,'data-lobnan-pdf-surface');
 for(let el:Element|null=surface;el&&el!==doc.body;el=el.parentElement){
  const parent:Element|null=el.parentElement;
  if(!parent)break;
  if(parent!==doc.body)mark(parent,'data-lobnan-pdf-ancestor');
  for(const sibling of Array.from(parent.children)){
   if(sibling!==el&&!sibling.matches('style,link,script'))mark(sibling,'data-lobnan-pdf-exclude');
  }
 }
 mark(doc.body,'data-lobnan-pdf-active');
 const style=doc.createElement('style');
 style.textContent='@media print {'+
  'body[data-lobnan-pdf-active] [data-lobnan-pdf-exclude]{display:none!important;}'+
  'body[data-lobnan-pdf-active] [data-lobnan-pdf-ancestor]{display:block!important;visibility:visible!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;transform:none!important;}'+
  'body[data-lobnan-pdf-active] [data-lobnan-pdf-surface]{visibility:visible!important;}'+
  'body[data-lobnan-pdf-active] [data-pdf-action]{display:none!important;}'+
  '}';
 doc.head.appendChild(style);
 const previousTitle=doc.title;
 return {surface,doc,restore:()=>{
  style.remove();doc.title=previousTitle;
  for(const {el,name,old} of changes.reverse())old===null?el.removeAttribute(name):el.setAttribute(name,old);
 }};
}
async function waitOriginalPrintResources(surface:HTMLElement){
 const doc=surface.ownerDocument;
 const timeout=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
 await Promise.race([doc.fonts?.ready||Promise.resolve(),timeout(10000)]);
 const images=Array.from(surface.querySelectorAll<HTMLImageElement>('img')).filter(img=>!img.closest('.print\\:hidden,.no-print,[data-no-print="true"]'));
 // Include images from hidden invoice pages and the second receipt copy.
 await Promise.all(images.map(async img=>{
  if(!img.complete||!img.naturalWidth)await Promise.race([img.decode().catch(()=>{}),timeout(15000)]);
 }));
 if(images.some(img=>!img.complete||!img.naturalWidth))throw Error('لم تكتمل إحدى صور المستند. أعد المحاولة بعد تحميلها.');
}
function downloadOriginalPdf(bytes:Uint8Array,filename:string){
 if(bytes.length<100||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('PRINT_PDF_INVALID');
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
 const a=document.createElement('a');a.href=url;a.download=filename;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
/** Browser clients cannot silently generate a native print PDF. Use the exact
 * original print surface there, rather than silently returning a different layout. */
function openOriginalBrowserPrint(doc:Document):Promise<void>{
 const view=doc.defaultView;
 if(!view)throw Error('PRINT_WINDOW_UNAVAILABLE');
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);view.removeEventListener('afterprint',finish);resolve();};
  const timer=setTimeout(finish,120000);
  view.addEventListener('afterprint',finish,{once:true});
  try{view.focus();view.print();}
  catch(error){clearTimeout(timer);view.removeEventListener('afterprint',finish);reject(error);}
 });
}
/** Physical printing uses the same scoped DOM and original print stylesheet. */
export async function printReportSurface(root:HTMLElement):Promise<void>{
 if(savingPrintDocument)throw Error('هناك مستند قيد الحفظ أو الطباعة حاليًا.');
 if(!root.isConnected)throw Error('لا يوجد مستند مفتوح للطباعة.');
 savingPrintDocument=true;
 let scoped:ReturnType<typeof scopeOriginalPrint>|undefined;
 try{
  scoped=scopeOriginalPrint(root);
  await waitOriginalPrintResources(scoped.surface);
  await openOriginalBrowserPrint(scoped.doc);
 }finally{scoped?.restore();savingPrintDocument=false;}
}
export async function saveReportPdf(root:HTMLElement,options:ReportPdfOptions):Promise<void>{
 if(savingPrintDocument)throw Error('هناك مستند قيد الحفظ حاليًا.');
 if(!root.isConnected)throw Error('لا يوجد مستند مفتوح للحفظ.');
 savingPrintDocument=true;
 const name=(options.filename||'مستند').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\.pdf$/i,'')+'.pdf';
 let scoped:ReturnType<typeof scopeOriginalPrint>|undefined;
 try{
  scoped=scopeOriginalPrint(root);
  await waitOriginalPrintResources(scoped.surface);
  scoped.doc.title=name.replace(/\.pdf$/i,'');
  const api=nativePrintApi();
  if(api?.renderPrintPdf){
   const other=scoped.doc!==document;
   const windowName=other?scoped.doc.defaultView?.name:undefined;
   if(other&&!windowName)throw Error('PRINT_WINDOW_UNAVAILABLE');
   const bytes=await api.renderPrintPdf({windowName});
   downloadOriginalPdf(bytes,name);
  }else if(api?.isElectron){
   throw Error('يرجى تحديث نسخة Windows لتفعيل الحفظ المطابق للطباعة.');
  }else{
   await openOriginalBrowserPrint(scoped.doc);
  }
 }finally{scoped?.restore();savingPrintDocument=false;}
}
export function requirePdfRoot(selector:string,scope:ParentNode=document):HTMLElement{
 const roots=Array.from(scope.querySelectorAll<HTMLElement>(selector));
 const root=roots.at(-1);
 if(!root)throw Error('لا يوجد تقرير أو مستند مفتوح للحفظ.');
 return root;
}
