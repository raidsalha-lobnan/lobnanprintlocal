/**
 * Chrome's native Print captures the DOM at print time. Newly uploaded
 * high-resolution item photos can still be loading from Drive/IndexedDB
 * after their 120px placeholder has appeared. Wait for them before printing.
 */
export async function waitForStatementPrintPhotos(timeoutMs=18000):Promise<boolean>{
  const started=Date.now();
  while(document.querySelector('[data-statement-photo-status="loading"]')){
    if(Date.now()-started>timeoutMs)return false;
    await new Promise<void>(resolve=>setTimeout(resolve,120));
  }
  const incomplete=document.querySelector(
    'img[data-statement-original-expected="true"]:not([data-statement-photo-status="original"])'
  );
  if(incomplete)return false;
  const photos=Array.from(document.querySelectorAll<HTMLImageElement>(
    'img[data-statement-photo-status="original"]'
  ));
  await Promise.all(photos.map(img=>img.decode().catch(()=>{})));
  return photos.every(img=>img.complete&&img.naturalWidth>0);
}
