import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { tafqeet } from '../utils/tafqeet';
import templateUrl from '../assets/tax-invoice/original-clean.png?url';
import { useAccounting } from '../context/AccountingContext';

type Line = { item: string; qty: string; price: string; fontSize?: number };
type HandStyle = 'ruqaa' | 'lemonada' | 'katibeh' | 'lateef' | 'playpen' | 'mikhak' | 'marhey' | 'ruwudu' | 'rakkas' | 'alkalami';
const fontNames: Record<HandStyle,string> = {ruqaa:'TaxInvoiceHandwriting',lemonada:'TaxInvoiceCasual',katibeh:'TaxInvoiceKatibeh',lateef:'TaxInvoiceLateef',playpen:'TaxInvoicePlaypen',mikhak:'TaxInvoiceMikhak',marhey:'TaxInvoiceMarhey',ruwudu:'TaxInvoiceRuwudu',rakkas:'TaxInvoiceRakkas',alkalami:'TaxInvoiceAlkalami'};
const fontFiles: Record<HandStyle,string> = {ruqaa:'ArefRuqaa-Regular.ttf',lemonada:'Lemonada.ttf',katibeh:'Katibeh-Regular.ttf',lateef:'Lateef-Regular.ttf',playpen:'PlaypenSansArabic.ttf',mikhak:'Mikhak-Light.ttf',marhey:'Marhey.ttf',ruwudu:'Ruwudu-Regular.ttf',rakkas:'Rakkas-Regular.ttf',alkalami:'Alkalami-Regular.ttf'};
const MAX_FONT_SIZE = 60;
const fontSpec = (style: HandStyle, size: number, playpenWeight = 300) => (style === 'playpen' ? playpenWeight : style === 'lemonada' || style === 'marhey' ? 300 : 400) + ' ' + size + 'px "' + fontNames[style] + '"';
const clampSize = (n: number) => Math.max(12,Math.min(MAX_FONT_SIZE,n));
const autoItemSize = (text: string, base: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clampSize(base + (words <= 2 ? 5 : words <= 4 ? 2 : words <= 7 ? 0 : -Math.min(9,words-7)));
};
function fitSize(ctx: CanvasRenderingContext2D, text: string, width: number, desired: number, style: HandStyle, ready: boolean, maxHeight = 34, playpenWeight = 300) {
  let fitted = clampSize(desired);
  const measure = () => {
    ctx.font = ready ? fontSpec(style,fitted,playpenWeight) : fitted + 'px Arial';
    return ctx.measureText(text);
  };
  let m = measure();
  while (fitted > 12 && (m.width > width-4 || m.actualBoundingBoxAscent+m.actualBoundingBoxDescent > maxHeight)) {
    fitted = Math.max(12,fitted-0.5); m=measure();
  }
  return fitted;
}
type HeaderFontKey = 'customer' | 'address' | 'date' | 'note' | 'total' | 'vat' | 'grand' | 'words';
const headerFontFields: { key: HeaderFontKey; label: string }[] = [
  {key:'address',label:'العنوان'},
  {key:'date',label:'التاريخ'}, {key:'note',label:'الملاحظات'},
  {key:'total',label:'المجموع'}, {key:'vat',label:'الضريبة'},
  {key:'grand',label:'الإجمالي'}, {key:'words',label:'المبلغ بالكلمات'}
];
const blank = (): Line => ({ item: '', qty: '', price: '' });
const W = 1024, H = 1455, MAX = 15;
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const fmt = (n: number) => (n / 100).toFixed(2);

export const TaxInvoicePrintView: React.FC = () => {
  const template = templateUrl;
  const { settings } = useAccounting();
  const stampUrl = settings.stampUrl?.trim() || '';
  const [style,setStyle] = useState<HandStyle>('playpen');
  const [playpenWeight,setPlaypenWeight] = useState(300);
  const [contextual,setContextual] = useState(true);
  const [alternate,setAlternate] = useState<'standard'|'ss01'|'ss02'>('standard');
  const featureSettings = style==='playpen' ? '"calt" '+(contextual?'1':'0')+', "ss01" '+(alternate==='ss01'?'1':'0')+', "ss02" '+(alternate==='ss02'?'1':'0') : 'normal';
  const fontKey = style+':'+featureSettings;
  const [loadedStyle,setLoadedStyle] = useState<string | null>(null);
  const fontReady = loadedStyle === fontKey;
  const font = new URL(import.meta.env.BASE_URL + 'fonts/tax-invoice/' + fontFiles[style], document.baseURI).href;
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadedStamp,setLoadedStamp] = useState<{url:string;image:HTMLImageElement} | null>(null);
  const stampImage = loadedStamp?.url === stampUrl ? loadedStamp.image : null;
  const [applyStamp,setApplyStamp] = useState(false);
  const [stampFailed,setStampFailed] = useState(false);
  const [serial, setSerial] = useState('');
  const [date, setDate] = useState('');
  const [customer, setCustomer] = useState('');
  const [address, setAddress] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [vat, setVat] = useState('');
  const [note, setNote] = useState('');
  const [words, setWords] = useState('');
  const [size, setSize] = useState(27);
  const [cancelEmpty, setCancelEmpty] = useState(true);
  const [headerSizes, setHeaderSizes] = useState<Partial<Record<HeaderFontKey, number>>>({});
  const [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = lines.filter(l => l.item.trim() || l.qty !== '' || l.price !== '');
  const customerWanted = headerSizes.customer ?? autoItemSize(customer,size);
  const customerSize = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    return ctx ? fitSize(ctx,customer,608,customerWanted,style,fontReady,40,playpenWeight) : customerWanted;
  },[customer,customerWanted,style,fontReady,playpenWeight]);
  const rowSizes = useMemo(() => {
    const ctx=document.createElement('canvas').getContext('2d');
    return lines.map(l=>{
      const wanted=l.fontSize ?? autoItemSize(l.item,size);
      return ctx ? fitSize(ctx,l.item,373,wanted,style,fontReady,34,playpenWeight) : wanted;
    });
  },[lines,size,style,fontReady,playpenWeight]);
  const validLine = (l: Line) => !!l.item.trim() && l.qty !== '' && l.price !== '' && Number.isFinite(Number(l.qty)) && Number(l.qty) > 0 && Number.isFinite(Number(l.price)) && Number(l.price) >= 0 && Number(l.price) <= 999999 && Number(l.qty) <= 999999 && Math.abs(Number(l.price)*100 - Math.round(Number(l.price)*100)) < 0.000001;
  const lineAmount = (l: Line) => cents((Number(l.qty) || 0) * (Number(l.price) || 0));
  const total = active.reduce((sum,l) => sum + lineAmount(l),0);
  const tax = Math.round(total * (Number(vat) || 0) / 100);
  const grand = total + tax;
  const amountWords = words.trim() || tafqeet(grand/100, 'شيكل', 'أغورة');
  const ready = !!image && (!applyStamp || !!stampImage) && fontReady && /^\d{1,12}$/.test(serial) && !!date && date.startsWith('20') && !!customer.trim() && active.length > 0 && active.every(validLine) && active.length + (note.trim() ? 1 : 0) <= MAX && vat !== '' && Number.isFinite(Number(vat)) && Number(vat) >= 0 && Number(vat) <= 100 && grand <= 9999999999;

  useEffect(() => {
    setImage(null);
    if (!template) return;
    let stopped = false;
    const img = new Image();
    img.onload = () => {
      if (stopped) return;
      if (Math.abs(img.width / img.height - W / H) > 0.025) { setMessage('أبعاد النموذج الأصلي المدمج غير صحيحة.'); return; }
      setImage(img);
    };
    img.onerror = () => { if (!stopped) setMessage('تعذر فتح النموذج الأصلي المدمج. أعد فتح الشاشة.'); };
    img.src = template;
    return () => { stopped = true; };
  }, [template]);

  useEffect(() => {
    setLoadedStamp(null);
    setStampFailed(false);
    if (!stampUrl) { setApplyStamp(false); return; }
    let stopped=false;
    const img=new Image();
    if (!/^(data:|blob:)/i.test(stampUrl)) img.crossOrigin='anonymous';
    img.onload=()=>{if(!stopped)setLoadedStamp({url:stampUrl,image:img});};
    img.onerror=()=>{if(!stopped){setStampFailed(true);setApplyStamp(false);}};
    img.src=stampUrl;
    return ()=>{stopped=true;};
  },[stampUrl]);

  useEffect(() => {
    setLoadedStyle(null);
    if (!font) return;
    let stopped = false;
    let face: FontFace | undefined;
    (async () => {
      try {
        face = new FontFace(fontNames[style], 'url(' + font + ')', {weight:style==='lemonada'||style==='marhey'?'300 700':style==='playpen'?'100 800':'400',featureSettings});
        await face.load();
        if (stopped) return;
        document.fonts.add(face);
        setLoadedStyle(fontKey);
        setMessage('');
      } catch { if (!stopped) setMessage('تعذر تحميل الخط المدمج. أعد فتح الشاشة قبل الطباعة.'); }
    })();
    return () => { stopped = true; if (face) document.fonts.delete(face); };
  }, [font,style,featureSettings,fontKey]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !image) return;
    c.width = 2048; c.height = 2910;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(2,2);
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
    ctx.drawImage(image,0,0,W,H);
    // Resize the original printed B glyph only; retain the original template elsewhere.
    ctx.fillStyle='#fff';ctx.fillRect(405,269,38,42);
    ctx.drawImage(image,409*image.width/W,271*image.height/H,28*image.width/W,35*image.height/H,416,275,22,28);
    // Draw the entered serial in red without altering its digits.
    ctx.fillStyle = '#d40000'; ctx.font = '34px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.fillText(serial,454,289,210);
    const hand = (value: string,x: number,y: number,width: number,rtl = true,sz = size,maxHeight = 34) => {
      if (!value) return;
      ctx.save(); ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#153b9e';
      // Measure and fit complete Arabic phrases, preserving contextual shaping.
      ctx.textBaseline = 'alphabetic';
      fitSize(ctx,value,width,sz,style,fontReady,maxHeight,playpenWeight);
      const ink=ctx.measureText(value);
      const baseline=y+(ink.actualBoundingBoxAscent-ink.actualBoundingBoxDescent)/2;
      ctx.fillText(value,x,baseline,width - 4);
      ctx.restore();
    };
    const split = (n: number, y: number, whole: number, frac: number, sz = size) => {
      const abs = Math.abs(n);
      hand(String(Math.floor(abs/100)),whole,y,whole===342 ? 92 : 127,false,sz);
      hand(String(abs%100).padStart(2,'0'),frac,y,45,false,sz);
    };
    const parts = date.split('-');
    if (parts.length === 3) {
      hand(parts[0].slice(2),790,270,32,false,headerSizes.date ?? 23);
      hand(parts[1],836,270,35,false,headerSizes.date ?? 23);
      hand(parts[2],875,270,27,false,headerSizes.date ?? 23);
    }
    hand(customer,758,319,608,true,customerWanted,40);
    hand(address,855,361,649,true,headerSizes.address ?? size);
    active.slice(0,MAX).forEach((l,i) => {
      const y = 534 + i * 42.5;
      const rowSize = l.fontSize ?? autoItemSize(l.item,size);
      hand(l.item,939,y,373,true,rowSize);
      hand(l.qty,500,y,98,false,rowSize);
      if (l.price !== '') split(cents(Number(l.price)||0),y,342,419,rowSize);
      if (l.qty !== '' && l.price !== '') split(lineAmount(l),y,154,258,rowSize);
    });
    if (note.trim() && active.length < MAX) hand(note,939,534 + active.length * 42.5,373,true,headerSizes.note ?? size);
    const occupied = Math.min(MAX,active.length+(note.trim()?1:0));
    if (cancelEmpty && active.length > 0 && occupied < MAX) {
      const top = 513 + occupied * (640/MAX) + 10;
      const bottom = 1153 - 10;
      if (bottom > top) {
        ctx.save(); ctx.strokeStyle='#153b9e'; ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.beginPath(); ctx.moveTo(99,top); ctx.lineTo(939,top); ctx.lineTo(99,bottom); ctx.lineTo(939,bottom); ctx.stroke(); ctx.restore();
      }
    }
    split(total,1181,154,258,headerSizes.total ?? size);
    if (vat !== '') {
      if (tax === 0) {
        // One centered dash per VAT amount cell, scaled to its actual width.
        ctx.save();
        ctx.strokeStyle = '#153b9e';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        for (const [left, right] of [[85,222],[222,293]]) {
          const mid = (left + right) / 2;
          const half = (right - left) * 0.32;
          ctx.beginPath();
          ctx.moveTo(mid - half, 1235);
          ctx.lineTo(mid + half, 1233);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        split(tax,1234,154,258,headerSizes.vat ?? size);
      }
    }
    split(grand,1288,154,258,headerSizes.grand ?? size);
    if (vat !== '' && Number(vat) > 0) hand(vat,416,1234,38,false,headerSizes.vat ?? 22);
    hand(amountWords,793,1365,700,true,headerSizes.words ?? Math.min(size,26));
    // Match the official 3.5 cm stamp used in sales printouts.
    // Preserve the uploaded artwork, aspect ratio and ink colors.
    if (applyStamp && stampImage) {
      const maxSize=35*W/210;
      const ratio=Math.min(maxSize/stampImage.naturalWidth,maxSize/stampImage.naturalHeight);
      const sw=stampImage.naturalWidth*ratio, sh=stampImage.naturalHeight*ratio;
      ctx.save();
      ctx.translate(717,1240);
      ctx.globalCompositeOperation='multiply';
      ctx.drawImage(stampImage,-sw/2,-sh/2,sw,sh);
      ctx.restore();
    }
  },[image,fontReady,style,serial,date,customer,customerWanted,address,lines,vat,note,words,size,headerSizes,cancelEmpty,playpenWeight,stampImage,applyStamp]);

  const update = (index: number,key: 'item' | 'qty' | 'price',value: string) => setLines(old => old.map((l,i) => i===index ? {...l,[key]:value} : l));
  const exportPdf = () => {
    if (!ready || !canvas.current) return;
    try {
      const pdf = new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
      const w=Math.min(210,297*W/H), h=w*H/W;
      pdf.addImage(canvas.current.toDataURL('image/png'),'PNG',(210-w)/2,(297-h)/2,w,h);
      pdf.save('tax-invoice-'+serial+'.pdf');
    } catch { setMessage('تعذر حفظ PDF.'); }
  };
  const print = () => {
    if (!ready || !canvas.current) return;
    const frame = document.createElement('iframe');
    frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';
    document.body.appendChild(frame);
    const doc=frame.contentDocument;
    if (!doc || !frame.contentWindow) { frame.remove(); setMessage('تعذر فتح الطباعة. استخدم حفظ PDF.'); return; }
    doc.open(); doc.write('<!doctype html><html><head><title>Tax invoice</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0}img{display:block;width:210mm;height:auto;max-height:297mm;object-fit:contain}</style></head><body></body></html>'); doc.close();
    const img=doc.createElement('img');
    img.onload=()=>{const win=frame.contentWindow; if (!win) return; win.addEventListener('afterprint',()=>frame.remove(),{once:true}); try {win.focus();win.print();} catch {frame.remove();setMessage('تعذر فتح الطباعة. استخدم حفظ PDF.');}};
    img.onerror=()=>{frame.remove();setMessage('تعذر تجهيز الصورة للطباعة.');};
    doc.body.appendChild(img); img.src=canvas.current.toDataURL('image/png');
  };
  const field='w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white text-slate-900';
  const reset=()=>{setSerial('');setDate('');setCustomer('');setAddress('');setLines([blank()]);setVat('');setNote('');setWords('');setApplyStamp(false);};
  return <section dir="rtl" className="w-full min-w-0 text-slate-900 space-y-3 print:hidden">
    <header className="flex flex-wrap justify-between items-center gap-2"><div><h1 className="text-xl font-bold">فاتورة ضريبية</h1><p className="text-sm text-slate-600">نسخة طباعة لعملية مسجلة فعليًا — لا ترحيل محاسبي ولا حركة مخزون. البيانات المدخلة لا تحفظ كسجل مبيعات.</p></div><button type="button" onClick={reset} className="border rounded px-3 py-2">نموذج جديد</button></header>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <div className="bg-white border rounded-lg p-3 space-y-3">
        <p className="text-xs text-slate-500">{image ? 'صورة النموذج الأصلي مدمجة دون الرقم التسلسلي السابق والختم.' : 'جاري تحميل النموذج الأصلي.'} {fontReady ? 'الخط جاهز.' : 'جاري تجهيز الخط.'}</p>
        {message && <p role="status" className="text-sm text-blue-800">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label>رقم الفاتورة<input className={field} dir="ltr" inputMode="numeric" maxLength={12} value={serial} onChange={e=>setSerial(e.target.value.replace(/[^0-9]/g,''))} placeholder="0000316"/></label>
          <label>التاريخ<input className={field} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
          <div className="col-span-2"><label htmlFor="tax-customer-name">اسم العميل</label><div className="flex flex-wrap items-center gap-2"><input id="tax-customer-name" className={field+' flex-1 min-w-[140px]'} value={customer} onChange={e=>setCustomer(e.target.value)}/><div className="flex items-center gap-1" dir="ltr"><button type="button" aria-label="تصغير خط اسم العميل" disabled={customerWanted<=12} className="border rounded px-3 py-1 disabled:opacity-40" onClick={()=>setHeaderSizes(old=>({...old,customer:clampSize(customerWanted-1)}))}>−</button><span className="tabular-nums min-w-[30px] text-center" aria-label="حجم خط اسم العميل">{customerWanted}</span><button type="button" aria-label="تكبير خط اسم العميل" disabled={customerWanted>=MAX_FONT_SIZE} className="border rounded px-3 py-1 disabled:opacity-40" onClick={()=>setHeaderSizes(old=>({...old,customer:clampSize(customerWanted+1)}))}>+</button></div><button type="button" className="text-sm text-blue-700 border rounded px-2 py-1" onClick={()=>setHeaderSizes(old=>({...old,customer:undefined}))}>{headerSizes.customer===undefined?'تلقائي ✓':'عودة للتلقائي'}</button></div>{customerSize<customerWanted&&<p className="text-xs text-slate-500">الحجم الفعلي داخل الخانة: {customerSize} (ملاءمة تلقائية لحدود النموذج)</p>}</div>
          <label className="col-span-2">العنوان<input className={field} value={address} onChange={e=>setAddress(e.target.value)}/></label>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[460px]"><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>المبلغ</th><th>حجم الخط</th><th></th></tr></thead><tbody>
          {lines.map((l,i)=><tr key={i}><td><input aria-label={'الصنف '+(i+1)} className={field} value={l.item} onChange={e=>update(i,'item',e.target.value)}/></td><td><input aria-label="الكمية" className={field+' min-w-16'} type="number" min="0" step="any" value={l.qty} onChange={e=>update(i,'qty',e.target.value)}/></td><td><input aria-label="سعر الوحدة" className={field+' min-w-20'} type="number" min="0" step=".01" value={l.price} onChange={e=>update(i,'price',e.target.value)}/></td><td className="px-1 whitespace-nowrap">{fmt(lineAmount(l))}</td><td className="min-w-[115px]"><div className="flex items-center justify-center gap-1" dir="ltr"><button type="button" aria-label={'تصغير خط البند '+(i+1)} disabled={(l.fontSize ?? autoItemSize(l.item,size))<=12} className="border rounded px-2 py-1 disabled:opacity-40" onClick={()=>setLines(old=>old.map((row,j)=>j===i?{...row,fontSize:clampSize((row.fontSize ?? autoItemSize(row.item,size))-1)}:row))}>−</button><span className="tabular-nums min-w-[28px] text-center">{l.fontSize ?? autoItemSize(l.item,size)}</span><button type="button" aria-label={'تكبير خط البند '+(i+1)} disabled={(l.fontSize ?? autoItemSize(l.item,size))>=MAX_FONT_SIZE} className="border rounded px-2 py-1 disabled:opacity-40" onClick={()=>setLines(old=>old.map((row,j)=>j===i?{...row,fontSize:clampSize((row.fontSize ?? autoItemSize(row.item,size))+1)}:row))}>+</button></div><button type="button" className="block mx-auto text-xs text-blue-700" onClick={()=>setLines(old=>old.map((row,j)=>j===i?{...row,fontSize:undefined}:row))}>{l.fontSize===undefined?'تلقائي ✓':'عودة للتلقائي'}</button>{rowSizes[i]<(l.fontSize ?? autoItemSize(l.item,size))&&<span className="block text-center text-xs text-slate-500">فعلي: {rowSizes[i]}</span>}</td><td><button type="button" aria-label="حذف البند" onClick={()=>setLines(old=>old.length===1?[blank()]:old.filter((_,j)=>i!==j))}>×</button></td></tr>)}
        </tbody></table></div>
        <button type="button" disabled={lines.length>=MAX} onClick={()=>setLines(old=>[...old,blank()])} className="border rounded px-3 py-1 disabled:opacity-50">+ إضافة بند</button>
        <p className="text-xs text-slate-500">حتى 15 سطرًا، بما فيها سطر الملاحظات.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cancelEmpty} onChange={e=>setCancelEmpty(e.target.checked)}/> شطب الصفوف الفارغة تلقائيًا بحرف Z</label>
        <label className="block">الملاحظات<input className={field} value={note} onChange={e=>setNote(e.target.value)}/></label>
        <div className="grid grid-cols-2 gap-2"><label>نسبة الضريبة % (أدخل 0 عند عدم وجودها)<input className={field} type="number" min="0" max="100" step=".01" value={vat} onChange={e=>setVat(e.target.value)}/></label><div className="text-sm space-y-1"><div>المجموع: {fmt(total)} ₪</div><div>الضريبة: {fmt(tax)} ₪</div><strong>الإجمالي: {fmt(grand)} ₪</strong></div></div>
        <label className="block">المبلغ بالكلمات (تلقائي وقابل للتعديل)<input className={field} value={words} placeholder={amountWords} onChange={e=>setWords(e.target.value)}/></label>
        <label className="block text-sm">نمط الخط العربي<select className={field} value={style} onChange={e=>setStyle(e.target.value as HandStyle)}><option value="ruqaa">رقعة — Aref Ruqaa</option><option value="lemonada">خط عربي حر خفيف — Lemonada</option><option value="katibeh">خط عربي بقلم عريض — Katibeh</option><option value="lateef">خط عربي لين — Lateef</option><option value="playpen">كتابة يدوية عربية — Playpen Sans Arabic</option><option value="mikhak">Mikhak Light — شبه يدوي خفيف</option><option value="marhey">Marhey Light — حروف مرسومة يدويًا</option><option value="ruwudu">Ruwudu — كتابة عربية تقليدية</option><option value="rakkas">Rakkas — رقعة حرة</option><option value="alkalami">Alkalami — كتابة بالقلم</option></select></label>
        {style==='playpen'&&<div className="border rounded p-2 space-y-2"><h3 className="text-sm font-medium">إعدادات Playpen للكتابة العربية</h3><label className="block text-sm">سماكة القلم: {playpenWeight}<input className="w-full" type="range" min="100" max="800" step="50" value={playpenWeight} onChange={e=>setPlaypenWeight(Number(e.target.value))}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contextual} onChange={e=>setContextual(e.target.checked)}/> الأشكال السياقية للحروف (calt)</label><label className="block text-sm">أشكال الحروف الاختيارية<select className={field} value={alternate} onChange={e=>setAlternate(e.target.value as typeof alternate)}><option value="standard">الافتراضي</option><option value="ss01">مجموعة بدائل 1</option><option value="ss02">مجموعة بدائل 2</option></select></label><p className="text-xs text-slate-500">تتغير الأشكال حسب الحروف التي يدعمها الخط. تبقى بيانات الفاتورة كما هي.</p><button type="button" className="border rounded px-2 py-1 text-sm" onClick={()=>{setPlaypenWeight(300);setContextual(true);setAlternate('standard');}}>استعادة إعدادات الخط</button></div>}
        <p className="text-xs text-slate-500">الحجم التلقائي يتغير بحسب عدد الكلمات وعرضها الحقيقي. يمكن تعديل كل بند بعلامتي + و− ضمن مساحة الخانة.</p>
        <label className="block text-sm">حجم الخط العام: {size}<input className="w-full" type="range" min="12" max={MAX_FONT_SIZE} value={size} onChange={e=>setSize(Number(e.target.value))}/></label>
        <details className="border rounded p-2"><summary className="cursor-pointer text-sm font-medium">أحجام خطوط الخانات الأخرى</summary><div className="grid grid-cols-2 gap-2 mt-2">{headerFontFields.map(({key,label})=><label key={key} className="text-sm">{label}<select className={field} value={headerSizes[key] ?? ''} onChange={e=>{const value=e.target.value;setHeaderSizes(old=>({...old,[key]:value===''?undefined:Number(value)}));}}><option value="">افتراضي</option>{Array.from({length:MAX_FONT_SIZE-11},(_,j)=>j+12).map(n=><option key={n} value={n}>{n}</option>)}</select></label>)}</div><button type="button" className="border rounded px-2 py-1 mt-2 text-sm" onClick={()=>{setHeaderSizes({});setLines(old=>old.map(l=>({...l,fontSize:undefined})));setSize(27);}}>إعادة الأحجام الافتراضية</button></details>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={applyStamp} disabled={!stampImage} onChange={e=>setApplyStamp(e.target.checked)}/> اعتماد وإضافة الختم الرسمي لهذه النسخة</label>
        {!stampUrl&&<p className="text-xs text-slate-500">لا يوجد ختم محفوظ في إعدادات المنشأة.</p>}
        {stampFailed&&<p role="status" className="text-xs text-red-700">تعذر تحميل الختم الرسمي من الإعدادات؛ يمكن الطباعة دون الختم.</p>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!ready} onClick={print} className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-40">طباعة</button><button type="button" disabled={!ready} onClick={exportPdf} className="bg-slate-800 text-white rounded px-4 py-2 disabled:opacity-40">حفظ PDF</button></div>
        {!ready && <p className="text-xs text-slate-600">أكمل الرقم والتاريخ والعميل والبنود والضريبة وانتظر جاهزية الخط المدمج لتفعيل الإخراج.</p>}
      </div>
      <div className="border rounded-lg bg-white p-2"><h2 className="font-semibold text-sm mb-2">معاينة مباشرة</h2><canvas ref={canvas} className="w-full h-auto border"/></div>
    </div>
  </section>;
};
