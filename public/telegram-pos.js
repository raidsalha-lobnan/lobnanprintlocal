/* Telegram Mini App cashier. All accounting totals are recomputed on the server
   by the SAME shared POS builder used by the main application. */
(()=>{
'use strict';
const telegram=window.Telegram?.WebApp;
const initData=telegram?.initData||'';
const API='https://lobnan-api.shares.zrok.io/api/v1/telegram/mini/';
const el=id=>document.getElementById(id);
const format=v=>'₪ '+Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const todayLocal=()=>{
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={people:[],treasuries:[],vatRate:0,lines:[],draftId:crypto.randomUUID(),
  busy:false,saved:false,lastReceipt:null,quickDone:false};
let searchTimer=0,searchEpoch=0;
const msg=(text,kind='')=>{
 const x=el('status');x.textContent=text;x.className='status '+kind;
};
const show=(name)=>{
 for(const id of ['notTelegram','pairPanel','cashier','success'])
  el(id).classList.toggle('hidden',name!==id);
};
const api=async(path,payload={})=>{
 if(!initData)throw Error('TELEGRAM_MINI_AUTH_REQUIRED');
 const controller=new AbortController();
 const abort=setTimeout(()=>controller.abort(),path==='commit'?90000:22000);
 try{
  const response=await fetch(API+path,{
   method:'POST',headers:{'Content-Type':'application/json','skip_zrok_interstitial':'1'},
   body:JSON.stringify({initData,...payload}),signal:controller.signal,cache:'no-store'
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Error(result?.code||'SERVER_HTTP_'+response.status);
  return result;
 }finally{clearTimeout(abort);}
};
const persistUi=()=>{
 try{localStorage.setItem('telegram_pos_last_customer',el('customer').value);
 localStorage.setItem('telegram_pos_last_treasury',el('treasury').value);}catch{}
};
const customerOptions=filter=>{
 const selected=el('customer').value||state.people.find(x=>x.code==='CUST-0001')?.id||'';
 const q=(filter||'').trim().toLowerCase();
 const people=state.people.filter(p=>!q||String(p.name||'').toLowerCase().includes(q)||
  String(p.code||'').toLowerCase().includes(q));
 const sel=el('customer');sel.replaceChildren();
 for(const p of people){
  const opt=document.createElement('option');opt.value=p.id;
  opt.textContent=p.name+' — '+p.code;sel.appendChild(opt);
 }
 if(people.some(x=>x.id===selected))sel.value=selected;
};
const customer=()=>state.people.find(x=>x.id===el('customer').value);
const account=()=>state.treasuries.find(x=>x.accountCode===el('treasury').value);
const lineQty=l=>l.hasDimensions?round((Number(l.length)||0)*(Number(l.width)||0)*(Number(l.count)||0)):(Number(l.quantity)||0);
const totals=()=>{
 const subtotal=round(state.lines.reduce((sum,l)=>sum+round(lineQty(l)*Number(l.unitPrice||0)),0));
 const discount=Number(el('discount').value||0);
 const base=Math.max(0,round(subtotal-discount));
 const vat=round(base*state.vatRate/100);
 const total=round(base+vat);
 el('subtotal').textContent=format(subtotal);
 el('discountSummary').textContent=format(discount);
 el('vatSummary').textContent=format(vat);
 el('grand').textContent=format(total);
 return {subtotal,discount,vat,total};
};
const renderLines=()=>{
 const container=el('items');container.replaceChildren();
 el('emptyItems').classList.toggle('hidden',state.lines.length>0);
 el('lineCount').textContent=state.lines.length+' / 25 بندًا';
 state.lines.forEach((line,index)=>{
  const panel=document.createElement('div');panel.className='line';
  panel.innerHTML=`
   <div class="line-head"><div><div class="line-title">${escapeHtml(line.name)}</div>
    <div class="line-subtitle">${escapeHtml(line.code)} · ${escapeHtml(line.unit)}</div></div>
    <button class="line-remove" data-remove="${index}">حذف</button></div>
   <div class="line-grid">
    <div><label>الكمية</label><input data-prop="quantity" data-index="${index}" type="number" min=".001" step=".001" value="${line.quantity}" ${line.hasDimensions?'disabled':''}/></div>
    <div><label>السعر (₪)</label><input data-prop="unitPrice" data-index="${index}" type="number" min="0" step=".01" value="${line.unitPrice}"/></div>
   </div>
   <label class="dim-options"><input data-prop="hasDimensions" data-index="${index}" type="checkbox" ${line.hasDimensions?'checked':''}/> صنف بالأبعاد (طول × عرض × عدد)</label>
   <div class="dim-grid ${line.hasDimensions?'':'hidden'}">
    <div><label>الطول</label><input data-index="${index}" data-prop="length" type="number" min=".001" step=".001" value="${line.length||1}"/></div>
    <div><label>العرض</label><input data-index="${index}" data-prop="width" type="number" min=".001" step=".001" value="${line.width||1}"/></div>
    <div><label>العدد</label><input data-index="${index}" data-prop="count" type="number" min="1" step="1" value="${line.count||1}"/></div>
   </div>
   <label>ملاحظات البند</label><input data-index="${index}" data-prop="notes" type="text" maxlength="300" value="${escapeHtml(line.notes||'')}"/>
   <div class="line-total">الإجمالي: <span>${format(round(lineQty(line)*line.unitPrice))}</span></div>`;
  container.appendChild(panel);
 });
 totals();
};
const addItem=item=>{
 if(state.lines.length>=25){msg('الحد الأقصى 25 بندًا في الفاتورة الواحدة','error');return;}
 clearTimeout(searchTimer);
 searchEpoch++; // Invalidate slow search replies before they can repopulate an old list.
 state.lines.push({itemId:item.id,name:item.name,code:item.code,unit:item.unit,
  unitPrice:Number(item.sellingPrice||0),quantity:1,
  hasDimensions:false,length:1,width:1,count:1,notes:''});
 el('itemSearch').value='';el('results').replaceChildren();
 renderLines();
 msg('تمت إضافة الصنف '+item.name+'. يمكنك إضافة صنف آخر إلى الفاتورة نفسها.','success');
};
const searchItems=async query=>{
 const current=++searchEpoch;
 if(query.trim().length<1){el('results').replaceChildren();return;}
 try{
  const result=await api('search',{query:query.trim()});
  if(current!==searchEpoch)return;
  const list=el('results');list.replaceChildren();
  const items=result.items||[];
  if(!items.length){list.textContent='لم يُعثر على صنف مطابق.';return;}
  for(const item of items){
   const b=document.createElement('button');b.type='button';b.className='result';
   b.innerHTML='<span><strong>'+escapeHtml(item.name)+'</strong><small>'+
    escapeHtml(item.code)+' • الرصيد: '+escapeHtml(item.stockQuantity)+'</small></span>'+
    '<span class="price">'+format(item.sellingPrice)+'</span>';
   b.addEventListener('click',()=>addItem(item));list.appendChild(b);
  }
 }catch(error){if(current===searchEpoch)msg('تعذر البحث: '+String(error.message||error),'error');}
};
const formBody=()=>{
 const person=customer();
 if(!person)throw Error('اختر العميل أولًا');
 if(!state.lines.length)throw Error('أضف صنفًا واحدًا على الأقل');
 const {total}=totals();
 if(total<=0)throw Error('لا يمكن اعتماد فاتورة بمبلغ صفر');
 const paymentMethod=el('payment').value;
 const rawPaid=el('paid').value.trim();
 const paidAmount=rawPaid===''?null:Number(rawPaid);
 if(paidAmount!==null&&(paidAmount<0||paidAmount>total))throw Error('مبلغ السداد غير صحيح أو يزيد عن الإجمالي');
 const date=el('invoiceDate').value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('يرجى تحديد تاريخ صحيح للفاتورة');
 const body={
  date,customerId:person.id,customerName:person.name,
  paymentMethod,treasuryCode:el('treasury').value,
  paidAmount,overallDiscount:Number(el('discount').value||0),
  notes:el('notes').value,
  items:state.lines.map(l=>({
   itemId:l.itemId,quantity:Number(l.quantity),unitPrice:Number(l.unitPrice),
   hasDimensions:!!l.hasDimensions,length:Number(l.length),width:Number(l.width),
   count:Number(l.count),notes:l.notes
  }))
 };
 if(body.items.some(l=>l.quantity<=0||l.unitPrice<0||(l.hasDimensions&&
  (l.length<=0||l.width<=0||l.count<=0))))
  throw Error('تحقق من الكميات والأبعاد وأسعار البنود');
 persistUi();return body;
};
const setBusy=on=>{
 state.busy=on;el('saveButton').disabled=on;el('draftButton').disabled=on;
 el('saveButton').textContent=on?'جارٍ الحفظ المركزي...':'مراجعة وحفظ واعتماد';
};
const draft=async commit=>{
 if(state.busy)return;
 try{
  const body=formBody();
  if(commit&&!window.confirm('اعتماد فاتورة بيع بقيمة '+format(totals().total)+' للعميل '+customer().name+'؟'))return;
  setBusy(true);msg(commit?'جارٍ الحفظ في PostgreSQL...':'جارٍ حفظ المسودة...');
  await api('draft',{draftId:state.draftId,body});
  if(!commit){msg('تم حفظ المسودة ويمكن استكمالها لاحقًا.','success');return;}
  const response=await api('commit',{draftId:state.draftId});
  state.saved=true;state.lastReceipt=response;
  el('receiptNumber').textContent=response.invoiceNumber;
  el('receiptDetails').textContent=response.customerName+' — '+format(response.totalAmount);
  show('success');
  msg(response.alreadyPosted?'الفاتورة كانت معتمدة مسبقًا؛ لم يُنشأ قيد مكرر.':'تم الحفظ المركزي بنجاح.','success');
  telegram?.HapticFeedback?.notificationOccurred('success');
 }catch(error){
  const e=String(error?.message||error);
  msg('لم يتم تأكيد الحفظ: '+e+'. لا تنشئ فاتورة جديدة قبل إعادة المحاولة بنفس المسودة.','error');
  telegram?.HapticFeedback?.notificationOccurred('error');
 }finally{setBusy(false);}
};
const startNew=()=>{
 state.lines=[];state.draftId=crypto.randomUUID();state.saved=false;state.lastReceipt=null;
 el('discount').value='0';el('paid').value='';el('notes').value='';
 el('invoiceDate').value=todayLocal();
 renderLines();show('cashier');msg('فاتورة جديدة. ابحث عن صنف لإضافته.','success');
};
const initQuick=async()=>{
 const raw=new URLSearchParams(location.search).get('quick')||'';
 if(!raw||state.quickDone)return;
 state.quickDone=true;
 const digits=s=>s.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x0660))
  .replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x06F0));
 const normalized=digits(raw).trim();
 const match=normalized.match(/^(?:بيع|فاتورة)\s+(.+?)\s+عدد\s+([\d.]+)(?:\s+سعر\s+([\d.]+))?(?:\s+(نقدي|آجل|بنكي))?$/u);
 if(!match){msg('افتح صنفًا من البحث لإكمال الفاتورة.','success');return;}
 try{
  const result=await api('search',{query:match[1]});
  const exact=(result.items||[]).filter(x=>
   x.code===match[1]||x.name.trim()===match[1].trim());
  if(exact.length!==1){
   el('itemSearch').value=match[1];await searchItems(match[1]);
   msg('اختر الصنف الصحيح من نتائج البحث لإكمال الإدخال السريع.');return;
  }
  const addedIndex=state.lines.length;
  addItem(exact[0]);state.lines[addedIndex].quantity=Number(match[2]);
  if(match[3]!==undefined)state.lines[addedIndex].unitPrice=Number(match[3]);
  if(match[4]==='آجل')el('payment').value='credit';
  else if(match[4]==='بنكي')el('payment').value='bank_transfer';
  renderLines();msg('تم تجهيز الفاتورة السريعة. راجع التفاصيل واضغط حفظ واعتماد.','success');
 }catch{el('itemSearch').value=match[1];}
};
const bootstrap=async()=>{
 try{
  const result=await api('bootstrap');
  el('invoiceDate').value=todayLocal();
  state.people=result.parties||[];
  state.treasuries=result.treasuries||[];
  state.vatRate=Number(result.vatRate||0);
  customerOptions('');
  const sel=el('customer');
  const remembered=(()=>{try{return localStorage.getItem('telegram_pos_last_customer')}catch{return null}})();
  const choice=state.people.some(x=>x.id===remembered)?remembered:result.defaultCustomerId;
  if(choice)sel.value=choice;
  const treasury=el('treasury');treasury.replaceChildren(new Option('الافتراضي',''));
  for(const x of state.treasuries)treasury.appendChild(new Option(x.name,x.accountCode));
  try{const code=localStorage.getItem('telegram_pos_last_treasury');if(code)treasury.value=code;}catch{}
  el('userBadge').textContent='🔒 '+(result.displayName||'مستخدم معتمد');
  show('cashier');msg('الكاشير جاهز. يمكنك إصدار فاتورة من الهاتف.','success');
  const draftToResume=(result.drafts||[]).find(x=>x.status==='draft');
  if(draftToResume&&window.confirm('توجد مسودة سابقة. هل تريد استكمالها؟')){
   state.draftId=draftToResume.draftId;const b=draftToResume.body;
   if(b.customerId)sel.value=b.customerId;
   el('invoiceDate').value=b.date||todayLocal();
   el('discount').value=b.overallDiscount||0;el('payment').value=b.paymentMethod||'cash';
   el('paid').value=b.paidAmount??'';el('notes').value=b.notes||'';
   el('treasury').value=b.treasuryCode||'';
   state.lines=[];
   for(const l of b.items||[]){
    const r=await api('search',{query:l.itemId});
    const item=(r.items||[]).find(x=>x.id===l.itemId);
    if(item)state.lines.push({...item,itemId:item.id,unitPrice:l.unitPrice,
      quantity:l.quantity,hasDimensions:l.hasDimensions,
      length:l.length,width:l.width,count:l.count,notes:l.notes||''});
   }
   renderLines();
  }
  await initQuick();
 }catch(error){
  if(String(error.message||error).includes('TELEGRAM_MINI_PAIR_REQUIRED')){
   show('pairPanel');msg('يجب ربط حسابك بصلاحيات برنامج المحاسبة لمرة واحدة.');
  }else{show('notTelegram');msg('تعذر فتح الكاشير: '+String(error.message||error),'error');}
 }
};
el('pairButton').addEventListener('click',async()=>{
 el('pairButton').disabled=true;
 try{
  await api('pair',{code:el('pairCode').value.trim().toUpperCase()});
  msg('تم الربط بنجاح.','success');await bootstrap();
 }catch(error){msg('تعذر الربط: '+String(error.message||error),'error');}
 finally{el('pairButton').disabled=false;}
});
el('customerSearch').addEventListener('input',event=>customerOptions(event.target.value));
el('addCustomerButton').addEventListener('click',()=>{
 el('newCustomerPanel').classList.toggle('hidden');
});
el('createCustomerButton').addEventListener('click',async()=>{
 const name=el('newCustomerName').value.trim();
 if(name.length<2){msg('أدخل اسم العميل أولًا.','error');return;}
 el('createCustomerButton').disabled=true;
 try{
  const result=await api('customer/create',{customer:{
   name,phone:el('newCustomerPhone').value.trim()
  }});
  state.people.push(result.customer);
  el('customerSearch').value='';
  customerOptions('');
  el('customer').value=result.customer.id;
  el('newCustomerPanel').classList.add('hidden');
  el('newCustomerName').value='';el('newCustomerPhone').value='';
  msg('تم إنشاء العميل '+result.customer.code+' واختياره.','success');
 }catch(error){msg('تعذر إضافة العميل: '+String(error.message||error),'error');}
 finally{el('createCustomerButton').disabled=false;}
});
el('customer').addEventListener('change',persistUi);
el('itemSearch').addEventListener('input',event=>{
 clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchItems(event.target.value),180);
});
el('addItemButton').addEventListener('click',()=>{
 el('itemSearch').focus();
 el('itemSearch').select();
 if(el('itemSearch').value.trim())void searchItems(el('itemSearch').value);
});
el('items').addEventListener('click',event=>{
 const button=event.target.closest('[data-remove]');
 if(button){state.lines.splice(Number(button.dataset.remove),1);renderLines();}
});
el('items').addEventListener('input',event=>{
 const input=event.target.closest('[data-prop]');
 if(!input)return;
 const line=state.lines[Number(input.dataset.index)];if(!line)return;
 const prop=input.dataset.prop;
 if(prop==='hasDimensions'){line.hasDimensions=input.checked;renderLines();return;}
 line[prop]=prop==='notes'?input.value:Number(input.value);
 totals();
 const total=input.closest('.line')?.querySelector('.line-total span');
 if(total)total.textContent=format(round(lineQty(line)*line.unitPrice));
});
for(const name of ['discount','paid','payment'])el(name).addEventListener('input',totals);
el('draftButton').addEventListener('click',()=>draft(false));
el('saveButton').addEventListener('click',()=>draft(true));
el('newButton').addEventListener('click',startNew);
el('closeButton').addEventListener('click',()=>telegram?.close?.());
if(!initData){
 show('notTelegram');msg('يجب فتح الكاشير من داخل بوت تلجرام.','error');
}else{
 telegram?.ready?.();telegram?.expand?.();void bootstrap();
}
})();