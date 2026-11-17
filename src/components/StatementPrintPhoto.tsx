import React,{useEffect,useState} from 'react';
import type {LineAttachment} from '../types';
import {getBinaryAttachment} from '../utils/fileStorage';
import {fetchCentralAttachmentBlob} from '../services/centralAttachmentApi';

export interface StatementPrintPhotoProps {
  thumbnail:string;
  original?:LineAttachment;
  alt:string;
  className?:string;
  onClick?:()=>void;
}

/** Shared print/screen photo. Server SSR supplies the same full-resolution
 * image in original.data; browsers load the authenticated attachment from
 * Drive or local IndexedDB, leaving the 120px thumbnail as fallback only.
 */
export const StatementPrintPhoto:React.FC<StatementPrintPhotoProps>=({
  thumbnail,original,alt,className,onClick
})=>{
  const inlinedOriginal=original?.data&&original.type?.startsWith('image/')
    ?original.data:'';
  const [source,setSource]=useState(inlinedOriginal||thumbnail);
  const [pending,setPending]=useState(
    Boolean(original&&!inlinedOriginal&&(original.driveFileId||original.localBlobId))
  );
  useEffect(()=>{
    setSource(inlinedOriginal||thumbnail);
    if(!original||inlinedOriginal||(!original.driveFileId&&!original.localBlobId)){
      setPending(false);return;
    }
    let alive=true,url='';
    setPending(true);
    void (async()=>{
      let blob:Blob|undefined;
      if(original.driveFileId){
        try{blob=await fetchCentralAttachmentBlob(original.driveFileId);}
        catch{ /* The original may still exist on this device. */ }
      }
      if(!blob&&original.localBlobId){
        try{blob=(await getBinaryAttachment(original.localBlobId))?.blob;}
        catch{}
      }
      if(!alive)return;
      if(blob&&blob.type.startsWith('image/')){
        url=URL.createObjectURL(blob);
        setSource(url);
      }
      setPending(false);
    })();
    return ()=>{alive=false;if(url)URL.revokeObjectURL(url);};
  },[inlinedOriginal,thumbnail,original?.driveFileId,original?.localBlobId,original?.id]);

  return source ? (
    <img
      src={source}
      alt={alt}
      className={className}
      onClick={onClick}
      data-statement-photo-status={pending?'loading':source===thumbnail?'thumbnail':'original'}
      title={pending?'جاري تحميل الصورة الأصلية للطباعة':alt}
      loading="eager"
      decoding="sync"
    />
  ) : (
    <span className="block text-[9px] text-slate-400 text-center" data-statement-photo-status={pending?'loading':'missing'}>
      {pending?'جاري تحميل الصورة الأصلية':'الصورة غير متاحة'}
    </span>
  );
};
