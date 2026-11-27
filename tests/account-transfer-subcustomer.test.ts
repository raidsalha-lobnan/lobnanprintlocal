import test from 'node:test';
import assert from 'node:assert/strict';
import type {Party,DebtClearingRecord} from '../src/types';
import {generateAccountStatement} from '../src/utils/statementGenerator';
const parent={id:'parent',name:'Main',type:'customer',openingBalance:0,balance:0} as Party;
const a={id:'sub-a',name:'A',type:'customer',isSubCustomer:true,parentPartyId:parent.id,openingBalance:0,balance:0} as Party;
const b={...a,id:'sub-b',name:'B'};
const other={...a,id:'sub-c',parentPartyId:'other-parent'};
const clearing={id:'clr-1',clearingNumber:'CLR-2026-002',date:'2026-11-27',createdAt:'2026-11-27T00:00:00Z',transferVersion:2,customerId:parent.id,customerName:parent.name,supplierId:parent.id,supplierName:parent.name,creditPartyType:'customer',debitPartyType:'customer',creditSubCustomerId:a.id,creditSubCustomerName:a.name,debitSubCustomerId:b.id,debitSubCustomerName:b.name,amount:50,reason:'transfer',notes:''} as DebtClearingRecord;
const stmt=(party:Party,subCustomerId?:string)=>generateAccountStatement({party,subCustomerId,subCustomers:[a,b,other],invoices:[],debtClearings:[clearing]});
test('intra-parent transfer is allocated by registered subcustomer ID only',()=>{
 assert.equal(stmt(parent).closingBalance,0);
 assert.equal(stmt(parent,a.id).closingBalance,-50);
 assert.equal(stmt(parent,b.id).closingBalance,50);
 assert.equal(stmt(a).closingBalance,-50);
 assert.equal(stmt(b).closingBalance,50);
 assert.equal(stmt(other).closingBalance,0);
});
