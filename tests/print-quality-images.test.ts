import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {statementPhotoSources,splitInvoiceThumbnails} from '../src/utils/statementPhotoSources';
import type {LineAttachment} from '../src/types';

const thumbnail=(i:number)=>'data:image/jpeg;base64,thumb'+i;
const original=(index:number,id:string):LineAttachment=>({
 id:'source-'+index+'-'+id,
 name:'design-'+index+'.png',
 type:'image/png',
 driveFileId:id,
 galleryPrintIndex:index,
 isOriginal:true
});
test('each cashier thumbnail is paired with one full-resolution attachment for statements',()=>{
 const items=[{
  itemName:'بنر',
  imageThumbnail:JSON.stringify([thumbnail(1),thumbnail(2)]),
  attachments:[
   original(0,'att_11111111-2222-3333-4444-555555555555'),
   original(1,'att_99999999-2222-3333-4444-555555555555')
  ]
 }];
 const sources=statementPhotoSources(items);
 assert.equal(sources.length,2);
 assert.equal(sources[0].preview,thumbnail(1));
 assert.equal(sources[0].original?.galleryPrintIndex,0);
 assert.equal(sources[1].original?.galleryPrintIndex,1);
});

test('historic invoices without original attachments retain their existing images',()=>{
 const old=statementPhotoSources([{itemName:'قديمة',imageThumbnail:thumbnail(3)}]);
 assert.equal(old.length,1);
 assert.equal(old[0].preview,thumbnail(3));
 assert.equal(old[0].original,undefined);
});

test('different invoice items may legitimately repeat the same picture',()=>{
 const images=statementPhotoSources([
  {itemName:'صنف أ',imageThumbnail:thumbnail(1)},
  {itemName:'صنف ب',imageThumbnail:thumbnail(1)}
 ]);
 assert.equal(images.length,2);
 assert.deepEqual(images.map(x=>x.itemSeq),[1,2]);
});

test('independent original-image attachments appear without a duplicate gallery tile',()=>{
 const att=original(0,'att_11111111-2222-3333-4444-555555555555');
 const other={...original(8,'att_99999999-2222-3333-4444-555555555555'),galleryPrintIndex:undefined};
 const photos=statementPhotoSources([{
  itemName:'أ',imageThumbnail:thumbnail(1),attachments:[att,other]
 }]);
 assert.equal(photos.length,2);
 assert.equal(photos[1].original?.driveFileId,other.driveFileId);
});

test('print header upload is no longer limited to 1200 x 300 and old pixels are never upscaled',()=>{
 const image=readFileSync(new URL('../src/utils/printQualityAssets.ts',import.meta.url),'utf8');
 const settings=readFileSync(new URL('../src/components/SettingsView.tsx',import.meta.url),'utf8');
 assert.ok(image.includes('PRINT_HEADER_MAX_WIDTH=3200'));
 assert.ok(image.includes('PRINT_HEADER_MAX_HEIGHT=900'));
 assert.ok(image.includes('MAX_HEADER_DATA_URL_CHARS=590_000'));
 assert.ok(image.includes('return asDataUrl(file); // Original bytes, no lossy re-encoding.'));
 assert.ok(image.includes("canvas.toDataURL('image/png')"));
 assert.ok(image.includes("canvas.toDataURL('image/jpeg',quality)"));
 assert.ok(settings.includes('preparePrintLetterhead(file)'));
 assert.ok(!settings.includes('resizeAndCompressImage(file, 1200, 300)'));
});

test('cashier and draft invoice upload keep source attachments and small visual previews separately',()=>{
 const pos=readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');
 const drafts=readFileSync(new URL('../src/components/pos/DraftInvoicesQueueModal.tsx',import.meta.url),'utf8');
 for(const source of [pos,drafts]){
  assert.ok(source.includes('prepareInvoiceGalleryImages('));
  assert.ok(source.includes('...prepared.originals'));
  assert.ok(source.includes('JSON.stringify(prepared.thumbnails)'));
  assert.ok(source.includes('pendingGalleryUploadsRef.current'));
 }
});

test('both financial statement and normal print render original photo component',()=>{
 const statement=readFileSync(new URL('../src/components/UnifiedPartyStatementDocument.tsx',import.meta.url),'utf8');
 assert.ok(statement.includes('<StatementPrintPhoto'));
 assert.ok(statement.includes('original={photo.original}'));
 assert.ok(statement.includes('thumbnail={photo.preview}'));
 assert.deepEqual(splitInvoiceThumbnails(''),[]);
});
