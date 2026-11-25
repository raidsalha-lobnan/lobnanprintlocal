/**
 * Central local Typst PDF exporter. The DOM supplies already-calculated,
 * filtered document values. No financial mutations, server call, screenshot of
 * the document, browser print dialog or second set of accounting calculations.
 */
export type PdfPaper='a4'|'a4-landscape'|'a5-landscape'|'thermal';
export type ReportPdfOptions={filename:string;paper?:PdfPaper;compact?:boolean;numberPages?:boolean};
export type PdfAsset={path:string;bytes:Uint8Array};
export type PdfDocument={source:string;assets:PdfAsset[]};
const quote=(value:string)=>JSON.stringify(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''));
const text=(value:string)=>'#text('+quote(value)+')';
const skip='script,style,template,button,input,select,textarea,.print\\:hidden,.no-print,.books-no-print,.print-controls,.actions,.toolbar,[data-pdf-ignore],[aria-hidden="true"]';
const blockTags=new Set(['DIV','SECTION','ARTICLE','HEADER','FOOTER','P','H1','H2','H3','H4','H5','H6','MAIN','LI','UL','OL','FIGURE','FIGCAPTION','ADDRESS']);
function css(el:Element){return el.ownerDocument.defaultView?.getComputedStyle(el);}
function excluded(el:Element){
 if(el.matches(skip))return true;
 if(el.matches('.sales-preview-page-hidden,[data-receipt-print-copy],.print-only,.print\\:block'))return false;
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
    const value=await children(cell,true);
    const align=css(cell)?.textAlign;
    const a=align==='center'?'center':align==='left'?'left':'right';
    const hasDetails=!!cell.querySelector('table,img');
    const opts='colspan: '+cell.colSpan+', rowspan: '+Math.max(1,cell.rowSpan)+', align: '+a+', breakable: '+(hasDetails?'true':'false');
    dest.push('table.cell('+opts+(isHeader?', fill: rgb("#e7edf4")':'')+')['+(isHeader?'#text(weight: "bold")['+value+']':value)+']');
   }
  }
  const args=[...head.length?['table.header('+head.join(',')+')']:[],...body];
  return '\n\n#table(columns: ('+weights.map(w=>w.toFixed(3)+'fr').join(',')+',), inset: 2.4pt, stroke: 0.35pt + rgb("#bac6d3"), '+args.join(',\n')+')\n\n';
 };
 async function render(node:Node,insideCell=false):Promise<string>{
  active();
  if(node.nodeType===3){
   const raw=node.nodeValue||'';
   const value=raw.replace(/[ \t\r\n]+/g,' ');
   if(value.trim())semanticCount++;
   return value?text(value):'';
  }
  if(node.nodeType!==1)return '';
  const el=node as HTMLElement;
  if(excluded(el))return '';
  const tag=el.tagName.toUpperCase();
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
  let value=await children(el,insideCell);
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
export async function saveReportPdf(root:HTMLElement,options:ReportPdfOptions):Promise<void>{
 const blob=await renderReportPdf(root,options);
 const name=(options.filename||'مستند').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\.pdf$/i,'')+'.pdf';
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function requirePdfRoot(selector:string,scope:ParentNode=document):HTMLElement{
 const roots=Array.from(scope.querySelectorAll<HTMLElement>(selector));
 const root=roots.at(-1);
 if(!root)throw Error('لا يوجد تقرير أو مستند مفتوح للحفظ.');
 return root;
}
