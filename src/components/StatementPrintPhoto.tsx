import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {STATEMENT_PRINT_PREPARE_EVENT} from '../utils/statementPrintReadiness';
import type {LineAttachment} from '../types';
import {getBinaryAttachment} from '../utils/fileStorage';
import {fetchCentralAttachmentBlob} from '../services/centralAttachmentApi';

export const DeferredStatementPhotos=createContext(false);

export interface StatementPrintPhotoProps {
  thumbnail:string;
  original?:LineAttachment;
  alt:string;
  className?:string;
  onClick?:(src:string)=>void;
}

/** Shared print/screen photo. Server SSR supplies the same full-resolution
 * image in original.data; browsers load the authenticated attachment from
 * Drive or local IndexedDB, leaving the 120px thumbnail as fallback only.
 */
export const StatementPrintPhoto:React.FC<StatementPrintPhotoProps>=({
  thumbnail,original,alt,className,onClick
})=>{
  const deferred=useContext(DeferredStatementPhotos);
  const imageRef=useRef<HTMLElement|null>(null);
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
    let started=false;
    let observer:IntersectionObserver|undefined;
    const start=()=>{
      if(started||!alive)return;
      started=true;observer?.disconnect();
      void (async()=>{
      let blob:Blob|undefined;
      if(original.localBlobId){
        try{blob=(await getBinaryAttachment(original.localBlobId))?.blob;}
        catch{}
      }
      if(!blob&&original.driveFileId){
        try{blob=await fetchCentralAttachmentBlob(original.driveFileId);}
        catch{ /* A thumbnail remains available if the original is unavailable. */ }
      }
      if(!alive)return;
      if(blob&&blob.type.startsWith('image/')){
        url=URL.createObjectURL(blob);
        setSource(url);
      }
      setPending(false);
      })();
    };
    window.addEventListener(STATEMENT_PRINT_PREPARE_EVENT,start);
    if(deferred&&imageRef.current&&typeof IntersectionObserver==='function'){
      observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting))start();
      },{rootMargin:'350px'});
      observer.observe(imageRef.current);
    }else start();
    return ()=>{
      alive=false;observer?.disconnect();
      window.removeEventListener(STATEMENT_PRINT_PREPARE_EVENT,start);
      if(url)URL.revokeObjectURL(url);
    };
  },[deferred,inlinedOriginal,thumbnail,original?.driveFileId,original?.localBlobId,original?.id]);

  return source ? (
    <img
      ref={node=>{imageRef.current=node;}}
      src={source}
      alt={alt}
      className={className}
      onClick={()=>onClick?.(source)}
      data-statement-photo-status={pending?'loading':source===thumbnail?'thumbnail':'original'}
      data-statement-original-expected={original&&(original.driveFileId||original.localBlobId)?'true':'false'}
      title={pending?'جاري تحميل الصورة الأصلية للطباعة':alt}
      loading="eager"
      decoding="async"
    />
  ) : (
    <span ref={node=>{imageRef.current=node;}} className="block text-[9px] text-slate-400 text-center" data-statement-photo-status={pending?'loading':'missing'}>
      {pending?'جاري تحميل الصورة الأصلية':'الصورة غير متاحة'}
    </span>
  );
};
