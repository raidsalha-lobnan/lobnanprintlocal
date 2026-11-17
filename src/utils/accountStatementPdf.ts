import {captureOfficialPrintSurface} from './captureOfficialPrintSurface';

const cleanFilePart=(value:string):string=>
  String(value||'').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,' ')
    .replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');

export const pdfStatementDate=(value:string):string=>{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match?`${match[3]}-${match[2]}-${match[1]}`:value;
};

export interface StatementPdfFileNameInput {
  primaryName:string;
  secondaryName?:string;
  fromDate?:string;
  toDate?:string;
  /** Today's local date in YYYY-MM-DD; passed explicitly in tests. */
  today?:string;
  kind?:'party'|'employee';
}

/**
 * Browser-safe Arabic PDF filename:
 * كشف حساب تفصيلي - العميل الرئيسي - العميل الثاني - من ... إلى ....pdf
 * The word "فرعي" is never appended to the secondary name.
 */
export function accountStatementPdfFilename(input:StatementPdfFileNameInput):string{
  const name=cleanFilePart(input.primaryName)||'بدون اسم';
  const secondary=cleanFilePart(input.secondaryName||'');
  const localToday=input.today||[
    new Date().getFullYear(),
    String(new Date().getMonth()+1).padStart(2,'0'),
    String(new Date().getDate()).padStart(2,'0')
  ].join('-');
  const from=input.fromDate?pdfStatementDate(input.fromDate):'بداية التعامل';
  const to=pdfStatementDate(input.toDate||localToday);
  const label=input.kind==='employee'?'كشف مالي تفصيلي':'كشف حساب تفصيلي';
  const segments=[label,name];
  if(secondary && secondary!==name)segments.push(secondary);
  segments.push(`من ${from} إلى ${to}`);
  // Prevent invalid Windows filenames and very long file paths.
  const clean=segments.map(cleanFilePart).filter(Boolean).join(' - ').slice(0,190).trim();
  return `${clean}.pdf`;
}

/** Fail with a useful, non-technical message rather than an incomplete PDF. */
export function explainStatementPdfError(error:unknown):string{
  const code=error instanceof Error?error.message:String(error);
  if(/STATEMENT_PDF_IMAGE_|OFFICIAL_REPORT_IMAGE_/.test(code)){
    return 'تعذّر تضمين إحدى صور الترويسة أو صور بنود الفاتورة في PDF. لم يتم تنزيل كشف ناقص. تحقق من أن الصور تظهر في الكشف، ثم أعد المحاولة. ويمكنك استخدام «طباعة التقرير» إذا كان مصدر الصور يمنع تصديرها مباشرة.';
  }
  if(/OFFICIAL_REPORT_TOO_MANY_PAGES|OFFICIAL_REPORT_INVALID_LENGTH/.test(code)){
    return 'الكشف كبير جداً للتصدير المباشر إلى PDF في المتصفح. حدّد فترة أقصر أو استخدم «طباعة التقرير» دون تعديل بيانات الحساب.';
  }
  return 'تعذّر تجهيز نسخة PDF مطابقة للترويسة والجداول والصور. لم تتغير البيانات المحاسبية. يُرجى إعادة المحاولة أو استخدام «طباعة التقرير».';
}

/**
 * Canvas exporters render screen CSS. Reapply the application's existing
 * @media print rules ONLY to this captured copy (not to the live page).
 */
function splitCssSelectorList(input:string):string[]{
  const out:string[]=[];
  let depth=0,start=0,quote='';
  for(let i=0;i<input.length;i++){
    const char=input[i];
    if(quote){
      if(char===quote&&input[i-1]!=='\\')quote='';
    }else if(char==='"'||char==="'"){quote=char;}
    else if(char==='('||char==='['){depth++;}
    else if(char===')'||char===']'){depth--;}
    else if(char===','&&depth===0){
      out.push(input.slice(start,i).trim());start=i+1;
    }
  }
  out.push(input.slice(start).trim());
  return out.filter(Boolean);
}

function scopedStatementPrintCss():string {
  const result:string[]=[];
  const visit=(rules:CSSRuleList,printContext=false)=>{
    for(const rule of Array.from(rules)){
      if(rule.type===CSSRule.MEDIA_RULE){
        const media=rule as CSSMediaRule;
        const condition=media.conditionText;
        if(/\bprint\b/i.test(condition)&&!/\bnot\s+print\b/i.test(condition)){
          visit(media.cssRules,true);
        }else if(printContext&&/\ball\b/i.test(condition)){
          visit(media.cssRules,true);
        }
      }else if(printContext&&rule.type===CSSRule.STYLE_RULE){
        const style=rule as CSSStyleRule;
        const scoped=splitCssSelectorList(style.selectorText).flatMap(selector=>[
          '[data-statement-pdf] '+selector,
          '[data-statement-pdf]'+selector
        ]);
        if(scoped.length)result.push(scoped.join(',')+'{'+style.style.cssText+'}');
      }else if(printContext&&'cssRules' in rule){
        const group=rule as CSSGroupingRule;
        if(group.cssRules)visit(group.cssRules,true);
      }
    }
  };
  for(const sheet of Array.from(document.styleSheets)){
    try{visit(sheet.cssRules);}catch{
      // Third-party stylesheets are not accessible. The application CSS is.
    }
  }
  return result.join('\n');
}

async function waitForOriginalImage(image:HTMLImageElement):Promise<void>{
  if(!image.complete){
    await Promise.race([
      image.decode().catch(()=>{}),
      new Promise<void>(resolve=>setTimeout(resolve,9000))
    ]);
  }
  if(!image.complete||image.naturalWidth<1||image.naturalHeight<1){
    throw new Error('STATEMENT_PDF_IMAGE_UNAVAILABLE');
  }
}

/**
 * cloneNode copies image URLs but NOT decoded bitmaps. Make local data-image
 * snapshots of the live loaded images (header, signatures and attachments).
 * Fail closed if a photo cannot be embedded rather than shipping a broken PDF.
 */
async function copyLoadedReportImages(source:HTMLElement,target:HTMLElement):Promise<void>{
  const sourceImages=Array.from(source.querySelectorAll<HTMLImageElement>('img'));
  const targetImages=Array.from(target.querySelectorAll<HTMLImageElement>('img'));
  if(sourceImages.length!==targetImages.length)throw new Error('STATEMENT_PDF_IMAGE_COUNT_CHANGED');
  const cache=new Map<string,string>();
  for(let i=0;i<sourceImages.length;i++){
    const image=sourceImages[i],clone=targetImages[i];
    await waitForOriginalImage(image);
    const key=image.currentSrc||image.src;
    const isHeader=Boolean(image.closest('[data-component="print-header"]'));
    const maxPixels=isHeader?1800:720;
    const cacheKey=key+':'+maxPixels;
    let data=cache.get(cacheKey);
    if(!data){
      const scale=Math.min(1,maxPixels/Math.max(image.naturalWidth,image.naturalHeight));
      const bitmap=document.createElement('canvas');
      bitmap.width=Math.max(1,Math.round(image.naturalWidth*scale));
      bitmap.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=bitmap.getContext('2d');
      if(!context)throw new Error('STATEMENT_PDF_IMAGE_CANVAS_UNAVAILABLE');
      context.drawImage(image,0,0,bitmap.width,bitmap.height);
      try{
        data=bitmap.toDataURL('image/png');
      }catch{
        throw new Error('STATEMENT_PDF_IMAGE_CORS_BLOCKED');
      }finally{
        bitmap.width=0;bitmap.height=0;
      }
      cache.set(cacheKey,data);
    }
    clone.src=data;
    clone.removeAttribute('srcset');
    await clone.decode().catch(()=>{
      throw new Error('STATEMENT_PDF_IMAGE_EMBED_FAILED');
    });
    if(clone.naturalWidth<1)throw new Error('STATEMENT_PDF_IMAGE_EMBED_FAILED');
  }
}

/** Same approved financial report and print styles; no independent markup. */
export async function downloadAccountStatementPdf(
  report:HTMLElement,
  filename:string
):Promise<void>{
  if(!report.isConnected)throw new Error('STATEMENT_PDF_REPORT_NOT_MOUNTED');
  const safeName=cleanFilePart(filename.replace(/\.pdf$/i,''))+'.pdf';
  const holder=document.createElement('div');
  holder.setAttribute('aria-hidden','true');
  holder.style.cssText='position:fixed;left:0;top:0;width:748px;background:white;z-index:-2147483647;pointer-events:none;';
  holder.dir='rtl';
  const printStyles=document.createElement('style');
  printStyles.textContent=scopedStatementPrintCss();
  const copy=report.cloneNode(true) as HTMLElement;
  copy.dir='rtl';
  copy.dataset.statementPdf='true';
  copy.style.cssText='width:748px;min-width:748px;max-width:748px;max-height:none;height:auto;overflow:visible;box-sizing:border-box;background:white;margin:0;';
  holder.appendChild(printStyles);
  holder.appendChild(copy);
  document.body.appendChild(holder);
  try{
    await copyLoadedReportImages(report,copy);
    const blob=await captureOfficialPrintSurface(copy);
    if(blob.type!=='application/pdf'||!blob.size||blob.size>100_000_000)
      throw new Error('STATEMENT_PDF_EMPTY_OR_INVALID');
    const url=URL.createObjectURL(blob);
    try{
      const anchor=document.createElement('a');
      anchor.href=url;
      anchor.download=safeName;
      anchor.style.display='none';
      document.body.appendChild(anchor);
      try{anchor.click();}
      finally{anchor.remove();}
    }finally{
      setTimeout(()=>URL.revokeObjectURL(url),60_000);
    }
  }finally{
    holder.remove();
  }
}
