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
const state={people:[],customers:[],suppliers:[],employees:[],expenseAccounts:[],
  subCustomers:[],treasuries:[],vatRate:0,lines:[],draftId:crypto.randomUUID(),
  busy:false,saved:false,lastReceipt:null,quickDone:false,kind:'sale',
  canPrint:false,canPurchases:false,canExpenses:false};
let searchTimer=0,searchEpoch=0;
const msg=(text,kind='')=>{
 const x=el('status');x.textContent=text;x.className='status '+kind;
};
const show=(name)=>{
 for(const id of ['notTelegram','pairPanel','sessionExpired','cashier','success'])
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
 localStorage.setItem('telegram_pos_last_cash',el('cashTreasury').value);
 localStorage.setItem('telegram_pos_last_bank',el('bankTreasury').value);}catch{}
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
 // Filtering can replace the selected main party without firing a change event.
 if(sel.value!==selected)renderSubCustomers();
};
const customer=()=>state.people.find(x=>x.id===el('customer').value);
const renderSubCustomers=(wanted='',newName='')=>{
 const parentId=el('customer').value;
 const children=state.subCustomers.filter(s=>s.parentPartyId===parentId);
 const select=el('subCustomer');
 select.replaceChildren(new Option('بدون عميل فرعي',''));
 for(const sub of children)select.appendChild(new Option(sub.name+' · '+(sub.code||''),sub.id));
 select.appendChild(new Option('＋ إدخال اسم عميل فرعي جديد','__new__'));
 select.value=children.some(s=>s.id===wanted)?wanted:
  wanted==='__new__'||(newName&&!children.some(s=>s.id===wanted))?'__new__':'';
 const creating=select.value==='__new__';
 el('subCustomerNewPanel').classList.toggle('hidden',!creating);
 el('subCustomerNewName').value=creating?newName:'';
};

const account=()=>state.treasuries.find(x=>x.accountCode===el('treasury').value);
const lineQty=l=>l.hasDimensions?Number(((Number(l.length)||0)*
 (l.unitCalculationType==='linear'?1:(Number(l.width)||0))*(Number(l.count)||0)).toFixed(3)):(Number(l.quantity)||0);
const paidValue=id=>{const v=el(id).value.trim();return v===''?0:Number(v);};
const totals=()=>{
 const subtotal=round(state.lines.reduce((sum,l)=>sum+round(lineQty(l)*Number(l.unitPrice||0)),0));
 const discount=Number(el('discount').value||0);
 const base=Math.max(0,round(subtotal-discount));
 const vat=round(base*state.vatRate/100);
 const total=round(base+vat);
 const cash=paidValue('cashPaid'),bank=paidValue('bankPaid');
 const paid=round(cash+bank),remaining=round(total-paid);
 el('subtotal').textContent=format(subtotal);
 el('discountSummary').textContent=format(discount);
 el('vatSummary').textContent=format(vat);
 el('grand').textContent=format(total);
 el('paidSummary').textContent=format(paid);
 el('remainingSummary').textContent=format(remaining);
 const status=el('paymentStatus');
 if(paid<=0){status.textContent='◷ آجل — لا يوجد سداد';status.style.background='#fff3d8';status.style.color='#99600b';}
 else if(paid>total+.005){status.textContent='⚠ المدفوع أكبر من الإجمالي';status.style.background='#fff0ee';status.style.color='#a22b2b';}
 else if(remaining<=.005){status.textContent='✓ مسددة بالكامل';status.style.background='#e3f7e9';status.style.color='#0b7045';}
 else{status.textContent='◐ سداد جزئي';status.style.background='#fff3d8';status.style.color='#99600b';}
 return {subtotal,discount,vat,total,cash,bank,paid,remaining};
};
const renderLines=()=>{
 const container=el('items');container.replaceChildren();
 el('emptyItems').classList.toggle('hidden',state.lines.length>0);
 el('lineCount').textContent=state.lines.length+' / 25';
 state.lines.forEach((line,index)=>{
  const panel=document.createElement('div');panel.className='line';
  const field=(label,prop,val,opts='')=>'<div class="line-field"><label>'+label+'</label><input data-index="'+index+'" data-prop="'+prop+'" type="number" value="'+escapeHtml(val)+'" '+opts+'/></div>';
  const dash=label=>'<div class="line-field"><label>'+label+'</label><div class="dash">—</div></div>';
  const qty=lineQty(line);
  panel.innerHTML=
   '<div class="line-head"><div><strong class="line-title">'+escapeHtml(line.name)+'</strong> <span class="line-subtitle">'+escapeHtml(line.code)+'</span></div>'+
   '<button type="button" class="line-remove" data-remove="'+index+'" aria-label="حذف الصنف">🗑</button></div>'+
   '<input class="line-notes" data-index="'+index+'" data-prop="notes" type="text" maxlength="300" aria-label="ملاحظات هذا الصنف" placeholder="📝 ملاحظة الصنف (اختياري)" value="'+escapeHtml(line.notes||'')+'"/>'+
   '<div class="line-columns">'+
   (line.hasDimensions?field('الطول','length',line.length||1,'min=".001" step=".001"'):dash('الطول'))+
   (line.hasDimensions?field('العرض','width',line.width||1,'min=".001" step=".001"'):dash('العرض'))+
   (line.hasDimensions?field('العدد','count',line.count||1,'min="1" step="1"'):dash('العدد'))+
   (line.hasDimensions?'<div class="line-field"><label>الكمية</label><div class="line-value line-quantity">'+qty+'</div></div>':field('الكمية','quantity',line.quantity,'min=".001" step=".001"'))+
   field('السعر','unitPrice',line.unitPrice,'min="0" step=".01"')+
   '<div class="line-field"><label>الإجمالي</label><div class="line-value line-row-total">'+format(round(qty*Number(line.unitPrice)))+'</div></div></div>'+
   '<label class="line-dimension-toggle"><input data-prop="hasDimensions" data-index="'+index+'" type="checkbox" '+(line.hasDimensions?'checked':'')+'/> الأبعاد (الطول × العرض × العدد)</label>';
  container.appendChild(panel);
 });
 totals();
};
const addItem=item=>{
 if(state.lines.length>=25){msg('الحد الأقصى 25 بندًا في الفاتورة الواحدة','error');return;}
 clearTimeout(searchTimer);
 searchEpoch++; // Invalidate slow search replies before they can repopulate an old list.
 state.lines.push({itemId:item.id,name:item.name,code:item.code,unit:item.unit,
  unitPrice:Number((['purchase','expense'].includes(state.kind)?item.purchasePrice:item.sellingPrice)||0),
  unitCalculationType:item.unitCalculationType||'unit',quantity:1,
  hasDimensions:/(م²|م2|m²|m2|sqm|متر مربع)/i.test(String(item.unit||'')),
  length:1,width:1,count:1,notes:''});
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
    '<span class="price">'+format(['purchase','expense'].includes(state.kind)?item.purchasePrice:item.sellingPrice)+'</span>';
   b.addEventListener('click',()=>addItem(item));list.appendChild(b);
  }
 }catch(error){if(current===searchEpoch)msg('تعذر البحث: '+String(error.message||error),'error');}
};
const formBody=()=>{
 if(!['sale','print','purchase','expense'].includes(state.kind))throw Error('نوع المستند غير معروف.');
 const person=customer();
 if(!person)throw Error(state.kind==='purchase'||state.kind==='expense'?'اختر المورد أو المستفيد':'اختر العميل الرئيسي');
 if(!state.lines.length)throw Error('أضف صنفًا واحدًا على الأقل');
 const {total,cash,bank,paid}=totals();
 if(state.kind!=='print'&&total<=0)throw Error('إجمالي الفاتورة يجب أن يكون أكبر من صفر');
 if(state.kind!=='print'&&(!Number.isFinite(cash)||!Number.isFinite(bank)||cash<0||bank<0))throw Error('أدخل مبالغ سداد صحيحة');
 if(state.kind!=='print'&&paid>total+.005)throw Error('المدفوع لا يمكن أن يتجاوز الإجمالي');
 if(state.kind!=='print'&&cash>0&&!el('cashTreasury').value)throw Error('اختر صندوق النقدي');
 if(state.kind!=='print'&&bank>0&&!el('bankTreasury').value)throw Error('اختر حساب البنك');
 if(state.kind==='expense'&&el('expenseCounterpartyKind').value==='employee'&&paid<total-.005)
  throw Error('مصروف الموظف يجب أن يكون مسدّدًا بالكامل، أو اختر موردًا لتسجيله آجلًا.');
 if(state.kind==='expense'&&!el('expenseAccount').value)
  throw Error('اختر حساب المصروف المعتمد.');
 const subChoice=['sale','print'].includes(state.kind)?el('subCustomer').value:'';
 const sub=state.subCustomers.find(x=>x.id===subChoice&&x.parentPartyId===person.id);
 if(subChoice&&subChoice!=='__new__'&&!sub)throw Error('العميل الفرعي لا يتبع العميل الرئيسي');
 const newSubName=subChoice==='__new__'?el('subCustomerNewName').value.trim():'';
 if(subChoice==='__new__'&&newSubName.length<2)throw Error('اكتب اسم العميل الفرعي');
 const date=el('invoiceDate').value;
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))throw Error('اختر تاريخ الفاتورة');
 const cashLeg=state.kind==='print'?0:cash,bankLeg=state.kind==='print'?0:bank;
 const paymentMethod=bankLeg>0?'bank_transfer':cashLeg>0?'cash':'credit';
 const body={
  documentType:state.kind,date,customerId:person.id,customerName:person.name,
  counterpartyKind:state.kind==='expense'?el('expenseCounterpartyKind').value:'supplier',
  supplierInvoiceNumber:el('supplierInvoiceNumber').value.trim(),
  expenseAccountCode:el('expenseAccount').value,expenseCategory:el('expenseCategory').value,
  subCustomerId:sub?.id||'',subCustomerName:sub?.name||newSubName,
  paymentMethod,paidAmount:cashLeg+bankLeg,
  cashPaidAmount:cashLeg,bankPaidAmount:bankLeg,
  cashTreasuryCode:cashLeg>0?el('cashTreasury').value:'',
  bankTreasuryCode:bankLeg>0?el('bankTreasury').value:'',
  treasuryCode:bankLeg>0?el('bankTreasury').value:cashLeg>0?el('cashTreasury').value:'',
  overallDiscount:Number(el('discount').value||0),
  notes:el('notes').value,paymentNotes:el('paymentNotes').value,
  items:state.lines.map(l=>({
   itemId:l.itemId,quantity:Number(l.quantity),unitPrice:Number(l.unitPrice),
   hasDimensions:!!l.hasDimensions,length:Number(l.length),width:Number(l.width),
   count:Number(l.count),notes:l.notes
  }))
 };
 if(body.items.some(l=>l.quantity<=0||l.unitPrice<0||(l.hasDimensions&&
   (l.length<=0||l.width<=0||l.count<=0))))
  throw Error('راجع الكمية والأبعاد والأسعار قبل الحفظ');
 persistUi();
 return body;
};
const setBusy=on=>{
 state.busy=on;el('saveButton').disabled=on;el('draftButton').disabled=on;
 el('saveButton').textContent=on?'جاري الحفظ...':state.kind==='print'?'✓ حفظ أمر الطباعة':'✓ اعتماد الفاتورة';
};
const draft=async commit=>{
 if(state.busy)return;
 try{
  const body=formBody();
  if(commit&&!window.confirm(state.kind==='print'
   ?'حفظ أمر الطباعة دون ترحيل مالي للعميل '+customer().name+'؟'
   :'اعتماد فاتورة بيع بقيمة '+format(totals().total)+' للعميل '+customer().name+'؟'))return;
  setBusy(true);msg(commit?'جارٍ الحفظ في PostgreSQL...':'جارٍ حفظ المسودة...');
  await api('draft',{draftId:state.draftId,body});
  if(!commit){msg('تم حفظ المسودة ويمكن استكمالها لاحقًا.','success');return;}
  const response=await api('commit',{draftId:state.draftId});
  state.saved=true;state.lastReceipt=response;
  el('receiptNumber').textContent=response.invoiceNumber;
  el('receiptDetails').textContent=response.documentType==='print'
   ?response.customerName+' — أمر طباعة غير مالي'
   :response.customerName+' • '+format(response.totalAmount);
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
 el('cashPaid').value='';el('bankPaid').value='';el('paymentNotes').value='';
 el('invoiceDate').value=todayLocal();
 renderSubCustomers();renderLines();show('cashier');msg('ابدأ بإضافة الأصناف.','success');
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
  if(match[4]==='آجل'){el('cashPaid').value='';el('bankPaid').value='';}
  else if(match[4]==='نقدي'){el('cashPaid').value=String(totals().total);el('bankPaid').value='';}
  else if(match[4]==='بنكي'){el('bankPaid').value=String(totals().total);el('cashPaid').value='';}
  renderLines();msg('تم تجهيز الفاتورة السريعة. راجع التفاصيل واضغط حفظ واعتماد.','success');
 }catch{el('itemSearch').value=match[1];}
};
const bootstrap=async()=>{
 try{
  const result=await api('bootstrap');
  el('invoiceDate').value=todayLocal();
  state.customers=result.parties||[];
  state.suppliers=result.suppliers||[];
  state.employees=result.employees||[];
  state.expenseAccounts=result.expenseAccounts||[];
  state.people=state.customers;
  state.subCustomers=result.subCustomers||[];
  state.treasuries=result.treasuries||[];
  state.canPrint=result.canPrintOrders===true;
  state.canPurchases=result.canPurchases===true;
  state.canExpenses=result.canExpenses===true;
  state.vatRate=Number(result.vatRate||0);
  const expenseSelect=el('expenseAccount');
  expenseSelect.replaceChildren(new Option('اختر حساب المصروف',''));
  for(const account of state.expenseAccounts)
   expenseSelect.appendChild(new Option(account.code+' - '+account.name,account.code));
  if(state.expenseAccounts.length===1)expenseSelect.value=state.expenseAccounts[0].code;
  customerOptions('');
  const sel=el('customer');
  const remembered=(()=>{try{return localStorage.getItem('telegram_pos_last_customer')}catch{return null}})();
  const choice=state.people.some(x=>x.id===remembered)?remembered:result.defaultCustomerId;
  if(choice)sel.value=choice;
  renderSubCustomers();
  const cashBox=el('cashTreasury'),bankBox=el('bankTreasury');
  cashBox.replaceChildren(new Option('اختر الصندوق',''));
  bankBox.replaceChildren(new Option('اختر البنك',''));
  const isBank=t=>t.type!=='cash_box';
  const cashOptions=state.treasuries.filter(t=>!isBank(t));
  const bankOptions=state.treasuries.filter(t=>isBank(t));
  for(const t of cashOptions)cashBox.appendChild(new Option(t.name,t.accountCode));
  for(const t of bankOptions)bankBox.appendChild(new Option(t.name,t.accountCode));
  try{
   const previousCash=localStorage.getItem('telegram_pos_last_cash')||'';
   const previousBank=localStorage.getItem('telegram_pos_last_bank')||'';
   if(previousCash&&cashOptions.some(t=>t.accountCode===previousCash))cashBox.value=previousCash;
   if(previousBank&&bankOptions.some(t=>t.accountCode===previousBank))bankBox.value=previousBank;
  }catch{}

  el('userBadge').textContent='🔒 '+(result.displayName||'مستخدم معتمد')+' • مرتبط دائمًا';
  show('cashier');msg('حساب تلجرام مرتبط بحساب البرنامج. لا يلزم إعادة الربط عند انتهاء الرمز المؤقت.','success');
  const draftToResume=(result.drafts||[]).find(x=>x.status==='draft');
  if(draftToResume&&window.confirm('توجد مسودة سابقة. هل تريد استكمالها؟')){
   state.draftId=draftToResume.draftId;const b=draftToResume.body;
   if(['print','purchase','expense'].includes(b.documentType)){
    if(b.counterpartyKind==='employee')el('expenseCounterpartyKind').value='employee';
    selectKind(b.documentType);
   }
   el('supplierInvoiceNumber').value=b.supplierInvoiceNumber||'';
   if(b.expenseAccountCode)el('expenseAccount').value=b.expenseAccountCode;
   if(b.expenseCategory)el('expenseCategory').value=b.expenseCategory;
   if(b.customerId)sel.value=b.customerId;
   renderSubCustomers(b.subCustomerId|| (b.subCustomerName?'__new__':''),b.subCustomerName||'');
   el('invoiceDate').value=b.date||todayLocal();
   el('discount').value=b.overallDiscount||0;el('payment').value=b.paymentMethod||'cash';
   el('notes').value=b.notes||'';el('paymentNotes').value=b.paymentNotes||'';
   const legacyPaid=Number(b.paidAmount||0);
   const restoredCash=b.hasPaymentSplit?Number(b.cashPaidAmount||0):
     ['cash','card'].includes(b.paymentMethod)?legacyPaid:0;
   const restoredBank=b.hasPaymentSplit?Number(b.bankPaidAmount||0):
     b.paymentMethod==='bank_transfer'?legacyPaid:0;
   el('cashPaid').value=restoredCash>0?String(restoredCash):'';
   el('bankPaid').value=restoredBank>0?String(restoredBank):'';
   el('cashTreasury').value=b.cashTreasuryCode||(restoredCash>0?b.treasuryCode:'')||'';
   el('bankTreasury').value=b.bankTreasuryCode||(restoredBank>0?b.treasuryCode:'')||'';
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
  const code=String(error.message||error);
  if(code.includes('TELEGRAM_MINI_PAIR_REQUIRED')){
   show('pairPanel');msg('هذا الحساب غير مرتبط بعد. رمز الربط مطلوب مرة واحدة فقط.');
  }else if(code.includes('TELEGRAM_MINI_SESSION_EXPIRED')){
   show('sessionExpired');msg('انتهت جلسة فتح تلجرام فقط. افتح /invoice من البوت مجددًا دون ربط.','error');
  }else if(code.includes('TELEGRAM_MINI_LINKED_USER_UNAVAILABLE')||code.includes('TELEGRAM_POS_PERMISSION_DENIED')){
   show('notTelegram');msg('الربط موجود لكن صلاحية المستخدم غير متاحة. لا تحاول تجاوز الإيقاف بإعادة الربط.','error');
  }else{show('notTelegram');msg('تعذر فتح الكاشير: '+code,'error');}
 }
};
const kindLabels={sale:['🛒','مبيعات'],print:['🖨️','أمر طباعة'],
 purchase:['📦','مشتريات'],expense:['🧾','مصروفات']};
const selectKind=kind=>{
 if(!Object.hasOwn(kindLabels,kind))return;
 if(state.kind!==kind&&state.lines.length&&
  !window.confirm('تغيير نوع المستند يحتفظ بالبنود، لكنه يغيّر الحسابات والقيد. هل تريد المتابعة؟'))return;
 state.kind=kind;
 const info=kindLabels[kind];
 el('currentInvoiceType').textContent=info[1];
 el('invoiceTypeButton').querySelector('.kind-icon').textContent=info[0];
 el('invoiceTypeMenu').classList.add('hidden');
 el('invoiceTypeButton').setAttribute('aria-expanded','false');
 for(const button of el('invoiceTypeMenu').querySelectorAll('[data-kind]'))
  button.setAttribute('aria-current',button.dataset.kind===kind?'true':'false');
 const sale=kind==='sale',print=kind==='print',purchase=kind==='purchase',expense=kind==='expense';
 const forEmployee=expense&&el('expenseCounterpartyKind').value==='employee';
 const enabled=sale||(print&&state.canPrint)||
  (purchase&&state.canPurchases)||(expense&&state.canExpenses&&state.expenseAccounts.length>0);
 state.people=sale||print?state.customers:
  forEmployee?state.employees:state.suppliers;
 el('customerSearch').value='';
 customerOptions('');
 renderSubCustomers();
 el('purchaseMetaPanel').classList.toggle('hidden',!purchase&&!expense);
 el('expenseMetaPanel').classList.toggle('hidden',!expense);
 el('expenseCounterpartyPanel').classList.toggle('hidden',!expense);
 el('subCustomerArea').classList.toggle('hidden',!sale&&!print);
 el('settlementPanel').classList.toggle('hidden',print);
 el('paymentStatus').classList.toggle('hidden',print);
 el('totalLabel').textContent=print?'تقديري':'إجمالي';
 el('partyRole').textContent=purchase?'المورد':expense?(forEmployee?'الموظف':'المورد'):'العميل';
 el('customerSearch').placeholder=forEmployee?'ابحث عن الموظف...':
  purchase||expense?'ابحث عن المورد...':'ابحث عن العميل...';
 el('addCustomerButton').disabled=!enabled||forEmployee;
 el('newCustomerPanel').classList.add('hidden');
 el('modeNotice').classList.toggle('hidden',sale||purchase&&enabled||expense&&enabled);
 if(print)el('modeNotice').textContent=enabled
  ?'أمر طباعة دون أي قيد محاسبي أو حركة مخزون.'
  :'ليست لديك صلاحية إضافة أوامر الطباعة.';
 else if(!enabled)el('modeNotice').textContent=expense&&state.expenseAccounts.length===0
  ?'يجب إعداد حساب مصروف مسموح به في دليل الحسابات أولًا.'
  :'لا توجد صلاحية كافية لاعتماد هذه العملية من الحساب الحالي.';
 el('saveButton').disabled=!enabled;
 el('draftButton').disabled=!enabled;
 el('saveButton').textContent=!enabled?'الاعتماد غير متاح':
  sale?'✓ اعتماد البيع':print?'✓ حفظ أمر الطباعة':
  purchase?'✓ اعتماد فاتورة الشراء':'✓ اعتماد فاتورة المصروف';
 el('draftButton').textContent='▤ حفظ مسودة';
 // Cash and bank field values are never rewritten merely by switching modes.
 if(state.lines.length)totals();
};
el('expenseCounterpartyKind').addEventListener('change',()=>selectKind('expense'));
el('invoiceTypeButton').addEventListener('click',()=>{
 const menu=el('invoiceTypeMenu');menu.classList.toggle('hidden');
 el('invoiceTypeButton').setAttribute('aria-expanded',menu.classList.contains('hidden')?'false':'true');
});
for(const button of el('invoiceTypeMenu').querySelectorAll('[data-kind]'))
 button.addEventListener('click',()=>selectKind(button.dataset.kind));
document.addEventListener('click',event=>{
 if(!event.target.closest('.kind-wrap')){
  el('invoiceTypeMenu').classList.add('hidden');
  el('invoiceTypeButton').setAttribute('aria-expanded','false');
 }
});
el('sessionClose').addEventListener('click',()=>telegram?.close?.());
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
  const partyType=['sale','print'].includes(state.kind)?'customer':'supplier';
  const result=await api('customer/create',{customer:{
   name,phone:el('newCustomerPhone').value.trim(),type:partyType
  }});
  state.people.push(result.customer);
  el('customerSearch').value='';
  customerOptions('');
  el('customer').value=result.customer.id;
  renderSubCustomers();
  el('newCustomerPanel').classList.add('hidden');
  el('newCustomerName').value='';el('newCustomerPhone').value='';
  msg('تم إنشاء العميل '+result.customer.code+' واختياره.','success');
 }catch(error){msg('تعذر إضافة العميل: '+String(error.message||error),'error');}
 finally{el('createCustomerButton').disabled=false;}
});
el('customer').addEventListener('change',()=>{persistUi();renderSubCustomers()});
el('subCustomer').addEventListener('change',()=>{
 const isNew=el('subCustomer').value==='__new__';
 el('subCustomerNewPanel').classList.toggle('hidden',!isNew);
 if(!isNew)el('subCustomerNewName').value='';
 else el('subCustomerNewName').focus();
});
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
 const row=input.closest('.line');
 const total=row?.querySelector('.line-row-total');
 if(total)total.textContent=format(round(lineQty(line)*line.unitPrice));
 const qty=row?.querySelector('.line-quantity');
 if(qty)qty.textContent=String(lineQty(line));
});
for(const name of ['discount','cashPaid','bankPaid'])el(name).addEventListener('input',totals);
for(const name of ['cashTreasury','bankTreasury'])el(name).addEventListener('change',persistUi);
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