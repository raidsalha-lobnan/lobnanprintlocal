import type {LineAttachment} from '../types';

export interface StatementPhotoSource {
  preview:string;
  original?:LineAttachment;
  itemName:string;
  itemSeq:number;
}
export interface StatementPhotoItem {
  itemName:string;
  imageThumbnail?:string;
  attachments?:LineAttachment[];
}

export function splitInvoiceThumbnails(value?:string):string[]{
  if(!value)return [];
  const raw=value.trim();
  if(raw.startsWith('[')){
    try{
      const array=JSON.parse(raw);
      if(Array.isArray(array))return array.filter((s):s is string=>typeof s==='string'&&s.length>0);
    }catch{}
  }
  return raw?[raw]:[];
}

/**
 * Do not repeat a photographed item when its full-resolution original is
 * stored as a separate Drive/local attachment. Older invoices without a
 * matching original keep the existing thumbnail, without fake upscaling.
 */
export function statementPhotoSources(items:StatementPhotoItem[]):StatementPhotoSource[]{
  const photos:StatementPhotoSource[]=[];
  const seen=new Set<string>();
  for(let i=0;i<items.length;i++){
    const item=items[i];
    const originals=item.attachments||[];
    const thumbnails=splitInvoiceThumbnails(item.imageThumbnail);
    for(let j=0;j<thumbnails.length;j++){
      const preview=thumbnails[j];
      const original=originals.find(a=>a.galleryPrintIndex===j&&a.type?.startsWith('image/'));
      const key=original?.driveFileId||original?.localBlobId||preview;
      if(seen.has(key))continue;
      seen.add(key);
      photos.push({preview,original,itemName:item.itemName,itemSeq:i+1});
    }
    for(const att of originals){
      if(att.galleryPrintIndex!==undefined||
         !(att.type?.startsWith('image/')||att.data?.startsWith('data:image/')))continue;
      const key=att.driveFileId||att.localBlobId||att.data||att.id;
      if(seen.has(key)||(!att.data&&!att.driveFileId&&!att.localBlobId))continue;
      seen.add(key);
      photos.push({preview:att.data||'',original:att,itemName:item.itemName,itemSeq:i+1});
    }
  }
  return photos;
}
