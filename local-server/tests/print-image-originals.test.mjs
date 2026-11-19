import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hydrateOriginalPrintPhotos} from '../print-image-originals.mjs';

const id='att_11111111-2222-3333-4444-555555555555';
const smallPng=Buffer.concat([
 Buffer.from('89504e470d0a1a0a','hex'),
 Buffer.alloc(220,0xff)
]);
const attachment=()=>({
 id:'a1',name:'design.png',type:'image/png',
 galleryPrintIndex:0,driveFileId:id,storageType:'drive'
});
test('official customer statement loads registered originals only for authorized invoice rows',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobnan-print-original-test-'));
 try{
  const own=attachment(),repeat=attachment(),other=attachment();
  const snapshot={invoices:[
   {id:'authorized-1',customerId:'cust-a',date:'2026-11-17',
    items:[{attachments:[own,repeat]}]},
   {id:'not-authorized',customerId:'cust-b',date:'2026-11-17',
    items:[{attachments:[other]}]}
  ]};
  let lookup=0,downloads=0;
  const result=await hydrateOriginalPrintPhotos(snapshot,{
   type:'customer_statement',partyId:'cust-a',fromDate:'2026-11-01',
   toDate:'2026-11-17',workspace:'workspace-one',dir,
   findAttachment:async(ws,k)=>{
    assert.equal(ws,'workspace-one');assert.equal(k,id);
    lookup++;return {mime_type:'image/png',file_size:smallPng.length};
   },
   downloadAttachment:async(k)=>{
    assert.equal(k,id);downloads++;return smallPng;
   }
  });
  assert.equal(result.count,1);
  assert.equal(lookup,1);
  assert.equal(downloads,1);
  assert.ok(own.data.startsWith('file:'));
  assert.equal(repeat.data,own.data);
  assert.equal(other.data,undefined);
  assert.deepEqual(await fs.readFile(fileURLToPath(own.data)),smallPng);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('unregistered original cannot be included in a financial statement PDF',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobnan-print-original-test-'));
 try{
  const own=attachment();
  await assert.rejects(()=>hydrateOriginalPrintPhotos({
    invoices:[{customerId:'cust-a',date:'2026-11-17',items:[{attachments:[own]}]}]
  },{
   type:'customer_statement',partyId:'cust-a',workspace:'workspace-one',dir,
   findAttachment:async()=>null,
   downloadAttachment:async()=>{throw Error('SHOULD_NOT_DOWNLOAD');}
  }),/ORIGINAL_PHOTO_NOT_REGISTERED/);
  assert.equal(own.data,undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('historic thumbnails have no unauthorized cloud fetch and remain untouched',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobnan-print-original-test-'));
 try{
  const snapshot={invoices:[{
    customerId:'cust-a',date:'2026-11-17',
    items:[{imageThumbnail:'data:image/jpeg;base64,abc',attachments:[]}]
  }]};
  const result=await hydrateOriginalPrintPhotos(snapshot,{
   type:'customer_statement',partyId:'cust-a',workspace:'workspace-one',dir,
   findAttachment:async()=>{throw Error('SHOULD_NOT_LOOKUP');},
   downloadAttachment:async()=>{throw Error('SHOULD_NOT_DOWNLOAD');}
  });
  assert.equal(result.count,0);
  assert.equal(snapshot.invoices[0].items[0].imageThumbnail,
   'data:image/jpeg;base64,abc');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('independent line attachment is never fetched as a statement thumbnail',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobnan-independent-attachment-'));
 try{
  const separate={...attachment(),galleryPrintIndex:undefined};
  const result=await hydrateOriginalPrintPhotos({
   invoices:[{customerId:'cust-a',date:'2026-11-17',items:[{attachments:[separate]}]}]
  },{
   type:'customer_statement',partyId:'cust-a',workspace:'workspace-one',dir,
   findAttachment:async()=>{throw Error('INDEPENDENT_ATTACHMENT_SHOULD_NOT_BE_LOADED')},
   downloadAttachment:async()=>{throw Error('INDEPENDENT_ATTACHMENT_SHOULD_NOT_BE_DOWNLOADED')}
  });
  assert.equal(result.count,0);
  assert.equal(separate.data,undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
