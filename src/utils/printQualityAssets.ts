import type {LineAttachment} from '../types';
import {resizeAndCompressImage} from './imageCompress';
import {saveBinaryAttachment} from './fileStorage';
import {uploadCentralAttachment} from '../services/centralAttachmentApi';

/** High-fidelity document images stay separate from lightweight POS previews. */
export const PRINT_HEADER_MAX_WIDTH=3200;
export const PRINT_HEADER_MAX_HEIGHT=900;
// sync command payloads are limited to 1MB. Leave headroom for other
// settings and JSON encoding; reject oversized banner data before saving.
const MAX_HEADER_DATA_URL_CHARS=590_000;
const MAX_PRINT_ATTACHMENT_BYTES=50*1024*1024;

function asDataUrl(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(new Error('PRINT_IMAGE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

/**
 * Store the original JPEG/PNG/WebP banner unchanged whenever it already fits.
 * Large banners are resized once with high-quality JPEG or lossless PNG.
 * Never upscale a low-resolution historic letterhead.
 */
export async function preparePrintLetterhead(file:File):Promise<string>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))
    throw new Error('PRINT_HEADER_FORMAT_UNSUPPORTED');
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
    image.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(new Error('PRINT_HEADER_IMAGE_INVALID'));
    };
    image.src=url;
  });
  if(img.naturalWidth<1||img.naturalHeight<1)
    throw new Error('PRINT_HEADER_IMAGE_INVALID');
  if(img.naturalWidth<=PRINT_HEADER_MAX_WIDTH&&
     img.naturalHeight<=PRINT_HEADER_MAX_HEIGHT&&
     Math.ceil(file.size*4/3)+40<=MAX_HEADER_DATA_URL_CHARS){
    return asDataUrl(file); // Original bytes, no lossy re-encoding.
  }
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context)throw new Error('PRINT_HEADER_CANVAS_UNAVAILABLE');
  const scale=Math.min(1,PRINT_HEADER_MAX_WIDTH/img.naturalWidth,
    PRINT_HEADER_MAX_HEIGHT/img.naturalHeight);
  const safeWidth=img.naturalWidth*scale,safeHeight=img.naturalHeight*scale;
  // Prefer print-sharp lossless PNG for logos and Arabic text; otherwise
  // use a high-quality full-size JPEG before reducing resolution.
  for(const factor of [1,.90,.80,.70]){
    canvas.width=Math.max(1,Math.round(safeWidth*factor));
    canvas.height=Math.max(1,Math.round(safeHeight*factor));
    context.fillStyle='#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(img,0,0,canvas.width,canvas.height);
    if(file.type==='image/png'){
      const png=canvas.toDataURL('image/png');
      if(png.length<=MAX_HEADER_DATA_URL_CHARS)return png;
    }
    for(const quality of [.97,.94,.90,.86]){
      const jpeg=canvas.toDataURL('image/jpeg',quality);
      if(jpeg.length<=MAX_HEADER_DATA_URL_CHARS)return jpeg;
    }
  }
  throw new Error('PRINT_HEADER_TOO_LARGE_FOR_SYNC');
}

export interface PreparedGalleryImages {
  thumbnails:string[];
  originals:LineAttachment[];
  localOnlyCount:number;
}

/**
 * Invoice photos: 120px previews remain small for cashier responsiveness;
 * full-resolution originals are saved losslessly in local IndexedDB and,
 * when possible, the central Drive attachment store.
 *
 * A galleryPrintIndex pairs each original with its screen preview, preventing
 * double image tiles in printable customer statements.
 */
export async function prepareInvoiceGalleryImages(files:File[]):Promise<PreparedGalleryImages>{
  const thumbnails:string[]=[];
  const originals:LineAttachment[]=[];
  let localOnlyCount=0;
  for(const file of files){
    if(!file.type.startsWith('image/')||file.size<=0)
      throw new Error('PRINT_PHOTO_FORMAT_INVALID');
    if(file.size>MAX_PRINT_ATTACHMENT_BYTES)
      throw new Error('PRINT_PHOTO_TOO_LARGE');
    const thumbnail=await resizeAndCompressImage(file,120,120,.7);
    const id='att-'+crypto.randomUUID();
    // Original bytes are retained even if Drive is unavailable.
    await saveBinaryAttachment(id,file,file.name,file.type);
    const att:LineAttachment={
      id,name:file.name,size:file.size,type:file.type,
      localBlobId:id,storageType:'local',isOriginal:true,
      galleryPrintIndex:thumbnails.length,
      uploadedAt:new Date().toISOString()
    };
    if(typeof navigator!=='undefined'&&navigator.onLine){
      try{
        const receipt=await uploadCentralAttachment(file);
        att.driveFileId=receipt.fileId;
        att.storageType='drive';
      }catch{
        localOnlyCount++;
      }
    }else{
      localOnlyCount++;
    }
    thumbnails.push(thumbnail);
    originals.push(att);
  }
  return {thumbnails,originals,localOnlyCount};
}

/** Pair a thumbnail to its original, without altering the invoice image list. */
export function galleryOriginalForIndex(attachments:LineAttachment[]|undefined,index:number):LineAttachment|undefined{
  return attachments?.find(att=>att.galleryPrintIndex===index&&
    (att.type?.startsWith('image/')||att.data?.startsWith('data:image/')));
}
