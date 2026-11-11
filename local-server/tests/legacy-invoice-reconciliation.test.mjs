import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseLegacyInvoices,auditLegacyInvoicesReadOnly} from '../legacy-invoice-reconciliation.mjs';
const mkInvoice=(id,number,total=61)=>({record_id:id,version:3,value:{
 id,invoiceNumber:number,date:'2026-11-03',isAccountingPosted:true,
 totalAmount:total,baseTotalAmount:total,
 items:[{itemId:'paper',category:'print_raw',quantity:2}]
}});
const journal=(id,invoiceId,type,amount)=>({record_id:id,value:{
 referenceId:invoiceId,referenceType:type,
 lines:[{accountCode:'1201',debit:amount,credit:0},{accountCode:'4101',debit:0,credit:amount}]
}});
test('INV-0055 cannot borrow a differently dated movement sharing a display invoice number',()=>{
 const report=diagnoseLegacyInvoices({
  invoices:[mkInvoice('i55','INV-0055')],
  journals:[],
  movements:[{record_id:'old-stock',value:{referenceNumber:'INV-0055',
    date:'2026-11-01',type:'out_sale',itemId:'paper',quantity:1}}]
 });
 const finding=report.findings[0];
 assert.equal(report.totals.missingRevenue,1);
 assert.equal(finding.status,'manual-review');
 assert.equal(finding.evidence.explicitStockOwnership,0);
 assert.ok(finding.reasons.includes('STOCK_NUMBER_REUSED_OR_DATE_MISMATCH'));
 assert.equal(finding.automaticFinancialRepair,false);
});
test('duplicate journal groups require correction even if one journal has matching amount',()=>{
 const report=diagnoseLegacyInvoices({
  invoices:[mkInvoice('i66','INV-0066')],
  journals:[journal('j1','i66','pos_invoice',61),journal('j2','i66','pos_invoice',61),
    journal('c1','i66','cogs',12),journal('c2','i66','cogs',12)],
  movements:[]
 });
 assert.equal(report.totals.duplicatedSales,1);
 assert.equal(report.totals.duplicatedCosts,1);
 assert.equal(report.findings[0].automaticFinancialRepair,false);
});
test('a journal total mismatch is not silently rebalanced',()=>{
 const report=diagnoseLegacyInvoices({
  invoices:[mkInvoice('i97','INV-0097',58)],
  journals:[journal('j97','i97','pos_invoice',61)]
 });
 assert.ok(report.findings[0].reasons.includes('REVENUE_TOTAL_MISMATCH'));
 assert.equal(report.totals.amountMismatch,1);
});
test('read-only database access never executes record-changing SQL',async()=>{
 const executed=[];
 const pool={connect:async()=>({
  query:async(sql,args=[])=>{
   executed.push(sql);
   if(sql.startsWith('SELECT'))return {rows:[]};
   if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   throw new Error('Unexpected write SQL');
  },
  release:()=>{}
 })};
 const result=await auditLegacyInvoicesReadOnly(pool,'lobnan_main');
 assert.equal(result.totals.invoices,0);
 assert.match(executed[0],/READ ONLY/);
 assert.deepEqual(executed.slice(1,-1).map(s=>s.slice(0,6)),['SELECT','SELECT','SELECT']);
 assert.equal(executed.at(-1),'COMMIT');
});

test('previously approved historical duplicate correction is not flagged as a new duplicate',()=>{
 const invoice=mkInvoice('i-approved','INV-0071',61);
 invoice.value.legacyRepair={repairId:'r1'};
 invoice.value.paidAmount=0;invoice.value.exchangeRate=1;
 const correction=(id,kind,account,debit,credit)=>({record_id:id,value:{
   id,referenceId:'i-approved',referenceType:'invoice_correction',
   correctionKind:kind,correctionGroupId:'revision-r1',
   internalCorrection:true,approvedRevision:true,
   lines:[{accountCode:account,debit,credit}]
 }});
 const costs=(id)=>({record_id:id,value:{
   referenceId:'i-approved',referenceType:'cogs',
   lines:[{accountCode:'5101',debit:12,credit:0},{accountCode:'1301',debit:0,credit:12}]
 }});
 const result=diagnoseLegacyInvoices({
  invoices:[invoice],
  journals:[
   journal('sale1','i-approved','pos_invoice',61),
   journal('sale2','i-approved','pos_invoice',61),
   costs('cost1'),costs('cost2'),
   correction('revenue-reverse','financial','1201',0,61),
   correction('revenue-reverse-credit','financial','4101',61,0),
   correction('cost-reverse','cogs','5101',0,12),
   correction('cost-reverse-credit','cogs','1301',12,0)
  ],
  movements:[{record_id:'linked-stock',value:{
   id:'linked-stock',sourceInvoiceId:'i-approved',referenceNumber:'INV-0071',
   type:'out_sale',itemId:'paper',quantity:2,unitPrice:6,totalValue:12
  }}]
 });
 assert.equal(result.totals.duplicatedSales,0);
 assert.equal(result.totals.duplicatedCosts,0);
});
