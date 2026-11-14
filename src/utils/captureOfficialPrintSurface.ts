import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Capture an existing application print surface as an A4 PDF.
 * No independent Telegram markup or accounting calculations are involved.
 */
export async function captureOfficialPrintSurface(root: HTMLElement):Promise<Blob>{
  if(!root.isConnected)throw new Error('OFFICIAL_REPORT_NOT_MOUNTED');
  const width=Math.ceil(Math.max(root.scrollWidth,root.getBoundingClientRect().width));
  if(width<400||width>3000)throw new Error('OFFICIAL_REPORT_INVALID_WIDTH');
  if(document.fonts?.ready){
    await Promise.race([document.fonts.ready,new Promise<void>(r=>setTimeout(r,6000))]);
  }
  const images=Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(images.map(async(img)=>{
    if(img.complete)return;
    await Promise.race([
      new Promise<void>(resolve=>{
        img.addEventListener('load',()=>resolve(),{once:true});
        img.addEventListener('error',()=>resolve(),{once:true});
      }),
      new Promise<void>(resolve=>setTimeout(resolve,6000))
    ]);
  }));
  const height=Math.ceil(Math.max(root.scrollHeight,root.getBoundingClientRect().height));
  if(height<50||height>160000)throw new Error('OFFICIAL_REPORT_INVALID_LENGTH');
  const pdf=new jsPDF('p','mm','a4');
  const pageWidth=210,pageHeight=297;
  const marginLeft=6,marginTop=6,marginBottom=6,contentWidth=pageWidth-12;
  const maxPx=Math.floor(width*(pageHeight-marginTop-marginBottom)/contentWidth);
  const top=root.getBoundingClientRect().top;
  const suggestedBreaks=Array.from(root.querySelectorAll('tr,.invoice-heading'))
    .map(el=>Math.round(el.getBoundingClientRect().bottom-top))
    .filter(p=>p>0&&p<height).sort((a,b)=>a-b);
  let start=0,pageIndex=0;
  while(start<height){
    if(pageIndex>200)throw new Error('OFFICIAL_REPORT_TOO_MANY_PAGES');
    let end=Math.min(height,start+maxPx);
    if(end<height){
      // Prefer cutting BETWEEN invoice/table rows instead of through text.
      const safe=suggestedBreaks.filter(n=>n<=end&&n>start+maxPx*.72).at(-1);
      if(safe)end=safe;
    }
    const chunkHeight=end-start;
    if(chunkHeight<=0)throw new Error('OFFICIAL_REPORT_PAGINATION_ERROR');
    const canvas=await html2canvas(root,{
      backgroundColor:'#ffffff',useCORS:true,allowTaint:false,
      logging:false,scale:1.8,width,height:chunkHeight,
      x:0,y:start,scrollX:0,scrollY:0,
      windowWidth:width,windowHeight:Math.max(1200,chunkHeight),
    });
    if(pageIndex>0)pdf.addPage();
    const image=canvas.toDataURL('image/jpeg',.94);
    pdf.addImage(image,'JPEG',marginLeft,marginTop,
      contentWidth,chunkHeight*contentWidth/width);
    canvas.width=0;canvas.height=0;
    start=end;pageIndex++;
  }
  return pdf.output('blob');
}
