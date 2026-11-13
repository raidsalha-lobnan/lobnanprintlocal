import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Invoice} from '../src/types';
import {isConfirmedSalesInvoice,separateInvoiceConfirmation} from '../src/utils/invoiceConfirmation';

const sample = (invoiceNumber:string, totalAmount:number, isOfficial?:boolean, isAccountingPosted?:boolean):Invoice =>
  ({id:'id-'+invoiceNumber,invoiceNumber,totalAmount,...(isOfficial===undefined?{}:{isOfficial}),
    ...(isAccountingPosted===undefined?{}:{isAccountingPosted})} as Invoice);

test('unconfirmed TEMP sales are never considered official, even if locally marked posted',()=>{
  assert.equal(isConfirmedSalesInvoice(sample('INV-0268',701)),true);
  assert.equal(isConfirmedSalesInvoice(sample('TEMP-inv-pos-1769ebc8-4724-4d90-aa9c-9725610d3923',209)),false);
  assert.equal(isConfirmedSalesInvoice(sample('TEMP-inv-pos-9115aad0-5045-4be1-a1fc-6a13f2bffc96',68)),false);
  assert.equal(isConfirmedSalesInvoice(sample('TEMP-inv-pos-cc8c1d52-954d-4006-aa5c-0112f2e5c645',55)),false);
  assert.equal(isConfirmedSalesInvoice(sample('INV-0270',20,false)),false);
  assert.equal(isConfirmedSalesInvoice(sample('INV-0270',20,true)),true);
  for(const [number,amount] of [
    ['INV-0026',10],['INV-0028',450],['INV-0031',120],
    ['INV-0035',155],['INV-0055',58]
  ] as const){
    assert.equal(isConfirmedSalesInvoice(sample(number,amount,false,true)),true,
      'legacy PostgreSQL posted invoice must not be displayed as pending');
  }
  assert.equal(isConfirmedSalesInvoice(sample('INV-0444',20,false,false)),false);
  assert.equal(isConfirmedSalesInvoice(sample('INV-0269',209,true,true)),true);
  assert.equal(isConfirmedSalesInvoice(sample('INV-0270',55,true,true)),true);
  assert.equal(isConfirmedSalesInvoice(sample('INV-0271',68,true,true)),true);
});

test('official sales totals and counts exclude local drafts without losing or mutating them',()=>{
  const all=[sample('INV-0268',701),sample('TEMP-a',209),sample('TEMP-b',55),sample('TEMP-c',68)];
  const before=JSON.stringify(all);
  const {confirmed,awaitingConfirmation}=separateInvoiceConfirmation(all);
  assert.equal(confirmed.length,1);
  assert.equal(awaitingConfirmation.length,3);
  assert.equal(confirmed.reduce((sum,x)=>sum+x.totalAmount,0),701);
  assert.equal(awaitingConfirmation.reduce((sum,x)=>sum+x.totalAmount,0),332);
  assert.equal(JSON.stringify(all),before);
});

test('official register, customer statements, employee statements, VAT and printing all use confirmation guard',()=>{
  const root=(rel:string)=>readFileSync(new URL('../src/'+rel,import.meta.url),'utf8');
  const sales=root('components/InvoicesView.tsx');
  const statements=root('utils/statementGenerator.ts');
  const reports=root('components/ReportsView.tsx');
  const printing=root('utils/printDetailedSalesInvoiceRegister.ts');
  assert.match(sales,/separateInvoiceConfirmation\(invoices\)/);
  assert.match(sales,/data-testid="sales-awaiting-postgres-confirmation"/);
  assert.match(sales,/filteredInvoices = confirmedInvoices/);
  assert.match(sales,/\{filteredInvoices\.length\} \/ \{confirmedInvoices\.length\}/);
  assert.match(printing,/buildDetailedSalesReportHtml\(confirmedInvoices,options\)/);
  assert.equal((statements.match(/if \(!isConfirmedSalesInvoice\(inv\)\) return;/g)||[]).length,2);
  assert.match(reports,/confirmedSalesForTax = invoices\.filter\(isConfirmedSalesInvoice\)/);
});
