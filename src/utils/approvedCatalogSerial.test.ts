import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSequentialSku} from './barcodeGenerator';

const approved = [
  {id:'print_raw',name:'مطبعة',prefix:'PRI'},
  {id:'stationery',name:'مكتبة وقرطاسية',prefix:'BOK'},
  {id:'office_supplies',name:'أصناف متنوعة واكسسوارات',prefix:'ACC'},
] as any;

test('new catalog numbering always uses five digits within each approved category',()=>{
 assert.equal(generateSequentialSku('print_raw',['PRI-00001','PRI-00025'],approved),'PRI-00026');
 assert.equal(generateSequentialSku('stationery',['BOK-00001','BOK-00002'],approved),'BOK-00003');
 assert.equal(generateSequentialSku('office_supplies',['ACC-00001'],approved),'ACC-00002');
});
test('released PRI-00025 becomes available for a new printing item, without altering earlier invoice identities',()=>{
 assert.equal(generateSequentialSku('print_raw',['PRI-00001','PRI-00024'],approved),'PRI-00025');
 assert.equal(generateSequentialSku('print_raw',['PRI-00024','PRI-00026'],approved),'PRI-00025');
 assert.equal(generateSequentialSku('print_raw',['PRI-00024','PRI-00025','PRI-00026'],approved),'PRI-00027');
});

test('legacy printing numbers reserve lower serials but do not shorten the approved code',()=>{
 assert.equal(generateSequentialSku('print_raw',['PRI-0001','PRI-0025'],approved),'PRI-00026');
});
