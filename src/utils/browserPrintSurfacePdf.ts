import {authHeaders,getCurrentSessionToken,publicSyncApiUrl} from '../services/secureAuth';

type PrintNode=string|{tag:string;attrs:Record<string,string>;children:PrintNode[]};
const omit='[data-lobnan-pdf-exclude],script,style,link,iframe,object,embed,meta,base,template,noscript,.print\\:hidden,.no-print,[data-no-print="true"],[data-pdf-action]';
const safeTags=new Set('body main section article header footer aside div span p h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr th td colgroup col br hr b strong i em small label ul ol li dl dt dd figure figcaption address pre code sup sub input textarea select option img svg g path rect circle ellipse line polyline polygon text tspan defs clippath lineargradient radialgradient stop use symbol title desc a form button'.split(' '));
const imgData=/^data:image\/(?:png|jpeg|gif|webp);base64,/i;
function asData(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('PRINT_IMAGE_READ_FAILED'));r.readAsDataURL(blob);});
}
async function inlineImage(img:HTMLImageElement):Promise<string>{
 const url=img.currentSrc||img.src;
 if(imgData.test(url))return url;
 if(!img.naturalWidth||!img.naturalHeight)throw Error('لم تكتمل إحدى صور المستند.');
 try{
  const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(res.ok){
   const blob=await res.blob();
   if(/^image\/(png|jpeg|gif|webp)$/i.test(blob.type)&&blob.size<=24_000_000)return await asData(blob);
  }
 }catch{}
 // Normalize only the individual image, never the page.
 if(img.naturalWidth*img.naturalHeight>40_000_000)throw Error('PRINT_IMAGE_TOO_LARGE');
 const canvas=img.ownerDocument.createElement('canvas');
 canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
 try{const ctx=canvas.getContext('2d');if(!ctx)throw Error('PRINT_IMAGE_CONTEXT');ctx.drawImage(img,0,0);return canvas.toDataURL('image/png');}
 finally{canvas.width=0;canvas.height=0;}
}
export async function buildBrowserPrintSnapshot(doc:Document){
 const css:string[]=[];
 for(const sheet of Array.from(doc.styleSheets)){
  if(sheet.disabled)continue;
  try{
   const rules=Array.from(sheet.cssRules).map(rule=>rule.cssText).join('\n');
   const media=sheet.media.mediaText;
   css.push(media&&media!=='all'?'@media '+media+' {\n'+rules+'\n}':rules);
  }catch{
   // Browser extensions sometimes insert inaccessible stylesheets. They are
   // not part of the application print template and must not block export.
   if(sheet.href && /^(chrome-extension|moz-extension|safari-web-extension):/i.test(sheet.href))continue;
   throw Error('تعذّر قراءة تنسيق الطباعة الأصلي. حدّث الصفحة ثم أعد المحاولة، أو استخدم طباعة التقرير.');
  }
 }
 for(const sheet of doc.adoptedStyleSheets||[])css.push(Array.from(sheet.cssRules).map(rule=>rule.cssText).join('\n'));
 const imageCache=new Map<string,Promise<string>>();
 let nodes=0;
 const visit=async(node:Node):Promise<PrintNode|null>=>{
  if(++nodes>150000)throw Error('PRINT_TREE_LIMIT');
  if(node.nodeType===3)return node.nodeValue||'';
  if(node.nodeType!==1)return null;
  const el=node as Element;
  if(el.matches(omit))return null;
  const raw=el.localName.toLowerCase();
  if(raw==='input'&&['password','file','hidden'].includes((el as HTMLInputElement).type))return null;
  const tag=raw==='canvas'?'img':safeTags.has(raw)?raw:'span';
  const attrs:Record<string,string>={};
  for(const attr of Array.from(el.attributes)){
   if(/^on/i.test(attr.name)||/^(src|srcset|action|formaction|target|ping|integrity|nonce)$/i.test(attr.name))continue;
   if(/^(href|xlink:href)$/i.test(attr.name)&&!(raw==='use'&&attr.value.startsWith('#')))continue;
   attrs[attr.name]=attr.value;
  }
  if(raw==='img'){
   const img=el as HTMLImageElement,key=img.currentSrc||img.src;
   if(!imageCache.has(key))imageCache.set(key,inlineImage(img));
   attrs.src=await imageCache.get(key)!;
  }else if(raw==='canvas'){
   const canvas=el as HTMLCanvasElement;
   attrs.src=canvas.toDataURL('image/png');attrs.width=String(canvas.width);attrs.height=String(canvas.height);
  }else if(raw==='input'){
   const input=el as HTMLInputElement;attrs.value=input.value;
   if(input.checked)attrs.checked='';else delete attrs.checked;
  }else if(raw==='option'){
   if((el as HTMLOptionElement).selected)attrs.selected='';else delete attrs.selected;
  }
  const children:PrintNode[]=[];
  if(raw==='textarea')children.push((el as HTMLTextAreaElement).value);
  else for(const child of Array.from(el.childNodes)){
   const result=await visit(child);if(result!==null)children.push(result);
  }
  return {tag,attrs,children};
 };
 const tree=await visit(doc.body);
 if(!tree||typeof tree==='string')throw Error('PRINT_SURFACE_MISSING');
 // Retain html class and inline style for inherited theme/custom properties.
 const htmlAttrs={class:doc.documentElement.className,style:doc.documentElement.getAttribute('style')||'',dir:doc.documentElement.dir||'rtl',lang:doc.documentElement.lang||'ar'};
 return {tree,css:css.join('\n'),htmlAttrs};
}
export async function renderBrowserPrintPdf(doc:Document):Promise<Uint8Array>{
 const token=getCurrentSessionToken();
 if(!token)throw Error('يرجى تسجيل الدخول قبل حفظ PDF من المتصفح.');
 if(!navigator.onLine)throw Error('الحفظ المباشر من المتصفح يحتاج اتصالًا بخادم البرنامج.');
 const api=publicSyncApiUrl();
 const snapshot=await buildBrowserPrintSnapshot(doc);
 const body=JSON.stringify(snapshot);
 if(new Blob([body]).size>64_000_000)throw Error('حجم المستند يتجاوز الحد المسموح للحفظ.');
 const response=await fetch(api+'/api/v1/reports/print-surface-pdf',{
  method:'POST',cache:'no-store',signal:AbortSignal.timeout(120000),
  headers:{...authHeaders(api,token),'Content-Type':'application/json','Accept':'application/pdf'},
  body
 });
 if(!response.ok){
  if(response.status===404)throw Error('خدمة الحفظ المباشر تحتاج تحديث الخادم المحلي.');
  if(response.status===401||response.status===403)throw Error('جلسة الدخول أو صلاحية الحفظ غير متاحة.');
  if(response.status===429)throw Error('الخادم منشغل بإنشاء PDF آخر. أعد المحاولة.');
  throw Error('تعذّر إنشاء PDF من قالب الطباعة ('+response.status+').');
 }
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<100||bytes.length>150_000_000||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('PRINT_PDF_INVALID');
 return bytes;
}
