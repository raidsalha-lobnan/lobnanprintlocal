import type {LineAttachment} from '../types';
import {resizeAndCompressImage} from './imageCompress';
import {saveBinaryAttachment} from './fileStorage';
import {uploadCentralAttachment} from '../services/centralAttachmentApi';

/** High-fidelity document images stay separate from lightweight POS previews. */
export const PRINT_HEADER_MAX_WIDTH=3200;
export const PRINT_HEADER_MAX_HEIGHT=900;
const MAX_HEADER_BYTES=8*1024*1024;
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
  const dimensions=await new Promise<{width:number;height:number}>((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      resolve({width:img.naturalWidth,height:img.naturalHeight});
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('PRINT_HEADER_IMAGE_INVALID'));};
    img.src=url;
  });
  if(dimensions.width<1||dimensions.height<1)throw new Error('PRINT_HEADER_IMAGE_INVALID');
  if(dimensions.width<=PRINT_HEADER_MAX_WIDTH&&
     dimensions.height<=PRINT_HEADER_MAX_HEIGHT&&
     file.size<=MAX_HEADER_BYTES)return asDataUrl(file);
  return resizeAndCompressImage(file,PRINT_HEADER_MAX_WIDTH,PRINT_HEADER_MAX_HEIGHT,.97);
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
