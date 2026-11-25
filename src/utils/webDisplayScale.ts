// Browser-only display preference. Never write to the financial database.
export const WEB_DISPLAY_SCALES=Array.from({length:16},(_,i)=>75+i*5);
const KEY='lobnan_web_display_scale_v1';
const native=()=>Boolean((globalThis as unknown as {electronAPI?:{isElectron?:boolean}}).electronAPI?.isElectron);
export function readWebDisplayScale():number{
 try{
  const value=Number(localStorage.getItem(KEY));
  return WEB_DISPLAY_SCALES.includes(value)?value:100;
 }catch{return 100;}
}
export function applyWebDisplayScale(percent:number):void{
 if(native()||!WEB_DISPLAY_SCALES.includes(percent))return;
 const root=document.documentElement;
 if(percent===100){
  root.removeAttribute('data-lobnan-web-display-scale');
  root.style.removeProperty('--lobnan-web-display-scale');
 }else{
  root.setAttribute('data-lobnan-web-display-scale','true');
  root.style.setProperty('--lobnan-web-display-scale',String(percent/100));
 }
}
export function setWebDisplayScale(percent:number):void{
 if(native()||!WEB_DISPLAY_SCALES.includes(percent))return;
 applyWebDisplayScale(percent);
 try{localStorage.setItem(KEY,String(percent));}catch{}
}
