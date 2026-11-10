import test from 'node:test';
import assert from 'node:assert/strict';
import type {Invoice, BusinessSettings, Treasury} from '../types';
import {buildDetailedSalesReportHtml,invoicePaymentRows} from './printDetailedSalesInvoiceRegister';
import {renderBusinessReportHeader} from './reportBusinessHeader';
import {salesReportPeriod} from './salesReportPeriod';
import {salesReportCustomerName} from './salesReportCustomer';

const settings = {
  businessName:'مطبعة ومكتبة لبنان',businessNameEn:'Lebnan Print',
  logoUrl:'data:image/png;base64,QUJD',phone:'0598820078',
  address:'غزة',currency:'₪',
} as BusinessSettings;
const treasury={id:'bank-1',accountCode:'1102',name:'بنك فلسطين'} as Treasury;
const cashTreasury={id:'cash-1',accountCode:'1101',name:'الصندوق الرئيسي'} as Treasury;
const makeInvoice=(overrides:Partial<Invoice>={}):Invoice=>({
  id:'test-invoice',invoiceNumber:'INV-0105',date:'2026-11-09',
  type:'pos',customerName:'فريق وصال العمل الإنساني',
  items:[
    {itemId:'item-1',itemCode:'PRI-00001',itemName:'مطبوعات جلدية - جلد',
     notes:'المسلم 1180 ابو المسلم',quantity:2,unitPrice:120,total:240,
     length:1,width:1,count:2,discount:0,tax:0},
    {itemId:'item-2',itemCode:'PRI-00008',itemName:'ملصق A4 مطبوع',
     quantity:60,unitPrice:3,total:180,discount:0,tax:0},
  ],
  subtotal:420,discountTotal:0,taxRate:0,taxAmount:0,
  totalAmount:420,paidAmount:0,remainingAmount:420,
  paymentMethod:'credit',status:'unpaid',currency:'ILS',currencySymbol:'₪',
  warehouse:'المستودع الرئيسي',
  ...overrides,
} as Invoice);
const opts = (override:Partial<BusinessSettings>={})=>({
  companyName:'مطبعة ومكتبة لبنان',
  settings:{...settings,...override},
  periodLabel:'من 09/11/2026 إلى 09/11/2026',
  invoiceTypeLabel:'كافة أنواع الفواتير',
  searchLabel:'',
  treasuries:[treasury,cashTreasury],
  categoryName:()=> 'مطبعة',
  customerName:()=> 'الجهة الأساسية / الجهة الفرعية',
});
test('page layout is A4 portrait with actual discrete preview sheets',()=>{
 const html=buildDetailedSalesReportHtml([makeInvoice()],opts());
 assert.match(html,/@page \{size: A4 portrait; margin: 0;\}/);
 assert.match(html,/\.sheet\{width:210mm;height:297mm;/);
 assert.match(html,/id="pages"/);
 assert.match(html,/function paginate\(\)/);
 assert.match(html,/newPage\(\)/);
 assert.match(html,/invoiceTemplate\.content\.querySelectorAll/);
 assert.match(html,/صفحة /);
 assert.match(html,/window\.print\(\)/);
 assert.match(html,/function waitForImages\(\)/);
 assert.match(html,/startPart\(original,written>0\)/);
});
test('official business letterhead supersedes logo and contacts, otherwise uses saved logo',()=>{
 const letterhead='https://example.org/letterhead.jpg';
 const header=renderBusinessReportHeader({...settings,headerImageUrl:letterhead});
 assert.match(header,/business-letterhead/);
 assert.match(header,/example\.org\/letterhead\.jpg/);
 assert.doesNotMatch(header,/business-logo/);
 const fallback=renderBusinessReportHeader({...settings,headerImageUrl:''});
 assert.match(fallback,/business-logo/);
 assert.match(fallback,/مطبعة ومكتبة لبنان/);
 assert.match(fallback,/0598820078/);
 assert.match(fallback,/غزة/);
 assert.doesNotMatch(renderBusinessReportHeader({...settings,headerImageUrl:'javascript:alert(1)'}),/javascript:/);
});
test('one colored invoice heading; table, totals, and payment remain white compact',()=>{
 const html=buildDetailedSalesReportHtml([makeInvoice()],opts());
 const heading=html.indexOf('class="invoice-heading"');
 const rows=html.indexOf('class="lines"');
 const totals=html.indexOf('class="invoice-totals"');
 const meta=html.indexOf('class="invoice-meta"');
 assert.ok(heading>=0 && rows>heading && totals>rows && meta>totals);
 assert.match(html,/invoice-heading\{[^}]+background:#123f72/);
 assert.match(html,/\.invoice-tail\{[^}]+background:white/);
 assert.match(html,/\.lines th,\.lines td\{[^}]+background:white/);
 assert.match(html,/\bwidth:41%/);
 assert.match(html,/\bwidth:7%/);
 assert.match(html,/<b>مطبوعات جلدية - جلد<\/b><span class="item-note"> — المسلم 1180 ابو المسلم<\/span>/);
 assert.doesNotMatch(html,/ملاحظة غير موجودة/);
 assert.doesNotMatch(html,/حالة السداد/);
});
test('bank-only settlement is account, note and amount without redundant captions',()=>{
 const invoice=makeInvoice({
  paidAmount:420,remainingAmount:0,paymentMethod:'bank_transfer',
  bankTreasuryCode:'1102',bankPaidAmount:420,paymentNotes:'حوالة رقم 444',
 });
 const payment=invoicePaymentRows(invoice,[treasury,cashTreasury]);
 assert.deepEqual(payment.map(x=>x.kind),['bank']);
 assert.equal(payment[0].account,'بنك فلسطين');
 const html=buildDetailedSalesReportHtml([invoice],opts());
 const tail=html.slice(html.indexOf('class="invoice-meta"'),html.indexOf('</article>'));
 assert.match(tail,/بنك فلسطين/);
 assert.match(tail,/حوالة رقم 444/);
 assert.match(tail,/420\.00/);
 assert.doesNotMatch(tail,/طريقة الدفع:/);
 assert.doesNotMatch(tail,/الصندوق:/);
 assert.doesNotMatch(tail,/class="payment-splits"/);
});
test('split cash, bank, deferred payments are separate rows, with exact source amounts',()=>{
 const invoice=makeInvoice({
  totalAmount:420,paidAmount:260,remainingAmount:160,
  paymentMethod:'card',cashPaidAmount:100,bankPaidAmount:160,
  cashTreasuryCode:'1101',bankTreasuryCode:'1102',paymentNotes:'مرجع 123',
 });
 const rows=invoicePaymentRows(invoice,[treasury,cashTreasury]);
 assert.deepEqual(rows.map(x=>[x.kind,x.amount]),
  [['cash',100],['bank',160],['credit',160]]);
 const html=buildDetailedSalesReportHtml([invoice],opts());
 const tail=html.slice(html.indexOf('class="payment-splits"'),html.indexOf('</article>'));
 assert.equal((tail.match(/class="split-row"/g)||[]).length,3);
 assert.match(tail,/الصندوق الرئيسي/);
 assert.match(tail,/بنك فلسطين/);
 assert.match(tail,/مرجع 123/);
 assert.match(tail,/آجل/);
});
test('report preserves actual customer hierarchy and escapes untrusted invoice strings',()=>{
 const invoice=makeInvoice({invoiceNumber:'INV-&<>',items:[{
  itemId:'item-1',itemName:'صنف <script>اه',notes:'حوالة & 5',quantity:1,
  unitPrice:1,total:1,discount:0,tax:0
 }]});
 const html=buildDetailedSalesReportHtml([invoice],opts());
 assert.match(html,/الجهة الأساسية \/ الجهة الفرعية/);
 assert.match(html,/صنف &lt;script&gt;اه/);
 assert.match(html,/حوالة &amp; 5/);
 assert.doesNotMatch(html,/صنف <script>/);
});
test('only an actual subordinate customer is formatted as parent / child',()=>{
 const parent={id:'parent',name:'مطبعة خالد - غزة',type:'customer'} as any;
 const child={id:'child',name:'فرع الرمال',isSubCustomer:true,parentPartyId:'parent',type:'customer'} as any;
 const regular=makeInvoice({customerId:'parent',customerName:'مطبعة خالد - غزة'});
 assert.equal(salesReportCustomerName(regular,[parent,child]),'مطبعة خالد - غزة');
 const subordinate=makeInvoice({customerId:'child',customerName:'فرع الرمال'});
 assert.equal(salesReportCustomerName(subordinate,[parent,child]),'مطبعة خالد - غزة / فرع الرمال');
 const explicit=makeInvoice({customerName:'مطبعة خالد',subCustomerName:'جهة فرعية'});
 assert.equal(salesReportCustomerName(explicit,[]),'مطبعة خالد / جهة فرعية');
});
test('period is always From–To; all dates use first and last invoice document dates',()=>{
 const data=[{date:'2026-11-09'},{date:'01/11/2026'},{date:'2026-10-15'}] as Invoice[];
 const all=salesReportPeriod(data,{mode:'all'});
 assert.match(all,/15\/10\/2026/);
 assert.match(all,/09\/11\/2026/);
 const one=salesReportPeriod(data,{mode:'single',singleDate:'2026-11-08'});
 assert.equal((one.match(/08\/11\/2026/g)||[]).length,2);
 const range=salesReportPeriod(data,{mode:'range',dateFrom:'2026-11-01',dateTo:'2026-11-09'});
 assert.match(range,/01\/11\/2026/);
 assert.match(range,/09\/11\/2026/);
});
