/** High-fidelity document images stay separate from lightweight POS previews. */
export const PRINT_HEADER_MAX_WIDTH=3200;
export const PRINT_HEADER_MAX_HEIGHT=900;
// Keep letterhead previews compact for settings sync and browser rendering.
// Do not place original multi-megabyte images into accounting event payloads.
const MAX_HEADER_DATA_URL_CHARS=590_000;
const MAX_THUMBNAIL_SOURCE_BYTES=50*1024*1024;
const MAX_THUMBNAIL_DATA_URL_CHARS=70_000;

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

/**
 * Self-contained, compressed thumbnail previews for invoices and statements.
 * Never writes to Drive/IndexedDB or to the item's independent attachments.
 */
export async function prepareInvoiceThumbnails(files:File[]):Promise<string[]>{
  const results:string[]=[];
  for(const file of files){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<=0)
      throw new Error('INVOICE_THUMBNAIL_FORMAT_INVALID');
    if(file.size>MAX_THUMBNAIL_SOURCE_BYTES)
      throw new Error('INVOICE_THUMBNAIL_SOURCE_TOO_LARGE');
    const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('INVOICE_THUMBNAIL_INVALID'))};
      image.src=url;
    });
    if(!img.naturalWidth||!img.naturalHeight)throw new Error('INVOICE_THUMBNAIL_INVALID');
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('INVOICE_THUMBNAIL_CANVAS_UNAVAILABLE');
    let thumbnail='';
    // 640px where possible; progressive resizing keeps sync payloads small.
    for(const [maxSize,quality] of [[640,.82],[560,.80],[480,.78],[420,.75],[360,.72],[320,.68]]){
      const scale=Math.min(1,maxSize/img.naturalWidth,maxSize/img.naturalHeight);
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const jpeg=canvas.toDataURL('image/jpeg',quality);
      if(jpeg.length<=MAX_THUMBNAIL_DATA_URL_CHARS){thumbnail=jpeg;break}
    }
    if(!thumbnail)throw new Error('INVOICE_THUMBNAIL_TOO_LARGE');
    results.push(thumbnail);
  }
  return results;
}
