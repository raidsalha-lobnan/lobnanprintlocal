import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {statementPhotoSources,splitInvoiceThumbnails} from '../src/utils/statementPhotoSources';
import type {LineAttachment} from '../src/types';

const thumbnail=(i:number)=>'data:image/jpeg;base64,thumb'+i;
const original=(index:number,id:string):LineAttachment=>({
 id:'source-'+index+'-'+id,name:'design-'+index+'.png',type:'image/png',
 driveFileId:id,galleryPrintIndex:index,isOriginal:true
});
test('old invoice thumbnails retain their optional original pairing',()=>{
 const photos=statementPhotoSources([{itemName:'بنر',
  imageThumbnail:JSON.stringify([thumbnail(1),thumbnail(2)]),
  attachments:[original(0,'att_11111111-2222-3333-4444-555555555555'),
               original(1,'att_99999999-2222-3333-4444-555555555555')]}]);
 assert.equal(photos.length,2);
 assert.equal(photos[0].original?.galleryPrintIndex,0);
 assert.equal(photos[1].original?.galleryPrintIndex,1);
});
test('independent line attachments never become small statement photos',()=>{
 const separate={...original(0,'att_11111111-2222-3333-4444-555555555555'),galleryPrintIndex:undefined};
 const photos=statementPhotoSources([{itemName:'تصميم',
  imageThumbnail:JSON.stringify([thumbnail(1),thumbnail(2)]),attachments:[separate]}]);
 assert.equal(photos.length,2);
 assert.deepEqual(photos.map(x=>x.preview),[thumbnail(1),thumbnail(2)]);
 assert.equal(photos[0].original,undefined);
 assert.equal(photos[1].original,undefined);
 assert.equal(statementPhotoSources([{itemName:'مرفق فقط',attachments:[separate]}]).length,0);
});
test('historic thumbnails without attachment remain visible',()=>{
 const photos=statementPhotoSources([{itemName:'قديم',imageThumbnail:thumbnail(3)}]);
 assert.equal(photos.length,1);
 assert.equal(photos[0].preview,thumbnail(3));
 assert.equal(photos[0].original,undefined);
});
test('different items may repeat the same thumbnail independently',()=>{
 const photos=statementPhotoSources([
  {itemName:'صنف أ',imageThumbnail:thumbnail(1)},
  {itemName:'صنف ب',imageThumbnail:thumbnail(1)}
 ]);
 assert.deepEqual(photos.map(x=>x.itemSeq),[1,2]);
});
test('print header retains its full-res handling',()=>{
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
test('invoice thumbnail compression is self-contained and never uploads original',()=>{
 const code=readFileSync(new URL('../src/utils/printQualityAssets.ts',import.meta.url),'utf8');
 const section=code.slice(code.indexOf('export async function prepareInvoiceThumbnails'));
 assert.ok(section.includes('[400,.78]'));
 assert.ok(section.includes('[360,.76]'));
 assert.ok(section.includes('[320,.74]'));
 assert.ok(code.includes('INVOICE_THUMBNAIL_MAX_EDGE_PX=400'));
 assert.ok(code.includes('INVOICE_THUMBNAIL_DATA_URL_CHAR_LIMIT=32_000'));
 assert.ok(!section.includes('[640,.82]'));
 assert.ok(section.includes("canvas.toDataURL('image/jpeg',quality)"));
 assert.ok(section.includes('INVOICE_THUMBNAIL_DATA_URL_CHAR_LIMIT'));
 assert.ok(!section.includes('saveBinaryAttachment'));
 assert.ok(!section.includes('uploadCentralAttachment'));
});
test('POS and draft image handlers append only thumbnails, never attachment metadata',()=>{
 const pos=readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');
 const draft=readFileSync(new URL('../src/components/pos/DraftInvoicesQueueModal.tsx',import.meta.url),'utf8');
 for(const source of [pos,draft]){
  assert.ok(source.includes('prepareInvoiceThumbnails(Array.from(files))'));
  assert.ok(source.includes('...parseThumbnails('));
  assert.ok(source.includes('...thumbnails'));
  assert.ok(source.includes('preparingThumbnailIds'));
  assert.ok(!source.includes('...prepared.originals'));
  assert.ok(!source.includes('prepareInvoiceGalleryImages('));
 }
});
test('customer statement still supports legacy original fallbacks',()=>{
 const code=readFileSync(new URL('../src/components/UnifiedPartyStatementDocument.tsx',import.meta.url),'utf8');
 assert.ok(code.includes('<StatementPrintPhoto'));
 assert.ok(code.includes('original={photo.original}'));
 assert.ok(code.includes('thumbnail={photo.preview}'));
 assert.deepEqual(splitInvoiceThumbnails(''),[]);
});

test('thumbnail compression policy does not mutate original attachment references or historic invoice images',()=>{
 const code=readFileSync(new URL('../src/utils/printQualityAssets.ts',import.meta.url),'utf8');
 const section=code.slice(code.indexOf('export async function prepareInvoiceThumbnails'));
 const pos=readFileSync(new URL('../src/components/PosView.tsx',import.meta.url),'utf8');
 const draft=readFileSync(new URL('../src/components/pos/DraftInvoicesQueueModal.tsx',import.meta.url),'utf8');
 assert.ok(section.includes('INVOICE_THUMBNAIL_DATA_URL_CHAR_LIMIT'));
 assert.ok(section.includes('results.push(thumbnail)'));
 assert.ok(!section.includes('uploadCentralAttachment'));
 assert.ok(!section.includes('deleteBinaryAttachment'));
 assert.ok(pos.includes('prepareInvoiceThumbnails(Array.from(files))'));
 assert.ok(draft.includes('prepareInvoiceThumbnails(Array.from(files))'));
});
