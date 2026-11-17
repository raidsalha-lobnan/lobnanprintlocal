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

/**
 * Capture the *existing* detailed statement component (including the
 * approved company letterhead, Arabic rows and invoice item details).
 * A detached, off-screen copy avoids changing the interactive cashier
 * page or opening the browser's print/Save As workflow.
 */
export async function downloadAccountStatementPdf(
  report:HTMLElement,
  filename:string
):Promise<void>{
  if(!report.isConnected)throw new Error('STATEMENT_PDF_REPORT_NOT_MOUNTED');
  const safeName=cleanFilePart(filename.replace(/\.pdf$/i,''))+'.pdf';
  const holder=document.createElement('div');
  holder.setAttribute('aria-hidden','true');
  holder.style.cssText='position:fixed;left:-12000px;top:0;width:794px;background:white;z-index:-1;pointer-events:none;';
  const copy=report.cloneNode(true) as HTMLElement;
  copy.style.cssText='width:794px;max-width:none;max-height:none;height:auto;overflow:visible;box-sizing:border-box;background:white;';
  holder.appendChild(copy);
  document.body.appendChild(holder);
  try{
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
      // The browser may still be reading the blob asynchronously after click.
      setTimeout(()=>URL.revokeObjectURL(url),60_000);
    }
  }finally{
    holder.remove();
  }
}
