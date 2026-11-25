/** Save the original print document; HTML/CSS are the source of truth.
 * This module never recalculates totals, retypesets or rasterizes pages. */
export type PdfPaper='a4'|'a4-landscape'|'a5-landscape'|'thermal';
export type ReportPdfOptions={filename:string;paper?:PdfPaper;compact?:boolean;numberPages?:boolean;includeFormValues?:boolean};
type NativePrintApi={renderPrintPdf?:(request:{windowName?:string})=>Promise<Uint8Array>;isElectron?:boolean};
const nativePrintApi=()=> (globalThis as unknown as {electronAPI?:NativePrintApi}).electronAPI;
let savingPrintDocument=false;

/** Keep the actual mounted print DOM and stylesheet cascade. Only unrelated
 * siblings are removed from print flow. Never flatten or recreate the document. */
export function scopeOriginalPrint(root:HTMLElement){
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
