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
