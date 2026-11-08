import test from 'node:test';
import assert from 'node:assert/strict';
import {isDimensionalInvoiceItem,displayDimension} from '../src/utils/invoiceDimensions';

test('ordinary items hide length width count even when legacy defaults are populated',()=>{
 for(const item of [
  {unit:'حبة',length:1,width:1,count:1},
  {unit:'قطعة',length:2,width:3,count:4,hasDimensions:false},
  {unit:'م²',length:1,width:1,count:1,hasDimensions:false}
 ]){
  assert.equal(isDimensionalInvoiceItem(item),false);
  assert.equal(displayDimension(item.length,isDimensionalInvoiceItem(item)),'-');
  assert.equal(displayDimension(item.width,isDimensionalInvoiceItem(item)),'-');
 }
});

test('measured square-area items enable count even when dimensions are 1 by 1',()=>{
 for(const item of [
  {hasDimensions:true,length:1,width:1,count:2,unit:'م²'},
  {length:1,width:1,count:1,unit:'م²'}
 ]){
  assert.equal(isDimensionalInvoiceItem(item),true);
  assert.equal(displayDimension(item.length,true),'1');
  assert.equal(displayDimension(item.width,true),'1');
 }
});

test('an empty measured value shows a dash without modifying quantity or price',()=>{
 assert.equal(displayDimension(0,true),'-');
 assert.equal(displayDimension(undefined,true),'-');
 assert.equal(displayDimension(5,false),'-');
});
