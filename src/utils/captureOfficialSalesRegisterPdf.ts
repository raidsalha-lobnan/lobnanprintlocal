import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/** Captures the program's original, paginated A4 sales register HTML.
 * Unlike browser print this does not open a dialog in another Telegram user's PC.
 */
export async function captureOfficialSalesRegisterPdf(html:string):Promise<Blob>{
  const deadline=Date.now()+85000;
  const check=()=>{if(Date.now()>deadline)throw new Error('OFFICIAL_SALES_RENDER_TIMEOUT');};
  const frame=document.createElement('iframe');
  frame.style.cssText='position:fixed;left:-15000px;top:0;width:850px;height:1200px;border:0;pointer-events:none;';
  frame.setAttribute('aria-hidden','true');
  document.body.appendChild(frame);
  try{
    const doc=frame.contentDocument;
    if(!doc)throw new Error('OFFICIAL_SALES_FRAME_UNAVAILABLE');
    doc.open();doc.write(html);doc.close();
    const started=Date.now();
    while(doc.documentElement?.dataset.printReady!=='true'){
      if(Date.now()-started>16000)throw new Error('OFFICIAL_SALES_PAGES_NOT_READY');
      await new Promise(r=>setTimeout(r,100));
    }
    const sheets=Array.from(doc.querySelectorAll<HTMLElement>('#pages .sheet'));
    if(!sheets.length||sheets.length>250)throw new Error('OFFICIAL_SALES_INVALID_PAGE_COUNT');
    const pdf=new jsPDF('p','mm','a4');
    for(let i=0;i<sheets.length;i++){
      check();
      const rendering=html2canvas(sheets[i],{
        scale:1.7,useCORS:true,allowTaint:false,backgroundColor:'#fff',logging:false,
        width:sheets[i].offsetWidth,height:sheets[i].offsetHeight,
        windowWidth:850,scrollX:0,scrollY:0
      });
      const canvas=await new Promise<HTMLCanvasElement>((resolve,reject)=>{
        const remaining=Math.max(1,Math.min(30000,deadline-Date.now()));
        const timer=setTimeout(()=>reject(new Error('OFFICIAL_SALES_RENDER_TIMEOUT')),remaining);
        rendering.then(result=>{clearTimeout(timer);resolve(result);},
          error=>{clearTimeout(timer);reject(error);});
      });
      check();
      if(i)pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',.95),'JPEG',0,0,210,297);
      canvas.width=0;canvas.height=0;
    }
    return pdf.output('blob');
  }finally{frame.remove();}
}
