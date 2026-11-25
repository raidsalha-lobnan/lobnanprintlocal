import {saveReportPdf} from './reportPdfEngine';
/** Only locally generated report windows receive the desktop print permission. */
export function openReportPrintWindow(): Window | null {
  const name='lobnan-print-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  return window.open('',name);
}

/** Install the generated HTML and wait for its actual fonts/images, not a
 * possibly already-fired popup load event. The visible print button remains
 * available if the operator cancels the native print dialog. */
export function writeAndPrintReport(popup:Window,markup:string):void{
 popup.document.open();
 popup.document.write(markup);
 popup.document.close();
 attachReportPdfAction(popup);
 const doc=popup.document;
 let printed=false;
 const print=()=>{
  if(printed||popup.closed)return;
  printed=true;popup.focus();popup.print();
 };
 const settled=Array.from(doc.images).map(img=>img.complete?Promise.resolve():new Promise<void>(resolve=>{
  img.addEventListener('load',()=>resolve(),{once:true});
  img.addEventListener('error',()=>resolve(),{once:true});
 }));
 const ready=Promise.allSettled([doc.fonts?.ready,...settled]);
 void Promise.race([ready,new Promise<void>(resolve=>window.setTimeout(resolve,15000))])
  .then(()=>{if(!popup.closed)window.setTimeout(print,100);});
}

/** The parent app owns the compiler; the isolated generated window only
 * exposes the document and local save button. No popup preload is needed. */
export function attachReportPdfAction(popup:Window,selector='body'):void{
 const doc=popup.document;
 const toolbar=doc.querySelector<HTMLElement>('.print-controls,.actions,.toolbar');
 if(!toolbar||toolbar.querySelector('[data-pdf-action]'))return;
 const old=toolbar.querySelector('button');
 if(old)old.textContent='طباعة';
 const save=doc.createElement('button');
 save.type='button';save.textContent='حفظ PDF';save.dataset.pdfAction='true';
 save.addEventListener('click',async()=>{
  if(save.disabled)return;
  save.disabled=true;save.textContent='جارٍ إنشاء PDF…';
  try{
   const root=doc.querySelector<HTMLElement>(selector);
   if(!root||!root.children.length)throw Error('لم تكتمل معاينة التقرير.');
   await saveReportPdf(root,{filename:doc.title||'تقرير محاسبي',numberPages:true});
  }catch(error){popup.alert('تعذّر حفظ PDF: '+(error instanceof Error?error.message:String(error)));}
  finally{save.disabled=false;save.textContent='حفظ PDF';}
 });
 toolbar.appendChild(save);
}
