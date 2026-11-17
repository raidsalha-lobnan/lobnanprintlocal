import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';

const IMAGE_TYPES=new Map([
  ['image/png','png'],['image/jpeg','jpg'],['image/webp','webp'],['image/gif','gif']
]);
const VALID_ID=/^[a-zA-Z0-9_-]{8,200}$/;
const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_DISTINCT_PHOTOS=300;

function reportInvoices(snapshot,{type,partyId,fromDate,toDate}){
  if(!['customer_statement','supplier_statement'].includes(type))return [];
  return (snapshot.invoices||[]).filter(inv=>{
    if(type==='supplier_statement')return false;
    return inv.customerId===partyId&&
      (!fromDate||inv.date>=fromDate)&&(!toDate||inv.date<=toDate);
  });
}

/**
 * Only references already present in invoices authorized for this report may
 * be retrieved. Verify each reference in the workspace attachment registry.
 * Use temporary local file:// URLs for Chrome to embed the ORIGINAL bitmap;
 * files are deleted with the report's temporary directory after PDF capture.
 *
 * Never modify PostgreSQL records: this enriches only the in-memory snapshot.
 */
export async function hydrateOriginalPrintPhotos(snapshot,{
  type,partyId,fromDate,toDate,workspace,dir,
  findAttachment,downloadAttachment
}){
  if(!findAttachment||!downloadAttachment)return {count:0};
  const target=reportInvoices(snapshot,{type,partyId,fromDate,toDate});
  const pending=[];
  for(const invoice of target){
    for(const item of invoice.items||[]){
      for(const attachment of item.attachments||[]){
        const mime=String(attachment?.type||'').toLowerCase();
        if(!IMAGE_TYPES.has(mime)||!attachment.driveFileId)continue;
        if(!VALID_ID.test(attachment.driveFileId))continue;
        pending.push(attachment);
      }
    }
  }
  const unique=new Map(pending.map(a=>[a.driveFileId,a]));
  if(unique.size>MAX_DISTINCT_PHOTOS)
    throw new Error('OFFICIAL_REPORT_TOO_MANY_ORIGINAL_PHOTOS');

  const fileUris=new Map();
  let idx=0;
  const entries=Array.from(unique);
  await Promise.all(Array.from({length:Math.min(entries.length,4)},async()=>{
    while(idx<entries.length){
      const [fileId,attachment]=entries[idx++];
      const record=await findAttachment(workspace,fileId);
      if(!record)throw new Error('OFFICIAL_REPORT_ORIGINAL_PHOTO_NOT_REGISTERED');
      const mime=String(record.mime_type||'').toLowerCase();
      const ext=IMAGE_TYPES.get(mime);
      if(!ext||Number(record.file_size)>MAX_IMAGE_BYTES)
        throw new Error('OFFICIAL_REPORT_ORIGINAL_PHOTO_INVALID');
      const bytes=await downloadAttachment(fileId,MAX_IMAGE_BYTES);
      if(!Buffer.isBuffer(bytes)||bytes.length<10||bytes.length>MAX_IMAGE_BYTES)
        throw new Error('OFFICIAL_REPORT_ORIGINAL_PHOTO_INVALID');
      const safeId=crypto.createHash('sha256').update(fileId).digest('hex');
      const output=path.join(dir,'source-'+safeId+'.'+ext);
      await fs.writeFile(output,bytes);
      fileUris.set(fileId,pathToFileURL(output).href);
    }
  }));
  for(const att of pending){
    const uri=fileUris.get(att.driveFileId);
    if(uri)att.data=uri;
  }
  return {count:fileUris.size};
}
