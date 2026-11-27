import React, { useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { tafqeet } from '../utils/tafqeet';
import { drawTaxInvoiceTemplate } from '../utils/drawTaxInvoiceTemplate';

type Line = { item: string; qty: string; price: string };
const blank = (): Line => ({ item: '', qty: '', price: '' });
const W = 1024, H = 1455, MAX = 9;
const prefix = 'tax-print-assets-v1:';
const read = (key: string) => { try { return localStorage.getItem(prefix + key) || ''; } catch { return ''; } };
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const fmt = (n: number) => (n / 100).toFixed(2);

export const TaxInvoicePrintView: React.FC = () => {
  const [template] = useState(() => read('template'));
  const font = new URL(import.meta.env.BASE_URL + 'fonts/tax-invoice/ArefRuqaa-Regular.ttf', document.baseURI).href;
  const [fontReady, setFontReady] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [serial, setSerial] = useState('');
  const [date, setDate] = useState('');
  const [customer, setCustomer] = useState('');
  const [address, setAddress] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [vat, setVat] = useState('');
  const [note, setNote] = useState('');
  const [words, setWords] = useState('');
  const [size, setSize] = useState(27);
  const [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = lines.filter(l => l.item.trim() || l.qty !== '' || l.price !== '');
  const validLine = (l: Line) => !!l.item.trim() && l.qty !== '' && l.price !== '' && Number.isFinite(Number(l.qty)) && Number(l.qty) > 0 && Number.isFinite(Number(l.price)) && Number(l.price) >= 0 && Number(l.price) <= 999999 && Number(l.qty) <= 999999 && Math.abs(Number(l.price)*100 - Math.round(Number(l.price)*100)) < 0.000001;
  const lineAmount = (l: Line) => cents((Number(l.qty) || 0) * (Number(l.price) || 0));
  const total = active.reduce((sum,l) => sum + lineAmount(l),0);
  const tax = Math.round(total * (Number(vat) || 0) / 100);
  const grand = total + tax;
  const amountWords = words.trim() || tafqeet(grand/100, 'شيكل', 'أغورة');
  const ready = fontReady && /^\d{1,12}$/.test(serial) && !!date && date.startsWith('20') && !!customer.trim() && active.length > 0 && active.every(validLine) && active.length + (note.trim() ? 1 : 0) <= MAX && vat !== '' && Number.isFinite(Number(vat)) && Number(vat) >= 0 && Number(vat) <= 100 && grand <= 9999999999;

  useEffect(() => {
    setImage(null);
    if (!template) return;
    let stopped = false;
    const img = new Image();
    img.onload = () => {
      if (stopped) return;
      if (Math.abs(img.width / img.height - W / H) > 0.025) { setMessage('تعذر استخدام الصورة المحفوظة سابقًا؛ يتم عرض النموذج المدمج غير المختوم.'); return; }
      setImage(img);
    };
    img.onerror = () => { if (!stopped) setMessage('تعذر فتح الصورة المحفوظة سابقًا؛ يتم عرض النموذج المدمج غير المختوم.'); };
    img.src = template;
    return () => { stopped = true; };
  }, [template]);

  useEffect(() => {
    setFontReady(false);
    if (!font) return;
    let stopped = false;
    let face: FontFace | undefined;
    (async () => {
      try {
        face = new FontFace('TaxInvoiceHandwriting', 'url(' + font + ')');
        await face.load();
        if (stopped) return;
        document.fonts.add(face);
        setFontReady(true);
      } catch { if (!stopped) setMessage('تعذر تحميل الخط المدمج. أعد فتح الشاشة قبل الطباعة.'); }
    })();
    return () => { stopped = true; if (face) document.fonts.delete(face); };
  }, [font]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = 2048; c.height = 2910;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(2,2);
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
    if (image) ctx.drawImage(image,0,0,W,H); else drawTaxInvoiceTemplate(ctx);
    // Replace only the original serial digits, leaving the printed prefix B.
    ctx.fillStyle = '#fff'; ctx.fillRect(449,269,220,42);
    ctx.fillStyle = '#d40000'; ctx.font = '34px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.fillText(serial,454,289,210);
    const hand = (value: string,x: number,y: number,width: number,rtl = true,sz = size) => {
      if (!value) return;
      ctx.save(); ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#153b9e';
      const family = fontReady ? 'TaxInvoiceHandwriting' : 'Arial';
      ctx.font = sz + 'px "' + family + '"';
      // Fit the complete connected phrase; never split Arabic letter shaping.
      let fitted = sz;
      const setFont = () => { ctx.font = fitted + 'px "' + family + '"'; };
      setFont();
      while (fitted > 12 && (ctx.measureText(value).width > width - 4 || ctx.measureText(value).actualBoundingBoxAscent + ctx.measureText(value).actualBoundingBoxDescent > 34)) { fitted -= 0.5; setFont(); }
      ctx.fillText(value,x,y,width - 4);
      ctx.restore();
    };
    const split = (n: number, y: number, whole: number, frac: number) => {
      const abs = Math.abs(n);
      hand(String(Math.floor(abs/100)),whole,y,whole===342 ? 92 : 127,false,Math.min(size,28));
      hand(String(abs%100).padStart(2,'0'),frac,y,45,false,Math.min(size,26));
    };
    const parts = date.split('-');
    if (parts.length === 3) {
      hand(parts[0].slice(2),790,270,32,false,23);
      hand(parts[1],836,270,35,false,23);
      hand(parts[2],875,270,27,false,23);
    }
    hand(customer,758,322,608);
    hand(address,855,361,649);
    active.slice(0,MAX).forEach((l,i) => {
      const y = 534 + i * 42.5;
      hand(l.item,939,y,373);
      hand(l.qty,500,y,98,false);
      if (l.price !== '') split(cents(Number(l.price)||0),y,342,419);
      if (l.qty !== '' && l.price !== '') split(lineAmount(l),y,154,258);
    });
    if (note.trim() && active.length < MAX) hand(note,939,534 + active.length * 42.5,373);
    split(total,1181,154,258);
    split(tax,1234,154,258);
    split(grand,1288,154,258);
    hand(vat === '' ? '' : vat,416,1234,38,false,22);
    hand(amountWords,793,1365,700,true,Math.min(size,26));
    ctx.save(); ctx.direction='rtl'; ctx.textAlign='center'; ctx.font='15px Arial'; ctx.fillStyle='#555'; ctx.fillText('نسخة إلكترونية — تعبئة رقمية بخط عربي',512,1424); ctx.restore();
  },[image,fontReady,serial,date,customer,address,lines,vat,note,words,size]);

  const update = (index: number,key: keyof Line,value: string) => setLines(old => old.map((l,i) => i===index ? {...l,[key]:value} : l));
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
  const reset=()=>{setSerial('');setDate('');setCustomer('');setAddress('');setLines([blank()]);setVat('');setNote('');setWords('');};
  return <section dir="rtl" className="w-full min-w-0 text-slate-900 space-y-3 print:hidden">
    <header className="flex flex-wrap justify-between items-center gap-2"><div><h1 className="text-xl font-bold">فاتورة ضريبية</h1><p className="text-sm text-slate-600">نسخة طباعة لعملية مسجلة فعليًا — لا ترحيل محاسبي ولا حركة مخزون. البيانات المدخلة لا تحفظ كسجل مبيعات.</p></div><button type="button" onClick={reset} className="border rounded px-3 py-2">نموذج جديد</button></header>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <div className="bg-white border rounded-lg p-3 space-y-3">
        <p className="text-xs text-slate-500">النموذج والخط العربي جاهزان تلقائيًا. {image ? 'تم استخدام صورة النموذج المحفوظة سابقًا على الجهاز.' : 'النموذج المدمج إعادة رسم غير مختومة؛ التوقيع والختم الفعليان عند الاعتماد.'} {fontReady ? 'الخط جاهز.' : 'جاري تجهيز الخط.'}</p>
        {message && <p role="status" className="text-sm text-blue-800">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label>رقم الفاتورة<input className={field} dir="ltr" inputMode="numeric" maxLength={12} value={serial} onChange={e=>setSerial(e.target.value.replace(/[^0-9]/g,''))} placeholder="0000316"/></label>
          <label>التاريخ<input className={field} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
          <label className="col-span-2">اسم العميل<input className={field} value={customer} onChange={e=>setCustomer(e.target.value)}/></label>
          <label className="col-span-2">العنوان<input className={field} value={address} onChange={e=>setAddress(e.target.value)}/></label>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[460px]"><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>المبلغ</th><th></th></tr></thead><tbody>
          {lines.map((l,i)=><tr key={i}><td><input aria-label={'الصنف '+(i+1)} className={field} value={l.item} onChange={e=>update(i,'item',e.target.value)}/></td><td><input aria-label="الكمية" className={field+' min-w-16'} type="number" min="0" step="any" value={l.qty} onChange={e=>update(i,'qty',e.target.value)}/></td><td><input aria-label="سعر الوحدة" className={field+' min-w-20'} type="number" min="0" step=".01" value={l.price} onChange={e=>update(i,'price',e.target.value)}/></td><td className="px-1 whitespace-nowrap">{fmt(lineAmount(l))}</td><td><button type="button" aria-label="حذف البند" onClick={()=>setLines(old=>old.length===1?[blank()]:old.filter((_,j)=>i!==j))}>×</button></td></tr>)}
        </tbody></table></div>
        <button type="button" disabled={lines.length>=MAX} onClick={()=>setLines(old=>[...old,blank()])} className="border rounded px-3 py-1 disabled:opacity-50">+ إضافة بند</button>
        <p className="text-xs text-slate-500">حتى تسعة أسطر فوق الختم، بما فيها سطر الملاحظات.</p>
        <label className="block">الملاحظات<input className={field} value={note} onChange={e=>setNote(e.target.value)}/></label>
        <div className="grid grid-cols-2 gap-2"><label>نسبة الضريبة % (أدخل 0 عند عدم وجودها)<input className={field} type="number" min="0" max="100" step=".01" value={vat} onChange={e=>setVat(e.target.value)}/></label><div className="text-sm space-y-1"><div>المجموع: {fmt(total)} ₪</div><div>الضريبة: {fmt(tax)} ₪</div><strong>الإجمالي: {fmt(grand)} ₪</strong></div></div>
        <label className="block">المبلغ بالكلمات (تلقائي وقابل للتعديل)<input className={field} value={words} placeholder={amountWords} onChange={e=>setWords(e.target.value)}/></label>
        <label className="block text-sm">حجم الخط: {size}<input className="w-full" type="range" min="20" max="35" value={size} onChange={e=>setSize(Number(e.target.value))}/></label>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!ready} onClick={print} className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-40">طباعة</button><button type="button" disabled={!ready} onClick={exportPdf} className="bg-slate-800 text-white rounded px-4 py-2 disabled:opacity-40">حفظ PDF</button></div>
        {!ready && <p className="text-xs text-slate-600">أكمل الرقم والتاريخ والعميل والبنود والضريبة وانتظر جاهزية الخط المدمج لتفعيل الإخراج.</p>}
      </div>
      <div className="border rounded-lg bg-white p-2"><h2 className="font-semibold text-sm mb-2">معاينة مباشرة</h2><canvas ref={canvas} className="w-full h-auto border"/></div>
    </div>
  </section>;
};
