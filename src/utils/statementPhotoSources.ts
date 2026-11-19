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
 * Only images intentionally stored in imageThumbnail appear here. Ordinary
 * line attachments are independent; legacy galleryPrintIndex pairs stay valid.
 */
export function statementPhotoSources(items:StatementPhotoItem[]):StatementPhotoSource[]{
  const photos:StatementPhotoSource[]=[];
  for(let i=0;i<items.length;i++){
    // Repeated designs on different invoice items remain separate tiles.
    const seen=new Set<string>();
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
  }
  return photos;
}
