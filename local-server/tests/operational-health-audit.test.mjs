import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWorkspaceRecords,runWorkspaceReadOnlyAudit} from '../operational-health-audit.mjs';
const item=(id,value)=>({record_id:id,value});
test('detects cross-module defects without changing source financial records',()=>{
 const data={
  parties:[item('p1',{code:'CUST-0010'}),item('p2',{code:'CUST-0010'})],
  inventory:[item('i1',{code:'PRI-00001'})],
  employees:[],accounts:[],treasuries:[],
  invoices:[item('invoice1',{invoiceNumber:'INV-0001',isAccountingPosted:true,
    totalAmount:61,subtotal:60,customerId:'p1',items:[{itemId:'i1',total:60}]}),
    item('invoice2',{invoiceNumber:'INV-0001',isAccountingPosted:true,
     totalAmount:12,subtotal:12,customerId:'missing',items:[{itemId:'i1',total:12}]})],
  journalEntries:[item('j1',{referenceType:'pos_invoice',referenceId:'invoice1',
    lines:[{debit:61,credit:0},{debit:0,credit:60}]})],
  stockMovements:[item('m1',{itemId:'missing',quantity:2,sourceInvoiceId:'nonexistent'})]
 };
 const original=JSON.stringify(data);
 const audit=assessWorkspaceRecords(data);
 assert.equal(JSON.stringify(data),original,'audit is pure');
 for(const kind of ['DUPLICATE_BUSINESS_CODE','DUPLICATE_INVOICE_NUMBER',
  'POSTED_INVOICE_WITHOUT_LINKED_REVENUE','UNBALANCED_JOURNAL',
  'STOCK_ITEM_REFERENCE_MISSING','EXPLICIT_STOCK_INVOICE_REFERENCE_MISSING',
  'INVOICE_PARTY_REFERENCE_NOT_IN_PARTIES_OR_EMPLOYEES']){
  assert.ok(audit.byType[kind]>0,kind);
 }
});
test('well-formed records without legacy exceptions have no detected issues',()=>{
 const data={parties:[item('p1',{code:'CUST-0002'})],
  inventory:[item('i1',{code:'PRI-00001'})],
  employees:[],accounts:[],treasuries:[],
  invoices:[item('inv1',{invoiceNumber:'INV-0001',isAccountingPosted:true,totalAmount:61,
   subtotal:61,customerId:'p1',items:[{itemId:'i1',total:61}]})],
  journalEntries:[item('j1',{referenceType:'pos_invoice',referenceId:'inv1',
   lines:[{debit:61,credit:0},{debit:0,credit:61}]})],
  stockMovements:[item('m1',{itemId:'i1',quantity:1,sourceInvoiceId:'inv1'})]};
 const a=assessWorkspaceRecords(data);
 assert.equal(a.issueCount,0);
});
test('operational scan is restricted to a PostgreSQL read-only transaction',async()=>{
 const queries=[];
 const pool={connect:async()=>({
  query:async(sql)=>{queries.push(sql);
   if(sql.startsWith('SELECT status'))return {rows:[{status:'committed',count:3}]};
   if(sql.startsWith('SELECT count(*)'))return {rows:[{count:10,max_sequence:10}]};
   return {rows:[]};
  },release:()=>{}
 })};
 const audit=await runWorkspaceReadOnlyAudit(pool,'w1');
 assert.equal(audit.issueCount,0);
 assert.match(queries[0],/READ ONLY/);
 assert.equal(queries.at(-1),'COMMIT');
 assert.ok(queries.every(s=>/^(BEGIN|SELECT|COMMIT)$/.test(s.trim().split(' ')[0])));
});
