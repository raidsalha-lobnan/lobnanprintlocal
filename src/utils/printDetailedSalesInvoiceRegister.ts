import { REPORT_TYPOGRAPHY_CSS } from './reportTypography';
import { renderBusinessReportHeader } from './reportBusinessHeader';
import type { BusinessSettings, Invoice, Treasury } from '../types';
import { formatDateDisplay } from './dateUtils';

export interface DetailedSalesReportOptions {
  companyName: string;
  settings: BusinessSettings;
  periodLabel: string;
  invoiceTypeLabel: string;
  searchLabel: string;
  customerName: (invoice: Invoice) => string;
  categoryName?: (invoice: Invoice) => string;
  treasuries: Treasury[];
}

const escapeHtml = (value: unknown): string => String(value ?? '').replace(
  /[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c)
);
const number = (value: unknown): number => {
  const result=Number(value ?? 0);
  return Number.isFinite(result)?result:0;
};
const money = (value: unknown): string => number(value).toLocaleString('en-US',{
  minimumFractionDigits:2,maximumFractionDigits:2,
});
const quantity = (value: unknown): string => number(value).toLocaleString('en-US',{
  maximumFractionDigits:4,
});
const dimension = (value: unknown): string =>
  value === null || value === undefined || value === '' ? '—' : quantity(value);
const currencyFor = (invoice: Invoice) => {
  const code=String(invoice.currency || 'ILS');
  const symbol=String(invoice.currencySymbol || (code==='ILS'?'₪':code));
  return {code,symbol: symbol==='?' && code==='ILS'?'₪':symbol};
};
const joinPieces = (...items: Array<string | null | undefined>): string =>
  items.filter(Boolean).map(x=>'<span>'+escapeHtml(x)+'</span>').join('<span class="separator">|</span>');

export interface InvoicePaymentRow {
  kind: 'cash' | 'bank' | 'credit' | 'other';
  account: string;
  note: string;
  amount: number;
  currency: string;
}
const treasuryName = (code: string | undefined, treasuries: Treasury[]): string => {
  if(!code) return '';
  const found=treasuries.find(t=>t.accountCode===code || t.id===code);
  return found?.name || code;
};
export function invoicePaymentRows(invoice: Invoice, treasuries: Treasury[]): InvoicePaymentRow[] {
  const paid=number(invoice.paidAmount);
  const unpaid=number(invoice.remainingAmount ?? (number(invoice.totalAmount)-paid));
  let cash=number(invoice.cashPaidAmount);
  let bank=number(invoice.bankPaidAmount);
  const method=invoice.paymentMethod;
  // Older invoices may have a payment method but no separate cash/bank amounts.
  if(cash===0 && bank===0 && paid>0) {
    if(method==='card' || method==='bank_transfer') bank=paid;
    else if(method==='cash') cash=paid;
  }
  const rows: InvoicePaymentRow[]=[];
  const symbol=currencyFor(invoice).symbol;
  const commonNote=String(invoice.paymentNotes || '').trim();
  if(cash>0.005) rows.push({
    kind:'cash',account:treasuryName(invoice.cashTreasuryCode || invoice.treasuryAccountCode,treasuries),
    note:bank>0.005?'':commonNote,amount:cash,currency:symbol,
  });
  if(bank>0.005) rows.push({
    kind:'bank',account:treasuryName(invoice.bankTreasuryCode || invoice.treasuryAccountCode,treasuries),
    note:commonNote,amount:bank,currency:symbol,
  });
  const difference=paid-cash-bank;
  if(difference>0.015) rows.push({
    kind:'other',account:'دفعة مسجلة',note:rows.length?'':commonNote,
    amount:difference,currency:symbol,
  });
  if(unpaid>0.005) rows.push({
    kind:'credit',account:'آجل',note:rows.length?'':commonNote,
    amount:unpaid,currency:symbol,
  });
  if(rows.length===0 && commonNote) rows.push({
    kind:'other',account:'ملاحظة السداد',note:commonNote,amount:0,currency:symbol,
  });
  return rows;
}

const paymentRowHtml = (row:InvoicePaymentRow):string => {
  // A bank payment is only: account name | payment note | amount.
  // Do not add "طريقة الدفع" or "الصندوق" labels.
  const first=row.kind==='cash' ? ['نقدي',row.account] :
    row.kind==='bank' ? [row.account] :
    row.kind==='credit' ? ['آجل'] : [row.account];
  const pieces=[...first,row.note,money(row.amount)+' '+row.currency].filter(Boolean);
  return '<span class="payment-entry'+(row.kind==='bank'?' bank-entry':'')+'">'+
    joinPieces(...pieces)+'</span>';
};
const invoiceKind = (invoice: Invoice):string =>
  invoice.type==='pos'?'نقطة بيع':invoice.type==='print_order'?'أمر طباعة':'فاتورة بيع';

const noteFor = (item:Invoice['items'][number]):string => {
  const notes=[item.description,item.notes,item.dimensions ? 'الأبعاد: '+item.dimensions : '']
    .map(s=>String(s||'').trim()).filter(Boolean);
  return [...new Set(notes)].join(' | ');
};
const cols = [
  '3%','10%','41%','3.5%','3.5%','3.5%','5%','7%','5%','5%','13.5%',
];
const linesTableHeader =
  '<colgroup>'+cols.map(width=>'<col style="width:'+width+'">').join('')+'</colgroup>'+
  '<thead><tr><th>#</th><th>كود الصنف</th><th>الصنف / الملاحظات</th>'+
  '<th>الطول</th><th>العرض</th><th>العدد</th><th>الكمية</th>'+
  '<th>سعر الوحدة</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead>';

function invoiceMarkup(invoice:Invoice,index:number,options:DetailedSalesReportOptions):string {
  const symbol=currencyFor(invoice).symbol;
  const rows=(invoice.items||[]).length?(invoice.items||[]).map((item,i)=>{
    const note=noteFor(item);
    return '<tr><td>'+escapeHtml(i+1)+'</td><td class="sku">'+escapeHtml(item.itemCode || item.itemId || '—')+
      '</td><td class="item-cell"><b>'+escapeHtml(item.itemName || '—')+'</b>'+
      (note?'<span class="item-note"> — '+escapeHtml(note)+'</span>':'')+'</td>'+
      '<td class="num">'+escapeHtml(dimension(item.length))+'</td>'+
      '<td class="num">'+escapeHtml(dimension(item.width))+'</td>'+
      '<td class="num">'+escapeHtml(dimension(item.count))+'</td>'+
      '<td class="num">'+quantity(item.quantity)+'</td>'+
      '<td class="num">'+money(item.unitPrice)+'</td>'+
      '<td class="num">'+money(item.discount)+'</td>'+
      '<td class="num">'+money(item.tax)+'</td>'+
      '<td class="num strong">'+money(item.total)+'</td></tr>';
  }).join(''):'<tr><td colspan="11">لا توجد بنود محفوظة</td></tr>';
  const totals=[
    ['قبل الخصم',invoice.subtotal],['الخصم',invoice.discountTotal],
    ['الضريبة',invoice.taxAmount],
    ...(number(invoice.additionalCharges)!==0?[['إضافات',invoice.additionalCharges] as [string,number]]:[]),
    ['الإجمالي',invoice.totalAmount],['المدفوع',invoice.paidAmount],
    ['المتبقي',invoice.remainingAmount??(number(invoice.totalAmount)-number(invoice.paidAmount))],
  ].map(([label,value])=>'<span>'+escapeHtml(label)+': <b dir="ltr">'+money(value)+' '+escapeHtml(symbol)+'</b></span>').join('');
  const otherMeta=joinPieces('النوع: '+invoiceKind(invoice),
    invoice.warehouse?'المخزن: '+invoice.warehouse:null,
    options.categoryName?.(invoice)?'التصنيف: '+options.categoryName(invoice):null);
  const payment=invoicePaymentRows(invoice,options.treasuries);
  const split=payment.length>1;
  const note=String(invoice.notes||'').trim();
  return [
    '<article class="invoice">',
    '<div class="invoice-heading"><strong>فاتورة '+escapeHtml(index+1)+' / <bdi>'+escapeHtml(invoice.invoiceNumber)+'</bdi></strong>',
    '<span>التاريخ: '+escapeHtml(formatDateDisplay(invoice.date))+'</span>',
    '<span class="customer">العميل: '+escapeHtml(options.customerName(invoice))+'</span></div>',
    '<table class="lines">'+linesTableHeader+'<tbody>'+rows+'</tbody></table>',
    '<div class="invoice-tail">',
    '<div class="invoice-totals">'+totals+'</div>',
    note?'<div class="document-note">ملاحظة الفاتورة: '+escapeHtml(note)+'</div>':'',
    '<div class="invoice-meta">'+otherMeta+
       (!split && payment.length?
         '<span class="separator">|</span>'+paymentRowHtml(payment[0]):'')+
    '</div>',
    split?'<div class="payment-splits">'+payment.map(row=>
      '<div class="split-row">'+paymentRowHtml(row)+'</div>').join('')+'</div>':'',
    '</div></article>',
  ].join('');
}

const pagerJs = [
"(function(){",
"  'use strict';",
"  const pages=document.getElementById('pages');",
"  const invoiceTemplate=document.getElementById('invoice-sources');",
"  const intro=document.getElementById('report-intro');",
"  let body=null;",
"  const fits=()=>body.scrollHeight<=body.clientHeight+1;",
"  function newPage(){",
"    const sheet=document.createElement('div');sheet.className='sheet';",
"    body=document.createElement('div');body.className='page-body';",
"    const foot=document.createElement('div');foot.className='page-footer';",
"    sheet.appendChild(body);sheet.appendChild(foot);pages.appendChild(sheet);",
"    if(pages.children.length>1){",
"      const compact=document.createElement('div');compact.className='continuation-head';",
"      compact.textContent='كشف تفصيلي لفواتير المبيعات — متابعة';",
"      body.appendChild(compact);",
"    }",
"    return body;",
"  }",
"  function startPart(original,continued){",
"    const part=document.createElement('article');part.className='invoice invoice-fragment';",
"    const heading=original.querySelector('.invoice-heading').cloneNode(true);",
"    if(continued){",
"      const badge=document.createElement('span');badge.className='continued';badge.textContent='(متابعة)';",
"      heading.appendChild(badge);",
"    }",
"    part.appendChild(heading);",
"    const table=original.querySelector('.lines').cloneNode(false);",
"    table.appendChild(original.querySelector('colgroup').cloneNode(true));",
"    table.appendChild(original.querySelector('thead').cloneNode(true));",
"    const tbody=document.createElement('tbody');table.appendChild(tbody);part.appendChild(table);",
"    body.appendChild(part);return {part,tbody};",
"  }",
"  function appendInvoice(original){",
"    const full=original.cloneNode(true);body.appendChild(full);",
"    if(fits())return;",
"    full.remove();",
"    const allRows=Array.from(original.querySelectorAll('.lines tbody tr'));",
"    let current=startPart(original,false);",
"    let written=0;",
"    for(const row of allRows){",
"      current.tbody.appendChild(row.cloneNode(true));",
"      if(!fits()){",
"        current.tbody.lastElementChild.remove();",
"        if(current.tbody.children.length===0){current.part.remove();}",
"        newPage();current=startPart(original,written>0);",
"        current.tbody.appendChild(row.cloneNode(true));",
"      }",
"      written++;",
"    }",
"    const tail=original.querySelector('.invoice-tail').cloneNode(true);",
"    current.part.appendChild(tail);",
"    if(!fits()){",
"      tail.remove();",
"      const last=current.tbody.lastElementChild;",
"      if(last){",
"        const row=last.cloneNode(true);last.remove();",
"        if(current.tbody.children.length===0)current.part.remove();",
"        newPage();current=startPart(original,written>1);",
"        current.tbody.appendChild(row);current.part.appendChild(tail);",
"        if(!fits()){",
"          tail.remove();",
"          newPage();current=startPart(original,true);current.part.appendChild(tail);",
"        }",
"      }else{",
"        current.part.remove();newPage();current=startPart(original,written>0);current.part.appendChild(tail);",
"      }",
"    }",
"  }",
"  function paginate(){",
"    pages.innerHTML='';newPage();",
"    body.appendChild(intro.content.firstElementChild.cloneNode(true));",
"    const originals=Array.from(invoiceTemplate.content.querySelectorAll('.invoice'));",
"    for(const item of originals)appendInvoice(item);",
"    const total=pages.children.length;",
"    Array.from(pages.children).forEach((sheet,i)=>{",
"      sheet.querySelector('.page-footer').textContent='صفحة '+(i+1)+' من '+total;",
"    });",
"    const count=document.getElementById('pages-count');",
"    if(count)count.textContent=total+' صفحة A4';",
"  }",
"  function waitForImages(){",
"    const images=Array.from(pages.querySelectorAll('img'));",
"    return Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{",
"      const timeout=setTimeout(resolve,5000);",
"      const done=()=>{clearTimeout(timeout);resolve();};",
"      img.addEventListener('load',done,{once:true});",
"      img.addEventListener('error',done,{once:true});",
"    })));",
"  }",
"  window.addEventListener('load',()=>{",
"    Promise.resolve(document.fonts?document.fonts.ready:undefined).then(()=>{",
"      paginate();",
"      return waitForImages();",
"    }).then(()=>setTimeout(()=>window.print(),180));",
"  });",
"})();",
].join('\n');

const css = [
  '@page {size: A4 portrait; margin: 0;}',
  '*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}',
  'html{background:#e9eef5;} body{margin:0;color:#142947;font:9pt/1.27 Tahoma,Arial,sans-serif;}',
  '.print-controls{position:sticky;top:0;z-index:10;display:flex;gap:12px;align-items:center;justify-content:center;padding:8px;background:#e5ecf5;}',
  '.print-controls button{background:#134777;color:white;border:0;border-radius:5px;padding:8px 15px;font-weight:bold;cursor:pointer;}',
  '#pages{padding:6px 0 18px;}',
  '.sheet{width:210mm;height:297mm;max-height:297mm;margin:8px auto;padding:7.5mm 8mm;background:#fff;box-shadow:0 4px 20px #aab8c9;overflow:hidden;}',
  '.page-body{height:276mm;min-height:276mm;max-height:276mm;display:flow-root;}',
  '.page-footer{height:6mm;line-height:6mm;border-top:1px solid #225781;color:#1c4771;text-align:center;font-size:8pt;font-weight:700;}',
  '.business-letterhead{margin-bottom:2mm;width:100%;}',
  '.business-letterhead img{display:block;width:100%;height:25mm;object-fit:contain;object-position:center;}',
  '.business-standard{display:flex;direction:rtl;align-items:center;gap:3mm;min-height:23mm;margin-bottom:2mm;border-bottom:1px solid #2b608d;padding-bottom:1mm;}',
  '.business-logo{height:20mm;width:20mm;object-fit:contain;}',
  '.business-identity{display:flex;flex-direction:column;min-width:0;flex:1;}',
  '.business-identity strong{font-size:13.5pt;color:#103e6b;}',
  '.business-identity small{font-size:7.5pt;color:#435a72;}',
  '.business-contact{display:flex;flex-direction:column;gap:1mm;max-width:42%;font-size:7pt;color:#253d5a;}',
  'h1{margin:1mm 0 2mm;color:#123e67;text-align:center;font-size:15pt;}',
  'h2{margin:2mm 0 1mm;font-size:9pt;color:#123d65;}',
  '.criteria{display:flex;flex-wrap:wrap;align-items:center;gap:1mm 3mm;font-size:8pt;padding:0 0 2mm;border-bottom:1px solid #1b5284;}',
  '.summary,.lines{border-collapse:collapse;direction:rtl;width:100%;table-layout:fixed;}',
  '.summary th,.summary td{padding:1.2mm 1mm;text-align:center;border:1px solid #adbed1;font-size:8pt;}',
  '.summary th{color:#173c66;background:#eef4fb;font-weight:700;}',
  '.summary td{font-weight:600;}',
  '.report-intro{margin-bottom:1.8mm;}',
  '.report-subtitle{margin-bottom:1mm;}',
  '.invoice{border:1px solid #315d8a;border-radius:2px;margin:0;padding:0;break-inside:auto;page-break-inside:auto;}',
  '.invoice+.invoice{border-top:0;}',
  '.invoice-heading{display:flex;align-items:center;gap:1.5mm 5mm;flex-wrap:wrap;background:#123f72!important;color:white;padding:1.8mm 2.4mm;min-height:7mm;break-after:avoid;page-break-after:avoid;}',
  '.invoice-heading strong{font-size:9pt;white-space:nowrap;}',
  '.invoice-heading span{font-size:8pt;}.invoice-heading .customer{flex:1;min-width:30mm;}',
  '.invoice-heading .continued{margin-right:auto;opacity:.8;}',
  '.lines th,.lines td{border:1px solid #a9bdcf;padding:.75mm .55mm;text-align:center;vertical-align:middle;font-size:7.15pt;line-height:1.18;background:white!important;}',
  '.lines th{font-weight:700;color:#16436c;font-size:7pt;overflow-wrap:normal;}',
  '.lines td{overflow-wrap:anywhere;}',
  '.lines tr{break-inside:avoid;page-break-inside:avoid;}',
  '.lines .sku{direction:ltr;font-size:6.9pt;white-space:nowrap;}',
  '.lines .item-cell{text-align:right;font-size:7.5pt;line-height:1.2;}',
  '.item-note{font-size:7.1pt;font-weight:normal;color:#374b65;}',
  '.lines .num{direction:ltr;font-size:7pt;white-space:nowrap;font-variant-numeric:tabular-nums;}',
  '.strong{font-weight:700;color:#133d66;}',
  '.invoice-tail{padding:1mm 2mm;background:white!important;break-inside:avoid;page-break-inside:avoid;}',
  '.invoice-totals{display:flex;flex-wrap:wrap;gap:1mm 2.5mm;align-items:center;justify-content:space-between;padding:1mm 0;border-top:1px solid #9cb6cf;border-bottom:1px solid #b6c7d8;font-size:7.2pt;}',
  '.invoice-totals span{white-space:nowrap;}.invoice-totals b{font-variant-numeric:tabular-nums;}',
  '.invoice-meta{display:flex;align-items:center;flex-wrap:wrap;gap:1mm 1.5mm;min-height:5mm;padding:.9mm 0;font-size:7.25pt;}',
  '.invoice-meta>span{white-space:nowrap;}',
  '.separator{margin:0 1mm;color:#6685a5;}',
  '.payment-entry{display:inline-flex;flex-wrap:wrap;gap:.2mm;align-items:center;}',
  '.payment-entry>span{white-space:nowrap;}',
  '.payment-splits{border-top:1px solid #dbe4ee;padding-top:.6mm;}',
  '.split-row{display:flex;justify-content:flex-start;padding:.6mm 0;font-size:7.2pt;}',
  '.split-row+.split-row{border-top:1px dotted #d6e1ee;}',
  '.document-note{font-size:7pt;border-top:1px solid #d4deea;padding:.7mm 0;white-space:pre-wrap;}',
  '.continuation-head{font-size:8pt;font-weight:700;color:#2b5279;border-bottom:1px solid #aac0d5;padding-bottom:1mm;margin-bottom:1mm;}',
  '@media print{html,body{background:#fff!important;}#pages{padding:0}.sheet{border:0;box-shadow:none;margin:0;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.print-controls{display:none!important;}}',
].join('\n');

export function buildDetailedSalesReportHtml(invoices: Invoice[], options: DetailedSalesReportOptions): string {
  const grouped=new Map<string,{code:string;symbol:string;count:number;total:number;paid:number;balance:number;discount:number;tax:number}>();
  for(const invoice of invoices) {
    const {code,symbol}=currencyFor(invoice);
    const row=grouped.get(code)||{code,symbol,count:0,total:0,paid:0,balance:0,discount:0,tax:0};
    row.count++;
    row.total+=number(invoice.totalAmount);
    row.paid+=number(invoice.paidAmount);
    row.balance+=number(invoice.remainingAmount??(number(invoice.totalAmount)-number(invoice.paidAmount)));
    row.discount+=number(invoice.discountTotal);
    row.tax+=number(invoice.taxAmount);
    grouped.set(code,row);
  }
  const summaryRows=[...grouped.values()].map(row=>
    '<tr><td>'+escapeHtml(row.code)+'</td><td>'+row.count+'</td><td>'+
    money(row.total)+' '+escapeHtml(row.symbol)+'</td><td>'+
    money(row.paid)+' '+escapeHtml(row.symbol)+'</td><td>'+
    money(row.balance)+' '+escapeHtml(row.symbol)+'</td><td>'+
    money(row.discount)+' '+escapeHtml(row.symbol)+'</td><td>'+
    money(row.tax)+' '+escapeHtml(row.symbol)+'</td></tr>'
  ).join('');
  const intro=[
    '<div class="report-intro">',
    renderBusinessReportHeader(options.settings),
    '<h1>كشف تفصيلي لفواتير المبيعات</h1>',
    '<div class="criteria">',
    '<span><b>الفترة:</b> '+escapeHtml(options.periodLabel)+'</span>',
    '<span><b>نوع الفواتير:</b> '+escapeHtml(options.invoiceTypeLabel)+'</span>',
    options.searchLabel?'<span><b>البحث:</b> '+escapeHtml(options.searchLabel)+'</span>':'',
    '<span><b>العدد:</b> '+invoices.length+'</span>',
    '<span><b>تاريخ طباعة الكشف:</b> '+escapeHtml(new Date().toLocaleString('ar-EG'))+'</span>',
    '</div><h2>إجماليات حسب العملة</h2>',
    '<table class="summary"><thead><tr><th>العملة</th><th>عدد الفواتير</th>',
    '<th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الخصومات</th><th>الضرائب</th></tr></thead>',
    '<tbody>'+summaryRows+'</tbody></table>',
    '</div>'
  ].join('');
  const reports=invoices.map((invoice,i)=>invoiceMarkup(invoice,i,options)).join('');
  return [
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>كشف تفصيلي لفواتير المبيعات</title>',
    '<style>',REPORT_TYPOGRAPHY_CSS,css,'</style></head><body>',
    '<div class="print-controls"><button type="button" onclick="window.print()">طباعة الكشف / حفظ PDF</button>',
    '<span>معاينة A4 عمودي — <b id="pages-count">جارٍ تجهيز الصفحات</b></span></div>',
    '<main id="pages"></main>',
    '<template id="report-intro">',intro,'</template>',
    '<template id="invoice-sources">',reports,'</template>',
    '<script>',pagerJs,'</script>',
    '</body></html>',
  ].join('');
}

/** Read-only report: never touches posting, stock, payments or original invoice values. */
export function printDetailedSalesInvoiceRegister(
  invoices:Invoice[],options:DetailedSalesReportOptions,
):boolean {
  if(!invoices.length)return false;
  const popup=window.open('','_blank');
  if(!popup){
    window.alert('تعذّر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.');
    return false;
  }
  popup.document.open();
  popup.document.write(buildDetailedSalesReportHtml(invoices,options));
  popup.document.close();
  return true;
}
