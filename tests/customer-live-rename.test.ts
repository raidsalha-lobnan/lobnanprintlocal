import test from 'node:test';
import assert from 'node:assert/strict';
import type {Party} from '../src/types';
import {formatInvoiceCustomerDisplay} from '../src/utils/partyUtils';

test('renamed customer is resolved from immutable party ID, not a cached invoice name', () => {
  const parties=[{id:'pt-1791702465196',code:'CUST-0045',name:'سمير عبد النبي - أبو جمال',type:'customer',balance:0}] as Party[];
  const invoice={customerId:'pt-1791702465196',customerName:'مؤسسة وقف الواقفين'};
  assert.equal(formatInvoiceCustomerDisplay(invoice,parties),'سمير عبد النبي / أبو جمال');
  assert.equal(parties[0].name,'سمير عبد النبي - أبو جمال');
  assert.equal(invoice.customerName,'مؤسسة وقف الواقفين');
});

test('a missing customer record keeps its historical invoice snapshot without changing IDs', () => {
  const invoice={customerId:'pt-missing',customerName:'الاسم التاريخي'};
  assert.equal(formatInvoiceCustomerDisplay(invoice,[]),'الاسم التاريخي');
});

test('existing subcustomer link still displays the canonical parent and subcustomer names', () => {
  const parties=[
    {id:'parent-1',code:'CUST-0001',name:'زبون نقدي',type:'customer',balance:0},
    {id:'sub-1',code:'SUB-0001',name:'مؤمن الدرفيل',parentPartyId:'parent-1',isSubCustomer:true,type:'customer',balance:25}
  ] as Party[];
  const invoice={customerId:'parent-1',subCustomerId:'sub-1',customerName:'زبون نقدي',subCustomerName:'قديمة'};
  assert.equal(formatInvoiceCustomerDisplay(invoice,parties),'زبون نقدي / مؤمن الدرفيل');
});
