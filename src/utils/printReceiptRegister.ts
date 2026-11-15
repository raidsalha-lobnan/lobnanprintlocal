import type {BusinessSettings,PaymentVoucher,Treasury} from '../types';
import {renderBusinessReportHeader} from './reportBusinessHeader';
import {REPORT_TYPOGRAPHY_CSS} from './reportTypography';
import {resolveReceiptRoute,sumReceiptRoutes} from './receiptRouting';

const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]||c));
const money=(v:number)=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const routeName={cash:'نقدًا',bank_transfer:'بنكي',wallet:'محفظة',cheque:'شيك',unknown:'غير محدد'};
export interface ReceiptRegisterOptions {
 settings:BusinessSettings;
 treasuries:Treasury[];
 periodLabel:string;
 methodLabel:string;
 query:string;
}
export function printReceiptRegister(rows:PaymentVoucher[], options:ReceiptRegisterOptions):void {
 const win=window.open('','_blank');
 if(!win)throw new Error('تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
 const totals=sumReceiptRoutes(rows,options.treasuries);
 const currency=String(options.settings.currency||'₪');
 // Original currencies can differ: print every original amount with its own symbol,
 // while summary uses the stored base-currency amount.
 const tr=rows.map((v,i)=>{
  const code=v.treasuryAccountCode||v.accountCode||'';
  const treasury=options.treasuries.find(t=>t.accountCode===code);
  const route=resolveReceiptRoute(v,options.treasuries);
  const who=[v.partyName,v.subCustomerName].filter(Boolean).join(' / ');
  return '<tr><td>'+(i+1)+'</td><td class="ltr">'+esc(v.voucherNumber)+'</td>'+
   '<td class="ltr">'+esc(v.date)+'</td><td>'+esc(who||'—')+'</td>'+
   '<td class="right">'+esc(v.description||'—')+'</td>'+
   '<td>'+esc(routeName[route])+'</td><td>'+esc(treasury?.name||code||'غير معروف')+'</td>'+
   '<td class="right">'+esc(v.paymentNotes||v.transferReference||'—')+'</td>'+
   '<td class="num">'+money(v.amount)+' '+esc(v.currencySymbol||v.currency||currency)+'</td>'+
   '<td class="num">'+money(Number(v.baseAmount??v.amount))+' '+esc(currency)+'</td></tr>';
 }).join('');
 const printed=new Date().toLocaleString('ar-EG');
 const doc='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف سندات القبض</title><style>'+
 REPORT_TYPOGRAPHY_CSS+
 '@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#17324e;background:#fff;font-size:9pt}'+
 '.business-letterhead img{display:block;width:100%;max-height:28mm;object-fit:contain}.business-standard{display:flex;align-items:center;gap:5mm;border-bottom:1px solid #37618a;padding:3mm 0;margin-bottom:3mm}.business-logo{max-width:20mm;max-height:20mm}.business-identity{display:flex;flex-direction:column;flex:1}.business-identity strong{font-size:15pt}.business-contact{display:flex;flex-direction:column;font-size:8pt}'+
 'h1{text-align:center;color:#133d66;margin:4mm 0 2mm;font-size:15pt}.meta{display:flex;flex-wrap:wrap;gap:2mm 7mm;border-bottom:1px solid #9fb4c9;padding-bottom:3mm;margin-bottom:3mm}.summary{display:flex;gap:3mm;flex-wrap:wrap;margin-bottom:4mm}.summary span{background:#edf3fa;border:1px solid #b6c8d9;padding:1.5mm 2.5mm;border-radius:3px}'+
 'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.3pt}th,td{border:1px solid #a9bed2;padding:1.5mm .8mm;text-align:center;vertical-align:middle;overflow-wrap:anywhere}th{background:#e7eff8;color:#123f69}thead{display:table-header-group}tbody tr:nth-child(even){background:#f4f8fd}tr{break-inside:avoid}.right{text-align:right}.num,.ltr{direction:ltr;unicode-bidi:isolate;white-space:nowrap}.num{font-weight:bold}tfoot td{background:#e6eef7;font-weight:bold}'+
 '.footnote{color:#60728b;margin-top:4mm;font-size:8pt}.actions{padding:10px;background:#eaf0f7;text-align:center}.actions button{background:#16518c;color:white;border:0;border-radius:5px;padding:8px 18px;cursor:pointer}@media print{.actions{display:none}thead{display:table-header-group}}'+
 '</style></head><body><div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div>'+
 renderBusinessReportHeader(options.settings)+
 '<h1>كشف تفصيلي لسندات القبض</h1>'+
 '<div class="meta"><span>الفترة: '+esc(options.periodLabel)+'</span><span>طريقة القبض: '+esc(options.methodLabel)+'</span><span>البحث: '+esc(options.query||'الكل')+'</span><span>إعداد: '+esc(printed)+'</span></div>'+
 '<div class="summary"><span>عدد السندات: <b>'+rows.length+'</b></span><span>إجمالي القبض بالعملة الأساسية: <b>'+money(totals.total)+' '+esc(currency)+'</b></span><span>نقدي: <b>'+money(totals.cash)+' '+esc(currency)+'</b></span><span>بنكي / محفظة / شيكات: <b>'+money(totals.noncash)+' '+esc(currency)+'</b></span>'+(totals.unknown?'<span>غير مصنف: <b>'+money(totals.unknown)+' '+esc(currency)+'</b></span>':'')+'</div>'+
 '<table><colgroup><col style="width:3%"><col style="width:9%"><col style="width:8%"><col style="width:14%"><col style="width:17%"><col style="width:7%"><col style="width:12%"><col style="width:12%"><col style="width:9%"><col style="width:9%"></colgroup>'+
 '<thead><tr><th>#</th><th>رقم السند</th><th>التاريخ</th><th>المقبوض منه</th><th>البيان</th><th>الطريقة</th><th>الصندوق / الحساب</th><th>الإيصال / ملاحظة الدفع</th><th>المبلغ الأصلي</th><th>المبلغ الأساسي</th></tr></thead>'+
 '<tbody>'+(tr||'<tr><td colspan="10">لا توجد سندات قبض ضمن معايير التقرير</td></tr>')+'</tbody></table>'+
 '<div class="footnote">ملاحظة: الإجماليات بالعملة الأساسية من القيم المسجلة بالسندات، والمبالغ الأصلية تعرض عملة كل سند. التقرير للقراءة والطباعة ولا ينشئ أي قيد محاسبي.</div>'+
 '</body></html>';
 win.document.open();win.document.write(doc);win.document.close();
 win.addEventListener('load',()=>{win.focus();win.print()},{once:true});
}
