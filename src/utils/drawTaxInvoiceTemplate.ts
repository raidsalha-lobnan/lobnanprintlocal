// Reconstructed unsealed layout using the supplied form's field geometry.
export function drawTaxInvoiceTemplate(c: CanvasRenderingContext2D) {
  c.save(); c.strokeStyle='#111'; c.fillStyle='#111'; c.lineWidth=2.2;
  const line=(x:number,y:number,x2:number,y2:number)=>{c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();};
  const rect=(x:number,y:number,w:number,h:number,r=0)=>{c.beginPath();if(r)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);c.stroke();};
  const text=(s:string,x:number,y:number,size=24,rtl=false,align:CanvasTextAlign='left',bold=true)=>{c.direction=rtl?'rtl':'ltr';c.textAlign=align;c.textBaseline='middle';c.font=(bold?'bold ':'')+size+'px Arial, sans-serif';c.fillText(s,x,y);};
  const ar=(s:string,x:number,y:number,size=24,align:CanvasTextAlign='right')=>text(s,x,y,size,true,align);
  const dots=(x:number,y:number,x2:number)=>{c.save();c.setLineDash([2,2]);c.lineWidth=1.3;line(x,y,x2,y);c.restore();};
  rect(82,61,887,166,28);
  text('Talet Lobnan for General Trading',109,105,25);
  text('Falouja. beside Abu Olba for wheels',111,146,23);
  text('Mobile : 059-9992615 * 059-7080014',122,191,20);
  ar('طلة لبنان للتجارة العامة',945,105,27);
  ar('الفالوجا . بجوار بناشر أبو علبة',945,148,23);
  ar('جوال: 059-7080014 * 059-9992615',945,191,20);
  ar('طلة',545,104,22,'center'); ar('لبنان',545,160,49,'center');
  rect(87,238,247,30);ar('مشتغل مرخص 903187730',325,253,20);
  text('Original',127,289,23);ar('الأصل',294,289,23);
  text('Tax Invoice',372,250,27);ar('فاتورة ضريبية',661,250,25);
  text('B',409,289,40);
  text('Date: 20',694,270,20);text('/',810,273,20);text('/',857,273,20);ar('التاريخ:',950,273,20);
  text('Mr.',93,329,26);dots(140,337,767);ar('المطلوب من السيد /',955,329,24);
  text('Address:',93,370,25);dots(199,376,868);ar('العنوان /',955,370,24);
  rect(85,398,868,755,20);
  [293,446,554].forEach(x=>line(x,398,x,1153));
  [222,393].forEach(x=>line(x,459,x,1153));
  line(85,459,446,459);line(85,513,953,513);
  for(let i=1;i<=14;i++)line(85,513+i*42.65,953,513+i*42.65);
  ar('الصنف',770,427,27,'center');text('Item',770,482,31,false,'center',false);
  ar('الكمية',500,427,25,'center');text('Qty.',500,483,29,false,'center',false);
  ar('سعر الوحدة',369,422,24,'center');text('Unit Price',369,445,19,false,'center',false);
  ar('المبلغ',258,435,27,'center');text('Price',150,435,28,false,'center',false);
  for(const x of [155,342]){ar('شيكل',x,470,15,'center');ar('دولار',x,486,15,'center');ar('دينار',x,502,15,'center');}
  for(const x of [258,419]){ar('أغورة',x,470,14,'center');ar('سنت',x,486,14,'center');ar('فلس',x,502,14,'center');}
  rect(83,1153,212,162,18);line(222,1153,222,1315);line(83,1207,295,1207);line(83,1261,295,1261);
  text('Total',305,1187,29);ar('المجموع',482,1187,24);
  text('V.A.T.',305,1237,27);ar('الضريبة المضافة %',608,1237,24);
  text('Grand Total',300,1289,27);ar('المبلغ الإجمالي',604,1289,24);
  ar('توقيع المشتغل',953,1232,23);dots(640,1253,951);text('Signature',951,1270,23,false,'right');
  dots(83,1382,801);ar('المبلغ بالكلمات:',943,1376,23);
  c.restore();
}
